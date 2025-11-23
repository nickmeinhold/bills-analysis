import { Email } from "./Email";

export class BillAnalyzer {
  llm: any;
  constructor(llm: any) {
    this.llm = llm;
  }
  async analyze(email: Email): Promise<any> {
    const prompt = `You are a bill analyzer. Extract bill information from this email.\n\nEMAIL DETAILS:\nFrom: ${email.from}\nSubject: ${email.subject}\nEmail Date: ${email.date}\n\nCONTENT (includes email body and any PDF attachments):\n${email.fullContent}\n\nINSTRUCTIONS:\n1. Look for due dates in formats like: "Due Date: MM/DD/YYYY", "Payment Due: Month DD", "Due by DD/MM/YYYY", etc.\n2. Look for amounts with dollar signs, "Amount Due", "Total", "Balance", etc.\n3. Identify the company/service provider\n4. Determine the bill type based on content (electricity, internet, phone, insurance, subscription, etc.)\n5. If you see words like "paid", "payment received", "thank you for your payment", set status to "paid"\n\nReturn ONLY valid JSON with this exact structure (no markdown, no explanation):\n{\n  "isBill": true/false,\n  "company": "company name or null",\n  "amount": number or null,\n  "currency": "AUD/USD/etc or null",\n  "dueDate": "YYYY-MM-DD or null",\n  "billType": "electricity/internet/phone/insurance/subscription/other/null",\n  "status": "paid/unpaid/unknown",\n  "confidence": 0-100\n}`;
    const aiResponse = await this.llm.invoke(prompt);
    const content = aiResponse.content as string;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return null;
  }
}
