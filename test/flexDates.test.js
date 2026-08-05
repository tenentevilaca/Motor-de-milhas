require('./helpers/setup');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { generateFlexDates } = require('../src/search/flexDates');

test('sem flexDays retorna só a data original', () => {
  assert.deepEqual(generateFlexDates('2026-11-10', 0), ['2026-11-10']);
});

test('sem baseDate retorna [baseDate] mesmo com flexDays > 0', () => {
  assert.deepEqual(generateFlexDates(null, 3), [null]);
});

test('flexDays gera datas em torno da original, sem repetir e sem escorregar de mês', () => {
  const dates = generateFlexDates('2026-11-01', 2);
  // original + (-1,+1) + (-2,+2) = 5 datas
  assert.equal(dates.length, 5);
  assert.equal(dates[0], '2026-11-01');
  assert.ok(dates.includes('2026-10-31'), 'deve cruzar a virada de mês pra trás');
  assert.ok(dates.includes('2026-11-02'));
  assert.ok(dates.includes('2026-10-30'));
  assert.ok(dates.includes('2026-11-03'));
  assert.equal(new Set(dates).size, 5, 'não deve haver datas duplicadas');
});

test('flexDays cruza virada de ano corretamente (usa componentes de data, não string)', () => {
  const dates = generateFlexDates('2026-01-01', 1);
  assert.ok(dates.includes('2025-12-31'));
  assert.ok(dates.includes('2026-01-02'));
});
