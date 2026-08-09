const axios = require('axios');
const config = require('../config');

// Google Flights Live API (via RapidAPI): mais uma fonte de preço real e ao
// vivo (diferente do Travelpayouts, que é cache de preços já vistos — esse
// aqui faz a busca na hora, igual o SerpApi). Cadastro em rapidapi.com é só
// e-mail/GitHub, sem telefone — mas é um serviço pago por uso (a maioria tem
// uma cota grátis mensal limitada antes de cobrar).
const BASE_URL = 'https://google-flights-live-api.p.rapidapi.com/api/google_flights';
const RAPIDAPI_HOST = 'google-flights-live-api.p.rapidapi.com';

function enabled() {
  return Boolean(config.get('RAPIDAPI_KEY'));
}

// Essa API só devolve preço em dólar — não tem parâmetro de moeda. Sem uma
// fonte de câmbio ao vivo configurada, converte por uma taxa aproximada e
// configurável (o câmbio muda com o tempo; ajuste USD_TO_BRL_RATE conforme
// necessário) só pra dar pra comparar com as outras fontes, que já são reais.
function usdToBrl(usd) {
  const rate = Number(config.get('USD_TO_BRL_RATE')) || 5.5;
  return usd * rate;
}

// A resposta pode vir como array na raiz (o formato assumido originalmente,
// nunca confirmado contra a API real) ou embrulhada num objeto — comum em
// APIs de viagem no RapidAPI (`{ data: [...] }`, `{ flights: [...] }` etc).
// Sem aceitar essas variações, uma resposta embrulhada faria offers virar
// [] silenciosamente — nenhum erro, nenhum "pending", só "sem oferta
// nenhuma" pro usuário, mesmo com voos reais existindo (a chave paga
// funcionando, só o parsing assumindo o formato errado). Se nenhum formato
// bater, loga as chaves recebidas pra dar pra diagnosticar sem precisar de
// acesso à conta RapidAPI de quem está rodando isso.
function extractOffersArray(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    for (const key of ['data', 'flights', 'results', 'itineraries', 'best_flights', 'other_flights', 'offers']) {
      if (Array.isArray(data[key])) return data[key];
    }
  }
  return null;
}

async function search({ origin, destination, departDate, returnDate, allowStopover }) {
  if (!enabled()) {
    return {
      status: 'not_configured',
      message: 'Defina RAPIDAPI_KEY (cadastro em rapidapi.com, sem telefone — mas é serviço pago por uso) para ativar mais essa fonte de preço real e ao vivo.',
      offers: [],
    };
  }

  const endpoint = returnDate ? 'roundtrip/v1' : 'oneway/v1';
  const body = { departure_date: departDate, from_airport: origin, to_airport: destination };
  if (returnDate) body.return_date = returnDate;

  const { data } = await axios.post(`${BASE_URL}/${endpoint}`, body, {
    headers: {
      'Content-Type': 'application/json',
      'x-rapidapi-host': RAPIDAPI_HOST,
      'x-rapidapi-key': config.get('RAPIDAPI_KEY'),
    },
    // 28s: essa API (mesmo em plano pago) pode legitimamente demorar mais
    // que outras fontes — não é sempre cota estourada. Mas não dá pra subir
    // à vontade: o Render tem seu PRÓPRIO timeout no proxy entre o navegador
    // e o nosso servidor (não documentado oficialmente, relatos da
    // comunidade apontam ~15-30s) — se o total pra responder ao cliente
    // passar disso, o proxy derruba a conexão do navegador ANTES da nossa
    // resposta chegar, recriando o "NetworkError" genérico (dessa vez sem
    // nem a mensagem de erro clara, porque a resposta nunca chega a tempo).
    // 28s fica dentro da faixa mais comumente reportada como segura (~30s)
    // com uma margem pequena.
    timeout: 28000,
  });

  // `allowStopover` é sobre a técnica de stopover GRATUITO de programas de
  // milhas (parada estendida de propósito, ex: TAP em Lisboa) — não tem
  // nada a ver com uma conexão comum numa passagem em dinheiro. Filtrar
  // qualquer oferta com `stops > 0` a não ser que essa caixinha (sem
  // relação nenhuma) estivesse marcada era um bug real: a maioria das
  // rotas internacionais não tem voo direto, então isso descartava 100%
  // das ofertas da fonte antes mesmo de chegar no usuário — parecendo que
  // a API não retornou nada, mesmo com uma chave paga funcionando
  // normalmente. Nenhum outro provider (Travelpayouts, Smiles, Azul) faz
  // esse filtro — todos mostram voos com conexão (a coluna "Paradas" já
  // deixa isso visível), só esse aqui filtrava por engano.
  const rawOffers = extractOffersArray(data);
  if (rawOffers === null) {
    const shape = data && typeof data === 'object' ? `objeto com chaves [${Object.keys(data).join(', ')}]` : typeof data;
    console.error(
      `[CASH_RAPIDAPI_GFLIGHTS] resposta em formato inesperado (${shape}) — nenhuma lista de voos reconhecida, mostrando 0 ofertas. Verifique o formato real da resposta dessa API pra ajustar o parsing.`
    );
  }

  const offers = (rawOffers || [])
    .map((offer) => ({
      program: 'CASH_RAPIDAPI_GFLIGHTS',
      priceBRL: usdToBrl(Number(offer.price_as_number)),
      milesRequired: null,
      taxesBRL: null,
      stops: Number(offer.stops) || 0,
      isHiddenCity: false,
      deepLink: offer.buy_link || null,
      source: `Google Flights via RapidAPI (${offer.airline || 'dados reais'})`,
    }))
    .filter((o) => Number.isFinite(o.priceBRL) && o.priceBRL > 0);

  return { status: 'ok', message: null, offers };
}

module.exports = { id: 'CASH_RAPIDAPI_GFLIGHTS', label: 'Comparação em dinheiro (Google Flights via RapidAPI)', enabled, search };
