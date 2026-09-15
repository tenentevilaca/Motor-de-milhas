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

test('"Operado por" só aparece quando o.operatingAirline vem preenchido pela API (nunca lista genérica de parceiras como disponibilidade)', () => {
  assert.ok(appJs.includes('Operado por'));
  assert.match(appJs, /const operatedByLine = o\.operatingAirline\s*\n?\s*\?/);
});

test('parceiras só aparecem quando a fonte confirmou itinerário concreto pra essa cabine (o.partnerAirlines preenchido)', () => {
  assert.ok(appJs.includes('Parceiras disponíveis nessa cabine'));
});

test('indica disponibilidade ao vivo via Seats.aero/RapidAPI/Apify quando a fonte confirma (isLiveAwardAvailability)', () => {
  assert.ok(appJs.includes('Disponibilidade ao vivo via'));
  assert.ok(appJs.includes("seatsaero: 'Seats.aero'"));
  assert.ok(appJs.includes("rapidapi: 'RapidAPI'"));
  assert.ok(appJs.includes("apify: 'scraping da Azul via Apify'"));
});
