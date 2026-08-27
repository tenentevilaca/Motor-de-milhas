# Notas pra quem (IA ou humano) for mexer neste projeto

Este arquivo existe porque, ao longo de várias semanas de desenvolvimento, a
mesma CATEGORIA de erro se repetiu em integrações diferentes — cada vez
descoberta só depois de um log real de produção. As lições abaixo são reais,
não teóricas: cada uma corresponde a um bug que já aconteceu neste projeto.
Leia antes de mexer em qualquer integração com API externa ou em
armazenamento/deploy.

## 1. Nunca confie em nome de campo de API de terceiro sem confirmar contra resposta real

Aconteceu 3 vezes neste projeto — Travelpayouts (`price`/`transfers` vs. os
nomes reais `value`/`number_of_changes`), Google Flights via RapidAPI
(`price_as_number` só confirmado depois, formato de resposta embrulhado
descoberto tarde), Seats.aero (header `Bearer` que não existe na API real,
só descoberto com print da própria conta do usuário). Em todos os casos, o
código "parecia pronto" — parseava sem erro, só devolvia zero ofertas
silenciosamente.

**Regra prática**: toda integração nova com uma API que eu não testei
contra uma resposta real precisa de log de diagnóstico ANTES de ser dada
como pronta — não depois que o usuário reclamar pela terceira vez. Ver o
padrão já usado em `src/providers/travelpayouts.js`,
`src/providers/rapidapiGoogleFlights.js` e `src/providers/seatsAero.js`:
loga separadamente (a) formato de resposta não reconhecido, (b) lista
reconhecida mas vazia (não é bug, é resultado real), (c) itens existem mas
nenhum sobrevive ao parsing (loga as chaves do item bruto).

## 2. Render free tier: disco não persiste entre deploys

`data/` (buscas salvas, histórico, cache) é apagado toda vez que o serviço
reinicia — e ele reinicia a cada deploy novo. Isso já causou confusão real:
uma busca salva com WhatsApp configurado sumiu porque um deploy de correção
de bug rodou no meio, e ninguém soube na hora que essas duas coisas
(deploy e desaparecimento da busca) estavam relacionadas.

**Regra prática**: ao diagnosticar "algo que funcionava parou de
funcionar", considerar se um deploy aconteceu no meio — isso é uma
variável de confusão real que já atrapalhou diagnóstico neste projeto.
Nunca presumir que dado salvo (busca, cache, config da tela de
Configurações) sobrevive a um deploy no plano grátis.

## 3. Zip/código de terceiro pode estar em snapshot antigo — sempre diff antes de adotar

Várias submissões de "outra IA"/"outro competidor" ao longo do projeto
revertiam correções já aplicadas (stops-filter, response-shape resilience,
deadline reduction, aliases de cidade) porque foram construídas em cima de
uma base desatualizada. Aplicar sem verificar teria reintroduzido bugs já
resolvidos.

**Regra prática**: antes de adotar qualquer código externo (zip, patch,
sugestão), `diff` contra o arquivo atual do repositório — nunca contra a
memória de como o arquivo "costumava ser".

## 4. Quota estourada e bug de parsing produzem o mesmo sintoma visível

"Zero ofertas" pode ser: fonte sem cobertura pra rota, cota mensal
estourada, parsing quebrado, ou timeout. Todos parecem iguais pro usuário
("não veio nada"). Sem log específico por causa, cada rodada de diagnóstico
vira uma nova pergunta "por que não veio nada dessa vez" sem separar qual
das 4 causas é.

**Regra prática**: toda fonte precisa distinguir essas causas no log, não
só retornar `offers: []`.

## 5. Não empilhar mudanças não relacionadas entre um teste e outro

Quando várias correções são deployadas juntas e o usuário testa depois,
fica impossível saber qual mudança resolveu (ou causou) o quê. Preferir
commits pequenos e escopados, e — quando possível — pedir pro usuário
testar depois de UMA mudança específica, não depois de um lote.

## Como isso deveria influenciar decisões futuras

Antes de declarar uma integração "pronta" ou "corrigida": ela tem log de
diagnóstico pros 3 casos da seção 1? Se a mudança envolve dado
salvo/configuração, ela sobrevive a um deploy no plano atual? Se a fonte é
paga, tem como saber se "zero resultado" foi quota ou parsing?
