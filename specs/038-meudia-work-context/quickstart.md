# Quickstart: Meu Dia — contexto Trabalho vs Pessoal (spec 038)

Pré-requisito: schema aplicado (`task_projects.context`, `calendar_prefs.context`), webapp
rodando.

## US1 — Marcar lista e calendário como Trabalho

1. Editar uma lista (ex.: "Projetos do escritório") → marcar contexto **Trabalho**.
2. Conferir no Meu Dia que as tarefas dessa lista aparecem na seção Trabalho.
3. Mover uma tarefa dela para uma lista Pessoal → conferir que ela migra para a seção
   Pessoal imediatamente (sem editar a tarefa).
4. Num grupo com 2+ listas, aplicar "Marcar como Trabalho" no grupo inteiro → conferir que
   todas as listas do grupo mudam de uma vez (`updated` no response bate com a contagem).
5. Marcar um calendário conectado como Trabalho → seus eventos passam a contar na capacity
   de trabalho.
6. Tentar marcar o Inbox como Trabalho → confirmar que é rejeitado (400, "sempre Pessoal").

## US2 — Meu Dia dividido com duas capacities

1. Com tarefas em listas de ambos os contextos (com `duration_min`) e eventos em calendários
   de ambos os tipos, abrir o Meu Dia.
2. **Esperado**: duas seções (Trabalho/Pessoal), cada uma só com seus itens.
3. Conferir que `capacity_work.estimado_min` soma só as estimativas das tarefas de trabalho
   (mesmo para `agenda_min` com os eventos de trabalho) — e o mesmo para `capacity_personal`.
4. **SC-002**: conferir que `capacity_work.estimado_min + capacity_personal.estimado_min ==
   capacity.estimado_min` (idem para `agenda_min` e `no_plano`) — ver R6 do `research.md`
   sobre por que `livre_min`/`folga_min` NÃO são somados dessa forma.
5. Deixar um dos contextos sem nenhuma tarefa/evento (ex.: fim de semana) → a seção vazia se
   recolhe na UI.
6. Conferir que a timeline do dia continua única, mostrando blocos dos dois contextos juntos.
7. Pedir o resumo do dia pelo Telegram (`/meudia` ou equivalente) → conferir que menciona os
   dois blocos ("trabalho: X de Y; pessoal: Z de W").

## US3 — Alternar para visão única

1. No Meu Dia, alternar o toggle para "visão única".
2. **Esperado**: uma lista única e uma capacity total (igual ao comportamento anterior à
   spec, usando os campos `plano`/`capacity` não particionados).
3. Recarregar a página → a escolha (localStorage) persiste.
4. Alternar de volta para "dividida".

## FR-010 — Retrocompatibilidade

1. Num ambiente sem nenhuma lista marcada como Trabalho, abrir o Meu Dia.
2. **Esperado**: a seção Trabalho está vazia/recolhida e a experiência é indistinguível do
   comportamento anterior à spec 038.

> Nota de execução: como nas specs 035/036/037, este ambiente de implementação não tem
> acesso a um PostgreSQL real — os cenários acima devem ser validados manualmente contra o
> VPS/dev DB após o deploy.
