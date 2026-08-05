const axios = require('axios');
const config = require('../config');

// Duas formas de mandar WhatsApp, da mais simples pra mais robusta:
//
// 1) CallMeBot (recomendado pra começar): serviço gratuito de terceiros,
//    sem cadastro em site nenhum. Você manda uma mensagem pelo seu próprio
//    WhatsApp pro número deles pra ativar, recebe uma API key de volta, e
//    pronto. Documentação: https://www.callmebot.com/blog/free-api-whatsapp-messages/
//    Limitação: é um serviço comunitário/não-oficial, pensado pra uso
//    pessoal (você mesmo recebendo os alertas) — não é algo pra produção
//    com múltiplos usuários.
//
// 2) Twilio (mais robusto, exige cadastro completo com verificação de
//    telefone/cartão e, no modo sandbox, reconfirmar o opt-in a cada 72h).
//    Ativa automaticamente se CallMeBot não estiver configurado.
function callMeBotEnabled() {
  return Boolean(config.get('CALLMEBOT_API_KEY'));
}

function twilioEnabled() {
  return Boolean(config.get('TWILIO_ACCOUNT_SID') && config.get('TWILIO_AUTH_TOKEN') && config.get('TWILIO_WHATSAPP_FROM'));
}

function enabled() {
  return callMeBotEnabled() || twilioEnabled();
}

async function sendViaCallMeBot({ to, message }) {
  // Sem timeout, uma falha no CallMeBot trava a promise indefinidamente —
  // isso roda dentro de runSearch() antes da resposta ser enviada, então
  // travaria a busca inteira (mesmo bug corrigido nos providers de preço).
  const response = await axios.get('https://api.callmebot.com/whatsapp.php', {
    params: {
      phone: to.replace(/[^\d+]/g, ''),
      text: message,
      apikey: config.get('CALLMEBOT_API_KEY'),
    },
    timeout: 15000,
  });
  // CallMeBot responde HTTP 200 mesmo quando a apikey/telefone estão errados
  // ou o número nunca fez o opt-in — o erro só aparece no texto da resposta
  // (ex: "API Key is invalid", "The phone number is not registered..."). Sem
  // checar isso, o app reportava "enviado" mesmo quando nada chegava.
  const body = String(response.data || '');
  if (!/message queued/i.test(body)) {
    throw new Error(`CallMeBot não confirmou o envio: ${body.slice(0, 200) || 'resposta vazia'}`);
  }
  return { status: 'sent', method: 'callmebot' };
}

async function sendViaTwilio({ to, message }) {
  const sid = config.get('TWILIO_ACCOUNT_SID');
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  await axios.post(
    url,
    new URLSearchParams({
      From: config.get('TWILIO_WHATSAPP_FROM'),
      To: `whatsapp:${to}`,
      Body: message,
    }),
    { auth: { username: sid, password: config.get('TWILIO_AUTH_TOKEN') }, timeout: 15000 }
  );
  return { status: 'sent', method: 'twilio' };
}

async function sendWhatsAppAlert({ to, message }) {
  if (callMeBotEnabled()) {
    try {
      return await sendViaCallMeBot({ to, message });
    } catch (err) {
      // Se o Twilio também estiver configurado, tenta por ele antes de
      // desistir — assim o usuário não precisa remover uma chave pra testar
      // a outra manualmente toda vez que o CallMeBot falhar.
      if (twilioEnabled()) return sendViaTwilio({ to, message });
      throw err;
    }
  }
  if (twilioEnabled()) return sendViaTwilio({ to, message });
  return {
    status: 'not_configured',
    message: 'Configure o CallMeBot (mais simples) ou o Twilio na tela de Configurações para ativar alertas via WhatsApp.',
  };
}

module.exports = { enabled, callMeBotEnabled, twilioEnabled, sendWhatsAppAlert };
