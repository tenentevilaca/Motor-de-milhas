require('./helpers/setup');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const smiles = require('../src/providers/smiles');

function withMockedPost(response, fn) {
  const original = axios.post;
  axios.post = async () => response;
  return fn().finally(() => {
    axios.post = original;
  });
}

function withMockedGet(response, fn) {
  const original = axios.get;
  axios.get = async () => response;
  return fn().finally(() => {
    axios.get = original;
  });
}

test('erro do RapidAPI (403, não assinado) loga categoria "auth"', async () => {
  process.env.RAPIDAPI_KEY = 'test-key';
  const originalError = console.error;
  const errorLines = [];
  console.error = (...args) => errorLines.push(args.join(' '));
  try {
    const err = new Error('Request failed with status code 403');
    err.response = { status: 403, data: { message: 'You are not subscribed to this API.' } };
    axios.post = async () => {
      throw err;
    };
    const result = await smiles.search({ origin: 'GRU', destination: 'MIA', departDate: '2026-12-08', returnDate: null });
    assert.equal(result.status, 'error');
    assert.ok(result.message.includes('not subscribed'), `mensagem devia continuar extraindo o corpo real: ${result.message}`);
    assert.ok(
      errorLines.some((l) => l.includes('[SMILES:rapidapi]') && l.includes('ERRO DE AUTENTICAÇÃO')),
      `esperava log categorizado, veio: ${JSON.stringify(errorLines)}`
    );
  } finally {
    console.error = originalError;
    delete axios.post;
    delete process.env.RAPIDAPI_KEY;
  }
});

test('parseia oferta normalmente quando outboundFlights vem com voo válido', async () => {
  process.env.RAPIDAPI_KEY = 'test-key';
  try {
    await withMockedPost(
      { data: { outboundFlights: [{ adultPricePoints: 30000, adultBoardingTax: 120, flightNumber: 'G31234', segments: [{ destinationCode: 'CGH' }] }] } },
      async () => {
        const result = await smiles.search({ origin: 'GRU', destination: 'CGH', departDate: '2026-12-08', returnDate: null });
        assert.equal(result.status, 'ok');
        assert.equal(result.offers.length, 1);
        assert.equal(result.offers[0].program, 'SMILES');
        assert.equal(result.offers[0].milesRequired, 30000);
      }
    );
  } finally {
    delete process.env.RAPIDAPI_KEY;
  }
});

test('diagnóstico: resposta em formato inesperado (sem outboundFlights como array) — loga as chaves reais', async () => {
  process.env.RAPIDAPI_KEY = 'test-key';
  const originalError = console.error;
  const errorLines = [];
  console.error = (...args) => errorLines.push(args.join(' '));
  try {
    await withMockedPost({ data: { message: 'algo mudou', code: 500 } }, async () => {
      const result = await smiles.search({ origin: 'GRU', destination: 'CGH', departDate: '2026-12-08', returnDate: null });
      assert.equal(result.status, 'ok');
      assert.equal(result.offers.length, 0);
    });
  } finally {
    console.error = originalError;
    delete process.env.RAPIDAPI_KEY;
  }
  assert.ok(
    errorLines.some((l) => l.includes('SMILES:rapidapi') && l.includes('message') && l.includes('code')),
    `logs: ${JSON.stringify(errorLines)}`
  );
});

test('diagnóstico: outboundFlights reconhecido mas vazio — loga sem confundir com formato inesperado', async () => {
  process.env.RAPIDAPI_KEY = 'test-key';
  const originalLog = console.log;
  const logLines = [];
  console.log = (...args) => logLines.push(args.join(' '));
  try {
    await withMockedPost({ data: { outboundFlights: [] } }, async () => {
      const result = await smiles.search({ origin: 'GRU', destination: 'CUR', departDate: '2026-12-08', returnDate: null });
      assert.equal(result.offers.length, 0);
    });
  } finally {
    console.log = originalLog;
    delete process.env.RAPIDAPI_KEY;
  }
  assert.ok(
    logLines.some((l) => l.includes('SMILES:rapidapi') && l.includes('0 voos')),
    `logs: ${JSON.stringify(logLines)}`
  );
});

test('diagnóstico: voos existem mas nenhum sobrevive ao parsing (sem preço nem milhas) — loga as chaves do voo bruto', async () => {
  process.env.RAPIDAPI_KEY = 'test-key';
  const originalError = console.error;
  const errorLines = [];
  console.error = (...args) => errorLines.push(args.join(' '));
  try {
    await withMockedPost({ data: { outboundFlights: [{ pontos_necessarios: 30000, taxa_embarque: 120 }] } }, async () => {
      const result = await smiles.search({ origin: 'GRU', destination: 'CGH', departDate: '2026-12-08', returnDate: null });
      assert.equal(result.offers.length, 0);
    });
  } finally {
    console.error = originalError;
    delete process.env.RAPIDAPI_KEY;
  }
  assert.ok(
    errorLines.some((l) => l.includes('SMILES:rapidapi') && l.includes('pontos_necessarios')),
    `logs: ${JSON.stringify(errorLines)}`
  );
});

// Cota mensal da RapidAPI já estourou de verdade uma vez nesta sessão —
// quando isso acontece, a Smiles não devolve NADA sem essa fonte extra.
test('quando a RapidAPI dá erro (ex: cota estourada), tenta o Seats.aero como complemento e usa o resultado dele', async () => {
  process.env.RAPIDAPI_KEY = 'test-key';
  process.env.SEATSAERO_API_KEY = 'test-key';
  try {
    const originalPost = axios.post;
    axios.post = async () => {
      const err = new Error('Request failed with status code 429');
      err.response = { status: 429, data: { message: 'You have exceeded the MONTHLY quota for Requests on your current plan, BASIC.' } };
      throw err;
    };
    await withMockedGet(
      { data: { data: [{ Source: 'gol', Stops: 0, YMileageCost: 22000, TaxesCurrency: 'BRL', YTotalTaxes: 89.9 }] } },
      async () => {
        const result = await smiles.search({ origin: 'GRU', destination: 'CGH', departDate: '2026-12-08', returnDate: null });
        assert.equal(result.status, 'ok');
        assert.equal(result.offers.length, 1);
        assert.equal(result.offers[0].program, 'SMILES');
        assert.equal(result.offers[0].milesRequired, 22000);
      }
    );
    axios.post = originalPost;
  } finally {
    delete process.env.RAPIDAPI_KEY;
    delete process.env.SEATSAERO_API_KEY;
  }
});

// Item 4 do pedido do usuário: essa API só devolveu, no teste real, voos da
// própria Gol — sem campo de companhia parceira. operatingAirline/
// marketingAirline afirmam "Gol" porque é a única companhia que essa fonte
// já demonstrou devolver (não um chute), e partnerAirlines continua null —
// nunca afirma disponibilidade parceira que a API não confirmou.
test('Smiles/RapidAPI: oferta vem com loyaltyProgram/operatingAirline/marketingAirline = Gol, sem parceira (API não retorna esse dado)', async () => {
  process.env.RAPIDAPI_KEY = 'test-key';
  try {
    await withMockedPost(
      { data: { outboundFlights: [{ adultPricePoints: 30000, adultBoardingTax: 120, flightNumber: 'G31234', segments: [{ destinationCode: 'CGH' }] }] } },
      async () => {
        const result = await smiles.search({ origin: 'GRU', destination: 'CGH', departDate: '2026-12-08', returnDate: null });
        const offer = result.offers[0];
        assert.equal(offer.loyaltyProgram, 'Smiles (Gol)');
        assert.equal(offer.operatingAirline, 'Gol');
        assert.equal(offer.marketingAirline, 'Gol');
        assert.equal(offer.partnerAirlines, null);
        assert.equal(offer.availabilitySource, 'rapidapi');
        assert.equal(offer.isLiveAwardAvailability, true);
        assert.deepEqual(offer.segments, [{ destination: 'CGH', flightNumber: null }]);
      }
    );
  } finally {
    delete process.env.RAPIDAPI_KEY;
  }
});

test('diagnóstico: loga aviso se aparecer campo nunca visto que pareça indicar companhia (ex: "operatingCarrier"), sem afirmar parceira sem confirmar o parsing', async () => {
  process.env.RAPIDAPI_KEY = 'test-key';
  const originalLog = console.log;
  const logLines = [];
  console.log = (...args) => logLines.push(args.join(' '));
  try {
    await withMockedPost(
      { data: { outboundFlights: [{ adultPricePoints: 30000, flightNumber: 'G31234', segments: [{ destinationCode: 'CGH' }], operatingCarrier: 'LATAM' }] } },
      async () => {
        const result = await smiles.search({ origin: 'GRU', destination: 'CGH', departDate: '2026-12-08', returnDate: null });
        // mesmo com a chave nova aparecendo, o parsing continua sem inventar parceira
        assert.equal(result.offers[0].partnerAirlines, null);
        assert.equal(result.offers[0].operatingAirline, 'Gol');
      }
    );
  } finally {
    console.log = originalLog;
    delete process.env.RAPIDAPI_KEY;
  }
  assert.ok(
    logLines.some((l) => l.includes('SMILES:rapidapi') && l.includes('ATENÇÃO') && l.includes('operatingCarrier')),
    `logs: ${JSON.stringify(logLines)}`
  );
});

// Ponto real levantado pelo usuário: parceiras costumam aparecer em rotas
// INTERNACIONAIS, não domésticas — uma busca doméstica pode devolver só a
// companhia principal mesmo quando o programa tem vários parceiros. Esse
// teste confirma que, pra essa fonte específica (RapidAPI), isso não muda
// o resultado: o teste real já feito nesta sessão (ver comentário no topo
// de smiles.js) mostrou que a API só devolve voos da própria Gol mesmo
// numa rota internacional (GRU->MIA) — não é um bug, é uma limitação já
// confirmada da fonte. Sem chave real configurada nesta sandbox (sem
// egress pra RapidAPI/Seats.aero/Apify), não dá pra reconfirmar isso ao
// vivo — esse teste documenta o comportamento já observado.
test('Smiles/RapidAPI: mesmo numa rota internacional (GRU->MIA), a fonte continua só devolvendo Gol — sem parceira (limitação confirmada da fonte, não é geografia)', async () => {
  process.env.RAPIDAPI_KEY = 'test-key';
  try {
    await withMockedPost(
      { data: { outboundFlights: [{ adultPricePoints: 45000, adultBoardingTax: 210, flightNumber: 'G3700', segments: [{ destinationCode: 'MIA' }] }] } },
      async () => {
        const result = await smiles.search({ origin: 'GRU', destination: 'MIA', departDate: '2026-12-08', returnDate: null });
        const offer = result.offers[0];
        assert.equal(offer.operatingAirline, 'Gol');
        assert.equal(offer.partnerAirlines, null);
      }
    );
  } finally {
    delete process.env.RAPIDAPI_KEY;
  }
});

test('quando a RapidAPI já achou oferta, não gasta uma chamada a mais no Seats.aero', async () => {
  process.env.RAPIDAPI_KEY = 'test-key';
  process.env.SEATSAERO_API_KEY = 'test-key';
  let seatsAeroCalled = false;
  try {
    await withMockedPost(
      { data: { outboundFlights: [{ adultPricePoints: 30000, flightNumber: 'G31234', segments: [{ destinationCode: 'CGH' }] }] } },
      async () => {
        const originalGet = axios.get;
        axios.get = async (...args) => {
          seatsAeroCalled = true;
          return { data: { data: [] } };
        };
        const result = await smiles.search({ origin: 'GRU', destination: 'CGH', departDate: '2026-12-08', returnDate: null });
        assert.equal(result.offers.length, 1);
        axios.get = originalGet;
      }
    );
  } finally {
    delete process.env.RAPIDAPI_KEY;
    delete process.env.SEATSAERO_API_KEY;
  }
  assert.equal(seatsAeroCalled, false, 'não deveria ter chamado o Seats.aero — a RapidAPI já tinha achado oferta');
});
