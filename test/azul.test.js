require('./helpers/setup');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const azul = require('../src/providers/azul');

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

test('parseia oferta normalmente quando o ator devolve item com cabine disponível', async () => {
  process.env.APIFY_TOKEN = 'test-token';
  try {
    await withMockedPost(
      {
        data: [
          {
            link: 'https://exemplo.com',
            itineraries: [{ stops: 0, totalDuration: 90, flightNumbers: ['AD123'], departure: '2026-12-08T10:00:00', arrival: '2026-12-08T11:30:00' }],
            cabins: [{ name: 'Econômica', available: true, mileage: 12000, taxes: 3194 }],
          },
        ],
      },
      async () => {
        const result = await azul.search({ origin: 'CNF', destination: 'MAO', departDate: '2026-12-08', returnDate: null });
        assert.equal(result.status, 'ok');
        assert.equal(result.offers.length, 1);
        assert.equal(result.offers[0].program, 'AZUL');
        assert.equal(result.offers[0].milesRequired, 12000);
        assert.equal(result.offers[0].taxesBRL, 31.94);
      }
    );
  } finally {
    delete process.env.APIFY_TOKEN;
  }
});

test('diagnóstico: ator devolve lista vazia — loga que não achou nada pra essa rota/data', async () => {
  process.env.APIFY_TOKEN = 'test-token';
  const originalLog = console.log;
  const logLines = [];
  console.log = (...args) => logLines.push(args.join(' '));
  try {
    await withMockedPost({ data: [] }, async () => {
      const result = await azul.search({ origin: 'CNF', destination: 'MAO', departDate: '2026-12-08', returnDate: null });
      assert.equal(result.offers.length, 0);
    });
  } finally {
    console.log = originalLog;
    delete process.env.APIFY_TOKEN;
  }
  assert.ok(
    logLines.some((l) => l.includes('AZUL:apify') && l.includes('sem nenhum item')),
    `logs: ${JSON.stringify(logLines)}`
  );
});

test('diagnóstico: itens existem mas nenhuma cabine passa no filtro — loga as chaves reais pra diagnóstico', async () => {
  process.env.APIFY_TOKEN = 'test-token';
  const originalError = console.error;
  const errorLines = [];
  console.error = (...args) => errorLines.push(args.join(' '));
  try {
    await withMockedPost(
      { data: [{ link: 'https://exemplo.com', cabins: [{ nome: 'Econômica', disponivel: true, milhas: 12000 }] }] },
      async () => {
        const result = await azul.search({ origin: 'CNF', destination: 'MAO', departDate: '2026-12-08', returnDate: null });
        assert.equal(result.offers.length, 0);
      }
    );
  } finally {
    console.error = originalError;
    delete process.env.APIFY_TOKEN;
  }
  assert.ok(
    errorLines.some((l) => l.includes('AZUL:apify') && l.includes('nome') && l.includes('disponivel')),
    `logs: ${JSON.stringify(errorLines)}`
  );
});

// Achado real (log de produção, CNF->MAO): o Apify não achou nada pra essa
// rota, mas o Seats.aero achou (Source="azul") — o scraper de site é
// instável e nem sempre concorda com a Seats.aero, então rodar as duas
// aumenta a chance real de achar a oferta.
test('quando o Apify não acha nada, tenta o Seats.aero como complemento e usa o resultado dele', async () => {
  process.env.APIFY_TOKEN = 'test-token';
  process.env.SEATSAERO_API_KEY = 'test-key';
  try {
    await withMockedPost({ data: [] }, () =>
      withMockedGet(
        { data: { data: [{ Source: 'aeroplan', Stops: 0, YMileageCost: 50000 }, { Source: 'azul', Stops: 1, YMileageCost: 18000, TaxesCurrency: 'BRL', YTotalTaxes: 45 }] } },
        async () => {
          const result = await azul.search({ origin: 'CNF', destination: 'MAO', departDate: '2026-12-08', returnDate: null });
          assert.equal(result.status, 'ok');
          assert.equal(result.offers.length, 1, 'só a trip com Source="azul" deveria virar oferta, não "aeroplan"');
          assert.equal(result.offers[0].program, 'AZUL');
          assert.equal(result.offers[0].milesRequired, 18000);
        }
      )
    );
  } finally {
    delete process.env.APIFY_TOKEN;
    delete process.env.SEATSAERO_API_KEY;
  }
});

test('quando o Apify já achou oferta, não gasta uma chamada a mais no Seats.aero', async () => {
  process.env.APIFY_TOKEN = 'test-token';
  process.env.SEATSAERO_API_KEY = 'test-key';
  let seatsAeroCalled = false;
  try {
    await withMockedPost(
      { data: [{ link: 'https://exemplo.com', cabins: [{ name: 'Econômica', available: true, mileage: 12000 }] }] },
      () =>
        withMockedGet({ data: { data: [] } }, async () => {
          const originalGet = axios.get;
          axios.get = async (...args) => {
            seatsAeroCalled = true;
            return originalGet(...args);
          };
          const result = await azul.search({ origin: 'CNF', destination: 'MAO', departDate: '2026-12-08', returnDate: null });
          assert.equal(result.offers.length, 1);
          axios.get = originalGet;
        })
    );
  } finally {
    delete process.env.APIFY_TOKEN;
    delete process.env.SEATSAERO_API_KEY;
  }
  assert.equal(seatsAeroCalled, false, 'não deveria ter chamado o Seats.aero — o Apify já tinha achado oferta');
});
