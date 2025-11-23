import express, { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { google } from "googleapis";
import { Firestore } from "@google-cloud/firestore";

// LangChain Imports
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatPromptTemplate } from "@langchain/core/prompts";

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Firestore setup
const firestore = new Firestore();

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
    origin: [
      "https://gen-lang-client-0390109521.web.app",
      "http://localhost:3000",
    ],
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
 * AGENT SETUP
 * ------------------------------------------------------------------
 */

const llm = new ChatGoogleGenerativeAI({
  model: "gemini-2.5-flash",
  temperature: 0,
  apiKey: process.env.GOOGLE_API_KEY,
  apiVersion: "v1",
});

/**
 * ------------------------------------------------------------------
 * SERVER ENDPOINTS
 * ------------------------------------------------------------------
 */

// Health check
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "Gemini Agent Server is running" });
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

  if (!code) return res.status(400).json({ error: "Missing code" });
  if (!uid) return res.status(400).json({ error: "Missing uid" });

  try {
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);

    // Store tokens in Firestore under user's uid
    await firestore.collection("gmail_tokens").doc(uid).set({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
      updated_at: Date.now(),
    });

    // Get user email and store profile
    oAuth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: "v2", auth: oAuth2Client });
    const userInfo = await oauth2.userinfo.get();

    await firestore.collection("user_profiles").doc(uid).set(
      {
        email: userInfo.data.email,
        name: userInfo.data.name,
        picture: userInfo.data.picture,
        updatedAt: Date.now(),
      },
      { merge: true }
    );

    // Redirect back to frontend
    res.redirect("https://YOUR_FIREBASE_HOSTING_URL?gmail=connected");
  } catch (err) {
    console.error("OAuth2 error:", err);
    res.status(500).json({ error: "OAuth2 error", details: String(err) });
  }
});

// AI-powered bill parsing
app.get("/gmail/bills", async (req: Request, res: Response) => {
  const uid = req.query.uid as string;
  if (!uid) return res.status(400).json({ error: "Missing uid" });

  // Get valid tokens (auto-refreshes if expired)
  const tokens = await getValidTokens(uid);
  if (!tokens) {
    return res
      .status(401)
      .json({ error: "Please reconnect your Gmail", needsReauth: true });
  }

  const tokenDoc = await firestore.collection("gmail_tokens").doc(uid).get();
  if (!tokenDoc.exists) {
    return res.status(401).send("Authenticate first at /gmail/auth");
  }
  oAuth2Client.setCredentials(tokens);

  const gmail = google.gmail({ version: "v1", auth: oAuth2Client });

  try {
    // Search for bill-related emails
    const query =
      "subject:(bill OR invoice OR payment OR due OR statement) newer_than:30d";
    const messagesRes = await gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults: 10,
    });
    const messages = messagesRes.data.messages || [];
    const analyzedBills: any[] = [];

    for (const msg of messages) {
      const msgRes = await gmail.users.messages.get({
        userId: "me",
        id: msg.id!,
        format: "full",
      });

      // Get email content
      const headers = msgRes.data.payload?.headers || [];
      const subject = headers.find((h) => h.name === "Subject")?.value || "";
      const from = headers.find((h) => h.name === "From")?.value || "";
      const date = headers.find((h) => h.name === "Date")?.value || "";

      // Get body text
      let body = "";
      if (msgRes.data.payload?.body?.data) {
        body = Buffer.from(msgRes.data.payload.body.data, "base64").toString();
      } else if (msgRes.data.payload?.parts) {
        const textPart = msgRes.data.payload.parts.find(
          (p) => p.mimeType === "text/plain"
        );
        if (textPart?.body?.data) {
          body = Buffer.from(textPart.body.data, "base64").toString();
        }
      }

      // Use Gemini to analyze the email
      const prompt = `Analyze this email and extract bill information. Return JSON only, no markdown.

From: ${from}
Subject: ${subject}
Date: ${date}
Body: ${body.substring(0, 2000)}

Return this exact JSON structure:
{
  "isBill": true/false,
  "company": "company name or null",
  "amount": number or null,
  "currency": "AUD/USD/etc or null",
  "dueDate": "YYYY-MM-DD or null",
  "billType": "electricity/internet/phone/insurance/subscription/other/null",
  "status": "paid/unpaid/unknown",
  "confidence": 0-100
}`;

      try {
        const aiResponse = await llm.invoke(prompt);
        const content = aiResponse.content as string;

        // Parse JSON from response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const billData = JSON.parse(jsonMatch[0]);

          if (billData.isBill && billData.confidence > 50) {
            analyzedBills.push({
              id: msg.id,
              emailSubject: subject,
              emailFrom: from,
              emailDate: date,
              ...billData,
            });
          }
        }
      } catch (parseErr) {
        console.error("AI parse error for message:", msg.id, parseErr);
      }
    }

    // Sort by due date
    analyzedBills.sort((a, b) => {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    });

    // Save bills to Firestore
    const batch = firestore.batch();
    for (const bill of analyzedBills) {
      const billRef = firestore
        .collection("users")
        .doc(uid)
        .collection("bills")
        .doc(bill.id);
      batch.set(
        billRef,
        {
          ...bill,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        { merge: true }
      );
    }
    await batch.commit();

    res.json({ bills: analyzedBills });
  } catch (err) {
    console.error("Gmail API error:", err);
    res.status(500).json({ error: "Gmail API error", details: String(err) });
  }
});

// Get saved bills from Firestore (fast, no Gmail API call)
app.get("/bills", async (req, res) => {
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
    res.status(500).send("Gmail API error: " + err);
    res.status(500).json({ error: "Failed to fetch bills" });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
// Mark bill as paid/unpaid
app.post("/bills/:billId/status", async (req, res) => {
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

/**
 * ------------------------------------------------------------------
 * START SERVER
 * ------------------------------------------------------------------
 */
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
