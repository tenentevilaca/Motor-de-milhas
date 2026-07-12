const { createProgramProvider } = require('./programProvider');

module.exports = createProgramProvider({
  id: 'LATAM',
  label: 'LATAM Pass',
  envPrefix: 'LATAM',
  homepageUrl: 'https://www.latamairlines.com/br/pt',
});
