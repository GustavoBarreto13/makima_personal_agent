# Feature Specification: Calendar Hub — calendário completo, 2-way Google + calendários cross-agent (fatia 019)

**Feature Branch**: `019-tasks-calendar-hub`

**Created**: 2026-06-13

**Status**: Planejada — não implementada. Fonte de design (alta fidelidade):
`specs/019-tasks-calendar-hub/design_handoff_kaguya_calendario/` (README + protótipo React/Babel
`cal.jsx`/`cal-engine.jsx`/`cal-views.jsx`/`cal-data.js`/`cal.css`). Substitui a `CalendarScreen`
simples (mês/semana) da fatia 013 por um **calendário completo estilo Notion Calendar / Google
Calendar**.

**Spec master**: [`specs/010-kaguya-tasks-app/`](../010-kaguya-tasks-app/spec.md) — a integração com o
Google Calendar e o "uma tarefa, várias views" são previstos na master (tabela de capacidades,
**FR-018/FR-020**, Assumptions do MCP). Constrói sobre a view de calendário da
[`013`](../013-tasks-tags-smartlists-calendar/spec.md) e o time-blocking da
[`016`](../016-tasks-meudia/spec.md). Frontend segue o **guia canônico**
[`frontend-design-guide.md`](../010-kaguya-tasks-app/frontend-design-guide.md) + o
[`design-guide.md`](design-guide.md) desta fatia (fiel ao handoff).

**Input**: "Linkar a calendário da Kaguya com o Google Calendar (2-way) e transformá-la num
**calendário pessoal completo** (estilo Notion/Google Calendar): visões Dia/Semana/Mês, arrastar para
mover/redimensionar/criar, time-blocking. Reúne numa única agenda as **bases** do produto (Tarefas,
Finanças, Livros, Filmes, Diário) e **integrações externas** (Animes, Futebol, Feriados, Google Agenda)
— cada uma um **calendário conectado** togglável e recolorível. Espelho de saída (Postgres é a
verdade); CRUD de eventos do Google no webapp."

---

## Escopo da fatia

**Entra na 019**:

- **Calendário completo (Dia / Semana / Mês)** — `TimeGrid` (semana/dia, grade de 24h com gutter de
  horários, faixa *all-day*, linha do "agora", fuso BRT) e `MonthGrid` (6 semanas, pills, "+N mais"),
  com barra de navegação (mês/ano, semana ISO, ‹ ›, "Hoje", segmented Dia/Semana/Mês) e **mini-mês** +
  busca na coluna lateral. Substitui o stub/calendário simples da 013.
- **Calendários conectados** — modelo **contas → calendários** (igual ao Notion): conta **"Makima ·
  suíte"** com as **bases** (Kaguya/Tarefas, Nami/Finanças, Frieren/Livros, Akane/Filmes,
  Violet/Diário) e conta **Google** com as **integrações** (Animes, Palmeiras/Copa, Feriados no Brasil,
  Agenda pessoal). Cada calendário é **togglável** (checkbox/olho) e **recolorível** (balde → paleta).
- **Espelho de saída (tarefas → Google)** — tarefas-pai **com data** viram eventos num calendário
  dedicado **"Kaguya — Tarefas"** no Google (push best-effort em criar/editar/completar/excluir).
  Coluna nova `tasks.google_event_id`.
- **Interações de grid** — mover (arrastar, snap 15min), redimensionar (alça inferior), criar
  arrastando em área vazia, **time-blocking** (arrastar card da bandeja "Sem horário" para o grid),
  **popover** de evento (editar título/horário/local/cor, excluir) e **menu de contexto** (recolorir/
  duplicar/excluir). Editáveis conforme a **fonte** (ver regra de editabilidade abaixo).
- **CRUD de eventos do Google no webapp** — a base **Agenda pessoal** (Google) é editável: criar/editar/
  apagar eventos (escrita no calendário **principal**), além de já dar pelo Telegram.
- **Camadas cross-agent (read-only)** — as bases Nami/Frieren/Akane/Violet vêm de **providers** em cada
  agente (`list_calendar_events`), agregadas pela Kaguya; **read-only** no grid (mover/redimensionar/
  excluir desabilitados), clicar **deep-linka** para o domínio de origem.
- **Integrações externas (read-only)** — conectores de **Animes** (cronograma de episódios),
  **Futebol** (Palmeiras/Copa) e **Feriados no Brasil**, como calendários conectados read-only.
- **Personalização** — recolorir por calendário (afeta todos os eventos da base) e por evento
  (sobrescreve só aquele); **3 variantes visuais** (`agora`/Notion, `helvetico`/Google,
  `editorial`/Kaguya) + tema claro/escuro (via Tweaks).

### Regra de editabilidade por fonte (reconciliação handoff × arquitetura)

O protótipo trata todo evento como editável (dados mock). Em produção, **o que cada evento permite
depende da fonte**:

| Fonte (calendário) | Origem | Editável no grid? |
|---|---|---|
| **Kaguya · Tarefas** | `tasks` (Postgres) | **Sim** — mover/redimensionar = `set_time_block`/`update_task`; criar no grid/bandeja = criar tarefa com bloco; excluir = soft delete. |
| **Agenda pessoal (Google)** | Google Calendar principal | **Sim** — CRUD via `gcal.py` (US4). |
| **Nami/Frieren/Akane/Violet** | providers cross-agent | **Não** (read-only) — clique deep-linka ao domínio. Editar/escrever de volta = futuro. |
| **Animes/Futebol/Feriados** | conectores externos | **Não** (read-only feeds). |

**Fica para depois**: sync **bidirecional** real (editar evento espelho no Google voltar à tarefa);
**escrita de volta** nas bases cross-agent (mover um vencimento da Nami pelo calendário); mirror das
camadas cross-agent/integrações para calendários Google próprios; escrita em calendários Google
**arbitrários** (só principal); push real-time por webhooks (começa só com push inline). Reconcile job
é opcional/backstop.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Um calendário Dia/Semana/Mês de verdade (Priority: P1)

Abro a view **Calendário** e tenho uma agenda completa: por padrão a **Semana** (domingo→sábado) numa
grade de horas com a **linha do agora**, a faixa de **eventos de dia inteiro** no topo, e o fuso (BRT).
Alterno para **Dia** (uma coluna) ou **Mês** (grade de 6 semanas com pills). Navego com ‹ ›, volto com
"Hoje", e uso o **mini-mês** lateral (com a semana atual realçada) para saltar de data. Clicar no
cabeçalho de um dia abre o **Dia**.

**Why this priority**: é a fundação visual — sem as três visões e a navegação, nada do resto aparece.
Substitui o calendário simples da 013.

**Independent Test**: alternar Dia/Semana/Mês; navegar e voltar a "Hoje"; conferir a linha do agora só
no dia de hoje, a faixa all-day, o número da semana ISO (pelo meio da semana), e o mini-mês navegando o
principal.

**Acceptance Scenarios**:

1. **Given** a view Calendário, **When** abro, **Then** vejo a **Semana** atual (dom→sáb) com grade de 24h, scroll posicionado ~07:00, faixa all-day e a linha do "agora" na coluna de hoje.
2. **Given** a Semana, **When** troco para **Mês**, **Then** vejo 6 semanas com pills (limite 4/célula + "+N mais") e o dia de hoje destacado.
3. **Given** o Mês, **When** clico numa célula, **Then** abro a view **Dia** naquela data.
4. **Given** qualquer visão, **When** uso ‹ ›, **Then** avança/volta dia/semana/mês conforme a visão; **"Hoje"** retorna ao presente.
5. **Given** o **mini-mês**, **When** clico num dia, **Then** o calendário principal navega para ele; a **semana atual** aparece realçada no mini-mês.

---

### User Story 2 - Calendários conectados: ligar, desligar e recolorir (Priority: P1)

Na coluna lateral vejo meus calendários agrupados por **conta**: "Makima · suíte" (as bases Tarefas,
Finanças, Livros, Filmes, Diário) e a conta Google (Animes, Palmeiras/Copa, Feriados, Agenda pessoal).
Cada um tem uma **cor** e um **checkbox/olho** para mostrar/ocultar, e um **balde** para trocar a cor
de todos os eventos daquela base de uma vez. Ligo só o que quero ver naquele momento.

**Why this priority**: é o backbone do "hub" — a agregação multi-fonte e o controle de visibilidade.
Junto com a US1, entrega o calendário unificado.

**Independent Test**: alternar a visibilidade de cada calendário e ver os eventos sumirem/aparecerem no
grid e no mês; recolorir uma base e ver todos os seus eventos mudarem de cor; a cor/visibilidade
persistem entre sessões.

**Acceptance Scenarios**:

1. **Given** a coluna de calendários, **When** desligo um calendário (checkbox/olho), **Then** seus eventos somem do grid e do mês; religar os traz de volta.
2. **Given** os calendários, **When** abro o balde de uma base e escolho uma cor da paleta, **Then** **todos** os eventos daquela base passam a usar a nova cor; a escolha **persiste**.
3. **Given** as contas, **When** vejo a coluna, **Then** os calendários aparecem agrupados sob "Makima · suíte" e sob a conta Google, com a tag "padrão" no primário (Kaguya).
4. **Given** uma base cross-agent (ex.: Finanças), **When** ligada, **Then** seus itens datados aparecem nos dias certos via o **provider** do domínio.
5. **Given** o estado de visibilidade/cores, **When** recarrego, **Then** ele é preservado (preferência persistida).

---

### User Story 3 - Criar, mover e bloquear no grid (tarefas + Google) (Priority: P2)

Arrasto um evento para outro horário/dia e ele se move (snap de 15min); puxo a alça inferior para
redimensionar; arrasto numa área vazia para **criar** um evento e abrir o popover de edição. Arrasto um
card da bandeja **"Sem horário"** (tarefas da semana sem hora) para o grid e faço **time-blocking** — a
tarefa ganha o horário do drop com a duração estimada. Tudo isso vale para a base **Kaguya · Tarefas**
(que são tarefas reais) e para a **Agenda pessoal do Google**.

**Why this priority**: é a manipulação direta que faz o calendário ser "usável", não só de leitura.
Conecta com o time-blocking da 016.

**Independent Test**: mover/redimensionar/criar um evento da base Kaguya e confirmar que vira
`set_time_block`/`update_task`/criação de tarefa; arrastar um card da bandeja para um horário e ver o
bloco gravado; repetir com um evento do Google e confirmar o CRUD no calendário principal; tentar
mover um evento read-only (Nami) e ver que **não** move (deep-linka).

**Acceptance Scenarios**:

1. **Given** um evento da base Kaguya, **When** o arrasto para outro horário/dia, **Then** `start_at`/`end_at` (e dia) da tarefa são atualizados (snap 15min); o fantasma some no commit.
2. **Given** um evento editável, **When** puxo a alça inferior, **Then** só o fim muda (mínimo 15min).
3. **Given** uma área vazia do grid, **When** arrasto para definir início/fim, **Then** um evento é criado (mínimo 30min) e o **popover** de edição abre; na base Kaguya isso cria uma **tarefa** com bloco.
4. **Given** a bandeja "Sem horário" com tarefas da semana, **When** arrasto um card para um horário, **Then** a tarefa ganha bloco naquele horário com a duração estimada (time-blocking) e sai da bandeja.
5. **Given** um evento read-only (Nami/Frieren/Akane/Violet/integração), **When** tento arrastar/redimensionar, **Then** ele **não** se move; clicar **deep-linka** para o domínio (ou mostra info, no caso de integração).
6. **Given** o **popover**/**menu de contexto** de um evento editável, **When** edito título/horário/local/cor, duplico ou excluo, **Then** a mudança reflete na fonte (tarefa ou Google).

---

### User Story 4 - Minhas tarefas no Google + manejar a Agenda do Google (Priority: P2)

Tarefas com data viram eventos num calendário **"Kaguya — Tarefas"** na minha conta Google (espelho de
saída), aparecendo no app do Google no celular. E, no webapp, a base **Agenda pessoal** mostra os
eventos do meu Google e me deixa criar/editar/apagar por lá. O calendário espelho **não** aparece em
dobro (minhas tarefas já estão na base Kaguya).

**Why this priority**: fecha o 2-way (saída de tarefas + manejo dos eventos do Google no webapp).

**Independent Test**: criar/editar/concluir/excluir uma tarefa com data e conferir o evento no
calendário "Kaguya — Tarefas"; criar/editar/apagar um evento da Agenda pessoal pela UI e conferir no
Google; confirmar que o espelho fica fora do overlay.

**Acceptance Scenarios**:

1. **Given** a flag de sync ligada, **When** crio/edito/concluo/excluo uma tarefa com data, **Then** o evento espelho correspondente é criado/atualizado/marcado "✓"/removido no calendário "Kaguya — Tarefas" (timed se tem hora/bloco; dia inteiro se só `due_date`).
2. **Given** uma tarefa já espelhada, **When** mudo a data, **Then** o **mesmo** evento (`google_event_id`) é atualizado, sem duplicar.
3. **Given** o Google indisponível ou a flag desligada, **When** opero tarefas, **Then** o CRUD funciona normalmente (sync best-effort).
4. **Given** a base Agenda pessoal, **When** crio/edito/apago um evento pela UI, **Then** reflete no calendário **principal** do Google.
5. **Given** o overlay de calendários, **When** vejo os eventos do Google, **Then** o calendário "Kaguya — Tarefas" (e o "TickTick") ficam **fora** do overlay (anti-duplicação).

---

### User Story 5 - Integrações externas: Animes, Futebol e Feriados (Priority: P3)

Ligo calendários de **integração** que não são meus dados nem do Google: **Animes** (próximos
episódios dos animes que acompanho), **Palmeiras / Copa** (jogos) e **Feriados no Brasil**. Eles
aparecem como qualquer outro calendário conectado (cor própria, togglável), mas são **read-only** —
alimentados por conectores externos.

**Why this priority**: enriquecem a agenda com contexto externo; são read-only e isoláveis (cada
conector é independente). Pode ser faseado.

**Independent Test**: ligar cada integração e ver seus eventos no período (episódios all-day, jogos com
horário, feriados all-day); um conector indisponível não derruba o calendário.

**Acceptance Scenarios**:

1. **Given** a integração **Animes** ligada, **When** vejo a semana, **Then** os próximos episódios aparecem (all-day ou com hora) na cor da camada.
2. **Given** a integração **Futebol** ligada, **When** há jogos no período, **Then** eles aparecem com horário e local ("Copa").
3. **Given** a integração **Feriados** ligada, **When** há um feriado no período, **Then** ele aparece como evento all-day.
4. **Given** um conector externo indisponível/timeout, **When** abro o calendário, **Then** as outras camadas e as tarefas continuam aparecendo (degradação graciosa); a camada com erro é sinalizada.
5. **Given** uma integração, **When** clico num evento dela, **Then** vejo a info (read-only); não há edição.

---

### Edge Cases

- **Editabilidade por fonte**: mover/redimensionar/excluir só valem para Kaguya (tarefas) e Agenda
  pessoal (Google); bases cross-agent e integrações são read-only (clique deep-linka ou mostra info).
- **Sobreposição de eventos**: o `TimeGrid` usa algoritmo de **pistas** para repartir a largura de
  eventos que se sobrepõem no mesmo dia.
- **Snap e mínimos**: arrastar/criar usa snap de **15min**; criar tem mínimo 30min, redimensionar
  mínimo 15min.
- **Compensação de escala**: as interações por pointer leem `rect.height/offsetHeight` da coluna
  (funciona sob zoom de canvas).
- **All-day vs timed**: itens sem hora vão para a faixa all-day (com "+N mais" se transbordar no mês);
  com hora, posicionados em % de 24h.
- **Semana ISO**: o rótulo "SEMANA N" usa o **meio da semana** (quinta) para casar com o Notion.
- **Idempotência do espelho**: "Kaguya — Tarefas" é criado uma vez (achado por nome); reiniciar não
  duplica. Tarefa recorrente espelha **só a ocorrência viva** (sem RRULE no Google).
- **Anti-duplicação**: o calendário espelho e o "TickTick" ficam fora do overlay de eventos do Google.
- **Sync best-effort**: falha do Google nunca quebra o CRUD de tarefa; `google_event_id` pode ficar
  pendente até um próximo push/reconcile.
- **Recolor**: por calendário afeta todos os eventos da base; por evento sobrescreve só aquele (só faz
  sentido em eventos editáveis). A cor escolhida persiste.
- **Provider/conector vazio ou com erro**: camada vazia desenha nada; com erro é sinalizada e não
  derruba as demais.
- **Tarefa que perde a data**: o evento espelho é removido; some também da base Kaguya no grid.
- **Fuso**: tudo em `America/Sao_Paulo` (BRT).

## Requirements *(mandatory)*

### Functional Requirements

**Calendário e visões**

- **FR-001**: O sistema MUST oferecer um calendário com visões **Dia / Semana / Mês** (padrão Semana
  dom→sáb), com grade de 24h (gutter de horários), faixa **all-day**, **linha do agora** na coluna de
  hoje, rótulo de fuso (BRT) e número ISO da semana.
- **FR-002**: O sistema MUST oferecer navegação por ‹ › (por dia/semana/mês), botão **"Hoje"**, um
  **mini-mês** lateral (com a semana atual realçada) que navega o principal, e abrir o **Dia** ao
  clicar num cabeçalho de dia (semana) ou célula (mês).
- **FR-003**: O **Mês** MUST mostrar pills por dia (com bolinha/hora para timed e *filled* para
  all-day), limite de 4 por célula + "+N mais", e destacar hoje.

**Calendários conectados**

- **FR-004**: O sistema MUST modelar **contas → calendários** (bases da suíte Makima + integrações),
  cada calendário com **id, nome, cor, conta, tipo (base|integração), visível**; agrupados por conta na
  coluna lateral; o calendário **Kaguya** é o primário ("padrão").
- **FR-005**: Cada calendário MUST ser **togglável** (mostrar/ocultar filtra grid e mês) e
  **recolorível** (balde → paleta `CAL_SWATCHES`), com a cor afetando todos os eventos da base. A
  **visibilidade e a cor MUST persistir** entre sessões (preferência por usuário/calendário).
- **FR-006**: As **bases cross-agent** (Nami/Frieren/Akane/Violet) MUST ser alimentadas por um
  **provider** em cada agente (`list_calendar_events(start, end) → CalendarItem[]`), agregadas por um
  **hub** na Kaguya; os itens são **read-only** no grid e MUST **deep-linkar** para o domínio.
- **FR-007**: A agregação MUST **degradar com elegância** — um provider/conector que falhe não derruba
  as demais camadas nem as tarefas; a camada com erro é sinalizada.

**Interações de grid**

- **FR-008**: Em eventos **editáveis** (Kaguya/tarefas e Agenda pessoal/Google), o sistema MUST permitir
  **mover** (arrastar, snap 15min — coluna define o dia, Y define a hora), **redimensionar** (alça
  inferior, mínimo 15min) e **criar arrastando** numa área vazia (mínimo 30min, abre popover).
- **FR-009**: O sistema MUST permitir **time-blocking**: arrastar um card da bandeja **"Sem horário"**
  (tarefas da semana sem hora) para o grid grava o bloco (`start_at`/`end_at`) com a duração estimada
  (integra a fatia 016).
- **FR-010**: O sistema MUST oferecer **popover** de evento (editar título/horário/local/cor, excluir)
  e **menu de contexto** (recolorir, **duplicar**, "cor do calendário", excluir) para eventos
  editáveis; **cor por evento** sobrescreve só aquele.

**Espelho de saída + Google no webapp**

- **FR-011**: O sistema MUST ter um cliente Google Calendar **compartilhado** (`gcal.py`, não-MCP) que
  reusa as credenciais OAuth e cria/acha um calendário **"Kaguya — Tarefas"** idempotente (sem
  re-autorização — escopo já `calendar`).
- **FR-012**: Tarefas-pai **com data** MUST ser **espelhadas** nesse calendário (timed se tem
  hora/bloco; dia inteiro se só `due_date`), via `tasks.google_event_id`; reagir a criar/editar/
  completar("✓")/reabrir/excluir/restaurar/time-block. O sync MUST ser **best-effort** + flag
  (`GCAL_SYNC_ENABLED`); falha do Google não quebra o CRUD. O gatilho MUST ficar na **camada de
  lógica** (paridade). Recorrente espelha **só a ocorrência viva**.
- **FR-013**: A base **Agenda pessoal (Google)** MUST permitir **criar/editar/apagar** eventos pelo
  webapp (escrita no calendário **principal**), com os eventos do Google exibidos **exceto** o espelho
  e o "TickTick" (anti-duplicação). Endpoints envolvem `gcal.py` direto (webapp não usa MCP) e exigem
  `Depends(require_user)`.

**Integrações externas**

- **FR-014**: O sistema MUST oferecer calendários de **integração read-only** — **Animes** (cronograma
  de episódios), **Futebol** (Palmeiras/Copa) e **Feriados no Brasil** — via **conectores** (mesmo
  protocolo de `CalendarItem`); a fonte de cada conector (API/feed) é definida na implementação.

**Personalização e paridade**

- **FR-015**: O calendário MUST suportar **3 variantes visuais** (`agora`/Notion, `helvetico`/Google,
  `editorial`/Kaguya) e tema **claro/escuro**, via o painel de Tweaks do shell.
- **FR-016** (paridade): a agregação vive na **camada de lógica**; o Telegram MUST poder consultar "o
  que tenho essa semana" incluindo as camadas, com o mesmo conjunto do webapp. O manejo de eventos do
  Google pelo Telegram já existe (MCP); o espelho de tarefas é automático.

**Deploy**

- **FR-017**: O container do **webapp** MUST ter as env vars `GOOGLE_CALENDAR_*` para o `gcal.py`
  (refresh on-demand; só o `refresh_token` é durável).

### Key Entities

- **Conta de calendário** (UI/config): agrupa calendários — "Makima · suíte" e a conta Google.
- **Calendário conectado**: `{id, account, kind:'base'|'integration', name, color, avatar, visible,
  primary?}`. Bases ↔ providers cross-agent / tarefas; integrações ↔ conectores externos / Google.
- **Evento (unificado na UI)**: `{id, cal, day:'YYYY-MM-DD', start:'HH:MM'|null, end|null,
  allDay:bool, color:null|oklch, kind:'event'|'task', loc?, taskId?}` — devolvido por providers/
  conectores e pelo Google; mapeado do `CalendarItem` normalizado (ver [`data-model.md`](data-model.md)).
- **Tarefa** (`tasks`): ganha a coluna **`google_event_id`** (única mudança de schema). O time-block
  (`start_at`/`end_at`) da 016 é o que o grid edita na base Kaguya.
- **Evento do Google**: entidade externa, lida/escrita via `gcal.py`.
- **CalendarItem**: shape normalizado dos providers/conectores (ver `data-model.md`).
- **Preferência de calendário** (nova, pequena): visibilidade + cor por calendário, persistida por
  usuário (ver `data-model.md` para a opção de storage).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: As três visões (Dia/Semana/Mês) renderizam os eventos das fontes visíveis nos dias/horas
  corretos, com all-day, linha do agora e número da semana ISO certos — verificação visual + testes dos
  helpers de tempo/layout.
- **SC-002**: Ligar/desligar e recolorir um calendário reflete no grid e no mês e **persiste** entre
  sessões — teste.
- **SC-003**: Em eventos editáveis, mover/redimensionar/criar/time-block gravam na fonte (tarefa: bloco/
  data; Google: evento no principal) com snap de 15min; eventos read-only **não** se movem e
  deep-linkam — teste de integração.
- **SC-004**: Criar/editar/concluir/excluir tarefa com data reflete no evento espelho (timed/all-day,
  atualizar sem duplicar, "✓", remover); `ensure_kaguya_calendar` é idempotente; com a flag off/Google
  fora do ar o CRUD funciona — testes.
- **SC-005**: Cada `provider/conector.list_calendar_events` devolve `CalendarItem`s corretos na janela;
  o hub agrega e um provider com erro não derruba o calendário — teste.
- **SC-006**: A consulta "o que tenho essa semana" pelo Telegram pode incluir as camadas, com o mesmo
  conjunto do webapp (paridade) — checklist.

## Assumptions

- **Espelho de saída** (não bidirecional nesta fatia); Postgres é a verdade; edições no evento espelho
  no Google são sobrescritas no próximo push. *(Confirmado pelo usuário.)*
- **Editabilidade por fonte** (tabela acima): só Kaguya/tarefas e Agenda pessoal/Google editam no grid;
  cross-agent e integrações são read-only (deep-link). Escrita de volta nas bases cross-agent = futuro.
- Escrita de eventos Google (webapp/MCP) só no calendário **principal**.
- Os **conectores externos** (Animes/Futebol/Feriados) têm fonte a definir na implementação — sugestões:
  Feriados via BrasilAPI / tabela estática; Futebol via API de calendário esportivo; Animes via AniList
  / o futuro agente `media` (Fase 5b). Read-only.
- As **fontes datadas das bases** (Nami: `transactions.data`/`subscriptions.next_billing`/vencimentos;
  Frieren: `reading_logs.date`/`books.date_finished`; Akane: `diary_entries.watched_date`; Violet:
  páginas do diário por data) seguem o que cada schema já tem.
- **Variantes/tema/cores** são preferências de UI; cor+visibilidade por calendário **persistem**
  (storage a definir — tabela de preferências ou similar; o protótipo usa estado local).
- O cliente `gcal.py` é compartilhado porque o **webapp não fala MCP**; o MCP do agente continua como
  está (refatorá-lo para usar `gcal.py` é cleanup opcional).
- `TODAY`/`NOW` derivam de `new Date()` na implementação (o protótipo fixa `2026-06-11 11:25`).
- Fuso `America/Sao_Paulo` (BRT); single-user.
