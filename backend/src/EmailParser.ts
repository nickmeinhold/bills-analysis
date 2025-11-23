import { PDFParse } from "pdf-parse";
import { Email } from "./Email";

export class EmailParser {
  static async parse(gmail: any, msg: any): Promise<Email> {
    const msgRes = await gmail.users.messages.get({
      userId: "me",
      id: msg.id,
      format: "full",
    });
    const headers = msgRes.data.payload?.headers || [];
    const subject = headers.find((h: any) => h.name === "Subject")?.value || "";
    const from = headers.find((h: any) => h.name === "From")?.value || "";
    const date = headers.find((h: any) => h.name === "Date")?.value || "";
    // Get body text
    let body = "";
    if (msgRes.data.payload?.body?.data) {
      body = Buffer.from(msgRes.data.payload.body.data, "base64").toString();
    } else if (msgRes.data.payload?.parts) {
      const textPart = msgRes.data.payload.parts.find((p: any) => p.mimeType === "text/plain");
      if (textPart?.body?.data) {
        body = Buffer.from(textPart.body.data, "base64").toString();
      }
      if (!body) {
        const htmlPart = msgRes.data.payload.parts.find((p: any) => p.mimeType === "text/html");
        if (htmlPart?.body?.data) {
          body = Buffer.from(htmlPart.body.data, "base64").toString();
          body = body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
        }
      }
    }
    // Extract PDF attachments
    let pdfText = "";
    if (msgRes.data.payload?.parts) {
      for (const part of msgRes.data.payload.parts) {
        if (part.mimeType === "application/pdf" && part.body?.attachmentId) {
          try {
            const attachment = await gmail.users.messages.attachments.get({
              userId: "me",
              messageId: msg.id,
              id: part.body.attachmentId,
            });
            if (attachment.data.data) {
              const pdfBuffer = Buffer.from(attachment.data.data, "base64");
              const parser = new PDFParse({ data: new Uint8Array(pdfBuffer) });
              const textResult = await parser.getText({ first: 3 });
              const text = textResult.text;
              pdfText += "\n\n" + text;
            }
          } catch (pdfErr) {
            console.error("Error extracting PDF:", pdfErr);
          }
        }
      }
    }
    return new Email({ id: msg.id, subject, from, date, body, pdfText });
  }
}
