const axios = require('axios');
const config = require('../config');

// Amadeus for Developers - Self-Service Flight Offers Search API.
// Free test-environment API key: https://developers.amadeus.com
// This gives REAL cash-fare data (not miles), used as a baseline to compare
// against award pricing and to catch generally cheap fares / anomalies.

let cachedToken = null;
let cachedTokenExpiresAt = 0;

function baseUrl() {
  return config.get('AMADEUS_BASE_URL') || 'https://test.api.amadeus.com';
}

async function getToken() {
  if (cachedToken && Date.now() < cachedTokenExpiresAt) return cachedToken;
  const { data } = await axios.post(
    `${baseUrl()}/v1/security/oauth2/token`,
    new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: config.get('AMADEUS_CLIENT_ID'),
      client_secret: config.get('AMADEUS_CLIENT_SECRET'),
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  cachedToken = data.access_token;
  cachedTokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken;
}

function enabled() {
  return Boolean(config.get('AMADEUS_CLIENT_ID') && config.get('AMADEUS_CLIENT_SECRET'));
}

async function search({ origin, destination, departDate, returnDate, allowStopover }) {
  if (!enabled()) {
    return {
      status: 'not_configured',
      message: 'Defina AMADEUS_CLIENT_ID e AMADEUS_CLIENT_SECRET (gratuito em developers.amadeus.com) para ativar a comparação em dinheiro.',
      offers: [],
    };
  }

  const token = await getToken();
  const params = {
    originLocationCode: origin,
    destinationLocationCode: destination,
    departureDate: departDate,
    adults: 1,
    currencyCode: 'BRL',
    max: 15,
    nonStop: allowStopover ? undefined : true,
  };
  if (returnDate) params.returnDate = returnDate;

  const { data } = await axios.get(`${baseUrl()}/v2/shopping/flight-offers`, {
    headers: { Authorization: `Bearer ${token}` },
    params,
  });

  const offers = (data.data || []).map((offer) => ({
    program: 'CASH_AMADEUS',
    priceBRL: Number(offer.price.total),
    milesRequired: null,
    taxesBRL: null,
    stops: Math.max(
      ...offer.itineraries.map((it) => it.segments.length - 1)
    ),
    isHiddenCity: false,
    deepLink: null,
    source: 'Amadeus (dados reais)',
  }));

  return { status: 'ok', message: null, offers };
}

module.exports = { id: 'CASH_AMADEUS', label: 'Comparação em dinheiro (Amadeus)', enabled, search };
