# ✈️ Motor de Milhas

Motor de busca e monitoramento de passagens aéreas com milhas (American Airlines/AAdvantage, LATAM Pass, Smiles,
TudoAzul) e comparação com preços em dinheiro, com alertas automáticos por e-mail e WhatsApp.

## O que este projeto faz

- Formulário de busca: origem e destino por **cidade, país ou código IATA** (autocomplete com ~6.000 aeroportos —
  não é preciso saber o código de cor), datas (+ flexibilidade em dias), **múltiplos** programas de milhas,
  stopover e hidden-city/skiplagged como filtros opcionais.
- **Destino por continente/região** (América do Sul, América Central e Caribe, América do Norte, Europa, Oriente
  Médio, África, Ásia, Oceania): em vez de escolher um aeroporto específico, digite o continente no campo Destino
  e o motor consulta um conjunto enxuto de hubs relevantes daquela região (1 por país, priorizando os principais)
  e destaca o mais barato — um "pra onde for mais barato dentro desse continente" (`src/data/continents.js`,
  `src/airports.js#getHubAirportsForRegion`). Não é compatível com quebra de bilhete (que exige um destino único).
- Roda automaticamente todos os dias, em horários configuráveis (padrão: 06h, 13h, 21h + varredura a cada 2h
  para promoções relâmpago — ver raciocínio em `src/scheduler.js`).
- Detecta anomalias de preço (possíveis erros de tarifa) e novos mínimos históricos (possíveis promoções
  relâmpago) comparando cada oferta com o histórico da rota.
- Monitora RSS de blogs de promoção/milhas (Melhores Destinos, Passageiro de Primeira, Mestre das Milhas, Flip
  Milhas) a cada 10min e alerta quando um post menciona a origem/destino de uma busca sua — é onde erro de tarifa
  e bônus de transferência de pontos costumam aparecer primeiro, antes de qualquer agregador de preço. Clicar em
  "Rodar agora" também checa os blogs na hora pra aquela rota (não só a varredura agendada) — mostra o que tiver
  disponível mesmo sem nenhuma fonte de preço configurada, sem duplicar alerta se você já tinha sido notificado.
- Compara **quebra de bilhete** (opt-in por busca): quando há data de ida e volta, busca as duas pernas separadas
  nas mesmas fontes de preço real e avisa se sai mais barato que o pacote redondo.
- Envia alertas por e-mail (qualquer SMTP), WhatsApp (CallMeBot sem cadastro, ou Twilio) e Telegram (bot próprio,
  provavelmente o canal mais simples de configurar). Se os dois estiverem configurados e o CallMeBot falhar (ele
  responde HTTP 200 mesmo em erro — o app checa o texto da resposta pra saber se realmente enviou), cai automaticamente
  pro Twilio em vez de simplesmente reportar sucesso sem ter enviado nada.
- **Card "Melhor época para essa rota"**: aparece assim que você escolhe origem e destino (e melhora quando você
  preenche a data). Mostra (1) se a data escolhida está dentro da janela ideal de compra pra rota doméstica
  (30–60 dias antes) ou internacional (60–150 dias antes), (2) os meses de alta/baixa temporada considerando o
  calendário de férias do Brasil e o hemisfério do destino, e (3) — assim que o motor acumular histórico
  suficiente — o mês com menor preço médio já observado nessa rota específica, calculado a partir dos seus
  próprios dados (`src/search/bestTimeToBuy.js`).
- **Resultado como motor de busca de verdade**: ao rodar uma busca, todas as ofertas de todas as fontes
  configuradas (e a quebra de bilhete, se ativada) são comparadas e a mais barata de todas aparece destacada no
  topo ("🏆 Menor preço encontrado"), com a tabela completa ordenada da mais barata pra mais cara.
- **Site com abas** (`index.html` Buscar, `buscas.html` Buscas ativas, `hospedagem.html` Hospedagem,
  `promocoes.html` Promoções, `settings.html` Configurações — nav compartilhado, link ativo destacado), cada uma
  usando a largura inteira da página com grid de cards. "Promoções" mostra o feed completo de blogs por padrão
  (busca por texto + filtro por fonte + filtro "relacionado às minhas buscas"), e o formulário de busca tem
  atalhos de "rotas populares" (1 clique preenche origem/destino).
- **Hospedagem** (`hospedagem.html`): busca hotéis via Trivago (mesma X-RapidAPI-Key das outras fontes) — nome,
  foto, estrelas, avaliação e preço. Se você informar um "local específico" (endereço/ponto turístico), o app
  geocodifica esse ponto e calcula a distância real até cada hotel (via `src/geocode.js` + coordenadas do
  Trivago), permitindo ordenar por proximidade além de relevância/preço/avaliação. Airbnb não entra: não tem API
  pública de busca, e scraping direto violaria os Termos de Uso deles (mesmo critério usado pras companhias
  aéreas neste projeto).
- **Buscar já roda a busca e mostra o resultado ali mesmo** (primeira aba, sem precisar navegar pra "Buscas
  ativas") — a busca também fica salva pra rodar de novo depois. O formulário é dividido em blocos com cor própria
  (rota, datas, programas, alertas) e "stopover/quebra de bilhete/hidden-city" viram uma seção avançada recolhida
  por padrão, pra não poluir a tela.
- **Calculadora "milhas ou dinheiro?" embutida no resultado**: assim que a busca encontra um preço em dinheiro (ou
  milhas, se algum provedor de milhas retornar isso), o valor já aparece preenchido — você só completa o que o
  app não tem como saber sozinho (quanto custam 1.000 milhas do seu programa hoje). 100% client-side, sem API.

## O que este projeto **não** faz (e por quê)

1. **Não garante "a passagem mais barata possível".** Nenhuma ferramenta consegue prometer isso — disponibilidade
   de assentos-prêmio, câmbio e bloqueios antifraude dos sites estão fora de controle de qualquer software.
2. **Não faz scraping automático de AA.com, Latam, Smiles ou TudoAzul.** Esses sites têm proteção antibot séria
   (Akamai/PerimeterX/Cloudflare); tentar contornar isso é o tipo de coisa que leva a bloqueio de IP ou
   **suspensão da sua conta de milhas** — destrói o próprio objetivo da ferramenta. Os adaptadores em
   `src/providers/` ficam "pendentes de configuração" até você apontar `AA_PROVIDER_URL` / `LATAM_PROVIDER_URL` /
   `SMILES_PROVIDER_URL` / `AZUL_PROVIDER_URL` para uma integração própria (parceria oficial, GDS, ou um serviço
   de scraping que você mesmo administra e está autorizado a rodar). Sem isso, o app mostra um link para
   checagem manual no site oficial.
   **Alternativa sem API oficial da companhia:** os provedores `CASH_TRAVELPAYOUTS` e `CASH_RAPIDAPI_GFLIGHTS` usam
   Google Flights (via [Google Flights Live API do RapidAPI](https://rapidapi.com)) e o
   [Travelpayouts](https://www.travelpayouts.com) — agregadores que já cobrem AA, LATAM, Azul, GOL e centenas de
   outras companhias, sem que o motor precise falar diretamente com o site de cada uma. RapidAPI faz busca **ao
   vivo** de verdade (paga por uso); o Travelpayouts é um **cache** de preços já vistos, gratuito (pode não achar
   preço pra uma data exata específica mesmo em rota popular — não é bug, é limitação do tipo de dado). (SerpApi,
   Kiwi.com Tequila e a Amadeus for Developers foram testadas e removidas do projeto — ver item 4.)
3. **Não automatiza a compra de tarifas com erro nem de passagens hidden-city.** O motor **detecta e avisa**
   quando encontra um preço muito abaixo do histórico (possível erro de tarifa) ou uma opção hidden-city — mas a
   decisão e a execução da compra são sempre manuais, porque:
   - Companhias podem cancelar tarifas com erro mesmo após a emissão (nos EUA, decisão do DOT de 2015 permite
     isso se comprovarem o erro; cerca de 10% das mistake fares são canceladas, geralmente em até 72h, com
     reembolso).
   - Hidden-city/skiplagged viola o contrato de transporte da maioria das companhias e pode levar a cancelamento
     do restante do itinerário ou bloqueio de conta de milhas/status.
4. **Comparação em dinheiro real via Travelpayouts e RapidAPI, mas milhas via integração própria.** Essas
   fontes dão preços reais em dinheiro (bom para comparar com o custo em milhas e para alimentar o detector de
   anomalia), mas nenhuma cobre disponibilidade de assento-prêmio das companhias citadas — isso continua
   exigindo integração própria (item 2).
   **Sobre Amadeus for Developers, SerpApi e Kiwi.com Tequila:** chegaram a ser integradas, mas foram **removidas
   do projeto** — nenhuma funcionou no uso real (Amadeus: portal descontinuado; SerpApi: cadastro travou na
   verificação de telefone por SMS; Kiwi: travou na verificação de e-mail). Travelpayouts e RapidAPI cobrem o
   mesmo papel sem esse problema.
5. **Não vem com as chaves de API já preenchidas.** Travelpayouts, RapidAPI, seu provedor de e-mail e o
   Twilio exigem uma conta pessoal (identidade, e-mail/telefone verificado, aceite dos termos de uso) — isso só
   quem vai usar o serviço pode criar, não pode ser feito por automação em nome de outra pessoa. O que este
   projeto faz para reduzir o trabalho ao mínimo é a tela **Configurações** (`/settings.html`): você cola cada
   chave direto pelo navegador, sem editar `.env` nem redeployar, com o passo a passo de cada cadastro na própria
   tela (leva uns 5 minutos por serviço).
6. **Não monitora Instagram nem grupos de WhatsApp.** Instagram: scraping de contas de terceiros viola os Termos
   da Meta, que já processou empresas por isso (Meta vs. BrightData/BrandTotal) — sem API pública pra esse uso.
   Grupos de WhatsApp: só dá pra automatizar via bibliotecas não-oficiais que imitam o WhatsApp Web, violando os
   Termos do WhatsApp com risco real de banimento da conta pessoal usada. O que o projeto monitora em vez disso —
   blogs de promoção via RSS — cobre o mesmo tipo de conteúdo (erro de tarifa, promoção, bônus de milhas) sem
   nenhum desses riscos, porque RSS é feito justamente para consumo automatizado.
7. **Não usa Selenium/Playwright/undetected-chromedriver com proxies rotativos pra "simular um usuário" nos sites
   das companhias, nem intercepta chamadas internas de API copiando cookies/headers de autenticação.** Isso foi
   pedido explicitamente durante o desenvolvimento e recusado de propósito: é evasão de detecção antibot (é
   literalmente pra isso que existe o `undetected-chromedriver`), e interceptar chamadas autenticadas com cookies
   copiados é abuso de sessão, não "automação". O risco não é só bloqueio de IP — é a conta de milhas suspensa. As
   fontes de preço reais (Travelpayouts/RapidAPI) e o feed de blogs cobrem o mesmo objetivo (preço real +
   alerta rápido de promoção) sem esse risco.
8. **Skyscanner não está integrado.** A API pública deles foi descontinuada em 2016; hoje só dá acesso via
   parceria comercial aprovada (processo parecido com o que já existe pros programas de milhas). Se você
   conseguir esse acesso, dá pra plugar como mais uma fonte `CASH_*` seguindo o mesmo padrão de `src/providers/`.

## Estratégias de economia aplicadas

- Emissão híbrida (mixed cabin / companhias diferentes na ida e volta) — o app permite programas diferentes por
  busca para facilitar a comparação.
- Janela de compra: doméstico 30–60 dias, internacional 60–150 dias antes (documentar no seu processo de busca).
- Flexibilidade de datas (campo "± dias") — meio de semana costuma ser mais barato.
- Stopover como filtro (geralmente mais barato que voo direto) — algumas companhias oferecem stopover **gratuito**
  de propósito (TAP em Lisboa/Porto, Turkish Airlines em Istambul, Icelandair em Reykjavik, Emirates em Dubai,
  Singapore Airlines em Cingapura); vale marcar "aceitar stopover" pra não descartar essas rotas.
- Quebra de bilhete (ida/volta separadas) — às vezes sai mais barato que o pacote redondo; o app compara os dois
  quando você ativa a opção numa busca.
- Alertas de queda de preço e de novos mínimos históricos (promoção relâmpago).

## Setup

```bash
npm install
npm start
```

### Testes

```bash
npm test
```

Roda a suíte automatizada (Node's `node:test`, sem dependência nova) sobre a lógica pura do motor — flexibilidade de
datas, detecção de erro de tarifa, quebra de bilhete com datas flexíveis, varredura por mês, escala de
preço/milhas/taxas por passageiro, e o recorte de arbitragem por destino+data. Usa `DATA_DIR` isolado num diretório
temporário (não toca nos seus dados reais em `data/`) e providers stubados (nenhuma chamada real de API).

**Você não precisa configurar tudo.** O feed de blogs de promoção já funciona sem nenhuma chave. Se quiser
detecção de erro de tarifa com preço real, basta **uma** das duas fontes de dinheiro (Travelpayouts, grátis, ou
RapidAPI, paga) — não precisa das duas. Para alertas, e-mail ou Telegram costumam ser os mais rápidos de
configurar.

Acesse `http://localhost:3000` e depois `http://localhost:3000/settings.html` para colar suas chaves de API — cada
seção da tela de Configurações tem o passo a passo de onde conseguir a chave. Na própria tela principal, o painel
"Status das integrações" tem um botão "❓ como configurar" em cada item que expande o mesmo passo a passo sem
precisar sair da página — só cobre serviços com opção gratuita de verdade (Travelpayouts, RapidAPI [única paga],
Brevo, CallMeBot, Telegram). Também dá pra usar variáveis de ambiente (`.env`, veja `.env.example`) se preferir;
o que estiver salvo na tela de Configurações tem prioridade.

> **Nota sobre esse passo a passo:** foi escrito com base no fluxo de cadastro mais recente que eu conhecia, mas
> não consegui abrir essas páginas ao vivo pra conferir durante o desenvolvimento (o ambiente onde este projeto
> foi construído bloqueia acesso a domínios externos fora de uma lista pequena). Se algum passo estiver
> desatualizado ou algum botão tiver mudado de lugar, me avise que corrijo na hora.

### Contas gratuitas para habilitar as integrações

| Recurso | Onde conseguir | Custo |
|---|---|---|
| Comparação em dinheiro real (Google Flights) | [RapidAPI — Google Flights Live API](https://rapidapi.com) | Cota grátis mensal, depois pago |
| Comparação em dinheiro real (agregador low-cost) | [travelpayouts.com](https://www.travelpayouts.com) — geralmente sem telefone | Grátis |
| Milhas Smiles (Gol) | [RapidAPI — Award Flight & Miles Search API](https://rapidapi.com) (mesma chave do Google Flights) | Cota grátis mensal, depois pago |
| Milhas Azul | Apify (ator `igolaizola/flight-award-scraper`) — risco de ToS, ver aviso na tela de Configurações | Cota grátis mensal, depois pago |
| E-mail | Brevo, Resend, ou Gmail (senha de app) | Grátis (limite diário/mensal) |
| WhatsApp (opção simples) | [CallMeBot](https://www.callmebot.com/blog/free-api-whatsapp-messages/) — sem cadastro em site | Grátis |
| WhatsApp (opção avançada) | [Twilio WhatsApp Sandbox](https://www.twilio.com/docs/whatsapp/sandbox) | Grátis para testar, pago em produção |
| Telegram | [@BotFather](https://t.me/BotFather) — ~2 minutos, sem verificação de telefone | Grátis |
| Milhas (AA/LATAM/Smiles/Azul) | Parceria oficial ou integração própria que você administre | Depende |

### E-mail, WhatsApp e/ou Telegram — como escolher

Cada busca tem os três campos (e-mail, WhatsApp, Telegram) opcionais e independentes: preencha qualquer combinação
— o alerta é enviado para **todo canal que tiver um valor preenchido** naquela busca específica. Não precisa de
nenhuma opção extra de "canal preferido".

## Deploy no Render

Este repo já inclui `render.yaml`. Conecte o repositório em [render.com](https://render.com) e configure as
variáveis de ambiente marcadas como `sync: false` no painel. **Atenção:** o plano free do Render não tem disco
persistente — os dados em `./data` (buscas salvas, histórico, e as chaves salvas pela tela de Configurações) são
perdidos a cada deploy/restart nesse plano. Por isso, no free tier, prefira preencher as chaves de API como
variáveis de ambiente do Render (persistem de verdade) em vez da tela `/settings.html`. Se quiser usar a tela de
Configurações em produção, migre para um plano pago com disco persistente.

## Eficiência e custo das chamadas de API

Pra não estourar a cota das APIs de preço (o RapidAPI é pago por chamada), toda chamada a um provedor
passa por um cache de 15 minutos por rota+data (`src/cache.js`): se a mesma combinação for checada de novo nesse
intervalo (múltiplas buscas salvas pra mesma rota, cliques repetidos em "Rodar agora", a varredura de promoção
relâmpago rodando a cada 2h), reaproveita o resultado em vez de gastar mais uma chamada. A checagem do feed de
blogs também pula a leitura por completo quando não há nenhuma busca ativa pra alertar.

## Estrutura

```
src/
  server.js          API Express + serve o frontend
  config.js            configurações salvas via tela de Configurações (data/settings.json) + fallback a .env
  db.js               storage em JSON (buscas + histórico de preços)
  cache.js              cache TTL das chamadas aos provedores de preço
  scheduler.js         node-cron com os horários de busca
  airports.js           busca/proximidade de aeroportos + hubs por continente
  data/continents.js      mapa país → continente/região (destino "qualquer lugar da Europa" etc.)
  geocode.js            geocodificação (Nominatim) para aeroportos mais próximos
  dealFeeds.js            lê RSS de blogs de promoção/milhas
  providers/            um adaptador por programa/fonte de dados
  search/
    runSearch.js        orquestra os provedores, grava histórico, dispara alertas
    anomaly.js           detecção de erro de tarifa / promoção relâmpago
    checkDealFeeds.js     casa posts de blog com buscas salvas, dispara alertas
    splitTicketCompare.js  compara ida-e-volta vs quebra de bilhete
    bestTimeToBuy.js       janela ideal de compra + sazonalidade + histórico por mês
  notify/
    email.js, whatsapp.js, telegram.js
public/
  index.html            página "Buscar" (formulário + calculadora milhas/dinheiro)
  buscas.html             página "Buscas ativas" (grid de cards)
  hospedagem.html, hospedagem.js  página "Hospedagem" (busca de hotéis via Trivago + proximidade)
  promocoes.html          página "Promoções" (feed de blogs em cards, com filtro)
  settings.html, settings.js  página "Configurações" (chaves de API, e-mail, WhatsApp, agendador, status)
  app.js                script compartilhado por todas as páginas (api(), escapeHtml(), nav ativo)
```

## Créditos de dados

A busca de aeroporto por cidade/país usa a base [OpenFlights Airports Database](https://openflights.org/data.html)
(`src/data/airports.json`, licença [ODbL](https://opendatacommons.org/licenses/odbl/)), com aliases de cidade/país
em português em `src/data/cityAliases.js` e `src/data/countryAliases.js`. Quando o local buscado não tem aeroporto
próprio, a geocodificação para sugerir os aeroportos mais próximos usa o [Nominatim/OpenStreetMap](https://nominatim.org)
(`src/geocode.js`) — © colaboradores do OpenStreetMap, uso gratuito respeitando o limite de ~1 requisição/segundo.
