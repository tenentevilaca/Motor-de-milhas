const { ALL_PROVIDERS, MILE_PROGRAM_IDS, CASH_PROVIDER_IDS } = require('../providers');
const { evaluateOffer } = require('./anomaly');
const { compareSplitTickets } = require('./splitTicketCompare');
const { generateFlexDates } = require('./flexDates');
const { describeProviderError } = require('../providerError');
const { cached } = require('../cache');
const { regionCodeFromValue, getHubAirportsForRegion, listRegions, getAirportByIata } = require('../airports');
const config = require('../config');
const db = require('../db');

// Janela de cache pras chamadas de preço: protege a cota gratuita das APIs
// quando a mesma rota+data é checada de novo em pouco tempo (buscas
// duplicadas, cliques repetidos em "Rodar agora"). 15min é curto o
// suficiente pra não atrapalhar a detecção de promoção relâmpago.
const PROVIDER_CACHE_TTL_MS = 15 * 60 * 1000;

// Orçamento de tempo pra RESPONDER ao navegador — diferente do timeout de
// cada provider (que pode ser bem maior, ex: 28s no Google Flights). Uma
// fonte paga pode legitimamente ser mais lenta que as outras sem estar com
// problema nenhum, mas a busca inteira não pode ficar refém dela: se uma
// fonte não respondeu dentro do orçamento, a busca segue sem ela (status
// "pending" em vez de esperar) — a chamada em si NÃO é cancelada, continua
// rodando em segundo plano e preenche o cache normalmente pra próxima vez
// (cached() grava o resultado assim que chegar, não importa quem ainda tá
// esperando). Isso existe pro Render (e qualquer proxy na frente do host)
// ter seu próprio timeout de requisição recebida — sem esse teto, esperar
// uma fonte lenta o suficiente derruba a conexão do navegador sem resposta
// nenhuma (o mesmo "NetworkError" genérico que já corrigimos uma vez).
const PROVIDER_SOFT_DEADLINE_MS = Number(process.env.SEARCH_PROVIDER_SOFT_DEADLINE_MS) || 10000;
// Teto pro tempo TOTAL da busca (soma de todas as combinações de data
// testadas) — protege contra o caso de várias combinações de flexibilidade,
// cada uma já limitada pelo teto acima, ainda somarem mais tempo que o
// proxy aguenta. Checado antes de começar cada combinação nova; se estourar,
// as combinações restantes simplesmente não são testadas nessa resposta.
const RESPONSE_DEADLINE_MS = Number(process.env.SEARCH_RESPONSE_DEADLINE_MS) || 20000;

// Corre `promise` contra um cronômetro — devolve o que resolver primeiro,
// mas NUNCA cancela `promise` (não dá pra cancelar uma promise em JS; ela
// segue rodando e, quando terminar, ainda vai gravar no cache através do
// cached() que a envolve — só paramos de ESPERAR por ela nessa resposta).
function raceWithSoftDeadline(promise, ms) {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({
        status: 'pending',
        message: `Ainda buscando depois de ${Math.round(ms / 1000)}s — tente rodar de novo em instantes (o resultado fica em cache assim que a fonte responder).`,
        offers: [],
      });
    }, ms);
    // `promise` aqui já nunca rejeita (erro de provider é capturado antes),
    // então só precisa de .then — mas .catch por segurança não faz mal.
    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ status: 'error', message: 'Erro inesperado', offers: [] });
      }
    );
  });
}

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
        <td>${offer.destination || '-'}</td>
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
        <td>${s.departDate || '-'} / ${s.returnDate || '-'}</td>
      </tr>`
    )
    .join('');

  return `
    <h2>Motor de Milhas — ${search.origin} → ${search.destination}</h2>
    ${
      rows
        ? `<p>Oferta(s) que merecem sua atenção:</p>
    <table border="1" cellpadding="6" cellspacing="0">
      <tr><th>Destino</th><th>Programa</th><th>Preço</th><th>Milhas</th><th>Paradas</th><th>Hidden-city</th><th>Motivo do alerta</th></tr>
      ${rows}
    </table>`
        : ''
    }
    ${
      splitRows
        ? `<p>Quebra de bilhete: comprar ida e volta separadas sai mais barato:</p>
    <table border="1" cellpadding="6" cellspacing="0">
      <tr><th>Fonte</th><th>Ida e volta</th><th>Separado (ida + volta)</th><th>Economia</th><th>Datas reais do split</th></tr>
      ${splitRows}
    </table>`
        : ''
    }
    <p style="color:#a00"><b>Aviso:</b> tarifas com erro (error fares) podem ser canceladas pela companhia mesmo após a emissão.
    Passagens hidden-city/skiplagged violam o contrato de transporte da maioria das companhias e podem levar a cancelamento
    do restante do itinerário ou bloqueio de conta de milhas. Confirme manualmente antes de contar com a compra.</p>
  `;
}

function regionLabel(code) {
  return listRegions().find((r) => r.code === code)?.label || code;
}

// "Belo Horizonte (CNF)" em vez de só o código — mais legível na tabela de
// resultado. Cai pro código puro se o aeroporto não estiver na nossa base.
function destinationLabel(iata) {
  const airport = getAirportByIata(iata);
  return airport ? `${airport.city} (${iata})` : iata;
}

// Não existe fonte grátis/ao vivo pro "valor médio de mercado" das milhas —
// isso é uma estimativa que o próprio usuário define (mesma lógica do
// USD_TO_BRL_RATE pra dólar), configurável na tela de Configurações.
function milesValuePer1000() {
  const v = Number(config.get('MILES_VALUE_PER_1000'));
  return Number.isFinite(v) && v > 0 ? v : 20;
}

async function runSearch(search) {
  const programsToQuery = [...CASH_PROVIDER_IDS, ...search.programs.filter((p) => MILE_PROGRAM_IDS.includes(p))];

  // Destino = região inteira (ex: "REGION:SA"): em vez de um único aeroporto,
  // consulta uma lista enxuta de hubs representativos daquele continente, pra
  // achar o mais barato sem estourar a cota das APIs gratuitas consultando
  // milhares de aeroportos.
  const regionCode = regionCodeFromValue(search.destination);
  const destinations = regionCode
    ? getHubAirportsForRegion(regionCode)
        .map((a) => a.iata)
        .filter((iata) => iata !== search.origin.toUpperCase())
    : [search.destination];

  // Combinações de data (ida × volta) pra essa busca — só mais de uma quando
  // flexDays > 0. A lista é montada UMA VEZ e aplicada igual pra cada
  // destino/programa: se o limite fosse um contador só compartilhado entre
  // todos os providers, o primeiro provider consultado "gastaria" o limite
  // inteiro sozinho e os providers seguintes ficariam sem nenhuma data
  // testada — o mesmo destino/programa sempre vê a mesma janela de datas.
  const flexDays = Number(search.flexDays) || 0;
  const departDates = generateFlexDates(search.departDate, flexDays);
  const returnDates = search.returnDate ? generateFlexDates(search.returnDate, flexDays) : [null];
  const MAX_DATE_COMBINATIONS = flexDays > 0 ? flexDays * 5 : 1;
  const dateCombinations = [];
  for (const departDate of departDates) {
    for (const returnDate of returnDates) {
      dateCombinations.push({ departDate, returnDate });
      if (dateCombinations.length >= MAX_DATE_COMBINATIONS) break;
    }
    if (dateCombinations.length >= MAX_DATE_COMBINATIONS) break;
  }

  // Cada programa é uma API/host diferente (Travelpayouts, Google Flights,
  // Smiles, Azul...), então consultá-los em paralelo pra um mesmo
  // destino/data não estoura a cota de nenhum deles — a cota é por API, não
  // compartilhada. O que preserva o espaçamento é manter as datas/destinos
  // de UM MESMO provider sequenciais entre si (loop de fora), então uma API
  // com limite de requisições por segundo continua vendo uma chamada de
  // cada vez. Isso corta o tempo de espera do usuário por ~N (nº de
  // programas consultados) sem gastar cota a mais.
  const results = [];
  const searchStartedAt = Date.now();
  let combinationsAttempted = 0;
  let deadlineExceeded = false;
  searchLoop: for (const destination of destinations) {
    for (const { departDate, returnDate } of dateCombinations) {
      if (Date.now() - searchStartedAt > RESPONSE_DEADLINE_MS) {
        deadlineExceeded = true;
        break searchLoop;
      }
      combinationsAttempted += 1;
      const batch = await Promise.all(
        programsToQuery.map(async (programId) => {
          const provider = ALL_PROVIDERS[programId];
          if (!provider) return null;

          const cacheKey = `${programId}|${search.origin}|${destination}|${departDate}|${returnDate}|${search.allowStopover}`;
          const fetchResult = (async () => {
            try {
              return await cached(cacheKey, PROVIDER_CACHE_TTL_MS, () =>
                provider.search({
                  origin: search.origin,
                  destination,
                  departDate,
                  returnDate,
                  allowStopover: search.allowStopover,
                  allowHiddenCity: search.allowHiddenCity && search.hiddenCityRiskAcknowledged,
                })
              );
            } catch (err) {
              return { status: 'error', message: describeProviderError(err), offers: [] };
            }
          })();
          const result = await raceWithSoftDeadline(fetchResult, PROVIDER_SOFT_DEADLINE_MS);
          // manualCheckUrl vem por resultado de provider, não por oferta — repassa
          // pra cada oferta aqui pra servir de link de fallback quando a oferta
          // não tiver deepLink próprio (ex: Smiles não devolve link de compra).
          // departDate/returnDate também vão em cada oferta: com flexibilidade
          // de datas, o resultado mistura várias datas na mesma busca, então
          // cada linha precisa deixar claro a qual data ela se refere.
          return {
            programId,
            destination,
            departDate,
            returnDate,
            ...result,
            offers: (result.offers || []).map((o) => ({
              ...o,
              destination,
              destinationLabel: destinationLabel(destination),
              departDate,
              returnDate,
              manualCheckUrl: result.manualCheckUrl || null,
            })),
          };
        })
      );
      results.push(...batch.filter(Boolean));
    }
  }
  const combinationsPlanned = destinations.length * dateCombinations.length;

  const now = new Date().toISOString();
  const historyEntries = [];
  const alertOffers = [];

  for (const r of results) {
    for (const offer of r.offers) {
      const baseline = db.getRouteBaseline(search.origin, r.destination, offer.program);
      const evaluation = evaluateOffer(offer, baseline);
      // "Novo mínimo histórico": só dá pra saber comparando com o baseline
      // buscado ANTES de gravar essa oferta no histórico (senão a oferta
      // se compararia com ela mesma depois de já estar salva, e Math.min
      // incluindo o próprio valor nunca é "menor que" ele mesmo — sempre
      // false mesmo quando é de fato o novo recorde). Exige pelo menos 1
      // amostra anterior: a primeiríssima checagem de uma rota não é um
      // "recorde batido", é só o único dado que existe ainda.
      offer.isNewLow = Boolean(baseline && Number.isFinite(offer.priceBRL) && offer.priceBRL < baseline.min);

      historyEntries.push({
        searchId: search.id,
        origin: search.origin,
        destination: r.destination,
        departDate: r.departDate,
        program: offer.program,
        priceBRL: offer.priceBRL,
        milesRequired: offer.milesRequired,
        stops: offer.stops,
        isHiddenCity: offer.isHiddenCity,
        checkedAt: now,
        isAnomaly: evaluation.isAnomaly,
        isFlashSale: evaluation.isFlashSale,
      });

      const belowTarget = search.targetPrice != null && Number.isFinite(offer.priceBRL) && offer.priceBRL <= search.targetPrice;

      if (evaluation.isAnomaly || evaluation.isFlashSale || belowTarget) {
        alertOffers.push({ offer, evaluation, belowTarget });
      }
    }
  }

  if (historyEntries.length > 0) db.addHistoryEntries(historyEntries);
  db.updateSearch(search.id, { lastRunAt: now });

  // Quebra de bilhete exige um destino específico — não roda pra busca por
  // região (ver validação em server.js, que já bloqueia essa combinação).
  const splitComparisons = regionCode ? [] : await compareSplitTickets(search);
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
        departDate: cmp.departDate || null,
        returnDate: cmp.returnDate || null,
      });
    }
  }

  // Apresenta como um motor de busca de verdade: todas as ofertas com preço
  // em dinheiro, de todas as fontes configuradas, ordenadas da mais barata
  // pra mais cara — e destaca a melhor de todas (considerando também a
  // quebra de bilhete, se for mais barata que qualquer oferta redonda).
  // Number.isFinite (não só "!= null") é intencional: um provider com bug
  // pode devolver NaN, que passa num filtro "!= null" mas vira `null` na
  // serialização JSON — resultando em várias "ofertas fantasma" idênticas
  // sem preço nenhum (bug real já visto com o Travelpayouts).
  // Ofertas só-em-milhas (sem priceBRL, ex: Smiles via Award Flight & Miles
  // Search API) também entram na lista — só não competem pelo "menor preço
  // encontrado" (que é sempre em R$); aparecem depois das ofertas com preço
  // em dinheiro, ordenadas por milhas.
  const allOffersSorted = results
    .flatMap((r) => r.offers.map((o) => ({ ...o })))
    .filter((o) => Number.isFinite(o.priceBRL) || Number.isFinite(o.milesRequired))
    .sort((a, b) => {
      const aCash = Number.isFinite(a.priceBRL);
      const bCash = Number.isFinite(b.priceBRL);
      if (aCash && bCash) return a.priceBRL - b.priceBRL;
      if (aCash) return -1;
      if (bCash) return 1;
      return (a.milesRequired ?? Infinity) - (b.milesRequired ?? Infinity);
    });

  const cheapestCashOffer = allOffersSorted.find((o) => Number.isFinite(o.priceBRL));

  // Busca por região consulta vários destinos (hubs), e flexibilidade de
  // datas testa várias datas — o menor preço em dinheiro de UM
  // destino/data não serve de referência pra oferta em milhas de OUTRO
  // destino/data. Precisa comparar destino+data com destino+data.
  function cashRefKey(o) {
    return `${o.destination}|${o.departDate}|${o.returnDate}`;
  }
  const cheapestCashByDestination = new Map();
  for (const o of allOffersSorted) {
    if (!Number.isFinite(o.priceBRL)) continue;
    const key = cashRefKey(o);
    const current = cheapestCashByDestination.get(key);
    if (!current || o.priceBRL < current.priceBRL) cheapestCashByDestination.set(key, o);
  }

  // Compara cada oferta em milhas com o menor preço em dinheiro já achado
  // NA MESMA BUSCA, pro MESMO destino e MESMA data — não é uma cotação de
  // mercado em tempo real (não existe API grátis pra isso), é a estimativa
  // que o próprio usuário configurou (MILES_VALUE_PER_1000) aplicada ao
  // preço em dinheiro real que a busca encontrou agora. Sem preço em
  // dinheiro achado pra esse destino/data nessa busca, não dá pra comparar
  // — fica sem arbitrage (o front explica isso em vez de célula vazia).
  const valuePer1000 = milesValuePer1000();
  for (const o of allOffersSorted) {
    if (!Number.isFinite(o.milesRequired)) continue;
    const cashRef = cheapestCashByDestination.get(cashRefKey(o));
    if (!cashRef) continue;
    const milesCostBRL = (o.milesRequired / 1000) * valuePer1000 + (o.taxesBRL || 0);
    o.arbitrage = {
      milesCostBRL,
      cashReferenceBRL: cashRef.priceBRL,
      milesValuePer1000: valuePer1000,
      verdict: milesCostBRL < cashRef.priceBRL ? 'miles_better' : 'cash_better',
    };
  }

  // Passageiros: as fontes são sempre consultadas pra 1 adulto (nenhuma
  // API integrada aceita esse parâmetro hoje), então o total pra N
  // passageiros é uma ESTIMATIVA linear (preço por pessoa × N) — não uma
  // cotação real de grupo, que pode variar por causa de taxas de embarque
  // que mudam por assento ou tarifas que somem antes do vigésimo lugar.
  // Escala os três campos monetários/de milhas: multiplicar só o preço em
  // dinheiro e deixar milhas/taxas por-pessoa seria enganoso, já que
  // resgatar milhas pra 2 pessoas custa o dobro de milhas também.
  const passengers = Number(search.passengers) > 0 ? Number(search.passengers) : 1;
  if (passengers > 1) {
    for (const o of allOffersSorted) {
      if (Number.isFinite(o.priceBRL)) o.priceBRLTotal = Math.round(o.priceBRL * passengers * 100) / 100;
      if (Number.isFinite(o.milesRequired)) o.milesRequiredTotal = o.milesRequired * passengers;
      if (Number.isFinite(o.taxesBRL)) o.taxesBRLTotal = Math.round(o.taxesBRL * passengers * 100) / 100;
    }
  }

  let bestDeal = cheapestCashOffer
    ? {
        type: 'offer',
        priceBRL: cheapestCashOffer.priceBRL,
        priceBRLTotal: cheapestCashOffer.priceBRLTotal ?? null,
        program: cheapestCashOffer.program,
        stops: cheapestCashOffer.stops,
        destination: cheapestCashOffer.destination,
        destinationLabel: cheapestCashOffer.destinationLabel,
        milesRequired: cheapestCashOffer.milesRequired ?? null,
        departDate: cheapestCashOffer.departDate,
        returnDate: cheapestCashOffer.returnDate,
        isNewLow: Boolean(cheapestCashOffer.isNewLow),
      }
    : null;
  const cheapestSplit = splitSuggestions.reduce(
    (min, s) => (min == null || s.splitPriceBRL < min.splitPriceBRL ? s : min),
    null
  );
  if (cheapestSplit && (!bestDeal || cheapestSplit.splitPriceBRL < bestDeal.priceBRL)) {
    bestDeal = {
      type: 'split',
      priceBRL: cheapestSplit.splitPriceBRL,
      priceBRLTotal: passengers > 1 ? Math.round(cheapestSplit.splitPriceBRL * passengers * 100) / 100 : null,
      program: cheapestSplit.program,
      departDate: cheapestSplit.departDate || null,
      returnDate: cheapestSplit.returnDate || null,
    };
  }

  const destinationDisplay = regionCode ? regionLabel(regionCode) : search.destination;

  const notifications = { email: null, whatsapp: null, telegram: null };
  if (alertOffers.length > 0 || splitSuggestions.length > 0) {
    const html = buildAlertHtml({ ...search, destination: destinationDisplay }, alertOffers, splitSuggestions);
    const textLines = [
      ...alertOffers.map((a) => `${a.offer.program} (${a.offer.destination}): ${formatBRL(a.offer.priceBRL)} (${a.evaluation.reason || 'abaixo do alvo'})`),
      ...splitSuggestions.map((s) => `Quebra de bilhete ${s.program}: economize ${formatBRL(s.savingsBRL)} comprando separado`),
    ];

    if (search.email) {
      notifications.email = await sendEmailAlert({
        to: search.email,
        subject: `✈️ Alerta de preço: ${search.origin} → ${destinationDisplay}`,
        html,
      });
    }
    if (search.whatsapp) {
      notifications.whatsapp = await sendWhatsAppAlert({
        to: search.whatsapp,
        message: `Motor de Milhas ${search.origin}->${destinationDisplay}:\n${textLines.join('\n')}`,
      });
    }
    if (search.telegramChatId) {
      notifications.telegram = await sendTelegramAlert({
        chatId: search.telegramChatId,
        message: `Motor de Milhas ${search.origin}->${destinationDisplay}:\n${textLines.join('\n')}`,
      });
    }
  }

  return {
    searchId: search.id,
    checkedAt: now,
    providerResults: results,
    alertCount: alertOffers.length,
    splitSuggestions,
    allOffersSorted,
    bestDeal,
    notifications,
    flexDatesChecked: dateCombinations.length,
    passengers,
    partialResults: deadlineExceeded,
    combinationsSkipped: combinationsPlanned - combinationsAttempted,
  };
}

module.exports = { runSearch };
