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

module.exports = { describeProviderError };
