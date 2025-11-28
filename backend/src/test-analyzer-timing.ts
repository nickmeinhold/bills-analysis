import dotenv from "dotenv";
import { BillAnalyzer } from "./BillAnalyzer";
import { Email } from "./Email";

// Load environment variables
dotenv.config();

async function testAnalyzerTiming() {
  // Create a test email with typical bill content
  const testEmail = new Email({
    id: "test-123",
    subject: "Your Electric Bill is Ready",
    from: "billing@powercorp.com",
    date: "2025-11-20",
    body: `
Dear Customer,

Your electricity bill for November 2025 is now available.

Account Summary:
- Account Number: 1234567890
- Billing Period: Nov 1 - Nov 30, 2025
- Amount Due: $156.78
- Due Date: December 15, 2025

Please ensure payment is received by the due date to avoid late fees.

Thank you for choosing PowerCorp Electric.
    `,
    pdfText: ""
  });

  console.log("Starting BillAnalyzer timing test...\n");
  console.log("Test Email:");
  console.log(`  From: ${testEmail.from}`);
  console.log(`  Subject: ${testEmail.subject}`);
  console.log(`  Date: ${testEmail.date}\n`);

  const analyzer = new BillAnalyzer();

  // Time the analyze function
  const startTime = performance.now();
  const result = await analyzer.analyze(testEmail);
  const endTime = performance.now();

  const duration = endTime - startTime;

  console.log("Analysis Result:");
  console.log(JSON.stringify(result, null, 2));
  console.log(`\n⏱️  Execution Time: ${duration.toFixed(2)}ms (${(duration / 1000).toFixed(3)}s)`);
}

testAnalyzerTiming().catch(console.error);