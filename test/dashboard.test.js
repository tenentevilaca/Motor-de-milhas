require('./helpers/setup');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildDashboardEntry, csvEscape, historyToCsv } = require('../src/dashboard');
const db = require('../src/db');

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

test('buildDashboardEntry calcula variação % corretamente (recente vs anterior, não invertido)', () => {
  const search = { id: '3', origin: 'GRU', destination: 'MIA', departDate: '2026-11-10', returnDate: null, programs: [], allowStopover: false, allowHiddenCity: false, active: true, targetPrice: null, lastRunAt: null };
  // Preço caiu de 1500 (checagem anterior) pra 1000 (mais recente) — variação deve ser negativa (queda == bom, verde).
  const previous = { priceBRL: 1500, checkedAt: '2026-08-01T00:00:00Z' };
  const last = { priceBRL: 1000, checkedAt: '2026-08-02T00:00:00Z' };
  const entry = buildDashboardEntry(search, last, previous);
  assert.equal(entry.lastPrice, 1000, 'lastPrice deve ser o preço da checagem MAIS RECENTE, não a anterior');
  assert.ok(entry.variationPercent < 0, 'preço caiu, variação deve ser negativa');
  assert.equal(Math.round(entry.variationPercent), -33);
  assert.equal(entry.variationLabel, '-33.3%');
});

test('buildDashboardEntry sem checagem anterior não calcula variação (não quebra com 1 entrada só)', () => {
  const search = { id: '4', origin: 'GRU', destination: 'MIA', departDate: '2026-11-10', returnDate: null, programs: [], allowStopover: false, allowHiddenCity: false, active: true, targetPrice: null, lastRunAt: null };
  const entry = buildDashboardEntry(search, { priceBRL: 1000, checkedAt: '2026-08-01T00:00:00Z' }, undefined);
  assert.equal(entry.lastPrice, 1000);
  assert.equal(entry.variationPercent, null);
  assert.equal(entry.variationLabel, null);
});

test('fluxo real (db.getHistoryForSearch + indexação do server.js) não inverte recente/anterior', () => {
  // Reproduz exatamente a lógica de /api/dashboard em server.js — regressão
  // específica: com getHistoryForSearch(id, 2) devolvendo em ordem
  // cronológica, pegar history[0]/history[1] direto (sem indexar a partir
  // do fim) inverte qual é a checagem mais recente.
  const search = db.createSearch({ origin: 'GRU', destination: 'EZE', departDate: '2026-11-10' });
  db.addHistoryEntries([
    { searchId: search.id, origin: 'GRU', destination: 'EZE', program: 'CASH_TRAVELPAYOUTS', priceBRL: 800, checkedAt: '2026-08-01T00:00:00Z' },
    { searchId: search.id, origin: 'GRU', destination: 'EZE', program: 'CASH_TRAVELPAYOUTS', priceBRL: 600, checkedAt: '2026-08-02T00:00:00Z' },
  ]);

  const recent = db.getHistoryForSearch(search.id, 2);
  const last = recent[recent.length - 1];
  const previous = recent.length > 1 ? recent[recent.length - 2] : undefined;
  const entry = buildDashboardEntry(search, last, previous);

  assert.equal(entry.lastPrice, 600, 'preço mais recente (02/08) precisa ser o exibido, não o de 01/08');
  assert.ok(entry.variationPercent < 0, 'de 800 pra 600 é queda — variação deve ser negativa');
});

test('buildDashboardEntry sem histórico cai pro lastRunAt e não quebra', () => {
  const search = { id: '2', origin: 'GRU', destination: 'LIS', departDate: null, returnDate: null, programs: [], allowStopover: false, allowHiddenCity: false, active: true, targetPrice: null, lastRunAt: null };
  const entry = buildDashboardEntry(search, undefined);
  assert.equal(entry.lastPrice, null);
  assert.equal(entry.isBelowTarget, false);
  assert.equal(entry.isAnomaly, false);
  assert.equal(entry.lastCheckedAt, null);
});
