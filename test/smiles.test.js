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
