const { ALL_PROVIDERS, CASH_PROVIDER_IDS } = require('../providers');
const { cached } = require('../cache');
const { generateFlexDates } = require('./flexDates');

const ONE_WAY_CACHE_TTL_MS = 15 * 60 * 1000;

// "Quebra de bilhete": comparar o preço da passagem ida-e-volta com a soma
// de duas passagens só de ida (uma em cada sentido). É uma prática 100%
// legítima — sem violar contrato de transporte nenhum, diferente de
// hidden-city — porque cada trecho é comprado e usado exatamente como
// emitido. Às vezes sai mais barato por causa de regras de tarifação
// diferentes entre ida-e-volta e apenas ida.
//
// Com flexDays > 0 a busca principal (runSearch) já testa várias datas —
// então a comparação de split também precisa considerar a mesma janela
// flexível. Sem isso, um round-trip flexível (que pode ter achado preço
// baixo em outra data) seria comparado contra um split fixo na data exata
// original, o que é injusto e pode indicar economia que não existe.

function minPrice(offers) {
  // Number.isFinite (não "!= null"): um NaN vindo de um provider com bug
  // "envenenaria" o mínimo pra sempre (NaN < qualquer coisa é sempre false).
  return offers.reduce((min, o) => (Number.isFinite(o.priceBRL) && (min == null || o.priceBRL < min) ? o.priceBRL : min), null);
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

// Busca o menor preço entre várias datas de ida/volta (flexibilidade).
// Retorna { price, date } ou null.
async function searchOneWayBest(programId, origin, destination, dates, allowStopover) {
  let best = null;
  for (const date of dates) {
    const offers = await searchOneWay(programId, origin, destination, date, allowStopover);
    const min = minPrice(offers);
    if (min != null && (best == null || min < best.price)) {
      best = { price: min, date };
    }
  }
  return best;
}

async function compareSplitTickets(search) {
  if (!search.compareSplitTickets || !search.returnDate) return [];

  const flexDays = Number(search.flexDays) || 0;
  // Limita combinações igual ao runSearch (flexDays * 5) pra não estourar cota.
  const MAX_SPLIT_DATES = flexDays > 0 ? flexDays * 5 : 1;
  const departDates = generateFlexDates(search.departDate, flexDays).slice(0, MAX_SPLIT_DATES);
  const returnDates = generateFlexDates(search.returnDate, flexDays).slice(0, MAX_SPLIT_DATES);

  const comparisons = [];
  for (const programId of CASH_PROVIDER_IDS) {
    // Ida e volta são bilhetes separados: busca o melhor preço de cada
    // trecho de forma independente dentro da janela flexível.
    const [outBest, inBest] = await Promise.all([
      searchOneWayBest(programId, search.origin, search.destination, departDates, search.allowStopover),
      searchOneWayBest(programId, search.destination, search.origin, returnDates, search.allowStopover),
    ]);

    if (!outBest || !inBest) continue;
    comparisons.push({
      program: programId,
      splitPriceBRL: outBest.price + inBest.price,
      departDate: outBest.date,
      returnDate: inBest.date,
    });
  }
  return comparisons;
}

module.exports = { compareSplitTickets };
