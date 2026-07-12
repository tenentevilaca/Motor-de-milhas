const amadeus = require('./amadeus');
const aa = require('./aa');
const latampass = require('./latampass');
const smiles = require('./smiles');
const azul = require('./azul');

// Offer shape returned by every provider's search():
// {
//   program: 'AA' | 'LATAM' | 'SMILES' | 'AZUL' | 'CASH_AMADEUS',
//   priceBRL: number | null,       // cash price, when applicable
//   milesRequired: number | null,  // miles/points price, when applicable
//   taxesBRL: number | null,       // taxes/fees on top of miles redemption
//   stops: number,
//   isHiddenCity: boolean,
//   deepLink: string | null,
//   source: string,
// }

const ALL_PROVIDERS = { CASH_AMADEUS: amadeus, AA: aa, LATAM: latampass, SMILES: smiles, AZUL: azul };

const MILE_PROGRAM_IDS = ['AA', 'LATAM', 'SMILES', 'AZUL'];

function getProvider(id) {
  return ALL_PROVIDERS[id];
}

function listProviderStatus() {
  return Object.values(ALL_PROVIDERS).map((p) => ({ id: p.id, label: p.label, enabled: p.enabled() }));
}

module.exports = { ALL_PROVIDERS, MILE_PROGRAM_IDS, getProvider, listProviderStatus };
