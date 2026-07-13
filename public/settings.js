async function api(path, options) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
  return data;
}

const FIELDS = [
  'AMADEUS_CLIENT_ID', 'AMADEUS_CLIENT_SECRET', 'SERPAPI_KEY', 'KIWI_TEQUILA_API_KEY',
  'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'FROM_EMAIL',
  'CALLMEBOT_API_KEY', 'TELEGRAM_BOT_TOKEN',
  'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_FROM',
  'AA_PROVIDER_URL', 'LATAM_PROVIDER_URL', 'SMILES_PROVIDER_URL', 'AZUL_PROVIDER_URL',
  'DEAL_FEED_URLS',
];

const PROVIDER_URL_KEYS = ['AA_PROVIDER_URL', 'LATAM_PROVIDER_URL', 'SMILES_PROVIDER_URL', 'AZUL_PROVIDER_URL'];

const BADGE_GROUPS = {
  AMADEUS_CLIENT_ID: ['AMADEUS_CLIENT_ID', 'AMADEUS_CLIENT_SECRET'],
  SERPAPI_KEY: ['SERPAPI_KEY'],
  KIWI_TEQUILA_API_KEY: ['KIWI_TEQUILA_API_KEY'],
  SMTP_HOST: ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'],
  CALLMEBOT_API_KEY: ['CALLMEBOT_API_KEY'],
  TELEGRAM_BOT_TOKEN: ['TELEGRAM_BOT_TOKEN'],
  TWILIO_ACCOUNT_SID: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_FROM'],
};

let lastStatus = {};

function toggleProviderUrl(key) {
  const mode = document.getElementById(`${key}_mode`).value;
  const input = document.getElementById(key);
  input.style.display = mode === 'custom' ? 'block' : 'none';
}

function applyStatus(status) {
  lastStatus = status;
  for (const key of FIELDS) {
    const input = document.getElementById(key);
    if (!input) continue;
    const s = status[key];
    input.placeholder = s && s.configured ? `configurado (${s.masked})` : input.placeholder || 'cole aqui';
    input.value = '';
  }
  for (const key of PROVIDER_URL_KEYS) {
    const select = document.getElementById(`${key}_mode`);
    if (!select) continue;
    const configured = Boolean(status[key] && status[key].configured);
    select.value = configured ? 'custom' : 'none';
    toggleProviderUrl(key);
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
  const clearKeys = [];
  for (const key of FIELDS) {
    const input = document.getElementById(key);
    if (!input) continue;
    if (input.value.trim()) {
      patch[key] = input.value.trim();
    } else if (PROVIDER_URL_KEYS.includes(key)) {
      const mode = document.getElementById(`${key}_mode`)?.value;
      const wasConfigured = Boolean(lastStatus[key] && lastStatus[key].configured);
      if (mode === 'none' && wasConfigured) clearKeys.push(key);
    }
  }
  if (Object.keys(patch).length === 0 && clearKeys.length === 0) {
    statusEl.textContent = 'Nada para salvar — preencha ao menos um campo ou mude uma opção.';
    statusEl.style.color = 'var(--muted)';
    return;
  }
  try {
    const status = await api('/api/settings', { method: 'POST', body: JSON.stringify({ ...patch, clearKeys }) });
    applyStatus(status);
    statusEl.textContent = 'Configurações salvas.';
    statusEl.style.color = '#16a34a';
  } catch (err) {
    statusEl.textContent = 'Erro: ' + err.message;
    statusEl.style.color = 'var(--danger-text)';
  }
}

async function sendTest(channel) {
  const resultEl = document.getElementById(`testResult-${channel}`);
  const to = document.getElementById(`testTo-${channel}`).value.trim();
  if (!to) {
    resultEl.textContent = 'Preencha o destino do teste.';
    resultEl.style.color = 'var(--danger-text)';
    return;
  }
  resultEl.textContent = 'Enviando...';
  resultEl.style.color = 'var(--muted)';
  try {
    const result = await api('/api/notify/test', { method: 'POST', body: JSON.stringify({ channel, to }) });
    if (result.status === 'sent') {
      resultEl.textContent = 'Enviado! Confira se chegou (pode levar alguns segundos).';
      resultEl.style.color = '#16a34a';
    } else {
      resultEl.textContent = result.message || 'Canal não configurado — salve as configurações acima primeiro.';
      resultEl.style.color = 'var(--danger-text)';
    }
  } catch (err) {
    resultEl.textContent = 'Erro: ' + err.message;
    resultEl.style.color = 'var(--danger-text)';
  }
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
      .map(
        (c) =>
          `<div>${c.name}: <b>${c.chatId}</b> <button type="button" class="secondary" style="padding:2px 8px; font-size:0.75rem;" onclick="document.getElementById('testTo-TELEGRAM').value='${c.chatId}'">usar</button></div>`
      )
      .join('');
  } catch (err) {
    el.textContent = 'Erro: ' + err.message + ' (salve o Bot Token acima primeiro)';
  }
}

loadStatus();
