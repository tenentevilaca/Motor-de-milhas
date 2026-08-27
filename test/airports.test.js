require('./helpers/setup');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { searchAirports, searchRegions, getHubAirportsForRegion, regionCodeFromValue } = require('../src/airports');
const { getRegionForCountry } = require('../src/data/continents');

test('abreviações comuns de cidades brasileiras (BH, SP, RJ) resolvem pro aeroporto certo em primeiro lugar', () => {
  // Regressão real: "BH" não sugeria nada de Belo Horizonte — só aeroportos
  // aleatórios ao redor do mundo cujo código IATA por acaso começa com "bh"
  // (Bahawalpur, Bahia Blanca, Bar Harbor...). O mesmo valia pra "SP" e "RJ".
  const bh = searchAirports('BH');
  assert.equal(bh[0].city, 'Belo Horizonte', `esperava Belo Horizonte em 1º lugar, veio ${bh[0].city} (${bh[0].iata})`);
  assert.ok(bh.slice(0, 2).some((a) => a.iata === 'CNF'));

  const sp = searchAirports('sp');
  assert.equal(sp[0].city, 'Sao Paulo', `esperava São Paulo em 1º lugar, veio ${sp[0].city} (${sp[0].iata})`);
  assert.ok(sp.slice(0, 2).some((a) => a.iata === 'GRU'));

  const rj = searchAirports('RJ');
  assert.equal(rj[0].city, 'Rio De Janeiro', `esperava Rio de Janeiro em 1º lugar, veio ${rj[0].city} (${rj[0].iata})`);
  assert.ok(rj.slice(0, 2).some((a) => a.iata === 'GIG'));
});

test('apelido "floripa" resolve pra Florianópolis (FLN)', () => {
  const results = searchAirports('floripa');
  assert.ok(results.some((a) => a.iata === 'FLN'));
});

test('código IATA exato continua tendo prioridade sobre qualquer alias', () => {
  const results = searchAirports('GRU');
  assert.equal(results[0].iata, 'GRU');
});

test('nome completo da cidade (sem abreviação) continua funcionando normalmente', () => {
  const results = searchAirports('Belo Horizonte');
  assert.equal(results[0].city, 'Belo Horizonte');
  assert.ok(results.some((a) => a.iata === 'CNF'));
  assert.ok(results.some((a) => a.iata === 'PLU'));
});

test('"curacao" (sem cedilha, como a busca normaliza) encontra CUR — base OpenFlights tinha o país desatualizado ("Netherlands Antilles", dissolvido em 2010)', () => {
  // Regressão real: buscar "Curaçao" não devolvia nada porque nem a cidade
  // (Willemstad) nem o país batiam com o texto digitado — o país na base
  // ainda estava com o nome antigo. Corrigido o dado (país = "Curaçao"),
  // a busca por país já encontra sem precisar de alias separado. Mesmo
  // problema existia pra SXM (era "Netherlands Antilles", agora "Sint
  // Maarten") — os dois países se tornaram independentes no mesmo evento de
  // 2010; BON/EUX/SAB continuam como estavam (caso mais ambíguo, fora do
  // escopo do que foi reportado).
  const results = searchAirports('curacao');
  assert.ok(results.some((a) => a.iata === 'CUR'), `esperava CUR entre os resultados, veio ${JSON.stringify(results.map((r) => r.iata))}`);
});

test('query sem alias nem match nenhum devolve lista vazia', () => {
  const results = searchAirports('xyzxyzxyz-nao-existe');
  assert.equal(results.length, 0);
});

// Pedido do usuário: buscar "o mundo todo" (equivalente a "só a origem,
// qualquer destino") como destino. Implementado como mais uma região
// (código 'WO'), reaproveitando a mesma infraestrutura de região existente
// — mas com um cuidado real: a lista de países do "mundo todo" não pode
// sobrescrever o mapa país->continente real, senão "Brasil" pararia de
// resolver pra "SA" (ver comentário em src/data/continents.js).
test('"mundo todo" aparece na busca de região e não quebra o mapeamento país->continente existente', () => {
  const results = searchRegions('mundo');
  assert.ok(results.some((r) => r.code === 'WO'), `esperava a região WO entre os resultados, veio ${JSON.stringify(results)}`);

  // Brasil precisa continuar resolvendo pra América do Sul (SA), não pra
  // "WO" — essa é a regressão que essa feature poderia ter causado se a
  // lista de países do "mundo todo" entrasse no mapa país->região.
  assert.equal(getRegionForCountry('Brazil'), 'SA');
  assert.equal(getRegionForCountry('Portugal'), 'EU');
});

test('getHubAirportsForRegion("WO") devolve hubs de continentes DIFERENTES, não só um continente', () => {
  const hubs = getHubAirportsForRegion('WO', 8);
  assert.ok(hubs.length > 1, 'esperava mais de 1 hub');
  const regionsFound = new Set(hubs.map((h) => getRegionForCountry(h.country)));
  assert.ok(regionsFound.size > 1, `esperava hubs de continentes diferentes, mas todos vieram do mesmo: ${JSON.stringify([...regionsFound])}`);
});

test('regionCodeFromValue reconhece "REGION:WO"', () => {
  assert.equal(regionCodeFromValue('REGION:WO'), 'WO');
});
