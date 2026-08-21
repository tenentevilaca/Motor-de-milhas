const cron = require('node-cron');
const { parseExpression } = require('cron-parser');
const db = require('./db');
const { runSearch } = require('./search/runSearch');
const { checkDealFeedsForAllSearches } = require('./search/checkDealFeeds');
const { mapWithConcurrencyLimit } = require('./concurrency');

// Quantas buscas salvas rodam ao mesmo tempo quando o agendador dispara.
// Cada runSearch() já paraleliza internamente entre PROVIDERS diferentes
// (hosts diferentes, sem risco de cota) — mas se o usuário tem várias buscas
// salvas, rodá-las uma de cada vez (era o comportamento antigo) faz o
// agendador demorar linearmente com o número de buscas. Só que aqui, ao
// contrário do paralelismo entre providers, buscas diferentes PODEM cair no
// MESMO provider (rotas diferentes, mesma fonte) — por isso um limite
// pequeno (não "todas de uma vez") em vez de paralelismo total.
const SEARCH_CONCURRENCY = Number(process.env.SCHEDULER_CONCURRENCY) || 3;

// "Melhor horário" para rodar as buscas:
// A ideia popular de "compre passagem terça de manhã" é folclore já
// desmentido por pesquisas (Expedia/ARC, CheapAir) — não existe hora mágica
// universal. O que realmente ajuda:
//   1) Tarifas e promoções costumam ser recarregadas de madrugada/começo da
//      manhã (novos "fare buckets" do dia).
//   2) Erros de tarifa e promoções relâmpago são corrigidos rápido — quanto
//      mais frequente a checagem, maior a chance de pegar antes da correção.
//   3) Preços variam ao longo do dia por demanda, então checar em horários
//      espaçados (manhã/tarde/noite) captura essa variação.
// Por isso: 3 buscas completas por dia (06h, 13h, 21h) + varredura mais
// frequente (a cada 2h) focada em pegar promoções relâmpago/erros de tarifa
// o quanto antes, + checagem de blogs de promoção a cada 10min (esses posts
// somem/mudam rápido quando a promoção é boa — RSS aguenta tranquilo essa
// frequência, é feito pra isso). Tudo configurável via .env.
const MAIN_CRON = process.env.SCHEDULE_CRON_MAIN || '0 6,13,21 * * *';
const FLASHSALE_CRON = process.env.SCHEDULE_CRON_FLASHSALE || '0 */2 * * *';
const DEALFEED_CRON = process.env.SCHEDULE_CRON_DEALFEED || '*/10 * * * *';
const TIMEZONE = process.env.SCHEDULE_TIMEZONE || 'America/Sao_Paulo';
const enabled = process.env.DISABLE_SCHEDULER !== 'true';

// Estado em memória só para mostrar na tela "quando rodou pela última vez" —
// some a cada reinício do processo, o que é aceitável para essa finalidade.
const state = {
  lastMainRunAt: null,
  lastFlashSaleRunAt: null,
  lastMainSearchCount: null,
  lastFlashSaleSearchCount: null,
  lastDealFeedRunAt: null,
  lastDealFeedResult: null,
};

async function runAllActiveSearches(label) {
  const searches = db.listSearches().filter((s) => s.active);
  const now = new Date().toISOString();
  console.log(`[scheduler:${label}] rodando ${searches.length} busca(s) ativa(s) em ${now} (até ${SEARCH_CONCURRENCY} em paralelo)`);
  await mapWithConcurrencyLimit(searches, SEARCH_CONCURRENCY, async (search) => {
    try {
      // Marca só nessa chamada (não persiste no registro salvo em disco) —
      // é o que faz runSearch() pular a fonte paga (Google Flights via
      // RapidAPI) nas execuções automáticas do agendador. Ver comentário em
      // runSearch.js.
      const result = await runSearch({ ...search, isScheduledRun: true });
      if (result.alertCount > 0) {
        console.log(`[scheduler:${label}] ${search.origin}->${search.destination}: ${result.alertCount} alerta(s) disparado(s)`);
      }
    } catch (err) {
      console.error(`[scheduler:${label}] erro na busca ${search.id} (${search.origin}->${search.destination}):`, err.message);
    }
  });
  if (label === 'principal') {
    state.lastMainRunAt = now;
    state.lastMainSearchCount = searches.length;
  } else {
    state.lastFlashSaleRunAt = now;
    state.lastFlashSaleSearchCount = searches.length;
  }
}

async function runDealFeedCheck() {
  try {
    const result = await checkDealFeedsForAllSearches();
    state.lastDealFeedRunAt = result.checkedAt;
    state.lastDealFeedResult = result;
    if (result.alertsSent.length > 0) {
      console.log(`[scheduler:feed-promocoes] ${result.alertsSent.length} busca(s) com alerta de post novo`);
    }
  } catch (err) {
    console.error('[scheduler:feed-promocoes] erro:', err.message);
  }
}

function nextRun(cronExpr) {
  try {
    return parseExpression(cronExpr, { tz: TIMEZONE }).next().toDate().toISOString();
  } catch {
    return null;
  }
}

function getStatus() {
  return {
    enabled,
    timezone: TIMEZONE,
    main: { cron: MAIN_CRON, lastRunAt: state.lastMainRunAt, lastSearchCount: state.lastMainSearchCount, nextRunAt: enabled ? nextRun(MAIN_CRON) : null },
    flashSale: { cron: FLASHSALE_CRON, lastRunAt: state.lastFlashSaleRunAt, lastSearchCount: state.lastFlashSaleSearchCount, nextRunAt: enabled ? nextRun(FLASHSALE_CRON) : null },
    dealFeed: { cron: DEALFEED_CRON, lastRunAt: state.lastDealFeedRunAt, lastResult: state.lastDealFeedResult, nextRunAt: enabled ? nextRun(DEALFEED_CRON) : null },
  };
}

function start() {
  cron.schedule(MAIN_CRON, () => runAllActiveSearches('principal'), { timezone: TIMEZONE });
  cron.schedule(FLASHSALE_CRON, () => runAllActiveSearches('promo-relampago'), { timezone: TIMEZONE });
  cron.schedule(DEALFEED_CRON, runDealFeedCheck, { timezone: TIMEZONE });
  console.log(`Agendador iniciado (fuso ${TIMEZONE}): principal="${MAIN_CRON}" flash-sale="${FLASHSALE_CRON}" feed-promocoes="${DEALFEED_CRON}"`);
}

module.exports = { start, runAllActiveSearches, runDealFeedCheck, getStatus };
