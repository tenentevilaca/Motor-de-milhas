// Achado real (pedido de revisão): quando uma busca volta com zero ofertas,
// o usuário via só "Nenhuma oferta encontrada" — sem saber se foi porque
// nenhuma fonte está configurada, todas falharam, todas ainda estavam
// respondendo (timeout), ou responderam normalmente mas não têm cobertura
// pra essa rota. Do jeito que estava, cada caso desses exigia uma nova
// rodada de perguntas pra descobrir qual era (mesma classe de problema que
// o item 4 do CLAUDE.md já descreve pra causa de zero ofertas POR fonte —
// isso aqui é a mesma ideia, agregada pra busca inteira).
//
// Como busca por região/data flexível repete o mesmo programId uma vez por
// destino/data testado, agrupa por programId antes de decidir a causa —
// senão "AA pendente em 3 hubs e erro em 1" contaria como 4 resultados
// distintos em vez do mesmo programa com status misto.
function summarizeZeroOffersReason(providerResults) {
  if (!providerResults || providerResults.length === 0) {
    return { code: 'sem_fontes', label: 'Nenhuma fonte foi consultada nessa busca.' };
  }

  const byProgram = new Map();
  for (const r of providerResults) {
    if (!byProgram.has(r.programId)) byProgram.set(r.programId, []);
    byProgram.get(r.programId).push(r);
  }

  const programStatuses = [...byProgram.entries()].map(([programId, list]) => {
    const statuses = new Set(list.map((r) => r.status));
    return { programId, status: statuses.size === 1 ? [...statuses][0] : 'misto' };
  });

  const configured = programStatuses.filter((p) => p.status !== 'not_configured');

  if (configured.length === 0) {
    return {
      code: 'nenhuma_fonte_configurada',
      label: 'Nenhuma fonte de preço/milhas está configurada nessa busca — veja Configurações pra ativar pelo menos uma.',
    };
  }
  if (configured.every((p) => p.status === 'pending')) {
    return {
      code: 'todas_timeout',
      label: 'Todas as fontes configuradas ainda estavam respondendo quando o tempo da busca acabou — rode de novo em instantes (o que já respondeu fica em cache).',
    };
  }
  if (configured.every((p) => p.status === 'error')) {
    return {
      code: 'todas_falharam',
      label: 'Todas as fontes configuradas retornaram erro nessa busca — veja os avisos abaixo pra detalhes de cada uma.',
    };
  }
  if (configured.every((p) => p.status === 'ok')) {
    return {
      code: 'sem_cobertura',
      label: 'As fontes configuradas responderam normalmente, mas nenhuma achou oferta pra essa rota/data — pode ser mesmo indisponibilidade real, não é erro.',
    };
  }
  return {
    code: 'causas_mistas',
    label: 'Algumas fontes falharam ou ainda estavam respondendo, e as que responderam não acharam oferta — veja os avisos abaixo.',
  };
}

module.exports = { summarizeZeroOffersReason };
