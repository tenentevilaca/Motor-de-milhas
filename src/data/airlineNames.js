// Mapa código IATA de 2 letras -> nome da companhia, só pras principais
// parceiras internacionais dos programas cobertos neste projeto (AAdvantage/
// Oneworld, TudoAzul/Star Alliance-ish, Smiles/SkyTeam-ish) — dado público
// e estável (códigos IATA não mudam), não é scraping nem dado inventado por
// rota específica. Código sem entrada aqui aparece pelo próprio código IATA
// em vez de um nome chutado (ver uso em seatsAero.js).
module.exports = {
  AA: 'American Airlines',
  BA: 'British Airways',
  QR: 'Qatar Airways',
  IB: 'Iberia',
  JL: 'Japan Airlines',
  CX: 'Cathay Pacific',
  QF: 'Qantas',
  AY: 'Finnair',
  AT: 'Royal Air Maroc',
  MH: 'Malaysia Airlines',
  RJ: 'Royal Jordanian',
  UL: 'SriLankan Airlines',
  AS: 'Alaska Airlines',
  LA: 'LATAM',
  G3: 'Gol',
  AD: 'Azul',
  TP: 'TAP Air Portugal',
  TK: 'Turkish Airlines',
  FI: 'Icelandair',
  EK: 'Emirates',
  SQ: 'Singapore Airlines',
  LH: 'Lufthansa',
  UA: 'United Airlines',
  DL: 'Delta Air Lines',
  AF: 'Air France',
  KL: 'KLM',
  EY: 'Etihad Airways',
  SA: 'South African Airways',
  ET: 'Ethiopian Airlines',
  AC: 'Air Canada',
  AV: 'Avianca',
  CM: 'Copa Airlines',
};
