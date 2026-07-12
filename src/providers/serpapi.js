const axios = require('axios');

// SerpApi's Google Flights engine: um provedor terceirizado que já resolve o
// problema de "pegar preço real sem falar direto com o site da companhia".
// Ele indexa Google Flights (que por sua vez agrega AA, LATAM, Azul, GOL e
// outras), de forma licenciada — não é scraping nosso contra as proteções
// antibot das companhias, então não tem o risco de bloqueio de conta/IP que
// os adaptadores em aa.js/latampass.js/smiles.js/azul.js evitam por padrão.
// Cadastro: https://serpapi.com (100 buscas/mês grátis, planos pagos depois).
const BASE_URL = 'https://serpapi.com/search.json';

function enabled() {
  return Boolean(process.env.SERPAPI_KEY);
}

async function search({ origin, destination, departDate, returnDate, allowStopover }) {
  if (!enabled()) {
    return {
      status: 'not_configured',
      message: 'Defina SERPAPI_KEY (cadastro grátis em serpapi.com) para ativar a comparação em dinheiro via Google Flights.',
      offers: [],
    };
  }

  const { data } = await axios.get(BASE_URL, {
    params: {
      engine: 'google_flights',
      departure_id: origin,
      arrival_id: destination,
      outbound_date: departDate,
      return_date: returnDate || undefined,
      type: returnDate ? 1 : 2, // 1 = ida e volta, 2 = somente ida
      currency: 'BRL',
      hl: 'pt',
      api_key: process.env.SERPAPI_KEY,
    },
  });

  const itineraries = [...(data.best_flights || []), ...(data.other_flights || [])];

  const offers = itineraries
    .map((it) => {
      const stops = (it.flights || []).length > 0 ? it.flights.length - 1 : (it.layovers || []).length;
      return {
        program: 'CASH_SERPAPI',
        priceBRL: typeof it.price === 'number' ? it.price : null,
        milesRequired: null,
        taxesBRL: null,
        stops,
        isHiddenCity: false,
        deepLink: data.search_metadata?.google_flights_url || null,
        source: 'Google Flights via SerpApi (dados reais)',
      };
    })
    .filter((offer) => offer.priceBRL != null && (allowStopover || offer.stops === 0));

  return { status: 'ok', message: null, offers };
}

module.exports = { id: 'CASH_SERPAPI', label: 'Comparação em dinheiro (Google Flights)', enabled, search };
