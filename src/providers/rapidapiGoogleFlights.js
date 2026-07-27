const axios = require('axios');
const config = require('../config');

// Google Flights Live API (via RapidAPI): mais uma fonte de preço real e ao
// vivo (diferente do Travelpayouts, que é cache de preços já vistos — esse
// aqui faz a busca na hora, igual o SerpApi). Cadastro em rapidapi.com é só
// e-mail/GitHub, sem telefone — mas é um serviço pago por uso (a maioria tem
// uma cota grátis mensal limitada antes de cobrar).
const BASE_URL = 'https://google-flights-live-api.p.rapidapi.com/api/google_flights';
const RAPIDAPI_HOST = 'google-flights-live-api.p.rapidapi.com';

function enabled() {
  return Boolean(config.get('RAPIDAPI_KEY'));
}

// Essa API só devolve preço em dólar — não tem parâmetro de moeda. Sem uma
// fonte de câmbio ao vivo configurada, converte por uma taxa aproximada e
// configurável (o câmbio muda com o tempo; ajuste USD_TO_BRL_RATE conforme
// necessário) só pra dar pra comparar com as outras fontes, que já são reais.
function usdToBrl(usd) {
  const rate = Number(config.get('USD_TO_BRL_RATE')) || 5.5;
  return usd * rate;
}

async function search({ origin, destination, departDate, returnDate, allowStopover }) {
  if (!enabled()) {
    return {
      status: 'not_configured',
      message: 'Defina RAPIDAPI_KEY (cadastro em rapidapi.com, sem telefone — mas é serviço pago por uso) para ativar mais essa fonte de preço real e ao vivo.',
      offers: [],
    };
  }

  const endpoint = returnDate ? 'roundtrip/v1' : 'oneway/v1';
  const body = { departure_date: departDate, from_airport: origin, to_airport: destination };
  if (returnDate) body.return_date = returnDate;

  const { data } = await axios.post(`${BASE_URL}/${endpoint}`, body, {
    headers: {
      'Content-Type': 'application/json',
      'x-rapidapi-host': RAPIDAPI_HOST,
      'x-rapidapi-key': config.get('RAPIDAPI_KEY'),
    },
  });

  const offers = (Array.isArray(data) ? data : [])
    .map((offer) => ({
      program: 'CASH_RAPIDAPI_GFLIGHTS',
      priceBRL: usdToBrl(Number(offer.price_as_number)),
      milesRequired: null,
      taxesBRL: null,
      stops: Number(offer.stops) || 0,
      isHiddenCity: false,
      deepLink: offer.buy_link || null,
      source: `Google Flights via RapidAPI (${offer.airline || 'dados reais'})`,
    }))
    .filter((o) => Number.isFinite(o.priceBRL) && o.priceBRL > 0 && (allowStopover || o.stops === 0));

  return { status: 'ok', message: null, offers };
}

module.exports = { id: 'CASH_RAPIDAPI_GFLIGHTS', label: 'Comparação em dinheiro (Google Flights via RapidAPI)', enabled, search };
