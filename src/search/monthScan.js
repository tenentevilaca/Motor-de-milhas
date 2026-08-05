const { ALL_PROVIDERS, CASH_PROVIDER_IDS, MILE_PROGRAM_IDS } = require('../providers');
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

// Data é sempre a DATA DE IDA — essa consulta é só ida (sem volta), pra
// manter o custo de chamadas baixo com ~5 amostras em vez do mês inteiro.
// Cada data amostrada é uma chamada independente às fontes de preço em
// dinheiro e, por padrão, também aos programas de milhas configurados (pedido
// explícito: o usuário quer ver o calendário de milhas junto do de dinheiro).
// `includeMiles: false` permite uma varredura mais barata (só dinheiro) pra
// quem só quer visualizar o calendário de preço sem gastar cota com milhas.
// Uma data vir vazia não significa erro: pode ser que a fonte genuinamente
// não tenha achado voo pra aquele dia específico, ou (Google Flights Live) a
// cota grátis mensal já ter estourado no meio da varredura.
async function scanMonth({ origin, destination, yearMonth, includeMiles = true }) {
  const dates = sampleDates(yearMonth);
  const results = [];
  const programIds = includeMiles ? [...CASH_PROVIDER_IDS, ...MILE_PROGRAM_IDS] : [...CASH_PROVIDER_IDS];

  // Cada programa é uma API/host diferente, então consultá-los em paralelo
  // pra uma mesma data não estoura a cota de nenhum (mesma lógica de
  // runSearch.js) — só corta o tempo de espera do usuário, sem gastar cota
  // a mais. As datas continuam sequenciais entre si.
  for (const date of dates) {
    let cheapestCash = null;
    let cheapestMiles = null;
    const errors = [];

    const providerResults = await Promise.all(
      programIds.map(async (programId) => {
        const provider = ALL_PROVIDERS[programId];
        const cacheKey = `${programId}|${origin}|${destination}|${date}|null|false`;
        try {
          return await cached(cacheKey, PROVIDER_CACHE_TTL_MS, () =>
            provider.search({ origin, destination, departDate: date, returnDate: null, allowStopover: false, allowHiddenCity: false })
          );
        } catch (err) {
          return { status: 'error', message: err.message, offers: [] };
        }
      })
    );

    for (let i = 0; i < programIds.length; i++) {
      const programId = programIds[i];
      const result = providerResults[i];
      if (result.status === 'error') errors.push(`${programId}: ${result.message}`);

      for (const offer of result.offers || []) {
        if (Number.isFinite(offer.priceBRL) && (!cheapestCash || offer.priceBRL < cheapestCash.priceBRL)) {
          cheapestCash = { priceBRL: offer.priceBRL, program: offer.program };
        }
        if (Number.isFinite(offer.milesRequired) && (!cheapestMiles || offer.milesRequired < cheapestMiles.milesRequired)) {
          cheapestMiles = { milesRequired: offer.milesRequired, taxesBRL: offer.taxesBRL ?? null, program: offer.program };
        }
      }
    }

    results.push({
      date,
      priceBRL: cheapestCash?.priceBRL ?? null,
      cashProgram: cheapestCash?.program ?? null,
      milesRequired: cheapestMiles?.milesRequired ?? null,
      milesTaxesBRL: cheapestMiles?.taxesBRL ?? null,
      milesProgram: cheapestMiles?.program ?? null,
      // Só preenchido quando alguma fonte realmente falhou (erro/cota) nessa
      // data — ajuda a distinguir "sem voo nesse dia" de "fonte com problema".
      errorNote: errors.length > 0 ? errors.join('; ').slice(0, 200) : null,
    });
  }

  return { sampleCount: SAMPLE_COUNT, mode: includeMiles ? 'full' : 'cash_only', providersUsed: programIds, dates: results };
}

module.exports = { scanMonth, SAMPLE_COUNT };
