const nodemailer = require('nodemailer');

// Reads SMTP config from environment variables. Until these are set, emails
// are simply logged to the console instead of sent — the app keeps working,
// nothing crashes, and you can wire up a real SMTP account whenever ready.
//
// Example .env values for Gmail (needs an "App Password", not your normal password):
//   SMTP_HOST=smtp.gmail.com
//   SMTP_PORT=587
//   SMTP_USER=yourcollege@gmail.com
//   SMTP_PASS=your-16-char-app-password
//   SMTP_FROM="Placement Cell <yourcollege@gmail.com>"

let transporter = null;
if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

async function sendMail(to, subject, text) {
  if (!transporter) {
    console.log(`[mailer stub — SMTP not configured] To: ${to} | Subject: ${subject} | ${text}`);
    return { sent: false, stub: true };
  }
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      text,
    });
    return { sent: true };
  } catch (err) {
    console.error('Email send failed:', err.message);
    return { sent: false, error: err.message };
  }
}

module.exports = { sendMail };