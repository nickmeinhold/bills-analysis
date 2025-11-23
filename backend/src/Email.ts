export class Email {
  id: string;
  subject: string;
  from: string;
  date: string;
  body: string;
  pdfText: string;
  constructor({ id, subject, from, date, body, pdfText }: {
    id: string;
    subject: string;
    from: string;
    date: string;
    body: string;
    pdfText: string;
  }) {
    this.id = id;
    this.subject = subject;
    this.from = from;
    this.date = date;
    this.body = body;
    this.pdfText = pdfText;
  }
  get fullContent() {
    return (this.body + this.pdfText).substring(0, 5000);
  }
}
