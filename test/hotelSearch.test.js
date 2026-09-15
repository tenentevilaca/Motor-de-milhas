require('./helpers/setup');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const { searchHotels } = require('../src/search/hotelSearch');

function withMockedGet(responses, fn) {
  const original = axios.get;
  let call = 0;
  axios.get = async () => responses[Math.min(call++, responses.length - 1)];
  return fn().finally(() => {
    axios.get = original;
  });
}

test('sem RAPIDAPI_KEY: not_configured', async () => {
  delete process.env.RAPIDAPI_KEY;
  const result = await searchHotels({ destination: 'Lisboa', checkIn: '2026-12-08', checkOut: '2026-12-12', adults: 2, rooms: 1 });
  assert.equal(result.status, 'not_configured');
});

test('nenhum destino encontrado: mensagem clara, não é erro', async () => {
  process.env.RAPIDAPI_KEY = 'test-key';
  try {
    await withMockedGet([{ data: { suggestions: [] } }], async () => {
      const result = await searchHotels({ destination: 'xyzxyz-nao-existe', checkIn: '2026-12-08', checkOut: '2026-12-12', adults: 2, rooms: 1 });
      assert.equal(result.status, 'ok');
      assert.equal(result.hotels.length, 0);
    });
  } finally {
    delete process.env.RAPIDAPI_KEY;
  }
});

// Item A do pedido de revisão: erro da busca de destino/hotéis precisa
// categorizar a causa no log, igual os outros providers.
test('erro ao buscar destino (500) loga categoria "http_error"', async () => {
  process.env.RAPIDAPI_KEY = 'test-key';
  const originalError = console.error;
  const errorLines = [];
  console.error = (...args) => errorLines.push(args.join(' '));
  try {
    const err = new Error('Request failed with status code 500');
    err.response = { status: 500, data: { message: 'Internal Server Error' } };
    axios.get = async () => {
      throw err;
    };
    const result = await searchHotels({ destination: 'Lisboa', checkIn: '2026-12-08', checkOut: '2026-12-12', adults: 2, rooms: 1 });
    assert.equal(result.status, 'error');
    assert.ok(
      errorLines.some((l) => l.includes('[TRIVAGO:destinations]') && l.includes('ERRO HTTP')),
      `esperava log categorizado, veio: ${JSON.stringify(errorLines)}`
    );
  } finally {
    delete axios.get;
    console.error = originalError;
    delete process.env.RAPIDAPI_KEY;
  }
});
