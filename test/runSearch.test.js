require('./helpers/setup');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const providers = require('../src/providers');
const { runSearch } = require('../src/search/runSearch');
const db = require('../src/db');
const { clearCache } = require('../src/cache');

function stubAllNotConfigured() {
  for (const id of ['CASH_TRAVELPAYOUTS', 'CASH_RAPIDAPI_GFLIGHTS', 'SMILES', 'AZUL', 'AA', 'LATAM']) {
    providers.ALL_PROVIDERS[id].search = async () => ({ status: 'not_configured', offers: [] });
  }
}

test('passageiros > 1 escala preço, milhas e taxas — não só o preço', async () => {
  clearCache();
  stubAllNotConfigured();
  providers.ALL_PROVIDERS.CASH_TRAVELPAYOUTS.search = async () => ({
    status: 'ok',
    offers: [{ program: 'CASH_TRAVELPAYOUTS', priceBRL: 1000, milesRequired: null, taxesBRL: null, stops: 0, isHiddenCity: false, deepLink: null, source: 'stub' }],
  });
  providers.ALL_PROVIDERS.SMILES.search = async () => ({
    status: 'ok',
    offers: [{ program: 'SMILES', priceBRL: null, milesRequired: 30000, taxesBRL: 45, stops: 0, isHiddenCity: false, deepLink: null, source: 'stub' }],
  });

  const search = db.createSearch({ origin: 'GRU', destination: 'MIA', departDate: '2026-11-10', programs: ['SMILES'], passengers: 3 });
  const result = await runSearch(search);

  const cash = result.allOffersSorted.find((o) => o.program === 'CASH_TRAVELPAYOUTS');
  const miles = result.allOffersSorted.find((o) => o.program === 'SMILES');

  assert.equal(cash.priceBRLTotal, 3000);
  assert.equal(miles.milesRequiredTotal, 90000);
  assert.equal(miles.taxesBRLTotal, 135);
  assert.equal(result.passengers, 3);
});

test('passageiros = 1 (padrão) não adiciona campos de total', async () => {
  clearCache();
  stubAllNotConfigured();
  providers.ALL_PROVIDERS.CASH_TRAVELPAYOUTS.search = async () => ({
    status: 'ok',
    offers: [{ program: 'CASH_TRAVELPAYOUTS', priceBRL: 1000, milesRequired: null, taxesBRL: null, stops: 0, isHiddenCity: false, deepLink: null, source: 'stub' }],
  });

  const search = db.createSearch({ origin: 'GRU', destination: 'MIA', departDate: '2026-11-11', programs: [] });
  const result = await runSearch(search);
  const cash = result.allOffersSorted.find((o) => o.program === 'CASH_TRAVELPAYOUTS');
  assert.equal(cash.priceBRLTotal, undefined);
});

test('arbitragem só compara oferta em milhas com dinheiro do MESMO destino+data', async () => {
  clearCache();
  stubAllNotConfigured();
  providers.ALL_PROVIDERS.CASH_TRAVELPAYOUTS.search = async ({ departDate }) => ({
    status: 'ok',
    offers: [{ program: 'CASH_TRAVELPAYOUTS', priceBRL: departDate === '2026-11-12' ? 500 : 5000, milesRequired: null, taxesBRL: null, stops: 0, isHiddenCity: false, deepLink: null, source: 'stub' }],
  });
  providers.ALL_PROVIDERS.SMILES.search = async ({ departDate }) => ({
    status: 'ok',
    offers: [{ program: 'SMILES', priceBRL: null, milesRequired: 30000, taxesBRL: 45, stops: 0, isHiddenCity: false, deepLink: null, source: 'stub' }],
  });

  const search = db.createSearch({ origin: 'GRU', destination: 'MIA', departDate: '2026-11-12', flexDays: 1, programs: ['SMILES'] });
  const result = await runSearch(search);

  const milesOffers = result.allOffersSorted.filter((o) => o.program === 'SMILES');
  for (const o of milesOffers) {
    if (o.arbitrage) {
      assert.equal(o.arbitrage.cashReferenceBRL, o.departDate === '2026-11-12' ? 500 : 5000, `arbitragem da data ${o.departDate} deve referenciar o preço em dinheiro DA MESMA data`);
    }
  }
});

test('isNewLow marca a oferta quando o preço bate o mínimo histórico da rota', async () => {
  clearCache();
  stubAllNotConfigured();

  // Primeira busca: sem histórico anterior nenhum, não deveria alegar "novo mínimo"
  // (regra: precisa de pelo menos 1 amostra pra existir um recorde pra bater).
  providers.ALL_PROVIDERS.CASH_TRAVELPAYOUTS.search = async () => ({
    status: 'ok',
    offers: [{ program: 'CASH_TRAVELPAYOUTS', priceBRL: 1000, milesRequired: null, taxesBRL: null, stops: 0, isHiddenCity: false, deepLink: null, source: 'stub' }],
  });
  const search1 = db.createSearch({ origin: 'GRU', destination: 'CNF', departDate: '2026-12-01' });
  const result1 = await runSearch(search1);
  const offer1 = result1.allOffersSorted.find((o) => o.program === 'CASH_TRAVELPAYOUTS');
  assert.equal(offer1.isNewLow, false, 'primeira checagem de uma rota não é "recorde batido" — não há nada anterior pra comparar');
  assert.equal(result1.bestDeal.isNewLow, false);

  // Segunda busca, preço mais alto: não deveria bater o mínimo (1000 continua sendo o menor).
  providers.ALL_PROVIDERS.CASH_TRAVELPAYOUTS.search = async () => ({
    status: 'ok',
    offers: [{ program: 'CASH_TRAVELPAYOUTS', priceBRL: 1200, milesRequired: null, taxesBRL: null, stops: 0, isHiddenCity: false, deepLink: null, source: 'stub' }],
  });
  const search2 = db.createSearch({ origin: 'GRU', destination: 'CNF', departDate: '2026-12-08' });
  const result2 = await runSearch(search2);
  const offer2 = result2.allOffersSorted.find((o) => o.program === 'CASH_TRAVELPAYOUTS');
  assert.equal(offer2.isNewLow, false, '1200 é mais caro que o mínimo histórico (1000) — não é recorde');

  // Terceira busca, preço mais baixo que qualquer checagem anterior: deve bater recorde.
  providers.ALL_PROVIDERS.CASH_TRAVELPAYOUTS.search = async () => ({
    status: 'ok',
    offers: [{ program: 'CASH_TRAVELPAYOUTS', priceBRL: 700, milesRequired: null, taxesBRL: null, stops: 0, isHiddenCity: false, deepLink: null, source: 'stub' }],
  });
  const search3 = db.createSearch({ origin: 'GRU', destination: 'CNF', departDate: '2026-12-15' });
  const result3 = await runSearch(search3);
  const offer3 = result3.allOffersSorted.find((o) => o.program === 'CASH_TRAVELPAYOUTS');
  assert.equal(offer3.isNewLow, true, '700 é mais barato que qualquer checagem anterior (1000, 1200) — deveria bater recorde');
  assert.equal(result3.bestDeal.isNewLow, true);
});
