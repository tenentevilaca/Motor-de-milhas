const axios = require('axios');

// WhatsApp alerts via Twilio's WhatsApp API (has a free sandbox for testing:
// https://www.twilio.com/docs/whatsapp/sandbox). Requires a Twilio account
// (paid in production, free trial credit to start) plus:
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM (e.g. "whatsapp:+14155238886")
function enabled() {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_FROM);
}

async function sendWhatsAppAlert({ to, message }) {
  if (!enabled()) {
    return {
      status: 'not_configured',
      message: 'Configure TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN e TWILIO_WHATSAPP_FROM no .env para ativar alertas via WhatsApp.',
    };
  }

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;

  await axios.post(
    url,
    new URLSearchParams({
      From: process.env.TWILIO_WHATSAPP_FROM,
      To: `whatsapp:${to}`,
      Body: message,
    }),
    { auth: { username: sid, password: process.env.TWILIO_AUTH_TOKEN } }
  );

  return { status: 'sent' };
}

module.exports = { enabled, sendWhatsAppAlert };
