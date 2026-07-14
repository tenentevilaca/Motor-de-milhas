require('dotenv').config();
const path = require('path');
const express = require('express');
const db = require('./db');
const { runSearch } = require('./search/runSearch');
const { listProviderStatus } = require('./providers');
const { searchAirports, nearestAirports } = require('./airports');
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
const { checkDealFeedsForAllSearches, checkDealFeedsForSearch } = require('./search/checkDealFeeds');
const { getBestTimeAdvice } = require('./search/bestTimeToBuy');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const MILE_PROGRAMS = ['AA', 'LATAM', 'SMILES', 'AZUL'];

app.get('/api/airports', async (req, res) => {
  const q = String(req.query.q || '');
  if (q.trim().length < 2) return res.json({ airports: [], nearby: false });

  const direct = searchAirports(q);
  if (direct.length > 0) return res.json({ airports: direct, nearby: false });

  // Nenhum aeroporto bate diretamente com a busca (ex: cidade pequena sem
  // aeroporto próprio) — tenta geocodificar o texto e sugerir os aeroportos
  // mais próximos daquele ponto.
  const place = await geocodePlace(q);
  if (!place) return res.json({ airports: [], nearby: false });

  const nearby = nearestAirports(place.lat, place.lon, 6);
  res.json({ airports: nearby, nearby: true, place: place.displayName });
});

app.get('/api/best-time', (req, res) => {
  const { origin, destination, departDate } = req.query;
  if (!origin || !destination) return res.status(400).json({ error: 'origin e destination são obrigatórios' });
  res.json(getBestTimeAdvice({ origin: String(origin).toUpperCase(), destination: String(destination).toUpperCase(), departDate: departDate || null }));
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
  if (!/^[A-Za-z]{3}$/.test(body.origin) || !/^[A-Za-z]{3}$/.test(body.destination)) {
    return res.status(400).json({ error: 'origin e destination devem ser códigos IATA de 3 letras — escolha um aeroporto na lista sugerida' });
  }
  if (body.origin.toUpperCase() === body.destination.toUpperCase()) {
    return res.status(400).json({ error: 'origem e destino não podem ser iguais' });
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

app.get('/api/deal-feed/latest', async (req, res) => {
  try {
    const posts = await fetchAllPosts();
    const sorted = posts
      .filter((p) => p.publishedAt)
      .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
      .slice(0, 20);
    res.json(sorted);
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
