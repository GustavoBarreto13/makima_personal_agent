# Feature Specification: Kaguya Tasks App — Sistema de Tarefas Próprio (Spec Master)

**Feature Branch**: `010-kaguya-tasks-app`

**Created**: 2026-06-11

**Status**: Draft (spec master — guarda visão, arquitetura e contrato do sistema; cada fase vira uma spec filha)

**Input**: User description: "Sistema de tarefas próprio (Kaguya Tasks App) — spec master de arquitetura. Romper com o TickTick: PostgreSQL local vira source of truth de tarefas. Kaguya deixa de usar MCP do TickTick e vira agente estilo Nami (tools.py → agents/db.py), mantendo só o MCP do Google Calendar. Dois frontends paritários e independentes sobre a mesma base: Telegram (captura/conversa via Kaguya) e sub-app visual na webapp (/tasks/*, padrão shell Violet/Nami/Frieren) — cada canal 100% utilizável sem o outro. Escopo single-user. Princípio 'uma tarefa, várias views': lista, Kanban, calendar, Eisenhower derivada, Meu Dia. Edge cases de recorrência especificados (semântica Todoist). Faseamento 011–015. Supersede a spec 004-kaguya-tarefas-webapp. Sem migração de dados do TickTick. Out of scope: AI scheduling, Gantt, anexos, colaboração."

---

## Visão

Um **super app de produtividade pessoal** que substitui o TickTick como motor de tarefas,
combinando o melhor de cada ferramenta de referência:

| Capacidade | Referência | Onde aparece |
|---|---|---|
| Captura sem fricção (linguagem natural) | Todoist | Telegram (NLP via Kaguya) + quick-add no webapp |
| Uma tarefa, várias views | Notion / Vikunja | Lista, Kanban, calendar, Eisenhower, Meu Dia |
| Velocidade e keyboard-first | Linear | Command palette (⌘K), criação em segundos |
| Polish e animações | Things 3 | Fase de refino visual |
| Recorrência robusta | Todoist | Dois modos + edge cases especificados abaixo |
| Smart lists como objetos de primeira classe | TickTick / OmniFocus | Filtros salvos na sidebar |
| Time-blocking | TickTick | Arrastar tarefa para horário, cruzando com Google Calendar |
| Ritual de planejamento diário | Sunsama | Tela "Meu Dia" |
| Priorização | Matriz de Eisenhower | View 2×2 derivada (prioridade × urgência) |
| Força do hábito (perdoa falhas) | Loop Habit Tracker | Módulo de hábitos |

### Decisão de arquitetura

1. **Source of truth**: PostgreSQL local (o mesmo banco de Nami / Frieren / Journal).
   Nenhuma API externa de tarefas. O usuário passa a ser dono do motor.
2. **Kaguya muda de natureza**: deixa de ser factory com MCP do TickTick e vira um agente
   no padrão Nami — `tools.py` falando com o banco via `agents/db.py`. Mantém **apenas**
   o MCP do Google Calendar. O `mcp_servers/ticktick/server.py` se aposenta.
3. **Independência de canais (princípio inegociável)**: o webapp é 100% utilizável sem o
   Telegram, e o Telegram (Kaguya) é 100% utilizável sem o webapp. Nenhuma operação pode
   existir só em um canal. Toda capacidade nasce como função sobre o PostgreSQL (camada
   única de lógica); o router `/api/tasks/*` e as tools da Kaguya são fachadas finas e
   paritárias sobre essa camada. Lembretes via Telegram (Fase 5) são complemento, nunca
   pré-requisito para o webapp funcionar.
4. **Cross-agent simplificado**: `complete_payment_task` (tarefa + despesa) vira uma
   transação no mesmo banco, sem cruzar API externa.
5. **Escopo single-user**: sem permissões, assignees, comentários ou colaboração.
6. **Começar limpo**: sem migração de dados do TickTick. O banco nasce vazio (apenas
   seeds estruturais, como o projeto Inbox).

### Documentos desta spec master

| Documento | Conteúdo |
|---|---|
| `spec.md` (este) | Visão, user stories por fase, requisitos, edge cases, critérios de sucesso |
| `data-model.md` | Schema PostgreSQL completo (tabelas, constraints, índices, DSL de filtros) |
| `frontend-design-guide.md` | Guia de design do sub-app webapp (shell, tokens, views, referências) |

### Supersedência

Esta spec **supersede a `specs/004-kaguya-tarefas-webapp/`** (painel híbrido com espelho
local do TickTick). Aquela abordagem mantinha o TickTick como source of truth; esta
elimina o TickTick por completo. A spec 004 recebe nota de superseded apontando para cá.

### Nota de governança

A constitution v1.0.0 descreve kaguya como "tarefas + agenda (TickTick + Google Calendar
via MCP)". Ao implementar a Fase 1 (spec 011), a constitution MUST receber um PATCH
amendment atualizando a linha para "tarefas + agenda (PostgreSQL + Google Calendar via
MCP)". O princípio em si (Agent Specialization) não muda — kaguya continua dona do
domínio tarefas+agenda.

---

## Faseamento → specs filhas

Cada fase é uma spec filha independente, criada quando a fase começar. Esta master define
o contrato comum (schema, princípios, edge cases) que todas respeitam.

| Spec filha | Fase | Escopo | Critério de pronto |
|---|---|---|---|
| `011-tasks-mvp` | 1 — MVP | Schema aplicado + CRUD + view lista + Kanban (um board) + captura via Telegram (tools Kaguya → Postgres) + router `/api/tasks/*` + shell mínimo no webapp. Aposentadoria do MCP TickTick. | Usuário gerencia o dia a dia de tarefas inteiramente no app próprio, por qualquer canal |
| `012-tasks-datas-recorrencia` | 2 — Datas e organização | Due dates/times + recorrência (modos `fixed` e `after_completion`) + smart lists + tags | Tarefas recorrentes funcionam com a semântica Todoist; filtros salvos aparecem na sidebar |
| `013-tasks-time-blocking` | 3 — Time-blocking | Cruzamento com Google Calendar (MCP existente) + tela "Meu Dia" (ritual Sunsama: revisar ontem → priorizar hoje → estimar duração → ver capacity) | Usuário planeja o dia arrastando tarefas para horários e vê se o dia "cabe" |
| `014-tasks-habitos` | 4 — Hábitos | Módulo habits + check-ins + força do hábito (fórmula Loop) + heatmap | Hábitos rastreáveis com força calculada que perdoa falhas pontuais |
| `015-tasks-polish` | 5 — Polish | Lembretes via Telegram (scheduler no coordinator) + UX Linear/Things (⌘K, animações) + responsivo | App agradável de usar no desktop e no celular; lembretes chegam na hora |

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Capturar e gerenciar tarefas pelo canal que estiver à mão (Priority: P1)

Sou o único usuário do sistema. Durante o dia, capturo tarefas pelo Telegram ("Kaguya,
anota: revisar relatório sexta") e, quando estou no computador, abro o webapp para ver
tudo em lista ou Kanban, criar, editar, completar, mover e excluir tarefas, organizadas
em projetos (contextos GTD como @Trabalho, @Casa). Tarefas capturadas sem projeto caem
no **Inbox**. Os dois canais mostram exatamente os mesmos dados — o que crio num aparece
no outro imediatamente.

**Why this priority**: é o núcleo do app — sem CRUD confiável nos dois canais, nada mais
existe. Sozinha, esta story já substitui o uso básico do TickTick.

**Independent Test**: criar tarefa pelo Telegram, vê-la no webapp; criar pelo webapp,
consultá-la pelo Telegram; completar/excluir em qualquer canal e confirmar consistência.

**Acceptance Scenarios**:

1. **Given** o banco vazio (só seeds), **When** o usuário diz à Kaguya "cria tarefa comprar café no projeto Casa", **Then** a tarefa existe no projeto Casa e aparece na view lista do webapp sem nenhuma ação extra.
2. **Given** uma tarefa criada pelo webapp, **When** o usuário pergunta à Kaguya "o que tenho pra hoje?", **Then** a resposta inclui essa tarefa.
3. **Given** uma captura sem projeto informado, **When** a tarefa é criada, **Then** ela cai no projeto Inbox.
4. **Given** um board Kanban com colunas, **When** o usuário arrasta uma tarefa para a coluna marcada como "concluída", **Then** a tarefa é completada (mesmo efeito de completá-la na lista).
5. **Given** uma tarefa com subtarefas, **When** o usuário a visualiza em qualquer canal, **Then** as subtarefas aparecem aninhadas e podem ser completadas individualmente.
6. **Given** uma exclusão de tarefa, **When** confirmada pelo usuário, **Then** a tarefa some das views mas permanece recuperável (soft delete) por período definido.

---

### User Story 2 - Datas, recorrência e listas inteligentes (Priority: P2)

Dou datas (e opcionalmente horas) às tarefas. Tarefas recorrentes ("pagar aluguel todo
dia 5", "treinar a cada 2 dias após concluir") renascem sozinhas com a semântica correta.
Salvo filtros como "Hoje + Vencidas", "Alta energia", "5 minutos" que aparecem na sidebar
como listas de primeira classe. Etiqueto tarefas com tags de energia/tempo.

**Why this priority**: é o que o TickTick dava de graça e o app reassume. Sem recorrência
e datas, o app não cobre contas mensais nem rotinas — o maior risco de regressão funcional.

**Independent Test**: criar recorrência nos dois modos, completar/reagendar ocorrências e
verificar a próxima ocorrência gerada; salvar um filtro e validar o resultado contra os
dados.

**Acceptance Scenarios**:

1. **Given** uma tarefa recorrente em modo data-fixa ("todo dia 5"), **When** o usuário a completa no dia 3, **Then** a próxima ocorrência é o dia 5 do mês seguinte (âncora fixa, não 30 dias após a conclusão).
2. **Given** uma tarefa recorrente em modo pós-conclusão ("a cada 2 dias após concluir"), **When** o usuário a completa hoje, **Then** a próxima ocorrência é daqui a 2 dias contados da conclusão.
3. **Given** uma tarefa recorrente vencida há 3 ocorrências, **When** o usuário a completa uma vez, **Then** apenas uma ocorrência é consumida e a próxima é calculada a partir da regra — ocorrências passadas não geram cópias acumuladas.
4. **Given** um filtro salvo "prioridade alta E vence esta semana", **When** aberto na sidebar, **Then** mostra exatamente as tarefas que satisfazem as regras, atualizado em tempo real.
5. **Given** uma tarefa com tag `5min`, **When** o usuário filtra por essa tag, **Then** a tarefa aparece em qualquer canal (Telegram: "o que dá pra fazer em 5 minutos?").

---

### User Story 3 - Planejar o dia com time-blocking (Priority: P3)

De manhã abro a tela "Meu Dia": reviso o que ficou de ontem, escolho as tarefas de hoje,
estimo a duração de cada uma e vejo se o plano cabe nas horas livres — o sistema cruza
minhas tarefas com os eventos do Google Calendar. Arrasto tarefas para horários
específicos, transformando intenção em agenda.

**Why this priority**: é o diferencial natural do sistema — tarefas (PostgreSQL) e agenda
(Google Calendar via Kaguya) já vivem sob o mesmo teto. Nenhuma ferramenta de mercado tem
essa integração com o meu ecossistema.

**Independent Test**: com eventos no Calendar e tarefas com estimativa, validar que a
tela mostra capacity correta e que arrastar uma tarefa cria o bloco no horário certo.

**Acceptance Scenarios**:

1. **Given** 4h de eventos no Calendar e tarefas estimadas somando 6h, **When** o usuário monta o plano do dia, **Then** o sistema mostra que o plano excede a capacidade livre.
2. **Given** uma tarefa sem horário, **When** o usuário a arrasta para as 14h, **Then** a tarefa ganha bloco 14h–14h30 (ou a duração estimada) e aparece na view calendar.
3. **Given** tarefas não concluídas ontem, **When** o usuário abre "Meu Dia", **Then** o ritual oferece revisá-las (reagendar, mover para hoje ou descartar) antes de planejar.

---

### User Story 4 - Construir hábitos com força que perdoa falhas (Priority: P4)

Registro hábitos ("meditar", "ler 20 páginas") com frequência alvo (ex.: 5x por semana)
e faço check-ins diários, inclusive com valor mensurável (páginas, minutos). O sistema
mostra a **força do hábito** — métrica que cresce com a consistência e decai suavemente
com falhas (fórmula do Loop Habit Tracker), em vez de um streak que zera num dia ruim.
Vejo o histórico em heatmap.

**Why this priority**: completa o ciclo de produtividade (tarefas → rotina), mas depende
de nada além do schema. Vem depois porque tarefas são o uso diário primário.

**Independent Test**: criar hábito, simular sequência de check-ins com falhas e validar
que a força calculada segue a fórmula e que o heatmap reflete os dias.

**Acceptance Scenarios**:

1. **Given** um hábito 5x/semana com 4 check-ins na semana, **When** o usuário vê o hábito, **Then** a força reflete ~80% de aderência sem zerar por causa do dia perdido.
2. **Given** um hábito mensurável "ler 20 páginas", **When** o usuário faz check-in com valor 25, **Then** o check-in registra o valor e conta como cumprido.
3. **Given** um ano de check-ins, **When** o usuário abre o hábito, **Then** vê um heatmap anual dos dias cumpridos.

---

### User Story 5 - Lembretes e experiência refinada (Priority: P5)

Recebo lembretes na hora marcada **pelo Telegram** (canal que já carrego no bolso) para
tarefas com horário. No webapp, navego inteiramente por teclado: ⌘K abre o command
palette para criar/buscar/navegar em segundos; animações suaves dão feedback de cada
ação; tudo funciona bem no celular.

**Why this priority**: polish e notificações fecham a paridade com o TickTick, mas o app
já é utilizável sem isso (o usuário convive sem lembretes até esta fase, por decisão
explícita).

**Independent Test**: agendar tarefa com horário e validar a chegada do lembrete no
Telegram na hora; navegar por todas as views só com teclado.

**Acceptance Scenarios**:

1. **Given** uma tarefa com vencimento hoje às 17h, **When** dá 17h, **Then** chega mensagem de lembrete no Telegram com título e link/ação de completar.
2. **Given** o webapp aberto, **When** o usuário tecla ⌘K e digita "comprar café amanhã !alta", **Then** a tarefa é criada com data de amanhã e prioridade alta, sem tocar no mouse.
3. **Given** o webapp num celular, **When** o usuário usa lista e Kanban, **Then** as views são utilizáveis em tela estreita.

---

### Edge Cases

#### Recorrência (maior risco do sistema — semântica Todoist)

- **Reagendar + completar**: tarefa recorrente "toda segunda" reagendada para terça e completada na terça → a próxima ocorrência é a **segunda seguinte** (a âncora da série não muda por reagendamento pontual em modo `fixed`).
- **Completar adiantado (modo `fixed`)**: completar no dia 3 uma tarefa "todo dia 5" consome a ocorrência do dia 5 → próxima é dia 5 do período seguinte.
- **Completar atrasado (modo `fixed`)**: tarefa "todo dia 5" completada no dia 20 consome **uma** ocorrência; a próxima é o dia 5 seguinte à data da conclusão (ocorrências puladas não se acumulam).
- **Modo `after_completion`**: a próxima ocorrência é sempre calculada a partir da **data de conclusão real**, nunca da âncora.
- **Fim de série ("complete forever")**: o usuário pode encerrar a série — a ocorrência atual é completada e nenhuma próxima é gerada; a regra de recorrência é desativada, não apagada (preserva histórico).
- **Subtarefas em recorrentes**: ao gerar a próxima ocorrência, todas as subtarefas renascem **não concluídas** (reset).
- **Ocorrências futuras não materializadas**: apenas a próxima ocorrência existe como linha viva; as futuras são virtuais (calculadas pela regra). Views de calendário podem projetar ocorrências virtuais sem persisti-las.
- **Editar a regra com ocorrência aberta**: a ocorrência aberta mantém sua data atual; a nova regra vale a partir da próxima geração.
- **Excluir tarefa recorrente**: o usuário escolhe entre "só esta ocorrência" (gera a próxima normalmente) e "a série inteira" (desativa a regra e soft-deleta a ocorrência aberta).

#### Gerais

- **Excluir projeto com tarefas**: o usuário escolhe entre mover as tarefas para o Inbox ou soft-deletá-las junto. O projeto Inbox não pode ser excluído.
- **Completar tarefa pai com subtarefas abertas**: pedir confirmação; ao confirmar, subtarefas abertas são completadas em cascata.
- **Mover tarefa entre projetos com Kanban**: a tarefa vai para a primeira coluna do projeto destino (ou coluna default) — nunca fica órfã de coluna num projeto com board.
- **Conflito de edição entre canais**: política last-write-wins (single-user; conflito real é raro e aceitável).
- **Smart list com regra referenciando tag/projeto excluído**: o filtro continua válido e simplesmente não casa nada para aquela regra; a UI indica a referência quebrada.
- **`complete_payment_task` parcial**: se completar a tarefa funciona mas o lançamento da despesa falha (ou vice-versa), a operação é atômica — ou tudo, ou nada (transação no mesmo banco).
- **Captura por NLP ambígua** ("sexta" — qual sexta?): a Kaguya assume a próxima ocorrência futura e informa a interpretação na resposta, permitindo correção em linguagem natural.

## Requirements *(mandatory)*

### Functional Requirements

**Paridade de canais e fundação**

- **FR-001**: Toda operação de tarefas MUST estar disponível nos dois canais (Telegram e webapp) com resultado idêntico; nenhuma capacidade pode existir em apenas um canal.
- **FR-002**: O sistema MUST funcionar com cada canal isoladamente: webapp operável com o bot Telegram desligado, e vice-versa.
- **FR-003**: O armazenamento MUST ser o PostgreSQL local existente; nenhuma dependência de API externa de tarefas em runtime.
- **FR-004**: O sistema MUST nascer com um projeto Inbox indelével que recebe toda captura sem projeto explícito.

**CRUD e organização (Fase 1)**

- **FR-005**: Usuário MUST poder criar, editar, completar, reabrir, mover e excluir tarefas e subtarefas (1 nível de aninhamento mínimo).
- **FR-006**: Usuário MUST poder organizar tarefas em projetos com hierarquia de grupos (1 nível: grupo → projeto).
- **FR-007**: Tarefas MUST ter prioridade (4 níveis: nenhuma, baixa, média, alta).
- **FR-008**: Exclusões MUST ser soft delete com possibilidade de restauração; conclusões MUST registrar o momento exato (para histórico e estatísticas).
- **FR-009**: A ordenação manual de tarefas (drag-and-drop) MUST persistir, usando posições esparsas que permitem inserir entre duas tarefas sem renumerar tudo.
- **FR-010**: Cada projeto MAY ter um board Kanban com colunas configuráveis; mover para a coluna marcada como "done" MUST completar a tarefa.
- **FR-011**: A captura via Telegram MUST interpretar linguagem natural em português (título, data, projeto, prioridade, tags) e confirmar a interpretação na resposta.
- **FR-012**: O quick-add do webapp MUST interpretar atalhos determinísticos em português ("amanhã", "sexta 17h", `#tag`, `!alta`) sem depender de modelo de linguagem.

**Datas e recorrência (Fase 2)**

- **FR-013**: Tarefas MAY ter data de vencimento com hora opcional.
- **FR-014**: O sistema MUST suportar recorrência nos modos data-fixa (`fixed`) e pós-conclusão (`after_completion`), com regras expressas em RRULE (iCal).
- **FR-015**: A geração de ocorrências MUST seguir os edge cases da seção Edge Cases (uma ocorrência viva por vez; puladas não acumulam; subtarefas resetam; fim de série preserva histórico).
- **FR-016**: Usuário MUST poder salvar filtros (smart lists) combinando regras de projeto, tag, prioridade, datas e estado; filtros salvos aparecem na navegação como listas de primeira classe.
- **FR-017**: Usuário MUST poder etiquetar tarefas com tags reutilizáveis.

**Views (Fases 1–3)**

- **FR-018**: A mesma tarefa MUST ser visível em múltiplas views sem duplicação de dado: lista (Fase 1), Kanban (Fase 1), calendar (Fase 2), matriz de Eisenhower derivada de prioridade × urgência (Fase 2+), Meu Dia (Fase 3).
- **FR-019**: A tela "Meu Dia" MUST guiar o ritual diário: revisar pendências de ontem → selecionar tarefas de hoje → estimar duração → comparar com a capacidade livre derivada do Google Calendar.
- **FR-020**: Usuário MUST poder dar horário a uma tarefa por drag para um slot do dia (time-blocking), refletido na view calendar.

**Hábitos (Fase 4)**

- **FR-021**: Usuário MUST poder criar hábitos com frequência alvo (numerador/denominador, ex.: 5x/semana) e check-ins diários, opcionalmente com valor mensurável.
- **FR-022**: O sistema MUST calcular a força do hábito com decaimento suave (fórmula Loop: meia-vida proporcional à frequência), nunca um streak que zera com uma falha.

**Lembretes e integração financeira (Fase 5 / cross-agent)**

- **FR-023**: Tarefas com horário MUST gerar lembrete via Telegram no momento configurado (Fase 5).
- **FR-024**: O fluxo "paguei a conta X" MUST completar a tarefa e lançar a despesa no domínio financeiro (Nami) numa única operação atômica — tudo ou nada.

### Key Entities

- **Projeto** (`task_projects`): lista/contexto GTD; pode pertencer a um grupo (auto-relação); tem cor/ícone; Inbox é seed indelével.
- **Coluna** (`task_columns`): coluna de Kanban de um projeto; uma pode ser marcada como "done".
- **Tarefa** (`tasks`): núcleo — título, descrição, projeto, coluna, pai (subtarefa), prioridade, datas (vencimento, bloco de tempo), estimativa de duração, posição manual, conclusão e exclusão lógicas.
- **Recorrência** (`task_recurrences`): regra RRULE + modo (`fixed`/`after_completion`) + estado ativo; 1:1 com a tarefa viva da série.
- **Tag** (`task_tags` + `task_tag_links`): etiqueta reutilizável N:N com tarefas.
- **Filtro salvo** (`task_filters`): smart list — nome + regras declarativas + view padrão.
- **Hábito** (`habits`): nome, frequência alvo, tipo (sim/não ou mensurável), meta de valor.
- **Check-in** (`habit_checkins`): registro diário do hábito, com valor opcional.

Detalhamento completo (colunas, constraints, índices, DSL de filtros): ver `data-model.md`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% das operações de tarefas executáveis pelos dois canais — auditável listando capacidades e canais (paridade total).
- **SC-002**: Capturar uma tarefa leva menos de 10 segundos pelo Telegram (uma mensagem) e menos de 5 segundos pelo quick-add do webapp (⌘K → Enter).
- **SC-003**: Após o MVP (Fase 1), zero dependência do TickTick: o usuário opera uma semana inteira sem abrir o app antigo.
- **SC-004**: Todos os 9 edge cases de recorrência da seção Edge Cases passam em teste automatizado (Fase 2).
- **SC-005**: O plano do dia montado em "Meu Dia" reflete a capacidade real: a soma de estimativas versus horas livres do Calendar bate com verificação manual (Fase 3).
- **SC-006**: A força de um hábito com 80% de aderência permanece acima de zero após uma falha isolada (Fase 4) — diferencial versus streak.
- **SC-007**: Lembrete chega no Telegram em até 1 minuto do horário configurado (Fase 5).
- **SC-008**: Todas as views principais navegáveis sem mouse (Fase 5).

## Assumptions

- Single-user definitivo: colaboração nunca entra no escopo deste sistema; reabrir só se o objetivo do produto mudar.
- Sem migração do TickTick (decisão explícita): o banco nasce vazio; o usuário recria manualmente o que importa.
- Lembretes só na Fase 5 (decisão explícita): até lá o usuário convive sem notificações ou mantém o TickTick em paralelo por conta própria.
- O webapp existente (auth Google por cookie, padrão de shells, FastAPI) é reutilizado — o sub-app de tarefas é mais um shell, não um app novo.
- O MCP do Google Calendar existente cobre a leitura de eventos necessária para capacity/time-blocking; escrita continua restrita ao calendário principal.
- Fuso horário fixo `America/Sao_Paulo` em todo o sistema (consistente com o restante do makima).
- Telegram como único canal de notificação — sem push web, sem email.
- Estimativa de duração (`duration_min`) e campos de bloco de tempo já nascem no schema da Fase 1, mesmo que a UI só chegue na Fase 3 — evita migração de schema.

## Out of Scope

- **AI scheduling** (estilo Motion) — payoff incerto, escopo grande; só reavaliar muito depois.
- **Dependências entre tarefas / Gantt** — extensão futura, não inchar a v1.
- **Anexos** em tarefas.
- **Colaboração** (assignees, permissões, comentários).
- **Migração de dados do TickTick** (decisão: começar limpo).
- **App mobile nativo / widgets** — o webapp responsivo (Fase 5) cobre mobile.
- **Histórico materializado de ocorrências de recorrentes** — o histórico vem de `completed_at` das linhas consumidas; tabela própria só se a necessidade aparecer.
- **Timer de foco / Pomodoro** vinculado a tarefa — marcado como *opcional* no documento de recomendações (`agents/kaguya/specs_app_tasks_recomendacoes.md` §4); fica fora da v1 (fases 011–015). Reavaliar como fase futura (ex.: Fase 6) se houver necessidade real — sem reservar schema agora.
- **Gamificação** (pontos/Karma estilo Todoist) — marcada como *"se usar"* nas recomendações (§4); decisão: **não** entra. A motivação no domínio de produtividade vem da "força do hábito" (anti-streak, FR-022), não de pontuação. Reabrir só se a metáfora casar com um objetivo claro.
