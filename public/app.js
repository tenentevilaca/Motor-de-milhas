// app.js é compartilhado por todas as páginas (Buscar, Buscas ativas,
// Promoções, Configurações) — cada bloco abaixo só mexe em elementos que
// existem na página atual, então guardas com "if (el)" são necessárias.

document.querySelectorAll('.topnav-links a').forEach((a) => {
  if (a.dataset.page === document.body.dataset.page) a.classList.add('active');
});

const hiddenCityCheckbox = document.getElementById('allowHiddenCity');
const hiddenCityWarning = document.getElementById('hiddenCityWarning');
if (hiddenCityCheckbox) {
  hiddenCityCheckbox.addEventListener('change', () => {
    hiddenCityWarning.hidden = !hiddenCityCheckbox.checked;
  });
}

async function findTelegramChatId() {
  const el = document.getElementById('telegramChatIdResult');
  el.textContent = 'Buscando...';
  try {
    const chats = await api('/api/notify/telegram/chats');
    if (chats.length === 0) {
      el.textContent = 'Nenhuma conversa encontrada — mande uma mensagem pro seu bot no Telegram primeiro (ex: /start) e tente de novo.';
      return;
    }
    el.innerHTML = chats
      .map((c) => `<div>${c.name}: <b>${c.chatId}</b> <button type="button" class="secondary" style="padding:2px 8px; font-size:0.75rem;" onclick="document.getElementById('telegramChatId').value='${c.chatId}'">usar</button></div>`)
      .join('');
  } catch (err) {
    el.textContent = 'Erro: ' + err.message + ' (configure o bot nas Configurações primeiro)';
  }
}

// Título/resumo dos posts vêm de RSS de terceiros (blogs de milhas) — texto
// não confiável, nunca deve ir direto pro innerHTML sem escapar.
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function api(path, options) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
  return data;
}

// Continentes/regiões que podem ser escolhidos como destino (espelha
// src/data/continents.js) — usado só pra exibição no front, a validação de
// verdade é sempre feita no backend.
const REGION_LABELS = {
  SA: 'América do Sul',
  CA: 'América Central e Caribe',
  NA: 'América do Norte',
  EU: 'Europa',
  ME: 'Oriente Médio',
  AF: 'África',
  AS: 'Ásia',
  OC: 'Oceania',
};

function isRegionDestination(d) {
  return /^REGION:[A-Z]{2}$/.test(d || '');
}

function regionLabelFor(d) {
  const m = /^REGION:([A-Z]{2})$/.exec(d || '');
  return m ? REGION_LABELS[m[1]] || d : d;
}

// --- Combobox de aeroporto: digita cidade/país/código, escolhe da lista ---
// (allowRegions: também aceita digitar um continente, tipo "América do Sul",
// pra buscar o menor preço em qualquer hub daquela região — só faz sentido
// no campo de destino.)
function setupAirportCombobox({ queryInputId, hiddenInputId, listId, onSelect, allowRegions }) {
  const queryInput = document.getElementById(queryInputId);
  const hiddenInput = document.getElementById(hiddenInputId);
  const list = document.getElementById(listId);
  let debounceTimer = null;
  let activeIndex = -1;
  let currentOptions = [];

  function closeList() {
    list.classList.remove('open');
    list.innerHTML = '';
    activeIndex = -1;
  }

  function renderOptions({ airports, nearby, place }) {
    currentOptions = airports;
    if (airports.length === 0) {
      list.innerHTML = '<div class="combobox-empty">Nenhum aeroporto encontrado</div>';
      list.classList.add('open');
      return;
    }
    const header = nearby
      ? `<div class="combobox-empty">Sem aeroporto exato — mais próximos de ${place || 'onde você buscou'}:</div>`
      : '';
    list.innerHTML =
      header +
      airports
        .map((o, i) =>
          o.isRegion
            ? `<div class="combobox-option" data-index="${i}"><span class="iata">🌎</span><span class="place">${o.label_full}</span></div>`
            : `<div class="combobox-option" data-index="${i}"><span class="iata">${o.iata}</span><span class="place">${o.name} — ${o.city}, ${o.country}${o.distanceKm != null ? ` · ~${o.distanceKm} km` : ''}</span></div>`
        )
        .join('');
    list.classList.add('open');
    Array.from(list.querySelectorAll('.combobox-option')).forEach((el) => {
      el.addEventListener('click', () => selectOption(Number(el.dataset.index)));
    });
  }

  function selectOption(index) {
    const o = currentOptions[index];
    if (!o) return;
    if (o.isRegion) {
      hiddenInput.value = o.value;
      queryInput.value = `🌎 ${o.label}`;
    } else {
      hiddenInput.value = o.iata;
      queryInput.value = `${o.iata} — ${o.city}, ${o.country}`;
    }
    closeList();
    if (onSelect) onSelect();
  }

  queryInput.addEventListener('input', () => {
    hiddenInput.value = '';
    const q = queryInput.value.trim();
    clearTimeout(debounceTimer);
    if (q.length < 2) { closeList(); return; }
    debounceTimer = setTimeout(async () => {
      try {
        const options = await api(`/api/airports?q=${encodeURIComponent(q)}${allowRegions ? '&allowRegions=1' : ''}`);
        renderOptions(options);
      } catch {
        closeList();
      }
    }, 200);
  });

  queryInput.addEventListener('keydown', (e) => {
    const items = Array.from(list.children).filter((el) => el.classList.contains('combobox-option'));
    if (!list.classList.contains('open') || items.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, items.length - 1);
      items.forEach((el, i) => el.classList.toggle('active', i === activeIndex));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      items.forEach((el, i) => el.classList.toggle('active', i === activeIndex));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0) selectOption(activeIndex);
    } else if (e.key === 'Escape') {
      closeList();
    }
  });

  document.addEventListener('click', (e) => {
    if (!list.contains(e.target) && e.target !== queryInput) closeList();
  });
}

if (document.getElementById('originQuery')) {
  setupAirportCombobox({ queryInputId: 'originQuery', hiddenInputId: 'origin', listId: 'originList', onSelect: () => updateBestTimeCard() });
  setupAirportCombobox({
    queryInputId: 'destinationQuery',
    hiddenInputId: 'destination',
    listId: 'destinationList',
    allowRegions: true,
    onSelect: () => {
      updateBestTimeCard();
      toggleSplitTicketForRegion();
    },
  });
  document.getElementById('departDate').addEventListener('change', () => updateBestTimeCard());
  document.querySelectorAll('#programs input').forEach((el) => el.addEventListener('change', () => updateBestTimeCard()));
}

if (document.getElementById('passengers')) {
  document.getElementById('passengers').addEventListener('input', () => {
    document.getElementById('passengersNote').hidden = Number(document.getElementById('passengers').value) <= 1;
  });
}

// Quebra de bilhete compara ida/volta com dois trechos só de ida pra um
// destino específico — não existe "quebra de bilhete" pra uma região inteira.
function toggleSplitTicketForRegion() {
  const destination = document.getElementById('destination').value;
  const checkbox = document.getElementById('compareSplitTickets');
  const isRegion = isRegionDestination(destination);
  checkbox.disabled = isRegion;
  if (isRegion) checkbox.checked = false;
}


// "Opções avançadas" (stopover/quebra de bilhete/hidden-city) ficam
// recolhidas por padrão — são coisas que a maioria das buscas não precisa,
// e deixá-las sempre visíveis é o que tornava a página "Buscar" poluída.
function toggleAdvancedOptions() {
  const body = document.getElementById('advancedOptionsBody');
  body.hidden = !body.hidden;
}

// Seletor explícito "Somente ida" / "Ida e volta" — antes só existia um
// campo "Data de volta (opcional)", que passava despercebido pra quem queria
// escolher ida e volta. Escolher "Somente ida" limpa a data de volta pra não
// mandar sobra de um valor preenchido antes de trocar de opção.
function toggleTripType() {
  const isRoundTrip = document.querySelector('input[name="tripType"]:checked').value === 'roundtrip';
  const field = document.getElementById('returnDateField');
  field.hidden = !isRoundTrip;
  if (!isRoundTrip) document.getElementById('returnDate').value = '';
}

// Alterna entre "Data específica" (fluxo normal de busca salva/agendada) e
// "Mês inteiro" (consulta avulsa, só preço em dinheiro, não salva nada) —
// esconde o que não se aplica a cada modo pra não confundir (programas de
// milhas e alertas não existem no modo mês).
function toggleSearchMode() {
  const isMonth = document.querySelector('input[name="searchMode"]:checked').value === 'month';
  document.getElementById('specificDateFields').hidden = isMonth;
  document.getElementById('monthFields').hidden = !isMonth;
  document.getElementById('programsSection').hidden = isMonth;
  document.getElementById('alertsSection').hidden = isMonth;
  document.getElementById('createBtn').textContent = isMonth ? 'Comparar mês' : 'Buscar';
  document.getElementById('createStatus').textContent = isMonth
    ? 'Consulta avulsa (não salva, não agenda) — ~5 datas amostradas no mês.'
    : 'Cria a busca, roda na hora e mostra o resultado logo abaixo.';
}

function handleSearchSubmit() {
  const isMonth = document.querySelector('input[name="searchMode"]:checked').value === 'month';
  if (isMonth) return runMonthScan();
  return createSearch();
}

// Consulta avulsa (não é busca salva/agendada) — pega origem/destino já
// escolhidos acima e amostra ~5 datas espaçadas no mês (não os ~30 dias,
// pra não estourar a cota grátis das fontes de preço em dinheiro).
async function runMonthScan() {
  const status = document.getElementById('createStatus');
  const resultBlock = document.getElementById('searchResultBlock');
  const result = document.getElementById('searchResult');
  const origin = document.getElementById('origin').value;
  const destination = document.getElementById('destination').value;
  const yearMonth = document.getElementById('scanMonth').value;
  if (!origin || !destination) {
    status.textContent = 'Escolha origem e destino a partir da lista sugerida.';
    status.style.color = 'var(--danger-text)';
    return;
  }
  if (isRegionDestination(destination)) {
    status.textContent = 'Comparar mês não cobre destino em região — escolha um aeroporto específico.';
    status.style.color = 'var(--danger-text)';
    return;
  }
  if (!yearMonth) {
    status.textContent = 'Escolha um mês.';
    status.style.color = 'var(--danger-text)';
    return;
  }
  const includeMiles = document.getElementById('monthScanIncludeMiles').checked;
  status.textContent = `Consultando ~5 datas do mês${includeMiles ? ' (dinheiro + milhas)' : ' (só dinheiro)'}...`;
  status.style.color = 'var(--muted)';
  resultBlock.hidden = true;
  try {
    const params = new URLSearchParams({ origin, destination, yearMonth, includeMiles: includeMiles ? 'true' : 'false' });
    const data = await api(`/api/month-scan?${params}`);
    const rows = data.dates
      .map((d) => {
        const priceCell = d.priceBRL != null ? `${formatBRL(d.priceBRL)} <span class="status-line" style="margin:0;">(${d.cashProgram})</span>` : d.errorNote ? `<span title="${escapeHtml(d.errorNote)}">sem dado (erro na fonte ⚠️)</span>` : 'sem voo achado nessa data';
        const milesCell =
          d.milesRequired != null
            ? `${d.milesRequired.toLocaleString('pt-BR')} milhas${d.milesTaxesBRL ? ` + ${formatBRL(d.milesTaxesBRL)} taxas` : ''} <span class="status-line" style="margin:0;">(${d.milesProgram})</span>`
            : '-';
        return `<tr><td>${new Date(d.date + 'T00:00:00').toLocaleDateString('pt-BR')}</td><td>${priceCell}</td>${data.mode === 'full' ? `<td>${milesCell}</td>` : ''}</tr>`;
      })
      .join('');
    const allEmpty = data.dates.every((d) => d.priceBRL == null && d.milesRequired == null);
    result.innerHTML = `
      <table><tr><th>Data de ida</th><th>Menor preço (dinheiro)</th>${data.mode === 'full' ? '<th>Menor milhagem</th>' : ''}</tr>${rows}</table>
      <div class="status-line">Cada data é uma consulta independente e só ida (sem volta) — datas sem preço ou sem
      milhas podem ser porque a fonte genuinamente não achou voo pra aquele dia, ou (fontes pagas por uso) a cota
      grátis mensal estourou no meio da varredura. Passe o mouse em "erro na fonte" pra ver o motivo exato quando houver.
      ${data.mode === 'cash_only' ? 'Varredura só-dinheiro (milhas desmarcadas).' : ''}</div>
      ${
        allEmpty
          ? '<div class="warning">Nenhuma fonte (dinheiro ou milhas) achou valor pra nenhuma das datas — confira em Configurações se as chaves estão mesmo ativas (podem ter sido perdidas num redeploy, ver aviso no topo da tela de Configurações).</div>'
          : ''
      }`;
    resultBlock.hidden = false;
    status.textContent = 'Comparação de mês concluída.';
    status.style.color = '#16a34a';
  } catch (err) {
    status.textContent = 'Erro: ' + err.message;
    status.style.color = 'var(--danger-text)';
  }
}

async function updateBestTimeCard() {
  const origin = document.getElementById('origin').value;
  const destination = document.getElementById('destination').value;
  const card = document.getElementById('bestTimeCard');
  if (!origin || !destination) {
    card.hidden = true;
    return;
  }
  const departDate = document.getElementById('departDate').value;
  card.hidden = false;
  const body = document.getElementById('bestTimeBody');
  body.textContent = 'Calculando...';
  try {
    const params = new URLSearchParams({ origin, destination });
    if (departDate) params.set('departDate', departDate);
    const selectedPrograms = Array.from(document.querySelectorAll('#programs input:checked')).map((i) => i.value);
    if (selectedPrograms.length === 1) params.set('program', selectedPrograms[0]);
    const advice = await api(`/api/best-time?${params}`);
    const statusColor = { ideal: '#16a34a', urgent: '#16a34a', late: '#c2410c', early: 'var(--muted)', no_date: 'var(--muted)', past: 'var(--danger-text)' };
    const historicalHtml = advice.historical?.available
      ? `<div class="status-line"><b>Com base no seu próprio histórico:</b> meses mais baratos observados nessa rota: ${advice.historical.cheapestMonths
          .map((m) => `${m.monthName} (${formatBRL(m.avgPriceBRL)} em média, ${m.samples} amostra(s))`)
          .join(', ')}.</div>${
          advice.historical.cheapestWeekdays?.length > 0
            ? `<div class="status-line"><b>Melhores dias da semana pra voar:</b> ${advice.historical.cheapestWeekdays
                .map((d) => `${d.weekdayName} (${formatBRL(d.avgPriceBRL)} em média, ${d.samples} amostra(s))`)
                .join(', ')}.</div>`
            : ''
        }`
      : `<div class="status-line">Ainda sem histórico próprio suficiente nessa rota (precisa de pelo menos ${advice.historical?.samplesNeeded ?? 3} checagens) — vai aparecer aqui conforme o motor for rodando.</div>`;
    const trendHtml = advice.trend
      ? `<div class="status-line" style="margin-top:8px;"><b>Tendência recente:</b> ${advice.trend.message}</div>${sparklineHtml(advice.trend.prices)}`
      : '';
    const verdictColor = { buy_now: '#16a34a', wait: '#c2410c', monitor: 'var(--muted)' };
    const verdictHtml = advice.verdict
      ? `<div style="font-size:1.05em;font-weight:600;color:${verdictColor[advice.verdict.action] || 'inherit'};margin-bottom:6px;">${advice.verdict.label}
        <span style="font-weight:400;font-size:0.85em;color:var(--muted);display:block;">${advice.verdict.message}</span></div>`
      : '';
    body.innerHTML = `
      ${verdictHtml}
      <div style="color:${statusColor[advice.buyingWindow.status] || 'inherit'};"><b>Quando comprar:</b> ${advice.buyingWindow.message}</div>
      <div class="status-line" style="margin-top:8px;"><b>Época mais cara pra viajar essa rota:</b> ${advice.seasonal.highSeasonMonths.join(', ')}.
      <b>Mais barata costuma ser:</b> ${advice.seasonal.lowSeasonMonths.join(', ')}. ${advice.seasonal.note}</div>
      ${historicalHtml}
      ${trendHtml}
    `;
  } catch (err) {
    body.textContent = 'Erro ao calcular: ' + err.message;
  }
}

// Passo a passo de cadastro — só serviços com opção gratuita. Baseado no
// fluxo mais recente que conheço; não consegui testar ao vivo nesta sessão
// (esta sandbox de desenvolvimento bloqueia acesso a esses domínios). Se
// algum passo estiver desatualizado, me avise que corrijo na hora.
const INTEGRATION_GUIDES = {
  CASH_TRAVELPAYOUTS: {
    title: 'Travelpayouts (grátis, sem telefone)',
    steps: [
      'Acesse <a href="https://www.travelpayouts.com" target="_blank" rel="noopener">travelpayouts.com</a> e crie a conta (geralmente só e-mail).',
      'No painel, vá na seção "API" e gere um token.',
      'Cole na tela de Configurações, seção 1.',
    ],
  },
  CASH_RAPIDAPI_GFLIGHTS: {
    title: 'Google Flights Live API via RapidAPI (busca ao vivo, paga por uso)',
    steps: [
      'Acesse <a href="https://rapidapi.com/auth/sign-up" target="_blank" rel="noopener">rapidapi.com/auth/sign-up</a> e crie a conta (e-mail ou Google/GitHub, sem telefone).',
      'Procure por "Google Flights Live API" e clique em "Subscribe to Test" (tem um plano com cota grátis mensal, depois é pago por uso).',
      'Na aba "Endpoints" da API, copie o valor de "X-RapidAPI-Key" (é o mesmo pra qualquer API que você assinar no RapidAPI).',
      'Cole na tela de Configurações, seção 1 — e ajuste o câmbio USD→BRL aproximado ali do lado, se quiser.',
    ],
  },
  EMAIL: {
    title: 'Brevo — SMTP grátis (300 e-mails/dia)',
    steps: [
      'Acesse <a href="https://app.brevo.com/account/register" target="_blank" rel="noopener">app.brevo.com/account/register</a> e crie a conta.',
      'Confirme seu e-mail.',
      'No painel, vá em "SMTP & API" → aba "SMTP".',
      'Copie host (smtp-relay.brevo.com), porta (587), login e a "senha SMTP" gerada ali (não é a senha da sua conta).',
      'Cole tudo na tela de Configurações, seção 2.',
    ],
  },
  WHATSAPP: {
    title: 'CallMeBot — WhatsApp sem cadastro em site nenhum',
    steps: [
      'Salve o número <b>+34 644 59 71 67</b> nos contatos do seu WhatsApp.',
      'Mande a mensagem <code>I allow callmebot to send me messages</code> pra esse número.',
      'Em poucos segundos você recebe de volta uma mensagem com sua API key.',
      'Cole na tela de Configurações, seção 3.',
    ],
  },
  TELEGRAM: {
    title: 'Telegram — provavelmente o mais fácil de todos',
    steps: [
      'Abra uma conversa com <a href="https://t.me/BotFather" target="_blank" rel="noopener">@BotFather</a> no Telegram.',
      'Mande <code>/newbot</code> e siga as instruções (nome + username do bot).',
      'Copie o token que ele devolve e cole na tela de Configurações, seção 3c.',
      'Mande uma mensagem qualquer pro seu bot recém-criado (ex: <code>/start</code>).',
      'Volte no formulário principal, campo Telegram, e clique em "Descobrir meu Chat ID".',
    ],
  },
  AA: { title: 'American Airlines', noApi: true },
  LATAM: { title: 'LATAM Pass', noApi: true },
  SMILES: { title: 'Smiles', noApi: true },
  AZUL: { title: 'TudoAzul', noApi: true },
};

function guideHtml(id) {
  const guide = INTEGRATION_GUIDES[id];
  if (!guide) return '';
  if (guide.noApi) {
    return `<div class="guide-panel" id="guide-${id}" hidden>
      <b>${guide.title}</b>
      <p>Nenhuma API pública gratuita existe pra isso hoje — nenhum parceiro autorizado oferece acesso a pessoa
      física. Só ativa se você tiver uma integração própria (parceria oficial ou serviço que você administre),
      configurável na tela de Configurações, seção 4.</p>
    </div>`;
  }
  return `<div class="guide-panel" id="guide-${id}" hidden>
    <b>${guide.title}</b>
    ${guide.warning ? `<div class="warning" style="margin:8px 0;">${guide.warning}</div>` : ''}
    <ol>${guide.steps.map((s) => `<li>${s}</li>`).join('')}</ol>
  </div>`;
}

function toggleGuide(id) {
  const panel = document.getElementById(`guide-${id}`);
  if (panel) panel.hidden = !panel.hidden;
}

function badgeRow(id, label, enabledFlag, note) {
  const hasGuide = Boolean(INTEGRATION_GUIDES[id]);
  return `<div>${label}: <span class="badge ${enabledFlag ? 'ok' : 'pending'}">${
    enabledFlag ? 'ativo' : 'pendente de configuração'
  }</span>${
    hasGuide ? ` <button type="button" class="guide-toggle" title="Ver passo a passo" onclick="toggleGuide('${id}')">❓ como configurar</button>` : ''
  }${note ? `<div class="status-line">${note}</div>` : ''}${guideHtml(id)}</div>`;
}

function toggleIntegrationsCard() {
  const body = document.getElementById('integrationsBody');
  const icon = document.getElementById('integrationsToggleIcon');
  body.hidden = !body.hidden;
  icon.classList.toggle('open', !body.hidden);
}

async function loadProviderStatus() {
  const el = document.getElementById('providerStatus');
  try {
    const { priceProviders, notificationChannels } = await api('/api/providers');
    el.innerHTML =
      '<b class="section-label">Fontes de preço</b>' +
      priceProviders.map((p) => badgeRow(p.id, p.label, p.enabled)).join('') +
      '<b class="section-label">Notificações</b>' +
      notificationChannels.map((n) => badgeRow(n.id, n.label, n.enabled, n.note)).join('');
  } catch (err) {
    el.textContent = 'Erro ao carregar: ' + err.message;
  }
}

async function loadSchedulerStatus() {
  const el = document.getElementById('schedulerStatus');
  try {
    const s = await api('/api/scheduler/status');
    if (!s.enabled) {
      el.innerHTML = '<div class="status-line">Agendador desabilitado neste ambiente (DISABLE_SCHEDULER=true).</div>';
      return;
    }
    const fmt = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR') : 'ainda não rodou nesta sessão');
    el.innerHTML = `
      <div>Busca completa (${s.main.cron}) · fuso ${s.timezone}</div>
      <div class="status-line">Última execução: ${fmt(s.main.lastRunAt)}${s.main.lastSearchCount != null ? ` (${s.main.lastSearchCount} busca(s))` : ''} · Próxima: ${fmt(s.main.nextRunAt)}</div>
      <div style="margin-top:10px;">Varredura de promoção relâmpago (${s.flashSale.cron})</div>
      <div class="status-line">Última execução: ${fmt(s.flashSale.lastRunAt)}${s.flashSale.lastSearchCount != null ? ` (${s.flashSale.lastSearchCount} busca(s))` : ''} · Próxima: ${fmt(s.flashSale.nextRunAt)}</div>
      <div style="margin-top:10px;">Feed de promoções (${s.dealFeed.cron})</div>
      <div class="status-line">Última execução: ${fmt(s.dealFeed.lastRunAt)}${s.dealFeed.lastResult ? ` (${s.dealFeed.lastResult.newPosts} post(s) novo(s))` : ''} · Próxima: ${fmt(s.dealFeed.nextRunAt)}</div>
    `;
  } catch (err) {
    el.textContent = 'Erro ao carregar: ' + err.message;
  }
}

// Uma cor de header por fonte de blog, escolhida de forma determinística
// (hash simples do nome) — assim funciona mesmo se o usuário trocar
// DEAL_FEED_URLS por blogs próprios, sem precisar mapear cada nome à mão.
const PROMO_CARD_COLORS = ['#0284c7', '#7c3aed', '#be123c', '#0f766e', '#c2410c', '#4338ca'];
function colorForSource(source) {
  let hash = 0;
  for (let i = 0; i < source.length; i++) hash = (hash * 31 + source.charCodeAt(i)) >>> 0;
  return PROMO_CARD_COLORS[hash % PROMO_CARD_COLORS.length];
}

let dealFeedPosts = [];
let dealFeedActiveFilter = 'Todos';
const RELATED_FILTER = 'Relacionado às minhas buscas';

async function loadDealFeed() {
  const el = document.getElementById('dealFeedList');
  const toolbar = document.getElementById('promoToolbar');
  el.textContent = 'Carregando...';
  toolbar.hidden = true;
  try {
    const { posts, hasActiveSearches } = await api('/api/deal-feed/latest');
    dealFeedPosts = posts;
    dealFeedActiveFilter = 'Todos';

    if (posts.length === 0) {
      el.innerHTML = '<p class="status-line">Nenhum post encontrado agora (feeds podem estar indisponíveis) — tenta "Atualizar" de novo em alguns minutos.</p>';
      return;
    }

    toolbar.hidden = false;
    document.getElementById('promoSearch').value = '';
    const sources = ['Todos', ...(hasActiveSearches ? [RELATED_FILTER] : []), ...new Set(posts.map((p) => p.source))];
    document.getElementById('promoFilters').innerHTML = sources
      .map((s) => `<button type="button" class="pill${s === 'Todos' ? ' active' : ''}" onclick="setDealFeedFilter('${s.replace(/'/g, "\\'")}')">${escapeHtml(s)}</button>`)
      .join('');
    renderDealFeed();
  } catch (err) {
    el.textContent = 'Erro ao carregar: ' + err.message;
  }
}

function setDealFeedFilter(source) {
  dealFeedActiveFilter = source;
  document.querySelectorAll('#promoFilters .pill').forEach((btn) => btn.classList.toggle('active', btn.textContent === source));
  renderDealFeed();
}

function renderDealFeed() {
  const el = document.getElementById('dealFeedList');
  const query = document.getElementById('promoSearch').value.trim().toLowerCase();
  const filtered = dealFeedPosts.filter((p) => {
    if (dealFeedActiveFilter === RELATED_FILTER && !p.related) return false;
    if (dealFeedActiveFilter !== 'Todos' && dealFeedActiveFilter !== RELATED_FILTER && p.source !== dealFeedActiveFilter) return false;
    if (query && !`${p.title} ${p.summary || ''}`.toLowerCase().includes(query)) return false;
    return true;
  });

  if (filtered.length === 0) {
    el.innerHTML = '<p class="status-line">Nenhuma promoção bate com esse filtro/busca.</p>';
    return;
  }

  el.innerHTML = filtered
    .map(
      (p) => `
    <div class="promo-card">
      <div class="promo-card-header" style="background:${colorForSource(p.source)};">${escapeHtml(p.source)}</div>
      <div class="promo-card-body">
        ${p.related ? '<span class="promo-card-related">🔗 combina com sua busca</span>' : ''}
        <a class="promo-card-title" href="${escapeHtml(p.link)}" target="_blank" rel="noopener">${escapeHtml(p.title)}</a>
        ${p.summary ? `<p class="promo-card-summary">${escapeHtml(p.summary)}</p>` : ''}
        <div class="promo-card-footer">
          <span>${p.publishedAt ? new Date(p.publishedAt).toLocaleDateString('pt-BR') : ''}</span>
          <a href="${escapeHtml(p.link)}" target="_blank" rel="noopener">Ver promoção ↗</a>
        </div>
      </div>
    </div>`
    )
    .join('');
}

function formatBRL(v) {
  if (v == null) return '-';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Mini gráfico (SVG, sem lib externa) das últimas checagens de preço — dá
// forma visual à tendência (alta/queda/estável) em vez de só texto.
function sparklineHtml(prices) {
  if (!Array.isArray(prices) || prices.length < 2) return '';
  const w = 160;
  const h = 36;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const points = prices
    .map((p, i) => {
      const x = (i / (prices.length - 1)) * w;
      const y = h - ((p - min) / range) * (h - 6) - 3;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const lastUp = prices[prices.length - 1] >= prices[0];
  const strokeColor = lastUp ? '#c2410c' : '#16a34a';
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block;margin-top:4px;">
    <polyline points="${points}" fill="none" stroke="${strokeColor}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
  </svg>`;
}

// Links diretos pros maiores buscadores, prontos com origem/destino/data —
// funcionam sem nenhuma API configurada, então dão valor imediato mesmo
// antes (ou sem nunca) configurar Travelpayouts/Google Flights/Smiles/Azul.
function buildManualLinks(s) {
  const o = s.origin;
  const d = s.destination;

  // Destino = região: os buscadores não têm uma URL pronta pra "qualquer
  // lugar no continente X" com origem/data preenchidas — usa busca em texto
  // livre do Google Flights, que entende o continente pelo nome.
  if (isRegionDestination(d)) {
    const label = regionLabelFor(d);
    const gfQuery = `Flights from ${o} to ${label}` + (s.departDate ? ` on ${s.departDate}` : '') + (s.returnDate ? ` through ${s.returnDate}` : '');
    return [{ label: 'Google Flights (explorar região)', url: `https://www.google.com/travel/flights?q=${encodeURIComponent(gfQuery)}` }];
  }

  const toSkyDate = (iso) => iso.replace(/-/g, '').slice(2); // "2026-09-10" -> "260910"

  const links = [];
  if (s.departDate) {
    const gfQuery = `Flights from ${o} to ${d} on ${s.departDate}` + (s.returnDate ? ` through ${s.returnDate}` : '');
    links.push({ label: 'Google Flights', url: `https://www.google.com/travel/flights?q=${encodeURIComponent(gfQuery)}` });

    const skyPath = s.returnDate
      ? `${o}/${d}/${toSkyDate(s.departDate)}/${toSkyDate(s.returnDate)}/`
      : `${o}/${d}/${toSkyDate(s.departDate)}/`;
    links.push({ label: 'Skyscanner', url: `https://www.skyscanner.net/transport/flights/${skyPath.toLowerCase()}` });

    const kayakPath = s.returnDate ? `${o}-${d}/${s.departDate}/${s.returnDate}` : `${o}-${d}/${s.departDate}`;
    links.push({ label: 'Kayak', url: `https://www.kayak.com/flights/${kayakPath}` });
  } else {
    links.push({ label: 'Google Flights', url: `https://www.google.com/travel/flights?q=${encodeURIComponent(`Flights from ${o} to ${d}`)}` });
    links.push({ label: 'Skyscanner', url: `https://www.skyscanner.net/transport/flights/${o.toLowerCase()}/${d.toLowerCase()}/` });
    links.push({ label: 'Kayak', url: `https://www.kayak.com/flights/${o}-${d}` });
  }
  return links;
}

async function loadSearches() {
  const el = document.getElementById('searchList');
  try {
    const dashboardData = await api('/api/dashboard');
    if (dashboardData.length === 0) {
      el.innerHTML = '<p class="status-line">Nenhuma busca criada ainda.</p>';
      return;
    }
    el.innerHTML = dashboardData
      .map(
        (d) => `
      <div class="search-item">
        <div class="dashboard-header">
          <span class="route">${d.origin} → ${isRegionDestination(d.destination) ? '🌎 ' + regionLabelFor(d.destination) : d.destination}</span>
          ${d.departDate ? ' · ida ' + d.departDate : ''}${d.returnDate ? ' · volta ' + d.returnDate : ''}
          ${d.isAnomaly ? '<span class="status-line" style="color: var(--danger-text); font-weight: bold;">⚠️ Queda suspeita</span>' : ''}
        </div>
        <div class="status-line">
          Programas: ${(d.programs || []).join(', ') || '-'} · Stopover: ${d.allowStopover ? 'sim' : 'não'} ·
          Hidden-city: ${d.allowHiddenCity ? 'sim' : 'não'}
        </div>
        <div class="dashboard-content">
          <div class="price-info">
            <div class="last-price">${d.lastPrice != null ? `Último preço: ${formatBRL(d.lastPrice)}` : 'Sem preço registrado'}</div>
            ${d.targetPrice != null ? `<div class="target-price">Alvo: ${formatBRL(d.targetPrice)} ${d.isBelowTarget ? '<span>(✅ Alcançado!)</span>' : ''}</div>` : ''}
          </div>
        </div>
        <div class="status-line" id="meta-${d.id}">Última checagem: ${d.lastCheckedAt ? new Date(d.lastCheckedAt).toLocaleString('pt-BR') : 'nunca'}</div>
        <div class="status-line">Conferir agora, sem esperar nenhuma API: ${buildManualLinks(d)
          .map((l) => `<a href="${l.url}" target="_blank" rel="noopener">${l.label}</a>`)
          .join(' · ')}</div>
        <div class="actions">
          <button onclick="runNow('${d.id}')">Rodar agora</button>
          <button class="secondary" onclick="viewHistory('${d.id}')">Ver histórico</button>
          <button class="secondary" onclick="exportHistory('${d.id}')">Exportar CSV</button>
          <button class="danger" onclick="removeSearch('${d.id}')">Excluir</button>
        </div>
        <div id="result-${d.id}"></div>
      </div>`
      )
      .join('');
  } catch (err) {
    el.textContent = 'Erro ao carregar: ' + err.message;
  }
}

function exportHistory(id) {
  window.open(`/api/searches/${id}/export`, '_blank');
}

async function createSearch() {
  const status = document.getElementById('createStatus');
  const origin = document.getElementById('origin').value;
  const destination = document.getElementById('destination').value;
  if (!origin || !destination) {
    status.textContent = 'Escolha origem e destino a partir da lista sugerida.';
    status.style.color = 'var(--danger-text)';
    return;
  }
  if (!document.getElementById('departDate').value) {
    status.textContent = 'Escolha uma data de ida — sem data, as fontes de preço em dinheiro não têm o que consultar.';
    status.style.color = 'var(--danger-text)';
    return;
  }
  const programs = Array.from(document.querySelectorAll('#programs input:checked')).map((i) => i.value);
  const body = {
    origin,
    destination,
    departDate: document.getElementById('departDate').value || null,
    returnDate: document.getElementById('returnDate').value || null,
    flexDays: document.getElementById('flexDays').value,
    passengers: document.getElementById('passengers').value || 1,
    targetPrice: document.getElementById('targetPrice').value || null,
    programs,
    allowStopover: document.getElementById('allowStopover').checked,
    compareSplitTickets: document.getElementById('compareSplitTickets').checked,
    allowHiddenCity: hiddenCityCheckbox.checked,
    hiddenCityRiskAcknowledged: document.getElementById('hiddenCityAck').checked,
    email: document.getElementById('email').value.trim() || null,
    whatsapp: document.getElementById('whatsapp').value.trim() || null,
    telegramChatId: document.getElementById('telegramChatId').value.trim() || null,
  };
  try {
    const created = await api('/api/searches', { method: 'POST', body: JSON.stringify(body) });
    status.textContent = 'Busca criada — rodando agora...';
    status.style.color = '#16a34a';
    const resultBlock = document.getElementById('searchResultBlock');
    if (resultBlock) {
      resultBlock.hidden = false;
      await runNow(created.id, 'searchResult', null);
      status.textContent = 'Busca criada e resultado abaixo. Ela também fica salva em "Buscas ativas" pra rodar de novo depois.';
    }
  } catch (err) {
    status.textContent = 'Erro: ' + err.message;
    status.style.color = 'var(--danger-text)';
  }
}

function dealFeedMatchesHtml(result) {
  if (!result.dealFeedMatches || result.dealFeedMatches.length === 0) return '';
  return `
    <div class="best-deal" style="background:#fef9c3; border-color:#fde047; color:#713f12;">
      📰 <b>${result.dealFeedMatches.length} post(s) de blog de promoção mencionando essa rota agora:</b>
      <ul style="margin:6px 0 0; padding-left:20px;">
        ${result.dealFeedMatches
          .map((p) => `<li><a href="${escapeHtml(p.link)}" target="_blank" rel="noopener">${escapeHtml(p.title)}</a> — ${escapeHtml(p.source)}</li>`)
          .join('')}
      </ul>
    </div>`;
}

// Calculadora "milhas ou dinheiro?" embutida no próprio resultado da busca:
// já vem preenchida com o preço em dinheiro (e milhas, se algum provedor de
// milhas retornou) que a busca encontrou — o usuário só completa o que a
// gente não tem como saber sozinho (quanto custam 1.000 milhas pra ele hoje).
function arbitrageBlockHtml(id, bestDeal) {
  if (!bestDeal) return '';
  const cashValue = bestDeal.priceBRL != null ? bestDeal.priceBRL : '';
  const milesValue = bestDeal.milesRequired != null ? bestDeal.milesRequired : '';
  return `
    <div class="arb-inline">
      <b>💱 Vale mais pagar em dinheiro ou usar milhas?</b>
      <div class="row">
        <div class="field"><label for="arbCash-${id}">Preço em dinheiro encontrado (R$)</label>
          <input type="number" id="arbCash-${id}" value="${cashValue}" oninput="calcArbInline('${id}')" /></div>
        <div class="field"><label for="arbMiles-${id}">Milhas necessárias</label>
          <input type="number" id="arbMiles-${id}" value="${milesValue}" placeholder="ex: 45000" oninput="calcArbInline('${id}')" /></div>
      </div>
      <div class="row">
        <div class="field"><label for="arbCost-${id}">Custo de 1.000 milhas hoje (R$)</label>
          <input type="number" id="arbCost-${id}" placeholder="18" oninput="calcArbInline('${id}')" /></div>
        <div class="field"><label for="arbBonus-${id}">Bônus de transferência (%, opcional)</label>
          <input type="number" id="arbBonus-${id}" placeholder="0" oninput="calcArbInline('${id}')" /></div>
      </div>
      <div class="arbitrage-result neutral" id="arbResult-${id}">Preencha "milhas necessárias" e "custo de 1.000 milhas" pra ver a comparação.</div>
    </div>`;
}

function calcArbInline(id) {
  const el = document.getElementById(`arbResult-${id}`);
  const cashPrice = Number(document.getElementById(`arbCash-${id}`).value);
  const milesNeeded = Number(document.getElementById(`arbMiles-${id}`).value);
  const costPer1000 = Number(document.getElementById(`arbCost-${id}`).value);
  const bonusPct = Number(document.getElementById(`arbBonus-${id}`).value || 0);

  if (!cashPrice || !milesNeeded || !costPer1000) {
    el.className = 'arbitrage-result neutral';
    el.textContent = 'Preencha "milhas necessárias" e "custo de 1.000 milhas" pra ver a comparação.';
    return;
  }

  const effectiveCostPer1000 = costPer1000 / (1 + bonusPct / 100);
  const milesCostBRL = (milesNeeded / 1000) * effectiveCostPer1000;
  const diff = cashPrice - milesCostBRL;

  if (Math.abs(diff) < 1) {
    el.className = 'arbitrage-result neutral';
    el.textContent = `Empate técnico: dinheiro (${formatBRL(cashPrice)}) e milhas (equivalente a ${formatBRL(milesCostBRL)}) saem no mesmo preço.`;
    return;
  }
  if (diff > 0) {
    el.className = 'arbitrage-result miles';
    el.innerHTML = `<b>Vale mais usar milhas.</b> ${milesNeeded.toLocaleString('pt-BR')} milhas custam o equivalente a ${formatBRL(milesCostBRL)} — ${formatBRL(diff)} mais barato que os ${formatBRL(cashPrice)} em dinheiro.`;
    return;
  }
  el.className = 'arbitrage-result cash';
  el.innerHTML = `<b>Vale mais pagar em dinheiro.</b> As ${milesNeeded.toLocaleString('pt-BR')} milhas equivaleriam a ${formatBRL(milesCostBRL)} — ${formatBRL(-diff)} mais caro que o preço em dinheiro de ${formatBRL(cashPrice)}.`;
}

async function runNow(id, resultElId, metaElId) {
  const el = document.getElementById(resultElId || `result-${id}`);
  const meta = metaElId === null ? null : document.getElementById(metaElId || `meta-${id}`);
  el.innerHTML = '<div class="status-line">Buscando nas fontes configuradas e nos blogs de promoção…</div>';
  try {
    const result = await api(`/api/searches/${id}/run`, { method: 'POST' });
    const sorted = result.allOffersSorted || [];
    const showDestinationColumn = sorted.some((o) => o.destination) && new Set(sorted.map((o) => o.destination)).size > 1;
    // Com "Flexibilidade (± dias)" a busca testa várias datas de uma vez só
    // e mistura tudo no mesmo resultado — sem essa coluna não dá pra saber
    // a qual data cada oferta pertence (mais de 1 data de ida OU de volta
    // distinta = mostra a coluna; flexDays pode variar só a volta quando a
    // ida já está fixa, e nesse caso só olhar departDate escondia a coluna).
    const showDateColumn =
      new Set(sorted.map((o) => o.departDate).filter(Boolean)).size > 1 ||
      new Set(sorted.map((o) => o.returnDate).filter(Boolean)).size > 1;
    // Nem toda fonte devolve número de voo/horário/duração/veredito milhas x
    // dinheiro (ex: provider custom via URL própria pode não mandar nada
    // disso) — cada coluna extra só aparece se pelo menos uma oferta tiver.
    const showFlightColumn = sorted.some((o) => o.flightNumber);
    const showTimeColumn = sorted.some((o) => o.departureTime || o.arrivalTime);
    const showDurationColumn = sorted.some((o) => o.durationLabel);
    const showArbitrageColumn = sorted.some((o) => o.arbitrage);
    const columnCount =
      4 +
      (showDestinationColumn ? 1 : 0) +
      (showDateColumn ? 1 : 0) +
      (showArbitrageColumn ? 1 : 0) +
      (showFlightColumn ? 1 : 0) +
      (showTimeColumn ? 1 : 0) +
      (showDurationColumn ? 1 : 0);

    function formatDateBR(iso) {
      if (!iso) return '-';
      return new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR');
    }

    function arbitrageCellHtml(o) {
      if (!showArbitrageColumn) return '';
      if (!Number.isFinite(o.milesRequired)) return '<td>-</td>'; // oferta em dinheiro — não se compara com ela mesma
      if (!o.arbitrage) {
        return '<td title="Nenhuma fonte em dinheiro achou preço pra esse destino nessa busca — sem referência pra comparar.">sem ref. em R$</td>';
      }
      const better = o.arbitrage.verdict === 'miles_better';
      const label = better ? '🎫 Milhas' : '💰 Dinheiro';
      const title = `Milhas: ${formatBRL(o.arbitrage.milesCostBRL)} (a R$${o.arbitrage.milesValuePer1000}/1000 milhas, sua estimativa) vs. dinheiro: ${formatBRL(
        o.arbitrage.cashReferenceBRL
      )}`;
      return `<td title="${escapeHtml(title)}">${label}</td>`;
    }

    function stopsCellHtml(o) {
      if (o.stops === 0) return 'direto';
      const where = (o.stopLocations || []).filter(Boolean).join(', ');
      return `${o.stops} parada(s)${where ? ` (${escapeHtml(where)})` : ''}`;
    }

    const rows = sorted
      .map((o, i) => {
        // Clica no programa pra ver a oferta: link direto quando a fonte
        // fornece (ex: Azul via Apify), senão cai pro site da companhia.
        const link = o.deepLink || o.manualCheckUrl;
        const programLabel = link
          ? `<a href="${escapeHtml(link)}" target="_blank" rel="noopener">${escapeHtml(o.program)}</a>`
          : escapeHtml(o.program);
        // Parceiras que aceitam essa milhagem, quando a fonte informa (nem
        // toda fonte tem esse dado — ver providers/index.js).
        const partnersLine =
          o.partnerAirlines && o.partnerAirlines.length > 0
            ? `<div class="status-line" style="margin:2px 0 0;">Aceita em: ${escapeHtml(o.partnerAirlines.join(', '))}</div>`
            : '';
        const programCell = `<td>${i === 0 ? '🏆 ' : ''}${programLabel}${partnersLine}</td>`;
        const destinationCell = showDestinationColumn ? `<td>${escapeHtml(o.destinationLabel || o.destination || '-')}</td>` : '';
        const dateCell = showDateColumn
          ? `<td>${formatDateBR(o.departDate)}${o.returnDate ? ` → ${formatDateBR(o.returnDate)}` : ''}</td>`
          : '';
        const flightCell = showFlightColumn ? `<td>${o.flightNumber ? escapeHtml(o.flightNumber) : '-'}</td>` : '';
        const timeCell = showTimeColumn
          ? `<td>${o.departureTime && o.arrivalTime ? `${o.departureTime}–${o.arrivalTime}` : '-'}</td>`
          : '';
        const durationCell = showDurationColumn ? `<td>${o.durationLabel ? escapeHtml(o.durationLabel) : '-'}</td>` : '';
        const priceCell = o.priceBRLTotal != null
          ? `<td>${formatBRL(o.priceBRL)} <span class="status-line" style="margin:0;" title="Estimativa: preço por pessoa × ${result.passengers} passageiros">(${formatBRL(o.priceBRLTotal)} total)</span></td>`
          : `<td>${formatBRL(o.priceBRL)}</td>`;
        const milesCell = o.milesRequiredTotal != null
          ? `<td>${o.milesRequired.toLocaleString('pt-BR')} <span class="status-line" style="margin:0;" title="Estimativa: milhas por pessoa × ${result.passengers} passageiros">(${o.milesRequiredTotal.toLocaleString('pt-BR')} total)</span></td>`
          : `<td>${o.milesRequired ?? '-'}</td>`;
        return `<tr${i === 0 ? ' style="font-weight:600;"' : ''}>${programCell}${destinationCell}${dateCell}${priceCell}${milesCell}${arbitrageCellHtml(o)}<td>${stopsCellHtml(o)}</td>${flightCell}${timeCell}${durationCell}</tr>`;
      })
      .join('');
    // Busca por região consulta os mesmos provedores em vários hubs — deduplica
    // por programId aqui pra não repetir "CASH_TRAVELPAYOUTS, CASH_TRAVELPAYOUTS, ..." N vezes.
    const pending = [...new Map(result.providerResults.filter((r) => r.status === 'not_configured').map((r) => [r.programId, r])).values()];
    const errored = [...new Map(result.providerResults.filter((r) => r.status === 'error').map((r) => [r.programId, r])).values()];
    const allUnusable = pending.length + errored.length === new Set(result.providerResults.map((r) => r.programId)).size;
    const dealHtml = dealFeedMatchesHtml(result);

    if (allUnusable && errored.length === 0) {
      el.innerHTML = `
        ${dealHtml}
        <div class="warning">Busca executada em ${new Date(result.checkedAt).toLocaleTimeString('pt-BR')}, mas nenhuma
        fonte de preço está configurada ainda (${pending.map((p) => p.programId).join(', ')}) — por isso não há oferta
        de preço pra mostrar. Veja "Configurações" (link no topo) para ativar Travelpayouts, Google Flights (RapidAPI),
        Smiles, Azul, e-mail, WhatsApp ou Telegram.</div>`;
    } else {
      const bestDealHtml =
        result.bestDeal
          ? `<div class="best-deal">🏆 <b>Menor preço encontrado: ${formatBRL(result.bestDeal.priceBRL)}${
              result.bestDeal.priceBRLTotal != null ? ` (${formatBRL(result.bestDeal.priceBRLTotal)} total pra ${result.passengers} passageiros)` : ''
            }</b>${
              result.bestDeal.type === 'split' ? ` (quebra de bilhete via ${result.bestDeal.program})` : ` via ${result.bestDeal.program}`
            }${
              result.bestDeal.destinationLabel && showDestinationColumn ? ` — destino: <b>${escapeHtml(result.bestDeal.destinationLabel)}</b>` : ''
            }${
              result.bestDeal.departDate && showDateColumn
                ? ` — data: <b>${formatDateBR(result.bestDeal.departDate)}${
                    result.bestDeal.returnDate ? ` → ${formatDateBR(result.bestDeal.returnDate)}` : ''
                  }</b>`
                : ''
            }</div>`
          : '';
      el.innerHTML = `
        ${dealHtml}
        ${bestDealHtml}
        ${
          result.flexDatesChecked > 1
            ? `<div class="status-line">Flexibilidade de datas: ${result.flexDatesChecked} combinação(ões) de ida/volta testada(s) nessa busca.</div>`
            : ''
        }
        <table>
          <tr><th>Programa</th>${showDestinationColumn ? '<th>Destino</th>' : ''}${
            showDateColumn ? '<th>Data</th>' : ''
          }<th>Preço</th><th>Milhas</th>${
            showArbitrageColumn ? '<th>Vale mais</th>' : ''
          }<th>Paradas</th>${showFlightColumn ? '<th>Voo</th>' : ''}${showTimeColumn ? '<th>Horário</th>' : ''}${
            showDurationColumn ? '<th>Duração</th>' : ''
          }</tr>
          ${rows || `<tr><td colspan="${columnCount}">Nenhuma oferta encontrada para essa rota/data agora.</td></tr>`}
        </table>
        ${result.alertCount > 0 ? `<div class="warning">${result.alertCount} alerta(s) disparado(s) e enviado(s).</div>` : ''}
        ${
          result.splitSuggestions && result.splitSuggestions.length > 0
            ? `<table><tr><th>Quebra de bilhete</th><th>Ida e volta</th><th>Separado</th><th>Economia</th><th>Datas reais</th></tr>${result.splitSuggestions
                .map((s) => `<tr><td>${s.program}</td><td>${formatBRL(s.roundTripPriceBRL)}</td><td>${formatBRL(s.splitPriceBRL)}</td><td>${formatBRL(s.savingsBRL)}</td><td>${formatDateBR(s.departDate || result.bestDeal?.departDate)} → ${formatDateBR(s.returnDate || result.bestDeal?.returnDate)}</td></tr>`)
                .join('')}</table>`
            : ''
        }
        ${arbitrageBlockHtml(id, result.bestDeal)}
        ${pending.length > 0 ? `<div class="status-line">Pendentes de configuração: ${pending.map((p) => p.programId).join(', ')}</div>` : ''}
        ${errored.map((r) => `<div class="warning">${r.programId}: ${r.message}</div>`).join('')}
      `;
    }
    if (meta) meta.textContent = `Última checagem: ${new Date(result.checkedAt).toLocaleString('pt-BR')}`;
  } catch (err) {
    el.innerHTML = `<div class="warning">Erro ao rodar a busca: ${err.message}</div>`;
  }
}

async function viewHistory(id) {
  const el = document.getElementById(`result-${id}`);
  el.textContent = 'Carregando histórico...';
  try {
    const history = await api(`/api/searches/${id}/history`);
    if (history.length === 0) {
      el.innerHTML = '<p class="status-line">Sem histórico ainda.</p>';
      return;
    }

    // Gráfico de tendência: só usa checagens com preço em dinheiro (ofertas
    // só-em-milhas não entram) — em rotas com só Smiles configurado, por
    // exemplo, isso pode zerar. Sem checar esse caso, Math.min/max([]) dá
    // Infinity/-Infinity e formatBRL mostra "R$ ∞" na tela (bug visto e
    // corrigido antes de integrar).
    const chartData = history
      .slice()
      .reverse()
      .map((h) => ({ date: new Date(h.checkedAt).toLocaleDateString('pt-BR'), price: h.priceBRL }))
      .filter((h) => h.price != null);

    const chartHtml =
      chartData.length === 0
        ? ''
        : (() => {
            const minPrice = Math.min(...chartData.map((d) => d.price));
            const maxPrice = Math.max(...chartData.map((d) => d.price));
            const currentPrice = chartData[chartData.length - 1].price;
            return `
      <div class="history-chart-container">
        <h3>Tendência de preços (em dinheiro)</h3>
        <div class="chart-stats">
          <div class="stat-item">
            <span class="stat-label">Mínimo histórico:</span>
            <span class="stat-value" style="color: var(--success-text);">${formatBRL(minPrice)}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Máximo histórico:</span>
            <span class="stat-value" style="color: var(--danger-text);">${formatBRL(maxPrice)}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Preço mais recente:</span>
            <span class="stat-value" style="color: var(--blue-700);">${formatBRL(currentPrice)}</span>
          </div>
        </div>
        <div class="sparkline-large">
          <svg width="100%" height="200" viewBox="0 0 ${Math.max(chartData.length * 50, 50)} 200" preserveAspectRatio="none">
            ${
              chartData.length > 1
                ? `<polyline points="${chartData
                    .map((d, i) => `${i * 50},${200 - ((d.price - minPrice) / (maxPrice - minPrice || 1)) * 150 - 25}`)
                    .join(' ')}" fill="none" stroke="var(--blue-600)" stroke-width="3"/>
               ${chartData
                 .map((d, i) => `<circle cx="${i * 50}" cy="${200 - ((d.price - minPrice) / (maxPrice - minPrice || 1)) * 150 - 25}" r="4" fill="var(--blue-600)"/>`)
                 .join('')}`
                : ''
            }
          </svg>
        </div>
      </div>`;
          })();

    el.innerHTML = `
      ${chartHtml}
      <table class="history-table">
        <tr><th>Data</th><th>Programa</th><th>Preço</th><th>Milhas</th><th>Anomalia</th><th>Promo</th></tr>
        ${history
          .slice()
          .reverse()
          .map(
            (h) =>
              `<tr><td>${new Date(h.checkedAt).toLocaleString('pt-BR')}</td><td>${h.program}</td><td>${formatBRL(
                h.priceBRL
              )}</td><td>${h.milesRequired ?? '-'}</td><td>${h.isAnomaly ? '⚠️' : ''}</td><td>${h.isFlashSale ? '⚡' : ''}</td></tr>`
          )
          .join('')}
      </table>`;
  } catch (err) {
    el.textContent = 'Erro: ' + err.message;
  }
}

async function removeSearch(id) {
  if (!confirm('Excluir esta busca?')) return;
  try {
    await api(`/api/searches/${id}`, { method: 'DELETE' });
    loadSearches();
  } catch (err) {
    alert('Erro: ' + err.message);
  }
}

if (document.getElementById('providerStatus')) loadProviderStatus();
if (document.getElementById('schedulerStatus')) loadSchedulerStatus();
if (document.getElementById('dealFeedList')) loadDealFeed();
if (document.getElementById('searchList')) loadSearches();
