require('dotenv').config();
const path = require('path');
const express = require('express');
const db = require('./db');
const { runSearch } = require('./search/runSearch');
const { listProviderStatus } = require('./providers');
const { searchAirports } = require('./airports');
const scheduler = require('./scheduler');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const MILE_PROGRAMS = ['AA', 'LATAM', 'SMILES', 'AZUL'];

app.get('/api/airports', (req, res) => {
  const q = String(req.query.q || '');
  if (q.trim().length < 2) return res.json([]);
  res.json(searchAirports(q));
});

app.get('/api/providers', (req, res) => {
  res.json(listProviderStatus());
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
    const result = await runSearch(search);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/searches/:id/history', (req, res) => {
  const search = db.getSearch(req.params.id);
  if (!search) return res.status(404).json({ error: 'busca não encontrada' });
  res.json(db.getHistoryForSearch(req.params.id));
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
