const hiddenCityCheckbox = document.getElementById('allowHiddenCity');
const hiddenCityWarning = document.getElementById('hiddenCityWarning');
hiddenCityCheckbox.addEventListener('change', () => {
  hiddenCityWarning.hidden = !hiddenCityCheckbox.checked;
});

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

  function renderOptions(options) {
    currentOptions = options;
    if (options.length === 0) {
      list.innerHTML = '<div class="combobox-empty">Nenhum aeroporto encontrado</div>';
      list.classList.add('open');
      return;
    }
    list.innerHTML = options
      .map(
        (o, i) =>
          `<div class="combobox-option" data-index="${i}"><span class="iata">${o.iata}</span><span class="place">${o.name} — ${o.city}, ${o.country}</span></div>`
      )
      .join('');
    list.classList.add('open');
    Array.from(list.children).forEach((el) => {
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

async function loadProviderStatus() {
  const el = document.getElementById('providerStatus');
  try {
    const providers = await api('/api/providers');
    el.innerHTML = providers
      .map(
        (p) =>
          `<div>${p.label}: <span class="badge ${p.enabled ? 'ok' : 'pending'}">${
            p.enabled ? 'ativo' : 'pendente de configuração'
          }</span></div>`
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
          Hidden-city: ${s.allowHiddenCity ? 'sim' : 'não'} · Última checagem: ${s.lastRunAt ? new Date(s.lastRunAt).toLocaleString('pt-BR') : 'nunca'}
        </div>
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
    allowHiddenCity: hiddenCityCheckbox.checked,
    hiddenCityRiskAcknowledged: document.getElementById('hiddenCityAck').checked,
    email: document.getElementById('email').value.trim() || null,
    whatsapp: document.getElementById('whatsapp').value.trim() || null,
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
  el.textContent = 'Buscando...';
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
    el.innerHTML = `
      <table>
        <tr><th>Programa</th><th>Preço</th><th>Milhas</th><th>Paradas</th></tr>
        ${rows || '<tr><td colspan="4">Nenhuma oferta retornada.</td></tr>'}
      </table>
      ${result.alertCount > 0 ? `<div class="warning">${result.alertCount} alerta(s) disparado(s) e enviado(s).</div>` : ''}
      ${pending.length > 0 ? `<div class="status-line">Pendentes de configuração: ${pending.map((p) => p.programId).join(', ')}</div>` : ''}
    `;
    loadSearches();
  } catch (err) {
    el.textContent = 'Erro: ' + err.message;
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
loadSearches();
