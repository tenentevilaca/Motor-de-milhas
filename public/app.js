const hiddenCityCheckbox = document.getElementById('allowHiddenCity');
const hiddenCityWarning = document.getElementById('hiddenCityWarning');
hiddenCityCheckbox.addEventListener('change', () => {
  hiddenCityWarning.style.display = hiddenCityCheckbox.checked ? 'block' : 'none';
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

async function loadProviderStatus() {
  const el = document.getElementById('providerStatus');
  try {
    const providers = await api('/api/providers');
    el.innerHTML = providers
      .map(
        (p) =>
          `<div style="margin-bottom:6px;">${p.label}: <span class="badge ${p.enabled ? 'ok' : 'pending'}">${
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
      el.innerHTML = '<p>Nenhuma busca criada ainda.</p>';
      return;
    }
    el.innerHTML = searches
      .map(
        (s) => `
      <div class="card" style="background:#12151b;">
        <b>${s.origin} → ${s.destination}</b>
        ${s.departDate ? ' | ida: ' + s.departDate : ''}${s.returnDate ? ' | volta: ' + s.returnDate : ''}
        <div class="status-line">
          Programas: ${s.programs.join(', ') || '-'} | Stopover: ${s.allowStopover ? 'sim' : 'não'} |
          Hidden-city: ${s.allowHiddenCity ? 'sim' : 'não'} | Última checagem: ${s.lastRunAt || 'nunca'}
        </div>
        <button onclick="runNow('${s.id}')">Rodar agora</button>
        <button class="secondary" onclick="viewHistory('${s.id}')">Ver histórico</button>
        <button class="danger" onclick="removeSearch('${s.id}')">Excluir</button>
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
  const programs = Array.from(document.querySelectorAll('#programs input:checked')).map((i) => i.value);
  const body = {
    origin: document.getElementById('origin').value.trim(),
    destination: document.getElementById('destination').value.trim(),
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
    status.style.color = '#4ade80';
    loadSearches();
  } catch (err) {
    status.textContent = 'Erro: ' + err.message;
    status.style.color = '#f87171';
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
      el.innerHTML = '<p>Sem histórico ainda.</p>';
      return;
    }
    el.innerHTML = `
      <table>
        <tr><th>Data</th><th>Programa</th><th>Preço</th><th>Milhas</th><th>Anomalia</th><th>Promo relâmpago</th></tr>
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
