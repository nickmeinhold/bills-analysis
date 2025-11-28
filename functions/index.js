const functions = require("firebase-functions");
const sendBillReminders = require("./sendBillReminders");

exports.sendBillReminders = functions.https.onRequest(sendBillReminders);
