const axios = require('axios');
const config = require('../config');
const { createProgramProvider } = require('./programProvider');
const seatsAero = require('./seatsAero');

const RAPIDAPI_BASE_URL = 'https://award-flight-miles-search-api.p.rapidapi.com/api/v1/search/';
const RAPIDAPI_HOST = 'award-flight-miles-search-api.p.rapidapi.com';

// Testado com dado real (ver README/histórico): o parâmetro "provider" dessa
// API é um dropdown fixo que só oferece "smiles" como fonte de verdade (as
// outras opções do formulário do RapidAPI eram só exemplo de documentação,
// não fontes reais). Ou seja, essa API cobre milhas reais só do Smiles/Gol —
// LATAM/Azul/AA continuam sem fonte grátis conhecida (ver programProvider.js).
async function searchRapidApiSmiles({ origin, destination, departDate, returnDate }) {
  // O schema real dessa API exige adults/children/infants como NÚMERO (não
  // string) — mandar como form-urlencoded (tudo vira string) gera o erro
  // "Expected number". JSON com tipos corretos é o que o schema documentado
  // realmente pede.
  const body = {
    provider: 'smiles',
    origin,
    destination,
    departureDate: departDate,
    tripType: returnDate ? 'round-trip' : 'one-way',
    adults: 1,
    children: 0,
    infants: 0,
  };
  if (returnDate) body.returnDate = returnDate;

  const { data } = await axios.post(RAPIDAPI_BASE_URL, body, {
    headers: {
      'Content-Type': 'application/json',
      'x-rapidapi-host': RAPIDAPI_HOST,
      'x-rapidapi-key': config.get('RAPIDAPI_KEY'),
    },
    timeout: 20000,
  });

  const outbound = Array.isArray(data?.outboundFlights) ? data.outboundFlights : [];
  const inbound = Array.isArray(data?.returnFlights) ? data.returnFlights : [];

  // Diagnóstico (mesmo padrão já usado nos outros providers nesta sessão —
  // Travelpayouts, Google Flights via RapidAPI, Seats.aero, Azul/Apify):
  // sem isso, "Smiles sem oferta" não distingue "essa rota/data não tem
  // voo Gol/Smiles" de "veio resposta em formato diferente do esperado"
  // (a cota mensal estourada, por exemplo, já mascarou isso uma vez — vale
  // ter visibilidade pro que acontece quando a cota estiver ok de novo).
  if (!Array.isArray(data?.outboundFlights)) {
    const shape = data && typeof data === 'object' ? `objeto com chaves [${Object.keys(data).join(', ')}]` : typeof data;
    console.error(`[SMILES:rapidapi] resposta em formato inesperado (${shape}) — esperava outboundFlights como array, mostrando 0 ofertas.`);
  } else if (outbound.length === 0) {
    console.log(`[SMILES:rapidapi] resposta reconhecida (${origin}->${destination} ${departDate}), mas 0 voos em outboundFlights — sem oferta Gol/Smiles pra essa rota/data.`);
  }

  // A API devolve ida e volta como listas separadas — soma as duas pernas só
  // quando o usuário pediu ida e volta (senão "returnFlights" pode vir
  // duplicando a ida, como visto no teste real).
  const parsed = outbound
    .map((out, i) => {
      const back = returnDate ? inbound[i] : null;
      const miles = Number(out.adultPricePoints || 0) + (back ? Number(back.adultPricePoints || 0) : 0);
      const taxes = Number(out.adultBoardingTax || 0) + (back ? Number(back.adultBoardingTax || 0) : 0);
      const cash = Number(out.adultPriceCash || 0) + (back ? Number(back.adultPriceCash || 0) : 0);
      const segments = out.segments || [];
      // O ponto de parada é o aeroporto de chegada de cada trecho, exceto o
      // último (que é o destino final) — só existe quando tem mais de 1 trecho.
      const stopLocations = segments.length > 1 ? segments.slice(0, -1).map((s) => s.destinationCode).filter(Boolean) : [];
      return {
        program: 'SMILES',
        priceBRL: cash > 0 ? cash : null,
        milesRequired: miles > 0 ? miles : null,
        taxesBRL: taxes > 0 ? taxes : null,
        stops: Math.max(segments.length, 1) - 1,
        stopLocations,
        durationLabel: out.totalDuration || null,
        isHiddenCity: false,
        deepLink: null, // essa API não devolve link de compra — o front cai pro manualCheckUrl (site da Smiles)
        flightNumber: out.flightNumber || null,
        departureTime: out.departureTime || null,
        arrivalTime: out.arrivalTime || null,
        // Essa API só devolveu, no teste real, voos operados pela própria Gol
        // pro Smiles — não tem campo de companhia parceira aceitando milhas.
        partnerAirlines: null,
        source: `Smiles — voo ${out.flightNumber || '?'} (Award Flight & Miles Search API)`,
      };
    })
    .filter((o) => o.priceBRL != null || o.milesRequired != null);

  if (outbound.length > 0 && parsed.length === 0) {
    console.error(
      `[SMILES:rapidapi] ${outbound.length} voo(s) em outboundFlights pra ${origin}->${destination}, mas nenhum sobrou (sem adultPricePoints nem adultPriceCash válidos) — provável nome de campo diferente do esperado. Chaves do 1º voo: [${Object.keys(outbound[0] || {}).join(', ')}]`
    );
  }

  return parsed;
}

// Fallback: se RAPIDAPI_KEY não estiver configurada (ou a chamada falhar),
// comporta-se como os outros programas — "não configurado" ou integração
// própria via SMILES_PROVIDER_URL.
const fallback = createProgramProvider({
  id: 'SMILES',
  label: 'Smiles (Gol)',
  envPrefix: 'SMILES',
  homepageUrl: 'https://www.smiles.com.br/emissao-com-milhas',
});

function enabled() {
  return Boolean(config.get('RAPIDAPI_KEY')) || seatsAero.enabled() || fallback.enabled();
}

// Seats.aero como fonte complementar (mesmo padrão já usado no Azul): roda
// quando a RapidAPI não achou nada — sucesso vazio OU erro (ex: cota
// mensal estourada, que já vimos acontecer de verdade). "gol" é o Source
// que o Seats.aero usa pro Smiles/Gol (confirmado na lista pública de
// programas suportados).
async function searchSeatsAeroSmiles(params) {
  return seatsAero.searchSeatsAero({
    ...params,
    programId: 'SMILES',
    sourceKey: 'gol',
    label: 'Smiles (Gol)',
    // Mesmo cuidado do AA/Azul: formato do parâmetro de volta nunca foi
    // confirmado — com returnDate cai pro link genérico em vez de montar
    // um link de ida e volta que pode buscar errado.
    deepLinkBuilder: ({ origin, destination, departDate, returnDate }) =>
      returnDate ? null : `https://www.smiles.com.br/m3/emissao-com-milhas?origin=${origin}&destination=${destination}&departureDate=${departDate}`,
  });
}

async function search(params) {
  const rapidApiConfigured = Boolean(config.get('RAPIDAPI_KEY'));
  const seatsConfigured = Boolean(config.get('SEATSAERO_API_KEY'));
  if (!rapidApiConfigured && !seatsConfigured) return fallback.search(params);

  let offers = [];
  let errorMsg = null;

  if (rapidApiConfigured) {
    try {
      offers = await searchRapidApiSmiles(params);
    } catch (err) {
      const body = err.response?.data;
      const bodyMsg =
        typeof body === 'string' ? body : body?.property ? `${body.property}: ${body.message}` : body?.message || err.message;
      errorMsg = `Award Flight & Miles Search API (Smiles): ${bodyMsg}`.slice(0, 300);
    }
  }

  if (offers.length === 0 && seatsConfigured) {
    try {
      offers = await searchSeatsAeroSmiles(params);
      errorMsg = null; // resposta válida da 2ª fonte — não importa se a 1ª deu erro (ex: cota estourada)
    } catch (err) {
      if (!errorMsg) {
        const body = err.response?.data;
        const bodyMsg = typeof body === 'string' ? body : body?.message || err.message;
        errorMsg = `Seats.aero (Smiles/Gol): ${bodyMsg}`.slice(0, 300);
      }
    }
  }

  if (errorMsg && offers.length === 0) {
    if (fallback.enabled()) return fallback.search(params);
    return { status: 'error', message: errorMsg, offers: [], manualCheckUrl: fallback.homepageUrl };
  }

  return { status: 'ok', message: null, offers, manualCheckUrl: fallback.homepageUrl };
}

module.exports = { id: 'SMILES', label: 'Smiles (Gol)', enabled, search, homepageUrl: fallback.homepageUrl };
