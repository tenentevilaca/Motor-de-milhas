require('./helpers/setup');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const providers = require('../src/providers');
const { scanMonth } = require('../src/search/monthScan');
const { clearCache } = require('../src/cache');

function stubCash(id) {
  return async ({ departDate }) => ({
    status: 'ok',
    offers: [{ program: id, priceBRL: 1000 + Number(departDate.slice(8, 10)), milesRequired: null, taxesBRL: null, stops: 0, isHiddenCity: false, deepLink: null, source: 'stub' }],
  });
}
function stubMiles(id) {
  return async () => ({
    status: 'ok',
    offers: [{ program: id, priceBRL: null, milesRequired: 30000, taxesBRL: 45, stops: 0, isHiddenCity: false, deepLink: null, source: 'stub' }],
  });
}

test('scanMonth amostra 5 datas espaçadas cobrindo o mês inteiro', async () => {
  clearCache();
  providers.ALL_PROVIDERS.CASH_TRAVELPAYOUTS.search = stubCash('CASH_TRAVELPAYOUTS');
  providers.ALL_PROVIDERS.CASH_RAPIDAPI_GFLIGHTS.search = async () => ({ status: 'not_configured', offers: [] });
  providers.ALL_PROVIDERS.SMILES.search = async () => ({ status: 'not_configured', offers: [] });
  providers.ALL_PROVIDERS.AZUL.search = async () => ({ status: 'not_configured', offers: [] });
  providers.ALL_PROVIDERS.AA.search = async () => ({ status: 'not_configured', offers: [] });
  providers.ALL_PROVIDERS.LATAM.search = async () => ({ status: 'not_configured', offers: [] });

  const result = await scanMonth({ origin: 'GRU', destination: 'MIA', yearMonth: '2026-11' });
  assert.equal(result.dates.length, 5);
  assert.equal(result.dates[0].date, '2026-11-01');
  assert.equal(result.dates[result.dates.length - 1].date, '2026-11-30');
  assert.equal(result.mode, 'cash_only', 'includeMiles default deve ser false');
  for (const d of result.dates) {
    assert.ok(d.priceBRL != null, `data ${d.date} deveria ter preço em dinheiro`);
  }
});

test('scanMonth com includeMiles:true consulta programas de milhas também', async () => {
  clearCache();
  providers.ALL_PROVIDERS.CASH_TRAVELPAYOUTS.search = stubCash('CASH_TRAVELPAYOUTS');
  providers.ALL_PROVIDERS.CASH_RAPIDAPI_GFLIGHTS.search = async () => ({ status: 'not_configured', offers: [] });
  providers.ALL_PROVIDERS.SMILES.search = stubMiles('SMILES');
  providers.ALL_PROVIDERS.AZUL.search = async () => ({ status: 'not_configured', offers: [] });
  providers.ALL_PROVIDERS.AA.search = async () => ({ status: 'not_configured', offers: [] });
  providers.ALL_PROVIDERS.LATAM.search = async () => ({ status: 'not_configured', offers: [] });

  const result = await scanMonth({ origin: 'GRU', destination: 'MIA', yearMonth: '2026-11', includeMiles: true });
  assert.equal(result.mode, 'full');
  for (const d of result.dates) {
    assert.equal(d.milesRequired, 30000);
    assert.equal(d.milesProgram, 'SMILES');
  }
});
