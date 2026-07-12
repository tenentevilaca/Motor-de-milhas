// Flags an offer as a possible error/mistake fare or flash-sale price when it
// is far below the historical baseline for that route+program. This is a
// heuristic, not a guarantee: airlines are allowed to void confirmed mistake
// fares (DOT 2015 ruling), and ~10% of them are cancelled, usually within 72h.
// We only ever surface an alert — purchase decisions stay manual.

const DROP_RATIO_THRESHOLD = 0.4; // price <= 40% of the historical average
const MIN_SAMPLES_FOR_CONFIDENCE = 3;

function evaluateOffer(offer, baseline) {
  const price = offer.priceBRL ?? offer.milesRequired;
  if (price == null) {
    return { isAnomaly: false, isFlashSale: false, reason: null };
  }

  if (!baseline || baseline.samples < MIN_SAMPLES_FOR_CONFIDENCE) {
    return { isAnomaly: false, isFlashSale: false, reason: 'histórico insuficiente para comparar' };
  }

  const ratioVsAvg = price / baseline.avg;
  const ratioVsMin = baseline.min > 0 ? price / baseline.min : 1;

  if (ratioVsAvg <= DROP_RATIO_THRESHOLD) {
    return {
      isAnomaly: true,
      isFlashSale: false,
      reason: `Preço ${Math.round((1 - ratioVsAvg) * 100)}% abaixo da média histórica (possível erro de tarifa) — confirme antes de contar com a compra, companhias podem cancelar tarifas com erro.`,
    };
  }

  if (ratioVsMin < 0.85) {
    return {
      isAnomaly: false,
      isFlashSale: true,
      reason: `Novo mínimo histórico para essa rota (${Math.round((1 - ratioVsMin) * 100)}% abaixo do menor preço já visto) — possível promoção relâmpago.`,
    };
  }

  return { isAnomaly: false, isFlashSale: false, reason: null };
}

module.exports = { evaluateOffer, DROP_RATIO_THRESHOLD };
