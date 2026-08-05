require('./helpers/setup');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../src/db');
const { getBestTimeAdvice } = require('../src/search/bestTimeToBuy');

test('detecta tendência de alta e sintetiza um veredito "comprar agora"', () => {
  const now = Date.now();
  const entries = [1000, 1050, 1100, 1150, 1300].map((p, i) => ({
    origin: 'GRU', destination: 'MIA', program: 'CASH_TRAVELPAYOUTS', priceBRL: p,
    departDate: '2026-11-10', checkedAt: new Date(now - (5 - i) * 86400000).toISOString(),
  }));
  db.addHistoryEntries(entries);

  const advice = getBestTimeAdvice({ origin: 'GRU', destination: 'MIA', departDate: '2026-11-10', program: 'CASH_TRAVELPAYOUTS' });

  assert.equal(advice.trend.trend, 'rising');
  assert.ok(advice.verdict, 'deve haver um veredito quando há data e tendência');
  assert.equal(advice.verdict.action, 'buy_now');
});

test('tendência de queda sugere esperar', () => {
  const now = Date.now();
  const entries = [1300, 1150, 1100, 1050, 1000].map((p, i) => ({
    origin: 'GIG', destination: 'LIS', program: 'CASH_TRAVELPAYOUTS', priceBRL: p,
    departDate: '2027-03-10', checkedAt: new Date(now - (5 - i) * 86400000).toISOString(),
  }));
  db.addHistoryEntries(entries);

  const advice = getBestTimeAdvice({ origin: 'GIG', destination: 'LIS', departDate: '2027-03-10', program: 'CASH_TRAVELPAYOUTS' });

  assert.equal(advice.trend.trend, 'falling');
  assert.equal(advice.verdict.action, 'wait');
});

test('sem histórico suficiente não gera insight histórico nem tendência', () => {
  const advice = getBestTimeAdvice({ origin: 'CNF', destination: 'EZE', departDate: '2027-01-01', program: 'CASH_TRAVELPAYOUTS' });
  assert.equal(advice.historical.available, false);
  assert.equal(advice.trend, null);
});

test('estatística por mês e por dia da semana usa amostras reais do histórico', () => {
  const now = Date.now();
  const entries = [];
  for (let i = 0; i < 4; i++) {
    entries.push({ origin: 'GRU', destination: 'LIS', program: 'CASH_TRAVELPAYOUTS', priceBRL: 900 + i * 5, departDate: `2026-06-1${i}`, checkedAt: new Date(now - 10 * 86400000).toISOString() });
  }
  db.addHistoryEntries(entries);
  const advice = getBestTimeAdvice({ origin: 'GRU', destination: 'LIS', departDate: null });
  assert.equal(advice.historical.available, true);
  assert.ok(advice.historical.cheapestMonths.some((m) => m.month === 6));
});
