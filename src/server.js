require('dotenv').config();
const path = require('path');
const express = require('express');
const db = require('./db');
const { runSearch } = require('./search/runSearch');
const { listProviderStatus } = require('./providers');
const { searchAirports, nearestAirports, searchRegions, isRegionValue } = require('./airports');
const { geocodePlace } = require('./geocode');
const scheduler = require('./scheduler');
const email = require('./notify/email');
const { sendEmailAlert } = require('./notify/email');
const whatsapp = require('./notify/whatsapp');
const { sendWhatsAppAlert } = require('./notify/whatsapp');
const telegram = require('./notify/telegram');
const { sendTelegramAlert } = require('./notify/telegram');
const config = require('./config');
const { fetchAllPosts } = require('./dealFeeds');
const { checkDealFeedsForAllSearches, checkDealFeedsForSearch, findMatchesForAllActiveSearches } = require('./search/checkDealFeeds');
const { getBestTimeAdvice } = require('./search/bestTimeToBuy');
const { searchHotels } = require('./search/hotelSearch');
const { buildDashboardEntry, historyToCsv } = require('./dashboard');
const trivago = require('./providers/trivago');
const { scanMonth } = require('./search/monthScan');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const MILE_PROGRAMS = ['AA', 'LATAM', 'SMILES', 'AZUL'];

app.get('/api/airports', async (req, res) => {
  const q = String(req.query.q || '');
  if (q.trim().length < 2) return res.json({ airports: [], nearby: false });

  // Regiões/continentes (ex: "américa do sul") só fazem sentido como destino
  // — o front só manda allowRegions=1 pro campo de destino.
  const regions = req.query.allowRegions ? searchRegions(q) : [];

  const direct = searchAirports(q);
  if (direct.length > 0 || regions.length > 0) return res.json({ airports: [...regions, ...direct], nearby: false });

  // Nenhum aeroporto bate diretamente com a busca (ex: cidade pequena sem
  // aeroporto próprio) — tenta geocodificar o texto e sugerir os aeroportos
  // mais próximos daquele ponto.
  const place = await geocodePlace(q);
  if (!place) return res.json({ airports: [], nearby: false });

  const nearby = nearestAirports(place.lat, place.lon, 6);
  res.json({ airports: nearby, nearby: true, place: place.displayName });
});

app.get('/api/best-time', (req, res) => {
  const { origin, destination, departDate, program } = req.query;
  if (!origin || !destination) return res.status(400).json({ error: 'origin e destination são obrigatórios' });
  res.json(getBestTimeAdvice({
    origin: String(origin).toUpperCase(),
    destination: String(destination).toUpperCase(),
    departDate: departDate || null,
    program: program || null,
  }));
});

app.get('/api/month-scan', async (req, res) => {
  const { origin, destination, yearMonth, includeMiles } = req.query;
  if (!origin || !destination || !yearMonth) {
    return res.status(400).json({ error: 'origin, destination e yearMonth (AAAA-MM) são obrigatórios' });
  }
  if (!/^[A-Za-z]{3}$/.test(origin) || !/^[A-Za-z]{3}$/.test(destination)) {
    return res.status(400).json({ error: 'origin e destination devem ser códigos IATA de 3 letras (busca por mês não cobre destino em região)' });
  }
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
    return res.status(400).json({ error: 'yearMonth deve estar no formato AAAA-MM' });
  }
  try {
    const result = await scanMonth({
      origin: origin.toUpperCase(),
      destination: destination.toUpperCase(),
      yearMonth,
      includeMiles: includeMiles === 'true' || includeMiles === '1',
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/providers', (req, res) => {
  res.json({
    priceProviders: listProviderStatus(),
    notificationChannels: [
      { id: 'EMAIL', label: 'E-mail (SMTP)', enabled: email.enabled() },
      {
        id: 'WHATSAPP',
        label: whatsapp.callMeBotEnabled() ? 'WhatsApp (CallMeBot)' : 'WhatsApp (Twilio)',
        enabled: whatsapp.enabled(),
        note: whatsapp.twilioEnabled() && !whatsapp.callMeBotEnabled()
          ? 'Sandbox Twilio: o número de destino precisa enviar "join <código>" pelo WhatsApp para o número do Twilio antes de poder receber alertas.'
          : null,
      },
      { id: 'TELEGRAM', label: 'Telegram', enabled: telegram.enabled() },
    ],
  });
});

app.get('/api/notify/telegram/chats', async (req, res) => {
  try {
    res.json(await telegram.getRecentChats());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/notify/test', async (req, res) => {
  const { channel, to } = req.body || {};
  if (!to) return res.status(400).json({ error: 'Preencha o destino do teste.' });

  const testMessage = 'Teste do Motor de Milhas — se você recebeu isso, esse canal está configurado corretamente!';
  try {
    let result;
    if (channel === 'EMAIL') {
      result = await sendEmailAlert({ to, subject: '✈️ Teste — Motor de Milhas', html: `<p>${testMessage}</p>` });
    } else if (channel === 'WHATSAPP') {
      result = await sendWhatsAppAlert({ to, message: testMessage });
    } else if (channel === 'TELEGRAM') {
      result = await sendTelegramAlert({ chatId: to, message: testMessage });
    } else {
      return res.status(400).json({ error: 'channel inválido — use EMAIL, WHATSAPP ou TELEGRAM' });
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/scheduler/status', (req, res) => {
  res.json(scheduler.getStatus());
});

app.get('/api/settings', (req, res) => {
  res.json(config.statusForAllKeys());
});

app.post('/api/settings', (req, res) => {
  const { clearKeys, ...patch } = req.body || {};
  if (Array.isArray(clearKeys)) clearKeys.forEach((key) => config.clearKey(key));
  config.setMany(patch);
  res.json(config.statusForAllKeys());
});

app.get('/api/searches', (req, res) => {
  res.json(db.listSearches());
});

app.post('/api/searches', (req, res) => {
  const body = req.body || {};
  if (!body.origin || !body.destination) {
    return res.status(400).json({ error: 'origin e destination são obrigatórios' });
  }
  if (!body.departDate) {
    // Sem data, os providers de preço em dinheiro (Google Flights Live,
    // Travelpayouts) não têm o que consultar — já vimos isso quebrar com um
    // 422 (departure_date nulo) em vez de dar um erro claro pro usuário.
    return res.status(400).json({ error: 'departDate é obrigatório — escolha uma data de ida.' });
  }
  const destinationIsRegion = isRegionValue(body.destination);
  if (!/^[A-Za-z]{3}$/.test(body.origin)) {
    return res.status(400).json({ error: 'origin deve ser um código IATA de 3 letras — escolha um aeroporto na lista sugerida' });
  }
  if (!destinationIsRegion && !/^[A-Za-z]{3}$/.test(body.destination)) {
    return res.status(400).json({ error: 'destination deve ser um código IATA de 3 letras ou uma região — escolha uma opção na lista sugerida' });
  }
  if (!destinationIsRegion && body.origin.toUpperCase() === body.destination.toUpperCase()) {
    return res.status(400).json({ error: 'origem e destino não podem ser iguais' });
  }
  if (destinationIsRegion && body.compareSplitTickets) {
    return res.status(400).json({ error: 'Comparar quebra de bilhete exige um destino específico (não é possível com busca por região).' });
  }
  if (body.excludeDestination) {
    if (!destinationIsRegion) {
      return res.status(400).json({ error: '"Menos..." só faz sentido com destino por região (ex: "Mundo todo") — com destino específico não há o que excluir.' });
    }
    if (!isRegionValue(body.excludeDestination) && !/^[A-Za-z]{3}$/.test(body.excludeDestination)) {
      return res.status(400).json({ error: '"Menos..." deve ser um código IATA de 3 letras ou uma região — escolha uma opção na lista sugerida.' });
    }
  }
  const programs = (body.programs || []).filter((p) => MILE_PROGRAMS.includes(p));
  if (body.allowHiddenCity && !body.hiddenCityRiskAcknowledged) {
    return res.status(400).json({
      error: 'Para habilitar busca hidden-city/skiplagged é preciso confirmar a ciência dos riscos (hiddenCityRiskAcknowledged).',
    });
  }
  if (body.compareSplitTickets && !body.returnDate) {
    return res.status(400).json({ error: 'Comparar quebra de bilhete exige data de volta preenchida.' });
  }
  if (body.returnDate && body.returnDate <= body.departDate) {
    return res.status(400).json({ error: 'A data de volta precisa ser posterior à data de ida.' });
  }
  const search = db.createSearch({ ...body, programs });
  res.status(201).json(search);
});

app.patch('/api/searches/:id', (req, res) => {
  const updated = db.updateSearch(req.params.id, req.body || {});
  if (!updated) return res.status(404).json({ error: 'busca não encontrada' });
  res.json(updated);
});

app.delete('/api/searches/:id', (req, res) => {
  const ok = db.deleteSearch(req.params.id);
  if (!ok) return res.status(404).json({ error: 'busca não encontrada' });
  res.status(204).end();
});

app.post('/api/searches/:id/run', async (req, res) => {
  const search = db.getSearch(req.params.id);
  if (!search) return res.status(404).json({ error: 'busca não encontrada' });
  try {
    const [result, dealFeed] = await Promise.all([
      runSearch(search),
      checkDealFeedsForSearch(search).catch((err) => ({ matches: [], newMatchCount: 0, error: err.message })),
    ]);
    res.json({ ...result, dealFeedMatches: dealFeed.matches, dealFeedError: dealFeed.error || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/searches/:id/history', (req, res) => {
  const search = db.getSearch(req.params.id);
  if (!search) return res.status(404).json({ error: 'busca não encontrada' });
  res.json(db.getHistoryForSearch(req.params.id));
});

app.get('/api/searches/:id/export', (req, res) => {
  const search = db.getSearch(req.params.id);
  if (!search) return res.status(404).json({ error: 'busca não encontrada' });
  const history = db.getHistoryForSearch(req.params.id);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=historico-${search.origin}-${search.destination}.csv`);
  res.send(historyToCsv(history));
});

app.get('/api/dashboard', (req, res) => {
  // getHistoryForSearch devolve em ordem cronológica (mais antiga primeiro)
  // — com limit=2, o ÚLTIMO elemento é o mais recente. Não dá pra
  // desestruturar direto como [previous, last] porque com só 1 checagem
  // no histórico o array vem com 1 elemento só, e essa checagem única é a
  // MAIS RECENTE (não a "anterior") — usar índices relativos ao fim evita
  // esse caso trocar as duas.
  const dashboardData = db.listSearches().map((s) => {
    const recent = db.getHistoryForSearch(s.id, 2);
    const last = recent[recent.length - 1];
    const previous = recent.length > 1 ? recent[recent.length - 2] : undefined;
    return buildDashboardEntry(s, last, previous);
  });
  res.json(dashboardData);
});

app.get('/api/deal-feed/latest', async (req, res) => {
  try {
    const posts = await fetchAllPosts();
    const relatedLinks = new Set(findMatchesForAllActiveSearches(posts).map((p) => p.link));
    const sorted = posts
      .filter((p) => p.publishedAt)
      .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
      // Pedido real: em meses com muita promoção, 40 posts (somando os
      // blogs monitorados) cobria só uma janela curta antes de cortar
      // achados ainda relevantes. Subir esse número é praticamente de graça
      // — a busca RSS já trouxe tudo, isso só corta quantos itens voltam
      // pro front.
      .slice(0, 150)
      .map((p) => ({ ...p, related: relatedLinks.has(p.link) }));
    res.json({ posts: sorted, hasActiveSearches: db.listSearches().some((s) => s.active) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/deal-feed/check', async (req, res) => {
  try {
    const result = await checkDealFeedsForAllSearches();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/hotels/status', (req, res) => {
  res.json({ enabled: trivago.enabled() });
});

app.get('/api/hotels/destinations', async (req, res) => {
  const q = String(req.query.q || '');
  if (q.trim().length < 2) return res.json({ suggestions: [] });
  if (!trivago.enabled()) return res.json({ suggestions: [] });
  try {
    const suggestions = await trivago.searchDestinations(q);
    res.json({ suggestions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/hotels/search', async (req, res) => {
  const { destination, nearPlace, checkIn, checkOut, adults, rooms, sortBy } = req.body || {};
  if (!destination || !checkIn || !checkOut) {
    return res.status(400).json({ error: 'destination, checkIn e checkOut são obrigatórios' });
  }
  try {
    const result = await searchHotels({ destination, nearPlace, checkIn, checkOut, adults, rooms, sortBy });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/routes/comparison', (req, res) => {
  const { routes } = req.query; // JSON array de {origin, destination}
  try {
    const parsedRoutes = JSON.parse(routes);
    if (!Array.isArray(parsedRoutes)) throw new Error('Formato inválido');

    const comparisons = parsedRoutes.map((r) => {
      // db.getRouteBaseline(origin, destination, program) exige um
      // programa específico pra filtrar — chamar sem ele faria o filtro
      // `h.program === undefined` nunca bater com nenhum registro real
      // (todo histórico tem um programa definido), zerando o mínimo
      // histórico sempre. Comparação de ROTA (não de um programa
      // específico) usa o histórico bruto de todos os programas direto.
      const history = db.getHistoryForRoute(r.origin, r.destination).filter((h) => h.priceBRL != null);
      const last30Days = history.filter((h) => {
        const daysDiff = (Date.now() - new Date(h.checkedAt).getTime()) / (1000 * 60 * 60 * 24);
        return daysDiff <= 30;
      });
      const avg30d = last30Days.length > 0 ? last30Days.reduce((acc, curr) => acc + curr.priceBRL, 0) / last30Days.length : null;

      return {
        origin: r.origin,
        destination: r.destination,
        minPrice: history.length > 0 ? Math.min(...history.map((h) => h.priceBRL)) : null,
        avg30d: avg30d != null ? Math.round(avg30d * 100) / 100 : null,
        samples: history.length,
      };
    });
    res.json(comparisons);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Motor de Milhas rodando em http://localhost:${PORT}`);
  if (process.env.DISABLE_SCHEDULER !== 'true') {
    scheduler.start();
  } else {
    console.log('Agendador desabilitado (DISABLE_SCHEDULER=true)');
  }
});

module.exports = app;
