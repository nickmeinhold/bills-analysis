import { GoogleGenAI } from "@google/genai";
import { Email } from "./Email.js";

export class BillAnalyzer {
  private genAI: GoogleGenAI;

  constructor() {
    this.genAI = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY! });
  }

  async analyze(email: Email): Promise<any> {
    const prompt = `Extract bill info from this email. Return ONLY valid JSON (no markdown).

From: ${email.from}
Subject: ${email.subject}
Date: ${email.date}
Content: ${email.fullContent}

JSON schema:
{
  "isBill": boolean,
  "company": "string or null",
  "amount": number or null,
  "currency": "AUD/USD/etc or null",
  "dueDate": "YYYY-MM-DD or null",
  "billType": "electricity/internet/phone/insurance/subscription/other/null",
  "status": "paid/unpaid/unknown",
  "confidence": 0-100
}`;

    try {
      const response = await this.genAI.models.generateContent({
        model: "gemini-1.5-flash",
        contents: prompt,
        config: {
          temperature: 0,
          maxOutputTokens: 256,
        },
      });

      const content = response.text;
      if (!content) {
        return null;
      }
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return null;
    } catch (error) {
      console.error("Error analyzing email:", error);
      return null;
    }
  }

  async analyzeBatch(emails: Email[], concurrency: number = 5): Promise<any[]> {
    const results: any[] = [];

    // Process emails in batches to avoid overwhelming the API
    for (let i = 0; i < emails.length; i += concurrency) {
      const batch = emails.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map((email) => this.analyze(email))
      );
      results.push(...batchResults);
    }

    return results;
  }
}
