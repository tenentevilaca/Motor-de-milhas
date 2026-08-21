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

// Confirmado via documentação pública (busca web — não testado ainda com
// uma chave real, mesma ressalva já feita pro RapidAPI Google Flights):
//   - Auth: header "Partner-Authorization: Bearer <chave>".
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
      'Partner-Authorization': `Bearer ${config.get('SEATSAERO_API_KEY')}`,
      accept: 'application/json',
    },
    timeout: 15000,
  });

  const trips = extractTrips(data).filter((t) => String(t.Source || '').toLowerCase() === sourceKey);

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
  return offers;
}

module.exports = { enabled, searchSeatsAero };
