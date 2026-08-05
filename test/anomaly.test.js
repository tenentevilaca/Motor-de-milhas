require('./helpers/setup');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { evaluateOffer } = require('../src/search/anomaly');

const baseline = { avg: 1000, min: 800, samples: 5 };

test('sem preço nem milhas não avalia', () => {
  const result = evaluateOffer({ priceBRL: null, milesRequired: null }, baseline);
  assert.equal(result.isAnomaly, false);
  assert.equal(result.isFlashSale, false);
});

test('histórico insuficiente não aciona nenhuma regra', () => {
  const result = evaluateOffer({ priceBRL: 100 }, { avg: 1000, min: 800, samples: 2 });
  assert.equal(result.isAnomaly, false);
  assert.equal(result.isFlashSale, false);
  assert.match(result.reason, /histórico insuficiente/);
});

test('preço <= 40% da média aciona erro de tarifa primário', () => {
  const result = evaluateOffer({ priceBRL: 390 }, baseline); // 39% da média
  assert.equal(result.isAnomaly, true);
  assert.equal(result.isFlashSale, false);
});

test('preço bem acima de 40% da média mas <= 75% do mínimo aciona regra secundária', () => {
  // 72.5% do mínimo (800) = 580, e 58% da média (1000) — não bate a regra primária (<=40%)
  const result = evaluateOffer({ priceBRL: 580 }, baseline);
  assert.equal(result.isAnomaly, true);
  assert.match(result.reason, /MENOR preço/);
});

test('preço entre 75% e 90% do mínimo é promoção relâmpago, não erro de tarifa', () => {
  const result = evaluateOffer({ priceBRL: 700 }, baseline); // 87.5% do mínimo
  assert.equal(result.isAnomaly, false);
  assert.equal(result.isFlashSale, true);
});

test('preço acima de 90% do mínimo não aciona nenhuma regra', () => {
  const result = evaluateOffer({ priceBRL: 750 }, baseline); // 93.75% do mínimo
  assert.equal(result.isAnomaly, false);
  assert.equal(result.isFlashSale, false);
});

test('usa milesRequired quando não há priceBRL (oferta só-em-milhas)', () => {
  const milesBaseline = { avg: 40000, min: 35000, samples: 5 };
  const result = evaluateOffer({ priceBRL: null, milesRequired: 15000 }, milesBaseline); // 37.5% da média
  assert.equal(result.isAnomaly, true);
});
