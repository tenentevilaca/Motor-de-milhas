// Precisa ser o PRIMEIRO require de cada arquivo de teste que toca db.js
// (direta ou indiretamente) — DATA_DIR é lido uma vez no topo de db.js, então
// isolar os testes dos arquivos reais em data/ (buscas/histórico de verdade
// do usuário) só funciona se isso rodar antes de qualquer outro require.
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'motor-de-milhas-test-'));
process.env.DISABLE_SCHEDULER = 'true';
