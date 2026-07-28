const axios = require('axios');
const config = require('../config');
const { createProgramProvider } = require('./programProvider');

const APIFY_ACTOR_ID = 'igolaizola~flight-award-scraper';
const APIFY_RUN_URL = `https://api.apify.com/v2/acts/${APIFY_ACTOR_ID}/run-sync-get-dataset-items`;

// Testado com dado real (ver histórico): o ator "Flight Award & Itinerary
// Scraper" (Apify, por igolaizola) cobre milhas reais da Azul/TudoAzul
// (issuer "azul") — LATAM ("latam") foi testado e NÃO tem cobertura nesse
// ator. É scraping de verdade do site da Azul (mesmo aviso de risco de
// Termos de Uso/bloqueio que está em programProvider.js) — só ativa se você
// mesmo configurar o APIFY_TOKEN, é opt-in explícito, nunca automático.
async function searchApifyAzul({ origin, destination, departDate, returnDate }) {
  const { data } = await axios.post(
    APIFY_RUN_URL,
    {
      origins: [origin],
      destinations: [destination],
      startDate: departDate,
      endDate: returnDate || departDate,
      issuers: ['azul'],
    },
    { params: { token: config.get('APIFY_TOKEN') }, timeout: 60000 }
  );

  const items = Array.isArray(data) ? data : [];
  const offers = [];
  for (const item of items) {
    const itinerary = (item.itineraries || [])[0];
    for (const cabin of item.cabins || []) {
      if (!cabin.available || !Number.isFinite(cabin.mileage) || cabin.mileage <= 0) continue;
      offers.push({
        program: 'AZUL',
        priceBRL: null,
        milesRequired: cabin.mileage,
        // "taxes" vem em centavos sem campo de moeda explícito no retorno da
        // API — assumindo R$ pra rotas domésticas da Azul (plausível com o
        // teste real: R$31,94 numa rota VCP-CNF direta).
        taxesBRL: Number.isFinite(cabin.taxes) && cabin.taxes > 0 ? cabin.taxes / 100 : null,
        stops: itinerary ? itinerary.stops : (cabin.direct ? 0 : null),
        isHiddenCity: false,
        deepLink: item.link || null,
        source: `TudoAzul — ${cabin.name} (Flight Award & Itinerary Scraper via Apify)`,
      });
    }
  }
  return offers;
}

// Fallback: se APIFY_TOKEN não estiver configurado (ou a chamada falhar),
// comporta-se como os outros programas — "não configurado" ou integração
// própria via AZUL_PROVIDER_URL.
const fallback = createProgramProvider({
  id: 'AZUL',
  label: 'TudoAzul',
  envPrefix: 'AZUL',
  homepageUrl: 'https://www.voeazul.com.br',
});

function enabled() {
  return Boolean(config.get('APIFY_TOKEN')) || fallback.enabled();
}

async function search(params) {
  if (!config.get('APIFY_TOKEN')) return fallback.search(params);

  try {
    const offers = await searchApifyAzul(params);
    return { status: 'ok', message: null, offers, manualCheckUrl: fallback.homepageUrl };
  } catch (err) {
    if (fallback.enabled()) return fallback.search(params);
    const body = err.response?.data;
    const bodyMsg = typeof body === 'string' ? body : body?.error?.message || body?.message || err.message;
    return {
      status: 'error',
      message: `Flight Award & Itinerary Scraper (Azul, via Apify): ${bodyMsg}`.slice(0, 300),
      offers: [],
      manualCheckUrl: fallback.homepageUrl,
    };
  }
}

module.exports = { id: 'AZUL', label: 'TudoAzul', enabled, search, homepageUrl: fallback.homepageUrl };
