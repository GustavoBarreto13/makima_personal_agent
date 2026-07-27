# Phase 0 Research: Meu Dia — contexto Trabalho vs Pessoal (spec 038)

## R1 — Contexto vive na lista, nunca na tarefa

**Decision**: `task_projects.context` (`'personal'` padrão, ou `'work'`). Nenhuma coluna em
`tasks` — o contexto de uma tarefa é sempre resolvido por `JOIN` com `task_projects` no
momento da leitura (mesmo padrão de `project_name` já feito em `list_my_day`).

**Rationale**: A Assumption do spec.md já decide isso ("Contexto na lista, não na tarefa") e
FR-002 exige que mover uma tarefa de lista atualize o contexto "na hora" — copiar o valor para
`tasks` exigiria um trigger ou reescrita em toda operação de mover/reatribuir lista
(`update_task`, `move_task`, criação com `project_id`). Herança por JOIN resolve isso de graça
e é impossível divergir.

---

## R2 — Contexto do calendário: coluna em `calendar_prefs`, não tabela nova

**Decision**: `calendar_prefs.context` (mesmo domínio `'personal'`/`'work'`, padrão
`'personal'`). Reaproveita a tabela de 1-linha-por-calendário já existente (fatia 019) — o
mesmo lugar onde `visible`/`color`/`position` já vivem.

**Rationale**: Princípio V (minimal footprint) — criar uma tabela nova para "mais uma
propriedade de calendário" seria redundante com uma tabela que já existe exatamente para isso.

---

## R3 — Invariante do Inbox garantida no schema, não só na aplicação

**Decision**: `CHECK (NOT is_inbox OR context = 'personal')` em `task_projects`.

**Rationale**: Mesmo padrão de outras invariantes deste schema (`uq_task_projects_inbox`,
`uq_task_weekly_reviews_open`) — a regra "Inbox é sempre Pessoal" (FR-001/edge case) fica
garantida pelo banco, não apenas por uma checagem que a camada de lógica poderia esquecer de
fazer em algum caminho futuro. `update_project` também valida isso ANTES do UPDATE, para
devolver uma mensagem amigável (400) em vez de deixar o CHECK do Postgres estourar como erro
cru.

---

## R4 — Ação em massa por grupo: função dedicada, não reuso de `update_project`

**Decision**: Nova função `set_group_context(group_id, context)` em `tools_projects.py` — um
`UPDATE task_projects SET context = %s WHERE group_id = %s AND NOT is_inbox` em uma única
instrução (não um loop chamando `update_project` por lista).

**Rationale**: FR-003 pede uma ação atômica sobre "as listas do grupo"; um `UPDATE` único é
mais simples e evita N chamadas transacionais separadas. O filtro `AND NOT is_inbox` é uma
salvaguarda defensiva (o Inbox normalmente não pertence a nenhum grupo, mas nada no schema
impede tecnicamente) — nunca deve violar o CHECK de R3.

---

## R5 — Toggle "visão única/dividida": `localStorage`, não uma tabela

**Decision**: Chave `kg:myday:view` (`'split'` | `'single'`) em `localStorage`, seguindo
exatamente o padrão já usado em `KaguyaShell.tsx` (`readViewMode`/`writeViewMode` para lembrar
Lista×Kanban por lista/grupo) e em `kg-tweaks` (tema, acento, densidade).

**Rationale**: É uma preferência de exibição pura, sem necessidade de sincronizar entre
dispositivos (usuário único, mesmo racional de todas as prefs de UI já em localStorage neste
mesmo shell) — criar uma tabela de 1 linha só para isso violaria o Princípio V sem ganho real,
diferente da decisão R4 da spec 037 (lá a preferência alimentava o valor inicial de um formulário
que precisa ser consistente entre abas/deploys; aqui é puramente de exibição).

**Alternatives considered**: Persistir no servidor (mesmo padrão de `focus_prefs`) —
rejeitado por não haver necessidade real de continuidade cross-device para uma feature de
puro layout, e por já existir o precedente direto (localStorage) no mesmo arquivo.

---

## R6 — Semântica da soma de capacities (FR-006/SC-002): só os campos aditivos

**Decision**: A igualdade "capacity(trabalho) + capacity(pessoal) = capacity(visão única)"
vale para os campos que são **somas diretas dos insumos brutos** — `estimado_min` e
`agenda_min` (e, por consequência, `no_plano`, uma contagem). `livre_min`, `folga_min` e
`excedeu` são recalculados **cada um contra a mesma janela cheia** (8h–22h) e por isso **não**
são somáveis entre si (somar dois `livre_min` contaria a janela de 840 min duas vezes) — cada
barra mostra corretamente "esse contexto sozinho cabe no dia inteiro?", que é exatamente o
que o edge case do spec.md pede ("cada barra sinaliza excesso de forma independente").

**Rationale**: O motor `compute_capacity` é **intocado** (Constitution V) — não criamos uma
variante "ciente de contexto". Cada partição do dia usa a MESMA janela cheia, porque a v1 não
tem "horário comercial" separado (Assumption do spec.md) — logo `livre_min`/`folga_min` de cada
contexto respondem "esse contexto cabe sozinho no dia inteiro?", não "quanto sobra depois do
outro contexto". Documentar isso evita um bug de interpretação onde alguém tentasse "consertar"
a soma de `livre_min` no futuro.

**Verificação SC-002**: implementada comparando `estimado_min`/`agenda_min`/`no_plano` da soma
work+personal contra os mesmos campos da chamada com os insumos não-particionados — ver
`quickstart.md`.

---

## R7 — `_gcal_events_for_day`: contexto por evento, não uma segunda função

**Decision**: Estende `_gcal_events_for_day` (já existente) para também ler
`calendar_prefs.context` por calendário e devolver DUAS listas de tuplas de minutos
(`eventos_tuplas_work`, `eventos_tuplas_personal`) além da lista serializada única (que já
carrega `calendar_id` — o frontend pode inferir contexto se precisar, mas o campo `context`
também é anexado a cada item serializado por transparência).

**Rationale**: Evita duas idas ao Google Calendar (uma função só, uma chamada só a
`list_events`) — partição acontece em memória sobre o resultado já buscado, mesmo
"nunca levanta, falha vira `calendar_ok=False`" da função original.

---

## R8 — Seção vazia se recolhe: decisão de frontend, não de backend

**Decision**: O backend sempre devolve `plano_work`/`plano_personal` (podem ser listas
vazias) e `capacity_work`/`capacity_personal` sempre calculadas; o **frontend** decide não
renderizar a seção quando `plano_work.length === 0 && capacity_work.estimado_min === 0` (edge
case "fim de semana / contexto vazio").

**Rationale**: Mantém o backend como fonte de dados pura (sem heurística de "esconder"),
consistente com o padrão do resto do Meu Dia (o backend nunca decide o que a UI mostra).
