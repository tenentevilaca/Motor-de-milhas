const axios = require('axios');

// Generic adapter for a frequent-flyer program (AA/AAdvantage, LATAM Pass,
// Smiles, TudoAzul/Azul).
//
// IMPORTANT / HONESTY NOTE:
// None of these airlines/programs offer a public, free API for award
// availability search, and automated scraping of their booking sites
// generally violates their Terms of Use (anti-bot protections, rate
// limiting, risk of IP/account blocking). Rather than ship a scraper of
// uncertain legality that would silently break, this adapter:
//   1) Is OFF by default and clearly reports "not_configured".
//   2) Activates automatically if you point it at your OWN data source via
//      `${envPrefix}_PROVIDER_URL` — e.g. an official partner/GDS
//      integration you have contracted, or a scraping service you have
//      separately vetted and are authorized to run. That URL is called
//      with a POST of the search params and must return
//      `{ offers: [...] }` in the shape described in providers/index.js.
//   3) Always returns a direct link to the program's own search page so a
//      human can check manually in the meantime.
function createProgramProvider({ id, label, envPrefix, homepageUrl }) {
  function enabled() {
    return Boolean(process.env[`${envPrefix}_PROVIDER_URL`]);
  }

  async function search(params) {
    const providerUrl = process.env[`${envPrefix}_PROVIDER_URL`];
    if (!providerUrl) {
      return {
        status: 'not_configured',
        message:
          `Integração com ${label} ainda não configurada. Não fazemos scraping direto do site por padrão ` +
          `(risco de violar Termos de Uso e de bloqueio de conta). Configure ${envPrefix}_PROVIDER_URL apontando ` +
          `para uma integração oficial/parceira que você tenha, ou verifique manualmente em: ${homepageUrl}`,
        offers: [],
        manualCheckUrl: homepageUrl,
      };
    }

    try {
      const { data } = await axios.post(providerUrl, params, { timeout: 20000 });
      const offers = (data.offers || []).map((o) => ({ ...o, program: id }));
      return { status: 'ok', message: null, offers, manualCheckUrl: homepageUrl };
    } catch (err) {
      return {
        status: 'error',
        message: `Falha ao consultar integração de ${label}: ${err.message}`,
        offers: [],
        manualCheckUrl: homepageUrl,
      };
    }
  }

  return { id, label, enabled, search, homepageUrl };
}

module.exports = { createProgramProvider };
