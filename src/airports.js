const airports = require('./data/airports.json');
const countryAliases = require('./data/countryAliases');
const cityAliases = require('./data/cityAliases');
const { REGIONS, getRegionForCountry, listRegions } = require('./data/continents');

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
    // Alias exato de cidade (ex: "bh" -> "Belo Horizonte") vem ANTES do
    // prefixo de IATA de propósito: uma query de 2-3 letras como "bh"/"sp"
    // também é, por coincidência, prefixo de dezenas de códigos IATA
    // aleatórios ao redor do mundo (BHV, BHI, SPB, SPP...) — sem essa
    // prioridade, esses acertos por acaso ficavam ACIMA do aeroporto que o
    // alias resolve de propósito, escondendo Belo Horizonte/São Paulo da
    // lista quando alguém digitava a abreviação que todo brasileiro usa
    // (bug real reportado: "bh" não sugeria nada de Belo Horizonte).
    else if (aliasCity && a._city === aliasCity) score = 95;
    else if (a._iata.startsWith(q)) score = 90;
    else if (a._city.startsWith(q)) score = 80;
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

// Distância aproximada em km entre duas coordenadas (fórmula de haversine),
// usada para sugerir os aeroportos mais próximos quando o local buscado não
// tem aeroporto próprio (ex: uma cidade pequena).
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function nearestAirports(lat, lon, limit = 6) {
  return normalizedAirports
    .map((a) => ({ a, distanceKm: haversineKm(lat, lon, a.lat, a.lon) }))
    .sort((x, y) => x.distanceKm - y.distanceKm)
    .slice(0, limit)
    .map(({ a, distanceKm }) => ({
      iata: a.iata,
      name: a.name,
      city: a.city,
      country: a.country,
      distanceKm: Math.round(distanceKm),
      label: `${a.iata} — ${a.name}, ${a.city} (${a.country}) · ~${Math.round(distanceKm)} km`,
    }));
}

const byIata = new Map(airports.map((a) => [a.iata, a]));

function getAirportByIata(iata) {
  return byIata.get(String(iata).toUpperCase()) || null;
}

// Busca por continente/região (ex: "américa do sul", "europa") pra permitir
// destino = "qualquer lugar dessa região" em vez de um aeroporto específico.
const normalizedRegions = listRegions().map((r) => ({ ...r, _label: normalize(r.label) }));

function searchRegions(query, limit = 6) {
  const q = normalize(query);
  if (!q || q.length < 3) return [];
  return normalizedRegions
    .filter((r) => r._label.includes(q) || q.includes(r._label))
    .slice(0, limit)
    .map((r) => ({
      code: r.code,
      label: r.label,
      value: `REGION:${r.code}`,
      isRegion: true,
      label_full: `${r.label} (qualquer destino na região)`,
    }));
}

function isRegionValue(value) {
  const m = /^REGION:([A-Z]{2})$/.exec(String(value || '').toUpperCase());
  return Boolean(m && REGIONS[m[1]]);
}

function regionCodeFromValue(value) {
  const m = /^REGION:([A-Z]{2})$/.exec(String(value || '').toUpperCase());
  return m && REGIONS[m[1]] ? m[1] : null;
}

// Retorna uma lista enxuta de aeroportos-hub representativos da região, pra
// manter o custo de chamadas às APIs de preço sob controle — em vez de
// consultar todos os ~6000 aeroportos, olha só os grandes hubs (MAJOR_HUBS)
// que ficam naquele continente. Limita a 1 hub por país (na ordem em que
// MAJOR_HUBS já lista os mais relevantes) pra não desperdiçar o limite todo
// em várias cidades do mesmo país (ex: só aeroportos do Brasil) e de fato
// cobrir a região inteira.
function getHubAirportsForRegion(regionCode, limit = 8) {
  if (!REGIONS[regionCode]) return [];
  const seenCountries = new Set();
  const hubs = [];
  for (const iata of MAJOR_HUBS) {
    const a = byIata.get(iata);
    if (!a || getRegionForCountry(a.country) !== regionCode || seenCountries.has(a.country)) continue;
    seenCountries.add(a.country);
    hubs.push({ iata: a.iata, name: a.name, city: a.city, country: a.country });
    if (hubs.length >= limit) break;
  }
  return hubs;
}

module.exports = {
  searchAirports,
  nearestAirports,
  getAirportByIata,
  searchRegions,
  isRegionValue,
  regionCodeFromValue,
  getHubAirportsForRegion,
  listRegions,
};
