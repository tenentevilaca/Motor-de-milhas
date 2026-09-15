const Parser = require('rss-parser');
const config = require('./config');
const cityAliases = require('./data/cityAliases');

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

// Achado real (revisão do item D): blogs de milhas escrevem em português
// ("Lisboa", "Londres", "Nova York"), mas a base de aeroportos (OpenFlights)
// só tem o nome em inglês ("Lisbon", "London", "New York") — sem isso, um
// post real dizendo "promoção pra Lisboa" nunca batia com uma busca de
// destino LIS, porque "lisboa" nunca aparece dentro do texto normalizado
// de "Lisbon". Reaproveita o mesmo mapa de aliases já usado na busca de
// aeroporto (cityAliases.js: português -> inglês), invertido aqui pra
// inglês -> lista de apelidos em português (mais de um alias pode apontar
// pro mesmo nome em inglês, ex: "moscou"/"moscovo" -> "Moscow").
const englishCityToPortugueseAliases = new Map();
for (const [alias, englishName] of Object.entries(cityAliases)) {
  const key = normalize(englishName);
  if (!englishCityToPortugueseAliases.has(key)) englishCityToPortugueseAliases.set(key, []);
  englishCityToPortugueseAliases.get(key).push(alias);
}

// Um post "menciona" a busca se cidade OU país de origem/destino aparecem no
// título ou resumo. Heurística simples, mas suficiente pra filtrar o volume
// de posts que não têm nada a ver com a rota do usuário.
function postMatchesPlace(post, place) {
  const haystack = normalize(`${post.title} ${post.summary}`);
  const terms = [place.city, place.country];
  if (place.city) terms.push(...(englishCityToPortugueseAliases.get(normalize(place.city)) || []));
  return terms.some((term) => term && haystack.includes(normalize(term)));
}

module.exports = { fetchAllPosts, postMatchesPlace, getFeeds, DEFAULT_FEEDS };
