"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const googleapis_1 = require("googleapis");
const firestore_1 = require("@google-cloud/firestore");
// LangChain Imports
const google_genai_1 = require("@langchain/google-genai");
// Load environment variables
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
// Firestore setup
const firestore = new firestore_1.Firestore();
// Middleware
app.use((0, cors_1.default)({
    origin: [
        "https://gen-lang-client-0390109521.web.app",
        "http://localhost:3000",
    ],
    credentials: true,
}));
app.use(express_1.default.json());
// Gmail OAuth2 Setup
const oAuth2Client = new googleapis_1.google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI);
/**
 * ------------------------------------------------------------------
 * AGENT SETUP
 * ------------------------------------------------------------------
 */
const llm = new google_genai_1.ChatGoogleGenerativeAI({
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
    res.json({
        message: "Gemini Agent Server is running. Send requests to /gmail/auth",
    });
});
// Step 1: Redirect user to Google OAuth consent screen
app.get("/gmail/auth", (req, res) => {
    const uid = req.query.uid;
    if (!uid)
        return res.status(400).json({ error: "Missing uid" });
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
app.get("/exchange", async (req, res) => {
    const code = req.query.code;
    const uid = req.query.state;
    if (!code)
        return res.status(400).json({ error: "Missing code" });
    if (!uid)
        return res.status(400).json({ error: "Missing uid" });
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
        // Redirect back to frontend
        res.redirect("https://gen-lang-client-0390109521.web.app?gmail=connected");
    }
    catch (err) {
        console.error("OAuth2 error:", err);
        res.status(500).json({ error: "OAuth2 error", details: err });
    }
});
// Step 3: Read emails and detect bills
app.get("/gmail/bills", async (req, res) => {
    const uid = req.query.uid;
    if (!uid)
        return res.status(400).json({ error: "Missing uid" });
    // Load tokens from Firestore
    const tokenDoc = await firestore.collection("gmail_tokens").doc(uid).get();
    if (!tokenDoc.exists) {
        return res.status(401).json({ error: "Authenticate first at /gmail/auth" });
    }
    const tokens = tokenDoc.data();
    oAuth2Client.setCredentials(tokens);
    const gmail = googleapis_1.google.gmail({ version: "v1", auth: oAuth2Client });
    try {
        const query = "subject:(bill OR invoice OR payment) newer_than:30d";
        const messagesRes = await gmail.users.messages.list({
            userId: "me",
            q: query,
            maxResults: 10,
        });
        const messages = messagesRes.data.messages || [];
        const bills = [];
        for (const msg of messages) {
            const msgRes = await gmail.users.messages.get({
                userId: "me",
                id: msg.id,
            });
            const snippet = msgRes.data.snippet;
            const subjectHeader = (msgRes.data.payload?.headers || []).find((h) => h.name === "Subject");
            bills.push({
                id: msg.id,
                subject: subjectHeader?.value || "(No Subject)",
                snippet,
            });
        }
        res.json({ bills });
    }
    catch (err) {
        console.error("Gmail API error:", err);
        res.status(500).json({ error: "Gmail API error", details: err });
    }
});
// Step 4: AI-powered bill parsing
app.get("/gmail/bills/analyze", async (req, res) => {
    const uid = req.query.uid;
    if (!uid)
        return res.status(400).json({ error: "Missing uid" });
    // Load tokens from Firestore
    const tokenDoc = await firestore.collection("gmail_tokens").doc(uid).get();
    if (!tokenDoc.exists) {
        return res.status(401).json({ error: "Authenticate first at /gmail/auth" });
    }
    const tokens = tokenDoc.data();
    oAuth2Client.setCredentials(tokens);
    const gmail = googleapis_1.google.gmail({ version: "v1", auth: oAuth2Client });
    try {
        // Search for bill-related emails
        const query = "subject:(bill OR invoice OR payment OR due OR statement) newer_than:30d";
        const messagesRes = await gmail.users.messages.list({
            userId: "me",
            q: query,
            maxResults: 10,
        });
        const messages = messagesRes.data.messages || [];
        const analyzedBills = [];
        for (const msg of messages) {
            const msgRes = await gmail.users.messages.get({
                userId: "me",
                id: msg.id,
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
            }
            else if (msgRes.data.payload?.parts) {
                const textPart = msgRes.data.payload.parts.find((p) => p.mimeType === "text/plain");
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
                const content = aiResponse.content;
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
            }
            catch (parseErr) {
                console.error("AI parse error for message:", msg.id, parseErr);
            }
        }
        // Sort by due date
        analyzedBills.sort((a, b) => {
            if (!a.dueDate)
                return 1;
            if (!b.dueDate)
                return -1;
            return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        });
        res.json({ bills: analyzedBills });
    }
    catch (err) {
        console.error("Gmail API error:", err);
        res.status(500).json({ error: "Gmail API error", details: err });
    }
});
/**
 * ------------------------------------------------------------------
 * START SERVER
 * ------------------------------------------------------------------
 */
app.listen(PORT, () => {
    console.log(`\n🚀 Gemini Server running at http://localhost:${PORT}`);
});
