const { ALL_PROVIDERS, MILE_PROGRAM_IDS, CASH_PROVIDER_IDS } = require('../providers');
const { evaluateOffer } = require('./anomaly');
const { compareSplitTickets } = require('./splitTicketCompare');
const db = require('../db');
const { sendEmailAlert } = require('../notify/email');
const { sendWhatsAppAlert } = require('../notify/whatsapp');
const { sendTelegramAlert } = require('../notify/telegram');

function formatBRL(value) {
  if (value == null) return '-';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function buildAlertHtml(search, alertOffers, splitSuggestions) {
  const rows = alertOffers
    .map(
      ({ offer, evaluation }) => `
      <tr>
        <td>${offer.program}</td>
        <td>${formatBRL(offer.priceBRL)}</td>
        <td>${offer.milesRequired ?? '-'}</td>
        <td>${offer.stops === 0 ? 'direto' : offer.stops + ' parada(s)'}</td>
        <td>${offer.isHiddenCity ? 'sim' : 'não'}</td>
        <td>${evaluation.reason || (evaluation.isAnomaly ? 'possível erro de tarifa' : 'abaixo do seu alvo')}</td>
      </tr>`
    )
    .join('');

  const splitRows = (splitSuggestions || [])
    .map(
      (s) => `
      <tr>
        <td>${s.program}</td>
        <td>${formatBRL(s.roundTripPriceBRL)}</td>
        <td>${formatBRL(s.splitPriceBRL)}</td>
        <td>${formatBRL(s.savingsBRL)}</td>
      </tr>`
    )
    .join('');

  return `
    <h2>Motor de Milhas — ${search.origin} → ${search.destination}</h2>
    ${
      rows
        ? `<p>Oferta(s) que merecem sua atenção:</p>
    <table border="1" cellpadding="6" cellspacing="0">
      <tr><th>Programa</th><th>Preço</th><th>Milhas</th><th>Paradas</th><th>Hidden-city</th><th>Motivo do alerta</th></tr>
      ${rows}
    </table>`
        : ''
    }
    ${
      splitRows
        ? `<p>Quebra de bilhete: comprar ida e volta separadas sai mais barato:</p>
    <table border="1" cellpadding="6" cellspacing="0">
      <tr><th>Fonte</th><th>Ida e volta</th><th>Separado (ida + volta)</th><th>Economia</th></tr>
      ${splitRows}
    </table>`
        : ''
    }
    <p style="color:#a00"><b>Aviso:</b> tarifas com erro (error fares) podem ser canceladas pela companhia mesmo após a emissão.
    Passagens hidden-city/skiplagged violam o contrato de transporte da maioria das companhias e podem levar a cancelamento
    do restante do itinerário ou bloqueio de conta de milhas. Confirme manualmente antes de contar com a compra.</p>
  `;
}

async function runSearch(search) {
  const programsToQuery = [...CASH_PROVIDER_IDS, ...search.programs.filter((p) => MILE_PROGRAM_IDS.includes(p))];
  const results = [];

  for (const programId of programsToQuery) {
    const provider = ALL_PROVIDERS[programId];
    if (!provider) continue;
    let result;
    try {
      result = await provider.search({
        origin: search.origin,
        destination: search.destination,
        departDate: search.departDate,
        returnDate: search.returnDate,
        allowStopover: search.allowStopover,
        allowHiddenCity: search.allowHiddenCity && search.hiddenCityRiskAcknowledged,
      });
    } catch (err) {
      result = { status: 'error', message: err.message, offers: [] };
    }
    results.push({ programId, ...result });
  }

  const now = new Date().toISOString();
  const historyEntries = [];
  const alertOffers = [];

  for (const r of results) {
    for (const offer of r.offers) {
      const baseline = db.getRouteBaseline(search.origin, search.destination, offer.program);
      const evaluation = evaluateOffer(offer, baseline);

      historyEntries.push({
        searchId: search.id,
        origin: search.origin,
        destination: search.destination,
        program: offer.program,
        priceBRL: offer.priceBRL,
        milesRequired: offer.milesRequired,
        stops: offer.stops,
        isHiddenCity: offer.isHiddenCity,
        checkedAt: now,
        isAnomaly: evaluation.isAnomaly,
        isFlashSale: evaluation.isFlashSale,
      });

      const belowTarget = search.targetPrice != null && offer.priceBRL != null && offer.priceBRL <= search.targetPrice;

      if (evaluation.isAnomaly || evaluation.isFlashSale || belowTarget) {
        alertOffers.push({ offer, evaluation, belowTarget });
      }
    }
  }

  if (historyEntries.length > 0) db.addHistoryEntries(historyEntries);
  db.updateSearch(search.id, { lastRunAt: now });

  // Quebra de bilhete: só roda se a busca pediu explicitamente (consome
  // chamadas extras nas APIs de preço, então é opt-in por busca).
  const splitComparisons = await compareSplitTickets(search);
  const splitSuggestions = [];
  for (const cmp of splitComparisons) {
    const roundTripOffers = results.find((r) => r.programId === cmp.program)?.offers || [];
    const roundTripMin = roundTripOffers.reduce(
      (min, o) => (o.priceBRL != null && (min == null || o.priceBRL < min) ? o.priceBRL : min),
      null
    );
    if (roundTripMin != null && cmp.splitPriceBRL < roundTripMin) {
      splitSuggestions.push({
        program: cmp.program,
        roundTripPriceBRL: roundTripMin,
        splitPriceBRL: cmp.splitPriceBRL,
        savingsBRL: roundTripMin - cmp.splitPriceBRL,
      });
    }
  }

  const notifications = { email: null, whatsapp: null, telegram: null };
  if (alertOffers.length > 0 || splitSuggestions.length > 0) {
    const html = buildAlertHtml(search, alertOffers, splitSuggestions);
    const textLines = [
      ...alertOffers.map((a) => `${a.offer.program}: ${formatBRL(a.offer.priceBRL)} (${a.evaluation.reason || 'abaixo do alvo'})`),
      ...splitSuggestions.map((s) => `Quebra de bilhete ${s.program}: economize ${formatBRL(s.savingsBRL)} comprando separado`),
    ];

    if (search.email) {
      notifications.email = await sendEmailAlert({
        to: search.email,
        subject: `✈️ Alerta de preço: ${search.origin} → ${search.destination}`,
        html,
      });
    }
    if (search.whatsapp) {
      notifications.whatsapp = await sendWhatsAppAlert({
        to: search.whatsapp,
        message: `Motor de Milhas ${search.origin}->${search.destination}:\n${textLines.join('\n')}`,
      });
    }
    if (search.telegramChatId) {
      notifications.telegram = await sendTelegramAlert({
        chatId: search.telegramChatId,
        message: `Motor de Milhas ${search.origin}->${search.destination}:\n${textLines.join('\n')}`,
      });
    }
  }

  return {
    searchId: search.id,
    checkedAt: now,
    providerResults: results,
    alertCount: alertOffers.length,
    splitSuggestions,
    notifications,
  };
}

module.exports = { runSearch };
