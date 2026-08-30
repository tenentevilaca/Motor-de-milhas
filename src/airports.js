const airports = require('./data/airports.json');
const countryAliases = require('./data/countryAliases');
const cityAliases = require('./data/cityAliases');
const { REGIONS, getRegionForCountry, listRegions } = require('./data/continents');

// Base de ~6000 aeroportos (OpenFlights, ODbL) para permitir buscar por
// cidade ou país e não só por código IATA — nem todo mundo sabe de cor que
// "Nova York" é JFK/LGA/EWR.
//
// OpenFlights não é atualizado há anos — aeroportos abertos recentemente não
// existem na base (achado real: Jericoacoara/JJD, inaugurado em 2019,
// faltando por completo — usuário reportou não conseguir selecionar como
// origem/destino). Corrigido adicionando manualmente ao final de
// data/airports.json (não veio do OpenFlights, dado verificado à parte). Se
// aparecer outro aeroporto faltando, é o mesmo tipo de lacuna — adicionar do
// mesmo jeito, um por vez, e não assumir sem verificar as coordenadas.

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
  // Achado real: busca "Indonésia inteira" não trouxe nenhuma oferta —
  // sem hub curado, o fallback (ver getHubAirportsForCountry) pegava o
  // primeiro aeroporto na ordem bruta do arquivo (Ujung Pandang, não
  // Jacarta), rota obscura sem cobertura em nenhuma fonte de preço/milhas.
  // Aproveitando pra cobrir outras lacunas óbvias do mesmo tipo (capitais
  // de países populosos, sem hub curado nenhum antes disso).
  'CGK', 'SGN', 'MNL', 'KUL', 'LOS', 'NBO', 'WAW', 'ADD',
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

// Busca por país inteiro (ex: "frança" -> France) — pra selecionar/excluir
// um país inteiro de uma vez, não só um aeroporto específico dentro dele.
// Achado real: digitar um país no campo "Menos..." só sugeria aeroportos
// individuais daquele país, sem opção de excluir o país inteiro — usuário
// tinha que adivinhar/saber qual aeroporto específico é o "representante"
// do país numa busca por região, o que não é óbvio de fora.
const countryToPtAliases = {};
for (const [alias, country] of Object.entries(countryAliases)) {
  (countryToPtAliases[country] ||= []).push(normalize(alias));
}
const uniqueCountries = [...new Set(airports.map((a) => a.country))].map((country) => ({
  country,
  _country: normalize(country),
  _aliases: countryToPtAliases[country] || [],
}));

function searchCountries(query, limit = 6) {
  const q = normalize(query);
  if (!q || q.length < 3) return [];
  return uniqueCountries
    .filter((c) => c._country.includes(q) || c._aliases.some((al) => al.includes(q) || q.includes(al)))
    .slice(0, limit)
    .map((c) => ({
      code: c.country,
      label: c.country,
      value: `COUNTRY:${c.country}`,
      isRegion: true,
      label_full: `${c.country} (país inteiro)`,
    }));
}

// Comparação por versão normalizada (não o texto cru após "COUNTRY:") de
// propósito: db.createSearch() deixa origin/destination/excludeDestination
// em MAIÚSCULO (mesmo tratamento dado a "GRU"/"REGION:SA") — um valor tipo
// "COUNTRY:France" viraria "COUNTRY:FRANCE", que nunca bateria com o nome
// exato ("France", maiúscula só na inicial) salvo na base se a comparação
// fosse case-sensitive. countryFromValue devolve o nome CANÔNICO (com a
// grafia certa da base), não o texto recebido, pra quem usar o resultado
// (ex: getHubAirportsForCountry) sempre comparar certo.
function isCountryValue(value) {
  const v = String(value || '');
  if (!v.startsWith('COUNTRY:')) return false;
  const q = normalize(v.slice('COUNTRY:'.length));
  return uniqueCountries.some((c) => c._country === q);
}

function countryFromValue(value) {
  const v = String(value || '');
  if (!v.startsWith('COUNTRY:')) return null;
  const q = normalize(v.slice('COUNTRY:'.length));
  return uniqueCountries.find((c) => c._country === q)?.country || null;
}

// Igual getHubAirportsForRegion, mas filtrando por país exato — mesmo teto
// de custo (limit). Países sem nenhum hub curado em MAJOR_HUBS caem pro
// maior aeroporto real do país (senão "destino = esse país" nunca acharia
// nada pra países pequenos).
function getHubAirportsForCountry(country, limit = 8) {
  const hubs = [];
  for (const iata of MAJOR_HUBS) {
    const a = byIata.get(iata);
    if (!a || a.country !== country) continue;
    hubs.push({ iata: a.iata, name: a.name, city: a.city, country: a.country });
    if (hubs.length >= limit) break;
  }
  if (hubs.length === 0) {
    // Achado real (Indonésia): `airports.find` pega o 1º da ordem BRUTA do
    // arquivo, que não tem relação nenhuma com qual aeroporto é o principal
    // do país — pra Indonésia isso pegava uma cidade regional (Ujung
    // Pandang) em vez de Jacarta. Sem dado de porte/tráfego na base
    // (OpenFlights não tem isso), "o nome contém 'International'" é uma
    // aproximação melhor que a ordem do arquivo — não é perfeito (alguns
    // países têm mais de um aeroporto "International"), mas evita cair
    // direto num aeroportinho regional. Todo país onde isso ainda escolher
    // errado deveria ganhar uma entrada própria em MAJOR_HUBS, igual foi
    // feito pra Indonésia/Vietnã/Filipinas/etc. acima.
    const inCountry = airports.filter((a) => a.country === country);
    const best = inCountry.find((a) => /international/i.test(a.name)) || inCountry[0];
    if (best) hubs.push({ iata: best.iata, name: best.name, city: best.city, country: best.country });
  }
  return hubs;
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
  // 'WO' ("Mundo todo") é um pseudo-continente — não está no mapa
  // país->região (de propósito, ver comentário em continents.js), então
  // aceita hub de QUALQUER país em vez de filtrar por continente.
  const isWorld = regionCode === 'WO';
  const seenCountries = new Set();
  const hubs = [];
  for (const iata of MAJOR_HUBS) {
    const a = byIata.get(iata);
    if (!a || (!isWorld && getRegionForCountry(a.country) !== regionCode) || seenCountries.has(a.country)) continue;
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
  searchCountries,
  isCountryValue,
  countryFromValue,
  getHubAirportsForCountry,
};
