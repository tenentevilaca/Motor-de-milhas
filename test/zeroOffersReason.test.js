const { test } = require('node:test');
const assert = require('node:assert/strict');
const { summarizeZeroOffersReason } = require('../src/search/zeroOffersReason');

function result(programId, status) {
  return { programId, status, destination: 'MIA', departDate: '2026-12-08', returnDate: null, offers: [] };
}

test('nenhum providerResult (não deveria acontecer, mas não pode quebrar): "sem_fontes"', () => {
  assert.equal(summarizeZeroOffersReason([]).code, 'sem_fontes');
  assert.equal(summarizeZeroOffersReason(null).code, 'sem_fontes');
});

test('todas as fontes not_configured: "nenhuma_fonte_configurada"', () => {
  const r = summarizeZeroOffersReason([result('AA', 'not_configured'), result('CASH_TRAVELPAYOUTS', 'not_configured')]);
  assert.equal(r.code, 'nenhuma_fonte_configurada');
});

test('mistura not_configured + configurada sem oferta: ignora not_configured, olha só a configurada', () => {
  const r = summarizeZeroOffersReason([result('LATAM', 'not_configured'), result('AA', 'ok')]);
  assert.equal(r.code, 'sem_cobertura');
});

test('todas as fontes configuradas ainda pendentes (estouraram o orçamento por provider): "todas_timeout"', () => {
  const r = summarizeZeroOffersReason([result('AA', 'pending'), result('SMILES', 'pending')]);
  assert.equal(r.code, 'todas_timeout');
});

test('todas as fontes configuradas deram erro: "todas_falharam"', () => {
  const r = summarizeZeroOffersReason([result('AA', 'error'), result('SMILES', 'error')]);
  assert.equal(r.code, 'todas_falharam');
});

test('todas responderam ok mas sem oferta nenhuma: "sem_cobertura"', () => {
  const r = summarizeZeroOffersReason([result('AA', 'ok'), result('CASH_TRAVELPAYOUTS', 'ok')]);
  assert.equal(r.code, 'sem_cobertura');
});

test('causas misturadas (uma erro, outra pendente, outra ok-vazia): "causas_mistas"', () => {
  const r = summarizeZeroOffersReason([result('AA', 'error'), result('SMILES', 'pending'), result('CASH_TRAVELPAYOUTS', 'ok')]);
  assert.equal(r.code, 'causas_mistas');
});

// Busca por região testa o MESMO programId em vários hubs — precisa agrupar
// por programId antes de decidir, senão isso contaria como "3 resultados
// diferentes" em vez de 1 programa com status misto entre hubs.
test('busca por região: mesmo programId com status diferente em hubs diferentes vira "misto" (entra em causas_mistas se houver mais de 1 programa)', () => {
  const r = summarizeZeroOffersReason([
    result('AA', 'ok'),
    result('AA', 'error'),
    result('AA', 'pending'),
    result('SMILES', 'ok'),
  ]);
  // AA é "misto" (não bate em nenhum "every"), SMILES é "ok" -> não é unânime -> causas_mistas
  assert.equal(r.code, 'causas_mistas');
});

test('busca por região: mesmo programId com o MESMO status em todos os hubs conta como 1 programa só', () => {
  const r = summarizeZeroOffersReason([result('AA', 'ok'), result('AA', 'ok'), result('AA', 'ok')]);
  assert.equal(r.code, 'sem_cobertura');
});
