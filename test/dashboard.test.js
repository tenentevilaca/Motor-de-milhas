require('./helpers/setup');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildDashboardEntry, csvEscape, historyToCsv } = require('../src/dashboard');

test('csvEscape entre aspas quando o valor tem vírgula (regressão: toLocaleString pt-BR sempre tem vírgula)', () => {
  const withComma = new Date('2026-08-05T14:59:30').toLocaleString('pt-BR');
  assert.ok(withComma.includes(','), 'pré-condição: toLocaleString pt-BR realmente usa vírgula entre data e hora');
  assert.equal(csvEscape(withComma), `"${withComma}"`);
});

test('csvEscape não mexe em valor sem vírgula/aspas/quebra de linha', () => {
  assert.equal(csvEscape('CASH_TRAVELPAYOUTS'), 'CASH_TRAVELPAYOUTS');
  assert.equal(csvEscape(1234), '1234');
  assert.equal(csvEscape(null), '');
});

test('csvEscape escapa aspas internas dobrando-as', () => {
  assert.equal(csvEscape('disse "oi"'), '"disse ""oi"""');
});

test('historyToCsv gera uma linha por checagem sem quebrar colunas por causa da vírgula do timestamp', () => {
  const history = [
    { checkedAt: '2026-08-05T14:59:30.000Z', program: 'CASH_TRAVELPAYOUTS', origin: 'GRU', destination: 'MIA', priceBRL: 1500, milesRequired: null, stops: 0, isAnomaly: false },
    { checkedAt: '2026-08-06T09:00:00.000Z', program: 'SMILES', origin: 'GRU', destination: 'MIA', priceBRL: null, milesRequired: 30000, stops: 1, isAnomaly: true },
  ];
  const csv = historyToCsv(history);
  const lines = csv.split('\n');
  assert.equal(lines.length, 3, 'cabeçalho + 2 linhas de dado');
  assert.equal(lines[0], 'Data,Programa,Origem,Destino,Preço (R$),Milhas,Paradas,Anomalia');
  // A data (1º campo) tem vírgula interna, então precisa estar entre aspas —
  // sem isso o campo "vaza" e desalinha todas as colunas seguintes.
  assert.match(lines[1], /^"[^"]*,[^"]*",CASH_TRAVELPAYOUTS,GRU,MIA,1500,,0,Não$/);
  assert.match(lines[2], /^"[^"]*,[^"]*",SMILES,GRU,MIA,,30000,1,Sim$/);
});

test('buildDashboardEntry calcula isBelowTarget e isAnomaly a partir da última checagem', () => {
  const search = { id: '1', origin: 'GRU', destination: 'MIA', departDate: '2026-11-10', returnDate: null, programs: ['SMILES'], allowStopover: false, allowHiddenCity: false, active: true, targetPrice: 2000, lastRunAt: '2026-08-01T00:00:00Z' };
  const lastEntry = { priceBRL: 1500, isAnomaly: true, checkedAt: '2026-08-05T00:00:00Z' };
  const entry = buildDashboardEntry(search, lastEntry);
  assert.equal(entry.lastPrice, 1500);
  assert.equal(entry.isBelowTarget, true);
  assert.equal(entry.isAnomaly, true);
  assert.equal(entry.lastCheckedAt, '2026-08-05T00:00:00Z');
});

test('buildDashboardEntry sem histórico cai pro lastRunAt e não quebra', () => {
  const search = { id: '2', origin: 'GRU', destination: 'LIS', departDate: null, returnDate: null, programs: [], allowStopover: false, allowHiddenCity: false, active: true, targetPrice: null, lastRunAt: null };
  const entry = buildDashboardEntry(search, undefined);
  assert.equal(entry.lastPrice, null);
  assert.equal(entry.isBelowTarget, false);
  assert.equal(entry.isAnomaly, false);
  assert.equal(entry.lastCheckedAt, null);
});
