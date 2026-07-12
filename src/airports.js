const airports = require('./data/airports.json');
const countryAliases = require('./data/countryAliases');
const cityAliases = require('./data/cityAliases');

// Base de ~6000 aeroportos (OpenFlights, ODbL) para permitir buscar por
// cidade ou país e não só por código IATA — nem todo mundo sabe de cor que
// "Nova York" é JFK/LGA/EWR.

function normalize(str) {
  return String(str)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

// Grandes hubs ganham um pequeno bônus de relevância, senão uma busca por
// país (ex: "Brasil") tende a listar aeroportinhos regionais em ordem
// alfabética antes de Guarulhos/Galeão/Congonhas.
const MAJOR_HUBS = new Set([
  'GRU', 'GIG', 'BSB', 'CGH', 'SDU', 'CNF', 'POA', 'CWB', 'REC', 'SSA', 'FOR', 'BEL', 'MAO', 'VCP', 'FLN', 'VIX',
  'JFK', 'LGA', 'EWR', 'LAX', 'ORD', 'MIA', 'MCO', 'DFW', 'ATL', 'SFO', 'IAH', 'BOS', 'IAD', 'SEA', 'LAS',
  'LHR', 'LGW', 'CDG', 'ORY', 'MAD', 'BCN', 'FCO', 'MXP', 'FRA', 'MUC', 'AMS', 'LIS', 'OPO', 'ZRH', 'VIE', 'DUB',
  'EZE', 'AEP', 'SCL', 'LIM', 'BOG', 'MEX', 'CUN', 'PTY', 'UIO', 'GYE', 'MVD', 'ASU',
  'DXB', 'DOH', 'IST', 'HND', 'NRT', 'ICN', 'PEK', 'PVG', 'HKG', 'SIN', 'BKK', 'DEL', 'BOM',
  'SYD', 'MEL', 'AKL', 'JNB', 'CPT', 'CAI',
]);

const normalizedAirports = airports.map((a) => ({
  ...a,
  _iata: normalize(a.iata),
  _name: normalize(a.name),
  _city: normalize(a.city),
  _country: normalize(a.country),
}));

function searchAirports(query, limit = 12) {
  const q = normalize(query);
  if (!q) return [];

  const aliasCountry = countryAliases[q] ? normalize(countryAliases[q]) : null;
  const aliasCity = cityAliases[q] ? normalize(cityAliases[q]) : null;

  const scored = [];
  for (const a of normalizedAirports) {
    let score = 0;
    if (a._iata === q) score = 100;
    else if (a._iata.startsWith(q)) score = 90;
    else if (a._city.startsWith(q) || (aliasCity && a._city === aliasCity)) score = 80;
    else if (a._name.startsWith(q)) score = 70;
    else if (a._country.startsWith(q) || (aliasCountry && a._country === aliasCountry)) score = 60;
    else if (a._city.includes(q) || (aliasCity && a._city.includes(aliasCity))) score = 50;
    else if (a._name.includes(q)) score = 40;
    else if (a._country.includes(q) || (aliasCountry && a._country.includes(aliasCountry))) score = 30;

    if (score > 0) scored.push({ a, score: score + (MAJOR_HUBS.has(a.iata) ? 5 : 0) });
  }

  scored.sort((x, y) => y.score - x.score || x.a.city.localeCompare(y.a.city));

  return scored.slice(0, limit).map(({ a }) => ({
    iata: a.iata,
    name: a.name,
    city: a.city,
    country: a.country,
    label: `${a.iata} — ${a.name}, ${a.city} (${a.country})`,
  }));
}

module.exports = { searchAirports };
