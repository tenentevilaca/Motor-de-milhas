require('./helpers/setup');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const azul = require('../src/providers/azul');

function withMockedPost(response, fn) {
  const original = axios.post;
  axios.post = async () => response;
  return fn().finally(() => {
    axios.post = original;
  });
}

function withMockedGet(response, fn) {
  const original = axios.get;
  axios.get = async () => response;
  return fn().finally(() => {
    axios.get = original;
  });
}

test('parseia oferta normalmente quando o ator devolve item com cabine disponível', async () => {
  process.env.APIFY_TOKEN = 'test-token';
  try {
    await withMockedPost(
      {
        data: [
          {
            link: 'https://exemplo.com',
            itineraries: [{ stops: 0, totalDuration: 90, flightNumbers: ['AD123'], departure: '2026-12-08T10:00:00', arrival: '2026-12-08T11:30:00' }],
            cabins: [{ name: 'Econômica', available: true, mileage: 12000, taxes: 3194 }],
          },
        ],
      },
      async () => {
        const result = await azul.search({ origin: 'CNF', destination: 'MAO', departDate: '2026-12-08', returnDate: null });
        assert.equal(result.status, 'ok');
        assert.equal(result.offers.length, 1);
        assert.equal(result.offers[0].program, 'AZUL');
        assert.equal(result.offers[0].milesRequired, 12000);
        assert.equal(result.offers[0].taxesBRL, 31.94);
      }
    );
  } finally {
    delete process.env.APIFY_TOKEN;
  }
});

// Achado real (usuário testou no site de verdade): o "link" que o ator
// Apify devolve por item aponta pro Azul Fidelidade/Pelo Mundo e não abre.
// Não dá mais pra confiar nesse link de terceiro — usa o mesmo link de
// busca simples (só ida) que o resto do arquivo já usa no fallback do
// Seats.aero, ignorando item.link.
test('deepLink ignora o "link" que o ator Apify devolve (confirmado quebrado) e usa o link de busca direta — só ida', async () => {
  process.env.APIFY_TOKEN = 'test-token';
  try {
    await withMockedPost(
      {
        data: [
          {
            link: 'https://exemplo.com/nao-funciona',
            itineraries: [{ stops: 0, totalDuration: 90, flightNumbers: ['AD123'], departure: '2026-12-08T10:00:00', arrival: '2026-12-08T11:30:00' }],
            cabins: [{ name: 'Econômica', available: true, mileage: 12000, taxes: 3194 }],
          },
        ],
      },
      async () => {
        const result = await azul.search({ origin: 'CNF', destination: 'MAO', departDate: '2026-12-08', returnDate: null });
        assert.equal(
          result.offers[0].deepLink,
          'https://www.voeazul.com.br/br/pt/home/selecao-voo?tp=ONEWAY&og=CNF&ds=MAO&dtIda=2026-12-08'
        );
      }
    );
  } finally {
    delete process.env.APIFY_TOKEN;
  }
});

test('deepLink fica null (cai pro link genérico) quando a busca é ida e volta — formato de volta nunca foi confirmado', async () => {
  process.env.APIFY_TOKEN = 'test-token';
  try {
    await withMockedPost(
      {
        data: [
          {
            link: 'https://exemplo.com/nao-funciona',
            cabins: [{ name: 'Econômica', available: true, mileage: 12000 }],
          },
        ],
      },
      async () => {
        const result = await azul.search({ origin: 'CNF', destination: 'MAO', departDate: '2026-12-08', returnDate: '2026-12-15' });
        assert.equal(result.offers[0].deepLink, null);
      }
    );
  } finally {
    delete process.env.APIFY_TOKEN;
  }
});

test('diagnóstico: ator devolve lista vazia — loga que não achou nada pra essa rota/data', async () => {
  process.env.APIFY_TOKEN = 'test-token';
  const originalLog = console.log;
  const logLines = [];
  console.log = (...args) => logLines.push(args.join(' '));
  try {
    await withMockedPost({ data: [] }, async () => {
      const result = await azul.search({ origin: 'CNF', destination: 'MAO', departDate: '2026-12-08', returnDate: null });
      assert.equal(result.offers.length, 0);
    });
  } finally {
    console.log = originalLog;
    delete process.env.APIFY_TOKEN;
  }
  assert.ok(
    logLines.some((l) => l.includes('AZUL:apify') && l.includes('sem nenhum item')),
    `logs: ${JSON.stringify(logLines)}`
  );
});

test('diagnóstico: itens existem mas nenhuma cabine passa no filtro — loga as chaves reais pra diagnóstico', async () => {
  process.env.APIFY_TOKEN = 'test-token';
  const originalError = console.error;
  const errorLines = [];
  console.error = (...args) => errorLines.push(args.join(' '));
  try {
    await withMockedPost(
      { data: [{ link: 'https://exemplo.com', cabins: [{ nome: 'Econômica', disponivel: true, milhas: 12000 }] }] },
      async () => {
        const result = await azul.search({ origin: 'CNF', destination: 'MAO', departDate: '2026-12-08', returnDate: null });
        assert.equal(result.offers.length, 0);
      }
    );
  } finally {
    console.error = originalError;
    delete process.env.APIFY_TOKEN;
  }
  assert.ok(
    errorLines.some((l) => l.includes('AZUL:apify') && l.includes('nome') && l.includes('disponivel')),
    `logs: ${JSON.stringify(errorLines)}`
  );
});

// Achado real (log de produção, CNF->MAO): o Apify não achou nada pra essa
// rota, mas o Seats.aero achou (Source="azul") — o scraper de site é
// instável e nem sempre concorda com a Seats.aero, então rodar as duas
// aumenta a chance real de achar a oferta.
test('quando o Apify não acha nada, tenta o Seats.aero como complemento e usa o resultado dele', async () => {
  process.env.APIFY_TOKEN = 'test-token';
  process.env.SEATSAERO_API_KEY = 'test-key';
  try {
    await withMockedPost({ data: [] }, () =>
      withMockedGet(
        { data: { data: [{ Source: 'aeroplan', Stops: 0, YMileageCost: 50000 }, { Source: 'azul', Stops: 1, YMileageCost: 18000, TaxesCurrency: 'BRL', YTotalTaxes: 45 }] } },
        async () => {
          const result = await azul.search({ origin: 'CNF', destination: 'MAO', departDate: '2026-12-08', returnDate: null });
          assert.equal(result.status, 'ok');
          assert.equal(result.offers.length, 1, 'só a trip com Source="azul" deveria virar oferta, não "aeroplan"');
          assert.equal(result.offers[0].program, 'AZUL');
          assert.equal(result.offers[0].milesRequired, 18000);
        }
      )
    );
  } finally {
    delete process.env.APIFY_TOKEN;
    delete process.env.SEATSAERO_API_KEY;
  }
});

test('quando o Apify já achou oferta, não gasta uma chamada a mais no Seats.aero', async () => {
  process.env.APIFY_TOKEN = 'test-token';
  process.env.SEATSAERO_API_KEY = 'test-key';
  let seatsAeroCalled = false;
  try {
    await withMockedPost(
      { data: [{ link: 'https://exemplo.com', cabins: [{ name: 'Econômica', available: true, mileage: 12000 }] }] },
      () =>
        withMockedGet({ data: { data: [] } }, async () => {
          const originalGet = axios.get;
          axios.get = async (...args) => {
            seatsAeroCalled = true;
            return originalGet(...args);
          };
          const result = await azul.search({ origin: 'CNF', destination: 'MAO', departDate: '2026-12-08', returnDate: null });
          assert.equal(result.offers.length, 1);
          axios.get = originalGet;
        })
    );
  } finally {
    delete process.env.APIFY_TOKEN;
    delete process.env.SEATSAERO_API_KEY;
  }
  assert.equal(seatsAeroCalled, false, 'não deveria ter chamado o Seats.aero — o Apify já tinha achado oferta');
});

// Item A do pedido de revisão: logs precisam categorizar a causa (auth/
// quota/timeout/http/rede), não só mostrar uma mensagem genérica.
test('erro do Apify (401, chave inválida) loga categoria "auth" — mensagem pro usuário continua igual', async () => {
  process.env.APIFY_TOKEN = 'test-token';
  const originalError = console.error;
  const errorLines = [];
  console.error = (...args) => errorLines.push(args.join(' '));
  try {
    const err = new Error('Request failed with status code 401');
    err.response = { status: 401, data: { error: { message: 'Invalid token' } } };
    axios.post = async () => {
      throw err;
    };
    const result = await azul.search({ origin: 'CNF', destination: 'MAO', departDate: '2026-12-08', returnDate: null });
    assert.equal(result.status, 'error');
    assert.ok(result.message.includes('Invalid token'), `mensagem devia continuar extraindo error.message do Apify: ${result.message}`);
    assert.ok(
      errorLines.some((l) => l.includes('[AZUL:apify]') && l.includes('ERRO DE AUTENTICAÇÃO')),
      `esperava log categorizado, veio: ${JSON.stringify(errorLines)}`
    );
  } finally {
    console.error = originalError;
    delete axios.post;
    delete process.env.APIFY_TOKEN;
  }
});

// Item 5 do pedido do usuário: cabin.airlines já é confirmado (comentário no
// código) como concreto pra esse trecho/cabine específico, não elegibilidade
// geral do programa — quando vem com 1 companhia só, essa é a operadora.
test('Azul: cabin.airlines com 1 companhia vira operatingAirline (afirmação concreta pra essa cabine/itinerário)', async () => {
  process.env.APIFY_TOKEN = 'test-token';
  try {
    await withMockedPost(
      {
        data: [
          {
            itineraries: [{ stops: 1, totalDuration: 400, flightNumbers: ['LA800'], departure: '2026-12-08T10:00:00', arrival: '2026-12-08T18:00:00' }],
            cabins: [{ name: 'Econômica', available: true, mileage: 40000, airlines: [{ name: 'LATAM' }] }],
          },
        ],
      },
      async () => {
        const result = await azul.search({ origin: 'GRU', destination: 'SCL', departDate: '2026-12-08', returnDate: null });
        const offer = result.offers[0];
        assert.equal(offer.loyaltyProgram, 'TudoAzul');
        assert.equal(offer.operatingAirline, 'LATAM');
        assert.equal(offer.partnerAirlines, null);
        assert.equal(offer.cabin, 'Econômica');
        assert.equal(offer.availabilitySource, 'apify');
        assert.equal(offer.isLiveAwardAvailability, true);
      }
    );
  } finally {
    delete process.env.APIFY_TOKEN;
  }
});

test('Azul: cabin.airlines com 2+ companhias vira partnerAirlines (opções paralelas), nunca uma operatingAirline única', async () => {
  process.env.APIFY_TOKEN = 'test-token';
  try {
    await withMockedPost(
      {
        data: [
          {
            cabins: [{ name: 'Executiva', available: true, mileage: 80000, airlines: [{ name: 'TAP Air Portugal' }, { name: 'Azul' }] }],
          },
        ],
      },
      async () => {
        const result = await azul.search({ origin: 'GRU', destination: 'LIS', departDate: '2026-12-08', returnDate: null });
        const offer = result.offers[0];
        assert.equal(offer.operatingAirline, null);
        assert.deepEqual(offer.partnerAirlines, ['TAP Air Portugal', 'Azul']);
      }
    );
  } finally {
    delete process.env.APIFY_TOKEN;
  }
});

test('Azul: sem cabin.airlines (rota doméstica típica), operatingAirline e partnerAirlines ficam null — não afirma disponibilidade parceira sem dado concreto', async () => {
  process.env.APIFY_TOKEN = 'test-token';
  try {
    await withMockedPost(
      {
        data: [
          {
            itineraries: [{ stops: 0, totalDuration: 90, flightNumbers: ['AD123'], departure: '2026-12-08T10:00:00', arrival: '2026-12-08T11:30:00' }],
            cabins: [{ name: 'Econômica', available: true, mileage: 12000, taxes: 3194 }],
          },
        ],
      },
      async () => {
        const result = await azul.search({ origin: 'CNF', destination: 'MAO', departDate: '2026-12-08', returnDate: null });
        const offer = result.offers[0];
        assert.equal(offer.operatingAirline, null);
        assert.equal(offer.partnerAirlines, null);
        assert.equal(offer.marketingAirline, null);
        assert.equal(offer.segments, null);
      }
    );
  } finally {
    delete process.env.APIFY_TOKEN;
  }
});

test('diagnóstico: loga quantas cabines tiveram companhia identificada vs. não, sem imprimir token do Apify', async () => {
  process.env.APIFY_TOKEN = 'token-apify-secreto-nao-pode-vazar';
  const originalLog = console.log;
  const logLines = [];
  console.log = (...args) => logLines.push(args.join(' '));
  try {
    await withMockedPost(
      { data: [{ cabins: [{ name: 'Econômica', available: true, mileage: 12000, airlines: [{ name: 'Azul' }] }, { name: 'Executiva', available: true, mileage: 40000 }] }] },
      async () => {
        await azul.search({ origin: 'CNF', destination: 'MAO', departDate: '2026-12-08', returnDate: null });
      }
    );
  } finally {
    console.log = originalLog;
    delete process.env.APIFY_TOKEN;
  }
  const summaryLine = logLines.find((l) => l.includes('AZUL:apify') && l.includes('companhia identificada'));
  assert.ok(summaryLine, `logs: ${JSON.stringify(logLines)}`);
  assert.ok(summaryLine.includes('companhia identificada em 1 cabine(s)') && summaryLine.includes('sem dado de companhia em 1'));
  assert.ok(!logLines.some((l) => l.includes('token-apify-secreto-nao-pode-vazar')), 'token do Apify não pode aparecer em log nenhum');
});

test('erro do Seats.aero (429, cota) loga categoria "quota" quando é a única fonte configurada', async () => {
  process.env.SEATSAERO_API_KEY = 'test-key';
  const originalError = console.error;
  const errorLines = [];
  console.error = (...args) => errorLines.push(args.join(' '));
  try {
    const err = new Error('Request failed with status code 429');
    err.response = { status: 429, data: { message: 'Rate limit exceeded' } };
    axios.get = async () => {
      throw err;
    };
    const result = await azul.search({ origin: 'CNF', destination: 'MAO', departDate: '2026-12-08', returnDate: null });
    assert.equal(result.status, 'error');
    assert.ok(
      errorLines.some((l) => l.includes('[AZUL:seatsaero]') && l.includes('COTA EXCEDIDA')),
      `esperava log categorizado, veio: ${JSON.stringify(errorLines)}`
    );
  } finally {
    console.error = originalError;
    delete axios.get;
    delete process.env.SEATSAERO_API_KEY;
  }
});
