// Mapeia nomes de cidade em português (sem acento, minúsculo) para o nome em
// inglês usado na base de aeroportos (OpenFlights) — "Lisboa", "Londres" e
// "Nova York" não existem literalmente na base, só "Lisbon", "London" e
// "New York". Também cobre abreviações/apelidos que brasileiros usam no
// dia a dia pra cidade (ex: "BH" pra Belo Horizonte) — sem isso, digitar
// "BH" na busca de aeroporto não sugeria nada de Belo Horizonte, só uma
// lista de aeroportos aleatórios ao redor do mundo cujo código IATA ou
// nome começa com "bh" (bug real reportado: usuário testando origem "BH"
// não achava o aeroporto certo pra selecionar).
module.exports = {
  bh: 'Belo Horizonte',
  sp: 'Sao Paulo',
  sampa: 'Sao Paulo',
  rj: 'Rio De Janeiro',
  floripa: 'Florianopolis',
  lisboa: 'Lisbon',
  londres: 'London',
  berlim: 'Berlin',
  'nova york': 'New York',
  'nova iorque': 'New York',
  moscou: 'Moscow',
  moscovo: 'Moscow',
  roma: 'Rome',
  milao: 'Milan',
  veneza: 'Venice',
  florenca: 'Florence',
  turim: 'Turin',
  napoles: 'Naples',
  munique: 'Munich',
  colonia: 'Cologne',
  atenas: 'Athens',
  varsovia: 'Warsaw',
  copenhague: 'Copenhagen',
  genebra: 'Geneva',
  zurique: 'Zurich',
  praga: 'Prague',
  bruxelas: 'Brussels',
  haia: 'The Hague',
  viena: 'Vienna',
  'cidade do mexico': 'Mexico City',
  pequim: 'Beijing',
  xangai: 'Shanghai',
  toquio: 'Tokyo',
  seul: 'Seoul',
  'nova deli': 'New Delhi',
  edimburgo: 'Edinburgh',
  'cidade do cabo': 'Cape Town',
  'cairo': 'Cairo',
  meca: 'Mecca',
};
