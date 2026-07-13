const hiddenCityCheckbox = document.getElementById('allowHiddenCity');
const hiddenCityWarning = document.getElementById('hiddenCityWarning');
hiddenCityCheckbox.addEventListener('change', () => {
  hiddenCityWarning.hidden = !hiddenCityCheckbox.checked;
});

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

async function api(path, options) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
  return data;
}

// --- Combobox de aeroporto: digita cidade/país/código, escolhe da lista ---
function setupAirportCombobox({ queryInputId, hiddenInputId, listId }) {
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
        .map(
          (o, i) =>
            `<div class="combobox-option" data-index="${i}"><span class="iata">${o.iata}</span><span class="place">${o.name} — ${o.city}, ${o.country}${o.distanceKm != null ? ` · ~${o.distanceKm} km` : ''}</span></div>`
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
    hiddenInput.value = o.iata;
    queryInput.value = `${o.iata} — ${o.city}, ${o.country}`;
    closeList();
  }

  queryInput.addEventListener('input', () => {
    hiddenInput.value = '';
    const q = queryInput.value.trim();
    clearTimeout(debounceTimer);
    if (q.length < 2) { closeList(); return; }
    debounceTimer = setTimeout(async () => {
      try {
        const options = await api(`/api/airports?q=${encodeURIComponent(q)}`);
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

setupAirportCombobox({ queryInputId: 'originQuery', hiddenInputId: 'origin', listId: 'originList' });
setupAirportCombobox({ queryInputId: 'destinationQuery', hiddenInputId: 'destination', listId: 'destinationList' });

// Passo a passo de cadastro — só serviços com opção gratuita. Baseado no
// fluxo mais recente que conheço; não consegui testar ao vivo nesta sessão
// (esta sandbox de desenvolvimento bloqueia acesso a esses domínios). Se
// algum passo estiver desatualizado, me avise que corrijo na hora.
const INTEGRATION_GUIDES = {
  CASH_AMADEUS: {
    title: 'Amadeus for Developers — portal self-service sendo desativado',
    warning:
      '⚠️ O portal de autoatendimento (self-service) da Amadeus for Developers será desativado em <b>17/07/2026</b>. ' +
      'Depois dessa data, provavelmente não vai dar mais pra criar conta nova por aqui (as APIs corporativas ' +
      'continuam, mas exigem contrato empresarial). Recomendo focar no SerpApi e no Kiwi.com abaixo — se você já ' +
      'tem uma conta Amadeus antiga, ela deve continuar funcionando até ser desativada.',
    steps: [
      'Acesse <a href="https://developers.amadeus.com/register" target="_blank" rel="noopener">developers.amadeus.com/register</a> e crie a conta (sem cartão) — só funciona até 17/07/2026.',
      'Confirme seu e-mail.',
      'Faça login e abra "My Self-Service Workspace".',
      'Clique em "Create New App", dê qualquer nome.',
      'Copie o "API Key" e o "API Secret" e cole na tela de Configurações, seção 1.',
    ],
  },
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

async function loadDealFeed() {
  const el = document.getElementById('dealFeedList');
  el.textContent = 'Carregando...';
  try {
    const posts = await api('/api/deal-feed/latest');
    if (posts.length === 0) {
      el.innerHTML = '<p class="status-line">Nenhum post encontrado (feeds podem estar indisponíveis).</p>';
      return;
    }
    el.innerHTML = posts
      .map(
        (p) => `
      <div style="margin-bottom:10px;">
        <a href="${p.link}" target="_blank" rel="noopener">${p.title}</a>
        <div class="status-line">${p.source}${p.publishedAt ? ' · ' + new Date(p.publishedAt).toLocaleDateString('pt-BR') : ''}</div>
      </div>`
      )
      .join('');
  } catch (err) {
    el.textContent = 'Erro ao carregar: ' + err.message;
  }
}

function formatBRL(v) {
  if (v == null) return '-';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Links diretos pros maiores buscadores, prontos com origem/destino/data —
// funcionam sem nenhuma API configurada, então dão valor imediato mesmo
// antes (ou sem nunca) configurar Amadeus/SerpApi/Kiwi.
function buildManualLinks(s) {
  const o = s.origin;
  const d = s.destination;
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
        <span class="route">${s.origin} → ${s.destination}</span>
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
    await api('/api/searches', { method: 'POST', body: JSON.stringify(body) });
    status.textContent = 'Busca criada com sucesso.';
    status.style.color = '#16a34a';
    loadSearches();
  } catch (err) {
    status.textContent = 'Erro: ' + err.message;
    status.style.color = 'var(--danger-text)';
  }
}

async function runNow(id) {
  const el = document.getElementById(`result-${id}`);
  const meta = document.getElementById(`meta-${id}`);
  el.innerHTML = '<div class="status-line">Buscando nas fontes configuradas…</div>';
  try {
    const result = await api(`/api/searches/${id}/run`, { method: 'POST' });
    const rows = result.providerResults
      .flatMap((r) =>
        r.offers.map(
          (o) =>
            `<tr><td>${o.program}</td><td>${formatBRL(o.priceBRL)}</td><td>${o.milesRequired ?? '-'}</td><td>${o.stops}</td></tr>`
        )
      )
      .join('');
    const pending = result.providerResults.filter((r) => r.status === 'not_configured');
    const errored = result.providerResults.filter((r) => r.status === 'error');
    const allUnusable = pending.length + errored.length === result.providerResults.length;

    if (allUnusable && errored.length === 0) {
      el.innerHTML = `
        <div class="warning">Busca executada em ${new Date(result.checkedAt).toLocaleTimeString('pt-BR')}, mas nenhuma
        fonte de preço está configurada ainda (${pending.map((p) => p.programId).join(', ')}) — por isso não há oferta
        para mostrar. Veja "Configurações" (link no topo) para ativar o Amadeus/SerpApi/Kiwi/e-mail/WhatsApp.</div>`;
    } else {
      el.innerHTML = `
        <table>
          <tr><th>Programa</th><th>Preço</th><th>Milhas</th><th>Paradas</th></tr>
          ${rows || '<tr><td colspan="4">Nenhuma oferta encontrada para essa rota/data agora.</td></tr>'}
        </table>
        ${result.alertCount > 0 ? `<div class="warning">${result.alertCount} alerta(s) disparado(s) e enviado(s).</div>` : ''}
        ${
          result.splitSuggestions && result.splitSuggestions.length > 0
            ? `<table><tr><th>Quebra de bilhete</th><th>Ida e volta</th><th>Separado</th><th>Economia</th></tr>${result.splitSuggestions
                .map((s) => `<tr><td>${s.program}</td><td>${formatBRL(s.roundTripPriceBRL)}</td><td>${formatBRL(s.splitPriceBRL)}</td><td>${formatBRL(s.savingsBRL)}</td></tr>`)
                .join('')}</table>`
            : ''
        }
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

loadProviderStatus();
loadSchedulerStatus();
loadDealFeed();
loadSearches();
