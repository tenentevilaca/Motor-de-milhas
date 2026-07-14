const db = require('../db');
const { fetchAllPosts, postMatchesPlace } = require('../dealFeeds');
const { getAirportByIata } = require('../airports');
const { sendEmailAlert } = require('../notify/email');
const { sendWhatsAppAlert } = require('../notify/whatsapp');
const { sendTelegramAlert } = require('../notify/telegram');

function buildEmailHtml(search, posts) {
  const rows = posts
    .map((p) => `<li><a href="${p.link}">${p.title}</a> — ${p.source}${p.publishedAt ? ` (${new Date(p.publishedAt).toLocaleDateString('pt-BR')})` : ''}</li>`)
    .join('');
  return `
    <h2>Motor de Milhas — Promoção encontrada para ${search.origin} → ${search.destination}</h2>
    <p>Post(s) publicado(s) em blogs de promoção mencionando essa rota:</p>
    <ul>${rows}</ul>
    <p style="color:#666">Confira os detalhes e condições diretamente no link antes de comprar.</p>
  `;
}

async function checkDealFeedsForAllSearches() {
  const searches = db.listSearches().filter((s) => s.active);

  // Sem nenhuma busca ativa não tem quem alertar — pula a leitura dos feeds
  // pra não gerar tráfego à toa nos blogs (e economizar o ciclo do agendador).
  if (searches.length === 0) {
    return { checkedAt: new Date().toISOString(), postsFound: 0, newPosts: 0, alertsSent: [], skipped: true };
  }

  const posts = await fetchAllPosts();
  const seen = new Set(db.getSeenDealLinks());
  const newPosts = posts.filter((p) => p.link && !seen.has(p.link));

  const alertsSent = [];

  for (const search of searches) {
    const originAirport = getAirportByIata(search.origin);
    const destAirport = getAirportByIata(search.destination);
    const matches = newPosts.filter(
      (post) => (destAirport && postMatchesPlace(post, destAirport)) || (originAirport && postMatchesPlace(post, originAirport))
    );
    if (matches.length === 0) continue;

    if (search.email) {
      await sendEmailAlert({
        to: search.email,
        subject: `📰 Promoção encontrada em blog: ${search.origin} → ${search.destination}`,
        html: buildEmailHtml(search, matches),
      });
    }
    const text = matches.map((p) => `${p.title} (${p.source}): ${p.link}`).join('\n');
    if (search.whatsapp) {
      await sendWhatsAppAlert({
        to: search.whatsapp,
        message: `Motor de Milhas — promoção para ${search.origin}->${search.destination}:\n${text}`,
      });
    }
    if (search.telegramChatId) {
      await sendTelegramAlert({
        chatId: search.telegramChatId,
        message: `Motor de Milhas — promoção para ${search.origin}->${search.destination}:\n${text}`,
      });
    }
    alertsSent.push({ searchId: search.id, matchCount: matches.length });
  }

  db.markDealLinksSeen(newPosts.map((p) => p.link));

  return { checkedAt: new Date().toISOString(), postsFound: posts.length, newPosts: newPosts.length, alertsSent };
}

module.exports = { checkDealFeedsForAllSearches };
