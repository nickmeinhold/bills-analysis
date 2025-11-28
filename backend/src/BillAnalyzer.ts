import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { Email } from "./Email";

export class BillAnalyzer {
  private llm: ChatGoogleGenerativeAI;

  constructor() {
    this.llm = new ChatGoogleGenerativeAI({
      model: "gemini-2.5-flash",
      temperature: 0,
      apiKey: process.env.GOOGLE_API_KEY,
      apiVersion: "v1",
      maxOutputTokens: 256,
    });
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
    const aiResponse = await this.llm.invoke(prompt);
    const content = aiResponse.content as string;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return null;
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
