const axios = require('axios');
const config = require('../config');

// Trivago API (RapidAPI, por elis-lab-2): testado com dado real — busca de
// hotéis com preço/nota/estrelas, e detalhe de hotel com coordenada (usada
// pro filtro de proximidade). Usa a mesma X-RapidAPI-Key do Google Flights
// Live API / Award Flight & Miles Search API — sem chave nova.
const BASE_URL = 'https://trivago-api1.p.rapidapi.com/api/v1';
const RAPIDAPI_HOST = 'trivago-api1.p.rapidapi.com';

function enabled() {
  return Boolean(config.get('RAPIDAPI_KEY'));
}

function headers() {
  return {
    'x-rapidapi-host': RAPIDAPI_HOST,
    'x-rapidapi-key': config.get('RAPIDAPI_KEY'),
  };
}

async function searchDestinations(query) {
  const { data } = await axios.get(`${BASE_URL}/destination-search`, {
    params: { query },
    headers: headers(),
    timeout: 15000,
  });
  return Array.isArray(data?.suggestions) ? data.suggestions : [];
}

async function searchHotels({ destinationId, checkIn, checkOut, adults, rooms, offset }) {
  const { data } = await axios.get(`${BASE_URL}/search`, {
    params: {
      destinationId,
      checkIn,
      checkOut,
      adults: adults || 2,
      rooms: rooms || 1,
      offset: offset || 0,
    },
    headers: headers(),
    timeout: 20000,
  });
  return data || { hotels: [], total: 0 };
}

async function getHotelDetails(hotelId) {
  const { data } = await axios.get(`${BASE_URL}/hotel-details`, {
    params: { hotelId },
    headers: headers(),
    timeout: 15000,
  });
  return data;
}

module.exports = {
  id: 'TRIVAGO',
  label: 'Trivago (hospedagem)',
  enabled,
  searchDestinations,
  searchHotels,
  getHotelDetails,
};
