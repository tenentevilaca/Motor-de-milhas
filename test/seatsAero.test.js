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

// Achado real (usuário reportou): o link da Azul (mesmo deepLinkBuilder do
// AA/Smiles) apontava sempre pra uma busca só de ida, mesmo em busca de
// ida e volta — clicar levava a uma pesquisa diferente da que o app
// mostrou, parecendo "não encontrei o voo". Com volta, deveria cair pro
// link genérico (manualCheckUrl) em vez de montar um link errado.
test('AA: com returnDate (ida e volta), deepLink vem null (cai pro link genérico) em vez de montar link de só ida errado', async () => {
  process.env.SEATSAERO_API_KEY = 'test-key';
  try {
    await withMockedGet(
      { data: { data: [{ Source: 'american', Stops: 0, YMileageCost: 30000 }] } },
      async () => {
        const result = await aa.search({ origin: 'GRU', destination: 'MIA', departDate: '2026-11-10', returnDate: '2026-11-20' });
        assert.equal(result.offers[0].deepLink, null);
      }
    );
  } finally {
    delete process.env.SEATSAERO_API_KEY;
  }
});

test('AA: sem returnDate (só ida), deepLink continua montado normalmente', async () => {
  process.env.SEATSAERO_API_KEY = 'test-key';
  try {
    await withMockedGet(
      { data: { data: [{ Source: 'american', Stops: 0, YMileageCost: 30000 }] } },
      async () => {
        const result = await aa.search({ origin: 'GRU', destination: 'MIA', departDate: '2026-11-10', returnDate: null });
        assert.ok(result.offers[0].deepLink && result.offers[0].deepLink.includes('aa.com'));
      }
    );
  } finally {
    delete process.env.SEATSAERO_API_KEY;
  }
});

test('Seats.aero: envia start_date=end_date=departDate exata (evita paginação incorreta) e o header Partner-Authorization com a chave crua (sem "Bearer " — confirmado no exemplo oficial da própria conta, "Bearer" causava bad_partner_token)', async () => {
  process.env.SEATSAERO_API_KEY = 'minha-chave';
  try {
    await withMockedGet({ data: { data: [] } }, async () => {
      await aa.search({ origin: 'gru', destination: 'mia', departDate: '2026-12-25', returnDate: null });
      const { opts } = withMockedGet.lastCall;
      assert.equal(opts.params.origin_airport, 'GRU');
      assert.equal(opts.params.destination_airport, 'MIA');
      assert.equal(opts.params.start_date, '2026-12-25');
      assert.equal(opts.params.end_date, '2026-12-25');
      assert.equal(opts.headers['Partner-Authorization'], 'minha-chave');
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

test('diagnóstico: resposta sem nenhuma trip loga aviso distinto de "sem trip com essa fonte"', async () => {
  process.env.SEATSAERO_API_KEY = 'test-key';
  const originalLog = console.log;
  const logLines = [];
  console.log = (...args) => logLines.push(args.join(' '));
  try {
    await withMockedGet({ data: { data: [] } }, async () => {
      await aa.search({ origin: 'GRU', destination: 'CUR', departDate: '2026-11-10', returnDate: null });
    });
  } finally {
    console.log = originalLog;
    delete process.env.SEATSAERO_API_KEY;
  }
  assert.ok(
    logLines.some((l) => l.includes('SEATSAERO:AA') && l.includes('0 itens no total')),
    `logs: ${JSON.stringify(logLines)}`
  );
});

test('diagnóstico: trips vieram mas nenhuma com a fonte esperada — loga quais fontes vieram de verdade', async () => {
  process.env.SEATSAERO_API_KEY = 'test-key';
  const originalLog = console.log;
  const logLines = [];
  console.log = (...args) => logLines.push(args.join(' '));
  try {
    await withMockedGet(
      { data: { data: [{ Source: 'united', Stops: 0, YMileageCost: 30000 }, { Source: 'delta', Stops: 0, YMileageCost: 25000 }] } },
      async () => {
        await aa.search({ origin: 'GRU', destination: 'MIA', departDate: '2026-11-10', returnDate: null });
      }
    );
  } finally {
    console.log = originalLog;
    delete process.env.SEATSAERO_API_KEY;
  }
  assert.ok(
    logLines.some((l) => l.includes('SEATSAERO:AA') && l.includes('united') && l.includes('delta')),
    `logs: ${JSON.stringify(logLines)}`
  );
});

test('diagnóstico: trip da fonte certa existe mas sem cabine legível — loga as chaves da trip bruta', async () => {
  process.env.SEATSAERO_API_KEY = 'test-key';
  const originalError = console.error;
  const errorLines = [];
  console.error = (...args) => errorLines.push(args.join(' '));
  try {
    await withMockedGet(
      { data: { data: [{ Source: 'american', Stops: 0, economy_miles: 30000 }] } },
      async () => {
        await aa.search({ origin: 'GRU', destination: 'MIA', departDate: '2026-11-10', returnDate: null });
      }
    );
  } finally {
    console.error = originalError;
    delete process.env.SEATSAERO_API_KEY;
  }
  assert.ok(
    errorLines.some((l) => l.includes('SEATSAERO:AA') && l.includes('economy_miles')),
    `logs: ${JSON.stringify(errorLines)}`
  );
});

test('AA sem SEATSAERO_API_KEY: cai pro fallback genérico (not_configured), como antes', async () => {
  delete process.env.SEATSAERO_API_KEY;
  delete process.env.AA_PROVIDER_URL;
  const result = await aa.search({ origin: 'GRU', destination: 'MIA', departDate: '2026-11-10', returnDate: null });
  assert.equal(result.status, 'not_configured');
  assert.equal(result.offers.length, 0);
});

// Item 3 do pedido do usuário: "Emitido com AAdvantage · operado por Qatar
// Airways" — exatamente 1 código em {letra}Airlines é o único caso em que
// dá pra afirmar uma companhia operadora concreta (ver comentário em
// seatsAero.js sobre por que 2+ não vira uma "afirmação única").
test('AA: 1 código em YAirlines vira operatingAirline (nome mapeado via airlineNames.js) — "emitido com AAdvantage, operado por Qatar Airways"', async () => {
  process.env.SEATSAERO_API_KEY = 'test-key';
  try {
    await withMockedGet(
      { data: { data: [{ Source: 'american', Stops: 1, YMileageCost: 70000, YAirlines: ['QR'] }] } },
      async () => {
        const result = await aa.search({ origin: 'GRU', destination: 'DOH', departDate: '2026-11-10', returnDate: null });
        const offer = result.offers[0];
        assert.equal(offer.loyaltyProgram, 'American Airlines (AAdvantage)');
        assert.equal(offer.operatingAirline, 'Qatar Airways');
        assert.equal(offer.partnerAirlines, null);
        assert.equal(offer.cabin, 'Econômica');
        assert.equal(offer.availabilitySource, 'seatsaero');
        assert.equal(offer.isLiveAwardAvailability, true);
      }
    );
  } finally {
    delete process.env.SEATSAERO_API_KEY;
  }
});

test('AA: 2+ códigos em YAirlines vira partnerAirlines (opções paralelas) — nunca afirma qual delas é "a" operadora', async () => {
  process.env.SEATSAERO_API_KEY = 'test-key';
  try {
    await withMockedGet(
      { data: { data: [{ Source: 'american', Stops: 1, YMileageCost: 70000, YAirlines: ['QR', 'BA'] }] } },
      async () => {
        const result = await aa.search({ origin: 'GRU', destination: 'LHR', departDate: '2026-11-10', returnDate: null });
        const offer = result.offers[0];
        assert.equal(offer.operatingAirline, null);
        assert.deepEqual(offer.partnerAirlines, ['Qatar Airways', 'British Airways']);
      }
    );
  } finally {
    delete process.env.SEATSAERO_API_KEY;
  }
});

test('AA: sem YAirlines/Airlines na trip, operatingAirline e partnerAirlines ficam null (não inventa companhia)', async () => {
  process.env.SEATSAERO_API_KEY = 'test-key';
  try {
    await withMockedGet(
      { data: { data: [{ Source: 'american', Stops: 0, YMileageCost: 30000 }] } },
      async () => {
        const result = await aa.search({ origin: 'GRU', destination: 'MIA', departDate: '2026-11-10', returnDate: null });
        const offer = result.offers[0];
        assert.equal(offer.operatingAirline, null);
        assert.equal(offer.partnerAirlines, null);
        assert.equal(offer.marketingAirline, null);
        assert.equal(offer.segments, null);
      }
    );
  } finally {
    delete process.env.SEATSAERO_API_KEY;
  }
});

test('AA: código IATA sem entrada em airlineNames.js aparece pelo próprio código (não inventa nome)', async () => {
  process.env.SEATSAERO_API_KEY = 'test-key';
  try {
    await withMockedGet(
      { data: { data: [{ Source: 'american', Stops: 0, YMileageCost: 30000, YAirlines: ['ZZ'] }] } },
      async () => {
        const result = await aa.search({ origin: 'GRU', destination: 'MIA', departDate: '2026-11-10', returnDate: null });
        assert.equal(result.offers[0].operatingAirline, 'ZZ');
      }
    );
  } finally {
    delete process.env.SEATSAERO_API_KEY;
  }
});

test('AA: usa Airlines genérico como fallback quando não existe {letra}Airlines específico da cabine', async () => {
  process.env.SEATSAERO_API_KEY = 'test-key';
  try {
    await withMockedGet(
      { data: { data: [{ Source: 'american', Stops: 0, YMileageCost: 30000, Airlines: ['QR'] }] } },
      async () => {
        const result = await aa.search({ origin: 'GRU', destination: 'DOH', departDate: '2026-11-10', returnDate: null });
        assert.equal(result.offers[0].operatingAirline, 'Qatar Airways');
      }
    );
  } finally {
    delete process.env.SEATSAERO_API_KEY;
  }
});

test('diagnóstico: loga quantas cabines tiveram companhia identificada vs. não, sem imprimir token/headers', async () => {
  process.env.SEATSAERO_API_KEY = 'chave-secreta-nao-pode-vazar';
  const originalLog = console.log;
  const logLines = [];
  console.log = (...args) => logLines.push(args.join(' '));
  try {
    await withMockedGet(
      { data: { data: [{ Source: 'american', Stops: 0, YMileageCost: 30000, YAirlines: ['QR'], JMileageCost: 60000 }] } },
      async () => {
        await aa.search({ origin: 'GRU', destination: 'DOH', departDate: '2026-11-10', returnDate: null });
      }
    );
  } finally {
    console.log = originalLog;
    delete process.env.SEATSAERO_API_KEY;
  }
  const summaryLine = logLines.find((l) => l.includes('SEATSAERO:AA') && l.includes('companhia identificada'));
  assert.ok(summaryLine, `logs: ${JSON.stringify(logLines)}`);
  assert.ok(summaryLine.includes('companhia identificada em 1 cabine(s)') && summaryLine.includes('sem dado de companhia em 1'));
  assert.ok(!logLines.some((l) => l.includes('chave-secreta-nao-pode-vazar')), 'chave da API não pode aparecer em log nenhum');
});
