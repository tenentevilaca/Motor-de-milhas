require('./helpers/setup');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { searchAirports } = require('../src/airports');

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

test('query sem alias nem match nenhum devolve lista vazia', () => {
  const results = searchAirports('xyzxyzxyz-nao-existe');
  assert.equal(results.length, 0);
});
