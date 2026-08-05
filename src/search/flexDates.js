// "Flexibilidade (± dias)": gera as datas em torno de baseDate (baseDate,
// baseDate-1, baseDate+1, baseDate-2, baseDate+2, ...) — usa componentes de
// data (ano/mês/dia) em vez de aritmética de milissegundos pra não escorregar
// de dia por causa de fuso horário. Compartilhado entre runSearch.js e
// splitTicketCompare.js pra manter a mesma janela de datas nos dois lugares.
function generateFlexDates(baseDate, flexDays) {
  if (!baseDate || flexDays <= 0) return [baseDate];
  const [year, month, day] = baseDate.split('-').map(Number);
  const dates = [baseDate];
  for (let i = 1; i <= flexDays; i++) {
    for (const sign of [1, -1]) {
      const d = new Date(Date.UTC(year, month - 1, day + i * sign));
      dates.push(d.toISOString().slice(0, 10));
    }
  }
  return dates;
}

module.exports = { generateFlexDates };
