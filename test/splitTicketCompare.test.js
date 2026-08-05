require('./helpers/setup');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const providers = require('../src/providers');
const { compareSplitTickets } = require('../src/search/splitTicketCompare');
const { clearCache } = require('../src/cache');

test('sem compareSplitTickets ou sem returnDate não busca nada', async () => {
  clearCache();
  const result = await compareSplitTickets({ compareSplitTickets: false, returnDate: '2026-11-17' });
  assert.deepEqual(result, []);
  const result2 = await compareSplitTickets({ compareSplitTickets: true, returnDate: null });
  assert.deepEqual(result2, []);
});

test('com flexDays, escolhe a data mais barata em cada perna independentemente', async () => {
  clearCache();
  providers.ALL_PROVIDERS.CASH_TRAVELPAYOUTS.search = async ({ departDate }) => {
    const day = Number(departDate.slice(8, 10));
    return { status: 'ok', offers: [{ program: 'CASH_TRAVELPAYOUTS', priceBRL: 1000 + day * 10, milesRequired: null, taxesBRL: null, stops: 0, isHiddenCity: false, deepLink: null, source: 'stub' }] };
  };
  providers.ALL_PROVIDERS.CASH_RAPIDAPI_GFLIGHTS.search = async () => ({ status: 'not_configured', offers: [] });

  const result = await compareSplitTickets({
    compareSplitTickets: true,
    origin: 'GRU',
    destination: 'MIA',
    departDate: '2026-09-15',
    returnDate: '2026-09-22',
    flexDays: 3,
    allowStopover: false,
  });

  const cmp = result.find((r) => r.program === 'CASH_TRAVELPAYOUTS');
  assert.ok(cmp, 'deve haver comparação pra CASH_TRAVELPAYOUTS');
  // Janela de ida: 12-18 (dia 15 ± 3) -> mais barato é o dia 12.
  // Janela de volta: 19-25 (dia 22 ± 3) -> mais barato é o dia 19.
  assert.equal(cmp.departDate, '2026-09-12');
  assert.equal(cmp.returnDate, '2026-09-19');
  assert.equal(cmp.splitPriceBRL, (1000 + 12 * 10) + (1000 + 19 * 10));
});
