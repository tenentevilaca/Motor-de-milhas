const amadeus = require('./amadeus');
const serpapi = require('./serpapi');
const aa = require('./aa');
const latampass = require('./latampass');
const smiles = require('./smiles');
const azul = require('./azul');

// Offer shape returned by every provider's search():
// {
//   program: 'AA' | 'LATAM' | 'SMILES' | 'AZUL' | 'CASH_AMADEUS' | 'CASH_SERPAPI',
//   priceBRL: number | null,       // cash price, when applicable
//   milesRequired: number | null,  // miles/points price, when applicable
//   taxesBRL: number | null,       // taxes/fees on top of miles redemption
//   stops: number,
//   isHiddenCity: boolean,
//   deepLink: string | null,
//   source: string,
// }

const ALL_PROVIDERS = { CASH_AMADEUS: amadeus, CASH_SERPAPI: serpapi, AA: aa, LATAM: latampass, SMILES: smiles, AZUL: azul };

// Provedores de preço em dinheiro que rodam para toda busca, independente
// dos programas de milhas escolhidos — são a fonte real de dados usada pelo
// detector de anomalia (src/search/anomaly.js) sem depender de scraping dos
// sites das companhias.
const CASH_PROVIDER_IDS = ['CASH_AMADEUS', 'CASH_SERPAPI'];

const MILE_PROGRAM_IDS = ['AA', 'LATAM', 'SMILES', 'AZUL'];

function getProvider(id) {
  return ALL_PROVIDERS[id];
}

function listProviderStatus() {
  return Object.values(ALL_PROVIDERS).map((p) => ({ id: p.id, label: p.label, enabled: p.enabled() }));
}

module.exports = { ALL_PROVIDERS, MILE_PROGRAM_IDS, CASH_PROVIDER_IDS, getProvider, listProviderStatus };
