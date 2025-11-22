import express, { Request, Response } from "express";
import { Firestore } from "@google-cloud/firestore";
import { google } from "googleapis";

const app = express();
app.use(express.json());

const firestore = new Firestore();
const oAuth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// /gmail/auth endpoint
app.get("/gmail/auth", (req: Request, res: Response) => {
  const uid = req.query.uid as string;
  if (!uid) return res.status(400).send("Missing uid");
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

// /exchange endpoint
app.get("/exchange", async (req: Request, res: Response) => {
  const code = req.query.code as string;
  const uid = req.query.state as string;
  if (!code) return res.status(400).send("Missing code");
  if (!uid) return res.status(400).send("Missing uid");
  try {
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);
    await firestore.collection("gmail_tokens").doc(uid).set({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
      updated_at: Date.now(),
    });
    res.redirect("https://YOUR_FIREBASE_HOSTING_URL?gmail=connected");
  } catch (err) {
    res.status(500).send("OAuth2 error: " + err);
  }
});

// /gmail/bills endpoint
app.get("/gmail/bills", async (req: Request, res: Response) => {
  const uid = req.query.uid as string;
  if (!uid) return res.status(400).send("Missing uid");
  const tokenDoc = await firestore.collection("gmail_tokens").doc(uid).get();
  if (!tokenDoc.exists) {
    return res.status(401).send("Authenticate first at /gmail/auth");
  }
  const tokens = tokenDoc.data();
  oAuth2Client.setCredentials(tokens!);
  const gmail = google.gmail({ version: "v1", auth: oAuth2Client });
  try {
    const query = "subject:(bill OR invoice OR payment) newer_than:30d";
    const messagesRes = await gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults: 10,
    });
    const messages = messagesRes.data.messages || [];
    const bills: any[] = [];
    for (const msg of messages) {
      const msgRes = await gmail.users.messages.get({
        userId: "me",
        id: msg.id!,
      });
      const snippet = msgRes.data.snippet;
      const subjectHeader = (msgRes.data.payload?.headers || []).find(
        (h: any) => h.name === "Subject"
      );
      bills.push({
        id: msg.id,
        subject: subjectHeader?.value || "(No Subject)",
        snippet,
      });
    }
    res.json({ bills });
  } catch (err) {
    res.status(500).send("Gmail API error: " + err);
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
