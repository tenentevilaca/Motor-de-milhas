const cron = require('node-cron');
const db = require('./db');
const { runSearch } = require('./search/runSearch');

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
// o quanto antes. Ambos configuráveis via .env.
const MAIN_CRON = process.env.SCHEDULE_CRON_MAIN || '0 6,13,21 * * *';
const FLASHSALE_CRON = process.env.SCHEDULE_CRON_FLASHSALE || '0 */2 * * *';
const TIMEZONE = process.env.SCHEDULE_TIMEZONE || 'America/Sao_Paulo';

async function runAllActiveSearches(label) {
  const searches = db.listSearches().filter((s) => s.active);
  console.log(`[scheduler:${label}] rodando ${searches.length} busca(s) ativa(s) em ${new Date().toISOString()}`);
  for (const search of searches) {
    try {
      const result = await runSearch(search);
      if (result.alertCount > 0) {
        console.log(`[scheduler:${label}] ${search.origin}->${search.destination}: ${result.alertCount} alerta(s) disparado(s)`);
      }
    } catch (err) {
      console.error(`[scheduler:${label}] erro na busca ${search.id} (${search.origin}->${search.destination}):`, err.message);
    }
  }
}

function start() {
  cron.schedule(MAIN_CRON, () => runAllActiveSearches('principal'), { timezone: TIMEZONE });
  cron.schedule(FLASHSALE_CRON, () => runAllActiveSearches('promo-relampago'), { timezone: TIMEZONE });
  console.log(`Agendador iniciado (fuso ${TIMEZONE}): principal="${MAIN_CRON}" flash-sale="${FLASHSALE_CRON}"`);
}

module.exports = { start, runAllActiveSearches };
