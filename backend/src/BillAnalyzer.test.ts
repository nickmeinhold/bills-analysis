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
import { BillAnalyzer } from "./BillAnalyzer.js";

const setGenAIResponse = (response: string) => {
  mockGenerateContent.mockResolvedValue({ text: response });
};

describe("BillAnalyzer", () => {
  let analyzer: BillAnalyzer;

  beforeEach(() => {
    mockGenerateContent.mockReset();
    analyzer = new BillAnalyzer();
  });

  const createTestEmail = (
    opts: Partial<{
      subject: string;
      from: string;
      body: string;
    }> = {}
  ) =>
    new Email({
      id: "test-id",
      subject: opts.subject || "Your Bill",
      from: opts.from || "billing@company.com",
      date: "2025-01-15",
      body: opts.body || "Amount due: $150",
      pdfText: "",
    });

  describe("analyze", () => {
    it("should extract bill information from AI response", async () => {
      const mockBillData = {
        isBill: true,
        company: "Power Corp",
        amount: 156.78,
        currency: "AUD",
        dueDate: "2025-01-20",
        billType: "electricity",
        status: "unpaid",
        confidence: 95,
      };

      setGenAIResponse(JSON.stringify(mockBillData));

      const result = await analyzer.analyze(createTestEmail());

      expect(result).toEqual(mockBillData);
    });

    it("should handle non-bill email", async () => {
      const nonBillResponse = {
        isBill: false,
        company: null,
        amount: null,
        currency: null,
        dueDate: null,
        billType: null,
        status: "unknown",
        confidence: 10,
      };

      setGenAIResponse(JSON.stringify(nonBillResponse));

      const result = await analyzer.analyze(createTestEmail({ body: "Newsletter content" }));

      expect(result.isBill).toBe(false);
      expect(result.confidence).toBe(10);
    });

    it("should handle AI response with markdown code blocks", async () => {
      const mockResponse =
        '```json\n{"isBill":true,"company":"Test","amount":100,"confidence":80}\n```';

      setGenAIResponse(mockResponse);

      const result = await analyzer.analyze(createTestEmail());

      expect(result.isBill).toBe(true);
      expect(result.company).toBe("Test");
      expect(result.amount).toBe(100);
    });

    it("should return null on API error", async () => {
      mockGenerateContent.mockRejectedValue(new Error("API Error"));

      const result = await analyzer.analyze(createTestEmail());

      expect(result).toBeNull();
    });

    it("should return null when AI returns empty content", async () => {
      setGenAIResponse("");

      const result = await analyzer.analyze(createTestEmail());

      expect(result).toBeNull();
    });

    it("should return null when AI returns invalid JSON", async () => {
      setGenAIResponse("Not valid JSON at all");

      const result = await analyzer.analyze(createTestEmail());

      expect(result).toBeNull();
    });

    it("should extract JSON object from text with surrounding content", async () => {
      const mockResponse = 'Here is the analysis: {"isBill":true,"amount":50} - end of response';

      setGenAIResponse(mockResponse);

      const result = await analyzer.analyze(createTestEmail());

      expect(result.isBill).toBe(true);
      expect(result.amount).toBe(50);
    });

    it("should handle various bill types", async () => {
      const billTypes = ["electricity", "internet", "phone", "insurance", "subscription", "other"];

      for (const billType of billTypes) {
        mockGenerateContent.mockReset();
        setGenAIResponse(JSON.stringify({ isBill: true, billType, confidence: 90 }));

        const result = await analyzer.analyze(createTestEmail());

        expect(result.billType).toBe(billType);
      }
    });
  });

  describe("analyzeBatch", () => {
    it("should process multiple emails", async () => {
      const emails = [
        createTestEmail({ subject: "Bill 1" }),
        createTestEmail({ subject: "Bill 2" }),
        createTestEmail({ subject: "Bill 3" }),
      ];

      setGenAIResponse(
        JSON.stringify({
          isBill: true,
          company: "Test",
          amount: 100,
          confidence: 80,
        })
      );

      const results = await analyzer.analyzeBatch(emails, 2);

      expect(results).toHaveLength(3);
      results.forEach((result) => {
        expect(result.isBill).toBe(true);
      });
    });

    it("should handle empty email array", async () => {
      const results = await analyzer.analyzeBatch([], 5);

      expect(results).toEqual([]);
    });

    it("should process in batches based on concurrency", async () => {
      const emails = Array(7)
        .fill(null)
        .map((_, i) => createTestEmail({ subject: `Bill ${i}` }));

      setGenAIResponse(JSON.stringify({ isBill: true, confidence: 80 }));

      const results = await analyzer.analyzeBatch(emails, 3);

      expect(results).toHaveLength(7);
    });

    it("should handle null results from failed analyses", async () => {
      const emails = [createTestEmail({ subject: "Bill 1" })];

      setGenAIResponse("");

      const results = await analyzer.analyzeBatch(emails, 5);

      expect(results).toHaveLength(1);
      expect(results[0]).toBeNull();
    });
  });
});
