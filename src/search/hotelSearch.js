const trivago = require('../providers/trivago');
const { geocodePlace } = require('../geocode');
const { cached } = require('../cache');
const { describeProviderError } = require('../providerError');

// Coordenada de hotel não muda — cache longo evita gastar cota da API à toa
// quando a mesma busca (ou busca parecida) é refeita.
const HOTEL_DETAILS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Só busca coordenada (chamada extra à API) pros primeiros N hotéis do
// resultado, não pra lista inteira — protege a cota compartilhada com as
// outras fontes que usam a mesma X-RapidAPI-Key.
const MAX_HOTELS_FOR_DISTANCE = 30;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function attachDistances(hotels, targetPoint) {
  const subset = hotels.slice(0, MAX_HOTELS_FOR_DISTANCE);
  await Promise.all(
    subset.map(async (hotel) => {
      try {
        const result = await cached(`trivago-hotel-details:${hotel.id}`, HOTEL_DETAILS_CACHE_TTL_MS, async () => {
          const data = await trivago.getHotelDetails(hotel.id);
          return { status: 'ok', data };
        });
        const coords = result?.data?.coordinates;
        if (coords && Number.isFinite(coords.latitude) && Number.isFinite(coords.longitude)) {
          hotel.distanceKm = haversineKm(targetPoint.lat, targetPoint.lon, coords.latitude, coords.longitude);
        }
      } catch {
        // sem coordenada pra esse hotel específico — só fica sem distância, não quebra a busca inteira
      }
    })
  );
}

function sortHotels(hotels, sortBy) {
  const copy = [...hotels];
  if (sortBy === 'price') return copy.sort((a, b) => (a.priceFrom ?? Infinity) - (b.priceFrom ?? Infinity));
  if (sortBy === 'rating') return copy.sort((a, b) => (b.ratingScore ?? -Infinity) - (a.ratingScore ?? -Infinity));
  if (sortBy === 'distance') return copy.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
  return copy; // relevância = mantém a ordem que a própria API devolveu
}

async function searchHotels({ destination, nearPlace, checkIn, checkOut, adults, rooms, sortBy }) {
  if (!trivago.enabled()) {
    return {
      status: 'not_configured',
      message: 'Defina a X-RapidAPI-Key (Configurações → seção 1) pra ativar a busca de hospedagem.',
      hotels: [],
    };
  }

  let suggestions;
  try {
    suggestions = await trivago.searchDestinations(destination);
  } catch (err) {
    return { status: 'error', message: `Falha ao buscar destino: ${describeProviderError(err)}`, hotels: [] };
  }
  if (suggestions.length === 0) {
    return { status: 'ok', message: 'Nenhum destino encontrado com esse nome — tente outro texto.', hotels: [] };
  }
  const destinationMatch = suggestions[0];

  let searchResult;
  try {
    searchResult = await trivago.searchHotels({ destinationId: destinationMatch.id, checkIn, checkOut, adults, rooms });
  } catch (err) {
    return { status: 'error', message: `Falha ao buscar hotéis: ${describeProviderError(err)}`, hotels: [] };
  }

  const hotels = (searchResult.hotels || []).map((h) => ({
    id: h.id,
    name: h.name,
    url: h.url,
    imageUrl: h.imageUrl,
    locationLabel: h.location?.label || null,
    stars: h.category?.stars ?? null,
    categoryLabel: h.category?.label || null,
    ratingScore: h.rating?.score ?? null,
    ratingLabel: h.rating?.label || null,
    reviewsCount: h.rating?.count ?? null,
    priceFrom: Number.isFinite(h.priceFrom) ? h.priceFrom : null,
    currency: h.currency || null,
    distanceKm: null,
  }));

  let targetPlaceName = null;
  if (nearPlace && nearPlace.trim()) {
    const targetPoint = await geocodePlace(nearPlace);
    if (targetPoint) {
      targetPlaceName = targetPoint.displayName;
      await attachDistances(hotels, targetPoint);
    }
  }

  return {
    status: 'ok',
    message: null,
    destination: {
      id: destinationMatch.id,
      name: destinationMatch.name,
      accommodationCount: destinationMatch.accommodationCount,
    },
    targetPlaceName,
    total: Number.isFinite(searchResult.total) ? searchResult.total : hotels.length,
    hotels: sortHotels(hotels, sortBy),
  };
}

module.exports = { searchHotels };
