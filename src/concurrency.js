// Roda um worker sobre uma lista com no máximo `limit` execuções concorrentes
// — nem tudo de uma vez (risco de rajada contra a mesma API), nem uma de
// cada vez (lento sem necessidade). Um erro num item não cancela os outros:
// cada worker trata o próprio erro (ou deixa a Promise rejeitar e aparece
// no retorno na posição correspondente via Promise.allSettled-like uso).
async function mapWithConcurrencyLimit(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function runNext() {
    while (nextIndex < items.length) {
      const current = nextIndex++;
      results[current] = await worker(items[current], current);
    }
  }

  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, runNext));
  return results;
}

module.exports = { mapWithConcurrencyLimit };
