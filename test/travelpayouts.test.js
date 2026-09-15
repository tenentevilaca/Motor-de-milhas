require('./helpers/setup');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const provider = require('../src/providers/travelpayouts');

function withMockedGet(response, fn) {
  const original = axios.get;
  axios.get = async () => response;
  return fn().finally(() => {
    axios.get = original;
  });
}

test('sem TRAVELPAYOUTS_TOKEN: not_configured, sem chamar a API', async () => {
  delete process.env.TRAVELPAYOUTS_TOKEN;
  const result = await provider.search({ origin: 'GRU', destination: 'MIA', departDate: '2026-12-08', returnDate: '2026-12-16' });
  assert.equal(result.status, 'not_configured');
  assert.equal(result.offers.length, 0);
});

test('parseia ofertas normalmente quando a API devolve { data: [...] } com preço válido', async () => {
  process.env.TRAVELPAYOUTS_TOKEN = 'test-token';
  try {
    await withMockedGet({ data: { data: [{ value: 3200, number_of_changes: 0 }, { value: 2800, number_of_changes: 1 }] } }, async () => {
      const result = await provider.search({ origin: 'GRU', destination: 'MIA', departDate: '2026-12-08', returnDate: '2026-12-16' });
      assert.equal(result.status, 'ok');
      assert.equal(result.offers.length, 2);
      assert.ok(result.offers.every((o) => o.program === 'CASH_TRAVELPAYOUTS'));
    });
  } finally {
    delete process.env.TRAVELPAYOUTS_TOKEN;
  }
});

// Regressão real (log de produção, GRU->MIA — uma das rotas mais
// movimentadas do Brasil, vinha zerada): os nomes de campo usados antes
// (`price`/`transfers`) nunca bateram com a resposta real da API. Item
// abaixo é o shape REAL confirmado no log (chaves na mesma ordem que
// vieram), não um chute — trava esse formato como regressão.
test('parseia o shape real confirmado em produção: value/number_of_changes, não price/transfers', async () => {
  process.env.TRAVELPAYOUTS_TOKEN = 'test-token';
  try {
    await withMockedGet(
      {
        data: {
          data: [
            {
              depart_date: '2026-12-08',
              origin: 'GRU',
              destination: 'MIA',
              gate: 112,
              return_date: '2026-12-16',
              found_at: '2026-08-20T10:00:00',
              trip_class: 0,
              value: 3450,
              number_of_changes: 1,
              duration: 620,
              distance: 6600,
              show_to_affiliates: true,
              actual: true,
            },
          ],
        },
      },
      async () => {
        const result = await provider.search({ origin: 'GRU', destination: 'MIA', departDate: '2026-12-08', returnDate: '2026-12-16' });
        assert.equal(result.offers.length, 1);
        assert.equal(result.offers[0].priceBRL, 3450);
        assert.equal(result.offers[0].stops, 1);
      }
    );
  } finally {
    delete process.env.TRAVELPAYOUTS_TOKEN;
  }
});

// Pergunta real do usuário: "por que não aparece o voo/companhia?" — essa
// API só devolve o menor preço em cache pra rota, sem companhia nem voo
// (limitação real do endpoint, não bug de parsing). Sem link nenhum, não
// tinha como o usuário nem conferir qual voo é. manualCheckUrl aponta pro
// Google Flights com origem/destino/data já preenchidos.
test('devolve manualCheckUrl (Google Flights com a rota/data preenchida) já que a API não traz companhia/voo', async () => {
  process.env.TRAVELPAYOUTS_TOKEN = 'test-token';
  try {
    await withMockedGet({ data: { data: [{ value: 734, number_of_changes: 0 }] } }, async () => {
      const result = await provider.search({ origin: 'UDI', destination: 'CNF', departDate: '2026-10-09', returnDate: '2026-10-12' });
      assert.ok(result.manualCheckUrl.startsWith('https://www.google.com/travel/flights?q='));
      assert.ok(result.manualCheckUrl.includes(encodeURIComponent('UDI')));
      assert.ok(decodeURIComponent(result.manualCheckUrl).includes('through 2026-10-12'));
    });
  } finally {
    delete process.env.TRAVELPAYOUTS_TOKEN;
  }
});

test('descarta itens sem preço válido (NaN/0/negativo/ausente) — não vira "oferta fantasma"', async () => {
  process.env.TRAVELPAYOUTS_TOKEN = 'test-token';
  try {
    await withMockedGet(
      { data: { data: [{ value: 3200 }, { value: null }, { value: 0 }, {}] } },
      async () => {
        const result = await provider.search({ origin: 'GRU', destination: 'MIA', departDate: '2026-12-08', returnDate: null });
        assert.equal(result.offers.length, 1);
        assert.equal(result.offers[0].priceBRL, 3200);
      }
    );
  } finally {
    delete process.env.TRAVELPAYOUTS_TOKEN;
  }
});

test('resposta em formato inesperado (sem data.data como array): 0 ofertas sem crashar, loga as chaves reais pra diagnóstico', async () => {
  process.env.TRAVELPAYOUTS_TOKEN = 'test-token';
  const originalError = console.error;
  const errorLines = [];
  console.error = (...args) => errorLines.push(args.join(' '));
  try {
    await withMockedGet({ data: { status: 'error', reason: 'algo mudou' } }, async () => {
      const result = await provider.search({ origin: 'GRU', destination: 'MIA', departDate: '2026-12-08', returnDate: null });
      assert.equal(result.status, 'ok');
      assert.equal(result.offers.length, 0);
    });
  } finally {
    console.error = originalError;
    delete process.env.TRAVELPAYOUTS_TOKEN;
  }
  assert.ok(
    errorLines.some((l) => l.includes('CASH_TRAVELPAYOUTS') && l.includes('status') && l.includes('reason')),
    `deveria ter logado as chaves reais da resposta; logs: ${JSON.stringify(errorLines)}`
  );
});

test('lista reconhecida mas vazia: loga que não achou preço pra essa rota/data (não confunde com formato inesperado)', async () => {
  process.env.TRAVELPAYOUTS_TOKEN = 'test-token';
  const originalLog = console.log;
  const logLines = [];
  console.log = (...args) => logLines.push(args.join(' '));
  try {
    await withMockedGet({ data: { data: [] } }, async () => {
      const result = await provider.search({ origin: 'GRU', destination: 'CUR', departDate: '2026-12-08', returnDate: null });
      assert.equal(result.offers.length, 0);
    });
  } finally {
    console.log = originalLog;
    delete process.env.TRAVELPAYOUTS_TOKEN;
  }
  assert.ok(
    logLines.some((l) => l.includes('CASH_TRAVELPAYOUTS') && l.includes('0 itens')),
    `logs: ${JSON.stringify(logLines)}`
  );
});

test('itens existem mas nenhum sobrevive ao parsing de preço: loga as chaves do item bruto', async () => {
  process.env.TRAVELPAYOUTS_TOKEN = 'test-token';
  const originalError = console.error;
  const errorLines = [];
  console.error = (...args) => errorLines.push(args.join(' '));
  try {
    await withMockedGet({ data: { data: [{ amount_brl: 3200 }, { amount_brl: 2800 }] } }, async () => {
      const result = await provider.search({ origin: 'GRU', destination: 'MIA', departDate: '2026-12-08', returnDate: null });
      assert.equal(result.offers.length, 0);
    });
  } finally {
    console.error = originalError;
    delete process.env.TRAVELPAYOUTS_TOKEN;
  }
  assert.ok(
    errorLines.some((l) => l.includes('2 item(ns)') && l.includes('amount_brl')),
    `logs: ${JSON.stringify(errorLines)}`
  );
});

// Achado real: usuário reportou Travelpayouts (cache) mostrando R$2.004
// numa rota onde o Google Flights ao vivo mostrava R$3.343+ — o código
// nunca lia found_at/actual (que a própria API já devolve pra sinalizar
// preço desatualizado), então um preço velho aparecia igual a um preço
// confirmado, sem nenhum aviso. Toda oferta dessa fonte precisa vir
// marcada como referência de cache, nunca como preço confirmado.
test('toda oferta vem marcada como cached_reference, com observedAt/actual extraídos de found_at/actual da API', async () => {
  process.env.TRAVELPAYOUTS_TOKEN = 'test-token';
  try {
    await withMockedGet(
      { data: { data: [{ value: 2004, number_of_changes: 0, found_at: '2026-08-01T10:00:00', actual: false }] } },
      async () => {
        const result = await provider.search({ origin: 'GRU', destination: 'CUN', departDate: '2026-12-06', returnDate: '2026-12-13' });
        const offer = result.offers[0];
        assert.equal(offer.isCachedPrice, true);
        assert.equal(offer.isLive, false);
        assert.equal(offer.priceType, 'cached_reference');
        assert.equal(offer.priceDisclaimer, 'Preço observado recentemente no cache do Travelpayouts; confirme o valor atual antes de comprar.');
        assert.equal(offer.observedAt, '2026-08-01T10:00:00');
        assert.equal(offer.actual, false);
      }
    );
  } finally {
    delete process.env.TRAVELPAYOUTS_TOKEN;
  }
});

test('observedAt/actual ficam null quando a API não devolve found_at/actual nesse item', async () => {
  process.env.TRAVELPAYOUTS_TOKEN = 'test-token';
  try {
    await withMockedGet({ data: { data: [{ value: 1500, number_of_changes: 0 }] } }, async () => {
      const result = await provider.search({ origin: 'GRU', destination: 'MIA', departDate: '2026-12-08', returnDate: null });
      assert.equal(result.offers[0].observedAt, null);
      assert.equal(result.offers[0].actual, null);
    });
  } finally {
    delete process.env.TRAVELPAYOUTS_TOKEN;
  }
});

// Item pedido explicitamente: o link dessa fonte não pode ser tratado como
// confirmação do mesmo voo — deepLink continua sempre ausente (a oferta só
// tem manualCheckUrl, um link genérico de busca no Google Flights, nunca
// um link pra um voo/preço específico).
test('nunca tem deepLink — só manualCheckUrl (link genérico de conferência, não de reserva do voo específico)', async () => {
  process.env.TRAVELPAYOUTS_TOKEN = 'test-token';
  try {
    await withMockedGet({ data: { data: [{ value: 2004, number_of_changes: 0 }] } }, async () => {
      const result = await provider.search({ origin: 'GRU', destination: 'CUN', departDate: '2026-12-06', returnDate: '2026-12-13' });
      assert.equal(result.offers[0].deepLink, null);
      assert.ok(result.manualCheckUrl.startsWith('https://www.google.com/travel/flights?q='));
    });
  } finally {
    delete process.env.TRAVELPAYOUTS_TOKEN;
  }
});

test('loga resumo seguro (rota/datas/quantidade/menor preço) sem token nem resposta bruta', async () => {
  process.env.TRAVELPAYOUTS_TOKEN = 'test-token-secreto-nao-pode-vazar';
  const originalLog = console.log;
  const logLines = [];
  console.log = (...args) => logLines.push(args.join(' '));
  try {
    await withMockedGet({ data: { data: [{ value: 2004, number_of_changes: 0 }] } }, async () => {
      await provider.search({ origin: 'GRU', destination: 'CUN', departDate: '2026-12-06', returnDate: '2026-12-13' });
    });
  } finally {
    console.log = originalLog;
    delete process.env.TRAVELPAYOUTS_TOKEN;
  }
  const summaryLine = logLines.find((l) => l.includes('[CASH_TRAVELPAYOUTS]') && l.includes('GRU->CUN'));
  assert.ok(summaryLine, `esperava log de resumo da busca, veio: ${JSON.stringify(logLines)}`);
  assert.ok(summaryLine.includes('ofertas=1') && summaryLine.includes('menor_preco=2004'));
  assert.ok(summaryLine.includes('isLive=false') && summaryLine.includes('isCachedPrice=true'));
  assert.ok(!logLines.some((l) => l.includes('test-token-secreto-nao-pode-vazar')), 'token não pode aparecer em log nenhum');
});
