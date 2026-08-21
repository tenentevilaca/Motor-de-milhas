const config = require('../config');
const { createProgramProvider } = require('./programProvider');
const seatsAero = require('./seatsAero');

// AA/AAdvantage não tinha nenhuma fonte real (só o stub genérico de
// programProvider.js, sempre "not_configured"). Diferente de Azul (Apify) e
// Smiles (RapidAPI), aqui não havia alternativa testada — Seats.aero cobre
// "american" na lista pública de programas suportados, o que faz dele a
// fonte real pra esse programa específico (ver seatsAero.js pra ressalvas
// sobre o que foi/não foi confirmado contra a API ao vivo).
const fallback = createProgramProvider({
  id: 'AA',
  label: 'American Airlines (AAdvantage)',
  envPrefix: 'AA',
  homepageUrl: 'https://www.aa.com/booking/find-flights',
});

function enabled() {
  return seatsAero.enabled() || fallback.enabled();
}

async function search(params) {
  if (!config.get('SEATSAERO_API_KEY')) return fallback.search(params);

  try {
    const offers = await seatsAero.searchSeatsAero({
      ...params,
      programId: 'AA',
      sourceKey: 'american',
      label: 'American Airlines (AAdvantage)',
      deepLinkBuilder: ({ origin, destination, departDate }) =>
        `https://www.aa.com/booking/search?locale=pt_BR&origin=${origin}&destination=${destination}&departDate=${departDate}`,
    });
    return { status: 'ok', message: null, offers, manualCheckUrl: fallback.homepageUrl };
  } catch (err) {
    if (fallback.enabled()) return fallback.search(params);
    const body = err.response?.data;
    const bodyMsg = typeof body === 'string' ? body : body?.message || err.message;
    return {
      status: 'error',
      message: `Seats.aero (American AAdvantage): ${bodyMsg}`.slice(0, 300),
      offers: [],
      manualCheckUrl: fallback.homepageUrl,
    };
  }
}

module.exports = { id: 'AA', label: 'American Airlines (AAdvantage)', enabled, search, homepageUrl: fallback.homepageUrl };
