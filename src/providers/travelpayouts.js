const axios = require('axios');
const config = require('../config');

// Travelpayouts (Aviasales) Data API: mais uma fonte de preço real,
// independente do SerpApi/Kiwi. Cadastro em travelpayouts.com não costuma
// pedir verificação de telefone (só e-mail) — boa alternativa quando outro
// provedor bloqueia por antifraude.
// Atenção: esse endpoint (/v2/prices/latest) devolve o menor preço já
// observado em cache recente pra rota, não necessariamente uma busca ao
// vivo pra data exata — ainda assim é um preço real, útil pra comparar
// com o histórico e pegar anomalia/promoção.
const BASE_URL = 'https://api.travelpayouts.com/v2/prices/latest';

function enabled() {
  return Boolean(config.get('TRAVELPAYOUTS_TOKEN'));
}

async function search({ origin, destination, departDate, returnDate }) {
  if (!enabled()) {
    return {
      status: 'not_configured',
      message: 'Defina TRAVELPAYOUTS_TOKEN (cadastro grátis em travelpayouts.com, sem telefone) para ativar mais essa fonte de preço real.',
      offers: [],
    };
  }

  const { data } = await axios.get(BASE_URL, {
    headers: { 'X-Access-Token': config.get('TRAVELPAYOUTS_TOKEN') },
    params: {
      origin,
      destination,
      currency: 'brl',
      depart_date: departDate,
      return_date: returnDate || undefined,
      one_way: !returnDate,
      page: 1,
      limit: 20,
      sorting: 'price',
      show_to_affiliates: false,
    },
    // Sem timeout, uma API lenta/instável trava a promise indefinidamente —
    // como esse provider é sempre consultado (é o cash provider padrão),
    // isso trava a busca inteira até o proxy do host (ex: Render) derrubar
    // a conexão sem resposta HTTP, o que o navegador mostra como
    // "NetworkError" genérico em vez de um erro claro. Bug real visto assim.
    timeout: 20000,
  });

  // Achado real (GRU->MIA, rota das mais movimentadas do Brasil, veio 0
  // ofertas — suspeito, já que essa fonte é cache de preços recentes e uma
  // rota tão popular dificilmente estaria sem NENHUM preço cacheado):
  // sem log nenhum aqui, ficava impossível saber se `data.data` veio vazio
  // de verdade, veio em outro formato, ou veio com itens que o parsing
  // descartou por outro motivo — mesma classe de problema já resolvida pro
  // Google Flights via RapidAPI, replicada aqui.
  const rawOffers = Array.isArray(data?.data) ? data.data : null;
  if (rawOffers === null) {
    const shape = data && typeof data === 'object' ? `objeto com chaves [${Object.keys(data).join(', ')}]` : typeof data;
    console.error(`[CASH_TRAVELPAYOUTS] resposta em formato inesperado (${shape}) — esperava { data: [...] }, mostrando 0 ofertas.`);
  } else if (rawOffers.length === 0) {
    console.log(`[CASH_TRAVELPAYOUTS] resposta reconhecida (${origin}->${destination} ${departDate}), mas 0 itens na lista — sem preço cacheado pra essa rota/data agora.`);
  }

  // Alguns registros do cache vêm sem preço válido (campo ausente ou nulo) —
  // descarta esses aqui, senão viram ofertas fantasma com preço "NaN" que o
  // JSON serializa como null e o front-end mostra como "-" em todas as
  // linhas (bug real observado: 12 "ofertas" idênticas sem preço nenhum).
  const offers = (rawOffers || [])
    .map((offer) => ({
      program: 'CASH_TRAVELPAYOUTS',
      priceBRL: Number(offer.price),
      milesRequired: null,
      taxesBRL: null,
      stops: offer.transfers ?? 0,
      isHiddenCity: false,
      deepLink: null,
      source: 'Travelpayouts (dados reais, cache recente)',
    }))
    .filter((o) => Number.isFinite(o.priceBRL) && o.priceBRL > 0);

  if (rawOffers && rawOffers.length > 0 && offers.length === 0) {
    console.error(
      `[CASH_TRAVELPAYOUTS] API devolveu ${rawOffers.length} item(ns) pra ${origin}->${destination}, mas nenhum sobrou depois do parsing de preço — provável nome de campo diferente do esperado. Chaves do 1º item: [${Object.keys(rawOffers[0] || {}).join(', ')}]`
    );
  }

  return { status: 'ok', message: null, offers };
}

module.exports = { id: 'CASH_TRAVELPAYOUTS', label: 'Comparação em dinheiro (Travelpayouts)', enabled, search };
