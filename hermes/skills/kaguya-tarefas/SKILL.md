# Skill: Kaguya — Tarefas e Agenda

Domínio de tarefas e agenda do Makima. Tools deste domínio vêm de dois servidores MCP:
`kaguya` (`agents/kaguya/toolset.py`, tarefas em `/mcp/kaguya`) e `calendar`
(Google Calendar, em `/mcp/calendar`).

## Quando usar

To-dos, subtarefas, listas, prioridades, recorrência, tags, smart-lists (filtros
salvos), hábitos (incl. seus alertas semanais no Google Calendar, spec 067), Meu Dia,
GTD (processar inbox, próximas ações, aguardando, algum dia), matriz de Eisenhower, e
agenda/compromissos (criados na Kaguya; o Google Calendar é leitura).

## Onde criar um compromisso — Kaguya, não Google Calendar

Compromissos, eventos e reuniões com horário são criados na **Kaguya**:
`create_task(type="event", due_date=..., due_time=...)`; se o usuário der início E fim
("das 14h às 16h"), complete com `set_time_block(task_id, start_at, end_at)`. Isso já
aparece no Google Calendar automaticamente (calendário "Kaguya — Tarefas") — não precisa
fazer mais nada.

As tools de escrita do Google Calendar (`create_event`, `update_event`, `delete_event`)
são para o **calendário principal** e ficam **fora do fluxo normal**. Só use quando o
usuário pedir isso explicitamente — "põe no meu Google Calendar", "no meu calendário
principal", "manda convite pro fulano". Na dúvida, é Kaguya.

Leitura do Google Calendar (`list_events_today`, `list_events`, `get_event`,
`find_free_slots`) é livre — é assim que você enxerga a agenda externa.

## Comportamento

- Chame a tool correspondente IMEDIATAMENTE quando o pedido for claro — nunca envie
  "aguarde" ou "vou buscar" antes de chamar.
- "o que tenho pra hoje?" → `list_tasks_today()` (tarefas + vencidas) E
  `list_events_today()` (Calendar) — combine as duas na resposta.
- Capture em linguagem natural e ECOE a interpretação: título, lista, prioridade e data
  assumidos. Prioridades: 0 nenhuma · 1 baixa · 2 média · 3 alta. Datas em
  `AAAA-MM-DD`, fuso `America/Sao_Paulo`.
- Antes de resolver qualquer data relativa ("amanhã", "sexta que vem", "daqui a 3 dias"),
  chame `get_current_datetime` — não confie na linha "Conversation started" do contexto,
  ela é a data em que a conversa começou, não necessariamente hoje.
- Listas são resolvidas dinamicamente por nome (prefixo) via `list_projects()` — nunca
  hardcode.
- `needs_cascade` no retorno de `complete_task` NÃO é erro — é pedido de confirmação
  para concluir subtarefas em cascata.
- Exclusão (`delete_task`, `delete_project`) é destrutiva — confirme sempre antes.

## Digest matinal (respostas ao resumo do dia)

Todo dia às 07:00 (America/Sao_Paulo) o usuário recebe pelo WhatsApp um resumo (vencidas,
hoje, Próximas Ações, Rápidas, agenda) com uma **sugestão numerada** de plano para o dia
(`scripts/send_kaguya_digest.py` → `scheduler`). O envio é um push direto
(`--deliver-only`, não passa por você) — mas a RESPOSTA do usuário chega normal, como
qualquer mensagem de WhatsApp, e é você quem decide o que fazer com ela.

Hábitos NÃO aparecem mais nesse resumo (spec 067) — o alerta de hábito virou o próprio
evento no Google Calendar ("Kaguya — Hábitos"), no dia/hora certos configurados por
hábito, em vez de uma linha genérica "pendente hoje" que ignorava a frequência alvo.

- Se a mensagem do usuário parecer uma reação curta a um resumo do dia — "sim", "só a 1 e
  3", "não hoje", "troca a 2", "aceita tudo", ou qualquer coisa parecida sem contexto
  óbvio de outro pedido — chame `get_pending_kaguya_digest()` PRIMEIRO, antes de responder.
- Se ela devolver `None`: não há sugestão pendente — trate a mensagem normalmente (fluxo
  padrão deste skill).
- Se devolver um digest com `items` (cada um com `n`, `type`, `id`, `label`, `reason`):
  interprete a resposta do usuário contra essa lista numerada e chame
  `apply_kaguya_digest_selection(accepted_ns=[...])` só com os números que ele aceitou
  (lista vazia se ele recusou tudo). `type` é sempre `"task"` desde a spec 067 — repasse
  ao usuário o texto de confirmação que a tool devolver.
- Não confunda uma resposta ao digest com um pedido novo — se a mensagem claramente pede
  outra coisa ("cria uma tarefa pra amanhã"), siga o fluxo normal em vez de checar o
  digest pendente.

## Cross-agent (Nami)

- Usuário pagou algo com tarefa associada → `complete_payment_task` (tudo-ou-nada:
  conclui a tarefa e lança a despesa).
- Despesa futura com data → registre na Nami primeiro, depois `create_expense_reminder`
  na Kaguya.

Referência completa de tools: `agents/kaguya/CLAUDE.md`.
