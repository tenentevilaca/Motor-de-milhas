const Parser = require('rss-parser');
const config = require('./config');

// Monitora RSS de blogs de promoção/milhas (Melhores Destinos, Passageiro de
// Primeira, Mestre das Milhas etc). Diferente dos sites das companhias,
// blogs publicam RSS justamente para consumo automatizado — sem proteção
// antibot, sem Termos contra isso. É onde promoções relâmpago, erro de
// tarifa e bônus de transferência de pontos costumam aparecer primeiro.
const DEFAULT_FEEDS = [
  { name: 'Melhores Destinos', url: 'https://www.melhoresdestinos.com.br/feed' },
  { name: 'Passageiro de Primeira', url: 'https://passageirodeprimeira.com/feed' },
  { name: 'Mestre das Milhas', url: 'https://www.mestredasmilhas.com/feed' },
  // "Flip Milhas" removido: /feed devolve 404 há tempos (confirmado em log
  // de produção, não é falha passageira) — o site deve ter mudado de
  // estrutura ou saído do ar. Mantê-lo só gerava ruído no log a cada 10min
  // sem nenhum post a mais.
];

const parser = new Parser({ timeout: 10000 });

function getFeeds() {
  const custom = config.get('DEAL_FEED_URLS');
  if (!custom) return DEFAULT_FEEDS;
  return custom
    .split(/[\n,]/)
    .map((url) => url.trim())
    .filter(Boolean)
    .map((url) => ({ name: new URL(url).hostname, url }));
}

async function fetchAllPosts() {
  const feeds = getFeeds();
  const results = await Promise.allSettled(feeds.map((f) => parser.parseURL(f.url)));

  const posts = [];
  results.forEach((result, i) => {
    if (result.status !== 'fulfilled') {
      console.error(`[dealFeeds] falha ao ler ${feeds[i].name}: ${result.reason?.message}`);
      return;
    }
    for (const item of result.value.items || []) {
      posts.push({
        source: feeds[i].name,
        title: item.title || '',
        link: item.link || '',
        summary: item.contentSnippet || item.summary || '',
        publishedAt: item.isoDate || item.pubDate || null,
      });
    }
  });
  return posts;
}

function normalize(str) {
  return String(str)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

// Um post "menciona" a busca se cidade OU país de origem/destino aparecem no
// título ou resumo. Heurística simples, mas suficiente pra filtrar o volume
// de posts que não têm nada a ver com a rota do usuário.
function postMatchesPlace(post, place) {
  const haystack = normalize(`${post.title} ${post.summary}`);
  return [place.city, place.country].some((term) => term && haystack.includes(normalize(term)));
}

module.exports = { fetchAllPosts, postMatchesPlace, getFeeds, DEFAULT_FEEDS };
