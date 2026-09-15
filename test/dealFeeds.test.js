require('./helpers/setup');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Parser = require('rss-parser');
const dealFeeds = require('../src/dealFeeds');
const config = require('../src/config');
const { findMatchesForSearch } = require('../src/search/checkDealFeeds');

function post(title, summary = '') {
  return { title, summary, link: `https://blog.com/${Math.random()}`, source: 'stub' };
}

function withMockedParseURL(itemsByUrl, fn) {
  const original = Parser.prototype.parseURL;
  Parser.prototype.parseURL = async function (url) {
    const items = itemsByUrl[url];
    if (items === 'REJECT') throw new Error('Status code 403');
    return { items: items || [] };
  };
  return fn().finally(() => {
    Parser.prototype.parseURL = original;
  });
}

test('getFeeds: sem DEAL_FEED_URLS configurado, usa os 3 feeds padrão', () => {
  config.clearKey('DEAL_FEED_URLS');
  const feeds = dealFeeds.getFeeds();
  assert.deepEqual(feeds, dealFeeds.DEFAULT_FEEDS);
  assert.equal(feeds.length, 3);
});

test('getFeeds: com DEAL_FEED_URLS configurado (uma URL por linha), substitui a lista padrão', () => {
  config.setMany({ DEAL_FEED_URLS: 'https://exemplo.com/feed\nhttps://outro.com/rss' });
  try {
    const feeds = dealFeeds.getFeeds();
    assert.equal(feeds.length, 2);
    assert.equal(feeds[0].url, 'https://exemplo.com/feed');
    assert.equal(feeds[0].name, 'exemplo.com');
  } finally {
    config.clearKey('DEAL_FEED_URLS');
  }
});

test('fetchAllPosts: parseia itens de todos os feeds configurados', async () => {
  config.setMany({ DEAL_FEED_URLS: 'https://a.com/feed\nhttps://b.com/feed' });
  try {
    await withMockedParseURL(
      {
        'https://a.com/feed': [{ title: 'Promoção GRU-LIS', link: 'https://a.com/1', contentSnippet: 'resumo', isoDate: '2026-09-01' }],
        'https://b.com/feed': [{ title: 'Outra promoção', link: 'https://b.com/1' }],
      },
      async () => {
        const posts = await dealFeeds.fetchAllPosts();
        assert.equal(posts.length, 2);
        assert.equal(posts[0].source, 'a.com');
        assert.equal(posts[0].title, 'Promoção GRU-LIS');
      }
    );
  } finally {
    config.clearKey('DEAL_FEED_URLS');
  }
});

// Achado real (log de produção): um feed fora do ar não pode derrubar os
// outros — Promise.allSettled já garante isso, mas sem teste isso podia
// regredir silenciosamente se alguém trocasse por Promise.all no futuro.
test('fetchAllPosts: um feed falhando não impede os outros de retornar posts', async () => {
  config.setMany({ DEAL_FEED_URLS: 'https://funciona.com/feed\nhttps://fora-do-ar.com/feed' });
  const originalError = console.error;
  const errorLines = [];
  console.error = (...args) => errorLines.push(args.join(' '));
  try {
    await withMockedParseURL(
      {
        'https://funciona.com/feed': [{ title: 'Post normal', link: 'https://funciona.com/1' }],
        'https://fora-do-ar.com/feed': 'REJECT',
      },
      async () => {
        const posts = await dealFeeds.fetchAllPosts();
        assert.equal(posts.length, 1);
        assert.equal(posts[0].source, 'funciona.com');
      }
    );
    assert.ok(errorLines.some((l) => l.includes('[dealFeeds]') && l.includes('fora-do-ar.com')));
  } finally {
    console.error = originalError;
    config.clearKey('DEAL_FEED_URLS');
  }
});

test('postMatchesPlace: ignora acento e caixa (ex: "São Paulo" bate com "sao paulo" no texto do post)', () => {
  const post = { title: 'Promoção pra São Paulo com desconto', summary: '' };
  assert.equal(dealFeeds.postMatchesPlace(post, { city: 'Sao Paulo', country: 'Brazil' }), true);
});

test('postMatchesPlace: não bate quando nem cidade nem país aparecem no post', () => {
  const post = { title: 'Promoção qualquer', summary: 'nada a ver' };
  assert.equal(dealFeeds.postMatchesPlace(post, { city: 'Lisboa', country: 'Portugal' }), false);
});

// Achado real (revisão do item D): a base de aeroportos (OpenFlights) só
// tem o nome da cidade em inglês ("Lisbon", "London", "New York") — um post
// de blog em português ("promoção pra Lisboa") nunca batia com uma busca
// de destino LIS, porque "lisboa" não aparece dentro de "lisbon". Corrigido
// reaproveitando o mapa de aliases (cityAliases.js) já usado na busca de
// aeroporto.
test('postMatchesPlace: post em português bate com cidade cujo nome na base está em inglês (Lisboa/Lisbon, Londres/London, Nova York/New York)', () => {
  assert.equal(dealFeeds.postMatchesPlace({ title: 'Promoção pra Lisboa', summary: '' }, { city: 'Lisbon', country: 'Portugal' }), true);
  assert.equal(dealFeeds.postMatchesPlace({ title: 'Passagem pra Londres em conta', summary: '' }, { city: 'London', country: 'United Kingdom' }), true);
  assert.equal(dealFeeds.postMatchesPlace({ title: 'Vai pra Nova York com milhas', summary: '' }, { city: 'New York', country: 'United States' }), true);
});

test('postMatchesPlace: cidade sem alias em português continua funcionando pelo nome em inglês (regressão)', () => {
  assert.equal(dealFeeds.postMatchesPlace({ title: 'Promoção pra Miami', summary: '' }, { city: 'Miami', country: 'United States' }), true);
});

// Falso positivo real reportado: o resumo do RSS às vezes traz texto
// agregado/recomendação de outras matérias — um post sobre Belo Horizonte
// "batia" com uma busca pra Cancún só porque o resumo mencionava Cancún de
// passagem (junto de outras cidades/assuntos sem relação). Match de
// aeroporto de destino passou a usar só o título.
test('não usa menção solta no resumo RSS para relacionar post à rota', () => {
  const matches = findMatchesForSearch(
    { origin: 'GRU', destination: 'CUN' },
    [post('Passagens promocionais para Belo Horizonte', 'Veja também dicas e ofertas para Cancun.')]
  );

  assert.equal(matches.length, 0);
});

test('promoção cujo título menciona Cancun continua relacionada', () => {
  const matches = findMatchesForSearch(
    { origin: 'GRU', destination: 'CUN' },
    [post('Passagens promocionais para Cancun')]
  );

  assert.equal(matches.length, 1);
});

// Conjunto de testes pedido explicitamente pelo usuário após o falso
// positivo em produção (GRU->CUN mostrando posts sobre Belo Horizonte,
// Madrid, ANAC, iPhone, salas VIP). Cobre título/resumo, origem sem
// destino, palavra dentro de outra palavra, e busca por região.
test('menção ao destino somente no resumo (não no título) não relaciona o post', () => {
  const matches = findMatchesForSearch(
    { origin: 'GRU', destination: 'CUN' },
    [post('10 dicas de bagagem de mão', 'Confira também nossa cobertura sobre Cancún e outras praias.')]
  );
  assert.equal(matches.length, 0);
});

test('destino no título relaciona o post (cidade, país ou código IATA)', () => {
  assert.equal(findMatchesForSearch({ origin: 'GRU', destination: 'CUN' }, [post('Passagem pra Cancún em conta')]).length, 1);
  assert.equal(findMatchesForSearch({ origin: 'GRU', destination: 'CUN' }, [post('Promoção pra México, saindo de vários lugares')]).length, 1);
  assert.equal(findMatchesForSearch({ origin: 'GRU', destination: 'CUN' }, [post('Passagens CUN a partir de R$1.200')]).length, 1);
});

// Achado real: a checagem de match também considerava a ORIGEM da busca
// (não só o destino), sem passar pelo mesmo filtro — um post sobre ANAC,
// salas VIP ou iPhone que citasse "São Paulo" de passagem "batia" com
// QUALQUER busca saindo de GRU/CGH, não importa o destino. A origem não
// entra mais como critério de match — só o destino define a relação.
test('origem no título, sem destino, não relaciona o post', () => {
  const matches = findMatchesForSearch(
    { origin: 'GRU', destination: 'CUN' },
    [post('ANAC libera novas regras de bagagem para voos saindo de São Paulo')]
  );
  assert.equal(matches.length, 0);
});

test('cidade dentro de outra palavra não relaciona (comparação por palavra inteira)', () => {
  // "Cubatão" contém "cuba" como substring, mas não é a cidade "Cuba" —
  // sem \b isso "bateria" incorretamente com destino Havana/Cuba.
  const matches = findMatchesForSearch(
    { origin: 'GRU', destination: 'HAV' },
    [post('Roteiro de fim de semana em Cubatão, litoral de São Paulo')]
  );
  assert.equal(matches.length, 0);
});

test('busca por região continua funcionando de forma coerente (só título, qualquer país do continente)', () => {
  const regionMatches = findMatchesForSearch(
    { origin: 'GRU', destination: 'REGION:EU' },
    [
      post('Roteiro de 10 dias por Portugal'),
      post('Dicas de bagagem de mão'),
      post('Fique de olho: essa cobertura vai te surpreender', 'Título genérico, resumo cita Portugal de passagem'),
    ]
  );
  // Só o 1º: título menciona um país europeu de verdade (região casa por
  // país, não por cidade — mesmo critério de antes desta correção). O 2º
  // não menciona nenhum país europeu. O 3º só cita Portugal no resumo, não
  // no título — não deve contar (mesma regra title-only).
  assert.equal(regionMatches.length, 1);
  assert.equal(regionMatches[0].title, 'Roteiro de 10 dias por Portugal');
});
