# Research / Decisões — Meu Dia + Time-blocking (fatia 016)

Decisões de design que sustentam a [`spec.md`](spec.md). Cada uma resolve uma ambiguidade do handoff
ou do protótipo.

## D1 — `my_day_date` é independente de `due_date`
**Decisão**: a seleção "Meu Dia" é uma data própria (`my_day_date`), não derivada do vencimento.
**Porquê**: o ritual Sunsama (master FR-019) é "escolher o que farei hoje", que não é o mesmo que "o
que vence hoje". Permite puxar para hoje algo que vence semana que vem, e deixar fora do plano algo
que vence hoje. A tela "Hoje" simples do MVP (baseada em `due_date`) continua existindo separada.

## D2 — "Pendência de ontem" = `my_day_date < hoje` e aberta
**Decisão**: pendências são tarefas que estavam num **plano de Meu Dia anterior** e seguem abertas —
não simplesmente "vencidas por `due_date`".
**Porquê**: é a semântica correta do ritual ("o que prometi fazer e não fiz"). O protótipo
`screens-today.jsx` aproximou com `due < hoje` porque o mock só tinha um booleano `today`; com a
coluna `my_day_date` real, a definição por data de plano é mais fiel. Tarefas vencidas por `due_date`
seguem aparecendo na tela "Hoje" simples e nas Sugestões.

## D3 — Capacity é função pura, calculada na leitura
**Decisão**: nada de capacity persistida; é uma função `(estimativas, eventos, janela) → stats`,
candidata a motor isolado (`capacity.py`) com teste puro — espelhando o padrão de
`recurrence.py`/`habit_strength.py`.
**Porquê**: testável sem banco (SC-001), e a verdade vem sempre de `duration_min` + Calendar ao vivo.

## D4 — Degradação graciosa quando o Calendar falha
**Decisão**: se o MCP do Calendar não responde, `agenda_min=0` + `calendar_ok:false`; a tela abre.
**Porquê**: o Meu Dia não pode depender de um serviço externo para funcionar (FR-008/SC-005). O
Calendar é fonte de leitura para capacity, não pré-requisito.

## D5 — Bloco de tempo vive em `tasks`, não escreve no Google Calendar
**Decisão**: time-blocking grava `start_at`/`end_at` na tarefa; **não** cria evento no Calendar.
**Porquê**: o Calendar é leitura (capacity); escrever de volta abre conflitos de sincronização e
duplicação fora do escopo desta fatia. A view Calendário (013) já sabe mostrar tarefas datadas.

## D6 — Sugestões ≤7 dias; "urgente" ≤2 dias é outra coisa
**Decisão**: Sugestões = vence nos próximos ≤7 dias (régua do protótipo). A régua "urgente" `≤2 dias`
pertence à fatia 017 (Eisenhower) e não se mistura aqui.
**Porquê**: evitar acoplar dois conceitos com janelas diferentes.

## D7 — Tools dedicadas + extensão mínima de `update_task`
**Decisão**: criar tools dedicadas (`add_to_my_day`, `set_time_block`, `list_my_day`, …) para a
semântica clara do ritual, e estender `update_task` apenas para `duration_min` (estimativa é uma
edição comum de tarefa).
**Porquê**: `update_task` hoje não aceita esses campos (`tools_tasks.py:663`); poluí-lo com toda a
semântica de plano/bloco prejudica a legibilidade. Tools dedicadas refletem ações do ritual.

## D8 — Janela 8h–22h e timeline 07h–23h fixas nesta fatia
**Decisão**: usar as constantes do protótipo, sem configuração.
**Porquê**: Tweaks hoje só cobre tema/acento/densidade/marca/animações; tornar a janela configurável
é refinamento futuro, não bloqueia o valor central.

## D9 — Duração padrão de bloco = 30 min
**Decisão**: arrastar uma tarefa sem estimativa cria bloco de 30min, editável.
**Porquê**: dá um bloco utilizável imediatamente sem forçar o usuário a estimar antes de planejar
(do protótipo: `t.est || 30`).
