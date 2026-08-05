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
