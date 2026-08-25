// Cache simples em memória com TTL. Existe pra proteger a cota gratuita das
// APIs de preço (ex: SerpApi 100 buscas/mês): se a mesma rota+data for
// checada de novo dentro da janela (múltiplas buscas salvas pra mesma rota,
// cliques repetidos em "Rodar agora", etc.), reaproveita o resultado em vez
// de gastar mais uma chamada. Só guarda respostas com sucesso — erro e
// "não configurado" não ficam presos em cache.
const store = new Map();

// Dedup de chamadas EM ANDAMENTO pra mesma chave — sem isso, duas buscas
// concorrentes pra mesma rota/data (ex: a rechecagem automática do front,
// que já dispara uma busca nova ~8s depois se alguma fonte ainda estiver
// "pending" — tempo insuficiente pra uma fonte lenta como o Google Flights
// via RapidAPI, que já levou 23-28s numa rota real, ter terminado e
// preenchido o cache) NÃO esperavam a primeira terminar: cada uma via
// "sem cache ainda" e disparava sua PRÓPRIA chamada real, multiplicando o
// número de chamadas pagas pra exatamente a mesma rota/data (achado real:
// 3 chamadas ao CASH_RAPIDAPI_GFLIGHTS pra CUR na mesma janela de poucos
// segundos). Guardar a Promise em andamento faz chamadas concorrentes
// pra mesma chave compartilharem o mesmo resultado em vez de bater na
// fonte de novo.
const inFlight = new Map();

async function cached(key, ttlMs, fetchFn) {
  const hit = store.get(key);
  if (hit && Date.now() - hit.time < ttlMs) return hit.value;

  const pending = inFlight.get(key);
  if (pending) return pending;

  const promise = (async () => {
    try {
      const value = await fetchFn();
      if (value && value.status === 'ok') store.set(key, { value, time: Date.now() });
      return value;
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, promise);
  return promise;
}

// Só pra teste automatizado: cada arquivo de teste roda no mesmo processo
// (node --test), então esse Map em memória sobrevive entre arquivos — sem
// isso, uma rota+data já cacheada por um teste anterior "vaza" pro próximo
// teste que reusa a mesma chave com um stub diferente.
function clearCache() {
  store.clear();
  inFlight.clear();
}

module.exports = { cached, clearCache };
