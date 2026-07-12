const axios = require('axios');
const config = require('../config');

// WhatsApp alerts via Twilio's WhatsApp API (has a free sandbox for testing:
// https://www.twilio.com/docs/whatsapp/sandbox). Requires a Twilio account
// (free trial credit to start, paid after) plus Account SID, Auth Token and
// a WhatsApp-enabled "From" number (sandbox or your own).
function enabled() {
  return Boolean(config.get('TWILIO_ACCOUNT_SID') && config.get('TWILIO_AUTH_TOKEN') && config.get('TWILIO_WHATSAPP_FROM'));
}

async function sendWhatsAppAlert({ to, message }) {
  if (!enabled()) {
    return {
      status: 'not_configured',
      message: 'Configure as credenciais do Twilio na tela de Configurações para ativar alertas via WhatsApp.',
    };
  }

  const sid = config.get('TWILIO_ACCOUNT_SID');
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;

  await axios.post(
    url,
    new URLSearchParams({
      From: config.get('TWILIO_WHATSAPP_FROM'),
      To: `whatsapp:${to}`,
      Body: message,
    }),
    { auth: { username: sid, password: config.get('TWILIO_AUTH_TOKEN') } }
  );

  return { status: 'sent' };
}

module.exports = { enabled, sendWhatsAppAlert };
