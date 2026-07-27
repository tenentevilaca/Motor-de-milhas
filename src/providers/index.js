const serpapi = require('./serpapi');
const kiwi = require('./kiwi');
const travelpayouts = require('./travelpayouts');
const rapidapiGoogleFlights = require('./rapidapiGoogleFlights');
const aa = require('./aa');
const latampass = require('./latampass');
const smiles = require('./smiles');
const azul = require('./azul');

// Offer shape returned by every provider's search():
// {
//   program: 'AA' | 'LATAM' | 'SMILES' | 'AZUL' | 'CASH_SERPAPI' | 'CASH_KIWI' | 'CASH_TRAVELPAYOUTS' | 'CASH_RAPIDAPI_GFLIGHTS',
//   priceBRL: number | null,       // cash price, when applicable
//   milesRequired: number | null,  // miles/points price, when applicable
//   taxesBRL: number | null,       // taxes/fees on top of miles redemption
//   stops: number,
//   isHiddenCity: boolean,
//   deepLink: string | null,
//   source: string,
// }

// Nota: Amadeus for Developers foi removido — o portal self-service deles
// não funcionou no uso real (e será desativado em 17/07/2026 de qualquer
// forma). SerpApi, Kiwi.com e Travelpayouts cobrem o mesmo papel.
const ALL_PROVIDERS = {
  CASH_SERPAPI: serpapi,
  CASH_KIWI: kiwi,
  CASH_TRAVELPAYOUTS: travelpayouts,
  CASH_RAPIDAPI_GFLIGHTS: rapidapiGoogleFlights,
  AA: aa,
  LATAM: latampass,
  SMILES: smiles,
  AZUL: azul,
};

// Provedores de preço em dinheiro que rodam para toda busca, independente
// dos programas de milhas escolhidos — são a fonte real de dados usada pelo
// detector de anomalia (src/search/anomaly.js) sem depender de scraping dos
// sites das companhias.
const CASH_PROVIDER_IDS = ['CASH_SERPAPI', 'CASH_KIWI', 'CASH_TRAVELPAYOUTS', 'CASH_RAPIDAPI_GFLIGHTS'];

const MILE_PROGRAM_IDS = ['AA', 'LATAM', 'SMILES', 'AZUL'];

function getProvider(id) {
  return ALL_PROVIDERS[id];
}

function listProviderStatus() {
  return Object.values(ALL_PROVIDERS).map((p) => ({ id: p.id, label: p.label, enabled: p.enabled() }));
}

module.exports = { ALL_PROVIDERS, MILE_PROGRAM_IDS, CASH_PROVIDER_IDS, getProvider, listProviderStatus };
