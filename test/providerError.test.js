require('./helpers/setup');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { describeProviderError, categorizeProviderError, logProviderError } = require('../src/providerError');

function httpError(status, data) {
  const err = new Error(`Request failed with status code ${status}`);
  err.response = { status, data };
  return err;
}

test('categorizeProviderError: 401/403 ou corpo mencionando chave inválida/não assinado -> auth', () => {
  assert.equal(categorizeProviderError(httpError(401, { message: 'Invalid API key' })), 'auth');
  assert.equal(categorizeProviderError(httpError(403, { message: 'You are not subscribed to this API.' })), 'auth');
  // Seats.aero: achado real (ver CLAUDE.md item 1) — chave rejeitada por vir com "Bearer " na frente.
  assert.equal(categorizeProviderError(httpError(403, { message: 'bad_partner_token' })), 'auth');
});

test('categorizeProviderError: 429 ou corpo mencionando cota/rate limit -> quota', () => {
  assert.equal(categorizeProviderError(httpError(429, { message: 'Too Many Requests' })), 'quota');
  assert.equal(categorizeProviderError(httpError(403, { message: 'You have exceeded your monthly quota' })), 'quota');
});

test('categorizeProviderError: ECONNABORTED (timeout do axios) -> timeout', () => {
  const err = new Error('timeout of 15000ms exceeded');
  err.code = 'ECONNABORTED';
  assert.equal(categorizeProviderError(err), 'timeout');
});

test('categorizeProviderError: outro status HTTP (ex: 500) sem palavra-chave reconhecida -> http_error', () => {
  assert.equal(categorizeProviderError(httpError(500, { message: 'Internal Server Error' })), 'http_error');
});

test('categorizeProviderError: sem resposta HTTP nenhuma (servidor fora do ar) -> network', () => {
  const err = new Error('connect ECONNREFUSED 1.2.3.4:443');
  err.code = 'ECONNREFUSED';
  assert.equal(categorizeProviderError(err), 'network');
});

test('categorizeProviderError: erro sem status, sem code reconhecido e sem palavra-chave -> unknown (não quebra)', () => {
  assert.equal(categorizeProviderError(new Error('algo inesperado aconteceu')), 'unknown');
});

test('logProviderError: loga a categoria em maiúsculo + a mensagem detalhada, nunca a chave de API', () => {
  const originalError = console.error;
  const lines = [];
  console.error = (...args) => lines.push(args.join(' '));
  try {
    const err = httpError(429, { message: 'Quota exceeded for this month' });
    const category = logProviderError('SMILES:rapidapi', err);
    assert.equal(category, 'quota');
    assert.ok(lines.some((l) => l.includes('[SMILES:rapidapi]') && l.includes('COTA EXCEDIDA') && l.includes('Quota exceeded')));
    // A chave de API nunca aparece no erro (só no header da requisição, que
    // describeProviderError não olha) — checagem defensiva de regressão.
    assert.ok(!lines.some((l) => /rapidapi-key|partner-authorization/i.test(l)));
  } finally {
    console.error = originalError;
  }
});

test('describeProviderError continua funcionando igual antes (regressão)', () => {
  assert.equal(describeProviderError(httpError(403, { message: 'You are not subscribed to this API.' })), 'HTTP 403: You are not subscribed to this API.');
  assert.equal(describeProviderError(new Error('timeout of 15000ms exceeded')), 'timeout of 15000ms exceeded');
});
