const { ALL_PROVIDERS, CASH_PROVIDER_IDS } = require('../providers');
const { cached } = require('../cache');

const PROVIDER_CACHE_TTL_MS = 15 * 60 * 1000;

// Só ~5 datas espaçadas no mês, não os ~30 dias — cada dia é 1 chamada nova
// pra cada fonte de dinheiro (Travelpayouts + Google Flights Live), e a cota
// grátis dessas APIs já estourou nesta sessão com bem menos que isso.
const SAMPLE_COUNT = 5;

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate(); // month aqui é 1-indexado
}

function sampleDates(yearMonth) {
  const [yearStr, monthStr] = yearMonth.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const total = daysInMonth(year, month);
  const days = new Set();
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    const day = Math.round(1 + (i * (total - 1)) / (SAMPLE_COUNT - 1));
    days.add(day);
  }
  return [...days].sort((a, b) => a - b).map((day) => `${yearStr}-${monthStr}-${String(day).padStart(2, '0')}`);
}

// Só as fontes de dinheiro — é o que faz sentido pra "melhor época pra
// comprar", e mantém o custo de chamadas baixo (miles teria seu próprio
// custo de cota por fonte, escopo de uma próxima vez se for pedido).
async function scanMonth({ origin, destination, yearMonth }) {
  const dates = sampleDates(yearMonth);
  const results = [];

  for (const date of dates) {
    let cheapest = null;
    for (const programId of CASH_PROVIDER_IDS) {
      const provider = ALL_PROVIDERS[programId];
      const cacheKey = `${programId}|${origin}|${destination}|${date}|null|false`;
      let result;
      try {
        result = await cached(cacheKey, PROVIDER_CACHE_TTL_MS, () =>
          provider.search({ origin, destination, departDate: date, returnDate: null, allowStopover: false, allowHiddenCity: false })
        );
      } catch (err) {
        result = { status: 'error', offers: [] };
      }
      for (const offer of result.offers || []) {
        if (Number.isFinite(offer.priceBRL) && (!cheapest || offer.priceBRL < cheapest.priceBRL)) {
          cheapest = { priceBRL: offer.priceBRL, program: offer.program };
        }
      }
    }
    results.push({ date, priceBRL: cheapest?.priceBRL ?? null, program: cheapest?.program ?? null });
  }

  return { sampleCount: SAMPLE_COUNT, dates: results };
}

module.exports = { scanMonth, SAMPLE_COUNT };
