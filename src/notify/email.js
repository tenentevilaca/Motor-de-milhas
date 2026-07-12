const nodemailer = require('nodemailer');

// Generic SMTP sender. Works with any provider via env vars, so you're not
// locked into one vendor. Easiest free options to get started:
//   - Brevo (ex-Sendinblue): 300 e-mails/dia grátis, SMTP simples de configurar
//   - Resend: 3.000 e-mails/mês grátis, API/SMTP simples
//   - Gmail: smtp.gmail.com + "senha de app" (2FA precisa estar ativo)
let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST) return null;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
  return transporter;
}

function enabled() {
  return Boolean(process.env.SMTP_HOST);
}

async function sendEmailAlert({ to, subject, html }) {
  const t = getTransporter();
  if (!t) {
    return { status: 'not_configured', message: 'Configure SMTP_HOST/SMTP_USER/SMTP_PASS/FROM_EMAIL no .env para ativar alertas por e-mail.' };
  }
  await t.sendMail({
    from: process.env.FROM_EMAIL || process.env.SMTP_USER,
    to,
    subject,
    html,
  });
  return { status: 'sent' };
}

module.exports = { enabled, sendEmailAlert };
