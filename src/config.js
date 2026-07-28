const fs = require('fs');
const path = require('path');

// Configuração editável pela tela de Configurações do app (sem precisar
// mexer em .env/terminal). Chaves aqui têm prioridade sobre variáveis de
// ambiente; se não estiverem definidas, cai para process.env como antes.
// Guardado em data/settings.json, que já está no .gitignore (nunca vai pro
// repositório).
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

const KNOWN_KEYS = [
  'TRAVELPAYOUTS_TOKEN',
  'RAPIDAPI_KEY',
  'USD_TO_BRL_RATE',
  'APIFY_TOKEN',
  'MILES_VALUE_PER_1000',
  'AA_PROVIDER_URL',
  'LATAM_PROVIDER_URL',
  'SMILES_PROVIDER_URL',
  'AZUL_PROVIDER_URL',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
  'FROM_EMAIL',
  'CALLMEBOT_API_KEY',
  'TELEGRAM_BOT_TOKEN',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_WHATSAPP_FROM',
  'DEAL_FEED_URLS',
];

function readSettings() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(SETTINGS_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function writeSettings(settings) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

function get(key) {
  const settings = readSettings();
  const value = settings[key];
  return value !== undefined && value !== '' ? value : process.env[key];
}

function setMany(patch) {
  const settings = readSettings();
  for (const key of Object.keys(patch)) {
    if (!KNOWN_KEYS.includes(key)) continue;
    const value = patch[key];
    if (value === '' || value == null) continue; // não sobrescreve com vazio (evita apagar ao reenviar o form)
    settings[key] = value;
  }
  writeSettings(settings);
  return settings;
}

function clearKey(key) {
  const settings = readSettings();
  delete settings[key];
  writeSettings(settings);
}

function mask(value) {
  if (!value) return null;
  const str = String(value);
  if (str.length <= 4) return '••••';
  return `••••${str.slice(-4)}`;
}

function statusForAllKeys() {
  const result = {};
  for (const key of KNOWN_KEYS) {
    const value = get(key);
    result[key] = { configured: Boolean(value), masked: value ? mask(value) : null };
  }
  return result;
}

module.exports = { get, setMany, clearKey, statusForAllKeys, KNOWN_KEYS };
