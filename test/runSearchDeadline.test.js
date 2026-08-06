require('./helpers/setup');
const { test } = require('node:test');
const assert = require('node:assert/strict');

// Precisa setar os env vars ANTES do primeiro require de runSearch.js —
// os orçamentos de tempo são lidos uma vez no topo do módulo. Usa valores
// bem menores que o default (10s/20s) pra manter o teste rápido.
process.env.SEARCH_PROVIDER_SOFT_DEADLINE_MS = '100';
process.env.SEARCH_RESPONSE_DEADLINE_MS = '250';
delete require.cache[require.resolve('../src/search/runSearch')];
const { runSearch } = require('../src/search/runSearch');

const providers = require('../src/providers');
const db = require('../src/db');
const { clearCache } = require('../src/cache');

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stubAllNotConfigured() {
  for (const id of ['CASH_TRAVELPAYOUTS', 'CASH_RAPIDAPI_GFLIGHTS', 'SMILES', 'AZUL', 'AA', 'LATAM']) {
    providers.ALL_PROVIDERS[id].search = async () => ({ status: 'not_configured', offers: [] });
  }
}

test('provider mais lento que o orçamento vira "pending" na resposta, mas continua rodando e alimenta o cache', async () => {
  clearCache();
  stubAllNotConfigured();
  let callCount = 0;
  providers.ALL_PROVIDERS.CASH_TRAVELPAYOUTS.search = async () => {
    callCount++;
    await delay(300); // bem mais que os 100ms do orçamento por provider
    return { status: 'ok', offers: [{ program: 'CASH_TRAVELPAYOUTS', priceBRL: 1234, milesRequired: null, taxesBRL: null, stops: 0, isHiddenCity: false, deepLink: null, source: 'stub' }] };
  };

  const search = db.createSearch({ origin: 'GRU', destination: 'MIA', departDate: '2026-11-10' });

  const t0 = Date.now();
  const first = await runSearch(search);
  const firstElapsed = Date.now() - t0;

  assert.ok(firstElapsed < 250, `deveria responder perto do orçamento de 100ms, levou ${firstElapsed}ms`);
  const pendingResult = first.providerResults.find((r) => r.programId === 'CASH_TRAVELPAYOUTS');
  assert.equal(pendingResult.status, 'pending');
  assert.equal(first.allOffersSorted.some((o) => o.program === 'CASH_TRAVELPAYOUTS'), false, 'não deveria ter oferta da fonte que ainda não respondeu');

  // Espera a chamada "abandonada" terminar de verdade em segundo plano.
  await delay(400);

  // Roda de novo — se o cache foi preenchido pela chamada de fundo, o
  // provider NÃO deveria ser chamado uma segunda vez (cache hit instantâneo).
  const second = await runSearch(search);
  assert.equal(callCount, 1, 'a chamada real ao provider deveria ter rodado só uma vez (a segunda busca deveria vir do cache)');
  const okResult = second.providerResults.find((r) => r.programId === 'CASH_TRAVELPAYOUTS');
  assert.equal(okResult.status, 'ok');
  assert.equal(second.allOffersSorted.some((o) => o.program === 'CASH_TRAVELPAYOUTS' && o.priceBRL === 1234), true);
});

test('orçamento total interrompe combinações de data restantes e reporta partialResults', async () => {
  clearCache();
  stubAllNotConfigured();
  providers.ALL_PROVIDERS.CASH_TRAVELPAYOUTS.search = async () => {
    await delay(90); // um pouco menos que o orçamento por provider (100ms), mas cada combinação de data soma tempo
    return { status: 'ok', offers: [{ program: 'CASH_TRAVELPAYOUTS', priceBRL: 1000, milesRequired: null, taxesBRL: null, stops: 0, isHiddenCity: false, deepLink: null, source: 'stub' }] };
  };

  // flexDays=9 gera até 19 combinações de data. As combinações rodam com
  // teto de concorrência 3 (REGION_SEARCH_CONCURRENCY) — a 90ms cada, em
  // grupos de até 3 simultâneas, ainda ultrapassa os 250ms de orçamento
  // total bem antes de testar todas (precisa de margem suficiente pra não
  // ser sensível à variação de timing de setTimeout real).
  const search = db.createSearch({ origin: 'GRU', destination: 'LIS', departDate: '2026-11-10', flexDays: 9 });
  const result = await runSearch(search);

  assert.equal(result.partialResults, true);
  assert.ok(result.combinationsSkipped > 0, 'deveria ter pulado pelo menos 1 combinação por causa do orçamento total');
});

test('busca por região consulta os hubs em paralelo (teto de concorrência), não um de cada vez', async () => {
  clearCache();
  stubAllNotConfigured();
  // Achado com busca real: região da América do Sul tem 7 hubs (sem contar
  // a origem). Sequencial, um de cada vez, a 70ms por hub, precisaria de
  // 490ms — bem mais que o orçamento total de 250ms, então boa parte dos
  // hubs nunca seria sequer consultada (o bug relatado pelo usuário: "toda
  // a América do Sul" voltando "nenhuma oferta" com uma única fonte lenta).
  // Rodando em paralelo (teto 3), 7 hubs cabem em só 3 rodadas (~210ms),
  // dentro do orçamento — todos os hubs chegam a ser consultados de verdade.
  providers.ALL_PROVIDERS.CASH_TRAVELPAYOUTS.search = async () => {
    await delay(70);
    return { status: 'ok', offers: [{ program: 'CASH_TRAVELPAYOUTS', priceBRL: 1000, milesRequired: null, taxesBRL: null, stops: 0, isHiddenCity: false, deepLink: null, source: 'stub' }] };
  };

  const search = db.createSearch({ origin: 'GRU', destination: 'REGION:SA', departDate: '2026-11-10' });
  const result = await runSearch(search);

  const destinationsQueried = new Set(result.providerResults.map((r) => r.destination));
  assert.equal(destinationsQueried.size, 7, 'os 7 hubs da América do Sul (exceto a origem GRU) deveriam ter sido consultados dentro do orçamento, não só os primeiros');
  assert.equal(result.partialResults, false);
  assert.equal(result.combinationsSkipped, 0);
});
