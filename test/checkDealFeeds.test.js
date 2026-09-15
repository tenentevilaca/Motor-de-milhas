require('./helpers/setup');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Parser = require('rss-parser');
const db = require('../src/db');
const { checkDealFeedsForAllSearches, checkDealFeedsForSearch, findMatchesForAllActiveSearches } = require('../src/search/checkDealFeeds');

// A busca real consulta os 3 feeds padrão em paralelo (Promise.allSettled) —
// devolver os mesmos itens pra TODAS as URLs triplicaria o post (1 "post"
// por feed, mesmo link). Só o 1º feed de CADA rodada de fetchAllPosts()
// devolve os itens de teste (rodada = grupo de 3 chamadas, 1 por feed
// padrão), os outros voltam vazios — mais perto do cenário real de "achei
// isso em UM blog", e funciona mesmo quando o teste chama
// checkDealFeedsForSearch mais de uma vez seguida.
function withMockedParseURL(items, fn) {
  const original = Parser.prototype.parseURL;
  let callCount = 0;
  Parser.prototype.parseURL = async () => {
    const isFirstOfRound = callCount % 3 === 0;
    callCount += 1;
    return { items: isFirstOfRound ? items : [] };
  };
  return fn().finally(() => {
    Parser.prototype.parseURL = original;
  });
}

test('checkDealFeedsForAllSearches: sem nenhuma busca ativa, pula a leitura dos feeds (skipped: true)', async () => {
  const result = await checkDealFeedsForAllSearches();
  assert.equal(result.skipped, true);
  assert.equal(result.postsFound, 0);
});

test('checkDealFeedsForAllSearches: post que menciona o destino de uma busca ativa gera alerta', async () => {
  const search = db.createSearch({ origin: 'GRU', destination: 'LIS', departDate: '2027-06-01', programs: [] });
  await withMockedParseURL(
    [{ title: 'Promoção pra Lisboa com 50% off', link: `https://blog.com/${Date.now()}`, contentSnippet: 'aproveite' }],
    async () => {
      const result = await checkDealFeedsForAllSearches();
      assert.equal(result.alertsSent.length, 1);
      assert.equal(result.alertsSent[0].searchId, search.id);
    }
  );
});

// Achado real (o que motivou o pedido original): rodar a checagem 2x não
// pode mandar o MESMO alerta de novo pro mesmo post.
test('checkDealFeedsForAllSearches: o mesmo post não gera um segundo alerta numa checagem seguinte', async () => {
  const search = db.createSearch({ origin: 'GRU', destination: 'MAD', departDate: '2027-06-01', programs: [] });
  const link = `https://blog.com/madrid-${Date.now()}`;
  await withMockedParseURL([{ title: 'Erro de tarifa pra Madrid', link, contentSnippet: '' }], async () => {
    const first = await checkDealFeedsForAllSearches();
    assert.equal(first.alertsSent.length, 1);
    const second = await checkDealFeedsForAllSearches();
    assert.equal(second.alertsSent.length, 0, 'não deveria alertar de novo pro mesmo post já visto');
  });
  void search;
});

test('checkDealFeedsForSearch ("Rodar agora"): mostra TODOS os posts que batem, mesmo já vistos antes, mas só marca/alerta os novos', async () => {
  const search = db.createSearch({ origin: 'GRU', destination: 'CDG', departDate: '2027-06-01', programs: [] });
  const link = `https://blog.com/paris-${Date.now()}`;
  await withMockedParseURL([{ title: 'Promoção pra Paris', link, contentSnippet: '' }], async () => {
    const first = await checkDealFeedsForSearch(search);
    assert.equal(first.matches.length, 1);
    assert.equal(first.newMatchCount, 1);

    const second = await checkDealFeedsForSearch(search);
    assert.equal(second.matches.length, 1, 'o post continua aparecendo pro usuário mesmo já visto');
    assert.equal(second.newMatchCount, 0, 'mas não conta como "novo" de novo (não deveria re-notificar)');
  });
});

test('checkDealFeedsForSearch: busca por região (destino continente) bate com post sobre qualquer país daquele continente', async () => {
  const search = db.createSearch({ origin: 'GRU', destination: 'REGION:EU', departDate: '2027-06-01', programs: [] });
  await withMockedParseURL([{ title: 'Passagem baratíssima pra Portugal', link: `https://blog.com/pt-${Date.now()}`, contentSnippet: '' }], async () => {
    const result = await checkDealFeedsForSearch(search);
    assert.equal(result.matches.length, 1);
  });
});

test('findMatchesForAllActiveSearches: deduplica o mesmo post batendo com mais de uma busca ativa', async () => {
  db.createSearch({ origin: 'GRU', destination: 'BCN', departDate: '2027-06-01', programs: [] });
  db.createSearch({ origin: 'CGH', destination: 'BCN', departDate: '2027-06-01', programs: [] });
  const link = `https://blog.com/barcelona-${Date.now()}`;
  const posts = [{ title: 'Promoção pra Barcelona', link, contentSnippet: '' }];
  const matched = findMatchesForAllActiveSearches(posts);
  assert.equal(matched.length, 1, 'o mesmo post batendo com 2 buscas deveria aparecer só 1 vez');
});
