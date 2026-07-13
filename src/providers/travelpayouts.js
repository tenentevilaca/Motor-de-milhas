const axios = require('axios');
const config = require('../config');

// Travelpayouts (Aviasales) Data API: mais uma fonte de preço real,
// independente do Amadeus/SerpApi/Kiwi. Cadastro em travelpayouts.com não
// costuma pedir verificação de telefone (só e-mail) — boa alternativa
// quando outro provedor bloqueia por antifraude.
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
  });

  const offers = (data.data || []).map((offer) => ({
    program: 'CASH_TRAVELPAYOUTS',
    priceBRL: Number(offer.price),
    milesRequired: null,
    taxesBRL: null,
    stops: offer.transfers ?? 0,
    isHiddenCity: false,
    deepLink: null,
    source: 'Travelpayouts (dados reais, cache recente)',
  }));

  return { status: 'ok', message: null, offers };
}

module.exports = { id: 'CASH_TRAVELPAYOUTS', label: 'Comparação em dinheiro (Travelpayouts)', enabled, search };
