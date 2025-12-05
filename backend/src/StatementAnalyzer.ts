import { GoogleGenAI } from "@google/genai";
import { Email } from "./Email.js";

export interface Transaction {
  date: string;
  description: string;
  amount: number;
  type: "debit" | "credit";
}

export class StatementAnalyzer {
  private genAI: GoogleGenAI;

  constructor() {
    this.genAI = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY! });
  }

  async analyze(email: Email): Promise<Transaction[]> {
    const prompt = `Extract all transactions from this bank statement email. Return ONLY valid JSON array (no markdown).

From: ${email.from}
Subject: ${email.subject}
Date: ${email.date}
Content: ${email.fullContent}

Return an array of transactions. Each transaction should have:
{
  "date": "YYYY-MM-DD",
  "description": "merchant/payee name",
  "amount": number (positive value),
  "type": "debit" or "credit"
}

If this is not a bank statement or contains no transactions, return an empty array [].
Only include actual transactions, not headers or totals.`;

    try {
      const response = await this.genAI.models.generateContent({
        model: "gemini-2.5-flash-lite",
        contents: prompt,
        config: {
          temperature: 0,
          maxOutputTokens: 4096,
        },
      });

      const content = response.text;
      if (!content) {
        return [];
      }

      // Extract JSON array from response
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const transactions = JSON.parse(jsonMatch[0]) as Transaction[];
        // Validate and filter transactions
        return transactions.filter(
          (tx) =>
            tx.date &&
            tx.description &&
            typeof tx.amount === "number" &&
            tx.amount > 0 &&
            (tx.type === "debit" || tx.type === "credit")
        );
      }
      return [];
    } catch (error) {
      console.error("Error analyzing statement:", error);
      return [];
    }
  }

  async analyzeBatch(
    emails: Email[],
    concurrency: number = 3
  ): Promise<{ email: Email; transactions: Transaction[] }[]> {
    const results: { email: Email; transactions: Transaction[] }[] = [];

    for (let i = 0; i < emails.length; i += concurrency) {
      const batch = emails.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(async (email) => ({
          email,
          transactions: await this.analyze(email),
        }))
      );
      results.push(...batchResults);
    }

    return results;
  }
}
