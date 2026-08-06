const { getAirportByIata } = require('../airports');
const db = require('../db');

const MONTH_NAMES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

const WEEKDAY_NAMES = [
  'domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado',
];

// Janela ideal de compra: regra de bolso do mercado (não é ciência exata,
// mas é o consenso entre agências/blogs de viagem — CheapAir, Expedia ARC).
const DOMESTIC_WINDOW = { minDays: 30, maxDays: 60 };
const INTERNATIONAL_WINDOW = { minDays: 60, maxDays: 150 };

function daysBetween(fromISO, toISO) {
  const from = new Date(fromISO);
  const to = new Date(toISO);
  return Math.round((to - from) / (1000 * 60 * 60 * 24));
}

function isDomestic(origin, destination) {
  const o = getAirportByIata(origin);
  const d = getAirportByIata(destination);
  if (!o || !d) return null;
  return o.country === d.country;
}

// A regra genérica (janela fixa por tipo de rota) é o ponto de partida; o
// histórico real da própria rota — quando há amostras suficientes — refina
// a recomendação com "quando o preço realmente costumava estar mais baixo".
function buyingWindowAdvice(origin, destination, departDate) {
  const domestic = isDomestic(origin, destination);
  const window = domestic ? DOMESTIC_WINDOW : INTERNATIONAL_WINDOW;
  const routeType = domestic == null ? 'indefinida' : domestic ? 'doméstica' : 'internacional';

  const history = db.getHistoryForRoute(origin, destination);
  const priceEntries = history.filter((h) => h.priceBRL != null && h.checkedAt);

  let historicalInsight = null;
  if (priceEntries.length >= 5) {
    const checkedDates = priceEntries
      .map((e) => {
        const checkDate = new Date(e.checkedAt);
        const depart = new Date(e.departDate);
        return {
          daysBefore: Math.round((depart - checkDate) / (1000 * 60 * 60 * 24)),
          price: e.priceBRL,
        };
      })
      .filter((d) => d.daysBefore > 0 && d.daysBefore < 365);

    if (checkedDates.length >= 5) {
      const avgPrice = checkedDates.reduce((s, d) => s + d.price, 0) / checkedDates.length;
      const sorted = [...checkedDates].sort((a, b) => a.price - b.price);
      const cheapest30 = sorted.slice(0, Math.ceil(sorted.length * 0.3));
      const cheapAntecedence = cheapest30.reduce((s, d) => s + d.daysBefore, 0) / cheapest30.length;

      historicalInsight = {
        avgPrice: Math.round(avgPrice * 100) / 100,
        cheapest30Antecedence: Math.round(cheapAntecedence),
        sampleCount: checkedDates.length,
        cheapestPrice: sorted[0].price,
      };
    }
  }

  if (!departDate) {
    const message = historicalInsight
      ? `Para rotas ${routeType}s, a janela ideal é ${window.minDays}–${window.maxDays} dias antes. Na sua rota, os 30% melhores preços foram encontrados com ~${historicalInsight.cheapest30Antecedence} dias de antecedência (média de ${historicalInsight.sampleCount} observações).`
      : `Para rotas ${routeType}s, a janela ideal de compra costuma ser entre ${window.minDays} e ${window.maxDays} dias antes do embarque. Preencha a data de ida pra uma recomendação específica.`;
    return {
      routeType,
      idealMinDays: window.minDays,
      idealMaxDays: window.maxDays,
      status: 'no_date',
      message,
      historicalInsight,
    };
  }

  const daysUntil = daysBetween(new Date().toISOString(), departDate);

  if (daysUntil < 0) {
    return { routeType, idealMinDays: window.minDays, idealMaxDays: window.maxDays, status: 'past', message: 'Essa data já passou.', historicalInsight };
  }
  if (daysUntil <= 7) {
    let message = `Faltam só ${daysUntil} dia(s) — última hora costuma ser a fase mais cara (poucos assentos sobrando).`;
    if (historicalInsight && historicalInsight.avgPrice > 0) {
      message += ` Preço médio histórico: ${historicalInsight.avgPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.`;
    }
    message += ' Se o preço estiver dentro do seu orçamento, não vale esperar mais.';
    return { routeType, idealMinDays: window.minDays, idealMaxDays: window.maxDays, daysUntil, status: 'urgent', message, historicalInsight };
  }
  if (daysUntil < window.minDays) {
    let message = `Faltam ${daysUntil} dias — já passou da janela ideal (${window.minDays}–${window.maxDays} dias) pra rota ${routeType}.`;
    if (historicalInsight) {
      message += ` Dados históricos sugerem que o melhor momento foi ~${historicalInsight.cheapest30Antecedence} dias antes (média de ${historicalInsight.sampleCount} observações).`;
    }
    message += ' Tendência é o preço só subir a partir daqui; considere fechar logo se achar algo razoável.';
    return { routeType, idealMinDays: window.minDays, idealMaxDays: window.maxDays, daysUntil, status: 'late', message, historicalInsight };
  }
  if (daysUntil > window.maxDays) {
    let message = `Faltam ${daysUntil} dias — ainda é cedo pra rota ${routeType} (janela ideal: ${window.minDays}–${window.maxDays} dias antes).`;
    if (historicalInsight) {
      message += ` Preços tendem a cair conforme se aproxima de ~${historicalInsight.cheapest30Antecedence} dias antes.`;
    }
    message += ' Mas vale manter o alerta ligado: erro de tarifa e promoção relâmpago podem aparecer a qualquer momento.';
    return { routeType, idealMinDays: window.minDays, idealMaxDays: window.maxDays, daysUntil, status: 'early', message, historicalInsight };
  }
  let message = `Faltam ${daysUntil} dias — você está bem no meio da janela ideal de compra pra rota ${routeType} (${window.minDays}–${window.maxDays} dias antes).`;
  if (historicalInsight && historicalInsight.avgPrice > 0) {
    message += ` Preço médio histórico dessa rota: ${historicalInsight.avgPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.`;
  }
  message += ' Bom momento pra fechar se o preço estiver bom.';
  return {
    routeType,
    idealMinDays: window.minDays,
    idealMaxDays: window.maxDays,
    daysUntil,
    status: 'ideal',
    message,
    historicalInsight,
  };
}

// Sazonalidade: baseada no calendário de férias/feriados brasileiro (que
// encarece qualquer rota saindo do Brasil) somado ao hemisfério do destino
// (usa a latitude do aeroporto — já temos esse dado, sem precisar de tabela
// de países). É uma regra geral, não uma previsão exata pra cada destino.
function seasonalAdvice(origin, destination) {
  const originAirport = getAirportByIata(origin);
  const destAirport = getAirportByIata(destination);

  const highMonths = new Set([12, 1, 7]); // verão + festas e férias escolares no Brasil
  let note = 'Considera o calendário de férias/feriados do Brasil (verão, festas de fim de ano e julho).';

  if (destAirport && destAirport.lat >= 0 && destAirport.country !== 'Brazil') {
    [6, 7, 8, 12].forEach((m) => highMonths.add(m));
    note += ' O destino é no hemisfério norte, então o verão de lá (jun–ago) e o Natal/Ano Novo também pesam.';
  } else if (destAirport && destAirport.lat < 0) {
    note += ' O destino é no hemisfério sul, então a alta temporada de lá coincide com o verão brasileiro (dez–fev).';
  }

  const allMonths = Array.from({ length: 12 }, (_, i) => i + 1);
  const lowMonths = allMonths.filter((m) => !highMonths.has(m));

  return {
    highSeasonMonths: Array.from(highMonths).sort((a, b) => a - b).map((m) => MONTH_NAMES[m - 1]),
    lowSeasonMonths: lowMonths.map((m) => MONTH_NAMES[m - 1]),
    note: note + ' Também vale lembrar do Carnaval e da Semana Santa/Páscoa (datas variam a cada ano) como picos à parte.',
    originCountry: originAirport?.country || null,
    destinationCountry: destAirport?.country || null,
  };
}

// Estatística própria: agrupa o histórico da rota por mês de viagem e também
// por dia da semana (terças/quartas costumam ser mais baratas que sexta ou
// domingo). Enquanto não houver amostras suficientes, não inventa número.
function historicalMonthlyStats(origin, destination) {
  const MIN_SAMPLES_PER_MONTH = 3;
  const MIN_SAMPLES_PER_WEEKDAY = 3;
  const history = db.getHistoryForRoute(origin, destination);

  const byMonth = {};
  for (const entry of history) {
    if (!entry.departDate || entry.priceBRL == null) continue;
    const month = Number(entry.departDate.split('-')[1]);
    if (!byMonth[month]) byMonth[month] = [];
    byMonth[month].push(entry.priceBRL);
  }

  const stats = Object.entries(byMonth)
    .filter(([, prices]) => prices.length >= MIN_SAMPLES_PER_MONTH)
    .map(([month, prices]) => ({
      month: Number(month),
      monthName: MONTH_NAMES[Number(month) - 1],
      avgPriceBRL: prices.reduce((a, b) => a + b, 0) / prices.length,
      samples: prices.length,
    }))
    .sort((a, b) => a.avgPriceBRL - b.avgPriceBRL);

  const byWeekday = {};
  for (const entry of history) {
    if (!entry.departDate || entry.priceBRL == null) continue;
    const dow = new Date(entry.departDate + 'T12:00:00Z').getUTCDay();
    if (!byWeekday[dow]) byWeekday[dow] = [];
    byWeekday[dow].push(entry.priceBRL);
  }

  const weekdayStats = Object.entries(byWeekday)
    .filter(([, prices]) => prices.length >= MIN_SAMPLES_PER_WEEKDAY)
    .map(([dow, prices]) => ({
      weekday: Number(dow),
      weekdayName: WEEKDAY_NAMES[Number(dow)],
      avgPriceBRL: prices.reduce((a, b) => a + b, 0) / prices.length,
      samples: prices.length,
    }))
    .sort((a, b) => a.avgPriceBRL - b.avgPriceBRL);

  if (stats.length === 0 && weekdayStats.length === 0) {
    return {
      available: false,
      samplesNeeded: MIN_SAMPLES_PER_MONTH,
      message: 'Sem dados suficientes ainda. Continue buscando — depois de algumas semanas de monitoramento, teremos insights sobre os melhores meses e dias da semana pra voar nessa rota.',
    };
  }

  return {
    available: true,
    cheapestMonths: stats.slice(0, 3),
    cheapestWeekdays: weekdayStats.slice(0, 3),
    totalSamples: history.length,
  };
}

// Detecção de tendência recente: se as últimas checagens da rota mostram o
// preço subindo ou descendo, avisa o usuário — transforma histórico bruto
// em algo acionável ("preço em alta, considere fechar agora").
function recentPriceTrend(origin, destination, program) {
  const history = db.getHistoryForRoute(origin, destination);
  const relevant = history
    .filter((h) => h.program === program && h.priceBRL != null)
    .sort((a, b) => new Date(a.checkedAt) - new Date(b.checkedAt));

  if (relevant.length < 3) return null;

  const last5 = relevant.slice(-5);
  const prices = last5.map((h) => h.priceBRL);
  const firstPrice = prices[0];
  const lastPrice = prices[prices.length - 1];
  const change = lastPrice - firstPrice;
  const changePercent = firstPrice > 0 ? (change / firstPrice) * 100 : 0;

  let trend;
  if (changePercent > 5) trend = 'rising';
  else if (changePercent < -5) trend = 'falling';
  else trend = 'stable';

  return {
    trend,
    changeBRL: Math.round(change * 100) / 100,
    changePercent: Math.round(changePercent * 10) / 10,
    lastPrice,
    samples: last5.length,
    prices,
    message: trend === 'rising'
      ? `Preço em alta: subiu ${Math.abs(changePercent).toFixed(0)}% nas últimas ${last5.length} checagens. Considere fechar se encontrar algo bom.`
      : trend === 'falling'
        ? `Preço em queda: caiu ${Math.abs(changePercent).toFixed(0)}% nas últimas ${last5.length} checagens. Vale esperar mais um pouco, a menos que encontre um preço bom agora.`
        : `Preço estável: variação de ${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(0)}% nas últimas ${last5.length} checagens. Sem tendência clara de alta ou baixa.`,
  };
}

// Score numérico (0-100) só pra dar uma métrica visual de "quão forte" é o
// sinal — quem decide o veredito é a árvore de regras em buyingVerdict()
// (mais nuançada que uma soma de pesos: por exemplo, tendência de alta só
// vira "compre logo" quando já dentro da janela ideal, senão é só "ainda
// cedo"). Sinal econômico correto: tendência de ALTA empurra o score PRA
// CIMA (motivo pra não esperar, só tende a piorar) e tendência de QUEDA
// empurra PRA BAIXO (motivo real pra esperar mais um pouco).
function buyingScore(buyingWindow, trend) {
  let score = 50;
  if (buyingWindow.status === 'urgent') score += 30;
  else if (buyingWindow.status === 'late' || buyingWindow.status === 'ideal') score += 15;
  else if (buyingWindow.status === 'early') score -= 15;
  if (trend?.trend === 'rising') score += 15;
  else if (trend?.trend === 'falling') score -= 15;
  return Math.max(0, Math.min(100, score));
}

// Sintetiza janela de compra + tendência recente numa única recomendação
// acionável — o usuário não precisa cruzar os sinais na cabeça. É só um
// resumo do que já foi calculado acima; não introduz nenhum dado novo.
function buyingVerdict(buyingWindow, trend) {
  if (buyingWindow.status === 'no_date' || buyingWindow.status === 'past') return null;
  const score = buyingScore(buyingWindow, trend);

  if (buyingWindow.status === 'urgent') {
    return { action: 'buy_now', label: '🔴 Compre agora', message: 'Pouquíssimo tempo até o embarque — última hora tende a só piorar.', score };
  }
  if (trend && trend.trend === 'falling') {
    return { action: 'wait', label: '🟡 Vale esperar', message: 'Preço em queda nas últimas checagens — pode valer aguardar mais um pouco antes de fechar.', score };
  }
  if (trend && trend.trend === 'rising' && (buyingWindow.status === 'ideal' || buyingWindow.status === 'late')) {
    return { action: 'buy_now', label: '🟢 Boa hora de comprar', message: 'Dentro (ou perto do fim) da janela ideal e o preço está subindo — não vale mais esperar.', score };
  }
  if (buyingWindow.status === 'ideal' || buyingWindow.status === 'late') {
    return { action: 'buy_now', label: '🟢 Boa hora de comprar', message: 'Está dentro da janela ideal de compra pra essa rota.', score };
  }
  if (buyingWindow.status === 'early') {
    return { action: 'monitor', label: '🔵 Ainda cedo, monitore', message: 'Ainda é cedo pra essa rota — mantenha o alerta ligado e volte a checar mais perto da janela ideal.', score };
  }
  return { action: 'monitor', label: '🔵 Monitore', message: 'Sem sinal forte de alta ou baixa — continue acompanhando.', score };
}

function getBestTimeAdvice({ origin, destination, departDate, program }) {
  const buyingWindow = buyingWindowAdvice(origin, destination, departDate);
  const trend = program ? recentPriceTrend(origin, destination, program) : null;
  return {
    buyingWindow,
    seasonal: seasonalAdvice(origin, destination),
    historical: historicalMonthlyStats(origin, destination),
    trend,
    verdict: buyingVerdict(buyingWindow, trend),
  };
}

module.exports = { getBestTimeAdvice };
