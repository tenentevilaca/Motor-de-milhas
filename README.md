# ✈️ Motor de Milhas

Motor de busca e monitoramento de passagens aéreas com milhas (American Airlines/AAdvantage, LATAM Pass, Smiles,
TudoAzul) e comparação com preços em dinheiro, com alertas automáticos por e-mail e WhatsApp.

## O que este projeto faz

- Formulário de busca: origem e destino por **cidade, país ou código IATA** (autocomplete com ~6.000 aeroportos —
  não é preciso saber o código de cor), datas (+ flexibilidade em dias), **múltiplos** programas de milhas,
  stopover e hidden-city/skiplagged como filtros opcionais.
- Roda automaticamente todos os dias, em horários configuráveis (padrão: 06h, 13h, 21h + varredura a cada 2h
  para promoções relâmpago — ver raciocínio em `src/scheduler.js`).
- Detecta anomalias de preço (possíveis erros de tarifa) e novos mínimos históricos (possíveis promoções
  relâmpago) comparando cada oferta com o histórico da rota.
- Monitora RSS de blogs de promoção/milhas (Melhores Destinos, Passageiro de Primeira, Mestre das Milhas, Flip
  Milhas) a cada 10min e alerta quando um post menciona a origem/destino de uma busca sua — é onde erro de tarifa
  e bônus de transferência de pontos costumam aparecer primeiro, antes de qualquer agregador de preço.
- Compara **quebra de bilhete** (opt-in por busca): quando há data de ida e volta, busca as duas pernas separadas
  nas mesmas fontes de preço real e avisa se sai mais barato que o pacote redondo.
- Envia alertas por e-mail (qualquer SMTP), WhatsApp (CallMeBot sem cadastro, ou Twilio) e Telegram (bot próprio,
  provavelmente o canal mais simples de configurar).

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
   **Alternativa sem API oficial da companhia:** os provedores `CASH_SERPAPI`, `CASH_KIWI` e `CASH_TRAVELPAYOUTS`
   usam Google Flights (via [SerpApi](https://serpapi.com)), [Kiwi.com](https://tequila.kiwi.com) e
   [Travelpayouts](https://www.travelpayouts.com) — agregadores que já cobrem AA, LATAM, Azul, GOL e centenas de
   outras companhias, sem que o motor precise falar diretamente com o site de cada uma. São 3 fontes reais e
   independentes de preço em dinheiro rodando em toda busca — sem risco de bloqueio de conta (o Amadeus também
   integra, mas veja o aviso no item 4 sobre a desativação do portal self-service).
3. **Não automatiza a compra de tarifas com erro nem de passagens hidden-city.** O motor **detecta e avisa**
   quando encontra um preço muito abaixo do histórico (possível erro de tarifa) ou uma opção hidden-city — mas a
   decisão e a execução da compra são sempre manuais, porque:
   - Companhias podem cancelar tarifas com erro mesmo após a emissão (nos EUA, decisão do DOT de 2015 permite
     isso se comprovarem o erro; cerca de 10% das mistake fares são canceladas, geralmente em até 72h, com
     reembolso).
   - Hidden-city/skiplagged viola o contrato de transporte da maioria das companhias e pode levar a cancelamento
     do restante do itinerário ou bloqueio de conta de milhas/status.
4. **Comparação em dinheiro real via SerpApi, Kiwi.com, Travelpayouts e (por enquanto) Amadeus, mas milhas via
   integração própria.** Essas fontes dão preços reais em dinheiro (bom para comparar com o custo em milhas e
   para alimentar o detector de anomalia), mas nenhuma cobre disponibilidade de assento-prêmio das companhias
   citadas — isso continua exigindo integração própria (item 2).
   **⚠️ Amadeus:** o portal de autoatendimento (self-service) da Amadeus for Developers será desativado em
   **17/07/2026** — depois dessa data provavelmente não dá mais pra criar conta nova por lá (as APIs
   corporativas continuam, mas exigem contrato empresarial). Contas já existentes devem continuar funcionando até
   a desativação. Recomendamos priorizar SerpApi/Kiwi.com/Travelpayouts, que não têm esse problema.
5. **Não vem com as chaves de API já preenchidas.** SerpApi, Kiwi.com, Travelpayouts, Amadeus, seu provedor de
   e-mail e o Twilio exigem uma conta pessoal (identidade, e-mail/telefone verificado, aceite dos termos de uso) — isso só
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
   4 fontes de preço reais (SerpApi/Kiwi/Travelpayouts/Amadeus) e o feed de blogs cobrem o mesmo objetivo (preço
   real + alerta rápido de promoção) sem esse risco.
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

**Você não precisa configurar tudo.** O feed de blogs de promoção já funciona sem nenhuma chave. Se quiser
detecção de erro de tarifa com preço real, basta **uma** das quatro fontes de dinheiro (SerpApi, Kiwi.com,
Travelpayouts ou Amadeus — esse último com o portal self-service sendo desativado em 17/07/2026, então priorize
os outros três) — não precisa de todas. Para alertas, e-mail ou Telegram costumam ser os mais rápidos de
configurar.

Acesse `http://localhost:3000` e depois `http://localhost:3000/settings.html` para colar suas chaves de API — cada
seção da tela de Configurações tem o passo a passo de onde conseguir a chave. Na própria tela principal, o painel
"Status das integrações" tem um botão "❓ como configurar" em cada item que expande o mesmo passo a passo sem
precisar sair da página — só cobre serviços com opção gratuita de verdade (SerpApi, Kiwi.com, Travelpayouts,
Amadeus, Brevo, CallMeBot, Telegram). Também dá pra usar variáveis de ambiente (`.env`, veja `.env.example`) se
preferir; o que estiver salvo na tela de Configurações tem prioridade.

> **Nota sobre esse passo a passo:** foi escrito com base no fluxo de cadastro mais recente que eu conhecia, mas
> não consegui abrir essas páginas ao vivo pra conferir durante o desenvolvimento (o ambiente onde este projeto
> foi construído bloqueia acesso a domínios externos fora de uma lista pequena). Se algum passo estiver
> desatualizado ou algum botão tiver mudado de lugar, me avise que corrijo na hora.

### Contas gratuitas para habilitar as integrações

| Recurso | Onde conseguir | Custo |
|---|---|---|
| Comparação em dinheiro real (Google Flights) | [serpapi.com](https://serpapi.com) | Grátis até 100 buscas/mês |
| Comparação em dinheiro real (agregador low-cost) | [tequila.kiwi.com](https://tequila.kiwi.com) | Grátis |
| Comparação em dinheiro real (cache recente) | [travelpayouts.com](https://www.travelpayouts.com) — geralmente sem telefone | Grátis |
| Comparação em dinheiro real (GDS) | [developers.amadeus.com](https://developers.amadeus.com) — ⚠️ self-service desativa em 17/07/2026 | Grátis (ambiente teste) |
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

## Estrutura

```
src/
  server.js          API Express + serve o frontend
  config.js            configurações salvas via tela de Configurações (data/settings.json) + fallback a .env
  db.js               storage em JSON (buscas + histórico de preços)
  scheduler.js         node-cron com os horários de busca
  airports.js           busca/proximidade de aeroportos
  geocode.js            geocodificação (Nominatim) para aeroportos mais próximos
  dealFeeds.js            lê RSS de blogs de promoção/milhas
  providers/            um adaptador por programa/fonte de dados
  search/
    runSearch.js        orquestra os provedores, grava histórico, dispara alertas
    anomaly.js           detecção de erro de tarifa / promoção relâmpago
    checkDealFeeds.js     casa posts de blog com buscas salvas, dispara alertas
    splitTicketCompare.js  compara ida-e-volta vs quebra de bilhete
  notify/
    email.js, whatsapp.js, telegram.js
public/
  index.html, app.js      formulário + dashboard
  settings.html, settings.js  tela de Configurações (chaves de API, e-mail, WhatsApp)
```

## Créditos de dados

A busca de aeroporto por cidade/país usa a base [OpenFlights Airports Database](https://openflights.org/data.html)
(`src/data/airports.json`, licença [ODbL](https://opendatacommons.org/licenses/odbl/)), com aliases de cidade/país
em português em `src/data/cityAliases.js` e `src/data/countryAliases.js`. Quando o local buscado não tem aeroporto
próprio, a geocodificação para sugerir os aeroportos mais próximos usa o [Nominatim/OpenStreetMap](https://nominatim.org)
(`src/geocode.js`) — © colaboradores do OpenStreetMap, uso gratuito respeitando o limite de ~1 requisição/segundo.
