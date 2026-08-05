// Funções puras usadas pelas rotas /api/dashboard e /api/searches/:id/export —
// separadas do server.js pra dar pra testar sem precisar subir o Express.

function buildDashboardEntry(search, lastHistoryEntry) {
  return {
    id: search.id,
    origin: search.origin,
    destination: search.destination,
    departDate: search.departDate,
    returnDate: search.returnDate,
    programs: search.programs,
    allowStopover: search.allowStopover,
    allowHiddenCity: search.allowHiddenCity,
    lastPrice: lastHistoryEntry?.priceBRL ?? null,
    lastCheckedAt: lastHistoryEntry?.checkedAt || search.lastRunAt || null,
    isActive: search.active,
    targetPrice: search.targetPrice,
    isBelowTarget:
      search.targetPrice != null && lastHistoryEntry?.priceBRL != null && lastHistoryEntry.priceBRL <= search.targetPrice,
    isAnomaly: Boolean(lastHistoryEntry?.isAnomaly),
  };
}

// RFC 4180: campo só precisa de aspas se tiver vírgula, aspas ou quebra de
// linha — mas toLocaleString('pt-BR') do timestamp SEMPRE tem vírgula entre
// data e hora ("05/08/2026, 14:59:30"), então sem isso a primeira coluna
// "vazava" pra segunda em todo CSV exportado (visto e corrigido depois de
// testar a saída real).
function csvEscape(value) {
  const str = value == null ? '' : String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function historyToCsv(history) {
  const header = ['Data', 'Programa', 'Origem', 'Destino', 'Preço (R$)', 'Milhas', 'Paradas', 'Anomalia'];
  const rows = history.map((h) =>
    [
      new Date(h.checkedAt).toLocaleString('pt-BR'),
      h.program,
      h.origin,
      h.destination,
      h.priceBRL ?? '',
      h.milesRequired ?? '',
      h.stops ?? 0,
      h.isAnomaly ? 'Sim' : 'Não',
    ]
      .map(csvEscape)
      .join(',')
  );
  return [header.join(','), ...rows].join('\n');
}

module.exports = { buildDashboardEntry, csvEscape, historyToCsv };
