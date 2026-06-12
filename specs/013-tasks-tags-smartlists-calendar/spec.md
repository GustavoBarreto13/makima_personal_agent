# Feature Specification: Tags, Smart-lists e Calendário — Fase 2 (fatia 013) do Sistema de Tarefas Próprio

**Feature Branch**: `013-tasks-tags-smartlists-calendar`

**Created**: 2026-06-12

**Status**: Implementado — P1 (tags), P2 (smart-lists) e P3 (calendário) entregues. Camada de
lógica: `agents/kaguya/tools_tags.py`, `tools_filters.py`, `tools_calendar.py` +
`recurrence.project_occurrences`. Fachadas: router `/api/tasks/{filters,calendar}/*` e tools no
agente. UI: `FilterModal`/`FilterScreen`/`CalendarScreen` + seção na sidebar. Gates:
`tests/agents/test_kaguya_filters.py`, `test_kaguya_calendar.py` e os testes puros de projeção em
`test_kaguya_recurrence.py`.

**Spec master**: [`specs/010-kaguya-tasks-app/`](../010-kaguya-tasks-app/spec.md) — esta é uma
spec filha da **Fase 2** ("organização e views" da master). O schema (`task_tags`,
`task_tag_links`, `task_filters`), a **DSL de regras** das smart-lists e os princípios (paridade
de canais, soft delete, fuso `America/Sao_Paulo`, single-user) estão definidos lá e em
[`data-model.md`](../010-kaguya-tasks-app/data-model.md). Constrói sobre a **Fase 1**
([`specs/011-tasks-mvp/`](../011-tasks-mvp/spec.md)) e sobre **datas e recorrência**
([`specs/012-tasks-recurrence/`](../012-tasks-recurrence/spec.md)). O frontend segue o **guia
canônico** [`frontend-design-guide.md`](../010-kaguya-tasks-app/frontend-design-guide.md).

**Input**: User description: "Tags, Smart-lists e Calendário (Fase 2 da spec master 010,
sucessora da 012). Tabelas já nasceram na Fase 1 (task_tags, task_tag_links, task_filters) — SEM
migração de schema; só lógica, fachadas (router /api/tasks/* + agente Telegram) e UI. P1 tags
(#tag no quick-add + TagChip + UI no TaskModal, CRUD, N:N), P2 smart-lists (filtros salvos como
objetos de 1ª classe + FilterModal + sidebar + built-in Hoje+Vencidas), P3 calendário
(CalendarScreen projetando ocorrências, incl. virtuais das recorrentes da 012). Eisenhower fica
para fase futura. Paridade total Telegram ⇄ webapp."

---

## Escopo da fatia

**Entra na 013** (tabelas já existem no banco desde a Fase 1):

- **Tags** — token `#tag` no quick-add do webapp (parsing determinístico, sem LLM) e
  interpretação NLP equivalente no Telegram; CRUD de tags na camada de lógica; UI de tags no
  TaskModal (adicionar/remover, criar nova on-the-fly); `TagChip` discreto na `TaskRow` e na
  busca; relação N:N via `task_tag_links`; listar/filtrar tarefas por tag.
- **Smart-lists** — filtros salvos como objetos de primeira classe (`task_filters`) com a **DSL
  de regras** da master; `FilterModal` para criar/editar/excluir; aparecem na sidebar abaixo das
  Listas; abrir uma smart-list abre a `ListScreen` com o escopo do filtro. Inclui as smart-lists
  **built-in derivadas** (não persistidas): "Hoje + Vencidas".
- **Calendário** — `CalendarScreen` (mês/semana) projetando as ocorrências, **incluindo as
  ocorrências virtuais futuras** das tarefas recorrentes entregues na 012; referência visual
  *TickTick*. Hoje a view Calendário no shell é só um stub "Em breve".

**Fica para depois**: **Eisenhower** (matriz prioridade×urgência) fica para fase futura;
"Meu Dia" rico e time-blocking (Fase 3); hábitos (Fase 4); lembretes proativos via Telegram
(Fase 5). Sem AI scheduling, Gantt, anexos ou colaboração (out of scope da master).

**Sem migração de schema**: `task_tags`, `task_tag_links` e `task_filters` já nasceram na Fase 1.
Esta fatia só acrescenta lógica, fachadas e UI.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Etiquetar tarefas com tags por qualquer canal (Priority: P1)

Marco tarefas com etiquetas leves de contexto/energia/tempo — `#mercado`, `#5min`,
`#alta-energia` — sem abrir formulário. No webapp digito no quick-add "comprar pão #mercado
#5min"; no Telegram digo "anota comprar pão, tag mercado". A tag aparece como um chip discreto na
linha da tarefa, e eu consigo listar tudo que tem uma tag. Tags novas nascem on-the-fly (sem
cadastro prévio), reaproveitando a existente quando o nome bate (ignorando caixa).

**Why this priority**: tags são a base de organização transversal e **pré-requisito das
smart-lists** (o filtro por tag é o caso mais querido). É a peça menor e autocontida — entrega
valor sozinha e destrava a US2.

**Independent Test**: contra um banco com o schema da Fase 1, criar tarefas com `#tag` pelos dois
canais e confirmar os vínculos N:N em `task_tag_links`; reusar tag existente por nome
(case-insensitive); listar tarefas por tag e conferir o resultado idêntico nos dois canais.

**Acceptance Scenarios**:

1. **Given** o quick-add, **When** digito "comprar pão #mercado #5min", **Then** a tarefa nasce com título limpo "comprar pão" e dois vínculos de tag (`mercado`, `5min`), criadas se não existirem.
2. **Given** já existe a tag `Mercado`, **When** digito "#mercado" noutra tarefa, **Then** o vínculo aponta para a **mesma** tag (nome único ignorando caixa) — sem duplicar.
3. **Given** o TaskModal de uma tarefa, **When** adiciono/removo tags e salvo, **Then** os vínculos refletem a mudança e a `TaskRow` mostra os `TagChip` atualizados.
4. **Given** uma tag aplicada a várias tarefas, **When** peço "tarefas com #mercado" (webapp ou Telegram), **Then** recebo exatamente as tarefas vinculadas, igual nos dois canais.
5. **Given** uma tag sem nenhuma tarefa vinculada, **When** ela é excluída, **Then** somem os vínculos (cascade) e nenhuma tarefa é apagada.

---

### User Story 2 - Smart-lists: filtros salvos como listas de primeira classe (Priority: P2)

Salvo combinações de filtros como "listas inteligentes" que vivem na sidebar ao lado das minhas
listas — "Urgentes da semana" (prioridade ≥ alta **e** vence em 7 dias), "Rápidas em casa"
(`#5min` **e** lista Casa). Abrir uma smart-list mostra exatamente as tarefas que casam com a
regra, sem eu remontar o filtro toda vez. Além das que eu crio, já encontro a built-in
"Hoje + Vencidas" pronta.

**Why this priority**: transforma tags + datas + prioridade em organização acionável. Depende das
tags (US1) para o caso de uso central. Entrega o diferencial "smart lists como objeto de 1ª
classe" da master.

**Independent Test**: criar uma smart-list com regras combinando tag + prioridade + data,
persisti-la, reabrir e confirmar que retorna o conjunto correto; alterar a regra e ver o conjunto
mudar; consultar a mesma smart-list pelo Telegram e obter as mesmas tarefas; conferir a built-in
"Hoje + Vencidas" sem nenhuma linha em `task_filters`.

**Acceptance Scenarios**:

1. **Given** o FilterModal, **When** crio "Urgentes da semana" com `priority >= 2` **and** `due_date within 7d`, **Then** ela aparece na sidebar e abre a `ListScreen` com só as tarefas que casam.
2. **Given** uma smart-list existente, **When** edito a regra (troco a tag), **Then** o conjunto exibido muda de acordo e a mudança persiste.
3. **Given** a built-in "Hoje + Vencidas", **When** a abro, **Then** vejo as tarefas com `due_date <= hoje` (abertas), sem que ela exista como linha em `task_filters`.
4. **Given** uma smart-list cuja regra referencia uma tag/lista que foi excluída, **When** a abro, **Then** ela não quebra: não casa nada e a UI sinaliza a referência órfã.
5. **Given** uma smart-list salva, **When** a consulto pelo Telegram (ex.: "o que tem em Urgentes da semana"), **Then** recebo as mesmas tarefas do webapp (paridade — mesma tradução de regras → `WHERE`).
6. **Given** o FilterModal, **When** excluo uma smart-list, **Then** ela some da sidebar e nenhuma tarefa é afetada.

---

### User Story 3 - Ver as tarefas num calendário (Priority: P3)

Abro a view **Calendário** e vejo minhas tarefas com data posicionadas nos dias certos —
incluindo as **próximas ocorrências** das recorrentes (mesmo as que ainda não existem como linha
viva, projetadas pela regra). Navego entre meses/semanas e clico num dia para ver/abrir as
tarefas dele. Pelo Telegram, peço "o que tenho essa semana" e recebo a mesma agenda.

**Why this priority**: é a view mais visual e a mais isolada — depende só das datas (012) e da
projeção virtual de recorrência. Fecha o conjunto de views previsto na master para a Fase 2.

**Independent Test**: alimentar um intervalo de datas com tarefas datadas + uma recorrente e
confirmar que o calendário posiciona cada ocorrência (real e virtual) no dia certo, sem
materializar linhas futuras; navegar entre meses; pelo Telegram, pedir um intervalo e conferir o
mesmo conjunto.

**Acceptance Scenarios**:

1. **Given** tarefas com `due_date` no mês corrente, **When** abro o Calendário, **Then** cada uma aparece no seu dia (com hora quando houver), substituindo o stub "Em breve".
2. **Given** uma recorrente "toda segunda", **When** vejo o mês, **Then** as próximas segundas aparecem como ocorrências **projetadas** (virtuais) sem criar linhas em `tasks`.
3. **Given** o Calendário no mês atual, **When** navego para o próximo mês, **Then** as projeções recalculam para o novo intervalo.
4. **Given** um dia com tarefas, **When** clico nele, **Then** vejo a lista do dia e consigo abrir uma tarefa (TaskModal).
5. **Given** o Telegram, **When** peço "o que tenho essa semana", **Then** recebo as tarefas/ocorrências do intervalo — as mesmas que o calendário do webapp mostra.

---

### Edge Cases

- **Tag com nome só diferindo na caixa** (`Mercado` vs `mercado`): tratadas como a **mesma** tag
  (índice único `LOWER(name)`); o quick-add reusa em vez de duplicar.
- **`#` colado em pontuação/acentos** ("#5min,", "#alta-energia"): o parser delimita o nome da tag
  por separadores e preserva hífen; vírgula/ponto final não entram no nome.
- **`#` sem nome** ("# isto") ou `#` no meio de uma URL: não vira tag; o texto fica intacto no
  título (não quebra o quick-add).
- **Remover a última tag de uma tarefa**: a tarefa continua existindo, só sem chips.
- **Excluir uma tag em uso**: os vínculos somem (cascade) e as tarefas permanecem; smart-lists que
  filtravam por ela passam a não casar nada (ver referência órfã abaixo).
- **Smart-list com regra vazia / sem condições**: rejeitada com mensagem clara (uma smart-list sem
  regra é uma lista comum) **ou** interpretada como "todas as tarefas abertas" — decisão registrada
  em Assumptions.
- **Regra com referência quebrada** (tag/projeto excluído depois): não casa nada e a UI indica a
  condição órfã; nunca lança erro.
- **Valores da DSL nunca interpolados direto no SQL**: a tradução regra→`WHERE` é sempre
  parametrizada (a master proíbe interpolar JSONB no SQL) — entrada hostil não vira injeção.
- **Calendário e recorrência virtual**: a projeção das próximas ocorrências é **calculada**, nunca
  materializada em `tasks`; o invariante "uma ocorrência viva por série" da 012 é preservado.
- **Calendário com intervalo grande / recorrência densa**: a projeção é limitada à janela visível
  (mês/semana) para não gerar ocorrências virtuais sem fim.
- **Tarefa sem data no Calendário**: não aparece no grid de dias (continua acessível nas listas);
  o calendário só posiciona o que tem `due_date`.

## Requirements *(mandatory)*

### Functional Requirements

**Tags**

- **FR-001**: O sistema MUST permitir vincular tarefas a tags numa relação N:N (`task_tag_links`),
  com **CRUD de tags** na camada de lógica (criar, renomear, excluir, listar).
- **FR-002**: O quick-add do webapp MUST interpretar o token `#tag` de forma **determinística**
  (sem LLM): extrai cada `#nome` do texto, vincula a tag (criando-a se não existir) e limpa o
  título; nomes de tag aceitam letras, números e hífen.
- **FR-003**: A resolução de tag por nome MUST ser **case-insensitive** (índice único
  `LOWER(name)`): o mesmo nome em caixas diferentes reaproveita a tag existente, nunca duplica.
- **FR-004**: O TaskModal MUST permitir **adicionar e remover** tags de uma tarefa, incluindo
  **criar uma tag nova on-the-fly**; a `TaskRow` e os resultados de busca MUST exibir as tags como
  chips discretos (`TagChip`).
- **FR-005**: O sistema MUST permitir **listar/filtrar tarefas por tag** pelos dois canais, com
  resultado idêntico.
- **FR-006**: A Kaguya (Telegram) MUST interpretar pedidos de etiquetagem em linguagem natural
  (criar com tag, adicionar/remover tag, listar por tag) usando o modelo já configurado, sem
  serviço novo.

**Smart-lists**

- **FR-007**: O sistema MUST permitir salvar **smart-lists** como objetos de primeira classe
  (`task_filters`): nome, ícone, view padrão e um conjunto de **regras declarativas** na DSL da
  master (combinador `and`/`or` + condições sobre `project_id`, `priority`, `due_date`, `tag`,
  `state`, `text`).
- **FR-008**: A camada de lógica MUST **traduzir as regras em `WHERE` parametrizado** — nunca
  interpolar valores do JSONB direto no SQL — e retornar as tarefas que casam.
- **FR-009**: As smart-lists salvas MUST aparecer na **sidebar** (abaixo das Listas) e, ao serem
  abertas, exibir suas tarefas na `ListScreen` no escopo do filtro; o `FilterModal` MUST permitir
  **criar, editar e excluir** smart-lists.
- **FR-010**: O sistema MUST oferecer a smart-list **built-in derivada** "Hoje + Vencidas"
  (`due_date <= hoje`, abertas) como filtro fixo do código — **não** persistida em `task_filters`.
- **FR-011**: Uma smart-list cujas regras referenciam tag/lista inexistente MUST **não casar nada**
  (sem erro) e a UI MUST sinalizar a referência órfã.
- **FR-012**: Consultar uma smart-list salva pelo Telegram MUST retornar **as mesmas tarefas** que
  o webapp (mesma tradução de regras na camada única).

**Calendário**

- **FR-013**: O sistema MUST oferecer uma **view de calendário** (mês/semana) que posiciona as
  tarefas com `due_date` nos dias corretos (com hora quando houver), substituindo o stub atual.
- **FR-014**: O calendário MUST **projetar as próximas ocorrências** das tarefas recorrentes da
  012 como ocorrências **virtuais** (calculadas pela regra), **sem materializar** linhas futuras em
  `tasks` — preservando o invariante "uma ocorrência viva por série".
- **FR-015**: A projeção de ocorrências virtuais MUST ser **limitada à janela visível**
  (mês/semana) para evitar geração ilimitada; navegar entre períodos recalcula a janela.
- **FR-016**: Um dia do calendário MUST ser clicável para ver as tarefas daquele dia e abrir uma
  tarefa (TaskModal).
- **FR-017**: A Kaguya (Telegram) MUST listar tarefas/ocorrências de um **intervalo de datas**
  (ex.: "o que tenho essa semana"), retornando o mesmo conjunto que o calendário do webapp para o
  intervalo.

**Paridade**

- **FR-018**: Toda capacidade desta fatia (tags, smart-lists, consulta por intervalo de datas)
  MUST estar disponível e idêntica nos dois canais; nenhuma regra pode ser exclusiva de um canal —
  a lógica vive na camada única e Telegram e router `/api/tasks/*` são fachadas finas. (A *view*
  de calendário é webapp-only; o equivalente no Telegram é a consulta por intervalo de FR-017.)

### Key Entities

Definidas na master (`data-model.md`). Esta fatia ativa três entidades que estavam adormecidas:

- **Tag** (`task_tags`: `name` único por `LOWER(name)`, `color`) e seu vínculo N:N
  (`task_tag_links`, cascade na exclusão de tarefa ou tag).
- **Filtro salvo / Smart-list** (`task_filters`: `name`, `icon`, `rules` JSONB na DSL da master,
  `default_view`, `position`).
- Usa intensivamente os campos de data da **Tarefa** (`due_date`, `due_time`) e a **Recorrência**
  (`task_recurrences`) da 012 para a projeção virtual no calendário.

Hábito e Check-in seguem adormecidos (Fase 4).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Criar uma tarefa com tag pelo quick-add ("comprar pão #mercado") leva **≤ 5s** (uma
  linha + Enter), com a tag criada/reusada e o título limpo — verificável pelo vínculo resultante.
- **SC-002**: Tags são **case-insensitive sem duplicar**: aplicar `#mercado` e `#Mercado` resulta
  em **uma** linha em `task_tags` — coberto por teste automatizado.
- **SC-003**: A tradução regra→SQL é **parametrizada e correta**: para um conjunto de regras de
  exemplo (tag + prioridade + data), a smart-list retorna exatamente o conjunto esperado, em
  **teste automatizado**, sem interpolação de JSONB no SQL.
- **SC-004**: 100% das capacidades de tags e smart-lists executáveis pelos **dois canais**, com
  cada canal funcionando com o outro desligado (auditável por checklist de paridade).
- **SC-005**: O calendário posiciona corretamente tarefas datadas **e** as próximas ocorrências
  virtuais de uma recorrente numa janela de mês, **sem** criar linhas futuras em `tasks`
  (verificável contando linhas vivas da série antes/depois de abrir o calendário).
- **SC-006**: Uma smart-list com referência órfã (tag/lista excluída) **não quebra** — abre, não
  casa nada e sinaliza a condição órfã (sem erro).

## Assumptions

- O schema da Fase 1 (com `task_tags`, `task_tag_links` e `task_filters`) já está aplicado em
  produção — esta fatia **não** altera o schema.
- A DSL de regras das smart-lists é a definida na master (`data-model.md`): um nível de
  combinador `and`/`or` sem aninhamento de grupos; aninhamento fica como extensão futura.
- Uma smart-list **sem nenhuma condição** é rejeitada com mensagem clara (uma lista sem regra é uma
  lista comum) — não é interpretada silenciosamente como "todas as tarefas".
- A projeção de ocorrências virtuais no calendário reusa o motor de recorrência da 012
  (`python-dateutil`/RRULE) e é sempre limitada à janela visível.
- A captura de tags em linguagem natural no Telegram usa o modelo já configurado da Kaguya
  (Gemini) — nenhum serviço novo.
- Nomes de tag são curtos e sem espaço (estilo hashtag: `alta-energia`, `5min`); o token termina no
  primeiro separador (espaço/pontuação), preservando hífen.
- A view de calendário é **webapp-only** por natureza visual; a paridade no Telegram é a consulta
  por intervalo de datas (FR-017), não uma grade.
- Cores de tag são opcionais (campo `color` já existe); na ausência, o `TagChip` usa um estilo
  neutro padrão.
