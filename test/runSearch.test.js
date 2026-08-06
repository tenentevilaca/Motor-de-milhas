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
