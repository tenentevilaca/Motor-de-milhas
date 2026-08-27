const axios = require('axios');
const config = require('../config');
const { createProgramProvider } = require('./programProvider');
const seatsAero = require('./seatsAero');

const APIFY_ACTOR_ID = 'igolaizola~flight-award-scraper';
const APIFY_RUN_URL = `https://api.apify.com/v2/acts/${APIFY_ACTOR_ID}/run-sync-get-dataset-items`;

function minutesToLabel(min) {
  if (!Number.isFinite(min) || min <= 0) return null;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h${String(m).padStart(2, '0')}m`;
}

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
  // Diagnóstico (mesmo padrão já usado no Travelpayouts/Google Flights via
  // RapidAPI/Seats.aero): esse ator já foi testado com dado real uma vez
  // (comentário acima), mas isso não garante que toda rota/data tenha
  // resultado — sem log nenhum, "AZUL sem oferta" não distingue "o ator não
  // achou nada pra essa rota/data" de "achou item(ns) mas nenhuma cabine
  // bateu no filtro de disponibilidade/milhagem".
  if (items.length === 0) {
    console.log(`[AZUL:apify] resposta pra ${origin}->${destination} veio sem nenhum item — ator não achou nada pra essa rota/data (não é bug de parsing).`);
  }
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
        stopLocations: itinerary?.connections || [],
        durationLabel: minutesToLabel(itinerary?.totalDuration),
        isHiddenCity: false,
        deepLink: item.link || null,
        flightNumber: (itinerary?.flightNumbers || []).join(', ') || null,
        departureTime: itinerary?.departure ? itinerary.departure.slice(11, 16) : null,
        arrivalTime: itinerary?.arrival ? itinerary.arrival.slice(11, 16) : null,
        // "airlines" nesse campo do cabin lista TODAS as companhias que
        // aceitam essa milhagem específica pra esse trecho/cabine — em
        // rotas internacionais pode incluir parceiras, não só a Azul (visto
        // em teste real com outro issuer). Null quando a API não manda nada.
        partnerAirlines: Array.isArray(cabin.airlines) && cabin.airlines.length > 0 ? cabin.airlines.map((a) => a.name) : null,
        source: `TudoAzul — ${cabin.name} (Flight Award & Itinerary Scraper via Apify)`,
      });
    }
  }

  if (items.length > 0 && offers.length === 0) {
    const sample = items[0];
    const cabinKeys = (sample.cabins || [])[0] ? Object.keys(sample.cabins[0]) : [];
    console.error(
      `[AZUL:apify] ${items.length} item(ns) pra ${origin}->${destination}, mas nenhuma cabine passou no filtro (available && mileage válido) — chaves do item: [${Object.keys(sample || {}).join(', ')}], chaves da 1ª cabine: [${cabinKeys.join(', ')}]`
    );
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
  return Boolean(config.get('APIFY_TOKEN')) || seatsAero.enabled() || fallback.enabled();
}

// Achado real (log de produção, CNF->MAO): o robô Apify não achou nada
// pra essa rota, mas o Seats.aero achou — trouxe uma trip com
// Source="azul" pra EXATAMENTE a mesma rota/data. Ou seja, os dois cobrem
// a Azul, mas nem sempre concordam (scraping de site é inerentemente
// instável); rodar o Seats.aero como complemento quando o Apify não
// achar nada aumenta a chance real de achar a oferta, em vez de depender
// de uma fonte só. Só tenta o Seats.aero quando o Apify não trouxe
// oferta nenhuma (sucesso vazio OU erro) — se o Apify já achou, não
// gasta uma chamada a mais à toa.
async function searchSeatsAeroAzul(params) {
  return seatsAero.searchSeatsAero({
    ...params,
    programId: 'AZUL',
    sourceKey: 'azul',
    label: 'TudoAzul',
    // Achado real: esse link sempre montava "tp=ONEWAY" (só ida), mesmo
    // quando a busca era de ida e volta — usuário clicava esperando ver o
    // itinerário completo e o site da Azul buscava só a ida, parecendo
    // "não encontrei o voo". O formato do parâmetro de volta nunca foi
    // confirmado, então com returnDate cai pro link genérico
    // (manualCheckUrl) em vez de arriscar montar algo errado.
    deepLinkBuilder: ({ origin, destination, departDate, returnDate }) =>
      returnDate ? null : `https://www.voeazul.com.br/br/pt/home/selecao-voo?tp=ONEWAY&og=${origin}&ds=${destination}&dtIda=${departDate}`,
  });
}

async function search(params) {
  const apifyConfigured = Boolean(config.get('APIFY_TOKEN'));
  const seatsConfigured = Boolean(config.get('SEATSAERO_API_KEY'));
  if (!apifyConfigured && !seatsConfigured) return fallback.search(params);

  let offers = [];
  let errorMsg = null;

  if (apifyConfigured) {
    try {
      offers = await searchApifyAzul(params);
    } catch (err) {
      const body = err.response?.data;
      const bodyMsg = typeof body === 'string' ? body : body?.error?.message || body?.message || err.message;
      errorMsg = `Flight Award & Itinerary Scraper (Azul, via Apify): ${bodyMsg}`.slice(0, 300);
    }
  }

  if (offers.length === 0 && seatsConfigured) {
    try {
      offers = await searchSeatsAeroAzul(params);
      errorMsg = null; // resposta válida da 2ª fonte — não importa se a 1ª deu erro
    } catch (err) {
      if (!errorMsg) {
        const body = err.response?.data;
        const bodyMsg = typeof body === 'string' ? body : body?.message || err.message;
        errorMsg = `Seats.aero (TudoAzul): ${bodyMsg}`.slice(0, 300);
      }
    }
  }

  if (errorMsg && offers.length === 0) {
    if (fallback.enabled()) return fallback.search(params);
    return { status: 'error', message: errorMsg, offers: [], manualCheckUrl: fallback.homepageUrl };
  }

  return { status: 'ok', message: null, offers, manualCheckUrl: fallback.homepageUrl };
}

module.exports = { id: 'AZUL', label: 'TudoAzul', enabled, search, homepageUrl: fallback.homepageUrl };
