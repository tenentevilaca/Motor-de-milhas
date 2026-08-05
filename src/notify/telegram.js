const axios = require('axios');
const config = require('../config');

// Telegram Bot API: provavelmente o canal mais fácil e gratuito que existe.
// Setup (uns 2 minutos, tudo pelo próprio Telegram, sem verificação de
// telefone/cartão):
//   1. Fale com @BotFather no Telegram, mande /newbot, escolha um nome —
//      ele te devolve um token (TELEGRAM_BOT_TOKEN).
//   2. Procure o bot que você criou pelo username e mande qualquer mensagem
//      (ex: /start) — isso "libera" o bot pra falar com você.
//   3. Use getRecentChats() (exposto em GET /api/notify/telegram/chats) pra
//      descobrir o chat_id sem precisar montar a URL manualmente.
function enabled() {
  return Boolean(config.get('TELEGRAM_BOT_TOKEN'));
}

function apiUrl(method) {
  return `https://api.telegram.org/bot${config.get('TELEGRAM_BOT_TOKEN')}/${method}`;
}

async function sendTelegramAlert({ chatId, message }) {
  if (!enabled()) {
    return { status: 'not_configured', message: 'Configure TELEGRAM_BOT_TOKEN na tela de Configurações para ativar alertas via Telegram.' };
  }
  // Sem timeout, uma falha na API do Telegram trava a promise indefinidamente
  // — como isso roda dentro de runSearch() antes da resposta ser enviada,
  // travaria a busca inteira (mesmo bug já visto e corrigido nos providers
  // de preço: sem timeout, o proxy do host derruba a conexão sem resposta
  // HTTP, e o navegador mostra isso como "NetworkError" genérico).
  await axios.post(apiUrl('sendMessage'), { chat_id: chatId, text: message }, { timeout: 15000 });
  return { status: 'sent' };
}

// Lista conversas recentes com o bot, pra achar o chat_id sem montar URL na
// mão. Só enxerga chats que já mandaram alguma mensagem pro bot (por isso o
// passo 2 do setup é necessário).
async function getRecentChats() {
  if (!enabled()) return [];
  const { data } = await axios.get(apiUrl('getUpdates'), { params: { limit: 20 }, timeout: 15000 });
  const seen = new Map();
  for (const update of data.result || []) {
    const chat = update.message?.chat || update.my_chat_member?.chat;
    if (!chat) continue;
    const name = chat.title || [chat.first_name, chat.last_name].filter(Boolean).join(' ') || chat.username || String(chat.id);
    seen.set(chat.id, name);
  }
  return Array.from(seen.entries()).map(([id, name]) => ({ chatId: id, name }));
}

module.exports = { enabled, sendTelegramAlert, getRecentChats };
