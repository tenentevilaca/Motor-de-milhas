const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const SEARCHES_FILE = path.join(DATA_DIR, 'searches.json');
const HISTORY_FILE = path.join(DATA_DIR, 'priceHistory.json');
const SEEN_DEALS_FILE = path.join(DATA_DIR, 'seenDeals.json');

function ensureDataFiles() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(SEARCHES_FILE)) fs.writeFileSync(SEARCHES_FILE, '[]');
  if (!fs.existsSync(HISTORY_FILE)) fs.writeFileSync(HISTORY_FILE, '[]');
  if (!fs.existsSync(SEEN_DEALS_FILE)) fs.writeFileSync(SEEN_DEALS_FILE, '[]');
}

function readJson(file) {
  ensureDataFiles();
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, data) {
  ensureDataFiles();
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ---- Saved searches ----

function listSearches() {
  return readJson(SEARCHES_FILE);
}

function getSearch(id) {
  return listSearches().find((s) => s.id === id) || null;
}

function createSearch(input) {
  const searches = listSearches();
  const now = new Date().toISOString();
  const search = {
    id: crypto.randomUUID(),
    origin: input.origin.toUpperCase(),
    destination: input.destination.toUpperCase(),
    // Só faz sentido junto de destino por região ("qualquer lugar, menos
    // X") — aceita aeroporto específico (ex: "GIG") ou outra região (ex:
    // "REGION:EU"), no mesmo formato do campo de destino.
    excludeDestination: input.excludeDestination ? String(input.excludeDestination).toUpperCase() : null,
    departDate: input.departDate || null,
    returnDate: input.returnDate || null,
    flexDays: Number(input.flexDays || 0),
    programs: input.programs || [], // subset of ['AA','LATAM','SMILES','AZUL']
    allowStopover: Boolean(input.allowStopover),
    compareSplitTickets: Boolean(input.compareSplitTickets),
    allowHiddenCity: Boolean(input.allowHiddenCity),
    hiddenCityRiskAcknowledged: Boolean(input.hiddenCityRiskAcknowledged),
    targetPrice: input.targetPrice != null ? Number(input.targetPrice) : null,
    passengers: Number(input.passengers) > 0 ? Number(input.passengers) : 1,
    email: input.email || null,
    whatsapp: input.whatsapp || null,
    telegramChatId: input.telegramChatId || null,
    active: true,
    createdAt: now,
    updatedAt: now,
    lastRunAt: null,
  };
  searches.push(search);
  writeJson(SEARCHES_FILE, searches);
  return search;
}

function updateSearch(id, patch) {
  const searches = listSearches();
  const idx = searches.findIndex((s) => s.id === id);
  if (idx === -1) return null;
  searches[idx] = { ...searches[idx], ...patch, updatedAt: new Date().toISOString() };
  writeJson(SEARCHES_FILE, searches);
  return searches[idx];
}

function deleteSearch(id) {
  const searches = listSearches();
  const next = searches.filter((s) => s.id !== id);
  writeJson(SEARCHES_FILE, next);
  return next.length !== searches.length;
}

// ---- Price history / results ----

function addHistoryEntries(entries) {
  const history = readJson(HISTORY_FILE);
  history.push(...entries);
  // keep last 5000 entries to avoid unbounded growth
  const trimmed = history.slice(-5000);
  writeJson(HISTORY_FILE, trimmed);
  return trimmed;
}

function getHistoryForSearch(searchId, limit = 200) {
  const history = readJson(HISTORY_FILE);
  return history.filter((h) => h.searchId === searchId).slice(-limit);
}

function getHistoryForRoute(origin, destination) {
  const history = readJson(HISTORY_FILE);
  return history.filter((h) => h.origin === origin && h.destination === destination);
}

function getRouteBaseline(origin, destination, program) {
  const history = readJson(HISTORY_FILE);
  const relevant = history.filter(
    (h) => h.origin === origin && h.destination === destination && h.program === program && h.priceBRL != null
  );
  if (relevant.length === 0) return null;
  const prices = relevant.map((h) => h.priceBRL);
  const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
  const sorted = [...prices].sort((a, b) => a - b);
  const min = sorted[0];
  return { avg, min, samples: prices.length };
}

// ---- Feed de promoções (posts já vistos, pra não alertar 2x o mesmo post) ----

function getSeenDealLinks() {
  return readJson(SEEN_DEALS_FILE);
}

function markDealLinksSeen(links) {
  if (links.length === 0) return;
  const seen = readJson(SEEN_DEALS_FILE);
  const merged = [...seen, ...links];
  // mantém só os últimos 1000 pra não crescer sem limite
  writeJson(SEEN_DEALS_FILE, merged.slice(-1000));
}

module.exports = {
  listSearches,
  getSearch,
  createSearch,
  updateSearch,
  deleteSearch,
  addHistoryEntries,
  getHistoryForSearch,
  getHistoryForRoute,
  getRouteBaseline,
  getSeenDealLinks,
  markDealLinksSeen,
};
