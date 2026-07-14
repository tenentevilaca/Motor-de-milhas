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

function findMatchesForSearch(search, posts) {
  const originAirport = getAirportByIata(search.origin);
  const destAirport = getAirportByIata(search.destination);
  return posts.filter(
    (post) => (destAirport && postMatchesPlace(post, destAirport)) || (originAirport && postMatchesPlace(post, originAirport))
  );
}

async function notifySearchOfMatches(search, matches) {
  if (matches.length === 0) return;
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
    const matches = findMatchesForSearch(search, newPosts);
    if (matches.length === 0) continue;
    await notifySearchOfMatches(search, matches);
    alertsSent.push({ searchId: search.id, matchCount: matches.length });
  }

  db.markDealLinksSeen(newPosts.map((p) => p.link));

  return { checkedAt: new Date().toISOString(), postsFound: posts.length, newPosts: newPosts.length, alertsSent };
}

// Checagem sob demanda pra UMA busca (usada pelo botão "Rodar agora"), pra
// mostrar na hora o que os blogs de promoção têm sobre essa rota — mesmo
// que nenhuma API de preço esteja configurada. Mostra TODOS os posts que
// batem com a rota (não só os "novos"), mas só dispara notificação e marca
// como visto pra quem realmente ainda não tinha sido alertado — clicar
// várias vezes não manda o mesmo alerta de novo.
async function checkDealFeedsForSearch(search) {
  const posts = await fetchAllPosts();
  const matches = findMatchesForSearch(search, posts);

  const seen = new Set(db.getSeenDealLinks());
  const newMatches = matches.filter((p) => p.link && !seen.has(p.link));
  if (newMatches.length > 0) {
    await notifySearchOfMatches(search, newMatches);
    db.markDealLinksSeen(newMatches.map((p) => p.link));
  }

  return { matches, newMatchCount: newMatches.length };
}

module.exports = { checkDealFeedsForAllSearches, checkDealFeedsForSearch };
