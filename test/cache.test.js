require('./helpers/setup');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { cached, clearCache } = require('../src/cache');

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('cached() reaproveita resultado dentro do TTL sem chamar fetchFn de novo', async () => {
  clearCache();
  let calls = 0;
  const fetchFn = async () => {
    calls++;
    return { status: 'ok', offers: [] };
  };
  await cached('k1', 60000, fetchFn);
  await cached('k1', 60000, fetchFn);
  assert.equal(calls, 1);
});

test('chamadas concorrentes pra mesma chave, ainda em andamento, compartilham a MESMA chamada real — não disparam uma pra cada (achado real: rechecagem automática do front multiplicando chamadas pagas)', async () => {
  clearCache();
  let calls = 0;
  const fetchFn = async () => {
    calls++;
    await delay(50);
    return { status: 'ok', offers: [`chamada-${calls}`] };
  };
  const [a, b, c] = await Promise.all([cached('k2', 60000, fetchFn), cached('k2', 60000, fetchFn), cached('k2', 60000, fetchFn)]);
  assert.equal(calls, 1, `esperava 1 chamada real compartilhada, houve ${calls}`);
  assert.deepEqual(a, b);
  assert.deepEqual(b, c);
});

test('depois que a chamada em andamento termina, uma nova chamada fora do TTL dispara fetchFn de novo (dedup não vira cache permanente)', async () => {
  clearCache();
  let calls = 0;
  const fetchFn = async () => {
    calls++;
    return { status: 'ok', offers: [] };
  };
  await cached('k3', 0, fetchFn); // TTL 0: expira na hora
  await delay(5);
  await cached('k3', 0, fetchFn);
  assert.equal(calls, 2);
});

test('resultado com erro não fica em cache nem trava chamadas futuras pra mesma chave', async () => {
  clearCache();
  let calls = 0;
  const fetchFn = async () => {
    calls++;
    return { status: 'error', offers: [] };
  };
  await cached('k4', 60000, fetchFn);
  await cached('k4', 60000, fetchFn);
  assert.equal(calls, 2, 'erro não deveria ficar em cache — cada chamada sequencial deveria tentar de novo');
});
