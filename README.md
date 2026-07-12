# ✈️ Motor de Milhas

Motor de busca e monitoramento de passagens aéreas com milhas (American Airlines/AAdvantage, LATAM Pass, Smiles,
TudoAzul) e comparação com preços em dinheiro, com alertas automáticos por e-mail e WhatsApp.

## O que este projeto faz

- Formulário de busca: origem, destino, datas (+ flexibilidade em dias), **múltiplos** programas de milhas,
  stopover e hidden-city/skiplagged como filtros opcionais.
- Roda automaticamente todos os dias, em horários configuráveis (padrão: 06h, 13h, 21h + varredura a cada 2h
  para promoções relâmpago — ver raciocínio em `src/scheduler.js`).
- Detecta anomalias de preço (possíveis erros de tarifa) e novos mínimos históricos (possíveis promoções
  relâmpago) comparando cada oferta com o histórico da rota.
- Envia alertas por e-mail (qualquer SMTP) e WhatsApp (Twilio).

## O que este projeto **não** faz (e por quê)

1. **Não garante "a passagem mais barata possível".** Nenhuma ferramenta consegue prometer isso — disponibilidade
   de assentos-prêmio, câmbio e bloqueios antifraude dos sites estão fora de controle de qualquer software.
2. **Não faz scraping automático de AA.com, Latam, Smiles ou TudoAzul.** Nenhuma dessas empresas oferece API
   pública gratuita para busca de disponibilidade de prêmio, e fazer scraping do site de reservas geralmente
   viola os Termos de Uso (proteção antibot, rate limiting, risco de bloqueio de conta/IP). Os adaptadores em
   `src/providers/` ficam "pendentes de configuração" até você apontar `AA_PROVIDER_URL` / `LATAM_PROVIDER_URL` /
   `SMILES_PROVIDER_URL` / `AZUL_PROVIDER_URL` para uma integração própria (parceria oficial, GDS, ou um serviço
   de scraping que você mesmo administra e está autorizado a rodar). Sem isso, o app mostra um link para
   checagem manual no site oficial.
3. **Não automatiza a compra de tarifas com erro nem de passagens hidden-city.** O motor **detecta e avisa**
   quando encontra um preço muito abaixo do histórico (possível erro de tarifa) ou uma opção hidden-city — mas a
   decisão e a execução da compra são sempre manuais, porque:
   - Companhias podem cancelar tarifas com erro mesmo após a emissão (nos EUA, decisão do DOT de 2015 permite
     isso se comprovarem o erro; cerca de 10% das mistake fares são canceladas, geralmente em até 72h, com
     reembolso).
   - Hidden-city/skiplagged viola o contrato de transporte da maioria das companhias e pode levar a cancelamento
     do restante do itinerário ou bloqueio de conta de milhas/status.
4. **Comparação em dinheiro real via Amadeus, mas milhas via integração própria.** A API gratuita do Amadeus for
   Developers dá cash fares reais (bom para comparar com o custo em milhas), mas não cobre disponibilidade de
   prêmio das companhias citadas.

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
cp .env.example .env
# preencha as chaves que você já tiver (Amadeus, SMTP, Twilio) — o resto
# funciona com "pendente de configuração" até você configurar
npm start
```

Acesse `http://localhost:3000`.

### Contas gratuitas para habilitar as integrações

| Recurso | Onde conseguir | Custo |
|---|---|---|
| Comparação em dinheiro real | [developers.amadeus.com](https://developers.amadeus.com) | Grátis (ambiente teste) |
| E-mail | Brevo, Resend, ou Gmail (senha de app) | Grátis (limite diário/mensal) |
| WhatsApp | [Twilio WhatsApp Sandbox](https://www.twilio.com/docs/whatsapp/sandbox) | Grátis para testar, pago em produção |
| Milhas (AA/LATAM/Smiles/Azul) | Parceria oficial ou integração própria que você administre | Depende |

## Deploy no Render

Este repo já inclui `render.yaml`. Conecte o repositório em [render.com](https://render.com) e configure as
variáveis de ambiente marcadas como `sync: false` no painel. **Atenção:** o plano free do Render não tem disco
persistente — os dados em `./data` (buscas salvas e histórico) são perdidos a cada deploy/restart nesse plano.

## Estrutura

```
src/
  server.js          API Express + serve o frontend
  db.js               storage em JSON (buscas + histórico de preços)
  scheduler.js         node-cron com os horários de busca
  providers/            um adaptador por programa/fonte de dados
  search/
    runSearch.js        orquestra os provedores, grava histórico, dispara alertas
    anomaly.js           detecção de erro de tarifa / promoção relâmpago
  notify/
    email.js, whatsapp.js
public/               formulário + dashboard
```
