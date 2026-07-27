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

// Atalhos de "rotas populares" saindo de GRU (maior hub do país) — clicar já
// preenche origem/destino, sem precisar digitar. Só os pares de aeroporto;
// não inventamos preço nenhum aqui (isso só aparece de verdade depois de
// rodar a busca com uma fonte de preço configurada).
const POPULAR_ROUTES = [
  { originIata: 'GRU', originCity: 'São Paulo', originCountry: 'Brazil', destIata: 'GIG', destCity: 'Rio de Janeiro', destCountry: 'Brazil' },
  { originIata: 'GRU', originCity: 'São Paulo', originCountry: 'Brazil', destIata: 'BSB', destCity: 'Brasília', destCountry: 'Brazil' },
  { originIata: 'GRU', originCity: 'São Paulo', originCountry: 'Brazil', destIata: 'SSA', destCity: 'Salvador', destCountry: 'Brazil' },
  { originIata: 'GRU', originCity: 'São Paulo', originCountry: 'Brazil', destIata: 'REC', destCity: 'Recife', destCountry: 'Brazil' },
  { originIata: 'GRU', originCity: 'São Paulo', originCountry: 'Brazil', destIata: 'MIA', destCity: 'Miami', destCountry: 'United States' },
  { originIata: 'GRU', originCity: 'São Paulo', originCountry: 'Brazil', destIata: 'LIS', destCity: 'Lisboa', destCountry: 'Portugal' },
];

function fillRoute(route) {
  document.getElementById('origin').value = route.originIata;
  document.getElementById('originQuery').value = `${route.originIata} — ${route.originCity}, ${route.originCountry}`;
  document.getElementById('destination').value = route.destIata;
  document.getElementById('destinationQuery').value = `${route.destIata} — ${route.destCity}, ${route.destCountry}`;
  toggleSplitTicketForRegion();
  updateBestTimeCard();
}

function renderRouteShortcuts() {
  const el = document.getElementById('routeShortcuts');
  if (!el) return;
  el.innerHTML = POPULAR_ROUTES.map(
    (r, i) => `
    <button type="button" class="route-shortcut" onclick="fillRoute(POPULAR_ROUTES[${i}])">
      <span class="route-shortcut-cities">${r.originIata} → ${r.destIata}</span>
      <span class="route-shortcut-label">${r.originCity} → ${r.destCity}</span>
    </button>`
  ).join('');
}
renderRouteShortcuts();

// "Opções avançadas" (stopover/quebra de bilhete/hidden-city) ficam
// recolhidas por padrão — são coisas que a maioria das buscas não precisa,
// e deixá-las sempre visíveis é o que tornava a página "Buscar" poluída.
function toggleAdvancedOptions() {
  const body = document.getElementById('advancedOptionsBody');
  body.hidden = !body.hidden;
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
    const advice = await api(`/api/best-time?${params}`);
    const statusColor = { ideal: '#16a34a', urgent: '#16a34a', late: '#c2410c', early: 'var(--muted)', no_date: 'var(--muted)', past: 'var(--danger-text)' };
    const historicalHtml = advice.historical?.available
      ? `<div class="status-line"><b>Com base no seu próprio histórico:</b> meses mais baratos observados nessa rota: ${advice.historical.cheapestMonths
          .map((m) => `${m.monthName} (${formatBRL(m.avgPriceBRL)} em média, ${m.samples} amostra(s))`)
          .join(', ')}.</div>`
      : `<div class="status-line">Ainda sem histórico próprio suficiente nessa rota pra estatística por mês (precisa de pelo menos ${advice.historical?.samplesNeeded ?? 3} checagens no mesmo mês) — vai aparecer aqui conforme o motor for rodando.</div>`;
    body.innerHTML = `
      <div style="color:${statusColor[advice.buyingWindow.status] || 'inherit'};"><b>Quando comprar:</b> ${advice.buyingWindow.message}</div>
      <div class="status-line" style="margin-top:8px;"><b>Época mais cara pra viajar essa rota:</b> ${advice.seasonal.highSeasonMonths.join(', ')}.
      <b>Mais barata costuma ser:</b> ${advice.seasonal.lowSeasonMonths.join(', ')}. ${advice.seasonal.note}</div>
      ${historicalHtml}
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
  CASH_SERPAPI: {
    title: 'SerpApi / Google Flights (100 buscas/mês grátis)',
    steps: [
      'Acesse <a href="https://serpapi.com/users/sign_up" target="_blank" rel="noopener">serpapi.com/users/sign_up</a> e crie a conta.',
      'Confirme seu e-mail.',
      'No Dashboard, copie sua "Private API Key".',
      'Cole na tela de Configurações, seção 1.',
      'Se o cadastro pedir telefone e bloquear como suspeito, tente outro número ou pule pro Kiwi.com abaixo.',
    ],
  },
  CASH_KIWI: {
    title: 'Kiwi.com Tequila (grátis)',
    steps: [
      'Acesse <a href="https://tequila.kiwi.com/portal/login" target="_blank" rel="noopener">tequila.kiwi.com/portal/login</a> e crie a conta (e-mail e senha, geralmente sem telefone).',
      'Depois de logar, peça acesso de API se for solicitado.',
      'Copie sua "API Key".',
      'Cole na tela de Configurações, seção 1.',
    ],
  },
  CASH_TRAVELPAYOUTS: {
    title: 'Travelpayouts (grátis, sem telefone)',
    steps: [
      'Acesse <a href="https://www.travelpayouts.com" target="_blank" rel="noopener">travelpayouts.com</a> e crie a conta (geralmente só e-mail).',
      'No painel, vá na seção "API" e gere um token.',
      'Cole na tela de Configurações, seção 1.',
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

// Links diretos pros maiores buscadores, prontos com origem/destino/data —
// funcionam sem nenhuma API configurada, então dão valor imediato mesmo
// antes (ou sem nunca) configurar SerpApi/Kiwi/Travelpayouts.
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
    const searches = await api('/api/searches');
    if (searches.length === 0) {
      el.innerHTML = '<p class="status-line">Nenhuma busca criada ainda.</p>';
      return;
    }
    el.innerHTML = searches
      .map(
        (s) => `
      <div class="search-item">
        <span class="route">${s.origin} → ${isRegionDestination(s.destination) ? '🌎 ' + regionLabelFor(s.destination) : s.destination}</span>
        ${s.departDate ? ' · ida ' + s.departDate : ''}${s.returnDate ? ' · volta ' + s.returnDate : ''}
        <div class="status-line">
          Programas: ${s.programs.join(', ') || '-'} · Stopover: ${s.allowStopover ? 'sim' : 'não'} ·
          Hidden-city: ${s.allowHiddenCity ? 'sim' : 'não'}
        </div>
        <div class="status-line" id="meta-${s.id}">Última checagem: ${s.lastRunAt ? new Date(s.lastRunAt).toLocaleString('pt-BR') : 'nunca'}</div>
        <div class="status-line">Conferir agora, sem esperar nenhuma API: ${buildManualLinks(s)
          .map((l) => `<a href="${l.url}" target="_blank" rel="noopener">${l.label}</a>`)
          .join(' · ')}</div>
        <div class="actions">
          <button onclick="runNow('${s.id}')">Rodar agora</button>
          <button class="secondary" onclick="viewHistory('${s.id}')">Ver histórico</button>
          <button class="danger" onclick="removeSearch('${s.id}')">Excluir</button>
        </div>
        <div id="result-${s.id}"></div>
      </div>`
      )
      .join('');
  } catch (err) {
    el.textContent = 'Erro ao carregar: ' + err.message;
  }
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
  const programs = Array.from(document.querySelectorAll('#programs input:checked')).map((i) => i.value);
  const body = {
    origin,
    destination,
    departDate: document.getElementById('departDate').value || null,
    returnDate: document.getElementById('returnDate').value || null,
    flexDays: document.getElementById('flexDays').value,
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
    const rows = sorted
      .map(
        (o, i) =>
          `<tr${i === 0 ? ' style="font-weight:600;"' : ''}><td>${i === 0 ? '🏆 ' : ''}${o.program}</td>${
            showDestinationColumn ? `<td>${o.destination || '-'}</td>` : ''
          }<td>${formatBRL(o.priceBRL)}</td><td>${o.milesRequired ?? '-'}</td><td>${o.stops === 0 ? 'direto' : o.stops + ' parada(s)'}</td></tr>`
      )
      .join('');
    // Busca por região consulta os mesmos provedores em vários hubs — deduplica
    // por programId aqui pra não repetir "CASH_SERPAPI, CASH_SERPAPI, ..." N vezes.
    const pending = [...new Map(result.providerResults.filter((r) => r.status === 'not_configured').map((r) => [r.programId, r])).values()];
    const errored = [...new Map(result.providerResults.filter((r) => r.status === 'error').map((r) => [r.programId, r])).values()];
    const allUnusable = pending.length + errored.length === new Set(result.providerResults.map((r) => r.programId)).size;
    const dealHtml = dealFeedMatchesHtml(result);

    if (allUnusable && errored.length === 0) {
      el.innerHTML = `
        ${dealHtml}
        <div class="warning">Busca executada em ${new Date(result.checkedAt).toLocaleTimeString('pt-BR')}, mas nenhuma
        fonte de preço está configurada ainda (${pending.map((p) => p.programId).join(', ')}) — por isso não há oferta
        de preço pra mostrar. Veja "Configurações" (link no topo) para ativar o SerpApi/Kiwi/Travelpayouts/e-mail/WhatsApp.</div>`;
    } else {
      const bestDealHtml =
        result.bestDeal
          ? `<div class="best-deal">🏆 <b>Menor preço encontrado: ${formatBRL(result.bestDeal.priceBRL)}</b>${
              result.bestDeal.type === 'split' ? ` (quebra de bilhete via ${result.bestDeal.program})` : ` via ${result.bestDeal.program}`
            }${result.bestDeal.destination && showDestinationColumn ? ` — destino: <b>${result.bestDeal.destination}</b>` : ''}</div>`
          : '';
      el.innerHTML = `
        ${dealHtml}
        ${bestDealHtml}
        <table>
          <tr><th>Programa</th>${showDestinationColumn ? '<th>Destino</th>' : ''}<th>Preço</th><th>Milhas</th><th>Paradas</th></tr>
          ${rows || `<tr><td colspan="${showDestinationColumn ? 5 : 4}">Nenhuma oferta encontrada para essa rota/data agora.</td></tr>`}
        </table>
        ${result.alertCount > 0 ? `<div class="warning">${result.alertCount} alerta(s) disparado(s) e enviado(s).</div>` : ''}
        ${
          result.splitSuggestions && result.splitSuggestions.length > 0
            ? `<table><tr><th>Quebra de bilhete</th><th>Ida e volta</th><th>Separado</th><th>Economia</th></tr>${result.splitSuggestions
                .map((s) => `<tr><td>${s.program}</td><td>${formatBRL(s.roundTripPriceBRL)}</td><td>${formatBRL(s.splitPriceBRL)}</td><td>${formatBRL(s.savingsBRL)}</td></tr>`)
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
    el.innerHTML = `
      <table>
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
