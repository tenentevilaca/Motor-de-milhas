require('./helpers/setup');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const aa = require('../src/providers/aa');

// AA/AAdvantage não tinha teste nenhum ainda — único programa cuja única
// fonte real é o Seats.aero (sem Apify/RapidAPI como alternativa), então um
// erro dessa fonte é o único jeito de "AA" dar zero oferta com fonte
// configurada.

test('sem SEATSAERO_API_KEY nem AA_PROVIDER_URL: not_configured', async () => {
  delete process.env.SEATSAERO_API_KEY;
  delete process.env.AA_PROVIDER_URL;
  const result = await aa.search({ origin: 'GRU', destination: 'MIA', departDate: '2026-12-08', returnDate: null });
  assert.equal(result.status, 'not_configured');
});

test('parseia oferta normalmente quando o Seats.aero devolve trip com Source="american"', async () => {
  process.env.SEATSAERO_API_KEY = 'test-key';
  const axios = require('axios');
  const originalGet = axios.get;
  try {
    axios.get = async () => ({
      data: { data: [{ Source: 'american', Stops: 0, YMileageCost: 50000, YTotalTaxes: 56, TaxesCurrency: 'USD' }] },
    });
    const result = await aa.search({ origin: 'GRU', destination: 'MIA', departDate: '2026-12-08', returnDate: null });
    assert.equal(result.status, 'ok');
    assert.equal(result.offers.length, 1);
    assert.equal(result.offers[0].program, 'AA');
    assert.equal(result.offers[0].milesRequired, 50000);
  } finally {
    axios.get = originalGet;
    delete process.env.SEATSAERO_API_KEY;
  }
});

// Item A do pedido de revisão: log precisa categorizar a causa, não só
// devolver mensagem genérica pro usuário.
test('erro do Seats.aero (401, chave com "Bearer" indevido) loga categoria "auth"', async () => {
  process.env.SEATSAERO_API_KEY = 'test-key';
  const axios = require('axios');
  const originalGet = axios.get;
  const originalError = console.error;
  const errorLines = [];
  console.error = (...args) => errorLines.push(args.join(' '));
  try {
    const err = new Error('Request failed with status code 401');
    err.response = { status: 401, data: { message: 'bad_partner_token' } };
    axios.get = async () => {
      throw err;
    };
    const result = await aa.search({ origin: 'GRU', destination: 'MIA', departDate: '2026-12-08', returnDate: null });
    assert.equal(result.status, 'error');
    assert.ok(result.message.includes('bad_partner_token'));
    assert.ok(
      errorLines.some((l) => l.includes('[AA:seatsaero]') && l.includes('ERRO DE AUTENTICAÇÃO')),
      `esperava log categorizado, veio: ${JSON.stringify(errorLines)}`
    );
  } finally {
    axios.get = originalGet;
    console.error = originalError;
    delete process.env.SEATSAERO_API_KEY;
  }
});
