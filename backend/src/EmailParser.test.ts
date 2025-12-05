import { describe, it, expect, vi, beforeEach } from "vitest";
import { EmailParser } from "./EmailParser.js";

// Use vi.hoisted to ensure mock class is created before vi.mock runs
const { MockPDFParse } = vi.hoisted(() => {
  class MockPDFParse {
    getText() {
      return Promise.resolve({ text: "Extracted PDF text" });
    }
  }
  return { MockPDFParse };
});

vi.mock("pdf-parse", () => {
  return { PDFParse: MockPDFParse };
});

describe("EmailParser", () => {
  let mockGmail: any;
  let mockMessagesGet: ReturnType<typeof vi.fn>;
  let mockAttachmentsGet: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockMessagesGet = vi.fn();
    mockAttachmentsGet = vi.fn();

    mockGmail = {
      users: {
        messages: {
          get: mockMessagesGet,
          attachments: {
            get: mockAttachmentsGet,
          },
        },
      },
    };
  });

  const createMockMessageResponse = (options: {
    id?: string;
    subject?: string;
    from?: string;
    date?: string;
    bodyData?: string;
    parts?: any[];
  }) => ({
    data: {
      id: options.id || "msg-123",
      payload: {
        headers: [
          { name: "Subject", value: options.subject || "" },
          { name: "From", value: options.from || "" },
          { name: "Date", value: options.date || "" },
        ],
        body: options.bodyData
          ? { data: Buffer.from(options.bodyData).toString("base64") }
          : undefined,
        parts: options.parts,
      },
    },
  });

  describe("parse", () => {
    it("should extract headers correctly", async () => {
      mockMessagesGet.mockResolvedValue(
        createMockMessageResponse({
          id: "msg-123",
          subject: "Your Bill",
          from: "billing@company.com",
          date: "Mon, 15 Jan 2025 10:00:00 GMT",
          bodyData: "Bill content here",
        })
      );

      const email = await EmailParser.parse(mockGmail, { id: "msg-123" });

      expect(email.id).toBe("msg-123");
      expect(email.subject).toBe("Your Bill");
      expect(email.from).toBe("billing@company.com");
      expect(email.date).toBe("Mon, 15 Jan 2025 10:00:00 GMT");
    });

    it("should decode base64 body from payload.body.data", async () => {
      const bodyContent = "This is the email body";
      mockMessagesGet.mockResolvedValue(
        createMockMessageResponse({
          bodyData: bodyContent,
        })
      );

      const email = await EmailParser.parse(mockGmail, { id: "msg-123" });

      expect(email.body).toBe(bodyContent);
    });

    it("should extract body from text/plain part", async () => {
      mockMessagesGet.mockResolvedValue(
        createMockMessageResponse({
          parts: [
            {
              mimeType: "text/plain",
              body: { data: Buffer.from("Plain text content").toString("base64") },
            },
          ],
        })
      );

      const email = await EmailParser.parse(mockGmail, { id: "msg-123" });

      expect(email.body).toBe("Plain text content");
    });

    it("should prefer text/plain over text/html", async () => {
      mockMessagesGet.mockResolvedValue(
        createMockMessageResponse({
          parts: [
            {
              mimeType: "text/html",
              body: {
                data: Buffer.from("<html><body>HTML content</body></html>").toString("base64"),
              },
            },
            {
              mimeType: "text/plain",
              body: { data: Buffer.from("Plain text content").toString("base64") },
            },
          ],
        })
      );

      const email = await EmailParser.parse(mockGmail, { id: "msg-123" });

      expect(email.body).toBe("Plain text content");
    });

    it("should strip HTML tags when falling back to HTML body", async () => {
      mockMessagesGet.mockResolvedValue(
        createMockMessageResponse({
          parts: [
            {
              mimeType: "text/html",
              body: {
                data: Buffer.from("<html><body><p>HTML content</p></body></html>").toString(
                  "base64"
                ),
              },
            },
          ],
        })
      );

      const email = await EmailParser.parse(mockGmail, { id: "msg-123" });

      expect(email.body).not.toContain("<html>");
      expect(email.body).not.toContain("<body>");
      expect(email.body).not.toContain("<p>");
      expect(email.body).toContain("HTML content");
    });

    it("should extract PDF attachment text", async () => {
      mockMessagesGet.mockResolvedValue(
        createMockMessageResponse({
          parts: [
            {
              mimeType: "text/plain",
              body: { data: Buffer.from("Email body").toString("base64") },
            },
            {
              mimeType: "application/pdf",
              body: { attachmentId: "att-123" },
            },
          ],
        })
      );

      mockAttachmentsGet.mockResolvedValue({
        data: { data: Buffer.from("PDF binary data").toString("base64") },
      });

      const email = await EmailParser.parse(mockGmail, { id: "msg-123" });

      expect(email.pdfText).toContain("Extracted PDF text");
    });

    it("should handle missing headers gracefully", async () => {
      mockMessagesGet.mockResolvedValue({
        data: {
          id: "msg-123",
          payload: {
            headers: [],
            body: { data: Buffer.from("Body").toString("base64") },
          },
        },
      });

      const email = await EmailParser.parse(mockGmail, { id: "msg-123" });

      expect(email.subject).toBe("");
      expect(email.from).toBe("");
      expect(email.date).toBe("");
    });

    it("should handle missing payload.headers gracefully", async () => {
      mockMessagesGet.mockResolvedValue({
        data: {
          id: "msg-123",
          payload: {
            body: { data: Buffer.from("Body").toString("base64") },
          },
        },
      });

      const email = await EmailParser.parse(mockGmail, { id: "msg-123" });

      expect(email.subject).toBe("");
      expect(email.from).toBe("");
      expect(email.date).toBe("");
    });

    it("should handle PDF extraction errors gracefully", async () => {
      mockMessagesGet.mockResolvedValue(
        createMockMessageResponse({
          parts: [
            {
              mimeType: "application/pdf",
              body: { attachmentId: "att-123" },
            },
          ],
        })
      );

      mockAttachmentsGet.mockRejectedValue(new Error("Attachment not found"));

      const email = await EmailParser.parse(mockGmail, { id: "msg-123" });

      // Should not throw, just have empty pdfText
      expect(email.pdfText).toBe("");
    });

    it("should handle multiple PDF attachments", async () => {
      mockMessagesGet.mockResolvedValue(
        createMockMessageResponse({
          parts: [
            {
              mimeType: "application/pdf",
              body: { attachmentId: "att-1" },
            },
            {
              mimeType: "application/pdf",
              body: { attachmentId: "att-2" },
            },
          ],
        })
      );

      mockAttachmentsGet.mockResolvedValue({
        data: { data: Buffer.from("PDF data").toString("base64") },
      });

      const email = await EmailParser.parse(mockGmail, { id: "msg-123" });

      // Should have extracted text from both PDFs
      expect(mockAttachmentsGet).toHaveBeenCalledTimes(2);
    });

    it("should call Gmail API with correct parameters", async () => {
      mockMessagesGet.mockResolvedValue(
        createMockMessageResponse({
          bodyData: "Test",
        })
      );

      await EmailParser.parse(mockGmail, { id: "test-msg-id" });

      expect(mockMessagesGet).toHaveBeenCalledWith({
        userId: "me",
        id: "test-msg-id",
        format: "full",
      });
    });

    it("should handle empty body data", async () => {
      mockMessagesGet.mockResolvedValue({
        data: {
          id: "msg-123",
          payload: {
            headers: [{ name: "Subject", value: "Test" }],
          },
        },
      });

      const email = await EmailParser.parse(mockGmail, { id: "msg-123" });

      expect(email.body).toBe("");
    });

    it("should skip PDF parts without attachmentId", async () => {
      mockMessagesGet.mockResolvedValue(
        createMockMessageResponse({
          parts: [
            {
              mimeType: "application/pdf",
              body: {}, // No attachmentId
            },
          ],
        })
      );

      const email = await EmailParser.parse(mockGmail, { id: "msg-123" });

      expect(mockAttachmentsGet).not.toHaveBeenCalled();
      expect(email.pdfText).toBe("");
    });
  });
});
