import { describe, it, expect, beforeEach, vi } from "vitest";
import { Email } from "./Email.js";

// Create mock before vi.mock runs
const { mockGenerateContent } = vi.hoisted(() => ({
  mockGenerateContent: vi.fn(),
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent: mockGenerateContent };
  },
}));

// Must import after vi.mock
import { StatementAnalyzer, Transaction } from "./StatementAnalyzer.js";

const setGenAIResponse = (response: string) => {
  mockGenerateContent.mockResolvedValue({ text: response });
};

describe("StatementAnalyzer", () => {
  let analyzer: StatementAnalyzer;

  beforeEach(() => {
    mockGenerateContent.mockReset();
    analyzer = new StatementAnalyzer();
  });

  const createTestEmail = (content: string = "Test content") =>
    new Email({
      id: "test-id",
      subject: "Bank Statement",
      from: "statements@bank.com",
      date: "2025-01-15",
      body: content,
      pdfText: "",
    });

  describe("analyze", () => {
    it("should extract transactions from AI response", async () => {
      const mockResponse = JSON.stringify([
        { date: "2025-01-10", description: "GROCERY STORE", amount: 50.0, type: "debit" },
        { date: "2025-01-11", description: "SALARY DEPOSIT", amount: 3000.0, type: "credit" },
      ]);

      setGenAIResponse(mockResponse);

      const transactions = await analyzer.analyze(createTestEmail());

      expect(transactions).toHaveLength(2);
      expect(transactions[0]).toEqual({
        date: "2025-01-10",
        description: "GROCERY STORE",
        amount: 50.0,
        type: "debit",
      });
    });

    it("should return empty array for non-statement email", async () => {
      setGenAIResponse("[]");

      const transactions = await analyzer.analyze(createTestEmail("Not a bank statement"));

      expect(transactions).toEqual([]);
    });

    it("should handle AI response with markdown code blocks", async () => {
      const mockResponse = '```json\n[{"date":"2025-01-10","description":"TEST","amount":100,"type":"debit"}]\n```';

      setGenAIResponse(mockResponse);

      const transactions = await analyzer.analyze(createTestEmail());

      expect(transactions).toHaveLength(1);
      expect(transactions[0].description).toBe("TEST");
    });

    it("should filter out transactions with missing date", async () => {
      const mockResponse = JSON.stringify([
        { date: "2025-01-10", description: "Valid", amount: 50, type: "debit" },
        { date: null, description: "Missing date", amount: 50, type: "debit" },
        { date: "", description: "Empty date", amount: 50, type: "debit" },
      ]);

      setGenAIResponse(mockResponse);

      const transactions = await analyzer.analyze(createTestEmail());

      expect(transactions).toHaveLength(1);
      expect(transactions[0].description).toBe("Valid");
    });

    it("should filter out transactions with missing description", async () => {
      const mockResponse = JSON.stringify([
        { date: "2025-01-10", description: "Valid", amount: 50, type: "debit" },
        { date: "2025-01-10", description: "", amount: 50, type: "debit" },
        { date: "2025-01-10", description: null, amount: 50, type: "debit" },
      ]);

      setGenAIResponse(mockResponse);

      const transactions = await analyzer.analyze(createTestEmail());

      expect(transactions).toHaveLength(1);
    });

    it("should filter out transactions with invalid amount", async () => {
      const mockResponse = JSON.stringify([
        { date: "2025-01-10", description: "Valid", amount: 50, type: "debit" },
        { date: "2025-01-10", description: "No amount", amount: null, type: "debit" },
        { date: "2025-01-10", description: "Zero amount", amount: 0, type: "debit" },
        { date: "2025-01-10", description: "Negative", amount: -50, type: "debit" },
        { date: "2025-01-10", description: "String amount", amount: "50", type: "debit" },
      ]);

      setGenAIResponse(mockResponse);

      const transactions = await analyzer.analyze(createTestEmail());

      expect(transactions).toHaveLength(1);
      expect(transactions[0].description).toBe("Valid");
    });

    it("should filter out transactions with invalid type", async () => {
      const mockResponse = JSON.stringify([
        { date: "2025-01-10", description: "Debit", amount: 50, type: "debit" },
        { date: "2025-01-10", description: "Credit", amount: 50, type: "credit" },
        { date: "2025-01-10", description: "Invalid", amount: 50, type: "invalid" },
        { date: "2025-01-10", description: "Missing", amount: 50, type: null },
      ]);

      setGenAIResponse(mockResponse);

      const transactions = await analyzer.analyze(createTestEmail());

      expect(transactions).toHaveLength(2);
      expect(transactions.map((t) => t.description)).toEqual(["Debit", "Credit"]);
    });

    it("should return empty array on API error", async () => {
      mockGenerateContent.mockRejectedValue(new Error("API Error"));

      const transactions = await analyzer.analyze(createTestEmail());

      expect(transactions).toEqual([]);
    });

    it("should return empty array when AI returns empty content", async () => {
      setGenAIResponse("");

      const transactions = await analyzer.analyze(createTestEmail());

      expect(transactions).toEqual([]);
    });

    it("should return empty array when no JSON array in response", async () => {
      setGenAIResponse("No transactions found in this email.");

      const transactions = await analyzer.analyze(createTestEmail());

      expect(transactions).toEqual([]);
    });
  });

  describe("analyzeBatch", () => {
    it("should process emails and return results with email reference", async () => {
      const emails = [
        createTestEmail("Email 1"),
        createTestEmail("Email 2"),
      ];

      setGenAIResponse(
        JSON.stringify([{ date: "2025-01-10", description: "TX", amount: 100, type: "debit" }])
      );

      const results = await analyzer.analyzeBatch(emails, 2);

      expect(results).toHaveLength(2);
      results.forEach((result) => {
        expect(result.email).toBeDefined();
        expect(result.transactions).toHaveLength(1);
      });
    });

    it("should handle empty email array", async () => {
      const results = await analyzer.analyzeBatch([], 3);

      expect(results).toEqual([]);
    });

    it("should process in batches based on concurrency", async () => {
      const emails = Array(5)
        .fill(null)
        .map((_, i) => createTestEmail(`Email ${i}`));

      setGenAIResponse("[]");

      const results = await analyzer.analyzeBatch(emails, 2);

      expect(results).toHaveLength(5);
    });
  });
});
