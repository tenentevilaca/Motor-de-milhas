require('./helpers/setup');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const { createProgramProvider } = require('../src/providers/programProvider');

function withMockedPost(response, fn) {
  const original = axios.post;
  axios.post = async () => response;
  return fn().finally(() => {
    axios.post = original;
  });
}

test('sem *_PROVIDER_URL configurada: not_configured', async () => {
  delete process.env.LATAM_PROVIDER_URL;
  const provider = createProgramProvider({ id: 'LATAM', label: 'LATAM Pass', envPrefix: 'LATAM', homepageUrl: 'https://exemplo.com' });
  const result = await provider.search({ origin: 'GRU', destination: 'MIA', departDate: '2026-12-08', returnDate: null });
  assert.equal(result.status, 'not_configured');
});

test('com *_PROVIDER_URL configurada: parseia { offers: [...] } normalmente', async () => {
  process.env.LATAM_PROVIDER_URL = 'https://minha-integracao.com/latam';
  try {
    await withMockedPost({ data: { offers: [{ milesRequired: 40000, priceBRL: null }] } }, async () => {
      const provider = createProgramProvider({ id: 'LATAM', label: 'LATAM Pass', envPrefix: 'LATAM', homepageUrl: 'https://exemplo.com' });
      const result = await provider.search({ origin: 'GRU', destination: 'MIA', departDate: '2026-12-08', returnDate: null });
      assert.equal(result.status, 'ok');
      assert.equal(result.offers.length, 1);
      assert.equal(result.offers[0].program, 'LATAM');
    });
  } finally {
    delete process.env.LATAM_PROVIDER_URL;
  }
});

test('diagnóstico: integração própria devolve formato inesperado (sem "offers" como array) — loga as chaves reais em vez de só mostrar 0 ofertas', async () => {
  process.env.LATAM_PROVIDER_URL = 'https://minha-integracao.com/latam';
  const originalError = console.error;
  const errorLines = [];
  console.error = (...args) => errorLines.push(args.join(' '));
  try {
    await withMockedPost({ data: { resultados: [{ milhas: 40000 }] } }, async () => {
      const provider = createProgramProvider({ id: 'LATAM', label: 'LATAM Pass', envPrefix: 'LATAM', homepageUrl: 'https://exemplo.com' });
      const result = await provider.search({ origin: 'GRU', destination: 'MIA', departDate: '2026-12-08', returnDate: null });
      assert.equal(result.status, 'ok');
      assert.equal(result.offers.length, 0);
    });
  } finally {
    console.error = originalError;
    delete process.env.LATAM_PROVIDER_URL;
  }
  assert.ok(
    errorLines.some((l) => l.includes('LATAM:custom') && l.includes('resultados')),
    `logs: ${JSON.stringify(errorLines)}`
  );
});
