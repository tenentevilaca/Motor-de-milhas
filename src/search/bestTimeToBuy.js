const { getAirportByIata } = require('../airports');
const db = require('../db');

const MONTH_NAMES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
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

function buyingWindowAdvice(origin, destination, departDate) {
  const domestic = isDomestic(origin, destination);
  const window = domestic ? DOMESTIC_WINDOW : INTERNATIONAL_WINDOW;
  const routeType = domestic == null ? 'indefinida' : domestic ? 'doméstica' : 'internacional';

  if (!departDate) {
    return {
      routeType,
      idealMinDays: window.minDays,
      idealMaxDays: window.maxDays,
      status: 'no_date',
      message: `Para rotas ${routeType}s, a janela ideal de compra costuma ser entre ${window.minDays} e ${window.maxDays} dias antes do embarque. Preencha a data de ida pra uma recomendação específica.`,
    };
  }

  const daysUntil = daysBetween(new Date().toISOString(), departDate);

  if (daysUntil < 0) {
    return { routeType, idealMinDays: window.minDays, idealMaxDays: window.maxDays, status: 'past', message: 'Essa data já passou.' };
  }
  if (daysUntil <= 7) {
    return {
      routeType,
      idealMinDays: window.minDays,
      idealMaxDays: window.maxDays,
      daysUntil,
      status: 'urgent',
      message: `Faltam só ${daysUntil} dia(s) — última hora costuma ser a fase mais cara (poucos assentos sobrando). Se o preço estiver dentro do seu orçamento, não vale esperar mais.`,
    };
  }
  if (daysUntil < window.minDays) {
    return {
      routeType,
      idealMinDays: window.minDays,
      idealMaxDays: window.maxDays,
      daysUntil,
      status: 'late',
      message: `Faltam ${daysUntil} dias — já passou da janela ideal (${window.minDays}–${window.maxDays} dias) pra rota ${routeType}. Tendência é o preço só subir a partir daqui; considere fechar logo se achar algo razoável.`,
    };
  }
  if (daysUntil > window.maxDays) {
    return {
      routeType,
      idealMinDays: window.minDays,
      idealMaxDays: window.maxDays,
      daysUntil,
      status: 'early',
      message: `Faltam ${daysUntil} dias — ainda é cedo pra rota ${routeType} (janela ideal: ${window.minDays}–${window.maxDays} dias antes). Preços tendem a cair conforme se aproxima dessa janela, mas vale manter o alerta ligado: erro de tarifa e promoção relâmpago podem aparecer a qualquer momento.`,
    };
  }
  return {
    routeType,
    idealMinDays: window.minDays,
    idealMaxDays: window.maxDays,
    daysUntil,
    status: 'ideal',
    message: `Faltam ${daysUntil} dias — você está bem no meio da janela ideal de compra pra rota ${routeType} (${window.minDays}–${window.maxDays} dias antes). Bom momento pra fechar se o preço estiver bom.`,
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

// Estatística própria: uma vez que o motor acumular histórico suficiente
// pra essa rota, mostra em qual mês de viagem o preço médio observado foi
// mais baixo. Enquanto não houver dados, retorna null (sem inventar número).
function historicalMonthlyStats(origin, destination) {
  const MIN_SAMPLES_PER_MONTH = 3;
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

  if (stats.length === 0) return { available: false, samplesNeeded: MIN_SAMPLES_PER_MONTH };
  return { available: true, cheapestMonths: stats.slice(0, 3) };
}

function getBestTimeAdvice({ origin, destination, departDate }) {
  return {
    buyingWindow: buyingWindowAdvice(origin, destination, departDate),
    seasonal: seasonalAdvice(origin, destination),
    historical: historicalMonthlyStats(origin, destination),
  };
}

module.exports = { getBestTimeAdvice };
