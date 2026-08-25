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

// Suspeita real (usuário confirmou voos reais existem via Google Flights,
// mas a integração retornava 0 ofertas mesmo com chave paga funcionando):
// o parsing só aceitava a resposta como array na raiz, nunca confirmado
// contra a API de verdade. Se a API embrulhar a lista num objeto (padrão
// comum em API de viagem no RapidAPI), isso silenciosamente zerava tudo
// sem erro nenhum. Esses testes cobrem os formatos mais prováveis.
for (const [label, wrapKey] of [['data', 'data'], ['flights', 'flights'], ['results', 'results']]) {
  test(`aceita resposta embrulhada em { ${wrapKey}: [...] } — não só array na raiz`, async () => {
    process.env.RAPIDAPI_KEY = 'test-key';
    try {
      await withMockedPost(
        { data: { [wrapKey]: [{ price_as_number: 620, stops: 1, airline: 'Avianca' }] } },
        async () => {
          const result = await provider.search({ origin: 'CNF', destination: 'BOG', departDate: '2026-11-10', returnDate: null });
          assert.equal(result.status, 'ok');
          assert.equal(result.offers.length, 1, `deveria ter achado a oferta dentro de { ${wrapKey}: [...] }`);
          assert.equal(result.offers[0].source, 'Google Flights via RapidAPI (Avianca)');
        }
      );
    } finally {
      delete process.env.RAPIDAPI_KEY;
    }
  });
}

test('formato de resposta totalmente desconhecido: mostra 0 ofertas SEM crashar, e loga as chaves reais pra diagnóstico', async () => {
  process.env.RAPIDAPI_KEY = 'test-key';
  const originalError = console.error;
  const errorLines = [];
  console.error = (...args) => errorLines.push(args.join(' '));
  try {
    await withMockedPost({ data: { status: 'success', payload_that_we_dont_recognize: [{ price_as_number: 620 }] } }, async () => {
      const result = await provider.search({ origin: 'CNF', destination: 'BOG', departDate: '2026-11-10', returnDate: null });
      assert.equal(result.status, 'ok');
      assert.equal(result.offers.length, 0);
    });
  } finally {
    console.error = originalError;
    delete process.env.RAPIDAPI_KEY;
  }
  assert.ok(
    errorLines.some((l) => l.includes('CASH_RAPIDAPI_GFLIGHTS') && l.includes('status') && l.includes('payload_that_we_dont_recognize')),
    `deveria ter logado as chaves reais da resposta pra diagnóstico; logs: ${JSON.stringify(errorLines)}`
  );
});

// Achado real (logs de produção): a rota veio com "resposta em formato
// inesperado" nenhuma (a lista FOI reconhecida — array na raiz ou chave
// conhecida), mas voltou 0 ofertas mesmo com voos reais confirmados fora
// do app. Isso é um caso diferente do "formato desconhecido" acima: o
// array existe e tem itens, só que o nome do campo de preço dentro de
// cada item pode ser outro (nem price_as_number, nem price). Sem log
// específico pra esse caso, fica invisível se é "API não achou nada" (0
// itens) ou "achou mas não consigo ler o preço" (N itens, todos
// descartados) — o segundo exige ajustar o parsing, o primeiro não.
test('itens existem mas nenhum sobrevive ao parsing de preço: loga as chaves do item bruto pra diagnóstico (não confunde com "formato desconhecido")', async () => {
  process.env.RAPIDAPI_KEY = 'test-key';
  const originalError = console.error;
  const errorLines = [];
  console.error = (...args) => errorLines.push(args.join(' '));
  try {
    await withMockedPost(
      { data: [{ total_amount_usd: 620, airline: 'Avianca' }, { total_amount_usd: 700, airline: 'Copa' }] },
      async () => {
        const result = await provider.search({ origin: 'GRU', destination: 'CUR', departDate: '2026-11-10', returnDate: null });
        assert.equal(result.status, 'ok');
        assert.equal(result.offers.length, 0);
      }
    );
  } finally {
    console.error = originalError;
    delete process.env.RAPIDAPI_KEY;
  }
  assert.ok(
    errorLines.some((l) => l.includes('2 item(ns)') && l.includes('total_amount_usd')),
    `deveria ter logado que 2 itens vieram mas nenhum sobrou, com as chaves reais; logs: ${JSON.stringify(errorLines)}`
  );
});

// `price_as_number` era o único nome de campo testado — nunca confirmado
// contra a resposta real da API (só depois de uma rodada inteira sem
// resultado é que apareceu a hipótese de o campo real se chamar só
// `price`). Cobre os dois nomes sem custo nenhum quando o campo certo já
// for `price_as_number`.
test('aceita offer.price como alternativa a offer.price_as_number', async () => {
  process.env.RAPIDAPI_KEY = 'test-key';
  try {
    await withMockedPost(
      { data: [{ price: 450, stops: 0, airline: 'Copa', deeplink: 'https://exemplo.com/comprar' }] },
      async () => {
        const result = await provider.search({ origin: 'CNF', destination: 'BOG', departDate: '2026-11-10', returnDate: null });
        assert.equal(result.offers.length, 1);
        assert.equal(result.offers[0].priceBRL, 450 * 5.5);
        assert.equal(result.offers[0].deepLink, 'https://exemplo.com/comprar');
      }
    );
  } finally {
    delete process.env.RAPIDAPI_KEY;
  }
});
