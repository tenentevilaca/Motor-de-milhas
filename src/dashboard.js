// Funções puras usadas pelas rotas /api/dashboard e /api/searches/:id/export —
// separadas do server.js pra dar pra testar sem precisar subir o Express.

// `previousHistoryEntry` é opcional — usado só pra calcular a variação % em
// relação à checagem anterior. Os dois vêm de db.getHistoryForSearch(id, 2),
// que devolve em ordem CRONOLÓGICA (mais antiga primeiro): a chamada
// precisa passar o ÚLTIMO elemento do array como lastHistoryEntry e o
// PENÚLTIMO como previousHistoryEntry — inverter isso faz a variação sair
// de trás pra frente (queda de preço aparecendo como alta e vice-versa).
function buildDashboardEntry(search, lastHistoryEntry, previousHistoryEntry) {
  const variationPercent =
    previousHistoryEntry?.priceBRL && lastHistoryEntry?.priceBRL
      ? ((lastHistoryEntry.priceBRL - previousHistoryEntry.priceBRL) / previousHistoryEntry.priceBRL) * 100
      : null;

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
    variationPercent,
    variationLabel: variationPercent != null ? `${variationPercent > 0 ? '+' : ''}${variationPercent.toFixed(1)}%` : null,
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
