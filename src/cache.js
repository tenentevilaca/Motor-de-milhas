// Cache simples em memória com TTL. Existe pra proteger a cota gratuita das
// APIs de preço (ex: SerpApi 100 buscas/mês): se a mesma rota+data for
// checada de novo dentro da janela (múltiplas buscas salvas pra mesma rota,
// cliques repetidos em "Rodar agora", etc.), reaproveita o resultado em vez
// de gastar mais uma chamada. Só guarda respostas com sucesso — erro e
// "não configurado" não ficam presos em cache.
const store = new Map();

async function cached(key, ttlMs, fetchFn) {
  const hit = store.get(key);
  if (hit && Date.now() - hit.time < ttlMs) return hit.value;

  const value = await fetchFn();
  if (value && value.status === 'ok') store.set(key, { value, time: Date.now() });
  return value;
}

module.exports = { cached };
