import express, { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import multer, { MulterError } from "multer";
import { PDFParse } from "pdf-parse";
import { google } from "googleapis";
import { Firestore } from "@google-cloud/firestore";
// Object imports
import { Email } from "./Email.js";
import { EmailParser } from "./EmailParser.js";
import { BillAnalyzer } from "./BillAnalyzer.js";
import { StatementAnalyzer, Transaction } from "./StatementAnalyzer.js";
import { BillMatcher, Bill } from "./BillMatcher.js";

// Configure multer for PDF uploads (memory storage, 10MB limit)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed"));
    }
  },
});

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Firestore setup
const firestore = new Firestore();

// Helper: Validate Firebase UID format (alphanumeric, 20-128 chars)
function isValidUid(uid: string): boolean {
  return typeof uid === "string" && /^[a-zA-Z0-9]{20,128}$/.test(uid);
}

// Helper: Get valid tokens (refreshes if expired)
async function getValidTokens(uid: string) {
  const tokenDoc = await firestore.collection("gmail_tokens").doc(uid).get();
  if (!tokenDoc.exists) return null;

  const tokens = tokenDoc.data()!;

  // Check if token is expired (with 5 min buffer)
  const isExpired =
    tokens.expiry_date && Date.now() > tokens.expiry_date - 5 * 60 * 1000;

  if (isExpired && tokens.refresh_token) {
    console.log("Token expired, refreshing...");

    oAuth2Client.setCredentials({ refresh_token: tokens.refresh_token });

    try {
      const { credentials } = await oAuth2Client.refreshAccessToken();

      // Save new tokens
      const updatedTokens = {
        access_token: credentials.access_token,
        refresh_token: credentials.refresh_token || tokens.refresh_token,
        expiry_date: credentials.expiry_date,
        updated_at: Date.now(),
      };

      await firestore.collection("gmail_tokens").doc(uid).set(updatedTokens);
      console.log("Token refreshed successfully");

      return updatedTokens;
    } catch (err) {
      console.error("Failed to refresh token:", err);
      return null;
    }
  }

  return tokens;
}

// Middleware
app.use(
  cors({
    origin: ["https://debt-dashboard-project.web.app", "http://localhost:3000"],
    credentials: true,
  })
);
app.use(express.json());

// Gmail OAuth2 Setup
const oAuth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

/**
 * ------------------------------------------------------------------
 * SERVER ENDPOINTS
 * ------------------------------------------------------------------
 */

// Health check
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "Debt Dashboard Server is running" });
});

// Step 1: Redirect user to Google OAuth consent screen
app.get("/gmail/auth", (req: Request, res: Response) => {
  const uid = req.query.uid as string;
  if (!uid) return res.status(400).json({ error: "Missing uid" });

  const scopes = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/userinfo.email",
  ];
  const url = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: scopes,
    prompt: "consent",
    state: uid,
  });
  res.redirect(url);
});

// Step 2: OAuth2 callback to exchange code for tokens
app.get("/exchange", async (req: Request, res: Response) => {
  const code = req.query.code as string;
  const uid = req.query.state as string;

  console.log("Exchange endpoint hit - uid:", uid);

  if (!code) return res.status(400).json({ error: "Missing code" });
  if (!uid) return res.status(400).json({ error: "Missing uid" });

  try {
    console.log("Getting tokens...");
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);

    // Store tokens in Firestore under user's uid
    await firestore.collection("gmail_tokens").doc(uid).set({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
      updated_at: Date.now(),
    });

    console.log("Getting user info...");
    // Get user email and store profile
    oAuth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: "v2", auth: oAuth2Client });
    const userInfo = await oauth2.userinfo.get();

    console.log("Saving user profile:", userInfo.data.email);

    const profileData: any = {
      email: userInfo.data.email,
      updatedAt: Date.now(),
    };

    if (userInfo.data.name) profileData.name = userInfo.data.name;
    if (userInfo.data.picture) profileData.picture = userInfo.data.picture;

    await firestore
      .collection("user_profiles")
      .doc(uid)
      .set(profileData, { merge: true });

    console.log("User profile saved successfully");

    // Redirect to OAuth callback page which will close the popup
    res.redirect("https://debt-dashboard-project.web.app/oauth-callback.html");
  } catch (err) {
    console.error("OAuth2 error:", err);
    res.status(500).json({ error: "OAuth2 error", details: String(err) });
  }
});

// AI-powered bill parsing
app.get("/gmail/bills/analyze", async (req: Request, res: Response) => {
  const uid = req.query.uid as string;

  if (!uid) return res.status(400).json({ error: "Missing uid" });
  const tokens = await getValidTokens(uid);
  if (!tokens) {
    return res
      .status(401)
      .json({ error: "Please reconnect your Gmail", needsReauth: true });
  }

  oAuth2Client.setCredentials(tokens);
  const gmail = google.gmail({ version: "v1", auth: oAuth2Client });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const query =
      "subject:(bill OR invoice OR payment OR due OR statement) newer_than:30d";
    const messagesRes = await gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults: 10,
    });
    const messages = messagesRes.data.messages || [];
    const billAnalyzer = new BillAnalyzer();

    // Parse all emails in parallel first
    res.write(
      `event: progress\ndata: ${JSON.stringify({
        stage: "parsing",
        current: 0,
        total: messages.length,
      })}\n\n`
    );

    const emails = await Promise.all(
      messages.map((msg) => EmailParser.parse(gmail, msg))
    );

    // Analyze emails in batch (5 concurrent)
    res.write(
      `event: progress\ndata: ${JSON.stringify({
        stage: "analyzing",
        current: 0,
        total: emails.length,
      })}\n\n`
    );

    const billResults = await billAnalyzer.analyzeBatch(emails, 5);

    // Send results
    for (let i = 0; i < emails.length; i++) {
      const email = emails[i];
      const billData = billResults[i];

      res.write(
        `event: progress\ndata: ${JSON.stringify({
          stage: "complete",
          current: i + 1,
          total: emails.length,
        })}\n\n`
      );

      if (billData && billData.isBill && billData.confidence > 50) {
        res.write(
          `event: bill\ndata: ${JSON.stringify({
            id: email.id,
            emailSubject: email.subject,
            emailFrom: email.from,
            emailDate: email.date,
            ...billData,
          })}\n\n`
        );
      }
    }
    res.end();
  } catch (err) {
    console.error("Gmail API error:", err);
    res.status(500).json({ error: "Gmail API error", details: String(err) });
  }
});

// Get saved bills from Firestore (fast, no Gmail API call)
app.get("/bills", async (req: Request, res: Response) => {
  const uid = req.query.uid as string;
  if (!uid) return res.status(400).json({ error: "Missing uid" });

  try {
    const billsSnapshot = await firestore
      .collection("users")
      .doc(uid)
      .collection("bills")
      .orderBy("dueDate", "asc")
      .get();

    const bills = billsSnapshot.docs.map((doc) => doc.data());
    res.json({ bills });
  } catch (err) {
    console.error("Error fetching bills:", err);
    res.status(500).json({ error: "Failed to fetch bills" });
  }
});

// Mark bill as paid/unpaid
app.post("/bills/:billId/status", async (req: Request, res: Response) => {
  const uid = req.query.uid as string;
  const { billId } = req.params;
  const { status } = req.body;

  if (!uid) return res.status(400).json({ error: "Missing uid" });
  if (!["paid", "unpaid"].includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  try {
    await firestore
      .collection("users")
      .doc(uid)
      .collection("bills")
      .doc(billId)
      .update({ status, updatedAt: Date.now() });

    res.json({ success: true });
  } catch (err) {
    console.error("Error updating bill:", err);
    res.status(500).json({ error: "Failed to update bill" });
  }
});

// AI-powered bank statement parsing
app.get("/gmail/statements/analyze", async (req: Request, res: Response) => {
  const uid = req.query.uid as string;

  if (!uid) return res.status(400).json({ error: "Missing uid" });
  const tokens = await getValidTokens(uid);
  if (!tokens) {
    return res
      .status(401)
      .json({ error: "Please reconnect your Gmail", needsReauth: true });
  }

  oAuth2Client.setCredentials(tokens);
  const gmail = google.gmail({ version: "v1", auth: oAuth2Client });

  try {
    // Search for bank statement emails
    const query =
      'from:(statements@ OR noreply@ OR alerts@) subject:(statement OR transaction OR "account summary") newer_than:60d';
    const messagesRes = await gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults: 20,
    });
    const messages = messagesRes.data.messages || [];

    if (messages.length === 0) {
      return res.json({ transactions: [], matches: [], message: "No statement emails found" });
    }

    // Parse emails
    const emails = await Promise.all(
      messages.map((msg) => EmailParser.parse(gmail, msg))
    );

    // Analyze statements with Gemini
    const statementAnalyzer = new StatementAnalyzer();
    const results = await statementAnalyzer.analyzeBatch(emails, 3);

    // Collect all transactions
    const allTransactions: (Transaction & { sourceEmailId: string; sourceEmailDate: string })[] = [];
    for (const result of results) {
      for (const tx of result.transactions) {
        allTransactions.push({
          ...tx,
          sourceEmailId: result.email.id,
          sourceEmailDate: result.email.date,
        });
      }
    }

    // Get unpaid bills for matching
    const billsSnapshot = await firestore
      .collection("users")
      .doc(uid)
      .collection("bills")
      .where("status", "!=", "paid")
      .get();

    const bills: Bill[] = billsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Bill[];

    // Match transactions to bills
    const billMatcher = new BillMatcher();
    const matches = billMatcher.matchTransactionsToBills(allTransactions, bills);

    // Store transactions in Firestore
    const batch = firestore.batch();
    for (const tx of allTransactions) {
      const txId = `${tx.sourceEmailId}_${tx.date}_${tx.amount}`;
      const txRef = firestore
        .collection("users")
        .doc(uid)
        .collection("transactions")
        .doc(txId);

      // Check if this transaction matches a bill
      const match = matches.find(
        (m) => m.transactionDate === tx.date && m.transactionAmount === tx.amount
      );

      batch.set(txRef, {
        ...tx,
        id: txId,
        matchedBillId: match?.billId || null,
        createdAt: Date.now(),
      }, { merge: true });
    }
    await batch.commit();

    // Auto-mark matched bills as paid
    for (const match of matches) {
      if (match.confidence >= 70) {
        await firestore
          .collection("users")
          .doc(uid)
          .collection("bills")
          .doc(match.billId)
          .update({
            status: "paid",
            paidDate: match.transactionDate,
            matchedTransactionId: `${match.transactionDate}_${match.transactionAmount}`,
            updatedAt: Date.now(),
          });
      }
    }

    res.json({
      transactions: allTransactions,
      matches,
      emailsProcessed: emails.length,
    });
  } catch (err) {
    console.error("Statement analysis error:", err);
    res.status(500).json({ error: "Failed to analyze statements", details: String(err) });
  }
});

// Upload PDF bank statement for analysis
app.post(
  "/statements/upload",
  upload.single("file"),
  async (req: Request, res: Response) => {
    const uid = req.query.uid as string;

    if (!uid) return res.status(400).json({ error: "Missing uid" });
    if (!isValidUid(uid)) return res.status(400).json({ error: "Invalid uid format" });
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    // Validate PDF magic number (%PDF-)
    const pdfMagic = req.file.buffer.subarray(0, 5).toString("ascii");
    if (!pdfMagic.startsWith("%PDF-")) {
      return res.status(400).json({ error: "Invalid PDF file" });
    }

    try {
      // Extract text from PDF
      const parser = new PDFParse({ data: new Uint8Array(req.file.buffer) });
      const pdfData = await parser.getText();
      const pdfText = pdfData.text;

      if (!pdfText || pdfText.trim().length === 0) {
        return res.status(400).json({ error: "Could not extract text from PDF" });
      }

      // Create an Email-like object for the analyzer
      const statementDoc = new Email({
        id: `upload_${Date.now()}`,
        subject: req.file.originalname,
        from: "PDF Upload",
        date: new Date().toISOString(),
        body: "",
        pdfText: pdfText,
      });

      // Analyze with Gemini
      const statementAnalyzer = new StatementAnalyzer();
      const transactions = await statementAnalyzer.analyze(statementDoc);

      if (transactions.length === 0) {
        return res.json({
          transactions: [],
          matches: [],
          message: "No transactions found in PDF",
        });
      }

      // Get unpaid bills for matching
      const billsSnapshot = await firestore
        .collection("users")
        .doc(uid)
        .collection("bills")
        .where("status", "!=", "paid")
        .get();

      const bills: Bill[] = billsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Bill[];

      // Match transactions to bills
      const billMatcher = new BillMatcher();
      const allTransactions = transactions.map((tx) => ({
        ...tx,
        sourceEmailId: statementDoc.id,
        sourceEmailDate: statementDoc.date,
      }));
      const matches = billMatcher.matchTransactionsToBills(allTransactions, bills);

      // Store transactions in Firestore
      const batch = firestore.batch();
      for (const tx of allTransactions) {
        const txId = `${tx.sourceEmailId}_${tx.date}_${tx.amount}`;
        const txRef = firestore
          .collection("users")
          .doc(uid)
          .collection("transactions")
          .doc(txId);

        const match = matches.find(
          (m) => m.transactionDate === tx.date && m.transactionAmount === tx.amount
        );

        batch.set(
          txRef,
          {
            ...tx,
            id: txId,
            matchedBillId: match?.billId || null,
            createdAt: Date.now(),
          },
          { merge: true }
        );
      }
      await batch.commit();

      // Auto-mark matched bills as paid (confidence >= 70%)
      for (const match of matches) {
        if (match.confidence >= 70) {
          await firestore
            .collection("users")
            .doc(uid)
            .collection("bills")
            .doc(match.billId)
            .update({
              status: "paid",
              paidDate: match.transactionDate,
              matchedTransactionId: `${match.transactionDate}_${match.transactionAmount}`,
              updatedAt: Date.now(),
            });
        }
      }

      res.json({
        transactions: allTransactions,
        matches,
        filename: req.file.originalname,
      });
    } catch (err) {
      console.error("PDF upload error:", err);
      res.status(500).json({ error: "Failed to process PDF", details: String(err) });
    }
  }
);

// Get all transactions for user
app.get("/transactions", async (req: Request, res: Response) => {
  const uid = req.query.uid as string;
  if (!uid) return res.status(400).json({ error: "Missing uid" });

  try {
    const transactionsSnapshot = await firestore
      .collection("users")
      .doc(uid)
      .collection("transactions")
      .orderBy("date", "desc")
      .limit(100)
      .get();

    const transactions = transactionsSnapshot.docs.map((doc) => doc.data());
    res.json({ transactions });
  } catch (err) {
    console.error("Error fetching transactions:", err);
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
});

// Disconnect Gmail - revoke access and delete tokens
app.post("/gmail/disconnect", async (req: Request, res: Response) => {
  const uid = req.query.uid as string;
  if (!uid) return res.status(400).json({ error: "Missing uid" });

  try {
    // Get tokens
    const tokenDoc = await firestore.collection("gmail_tokens").doc(uid).get();

    if (tokenDoc.exists) {
      const tokens = tokenDoc.data();

      // Revoke the token with Google
      if (tokens?.access_token) {
        try {
          await oAuth2Client.revokeToken(tokens.access_token);
          console.log("Token revoked with Google");
        } catch (err) {
          console.error("Failed to revoke token:", err);
        }
      }

      // Delete from Firestore
      await firestore.collection("gmail_tokens").doc(uid).delete();
      console.log("Token deleted from Firestore");
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Error disconnecting Gmail:", err);
    res.status(500).json({ error: "Failed to disconnect Gmail" });
  }
});

// Error handling middleware for multer and general errors
app.use((err: Error, _req: Request, res: Response, _next: express.NextFunction) => {
  if (err instanceof MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: "File too large. Maximum size is 10MB." });
    }
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }
  if (err.message === "Only PDF files are allowed") {
    return res.status(400).json({ error: err.message });
  }
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

/**
 * ------------------------------------------------------------------
 * START SERVER
 * ------------------------------------------------------------------
 */
app.listen(PORT, () => {
  console.log(`Server running on port: ${PORT}`);
});
