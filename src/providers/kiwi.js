const axios = require('axios');
const config = require('../config');

// Kiwi.com Tequila API: outro grande agregador (forte em companhias
// low-cost e combinações que buscadores tradicionais não juntam), somando
// cobertura ao SerpApi/Google Flights e ao Travelpayouts. Cadastro gratuito
// em https://tequila.kiwi.com — gera uma API key sem precisar de parceria.
const BASE_URL = 'https://api.tequila.kiwi.com/v2/search';

function enabled() {
  return Boolean(config.get('KIWI_TEQUILA_API_KEY'));
}

function toDDMMYYYY(isoDate) {
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

async function search({ origin, destination, departDate, returnDate, allowStopover }) {
  if (!enabled()) {
    return {
      status: 'not_configured',
      message: 'Defina KIWI_TEQUILA_API_KEY (cadastro grátis em tequila.kiwi.com) para ativar mais essa fonte de preço real.',
      offers: [],
    };
  }

  const params = {
    fly_from: origin,
    fly_to: destination,
    date_from: toDDMMYYYY(departDate),
    date_to: toDDMMYYYY(departDate),
    curr: 'BRL',
    adults: 1,
    limit: 15,
    sort: 'price',
    max_stopovers: allowStopover ? undefined : 0,
  };
  if (returnDate) {
    params.return_from = toDDMMYYYY(returnDate);
    params.return_to = toDDMMYYYY(returnDate);
  }

  const { data } = await axios.get(BASE_URL, {
    headers: { apikey: config.get('KIWI_TEQUILA_API_KEY') },
    params,
  });

  const offers = (data.data || [])
    .map((offer) => ({
      program: 'CASH_KIWI',
      priceBRL: Number(offer.price),
      milesRequired: null,
      taxesBRL: null,
      stops: Math.max(0, (offer.route || []).length - 1),
      isHiddenCity: false,
      deepLink: offer.deep_link || null,
      source: 'Kiwi.com (dados reais)',
    }))
    .filter((o) => Number.isFinite(o.priceBRL) && o.priceBRL > 0);

  return { status: 'ok', message: null, offers };
}

module.exports = { id: 'CASH_KIWI', label: 'Comparação em dinheiro (Kiwi.com)', enabled, search };
