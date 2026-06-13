# Feature Specification: Meu Dia + Time-blocking — Fase 3 (fatia 016) do Sistema de Tarefas Próprio

**Feature Branch**: `016-tasks-meudia`

**Created**: 2026-06-13

**Status**: Planejada — não implementada. Fonte de design:
`docs/claude_design/design_handoff_kaguya_tarefas/README.md` (§6.1) + protótipo
`docs/claude_design/design_handoff_kaguya_tarefas/kaguya/screens-today.jsx`. Hoje a
`webapp/.../pages/kaguya/screens/TodayScreen.tsx` é só a versão simples do MVP (vencidas + hoje +
quick-add); o ritual rico desta fatia ainda não existe.

**Spec master**: [`specs/010-kaguya-tasks-app/`](../010-kaguya-tasks-app/spec.md) — esta é a spec
filha da **Fase 3** ("time-blocking / Meu Dia" da master; ver User Story 3, FR-018/FR-019/FR-020 e
SC-005). O schema (`tasks.my_day_date`, `tasks.start_at`, `tasks.end_at`, `tasks.duration_min`) e os
princípios (paridade de canais, soft delete, fuso `America/Sao_Paulo`, single-user) estão definidos lá
e em [`data-model.md`](../010-kaguya-tasks-app/data-model.md). Constrói sobre as Fases 1/2
([`011`](../011-tasks-mvp/spec.md), [`012`](../012-tasks-recurrence/spec.md),
[`013`](../013-tasks-tags-smartlists-calendar/spec.md)). O frontend segue o **guia canônico**
[`frontend-design-guide.md`](../010-kaguya-tasks-app/frontend-design-guide.md) + o
[`design-guide.md`](design-guide.md) desta fatia.

**Input**: "Tela 'Meu Dia' (ritual estilo Sunsama) + time-blocking, cruzando tarefas com o Google
Calendar. As colunas de schema (`my_day_date`, `start_at`, `end_at`, `duration_min`) já nasceram
dormentes na Fase 1 — SEM migração de schema; só lógica, fachadas (router `/api/tasks/*` + agente
Telegram) e UI. Paridade total Telegram ⇄ webapp."

---

## Escopo da fatia

**Entra na 016** (colunas já existem no banco desde a Fase 1):

- **Seleção "Meu Dia"** — marcar/desmarcar uma tarefa como parte do dia de uma **data específica**
  (`my_day_date`). É uma seleção independente do `due_date`: posso puxar para hoje algo que vence
  amanhã, e algo que vence hoje pode não estar no meu plano de hoje.
- **Ritual diário (Sunsama)** — ao abrir Meu Dia: (1) **pendências de ontem** (tarefas que estavam no
  Meu Dia de ontem e não foram concluídas) com ações **Hoje / Amanhã / Depois**; (2) **No plano de
  hoje** (as tarefas selecionadas, arrastáveis); (3) **Sugestões** (tarefas que vencem em breve, com
  botão **"+ Puxar"** para o dia).
- **Estimativa de duração** — editar `duration_min` por tarefa (a unidade que alimenta a capacity).
- **CapacityBar** — soma das estimativas do plano de hoje **+** os eventos do Google Calendar do dia
  (via MCP existente, reusando `tools_calendar`) versus a **janela útil 8h–22h**; quando o plano
  excede a janela livre, a barra avança em vermelho-lacre.
- **DayTimeline + time-blocking** — uma régua de horas **07h–23h**; arrastar uma tarefa do plano para
  uma hora grava `start_at`/`end_at` (e deriva `due_time`), transformando intenção em agenda. O bloco
  aparece também na view Calendário (semana) da 013.
- **Hero** — eyebrow "Meu Dia · saudação", data por extenso, **3 stats** (no plano / estimado /
  folga-ou-acima) e o retrato `kaguya.jpg` à direita.
- **Paridade total** — toda capacidade nasce na camada de lógica; o Telegram ("o que planejei pra
  hoje?", "põe X no meu dia", "estima 30min na tarefa Y") e o router `/api/tasks/*` são fachadas finas.
  A *timeline* visual é webapp-only; o equivalente Telegram é o relato textual do plano + capacity.

**Fica para depois**: Eisenhower (fatia 017); Command Palette / atalhos / lembretes proativos
(fatia 018 / Fase 5); responsividade mobile completa (Fase 5). Sem AI scheduling (out of scope da
master). Sem escrever os blocos de tempo de volta no Google Calendar — o time-block vive em `tasks`
(o Calendar é fonte de leitura para capacity, não destino de escrita aqui).

**Sem migração de schema**: `my_day_date`, `start_at`, `end_at` e `duration_min` já nasceram na
Fase 1. Esta fatia só acrescenta lógica, fachadas e UI. (Hoje `update_task` **não** aceita esses
campos — ver `data-model.md`.)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Montar o plano do dia com o ritual (Priority: P1)

De manhã abro **Meu Dia**. Primeiro reviso as **pendências de ontem** (o que ficou sem concluir) e,
para cada uma, escolho **Hoje** (traz para o plano de hoje), **Amanhã** (empurra para amanhã) ou
**Depois** (tira do Meu Dia, sem perder a tarefa). Depois monto o **plano de hoje**: puxo tarefas das
**Sugestões** (as que vencem em breve) com "+ Puxar", ou capturo no quick-add. Pelo Telegram faço o
mesmo: "o que planejei pra hoje?" e "põe 'comprar café' no meu dia".

**Why this priority**: é o núcleo da fatia — sem a seleção "Meu Dia" e o ritual de revisão/seleção, o
resto (capacity, timeline) não tem o que medir. Sozinha já entrega o hábito de planejamento diário.

**Independent Test**: marcar tarefas no Meu Dia de ontem, deixar uma aberta, abrir Meu Dia hoje e
conferir que ela aparece em "pendências de ontem"; aplicar Hoje/Amanhã/Depois e verificar o efeito;
puxar uma sugestão; fazer tudo equivalente pelo Telegram e ver refletido no webapp.

**Acceptance Scenarios**:

1. **Given** uma tarefa marcada no Meu Dia de ontem e não concluída, **When** abro Meu Dia hoje, **Then** ela aparece na seção "Pendências de ontem" com as ações Hoje / Amanhã / Depois.
2. **Given** uma pendência de ontem, **When** clico em **Hoje**, **Then** ela entra no plano de hoje (`my_day_date = hoje`) e some das pendências.
3. **Given** uma pendência de ontem, **When** clico em **Depois**, **Then** ela sai do Meu Dia (`my_day_date = NULL`) mas **continua existindo** na sua lista.
4. **Given** uma tarefa que vence nos próximos ≤7 dias e não está no plano, **When** vejo as **Sugestões**, **Then** ela aparece com "+ Puxar"; ao puxar, entra no plano de hoje.
5. **Given** o Telegram, **When** digo "põe 'revisar relatório' no meu dia", **Then** a tarefa ganha `my_day_date = hoje` e aparece no plano de hoje do webapp (paridade).
6. **Given** o Telegram, **When** pergunto "o que planejei pra hoje?", **Then** recebo a lista do plano de hoje — a mesma do webapp.

---

### User Story 2 - Ver se o dia cabe e bloquear horários (Priority: P2)

Com o plano montado, estimo a **duração** de cada tarefa e o sistema mostra uma **CapacityBar**: a
soma das estimativas + os eventos do meu Google Calendar do dia, comparada com a janela útil (8h–22h).
Se o plano excede, a barra me avisa em vermelho. Então arrasto tarefas para a **timeline** (07h–23h),
dando a cada uma um horário (`start_at`/`end_at`) — e esse bloco aparece também no Calendário (semana).

**Why this priority**: é o diferencial do sistema (tarefas + agenda sob o mesmo teto). Depende do
plano da US1 e dos eventos do Calendar (MCP já existente).

**Independent Test**: com eventos no Calendar somando ~4h e tarefas estimadas somando ~6h, conferir
que a CapacityBar indica estouro; arrastar uma tarefa para as 14h e verificar `start_at=14:00` +
`end_at` derivado da estimativa, e que ela aparece na view Calendário daquele dia.

**Acceptance Scenarios**:

1. **Given** 4h de eventos no Calendar e tarefas do plano estimadas somando 6h numa janela de 8h–22h, **When** vejo a CapacityBar, **Then** ela mostra que o plano **excede** a capacidade livre (avança em vermelho-lacre).
2. **Given** uma tarefa do plano sem horário com estimativa de 30min, **When** a arrasto para as 14h na timeline, **Then** ela ganha `start_at=14:00` e `end_at=14:30` e some da fila "sem horário".
3. **Given** uma tarefa sem estimativa, **When** a arrasto para um slot, **Then** recebe um bloco de duração padrão (30min) e fica editável.
4. **Given** uma tarefa com bloco de tempo, **When** abro a view Calendário (semana) da 013, **Then** o bloco aparece no dia/horário corretos.
5. **Given** uma tarefa com bloco, **When** removo o horário, **Then** `start_at`/`end_at` voltam a nulos e ela sai da timeline (continua no plano).

---

### User Story 3 - Planejar e consultar o Meu Dia pelo Telegram (Priority: P3)

Quando não estou no computador, uso a Kaguya: "o que tenho planejado pra hoje e cabe no dia?",
"estima 45 minutos em 'preparar apresentação'", "tira 'arrumar a mesa' do meu dia". Recebo o plano,
o resumo de capacity (em texto) e confirmo as mudanças — exatamente o mesmo motor do webapp.

**Why this priority**: fecha a paridade. A timeline visual é webapp-only, mas planejar, estimar e ler
o capacity precisam existir nos dois canais (princípio inegociável da master, FR-001/FR-002).

**Independent Test**: pelo Telegram, montar o plano e estimar durações; pedir o resumo do dia e
conferir que o número de capacity bate com o do webapp para o mesmo dia.

**Acceptance Scenarios**:

1. **Given** um plano com estimativas, **When** pergunto à Kaguya "meu dia cabe?", **Then** recebo o total estimado + horas de evento + janela livre, igual ao cálculo do webapp.
2. **Given** uma tarefa, **When** digo "estima 45min nela", **Then** `duration_min=45` e a CapacityBar do webapp recalcula.
3. **Given** uma tarefa no plano, **When** digo "tira do meu dia", **Then** `my_day_date=NULL` e ela some do plano nos dois canais.

---

### Edge Cases

- **"Meu Dia" ≠ "vence hoje"**: `my_day_date` é uma seleção independente de `due_date`. Uma tarefa
  pode estar no plano de hoje sem vencer hoje, e vice-versa. A tela "Hoje" simples (MVP) continua
  existindo separada, baseada em `due_date`.
- **Pendência de ontem**: definida como tarefa com `my_day_date < hoje` e ainda **aberta** (sem
  `completed_at`, sem `deleted_at`). Tarefas concluídas ontem não viram pendência.
- **Tarefa recorrente no Meu Dia**: ao concluir a ocorrência e nascer a próxima (motor da 012), a nova
  ocorrência **não** herda `my_day_date` (o plano é por dia; a próxima entra no plano quando o usuário
  a puxar). `start_at`/`end_at` também não são herdados.
- **Arrastar para slot ocupado por evento do Calendar**: permitido (não há lock); a CapacityBar é que
  sinaliza o estouro. Sem resolução automática de conflito (single-user, last-write-wins).
- **`end_at` sem `start_at`**: proibido pela CHECK do schema; a camada de lógica rejeita com erro
  amigável (nunca IntegrityError 500).
- **Estimativa ausente na capacity**: tarefas sem `duration_min` contam como **0** na soma estimada
  (a barra não inventa duração), mas aparecem destacadas como "sem estimativa".
- **Dia sem nenhuma tarefa no plano**: Meu Dia mostra estado vazio acolhedor + sugestões; a
  CapacityBar reflete só os eventos do Calendar.
- **Calendar indisponível** (MCP offline / sem credencial): a capacity cai para "só estimativas de
  tarefas" e a UI sinaliza que a agenda não pôde ser lida — **nunca** quebra o Meu Dia.
- **Fuso**: "hoje", janela 8h–22h e timeline 07h–23h usam `America/Sao_Paulo`, consistente com o
  resto do sistema.

## Requirements *(mandatory)*

### Functional Requirements

**Seleção e ritual (Meu Dia)**

- **FR-001** (≡ master FR-019): O sistema MUST oferecer a tela **Meu Dia** que guia o ritual diário:
  **revisar pendências de ontem** → **selecionar tarefas de hoje** → **estimar duração** → **comparar
  com a capacidade** derivada do Google Calendar.
- **FR-002**: O usuário MUST poder **marcar/desmarcar** uma tarefa como parte do Meu Dia de uma data
  (`my_day_date`), de forma independente do `due_date`.
- **FR-003**: As **pendências de ontem** (tarefas com `my_day_date` anterior a hoje, ainda abertas)
  MUST ser apresentadas com as ações **Hoje** (`my_day_date=hoje`), **Amanhã** (`my_day_date=amanhã`)
  e **Depois** (`my_day_date=NULL`, mantém a tarefa).
- **FR-004**: O sistema MUST oferecer **Sugestões** — tarefas abertas que vencem em breve (próximos
  ≤7 dias) e não estão no plano de hoje — com a ação **"+ Puxar"** para o dia.
- **FR-005**: O usuário MUST poder editar a **estimativa de duração** (`duration_min`) de uma tarefa
  por qualquer canal.

**Capacity e time-blocking**

- **FR-006** (≡ master FR-020): O usuário MUST poder dar horário a uma tarefa por **drag para um slot
  do dia** (time-blocking), gravando `start_at`/`end_at`; o bloco MUST aparecer na view Calendário.
- **FR-007** (≡ master SC-005): O sistema MUST calcular e exibir a **capacidade do dia** = soma das
  estimativas do plano **+** duração dos eventos do Google Calendar do dia, comparada com a **janela
  útil 8h–22h**, sinalizando quando o plano **excede** a janela livre.
- **FR-008**: A leitura dos eventos do Calendar para a capacity MUST reusar o **MCP existente**
  (`tools_calendar` / `mcp_servers/calendar`); a indisponibilidade do Calendar MUST degradar com
  elegância (capacity só de tarefas + aviso), nunca quebrar a tela.

**Backend / paridade**

- **FR-009**: A camada de lógica (`tools_tasks.py`) MUST expor a seleção Meu Dia, a estimativa e o
  time-block como funções sobre o PostgreSQL — incluindo **estender `update_task`** (ou tools
  dedicadas) para aceitar `my_day_date`, `start_at`, `end_at`, `duration_min`, hoje **não aceitos**.
- **FR-010** (paridade): Selecionar/desselecionar Meu Dia, estimar duração e ler o plano + capacity
  MUST estar disponíveis e idênticos nos dois canais. A *timeline* visual é webapp-only; o equivalente
  no Telegram é o relato textual do plano + capacity. O drag de time-blocking é webapp; o Telegram
  pode definir um horário por intenção ("bloqueia X às 14h"), opcional.

### Key Entities

Definidas na master (`data-model.md`). Esta fatia **ativa** colunas que estavam adormecidas na
entidade **Tarefa** (`tasks`):

- `my_day_date` (DATE): a data para a qual a tarefa está selecionada no Meu Dia (independente de
  `due_date`). Índice parcial `idx_tasks_my_day` já existe.
- `start_at` / `end_at` (TIMESTAMPTZ): o bloco de tempo. CHECK `end_at IS NULL OR start_at IS NOT NULL`.
- `duration_min` (INT): estimativa de duração, insumo da CapacityBar.

**Capacity** é uma **métrica derivada** (não coluna) — calculada na leitura a partir de
`SUM(duration_min)` do plano + eventos do Calendar. Detalhe em [`data-model.md`](data-model.md) e
[`contracts/`](contracts/).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001** (≡ master SC-005): O plano do dia reflete a **capacidade real**: a soma de estimativas
  versus horas livres do Calendar bate com verificação manual — coberto por teste (capacity como
  função pura sobre `(estimativas, eventos, janela)`).
- **SC-002**: Marcar/desmarcar Meu Dia, estimar duração e ler o plano são executáveis pelos **dois
  canais**, cada um funcionando com o outro desligado (auditável por checklist de paridade).
- **SC-003**: Arrastar uma tarefa de 30min para as 14h resulta em `start_at=14:00`/`end_at=14:30` e a
  tarefa aparece no dia/horário certos da view Calendário — teste de integração.
- **SC-004**: Uma pendência de ontem aparece corretamente (aberta, `my_day_date<hoje`) e as ações
  Hoje/Amanhã/Depois ajustam só `my_day_date` (a tarefa nunca é apagada) — teste de integração.
- **SC-005**: Com o Calendar indisponível, Meu Dia abre e calcula a capacity só com estimativas,
  exibindo o aviso — sem erro 500.

## Assumptions

- O schema da Fase 1 (com `my_day_date`, `start_at`, `end_at`, `duration_min`) já está aplicado em
  produção — esta fatia **não** altera o schema.
- Janela útil padrão **8h–22h** para a capacity e timeline **07h–23h** (do protótipo); não
  configuráveis nesta fatia (Tweaks só temas/acento/densidade hoje).
- "Sugestões" = tarefas abertas com `due_date` nos próximos ≤7 dias e fora do plano de hoje (régua do
  protótipo `screens-today.jsx`). Distinta da régua de "urgente" (`≤2 dias`) que a fatia 017
  (Eisenhower) usa — são conceitos separados.
- A capacity lê eventos do dia via o MCP do Calendar já existente; escrita no Calendar **não** entra
  (o bloco de tempo vive só em `tasks`).
- Duração padrão ao arrastar sem estimativa: **30 min** (editável depois).
- "Hoje" e a aritmética de datas usam `America/Sao_Paulo` (consistente com `tools_tasks`).
- Single-user: sem conflitos de agenda entre pessoas; resolução de conflito de bloco é
  last-write-wins.
