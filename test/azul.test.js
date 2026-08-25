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
