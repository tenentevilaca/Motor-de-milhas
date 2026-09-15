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

// REVISADO (auditoria Travelpayouts vs Google Flights Live): não existe
// mais UM "melhor achado" que alterna texto por isCachedPrice — agora são
// dois banners sempre separados: "Menor preço atual confirmado" (fonte ao
// vivo, result.bestLiveCashDeal) e "Menor preço observado em cache"
// (Travelpayouts, result.bestCachedCashDeal). Item 10 do pedido: o texto
// muda por FONTE, não por um ternário genérico.
test('banner "Menor preço atual confirmado" (ao vivo) e "Menor preço observado em cache" aparecem como textos separados', () => {
  assert.ok(appJs.includes('Menor preço atual confirmado'), 'texto do banner de preço ao vivo não encontrado');
  assert.ok(appJs.includes('Menor preço observado em cache'), 'texto do banner de preço em cache não encontrado');
  assert.match(appJs, /result\.bestLiveCashDeal/);
  assert.match(appJs, /result\.bestCachedCashDeal/);
});

test('sem preço ao vivo confirmado, mostra aviso explícito em vez de tratar o cache como confirmado', () => {
  assert.ok(appJs.includes('Nenhum preço ao vivo confirmado nesta busca'));
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

// Item 3 do pedido do usuário: link de oferta em cache (sem deepLink
// próprio) precisa ser rotulado como conferência, nunca como o código cru
// do provider (ex: "CASH_TRAVELPAYOUTS", que não diz nada pro usuário).
test('link de oferta em cache é rotulado "Conferir preço atual no Google Flights", não o código cru do provider', () => {
  assert.ok(appJs.includes('Conferir preço atual no Google Flights'));
  assert.match(appJs, /o\.isCachedPrice && !o\.deepLink \? 'Conferir preço atual no Google Flights'/);
});

// Item 7 do pedido do usuário: "Operado por" separado de "Emitido com",
// parceiras só quando concretas, e indicação de fonte ao vivo/cache/própria.
test('"Emitido com" usa o.loyaltyProgram (nome completo do programa) com fallback pro código curto', () => {
  assert.match(appJs, /o\.loyaltyProgram \|\| o\.program/);
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
