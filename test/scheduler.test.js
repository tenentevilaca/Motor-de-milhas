require('./helpers/setup');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const providers = require('../src/providers');
const db = require('../src/db');
const { clearCache } = require('../src/cache');

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('runAllActiveSearches roda buscas salvas em paralelo (limitado), não uma por vez', async () => {
  clearCache();
  process.env.SCHEDULER_CONCURRENCY = '3';
  // scheduler.js lê SCHEDULER_CONCURRENCY na primeira vez que o módulo é
  // carregado — precisa recarregar o módulo depois de setar a env var.
  delete require.cache[require.resolve('../src/scheduler')];
  const scheduler = require('../src/scheduler');

  for (const id of ['CASH_RAPIDAPI_GFLIGHTS', 'SMILES', 'AZUL', 'AA', 'LATAM']) {
    providers.ALL_PROVIDERS[id].search = async () => ({ status: 'not_configured', offers: [] });
  }
  providers.ALL_PROVIDERS.CASH_TRAVELPAYOUTS.search = async () => {
    await delay(100);
    return { status: 'ok', offers: [{ program: 'CASH_TRAVELPAYOUTS', priceBRL: 1000, milesRequired: null, taxesBRL: null, stops: 0, isHiddenCity: false, deepLink: null, source: 'stub' }] };
  };

  // 6 buscas de rotas DIFERENTES (senão a cache do provider faria a 2ª em diante instantânea).
  const routes = [
    ['GRU', 'MIA'], ['GRU', 'LIS'], ['GRU', 'EZE'],
    ['GIG', 'MIA'], ['GIG', 'LIS'], ['GIG', 'EZE'],
  ];
  for (const [origin, destination] of routes) {
    db.createSearch({ origin, destination, departDate: '2026-11-10' });
  }

  const t0 = Date.now();
  await scheduler.runAllActiveSearches('teste');
  const elapsed = Date.now() - t0;

  // Sequencial (comportamento antigo) seria ~600ms (6 x 100ms). Com
  // concorrência 3, deveria ficar perto de ~200ms (2 lotes de 3).
  assert.ok(elapsed < 450, `esperava bem menos que 600ms (sequencial), levou ${elapsed}ms`);
});
