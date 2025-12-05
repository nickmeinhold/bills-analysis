import { describe, it, expect } from "vitest";
import { Email } from "./Email.js";

describe("Email", () => {
  describe("constructor", () => {
    it("should create an email with all properties", () => {
      const email = new Email({
        id: "test-id",
        subject: "Test Subject",
        from: "sender@example.com",
        date: "2025-01-15",
        body: "Test body",
        pdfText: "PDF content",
      });

      expect(email.id).toBe("test-id");
      expect(email.subject).toBe("Test Subject");
      expect(email.from).toBe("sender@example.com");
      expect(email.date).toBe("2025-01-15");
      expect(email.body).toBe("Test body");
      expect(email.pdfText).toBe("PDF content");
    });
  });

  describe("fullContent getter", () => {
    it("should combine body and pdfText", () => {
      const email = new Email({
        id: "test-id",
        subject: "Test",
        from: "test@example.com",
        date: "2025-01-15",
        body: "Body content",
        pdfText: " PDF content",
      });

      expect(email.fullContent).toBe("Body content PDF content");
    });

    it("should return only body when pdfText is empty", () => {
      const email = new Email({
        id: "test-id",
        subject: "Test",
        from: "test@example.com",
        date: "2025-01-15",
        body: "Body content",
        pdfText: "",
      });

      expect(email.fullContent).toBe("Body content");
    });

    it("should truncate combined content to 5000 characters", () => {
      const longBody = "A".repeat(4000);
      const longPdfText = "B".repeat(2000);

      const email = new Email({
        id: "test-id",
        subject: "Test",
        from: "test@example.com",
        date: "2025-01-15",
        body: longBody,
        pdfText: longPdfText,
      });

      expect(email.fullContent.length).toBe(5000);
      expect(email.fullContent.startsWith("A")).toBe(true);
      expect(email.fullContent.endsWith("B")).toBe(true);
    });

    it("should not truncate content under 5000 characters", () => {
      const email = new Email({
        id: "test-id",
        subject: "Test",
        from: "test@example.com",
        date: "2025-01-15",
        body: "Short body",
        pdfText: " Short PDF",
      });

      expect(email.fullContent).toBe("Short body Short PDF");
      expect(email.fullContent.length).toBeLessThan(5000);
    });

    it("should handle exactly 5000 characters without truncation", () => {
      const body = "X".repeat(5000);

      const email = new Email({
        id: "test-id",
        subject: "Test",
        from: "test@example.com",
        date: "2025-01-15",
        body: body,
        pdfText: "",
      });

      expect(email.fullContent.length).toBe(5000);
      expect(email.fullContent).toBe(body);
    });

    it("should handle empty body and pdfText", () => {
      const email = new Email({
        id: "test-id",
        subject: "Test",
        from: "test@example.com",
        date: "2025-01-15",
        body: "",
        pdfText: "",
      });

      expect(email.fullContent).toBe("");
    });
  });
});
