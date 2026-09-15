// axios só coloca "Request failed with status code 403" em err.message — o
// motivo de verdade (ex: "You are not subscribed to this API", chave
// inválida, cota estourada) vem no corpo da resposta, que por padrão a gente
// jogava fora. Isso mostra esse motivo real na tela em vez de só o código HTTP.
// Compartilhado entre runSearch.js e hotelSearch.js — mesmo tipo de erro
// (RapidAPI), mesmo tratamento.
function describeProviderError(err) {
  const body = err.response?.data;
  if (!body) return err.message;
  const bodyMsg = typeof body === 'string' ? body : body.message || JSON.stringify(body);
  return `HTTP ${err.response.status}: ${bodyMsg}`.slice(0, 300);
}

// Achado real: "zero ofertas" pode ser cota estourada, timeout, chave
// inválida, erro HTTP genérico ou fonte fora do ar — tudo parecia igual pro
// usuário ("não veio nada") e cada rodada de diagnóstico virava uma nova
// pergunta sem separar qual das causas era. describeProviderError já monta
// uma mensagem legível pro usuário, mas não CATEGORIZA a causa pro log —
// isso não dá pra inferir automaticamente sem ler o texto toda vez.
// Heurística por status HTTP + palavras-chave no corpo/mensagem (não é uma
// lista exaustiva de todo erro possível de toda API — é o que já foi visto
// de verdade nas integrações deste projeto: RapidAPI usa 401/403 pra chave
// inválida e 429 pra cota, texto "not subscribed"/"exceeded" no corpo;
// Seats.aero usa "bad_partner_token"; axios usa ECONNABORTED quando o
// `timeout` configurado estoura).
function categorizeProviderError(err) {
  const status = err.response?.status;
  const body = err.response?.data;
  const bodyText = (typeof body === 'string' ? body : JSON.stringify(body || '')).toLowerCase();
  const msgText = String(err.message || '').toLowerCase();
  const combined = `${bodyText} ${msgText}`;

  if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT' || combined.includes('timeout')) return 'timeout';
  // Checa cota ANTES do status genérico de auth: algumas APIs (visto na
  // RapidAPI) devolvem 403 tanto pra chave inválida quanto pra cota
  // estourada — só o texto do corpo diferencia os dois casos, então a
  // palavra-chave de cota tem prioridade sobre o status sozinho.
  if (status === 429 || /quota|rate limit|too many requests/.test(combined)) return 'quota';
  if (status === 401 || status === 403 || /unauthorized|invalid.{0,20}(key|token)|not subscribed|bad_partner_token/.test(combined)) {
    return 'auth';
  }
  if (Number.isFinite(status)) return 'http_error';
  if (['ECONNREFUSED', 'ENOTFOUND', 'ECONNRESET', 'EAI_AGAIN'].includes(err.code)) return 'network';
  return 'unknown';
}

const CATEGORY_LABELS = {
  auth: 'ERRO DE AUTENTICAÇÃO',
  quota: 'COTA EXCEDIDA',
  timeout: 'TIMEOUT',
  http_error: 'ERRO HTTP',
  network: 'ERRO DE REDE',
  unknown: 'ERRO DESCONHECIDO',
};

// Loga a causa categorizada ANTES da mensagem detalhada — dá pra grep nos
// logs do Render por "COTA EXCEDIDA" ou "ERRO DE AUTENTICAÇÃO" sem precisar
// ler o texto de cada linha pra saber qual é qual. Nunca loga headers/params
// da requisição (só err.message e err.response.data, que já é o que
// describeProviderError usa) — não expõe a chave de API, que fica só no
// header da requisição, nunca no erro devolvido pela API.
function logProviderError(tag, err) {
  const category = categorizeProviderError(err);
  console.error(`[${tag}] ${CATEGORY_LABELS[category]}: ${describeProviderError(err)}`);
  return category;
}

module.exports = { describeProviderError, categorizeProviderError, logProviderError };
