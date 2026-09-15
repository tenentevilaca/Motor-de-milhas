const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// Este projeto não tem infraestrutura de teste de DOM/browser (sem
// jsdom/Playwright na suíte automatizada) — os testes de runSearch.test.js
// e travelpayouts.test.js já cobrem os DADOS que essas telas consomem
// (isCachedPrice, priceDisclaimer). Este arquivo confirma que o TEXTO
// literal pedido continua existindo no público/app.js publicado, pra não
// regredir silenciosamente se alguém reformatar a string.
const appJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');

test('banner de melhor preço usa "Menor preço observado" quando a oferta é de cache (isCachedPrice)', () => {
  assert.ok(appJs.includes('Menor preço observado'), 'texto "Menor preço observado" não encontrado em public/app.js');
  assert.ok(appJs.includes('Menor preço encontrado'), 'texto "Menor preço encontrado" (caso não-cache) não encontrado em public/app.js');
  assert.match(appJs, /result\.bestDeal\.isCachedPrice\s*\?\s*'Menor preço observado'\s*:\s*'Menor preço encontrado'/);
});

test('aviso "Preço de referência em cache" e alerta de confirmar antes de comprar aparecem no app.js', () => {
  assert.ok(appJs.includes('Preço de referência em cache'));
  assert.ok(appJs.includes('Pode não estar mais disponível. Confirme no link antes de comprar.'));
});

test('link de oferta em cache é descrito como conferência de rota/data, não como reserva do voo encontrado', () => {
  assert.ok(
    appJs.includes('não confirma que esse é o voo/preço exato encontrado'),
    'texto explicando que o link não é uma confirmação do voo específico não encontrado em app.js'
  );
});

// Item 7 do pedido do usuário: "Operado por" separado de "Emitido com",
// parceiras só quando concretas, e indicação de fonte ao vivo/cache/própria.
test('"Emitido com" usa o.loyaltyProgram (nome completo do programa) com fallback pro código curto', () => {
  assert.match(appJs, /const issuedWithText = o\.loyaltyProgram \|\| o\.program;/);
});

test('"Operado por" só aparece quando o.operatingAirline vem preenchido pela API (AA/Azul nunca preenchem esse campo — só Smiles)', () => {
  assert.ok(appJs.includes('Operado por'));
  assert.match(appJs, /const operatedByLine = o\.operatingAirline\s*\n?\s*\?/);
});

// REVISADO: nem AA (Seats.aero) nem Azul (Apify) afirmam mais "parceira" —
// o campo de origem nunca foi confirmado contra resposta real, então vira
// só uma lista neutra ("companhias disponíveis"), nunca "Operado por"/
// "parceira". Wording muda por fonte, conforme pedido explícito do usuário.
test('mostra lista neutra de "companhias disponíveis" (nunca "parceira"/"operado por") quando a fonte traz o dado, com texto específico por fonte', () => {
  assert.ok(appJs.includes('Companhias disponíveis para emissão'), 'texto específico da AA/Seats.aero não encontrado');
  assert.ok(appJs.includes('Companhias disponíveis nessa cabine'), 'texto específico da Azul/Apify não encontrado');
  assert.ok(!appJs.includes('Parceiras disponíveis'), 'não deveria mais existir texto afirmando "parceira" a partir de campo não confirmado');
});

test('mostra "Companhia operadora não informada pela fonte" quando é oferta de milhas sem operatingAirline nem lista de companhias', () => {
  assert.ok(appJs.includes('Companhia operadora não informada pela fonte'));
  assert.match(appJs, /o\.loyaltyProgram && !o\.operatingAirline && !hasAvailableAirlinesList/);
});

test('indica disponibilidade ao vivo via Seats.aero/RapidAPI/Apify quando a fonte confirma (isLiveAwardAvailability)', () => {
  assert.ok(appJs.includes('Disponibilidade ao vivo via'));
  assert.ok(appJs.includes("seatsaero: 'Seats.aero'"));
  assert.ok(appJs.includes("rapidapi: 'RapidAPI'"));
  assert.ok(appJs.includes("apify: 'scraping da Azul via Apify'"));
});
