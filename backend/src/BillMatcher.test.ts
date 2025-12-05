import { describe, it, expect, beforeEach } from "vitest";
import { BillMatcher, Bill, Match } from "./BillMatcher.js";
import { Transaction } from "./StatementAnalyzer.js";

describe("BillMatcher", () => {
  let matcher: BillMatcher;

  beforeEach(() => {
    matcher = new BillMatcher();
  });

  describe("matchTransactionsToBills", () => {
    it("should return empty array when no transactions", () => {
      const transactions: Transaction[] = [];
      const bills: Bill[] = [
        {
          id: "1",
          company: "Test",
          amount: 100,
          dueDate: "2025-01-15",
          status: "unpaid",
        },
      ];

      expect(matcher.matchTransactionsToBills(transactions, bills)).toEqual([]);
    });

    it("should return empty array when no bills", () => {
      const transactions: Transaction[] = [
        {
          date: "2025-01-15",
          description: "Test Payment",
          amount: 100,
          type: "debit",
        },
      ];

      expect(matcher.matchTransactionsToBills(transactions, [])).toEqual([]);
    });

    it("should only match debit transactions", () => {
      const transactions: Transaction[] = [
        {
          date: "2025-01-15",
          description: "Test Company",
          amount: 100,
          type: "credit",
        },
      ];
      const bills: Bill[] = [
        {
          id: "1",
          company: "Test Company",
          amount: 100,
          dueDate: "2025-01-15",
          status: "unpaid",
        },
      ];

      expect(matcher.matchTransactionsToBills(transactions, bills)).toEqual([]);
    });

    it("should skip paid bills", () => {
      const transactions: Transaction[] = [
        {
          date: "2025-01-15",
          description: "Test Company",
          amount: 100,
          type: "debit",
        },
      ];
      const bills: Bill[] = [
        {
          id: "1",
          company: "Test Company",
          amount: 100,
          dueDate: "2025-01-15",
          status: "paid",
        },
      ];

      expect(matcher.matchTransactionsToBills(transactions, bills)).toEqual([]);
    });

    it("should skip bills with no amount", () => {
      const transactions: Transaction[] = [
        {
          date: "2025-01-15",
          description: "Test Company",
          amount: 100,
          type: "debit",
        },
      ];
      const bills: Bill[] = [
        {
          id: "1",
          company: "Test Company",
          amount: null,
          dueDate: "2025-01-15",
          status: "unpaid",
        },
      ];

      expect(matcher.matchTransactionsToBills(transactions, bills)).toEqual([]);
    });

    it("should match transaction to bill and return match details", () => {
      const transactions: Transaction[] = [
        {
          date: "2025-01-15",
          description: "test company payment",
          amount: 100,
          type: "debit",
        },
      ];
      const bills: Bill[] = [
        {
          id: "bill-1",
          company: "test company",
          amount: 100,
          dueDate: "2025-01-15",
          status: "unpaid",
        },
      ];

      const matches = matcher.matchTransactionsToBills(transactions, bills);

      expect(matches).toHaveLength(1);
      expect(matches[0].billId).toBe("bill-1");
      expect(matches[0].transactionAmount).toBe(100);
      expect(matches[0].transactionDescription).toBe("test company payment");
      expect(matches[0].confidence).toBeGreaterThanOrEqual(50);
    });
  });

  describe("amount matching (50% weight)", () => {
    it("should give full score for exact amount match", () => {
      const transactions: Transaction[] = [
        {
          date: "2025-01-15",
          description: "company",
          amount: 100,
          type: "debit",
        },
      ];
      const bills: Bill[] = [
        {
          id: "1",
          company: "company",
          amount: 100,
          dueDate: "2025-01-15",
          status: "unpaid",
        },
      ];

      const matches = matcher.matchTransactionsToBills(transactions, bills);
      expect(matches).toHaveLength(1);
      expect(matches[0].confidence).toBe(100);
    });

    it("should give full score for amount within 2% tolerance", () => {
      const transactions: Transaction[] = [
        {
          date: "2025-01-15",
          description: "company",
          amount: 101.5,
          type: "debit",
        },
      ];
      const bills: Bill[] = [
        {
          id: "1",
          company: "company",
          amount: 100,
          dueDate: "2025-01-15",
          status: "unpaid",
        },
      ];

      const matches = matcher.matchTransactionsToBills(transactions, bills);
      expect(matches).toHaveLength(1);
      expect(matches[0].confidence).toBe(100);
    });

    it("should give partial score for amount within 5% tolerance", () => {
      const transactions: Transaction[] = [
        {
          date: "2025-01-15",
          description: "company",
          amount: 104,
          type: "debit",
        },
      ];
      const bills: Bill[] = [
        {
          id: "1",
          company: "company",
          amount: 100,
          dueDate: "2025-01-15",
          status: "unpaid",
        },
      ];

      const matches = matcher.matchTransactionsToBills(transactions, bills);
      expect(matches).toHaveLength(1);
      // 30% amount + 30% date + 20% name = 80%
      expect(matches[0].confidence).toBe(80);
    });

    it("should return no match for amount difference > 5%", () => {
      const transactions: Transaction[] = [
        {
          date: "2025-01-15",
          description: "company",
          amount: 110,
          type: "debit",
        },
      ];
      const bills: Bill[] = [
        {
          id: "1",
          company: "company",
          amount: 100,
          dueDate: "2025-01-15",
          status: "unpaid",
        },
      ];

      const matches = matcher.matchTransactionsToBills(transactions, bills);
      expect(matches).toHaveLength(0);
    });
  });

  describe("date matching (30% weight)", () => {
    it("should give full score for transaction on due date", () => {
      const transactions: Transaction[] = [
        {
          date: "2025-01-15",
          description: "company",
          amount: 100,
          type: "debit",
        },
      ];
      const bills: Bill[] = [
        {
          id: "1",
          company: "company",
          amount: 100,
          dueDate: "2025-01-15",
          status: "unpaid",
        },
      ];

      const matches = matcher.matchTransactionsToBills(transactions, bills);
      expect(matches[0].confidence).toBe(100);
    });

    it("should give full score for transaction 7 days before due date", () => {
      const transactions: Transaction[] = [
        {
          date: "2025-01-08",
          description: "company",
          amount: 100,
          type: "debit",
        },
      ];
      const bills: Bill[] = [
        {
          id: "1",
          company: "company",
          amount: 100,
          dueDate: "2025-01-15",
          status: "unpaid",
        },
      ];

      const matches = matcher.matchTransactionsToBills(transactions, bills);
      expect(matches[0].confidence).toBe(100);
    });

    it("should give full score for transaction 14 days after due date", () => {
      const transactions: Transaction[] = [
        {
          date: "2025-01-29",
          description: "company",
          amount: 100,
          type: "debit",
        },
      ];
      const bills: Bill[] = [
        {
          id: "1",
          company: "company",
          amount: 100,
          dueDate: "2025-01-15",
          status: "unpaid",
        },
      ];

      const matches = matcher.matchTransactionsToBills(transactions, bills);
      expect(matches[0].confidence).toBe(100);
    });

    it("should give partial score for transaction outside primary window but within 30 days", () => {
      const transactions: Transaction[] = [
        {
          date: "2025-02-10",
          description: "company",
          amount: 100,
          type: "debit",
        },
      ];
      const bills: Bill[] = [
        {
          id: "1",
          company: "company",
          amount: 100,
          dueDate: "2025-01-15",
          status: "unpaid",
        },
      ];

      const matches = matcher.matchTransactionsToBills(transactions, bills);
      expect(matches).toHaveLength(1);
      // 50% amount + 15% date + 20% name = 85%
      expect(matches[0].confidence).toBe(85);
    });

    it("should give no date score for transaction far outside window", () => {
      const transactions: Transaction[] = [
        {
          date: "2025-03-15",
          description: "company",
          amount: 100,
          type: "debit",
        },
      ];
      const bills: Bill[] = [
        {
          id: "1",
          company: "company",
          amount: 100,
          dueDate: "2025-01-15",
          status: "unpaid",
        },
      ];

      const matches = matcher.matchTransactionsToBills(transactions, bills);
      expect(matches).toHaveLength(1);
      // 50% amount + 0% date + 20% name = 70%
      expect(matches[0].confidence).toBe(70);
    });
  });

  describe("name similarity (20% weight)", () => {
    it("should give full score when company name is contained in description", () => {
      const transactions: Transaction[] = [
        {
          date: "2025-01-15",
          description: "PAYMENT TO netflix SUBSCRIPTION",
          amount: 15.99,
          type: "debit",
        },
      ];
      const bills: Bill[] = [
        {
          id: "1",
          company: "Netflix",
          amount: 15.99,
          dueDate: "2025-01-15",
          status: "unpaid",
        },
      ];

      const matches = matcher.matchTransactionsToBills(transactions, bills);
      expect(matches[0].confidence).toBe(100);
    });

    it("should match AMZN to Amazon via abbreviation mapping", () => {
      const transactions: Transaction[] = [
        {
          date: "2025-01-15",
          description: "amzn digital",
          amount: 9.99,
          type: "debit",
        },
      ];
      const bills: Bill[] = [
        {
          id: "1",
          company: "Amazon",
          amount: 9.99,
          dueDate: "2025-01-15",
          status: "unpaid",
        },
      ];

      const matches = matcher.matchTransactionsToBills(transactions, bills);
      expect(matches).toHaveLength(1);
      // 50% amount + 30% date + 16% name (0.8 * 0.2) = 96%
      expect(matches[0].confidence).toBe(96);
    });

    it("should match electricity providers via category mapping", () => {
      const transactions: Transaction[] = [
        {
          date: "2025-01-15",
          description: "agl energy payment",
          amount: 150,
          type: "debit",
        },
      ];
      const bills: Bill[] = [
        {
          id: "1",
          company: "electricity bill",
          amount: 150,
          dueDate: "2025-01-15",
          status: "unpaid",
        },
      ];

      const matches = matcher.matchTransactionsToBills(transactions, bills);
      expect(matches).toHaveLength(1);
      expect(matches[0].confidence).toBe(96);
    });

    it("should match internet providers via category mapping", () => {
      const transactions: Transaction[] = [
        {
          date: "2025-01-15",
          description: "optus internet service",
          amount: 89,
          type: "debit",
        },
      ];
      const bills: Bill[] = [
        {
          id: "1",
          company: "internet plan",
          amount: 89,
          dueDate: "2025-01-15",
          status: "unpaid",
        },
      ];

      const matches = matcher.matchTransactionsToBills(transactions, bills);
      expect(matches).toHaveLength(1);
      expect(matches[0].confidence).toBe(96);
    });

    it("should give proportional score for word overlap", () => {
      const transactions: Transaction[] = [
        {
          date: "2025-01-15",
          description: "acme corp billing",
          amount: 100,
          type: "debit",
        },
      ];
      const bills: Bill[] = [
        {
          id: "1",
          company: "Acme Corporation Services",
          amount: 100,
          dueDate: "2025-01-15",
          status: "unpaid",
        },
      ];

      const matches = matcher.matchTransactionsToBills(transactions, bills);
      expect(matches).toHaveLength(1);
      // Should have some name similarity from word overlap
      expect(matches[0].confidence).toBeGreaterThanOrEqual(80);
    });

    it("should handle bills with null company", () => {
      const transactions: Transaction[] = [
        {
          date: "2025-01-15",
          description: "some payment",
          amount: 100,
          type: "debit",
        },
      ];
      const bills: Bill[] = [
        {
          id: "1",
          company: null,
          amount: 100,
          dueDate: "2025-01-15",
          status: "unpaid",
        },
      ];

      const matches = matcher.matchTransactionsToBills(transactions, bills);
      expect(matches).toHaveLength(1);
      // 50% amount + 30% date + 0% name = 80%
      expect(matches[0].confidence).toBe(80);
    });
  });

  describe("minimum confidence threshold", () => {
    it("should require at least 50% confidence for a match", () => {
      // Amount match gives 30% (within 5%), no date or name match
      const transactions: Transaction[] = [
        {
          date: "2025-06-01",
          description: "unknown vendor xyz",
          amount: 104,
          type: "debit",
        },
      ];
      const bills: Bill[] = [
        {
          id: "1",
          company: "Different Company",
          amount: 100,
          dueDate: "2025-01-15",
          status: "unpaid",
        },
      ];

      const matches = matcher.matchTransactionsToBills(transactions, bills);
      // 30% amount only, below 50% threshold
      expect(matches).toHaveLength(0);
    });
  });

  describe("best match selection", () => {
    it("should select the bill with highest score when multiple bills match", () => {
      const transactions: Transaction[] = [
        {
          date: "2025-01-15",
          description: "netflix subscription",
          amount: 15.99,
          type: "debit",
        },
      ];
      const bills: Bill[] = [
        {
          id: "bill-1",
          company: "Netflix",
          amount: 15.99,
          dueDate: "2025-01-15",
          status: "unpaid",
        },
        {
          id: "bill-2",
          company: "Other Service",
          amount: 15.99,
          dueDate: "2025-01-20",
          status: "unpaid",
        },
      ];

      const matches = matcher.matchTransactionsToBills(transactions, bills);
      expect(matches).toHaveLength(1);
      expect(matches[0].billId).toBe("bill-1");
    });

    it("should match each transaction to at most one bill", () => {
      const transactions: Transaction[] = [
        {
          date: "2025-01-15",
          description: "company payment",
          amount: 100,
          type: "debit",
        },
        {
          date: "2025-01-16",
          description: "company payment",
          amount: 100,
          type: "debit",
        },
      ];
      const bills: Bill[] = [
        {
          id: "bill-1",
          company: "company",
          amount: 100,
          dueDate: "2025-01-15",
          status: "unpaid",
        },
      ];

      const matches = matcher.matchTransactionsToBills(transactions, bills);
      // Both transactions match the same bill (current implementation allows this)
      expect(matches).toHaveLength(2);
    });
  });
});
