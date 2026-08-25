const axios = require('axios');
const config = require('../config');

// Helper compartilhado — NÃO é um provider próprio (não entra em
// ALL_PROVIDERS nem em MILE_PROGRAM_IDS). Cada módulo de programa que tiver
// cobertura confirmada no Seats.aero (ver PROGRAM_MAPPING mais abaixo) chama
// searchSeatsAero() e devolve as ofertas com o `program` (AA/AZUL/SMILES)
// que já existe no resto do ecossistema — histórico, baseline de anomalia e
// os checkboxes do front usam esses IDs, não um namespace novo. Um provider
// separado com ID próprio (`SEATSAERO_CONNECTOR`) nunca seria selecionado
// pela busca real, porque `search.programs` só contém o que os checkboxes
// do formulário mandam.
const BASE_URL = 'https://seats.aero/partnerapi';

// Auth confirmada com print da documentação oficial (aba Configurações →
// API da própria conta seats.aero, exemplo de curl deles): o header
// "Partner-Authorization" leva a chave DIRETO, sem prefixo "Bearer " — a
// busca web usada antes indicava (errado) "Bearer <chave>", o que causava
// erro "bad_partner_token" na API real (chave rejeitada por vir com um
// prefixo que não faz parte do token).
//
// Resto confirmado via documentação pública (busca web — não testado ainda
// com uma chave real, mesma ressalva já feita pro RapidAPI Google Flights):
//   - GET /search aceita origin_airport/destination_airport +
//     start_date/end_date (janela de datas pesquisada — sem isso, a API
//     pagina resultados por padrão e pode nunca chegar na data que o
//     usuário pediu, ficando pra trás na paginação). Fixar
//     start_date=end_date=data exata evita esse problema.
//   - Cabines: campos vêm prefixados por letra (Y=econômica, W=premium,
//     J=executiva, F=primeira) — ex: YMileageCost, YTotalTaxes,
//     TaxesCurrency (moeda das taxas, nem sempre USD).
// Fonte: developers.seats.aero (Getting Started / Cached Search) e
// docs.seats.aero (Pro API: Access, Limits and Usage).
const CABIN_LETTERS = { Y: 'Econômica', W: 'Premium Economy', J: 'Executiva', F: 'Primeira classe' };

function enabled() {
  return Boolean(config.get('SEATSAERO_API_KEY'));
}

function extractTrips(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.data)) return data.data;
  return [];
}

// TaxesCurrency raramente é BRL — sem taxa de câmbio pro par exato, só
// convertemos USD (via USD_TO_BRL_RATE, mesma taxa configurável usada pelo
// Google Flights) e BRL (direto). Outras moedas ficam sem conversão (null)
// em vez de aplicar a taxa errada silenciosamente.
function taxesToBRL(amount, currency) {
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const cur = String(currency || '').toUpperCase();
  if (cur === 'BRL') return amount;
  if (cur === 'USD') return amount * (Number(config.get('USD_TO_BRL_RATE')) || 5.5);
  return null;
}

async function searchSeatsAero({ origin, destination, departDate, programId, sourceKey, label, deepLinkBuilder }) {
  const { data } = await axios.get(`${BASE_URL}/search`, {
    params: {
      origin_airport: origin.toUpperCase(),
      destination_airport: destination.toUpperCase(),
      start_date: departDate,
      end_date: departDate,
    },
    headers: {
      'Partner-Authorization': config.get('SEATSAERO_API_KEY'),
      accept: 'application/json',
    },
    timeout: 15000,
  });

  // Diagnóstico (mesmo padrão já usado no Travelpayouts e no Google Flights
  // via RapidAPI — o endpoint/formato do Seats.aero nunca foi confirmado
  // contra uma resposta real de verdade, só a autenticação foi, via print
  // da própria conta): sem isso, "AA sem oferta" pode significar 3 coisas
  // bem diferentes — API não devolveu NADA pra rota (endpoint/params
  // errados), devolveu trips mas nenhum com Source="american" (nome de
  // fonte diferente do esperado), ou devolveu trips certos mas sem preço
  // em milhas legível (nome de campo de milhagem diferente do esperado).
  const allTrips = extractTrips(data);
  const trips = allTrips.filter((t) => String(t.Source || '').toLowerCase() === sourceKey);
  if (allTrips.length === 0) {
    const shape = data && typeof data === 'object' ? `objeto com chaves [${Object.keys(data).join(', ')}]` : typeof data;
    console.log(`[SEATSAERO:${programId}] resposta pra ${origin}->${destination} não trouxe nenhuma trip (${shape}) — API respondeu, mas 0 itens no total (não filtrado por fonte ainda).`);
  } else if (trips.length === 0) {
    const sourcesFound = [...new Set(allTrips.map((t) => t.Source))];
    console.log(`[SEATSAERO:${programId}] resposta trouxe ${allTrips.length} trip(s) pra ${origin}->${destination}, mas nenhuma com Source="${sourceKey}" — fontes que vieram: [${sourcesFound.join(', ')}]`);
  }

  const offers = [];
  for (const trip of trips) {
    for (const [letter, cabinLabel] of Object.entries(CABIN_LETTERS)) {
      const miles = Number(trip[`${letter}MileageCost`]);
      if (!Number.isFinite(miles) || miles <= 0) continue;
      offers.push({
        program: programId,
        priceBRL: null,
        milesRequired: miles,
        taxesBRL: taxesToBRL(Number(trip[`${letter}TotalTaxes`]), trip.TaxesCurrency),
        stops: Number(trip.Stops) || 0,
        isHiddenCity: false,
        deepLink: deepLinkBuilder ? deepLinkBuilder({ origin, destination, departDate }) : null,
        source: `${label} — ${cabinLabel} (Seats.aero)`,
      });
    }
  }

  if (trips.length > 0 && offers.length === 0) {
    console.error(
      `[SEATSAERO:${programId}] ${trips.length} trip(s) com Source="${sourceKey}" encontradas pra ${origin}->${destination}, mas nenhuma cabine com milhagem legível — provável nome de campo diferente do esperado (YMileageCost/JMileageCost/etc). Chaves da 1ª trip: [${Object.keys(trips[0] || {}).join(', ')}]`
    );
  }

  // Log de sucesso (não só dos casos "zero" acima) — sem isso, não dava
  // pra saber quantas trips a API realmente devolveu quando funciona
  // (achado real: usuário esperava várias ofertas/dia pra uma rota e só
  // veio 1; sem esse log não tinha como confirmar se a API só devolve 1
  // trip por rota/data — resumo de "melhor achado", não voo-a-voo — ou se
  // o código estava perdendo trips que vieram de verdade).
  if (offers.length > 0) {
    console.log(`[SEATSAERO:${programId}] ${trips.length} trip(s) com Source="${sourceKey}" pra ${origin}->${destination} -> ${offers.length} oferta(s) geradas.`);
  }

  return offers;
}

module.exports = { enabled, searchSeatsAero };
