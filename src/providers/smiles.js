const { createProgramProvider } = require('./programProvider');

module.exports = createProgramProvider({
  id: 'SMILES',
  label: 'Smiles (Gol)',
  envPrefix: 'SMILES',
  homepageUrl: 'https://www.smiles.com.br/emissao-com-milhas',
});
