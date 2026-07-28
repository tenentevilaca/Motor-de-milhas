const travelpayouts = require('./travelpayouts');
const rapidapiGoogleFlights = require('./rapidapiGoogleFlights');
const aa = require('./aa');
const latampass = require('./latampass');
const smiles = require('./smiles');
const azul = require('./azul');

// Offer shape returned by every provider's search():
// {
//   program: 'AA' | 'LATAM' | 'SMILES' | 'AZUL' | 'CASH_TRAVELPAYOUTS' | 'CASH_RAPIDAPI_GFLIGHTS',
//   priceBRL: number | null,       // cash price, when applicable
//   milesRequired: number | null,  // miles/points price, when applicable
//   taxesBRL: number | null,       // taxes/fees on top of miles redemption
//   stops: number,
//   isHiddenCity: boolean,
//   deepLink: string | null,   // link pra ver/comprar a oferta, quando a fonte fornecer um
//   flightNumber: string | null,
//   departureTime: string | null,  // ex: "18:25" — hora local de partida
//   arrivalTime: string | null,
//   source: string,
// }

// Nota: Amadeus for Developers, SerpApi e Kiwi.com Tequila foram removidos —
// nenhum funcionou no uso real do usuário (Amadeus: portal descontinuado;
// SerpApi: cadastro travou na verificação de telefone por SMS; Kiwi: travou
// na verificação de e-mail). Travelpayouts e a Google Flights Live API
// (RapidAPI) são as fontes de preço em dinheiro mantidas.
const ALL_PROVIDERS = {
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
const CASH_PROVIDER_IDS = ['CASH_TRAVELPAYOUTS', 'CASH_RAPIDAPI_GFLIGHTS'];

const MILE_PROGRAM_IDS = ['AA', 'LATAM', 'SMILES', 'AZUL'];

function getProvider(id) {
  return ALL_PROVIDERS[id];
}

function listProviderStatus() {
  return Object.values(ALL_PROVIDERS).map((p) => ({ id: p.id, label: p.label, enabled: p.enabled() }));
}

module.exports = { ALL_PROVIDERS, MILE_PROGRAM_IDS, CASH_PROVIDER_IDS, getProvider, listProviderStatus };
