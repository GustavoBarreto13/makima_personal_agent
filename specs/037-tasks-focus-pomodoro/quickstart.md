# Quickstart: Foco / Pomodoro (spec 037)

Pré-requisito: schema aplicado (`focus_sessions`, `focus_prefs` — ver `data-model.md`),
webapp rodando (`webapp/backend` + `webapp/frontend`).

## SC-001 — Iniciar foco numa tarefa em até 2 cliques

1. Abrir qualquer lista de tarefas com pelo menos uma tarefa.
2. Passar o mouse sobre a tarefa → clicar "Focar" (1º clique) → escolher preset 25/5 no modal
   (2º clique).
3. **Esperado**: o widget flutuante aparece imediatamente com "25:00" e o título da tarefa.

## SC-002 — Reload no meio da sessão

1. Com uma sessão ativa (do passo anterior), anotar o tempo restante mostrado (ex.: 24:10).
2. Recarregar a página (F5).
3. **Esperado**: o widget reaparece com tempo restante igual a `24:10` menos o tempo real
   gasto no reload (diferença < 2s do valor esperado calculado por relógio de parede).

## SC-003 — Estatísticas do dia batem com as sessões

1. Concluir uma sessão de 25 min numa tarefa (deixar terminar naturalmente ou usar
   "concluir antecipadamente" e conferir que o tempo registrado é o decorrido real).
2. Iniciar uma sessão avulsa (sem tarefa) de 15 min custom e concluir antes do fim (~10 min).
3. Abrir o Meu Dia.
4. **Esperado**: "Focado hoje" mostra a soma exata dos dois (ex.: "35min · 2 sessões"),
   batendo com `GET /focus/today`.

## US1 — Cancelar não conta

1. Iniciar uma terceira sessão e cancelá-la antes do fim.
2. **Esperado**: `GET /focus/today` continua mostrando os mesmos 35min/2 sessões do passo
   anterior — a cancelada não aparece nas estatísticas nem no resumo do dia.

## SC-004 — Sessão abandonada não credita além do planejado

1. Iniciar uma sessão de 25/5 numa tarefa.
2. Simular abandono: aguardar (ou, em teste manual, ajustar `started_at` no banco para
   `now() - interval '1 hour'`) além de `duration_planned_min + break_planned_min`.
3. Reabrir o painel (dispara `GET /focus/active`).
4. **Esperado**: a sessão aparece no histórico como não-completada
   (`completed=false`), com `duration_focused_min = 25` (nunca 60).

## SC-005 — Widget em todas as telas

1. Com uma sessão ativa, navegar por Meu Dia → uma lista → Calendário → Hábitos.
2. **Esperado**: o widget permanece visível e com o tempo correndo em todas, sem remontar
   (sem piscar/reiniciar a contagem).

## US3 — Série da semana e histórico do dia

1. Com sessões concluídas em dias diferentes (ou simulado via `started_at`/`ended_at` no
   banco), consultar `GET /focus/week`.
2. **Esperado**: 7 entradas (uma por dia, últimos 7 dias locais), com `total_min`/`sessoes`
   corretos por dia.
3. Consultar `GET /focus/history?date=YYYY-MM-DD` de um dia com sessões.
4. **Esperado**: lista com tarefa (ou null = avulsa), horário de início e duração focada.

> Nota de execução: como nas specs 035/036, este ambiente de implementação não tem acesso a
> um PostgreSQL real — os cenários acima devem ser validados manualmente contra o VPS/dev DB
> após o deploy, não foram executados neste sandbox.
