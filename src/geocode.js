const axios = require('axios');

// Geocodificação de texto livre (ex: uma cidade sem aeroporto) usando o
// Nominatim (OpenStreetMap), que é gratuito para uso moderado desde que
// identifiquemos o app e respeitemos o limite de ~1 req/s.
// Política de uso: https://operations.osmfoundation.org/policies/nominatim/
const NOMINATIM_URL = process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'motor-de-milhas/1.0 (uso pessoal, contato via repositorio GitHub)';
const MIN_INTERVAL_MS = 1100;

const cache = new Map(); // query normalizada -> { result, expiresAt }
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

let lastRequestAt = 0;
let queue = Promise.resolve();

function throttledGet(params) {
  queue = queue.then(async () => {
    const wait = Math.max(0, MIN_INTERVAL_MS - (Date.now() - lastRequestAt));
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequestAt = Date.now();
    return axios.get(NOMINATIM_URL, {
      params,
      headers: { 'User-Agent': USER_AGENT },
      timeout: 8000,
    });
  });
  return queue;
}

async function geocodePlace(query) {
  const key = query.trim().toLowerCase();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.result;

  try {
    const { data } = await throttledGet({ q: query, format: 'json', limit: 1 });
    const result = data && data[0] ? { lat: Number(data[0].lat), lon: Number(data[0].lon), displayName: data[0].display_name } : null;
    cache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
  } catch {
    return null;
  }
}

module.exports = { geocodePlace };
