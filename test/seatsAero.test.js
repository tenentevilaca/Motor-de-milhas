require('./helpers/setup');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const aa = require('../src/providers/aa');

function withMockedGet(response, fn) {
  const original = axios.get;
  axios.get = async (url, opts) => {
    withMockedGet.lastCall = { url, opts };
    return response;
  };
  return fn().finally(() => {
    axios.get = original;
  });
}

test('AA usa Seats.aero quando SEATSAERO_API_KEY está configurada e devolve program="AA" (mesmo ID do resto do ecossistema)', async () => {
  process.env.SEATSAERO_API_KEY = 'test-key';
  try {
    await withMockedGet(
      {
        data: {
          data: [
            {
              Source: 'american',
              Stops: 1,
              YMileageCost: 30000,
              YTotalTaxes: 56.1,
              JMileageCost: 60000,
              JTotalTaxes: 56.1,
              TaxesCurrency: 'USD',
            },
            { Source: 'delta', Stops: 0, YMileageCost: 10000, TaxesCurrency: 'USD' }, // outra fonte — não deve entrar
          ],
        },
      },
      async () => {
        const result = await aa.search({ origin: 'GRU', destination: 'MIA', departDate: '2026-11-10', returnDate: null });
        assert.equal(result.status, 'ok');
        // 1 trip "american" com 2 cabines disponíveis (Y e J) = 2 ofertas; a "delta" é descartada.
        assert.equal(result.offers.length, 2);
        assert.ok(result.offers.every((o) => o.program === 'AA'), 'offer.program deve ser "AA", não "MILES_AA" nem outro namespace');
        assert.ok(result.offers.some((o) => o.milesRequired === 30000));
        assert.ok(result.offers.some((o) => o.milesRequired === 60000));
        const withTaxes = result.offers.find((o) => o.milesRequired === 30000);
        assert.equal(withTaxes.taxesBRL, 56.1 * 5.5); // USD_TO_BRL_RATE default = 5.5
      }
    );
  } finally {
    delete process.env.SEATSAERO_API_KEY;
  }
});

test('Seats.aero: envia start_date=end_date=departDate exata (evita paginação incorreta) e o header Partner-Authorization com Bearer', async () => {
  process.env.SEATSAERO_API_KEY = 'minha-chave';
  try {
    await withMockedGet({ data: { data: [] } }, async () => {
      await aa.search({ origin: 'gru', destination: 'mia', departDate: '2026-12-25', returnDate: null });
      const { opts } = withMockedGet.lastCall;
      assert.equal(opts.params.origin_airport, 'GRU');
      assert.equal(opts.params.destination_airport, 'MIA');
      assert.equal(opts.params.start_date, '2026-12-25');
      assert.equal(opts.params.end_date, '2026-12-25');
      assert.equal(opts.headers['Partner-Authorization'], 'Bearer minha-chave');
    });
  } finally {
    delete process.env.SEATSAERO_API_KEY;
  }
});

test('Seats.aero: descarta cabine sem milhas válidas (0/negativo/ausente)', async () => {
  process.env.SEATSAERO_API_KEY = 'test-key';
  try {
    await withMockedGet(
      { data: { data: [{ Source: 'american', Stops: 0, YMileageCost: 0, JMileageCost: null }] } },
      async () => {
        const result = await aa.search({ origin: 'GRU', destination: 'JFK', departDate: '2026-11-10', returnDate: null });
        assert.equal(result.offers.length, 0);
      }
    );
  } finally {
    delete process.env.SEATSAERO_API_KEY;
  }
});

test('AA sem SEATSAERO_API_KEY: cai pro fallback genérico (not_configured), como antes', async () => {
  delete process.env.SEATSAERO_API_KEY;
  delete process.env.AA_PROVIDER_URL;
  const result = await aa.search({ origin: 'GRU', destination: 'MIA', departDate: '2026-11-10', returnDate: null });
  assert.equal(result.status, 'not_configured');
  assert.equal(result.offers.length, 0);
});
