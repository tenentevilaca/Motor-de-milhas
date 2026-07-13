async function api(path, options) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
  return data;
}

const FIELDS = [
  'AMADEUS_CLIENT_ID', 'AMADEUS_CLIENT_SECRET', 'SERPAPI_KEY', 'KIWI_TEQUILA_API_KEY',
  'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'FROM_EMAIL',
  'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_FROM',
  'AA_PROVIDER_URL', 'LATAM_PROVIDER_URL', 'SMILES_PROVIDER_URL', 'AZUL_PROVIDER_URL',
  'DEAL_FEED_URLS',
];

const BADGE_GROUPS = {
  AMADEUS_CLIENT_ID: ['AMADEUS_CLIENT_ID', 'AMADEUS_CLIENT_SECRET'],
  SERPAPI_KEY: ['SERPAPI_KEY'],
  KIWI_TEQUILA_API_KEY: ['KIWI_TEQUILA_API_KEY'],
  SMTP_HOST: ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'],
  TWILIO_ACCOUNT_SID: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_FROM'],
};

function applyStatus(status) {
  for (const key of FIELDS) {
    const input = document.getElementById(key);
    if (!input) continue;
    const s = status[key];
    input.placeholder = s && s.configured ? `configurado (${s.masked})` : input.placeholder || 'cole aqui';
    input.value = '';
  }
  for (const [groupKey, members] of Object.entries(BADGE_GROUPS)) {
    const badge = document.getElementById(`badge-${groupKey}`);
    if (!badge) continue;
    const allConfigured = members.every((m) => status[m] && status[m].configured);
    badge.textContent = allConfigured ? 'ativo' : 'pendente';
    badge.className = `badge ${allConfigured ? 'ok' : 'pending'}`;
  }
}

async function loadStatus() {
  try {
    const status = await api('/api/settings');
    applyStatus(status);
  } catch (err) {
    document.getElementById('saveStatus').textContent = 'Erro ao carregar status: ' + err.message;
  }
}

async function saveSettings() {
  const statusEl = document.getElementById('saveStatus');
  const patch = {};
  for (const key of FIELDS) {
    const input = document.getElementById(key);
    if (input && input.value.trim()) patch[key] = input.value.trim();
  }
  if (Object.keys(patch).length === 0) {
    statusEl.textContent = 'Nada para salvar — preencha ao menos um campo.';
    statusEl.style.color = 'var(--muted)';
    return;
  }
  try {
    const status = await api('/api/settings', { method: 'POST', body: JSON.stringify(patch) });
    applyStatus(status);
    statusEl.textContent = 'Configurações salvas.';
    statusEl.style.color = '#16a34a';
  } catch (err) {
    statusEl.textContent = 'Erro: ' + err.message;
    statusEl.style.color = 'var(--danger-text)';
  }
}

loadStatus();
