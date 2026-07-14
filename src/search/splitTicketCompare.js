const { ALL_PROVIDERS, CASH_PROVIDER_IDS } = require('../providers');
const { cached } = require('../cache');

const ONE_WAY_CACHE_TTL_MS = 15 * 60 * 1000;

// "Quebra de bilhete": comparar o preço da passagem ida-e-volta com a soma
// de duas passagens só de ida (uma em cada sentido). É uma prática 100%
// legítima — sem violar contrato de transporte nenhum, diferente de
// hidden-city — porque cada trecho é comprado e usado exatamente como
// emitido. Às vezes sai mais barato por causa de regras de tarifação
// diferentes entre ida-e-volta e apenas ida.
function minPrice(offers) {
  return offers.reduce((min, o) => (o.priceBRL != null && (min == null || o.priceBRL < min) ? o.priceBRL : min), null);
}

async function searchOneWay(programId, origin, destination, date, allowStopover) {
  const provider = ALL_PROVIDERS[programId];
  if (!provider) return [];
  const cacheKey = `oneway|${programId}|${origin}|${destination}|${date}|${allowStopover}`;
  try {
    const result = await cached(cacheKey, ONE_WAY_CACHE_TTL_MS, () =>
      provider.search({ origin, destination, departDate: date, returnDate: null, allowStopover })
    );
    return result.offers || [];
  } catch {
    return [];
  }
}

async function compareSplitTickets(search) {
  if (!search.compareSplitTickets || !search.returnDate) return [];

  const comparisons = [];
  for (const programId of CASH_PROVIDER_IDS) {
    const [outbound, inbound] = await Promise.all([
      searchOneWay(programId, search.origin, search.destination, search.departDate, search.allowStopover),
      searchOneWay(programId, search.destination, search.origin, search.returnDate, search.allowStopover),
    ]);
    const outMin = minPrice(outbound);
    const inMin = minPrice(inbound);
    if (outMin == null || inMin == null) continue;
    comparisons.push({ program: programId, splitPriceBRL: outMin + inMin });
  }
  return comparisons;
}

module.exports = { compareSplitTickets };
