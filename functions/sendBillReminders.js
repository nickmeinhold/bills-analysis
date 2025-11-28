const { Firestore } = require("@google-cloud/firestore");
const nodemailer = require("nodemailer");

const firestore = new Firestore();

// Configure email transporter (using Gmail SMTP)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD, // Use App Password, not regular password
  },
});

async function sendBillReminders(_req, res) {
  try {
    const now = new Date();
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    // Get all users
    const usersSnapshot = await firestore.collection("users").get();

    let remindersSent = 0;

    for (const userDoc of usersSnapshot.docs) {
      const uid = userDoc.id;

      // Get user's email from gmail_tokens or a users collection
      const tokenDoc = await firestore
        .collection("gmail_tokens")
        .doc(uid)
        .get();
      if (!tokenDoc.exists) continue;

      // Get user's unpaid bills due within 3 days
      const billsSnapshot = await firestore
        .collection("users")
        .doc(uid)
        .collection("bills")
        .where("status", "!=", "paid")
        .get();

      const dueSoonBills = billsSnapshot.docs
        .map((doc) => doc.data())
        .filter((bill) => {
          if (!bill.dueDate) return false;
          const dueDate = new Date(bill.dueDate);
          return dueDate >= now && dueDate <= threeDaysFromNow;
        });

      if (dueSoonBills.length === 0) continue;

      // Get user email (you'll need to store this during auth)
      const userProfile = await firestore
        .collection("user_profiles")
        .doc(uid)
        .get();
      if (!userProfile.exists || !userProfile.data().email) continue;

      const userEmail = userProfile.data().email;

      // Build email content
      const billList = dueSoonBills
        .map(
          (b) =>
            `• ${b.company || "Unknown"}: $${b.amount?.toFixed(2) || "?"} due ${
              b.dueDate
            }`
        )
        .join("\n");

      const totalDue = dueSoonBills.reduce(
        (sum, b) => sum + (b.amount || 0),
        0
      );

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: userEmail,
        subject: `💰 Bill Reminder: ${dueSoonBills.length} bill(s) due soon`,
        text: `Hi there!\n\nYou have ${
          dueSoonBills.length
        } bill(s) due in the next 3 days:\n\n${billList}\n\nTotal: $${totalDue.toFixed(
          2
        )}\n\nView your bills: https://gen-lang-client-0390109521.web.app\n\nCheers,\nBill Tracker`,
        html: `
          <h2>💰 Bills Due Soon</h2>
          <p>You have <strong>${
            dueSoonBills.length
          }</strong> bill(s) due in the next 3 days:</p>
          <ul>
            ${dueSoonBills
              .map(
                (b) =>
                  `<li><strong>${b.company || "Unknown"}</strong>: $$${
                    b.amount?.toFixed(2) || "?"
                  } due ${b.dueDate}</li>`
              )
              .join("")}
          </ul>
          <p><strong>Total: $${totalDue.toFixed(2)}</strong></p>
          <p><a href="https://gen-lang-client-0390109521.web.app">View your bills →</a></p>
        `,
      };

      await transporter.sendMail(mailOptions);
      remindersSent++;
      console.log(
        `Sent reminder to ${userEmail} for ${dueSoonBills.length} bills`
      );
    }

    res.json({ success: true, remindersSent });
  } catch (err) {
    console.error("Error sending reminders:", err);
    res.status(500).json({ error: String(err) });
  }
}

module.exports = sendBillReminders;
