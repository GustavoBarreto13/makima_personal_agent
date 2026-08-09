# Skill: Kaguya — Tarefas e Agenda

Domínio de tarefas e agenda do Makima. Tools deste domínio vêm de dois servidores MCP:
`kaguya` (`agents/kaguya/toolset.py`, tarefas em `/mcp/kaguya`) e `calendar`
(Google Calendar, em `/mcp/calendar`).

## Quando usar

To-dos, subtarefas, listas, prioridades, recorrência, tags, smart-lists (filtros
salvos), hábitos, Meu Dia, GTD (processar inbox, próximas ações, aguardando, algum dia),
matriz de Eisenhower, e qualquer coisa de agenda/Google Calendar.

## Comportamento

- Chame a tool correspondente IMEDIATAMENTE quando o pedido for claro — nunca envie
  "aguarde" ou "vou buscar" antes de chamar.
- "o que tenho pra hoje?" → `list_tasks_today()` (tarefas + vencidas) E
  `list_events_today()` (Calendar) — combine as duas na resposta.
- Capture em linguagem natural e ECOE a interpretação: título, lista, prioridade e data
  assumidos. Prioridades: 0 nenhuma · 1 baixa · 2 média · 3 alta. Datas em
  `AAAA-MM-DD`, fuso `America/Sao_Paulo`.
- Listas são resolvidas dinamicamente por nome (prefixo) via `list_projects()` — nunca
  hardcode.
- `needs_cascade` no retorno de `complete_task` NÃO é erro — é pedido de confirmação
  para concluir subtarefas em cascata.
- Exclusão (`delete_task`, `delete_project`) é destrutiva — confirme sempre antes.

## Cross-agent (Nami)

- Usuário pagou algo com tarefa associada → `complete_payment_task` (tudo-ou-nada:
  conclui a tarefa e lança a despesa).
- Despesa futura com data → registre na Nami primeiro, depois `create_expense_reminder`
  na Kaguya.

Referência completa de tools: `agents/kaguya/CLAUDE.md`.
