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
- Envia alertas por e-mail (qualquer SMTP) e WhatsApp (Twilio).

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
   **Alternativa sem API oficial da companhia:** os provedores `CASH_SERPAPI` e `CASH_KIWI` usam Google Flights
   (via [SerpApi](https://serpapi.com)) e [Kiwi.com](https://tequila.kiwi.com) — dois dos maiores agregadores de
   passagens da internet, que já cobrem AA, LATAM, Azul, GOL e centenas de outras companhias, sem que o motor
   precise falar diretamente com o site de cada uma. Somados ao Amadeus, são três fontes reais e independentes
   de preço em dinheiro rodando em toda busca — sem risco de bloqueio de conta.
3. **Não automatiza a compra de tarifas com erro nem de passagens hidden-city.** O motor **detecta e avisa**
   quando encontra um preço muito abaixo do histórico (possível erro de tarifa) ou uma opção hidden-city — mas a
   decisão e a execução da compra são sempre manuais, porque:
   - Companhias podem cancelar tarifas com erro mesmo após a emissão (nos EUA, decisão do DOT de 2015 permite
     isso se comprovarem o erro; cerca de 10% das mistake fares são canceladas, geralmente em até 72h, com
     reembolso).
   - Hidden-city/skiplagged viola o contrato de transporte da maioria das companhias e pode levar a cancelamento
     do restante do itinerário ou bloqueio de conta de milhas/status.
4. **Comparação em dinheiro real via Amadeus, SerpApi e Kiwi.com, mas milhas via integração própria.** Essas três
   fontes dão preços reais em dinheiro (bom para comparar com o custo em milhas e para alimentar o detector de
   anomalia), mas nenhuma cobre disponibilidade de assento-prêmio das companhias citadas — isso continua
   exigindo integração própria (item 2).
5. **Não vem com as chaves de API já preenchidas.** Amadeus, SerpApi, Kiwi.com, seu provedor de e-mail e o
   Twilio exigem uma conta pessoal (identidade, e-mail/telefone verificado, aceite dos termos de uso) — isso só
   quem vai usar o serviço pode criar, não pode ser feito por automação em nome de outra pessoa. O que este
   projeto faz para reduzir o trabalho ao mínimo é a tela **Configurações** (`/settings.html`): você cola cada
   chave direto pelo navegador, sem editar `.env` nem redeployar, com o passo a passo de cada cadastro na própria
   tela (leva uns 5 minutos por serviço).

## Estratégias de economia aplicadas

- Emissão híbrida (mixed cabin / companhias diferentes na ida e volta) — o app permite programas diferentes por
  busca para facilitar a comparação.
- Janela de compra: doméstico 30–60 dias, internacional 60–150 dias antes (documentar no seu processo de busca).
- Flexibilidade de datas (campo "± dias") — meio de semana costuma ser mais barato.
- Stopover como filtro (geralmente mais barato que voo direto).
- Alertas de queda de preço e de novos mínimos históricos (promoção relâmpago).

## Setup

```bash
npm install
npm start
```

Acesse `http://localhost:3000` e depois `http://localhost:3000/settings.html` para colar suas chaves de API — cada
seção da tela de Configurações tem o passo a passo de onde conseguir a chave. Também dá pra usar variáveis de
ambiente (`.env`, veja `.env.example`) se preferir; o que estiver salvo na tela de Configurações tem prioridade.

### Contas gratuitas para habilitar as integrações

| Recurso | Onde conseguir | Custo |
|---|---|---|
| Comparação em dinheiro real (GDS) | [developers.amadeus.com](https://developers.amadeus.com) | Grátis (ambiente teste) |
| Comparação em dinheiro real (Google Flights) | [serpapi.com](https://serpapi.com) | Grátis até 100 buscas/mês |
| Comparação em dinheiro real (agregador low-cost) | [tequila.kiwi.com](https://tequila.kiwi.com) | Grátis |
| E-mail | Brevo, Resend, ou Gmail (senha de app) | Grátis (limite diário/mensal) |
| WhatsApp | [Twilio WhatsApp Sandbox](https://www.twilio.com/docs/whatsapp/sandbox) | Grátis para testar, pago em produção |
| Milhas (AA/LATAM/Smiles/Azul) | Parceria oficial ou integração própria que você administre | Depende |

### E-mail e/ou WhatsApp — como escolher

Cada busca tem os dois campos (e-mail e WhatsApp) opcionais e independentes: preencha só o e-mail, só o WhatsApp,
ou os dois — o alerta é enviado para **todo canal que tiver um valor preenchido** naquela busca específica. Não
precisa de nenhuma opção extra de "canal preferido".

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
  providers/            um adaptador por programa/fonte de dados
  search/
    runSearch.js        orquestra os provedores, grava histórico, dispara alertas
    anomaly.js           detecção de erro de tarifa / promoção relâmpago
  notify/
    email.js, whatsapp.js
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
