const { createProgramProvider } = require('./programProvider');

module.exports = createProgramProvider({
  id: 'AZUL',
  label: 'TudoAzul',
  envPrefix: 'AZUL',
  homepageUrl: 'https://www.voeazul.com.br',
});
