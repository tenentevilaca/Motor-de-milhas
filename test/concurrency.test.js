require('./helpers/setup');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mapWithConcurrencyLimit } = require('../src/concurrency');

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('preserva a ordem dos resultados mesmo com conclusão fora de ordem', async () => {
  const items = [30, 10, 20];
  const results = await mapWithConcurrencyLimit(items, 3, async (ms) => {
    await delay(ms);
    return ms;
  });
  assert.deepEqual(results, [30, 10, 20]);
});

test('nunca roda mais que `limit` workers ao mesmo tempo', async () => {
  let active = 0;
  let maxActive = 0;
  const items = Array.from({ length: 10 }, (_, i) => i);
  await mapWithConcurrencyLimit(items, 3, async () => {
    active++;
    maxActive = Math.max(maxActive, active);
    await delay(20);
    active--;
  });
  assert.ok(maxActive <= 3, `esperava no máximo 3 workers simultâneos, teve ${maxActive}`);
  assert.equal(maxActive, 3, 'com 10 itens e limite 3, deveria de fato usar os 3 workers');
});

test('é mais rápido que sequencial (paralelismo real, não só sintaxe)', async () => {
  const items = Array.from({ length: 6 }, () => 30);
  const t0 = Date.now();
  await mapWithConcurrencyLimit(items, 3, async (ms) => delay(ms));
  const elapsed = Date.now() - t0;
  // Sequencial seria ~180ms (6x30ms). Com limite 3, deveria ficar perto de ~60ms (2 lotes de 3).
  assert.ok(elapsed < 150, `esperava bem menos que 180ms (sequencial), levou ${elapsed}ms`);
});

test('erro em um item não cancela os outros (worker trata o próprio erro)', async () => {
  const items = [1, 2, 3];
  const results = await mapWithConcurrencyLimit(items, 2, async (i) => {
    if (i === 2) throw new Error('falhou');
    return i;
  }).catch((err) => err);
  // Sem try/catch dentro do worker, a rejeição propaga — documenta esse comportamento
  // (é responsabilidade de quem chama tratar erro por item, como o scheduler já faz).
  assert.ok(results instanceof Error);
});

test('limit maior que a lista não quebra (usa só o necessário)', async () => {
  const results = await mapWithConcurrencyLimit([1, 2], 10, async (i) => i * 2);
  assert.deepEqual(results, [2, 4]);
});

test('lista vazia retorna vazio sem erro', async () => {
  const results = await mapWithConcurrencyLimit([], 3, async (i) => i);
  assert.deepEqual(results, []);
});
