require('./helpers/setup');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const providers = require('../src/providers');
const { runSearch } = require('../src/search/runSearch');
const db = require('../src/db');
const { clearCache } = require('../src/cache');

function stubAllNotConfigured() {
  for (const id of ['CASH_TRAVELPAYOUTS', 'CASH_RAPIDAPI_GFLIGHTS', 'SMILES', 'AZUL', 'AA', 'LATAM']) {
    providers.ALL_PROVIDERS[id].search = async () => ({ status: 'not_configured', offers: [] });
  }
}

test('passageiros > 1 escala preço, milhas e taxas — não só o preço', async () => {
  clearCache();
  stubAllNotConfigured();
  providers.ALL_PROVIDERS.CASH_TRAVELPAYOUTS.search = async () => ({
    status: 'ok',
    offers: [{ program: 'CASH_TRAVELPAYOUTS', priceBRL: 1000, milesRequired: null, taxesBRL: null, stops: 0, isHiddenCity: false, deepLink: null, source: 'stub' }],
  });
  providers.ALL_PROVIDERS.SMILES.search = async () => ({
    status: 'ok',
    offers: [{ program: 'SMILES', priceBRL: null, milesRequired: 30000, taxesBRL: 45, stops: 0, isHiddenCity: false, deepLink: null, source: 'stub' }],
  });

  const search = db.createSearch({ origin: 'GRU', destination: 'MIA', departDate: '2026-11-10', programs: ['SMILES'], passengers: 3 });
  const result = await runSearch(search);

  const cash = result.allOffersSorted.find((o) => o.program === 'CASH_TRAVELPAYOUTS');
  const miles = result.allOffersSorted.find((o) => o.program === 'SMILES');

  assert.equal(cash.priceBRLTotal, 3000);
  assert.equal(miles.milesRequiredTotal, 90000);
  assert.equal(miles.taxesBRLTotal, 135);
  assert.equal(result.passengers, 3);
});

test('passageiros = 1 (padrão) não adiciona campos de total', async () => {
  clearCache();
  stubAllNotConfigured();
  providers.ALL_PROVIDERS.CASH_TRAVELPAYOUTS.search = async () => ({
    status: 'ok',
    offers: [{ program: 'CASH_TRAVELPAYOUTS', priceBRL: 1000, milesRequired: null, taxesBRL: null, stops: 0, isHiddenCity: false, deepLink: null, source: 'stub' }],
  });

  const search = db.createSearch({ origin: 'GRU', destination: 'MIA', departDate: '2026-11-11', programs: [] });
  const result = await runSearch(search);
  const cash = result.allOffersSorted.find((o) => o.program === 'CASH_TRAVELPAYOUTS');
  assert.equal(cash.priceBRLTotal, undefined);
});

test('arbitragem só compara oferta em milhas com dinheiro do MESMO destino+data', async () => {
  clearCache();
  stubAllNotConfigured();
  providers.ALL_PROVIDERS.CASH_TRAVELPAYOUTS.search = async ({ departDate }) => ({
    status: 'ok',
    offers: [{ program: 'CASH_TRAVELPAYOUTS', priceBRL: departDate === '2026-11-12' ? 500 : 5000, milesRequired: null, taxesBRL: null, stops: 0, isHiddenCity: false, deepLink: null, source: 'stub' }],
  });
  providers.ALL_PROVIDERS.SMILES.search = async ({ departDate }) => ({
    status: 'ok',
    offers: [{ program: 'SMILES', priceBRL: null, milesRequired: 30000, taxesBRL: 45, stops: 0, isHiddenCity: false, deepLink: null, source: 'stub' }],
  });

  const search = db.createSearch({ origin: 'GRU', destination: 'MIA', departDate: '2026-11-12', flexDays: 1, programs: ['SMILES'] });
  const result = await runSearch(search);

  const milesOffers = result.allOffersSorted.filter((o) => o.program === 'SMILES');
  for (const o of milesOffers) {
    if (o.arbitrage) {
      assert.equal(o.arbitrage.cashReferenceBRL, o.departDate === '2026-11-12' ? 500 : 5000, `arbitragem da data ${o.departDate} deve referenciar o preço em dinheiro DA MESMA data`);
    }
  }
});

test('isNewLow marca a oferta quando o preço bate o mínimo histórico da rota', async () => {
  clearCache();
  stubAllNotConfigured();

  // Primeira busca: sem histórico anterior nenhum, não deveria alegar "novo mínimo"
  // (regra: precisa de pelo menos 1 amostra pra existir um recorde pra bater).
  providers.ALL_PROVIDERS.CASH_TRAVELPAYOUTS.search = async () => ({
    status: 'ok',
    offers: [{ program: 'CASH_TRAVELPAYOUTS', priceBRL: 1000, milesRequired: null, taxesBRL: null, stops: 0, isHiddenCity: false, deepLink: null, source: 'stub' }],
  });
  const search1 = db.createSearch({ origin: 'GRU', destination: 'CNF', departDate: '2026-12-01' });
  const result1 = await runSearch(search1);
  const offer1 = result1.allOffersSorted.find((o) => o.program === 'CASH_TRAVELPAYOUTS');
  assert.equal(offer1.isNewLow, false, 'primeira checagem de uma rota não é "recorde batido" — não há nada anterior pra comparar');
  assert.equal(result1.bestDeal.isNewLow, false);

  // Segunda busca, preço mais alto: não deveria bater o mínimo (1000 continua sendo o menor).
  providers.ALL_PROVIDERS.CASH_TRAVELPAYOUTS.search = async () => ({
    status: 'ok',
    offers: [{ program: 'CASH_TRAVELPAYOUTS', priceBRL: 1200, milesRequired: null, taxesBRL: null, stops: 0, isHiddenCity: false, deepLink: null, source: 'stub' }],
  });
  const search2 = db.createSearch({ origin: 'GRU', destination: 'CNF', departDate: '2026-12-08' });
  const result2 = await runSearch(search2);
  const offer2 = result2.allOffersSorted.find((o) => o.program === 'CASH_TRAVELPAYOUTS');
  assert.equal(offer2.isNewLow, false, '1200 é mais caro que o mínimo histórico (1000) — não é recorde');

  // Terceira busca, preço mais baixo que qualquer checagem anterior: deve bater recorde.
  providers.ALL_PROVIDERS.CASH_TRAVELPAYOUTS.search = async () => ({
    status: 'ok',
    offers: [{ program: 'CASH_TRAVELPAYOUTS', priceBRL: 700, milesRequired: null, taxesBRL: null, stops: 0, isHiddenCity: false, deepLink: null, source: 'stub' }],
  });
  const search3 = db.createSearch({ origin: 'GRU', destination: 'CNF', departDate: '2026-12-15' });
  const result3 = await runSearch(search3);
  const offer3 = result3.allOffersSorted.find((o) => o.program === 'CASH_TRAVELPAYOUTS');
  assert.equal(offer3.isNewLow, true, '700 é mais barato que qualquer checagem anterior (1000, 1200) — deveria bater recorde');
  assert.equal(result3.bestDeal.isNewLow, true);

  // isNewLow também precisa ficar gravado no HISTÓRICO (não só na resposta
  // dessa busca) — é o dado que o dashboard usa pro badge "🎉 Novo
  // recorde!" e pro sinal +20 do score de oportunidade; sem persistir,
  // ambos ficariam mortos (sempre false) porque dependem da ÚLTIMA entrada
  // do histórico, não da resposta desse runSearch específico.
  const persisted = db.getHistoryForSearch(search3.id, 1)[0];
  assert.equal(persisted.priceBRL, 700);
  assert.equal(persisted.isNewLow, true, 'isNewLow precisa estar gravado no histórico, não só no retorno da busca');
});

test('priceFairness exige pelo menos 3 amostras ANTERIORES nos últimos 30 dias antes de rotular "bom"/"ruim"', async () => {
  clearCache();
  stubAllNotConfigured();
  // Mesma regra do isNewLow: o baseline usado é o histórico ANTES de gravar
  // a checagem atual (senão a oferta se compararia com ela mesma). Então
  // fazem falta 3 checagens anteriores — a quarta é a primeira com veredito.
  providers.ALL_PROVIDERS.CASH_TRAVELPAYOUTS.search = async () => ({
    status: 'ok',
    offers: [{ program: 'CASH_TRAVELPAYOUTS', priceBRL: 1000, milesRequired: null, taxesBRL: null, stops: 0, isHiddenCity: false, deepLink: null, source: 'stub' }],
  });
  const dates = ['2026-12-01', '2026-12-08', '2026-12-15'];
  let result;
  for (const departDate of dates) {
    const search = db.createSearch({ origin: 'GRU', destination: 'REC', departDate });
    result = await runSearch(search);
    const offer = result.allOffersSorted.find((o) => o.program === 'CASH_TRAVELPAYOUTS');
    assert.equal(offer.priceFairness, undefined, `checagem de ${departDate}: histórico anterior ainda tem menos de 3 amostras`);
  }

  const search4 = db.createSearch({ origin: 'GRU', destination: 'REC', departDate: '2026-12-22' });
  const result4 = await runSearch(search4);
  const offer4 = result4.allOffersSorted.find((o) => o.program === 'CASH_TRAVELPAYOUTS');
  assert.ok(offer4.priceFairness, 'com 3 checagens anteriores já dá pra calcular a média com confiança');
  assert.equal(offer4.priceFairness.verdict, 'fair', '1000 é igual à própria média — nem "bom" nem "ruim"');
  assert.equal(offer4.priceFairness.avg30d, 1000);
});

test('priceFairness classifica bom/ruim pela distância da média de 30 dias e dispara alerta quando bom', async () => {
  clearCache();
  stubAllNotConfigured();
  providers.ALL_PROVIDERS.CASH_TRAVELPAYOUTS.search = async () => ({
    status: 'ok',
    offers: [{ program: 'CASH_TRAVELPAYOUTS', priceBRL: 1000, milesRequired: null, taxesBRL: null, stops: 0, isHiddenCity: false, deepLink: null, source: 'stub' }],
  });
  // 3 checagens de baseline (1000 cada) pra ter amostra suficiente na 4ª.
  for (const departDate of ['2027-01-05', '2027-01-06', '2027-01-07']) {
    const search = db.createSearch({ origin: 'GRU', destination: 'FOR', departDate });
    await runSearch(search);
  }

  // Quarta checagem, ainda em 1000: está exatamente na média — "fair", sem alerta de preço bom.
  const search4 = db.createSearch({ origin: 'GRU', destination: 'FOR', departDate: '2027-01-08' });
  const result4 = await runSearch(search4);
  assert.equal(result4.allOffersSorted.find((o) => o.program === 'CASH_TRAVELPAYOUTS').priceFairness.verdict, 'fair');
  assert.equal(result4.alertCount, 0);

  // Quinta checagem: 850 é 15% abaixo da média histórica (1000) — deve marcar "good" e virar alerta,
  // mesmo sem target price definido e sem ser um erro de tarifa (não é extremo o bastante pro anomaly.js).
  providers.ALL_PROVIDERS.CASH_TRAVELPAYOUTS.search = async () => ({
    status: 'ok',
    offers: [{ program: 'CASH_TRAVELPAYOUTS', priceBRL: 850, milesRequired: null, taxesBRL: null, stops: 0, isHiddenCity: false, deepLink: null, source: 'stub' }],
  });
  const search5 = db.createSearch({ origin: 'GRU', destination: 'FOR', departDate: '2027-01-09' });
  const result5 = await runSearch(search5);
  const offer5 = result5.allOffersSorted.find((o) => o.program === 'CASH_TRAVELPAYOUTS');
  assert.equal(offer5.priceFairness.verdict, 'good');
  assert.equal(result5.alertCount, 1, 'preço 15% abaixo da média de 30 dias deveria gerar alerta mesmo sem target price');
});

test('priceFairness nunca é calculado pra ofertas só-em-milhas (priceBRL null) — evita NaN', async () => {
  clearCache();
  stubAllNotConfigured();
  providers.ALL_PROVIDERS.SMILES.search = async () => ({
    status: 'ok',
    offers: [{ program: 'SMILES', priceBRL: null, milesRequired: 30000, taxesBRL: 45, stops: 0, isHiddenCity: false, deepLink: null, source: 'stub' }],
  });
  for (let i = 0; i < 3; i++) {
    const search = db.createSearch({ origin: 'GRU', destination: 'BSB', departDate: `2027-02-0${i + 1}`, programs: ['SMILES'] });
    var result = await runSearch(search);
  }
  const offer = result.allOffersSorted.find((o) => o.program === 'SMILES');
  assert.equal(offer.priceFairness, undefined, 'oferta sem preço em dinheiro não deve ganhar veredito de "preço justo"');
});

test('isSuddenDrop dispara alerta (1x só, sem duplicar) quando o preço cai >=15% vs a checagem anterior mais recente', async () => {
  clearCache();
  stubAllNotConfigured();
  // Baseline com 3 checagens anteriores: 1000, 1000, 1300 (a última — mais
  // recente — é a mais cara). Escolhida pra isolar isSuddenDrop dos outros
  // sinais: a 4ª checagem cai >=15% vs a mais recente (1300) mas fica
  // ACIMA dos limiares de priceFairness "ruim"/"bom" (média=1100) e do
  // isFlashSale do anomaly.js (mínimo histórico=1000) — só isSuddenDrop
  // deveria disparar, e só UMA vez (não duplicado com isGoodFairnessDeal).
  const prices = [1000, 1000, 1300];
  let call = 0;
  providers.ALL_PROVIDERS.CASH_TRAVELPAYOUTS.search = async () => ({
    status: 'ok',
    offers: [{ program: 'CASH_TRAVELPAYOUTS', priceBRL: prices[call++], milesRequired: null, taxesBRL: null, stops: 0, isHiddenCity: false, deepLink: null, source: 'stub' }],
  });
  for (const departDate of ['2027-03-01', '2027-03-02', '2027-03-03']) {
    const search = db.createSearch({ origin: 'GRU', destination: 'GIG', departDate });
    await runSearch(search);
  }

  providers.ALL_PROVIDERS.CASH_TRAVELPAYOUTS.search = async () => ({
    status: 'ok',
    offers: [{ program: 'CASH_TRAVELPAYOUTS', priceBRL: 1050, milesRequired: null, taxesBRL: null, stops: 0, isHiddenCity: false, deepLink: null, source: 'stub' }],
  });
  const search4 = db.createSearch({ origin: 'GRU', destination: 'GIG', departDate: '2027-03-04' });
  const result4 = await runSearch(search4);
  const offer4 = result4.allOffersSorted.find((o) => o.program === 'CASH_TRAVELPAYOUTS');

  assert.equal(offer4.priceFairness.verdict, 'fair', 'pré-condição: 1050 não deveria contar como "bom" vs a média (1100) — senão o teste não isola isSuddenDrop');
  assert.equal(result4.alertCount, 1, 'deveria disparar exatamente 1 alerta (não duplicar mesmo se outro sinal também batesse)');
});

test('isSuddenDrop nunca dispara pra oferta sem preço em dinheiro nessa checagem (evita "null < número" por coerção de tipo)', async () => {
  clearCache();
  stubAllNotConfigured();
  // Smiles às vezes devolve taxa em dinheiro (priceBRL real), às vezes não
  // (priceBRL null) — histórico misto é normal. Sem Number.isFinite(offer.priceBRL),
  // "null < 42.5" vira "0 < 42.5" (true) em JS, disparando alerta falso de
  // "queda súbita" numa oferta que nem tem preço pra comparar.
  const prices = [50, 50, 50];
  let call = 0;
  providers.ALL_PROVIDERS.SMILES.search = async () => ({
    status: 'ok',
    offers: [{ program: 'SMILES', priceBRL: prices[call++], milesRequired: 20000, taxesBRL: prices[call - 1], stops: 0, isHiddenCity: false, deepLink: null, source: 'stub' }],
  });
  for (const departDate of ['2027-04-01', '2027-04-02', '2027-04-03']) {
    const search = db.createSearch({ origin: 'GRU', destination: 'POA', departDate, programs: ['SMILES'] });
    await runSearch(search);
  }

  providers.ALL_PROVIDERS.SMILES.search = async () => ({
    status: 'ok',
    offers: [{ program: 'SMILES', priceBRL: null, milesRequired: 20000, taxesBRL: null, stops: 0, isHiddenCity: false, deepLink: null, source: 'stub' }],
  });
  const search4 = db.createSearch({ origin: 'GRU', destination: 'POA', departDate: '2027-04-04', programs: ['SMILES'] });
  const result4 = await runSearch(search4);

  assert.equal(result4.alertCount, 0, 'oferta sem priceBRL não deveria disparar alerta de queda súbita nenhum');
});

test('cooldown de notificação evita reenviar o mesmo alerta a cada rodada do agendador', async () => {
  clearCache();
  stubAllNotConfigured();
  process.env.ALERT_COOLDOWN_HOURS = '1';
  try {
    providers.ALL_PROVIDERS.CASH_TRAVELPAYOUTS.search = async () => ({
      status: 'ok',
      offers: [{ program: 'CASH_TRAVELPAYOUTS', priceBRL: 900, milesRequired: null, taxesBRL: null, stops: 0, isHiddenCity: false, deepLink: null, source: 'stub' }],
    });
    const search = db.createSearch({ origin: 'GRU', destination: 'SSA', departDate: '2027-05-01', targetPrice: 1000 });

    // 1ª busca: nunca alertou antes — dispara normalmente.
    const result1 = await runSearch(search);
    assert.equal(result1.alertCount, 1, 'preço 900 <= alvo 1000 deveria contar como alerta');
    assert.equal(result1.alertsSuppressedByCooldown, false);
    const afterFirst = db.getSearch(search.id);
    assert.ok(afterFirst.lastAlertedAt, 'lastAlertedAt deveria ter sido gravado depois do 1º alerta enviado');

    // 2ª busca, mesmo preço, poucos instantes depois — dentro do cooldown de 1h:
    // o alerta continua sendo ENCONTRADO (alertCount), mas não deveria disparar
    // notificação de novo. Rebusca a busca no db antes de rodar de novo — é
    // exatamente o que scheduler.js/server.js fazem na prática (sempre
    // buscam a versão atual antes de chamar runSearch), então passar o
    // objeto já reaproveitado do passo anterior não testaria o cenário real.
    const result2 = await runSearch(db.getSearch(search.id));
    assert.equal(result2.alertCount, 1);
    assert.equal(result2.alertsSuppressedByCooldown, true, 'segunda checagem dentro do cooldown não deveria reenviar');

    // Simula o cooldown já ter passado (recua lastAlertedAt manualmente) —
    // a notificação volta a ser elegível.
    db.updateSearch(search.id, { lastAlertedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() });
    const result3 = await runSearch(db.getSearch(search.id));
    assert.equal(result3.alertsSuppressedByCooldown, false, 'depois do cooldown expirar, deveria voltar a notificar');
  } finally {
    delete process.env.ALERT_COOLDOWN_HOURS;
  }
});

test('cooldown não silencia o alertCount quando não há nada pra alertar (não confundir "sem achado" com "suprimido")', async () => {
  clearCache();
  stubAllNotConfigured();
  providers.ALL_PROVIDERS.CASH_TRAVELPAYOUTS.search = async () => ({
    status: 'ok',
    offers: [{ program: 'CASH_TRAVELPAYOUTS', priceBRL: 5000, milesRequired: null, taxesBRL: null, stops: 0, isHiddenCity: false, deepLink: null, source: 'stub' }],
  });
  const search = db.createSearch({ origin: 'GRU', destination: 'CGH', departDate: '2027-05-02', targetPrice: 100 });
  const result = await runSearch(search);
  assert.equal(result.alertCount, 0);
  assert.equal(result.alertsSuppressedByCooldown, false);
});

test('busca do agendador (isScheduledRun) pula o Google Flights via RapidAPI (fonte paga) — só busca manual consulta', async () => {
  clearCache();
  stubAllNotConfigured();
  let gflightsCallCount = 0;
  providers.ALL_PROVIDERS.CASH_RAPIDAPI_GFLIGHTS.search = async () => {
    gflightsCallCount++;
    return { status: 'ok', offers: [{ program: 'CASH_RAPIDAPI_GFLIGHTS', priceBRL: 900, milesRequired: null, taxesBRL: null, stops: 0, isHiddenCity: false, deepLink: null, source: 'stub' }] };
  };
  providers.ALL_PROVIDERS.CASH_TRAVELPAYOUTS.search = async () => ({
    status: 'ok',
    offers: [{ program: 'CASH_TRAVELPAYOUTS', priceBRL: 1000, milesRequired: null, taxesBRL: null, stops: 0, isHiddenCity: false, deepLink: null, source: 'stub' }],
  });

  const search = db.createSearch({ origin: 'GRU', destination: 'LIS', departDate: '2027-06-01' });

  // Execução automática do agendador: NÃO deveria consultar a fonte paga.
  const scheduledResult = await runSearch({ ...search, isScheduledRun: true });
  assert.equal(gflightsCallCount, 0, 'agendador não deveria ter chamado o provider pago');
  assert.equal(scheduledResult.providerResults.some((r) => r.programId === 'CASH_RAPIDAPI_GFLIGHTS'), false);
  assert.ok(scheduledResult.allOffersSorted.some((o) => o.program === 'CASH_TRAVELPAYOUTS'), 'fonte grátis continua funcionando normalmente no agendador');

  // Execução manual (isScheduledRun ausente/false): deveria consultar normalmente.
  const manualResult = await runSearch(db.getSearch(search.id));
  assert.equal(gflightsCallCount, 1, 'busca manual deveria ter chamado o provider pago');
  assert.ok(manualResult.allOffersSorted.some((o) => o.program === 'CASH_RAPIDAPI_GFLIGHTS'));
});
