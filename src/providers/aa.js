const { createProgramProvider } = require('./programProvider');

module.exports = createProgramProvider({
  id: 'AA',
  label: 'American Airlines (AAdvantage)',
  envPrefix: 'AA',
  homepageUrl: 'https://www.aa.com/booking/find-flights',
});
