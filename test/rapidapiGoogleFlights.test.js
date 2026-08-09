require('./helpers/setup');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const provider = require('../src/providers/rapidapiGoogleFlights');

function withMockedPost(response, fn) {
  const original = axios.post;
  axios.post = async () => response;
  return fn().finally(() => {
    axios.post = original;
  });
}

test('inclui ofertas com conexão mesmo sem "Aceitar stopover" marcado — regressão real reportada pelo usuário', async () => {
  process.env.RAPIDAPI_KEY = 'test-key';
  try {
    await withMockedPost(
      {
        data: [
          { price_as_number: 500, stops: 0, airline: 'LATAM', buy_link: null },
          { price_as_number: 400, stops: 1, airline: 'United', buy_link: null },
          { price_as_number: 380, stops: 2, airline: 'American', buy_link: null },
        ],
      },
      async () => {
        // allowStopover NÃO enviado (undefined) — é o padrão real do formulário
        // (checkbox desmarcado). Antes da correção, isso filtrava tudo que não
        // fosse stops===0, mesmo com a chave paga funcionando normalmente.
        const result = await provider.search({ origin: 'GRU', destination: 'MIA', departDate: '2026-11-10', returnDate: null });
        assert.equal(result.status, 'ok');
        assert.equal(result.offers.length, 3, 'as 3 ofertas (direta e com conexão) deveriam aparecer, não só a direta');
        assert.ok(result.offers.some((o) => o.stops === 1));
        assert.ok(result.offers.some((o) => o.stops === 2));
      }
    );
  } finally {
    delete process.env.RAPIDAPI_KEY;
  }
});

test('ainda descarta ofertas sem preço válido (NaN/0/negativo)', async () => {
  process.env.RAPIDAPI_KEY = 'test-key';
  try {
    await withMockedPost(
      {
        data: [
          { price_as_number: 500, stops: 0, airline: 'LATAM' },
          { price_as_number: null, stops: 0, airline: 'Sem preço' },
          { price_as_number: 0, stops: 1, airline: 'Preço zero' },
        ],
      },
      async () => {
        const result = await provider.search({ origin: 'GRU', destination: 'MIA', departDate: '2026-11-10', returnDate: null });
        assert.equal(result.offers.length, 1);
        assert.equal(result.offers[0].source, 'Google Flights via RapidAPI (LATAM)');
      }
    );
  } finally {
    delete process.env.RAPIDAPI_KEY;
  }
});
