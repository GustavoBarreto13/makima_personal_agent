# Research: GTD core (Kaguya) — spec 034

## R1 — Status GTD: coluna própria vs. tags (como hoje)

**Decision**: adicionar uma coluna `gtd_status` (TEXT, CHECK IN `next_action|waiting|someday`,
NULL = não classificada) direto em `tasks`, com `waiting_note` e `waiting_since` ao lado.

**Rationale**: as tags (`RESERVED_TAGS = {aguardando, algum-dia}`) hoje são heurísticas —
FR-001/FR-003 exigem status de **primeira classe**. Uma coluna com CHECK é o padrão já usado
em `tasks.type`/`tasks.priority` (mesmo arquivo `schema_tasks_pg.sql`) — consistente, indexável,
sem custo de JOIN.

**Alternatives considered**: manter tags e só ensinar a UI a tratá-las como estado — rejeitado
porque a spec pede explicitamente a aposentadoria das tags reservadas (FR-010) e porque tags
continuam existindo para outros usos (não reservados), então misturar os dois sentidos no mesmo
mecanismo é a causa raiz do problema atual.

## R2 — Fila do processamento do inbox: coluna de controle própria vs. reuso de colunas existentes

**Decision**: **nenhuma coluna nova de "processado"**. A fila é puramente derivada:
`project_id = <inbox>` AND `deleted_at IS NULL` AND `completed_at IS NULL` AND
`parent_id IS NULL` AND `gtd_status IS NULL` AND `due_date IS NULL`.

**Rationale**: mapeando as 6 decisões do wizard (FR-003) para efeitos em colunas já existentes,
cada uma delas naturalmente tira a tarefa da fila sem precisar de um marcador extra:
próxima ação/aguardando/algum dia → `gtd_status` deixa de ser NULL; agendar → `due_date` deixa
de ser NULL; concluir agora → `completed_at`; lixo → `deleted_at`. Isso também resolve de graça
o edge case "processado direto no detalhe": definir status ou concluir pela tela normal já
produz o mesmo estado de banco, sem exigir um caminho de código dedicado ao wizard (Princípio V
— Minimal Footprint).

**Alternatives considered**: coluna `inbox_processed_at` — rejeitada por redundância (duplica
informação já implícita nas colunas acima) e por criar um segundo lugar para ficar
inconsistente (ex.: usuário limpa `due_date` depois — voltaria pra fila? com a derivação pura,
sim, e isso é o comportamento correto: sem data e sem status, é de novo "não processado").

## R3 — Timestamp de "desde quando" na migração das tags → status

**Decision**: usar o timestamp de quando a tag foi adicionada, com fallback para o timestamp da
migração (conforme `## Clarifications`). Na prática, **o fallback sempre se aplica**: a tabela
`task_tag_links` (schema atual) não tem coluna `created_at` — nunca guardou quando um vínculo
tag↔tarefa foi criado. Não vale a pena adicionar essa coluna agora só para a migração (as tags
reservadas somem logo em seguida, FR-010), então todas as tarefas migradas para "aguardando"
recebem `waiting_since = <timestamp da migração>`.

**Rationale**: Princípio V (Minimal Footprint) — instrumentar `task_tag_links` com auditoria de
criação serviria só a este migration one-shot, para um dado (histórico de tags) que deixa de
existir depois da migração.

## R4 — "Agendada" não é um valor de `gtd_status` (confirmação da Assumption)

**Decision**: `gtd_status` tem só 3 valores + NULL; uma tarefa "agendada" é só uma tarefa com
`due_date` preenchido, **independente** do `gtd_status`. FR-012 exige uma regra de limpeza:
setar `due_date` numa tarefa com `gtd_status = 'someday'` MUST limpar o status (`someday` e uma
data são estados contraditórios pela definição do GTD — "algum dia" é justamente "sem data
ainda"). Isso NÃO se aplica a `waiting` (posso estar aguardando algo COM prazo definido).

**Rationale**: extraído direto das FRs/Assumptions da spec; evita duplicar a fonte de verdade
de "está agendada" (já resolvido pela clarificação prévia da spec 010/master).

## R5 — Contextos: tabela dedicada vs. reaproveitar tags

**Decision**: nova tabela `task_contexts` (id, name ÚNICO case-insensitive, icon, position,
created_at) + coluna `tasks.context_id` (FK `ON DELETE SET NULL`).

**Rationale**: a spec e a clarificação são explícitas — contexto é campo de 1ª classe, não tag,
com no máximo um por tarefa (cardinalidade 1:N não modelável limpo em cima da tabela N:N de
tags). Mesmo padrão estrutural de `task_projects`/`task_tags` já existentes (nome único via
índice parcial/funcional, posição esparsa ×1000, sem grupo/hierarquia).

## R6 — DSL de smart-lists: novos campos `gtd_status` e `context_id`

**Decision**: estender `_FIELD_OPS` em `tools_filters.py` com `gtd_status: {eq, none}` e
`context_id: {eq, none}`, reusando a mesma tradução parametrizada (`_build_where_from_rules`).
Os built-ins GTD (`BUILTIN_FILTERS["next-actions"/"waiting"/"someday"]`) trocam suas condições de
`tag has/not_has` para `gtd_status eq`. `RESERVED_TAGS` e as referências de tag reservada somem
do módulo.

**Rationale**: reusa 100% do motor de tradução já existente e testado (SC-003 — sempre
parametrizado); as chaves (`next-actions`, `waiting`, `someday`) continuam as mesmas, então a
sidebar do frontend (`GTD_BUILTINS` em `types.ts:178-184`) não muda de contrato, só o que a
consulta representa por baixo.

## R7 — Views fixas de mercado (Todas/Hoje/Amanhã/Próximos 7 Dias/Inbox)

**Decision**: novo módulo `tools_views.py` (paralelo a `tools_kanban_views.py`) com 5 funções
fixas + 1 de contadores, reusando `_build_where_from_rules`/`_run_filter_rules` internamente:

| View | Regra (DSL) |
|---|---|
| Todas | nenhuma condição além da base "abertas" |
| Hoje | `due_date` before amanhã (mesma regra de `list_today_overdue` — reexposta, não duplicada) |
| Amanhã | `due_date eq tomorrow` (novo atalho, ver R8) |
| Próximos 7 Dias | `due_date within 7d` (inclui hoje — decisão de produto abaixo) |
| Inbox | `project_id in [<id do inbox>]` |

**"Próximos 7 Dias" inclui hoje?** A spec (FR-007) não deixa 100% explícito; adotamos **incluir
hoje** (mesmo padrão TickTick/Todoist citado nas Assumptions — "Próximos 7 dias" normalmente
absorve o hoje). Decisão de produto reversível em código (uma condição a menos), documentada
aqui em vez de reabrir clarificação (cota de 5 perguntas já usada; baixo risco de retrabalho —
é uma condição isolada em `tools_views.py`).

**Rationale**: views fixas são explicitamente "não editáveis" na spec (Key Entities) — um módulo
próprio, sem registro em `task_filters`, deixa isso literal no código (nenhuma tabela, sem CRUD).

## R8 — Atalho de data "amanhã" na DSL

**Decision**: estender `_resolve_relative_date` em `tools_filters.py` para reconhecer o literal
`"tomorrow"` → `hoje + 1 dia`. Espelhar no frontend: `OPS`/`defaultValue()` em
`webapp/frontend/src/pages/kaguya/modals/FilterModal.tsx` (o comentário ali já avisa que espelha
`_FIELD_OPS`).

**Rationale**: FR-009 e a Assumption técnica já apontam esse atalho como faltante; é a mesma
convenção dos atalhos existentes (`today`, `Nd`).

## R9 — Processamento do inbox no Telegram: reusar o padrão de wizard já existente no coordinator

**Decision**: NÃO criar um novo mecanismo de estado conversacional. O coordinator já tem um
padrão de wizard fora do loop do agente ADK — `coordinator/main.py`: dicionário
`_pending_action[chat_id]` guarda `{"action", "step", "data"}`, botões inline com
`callback_data` prefixado (`nc_`, `ncc_`, `fm_`) e um dispatcher central (`handle_callback`) que
roteia pelo prefixo. O processamento guiado do inbox ganha o mesmo formato: prefixo `ibx_`,
`_pending_action[chat_id] = {"action": "inbox_process", "queue": [...ids...], "index": 0}`,
um botão por decisão (`ibx_next_action:<id>`, `ibx_waiting:<id>`, `ibx_someday:<id>`,
`ibx_schedule:<id>`, `ibx_done:<id>`, `ibx_trash:<id>`).

**Resposta em texto livre (decisão híbrida da clarificação)**: quando o usuário responde em
texto livre em vez de clicar, a mensagem cai no fluxo normal do agente ADK (Kaguya), que chama
uma tool nova `process_inbox_item(task_id, decision, ...)` — a MESMA função de lógica usada
pelos botões (nenhuma duplicação de regra de negócio); o agente só precisa mapear a frase livre
para uma das 6 decisões fixas (prompt-level, sem parsing customizado).

**Rationale**: reaproveita 100% um padrão já testado em produção (contas do Nami, menu de livros
da Frieren) em vez de introduzir `ConversationHandler`/FSM novo — Princípio III (Self-Contained)
e V (Minimal Footprint). O texto livre e os botões convergem na mesma função de lógica
(`tools_tasks.process_inbox_item`), preservando paridade de canal com o webapp.

## R10 — Herança de `gtd_status`/contexto por recorrência

**Decision**: o ponto de "gerar próxima ocorrência" (dentro de `complete_task`/
`_complete_task_on_cursor` em `tools_tasks.py`) passa a copiar `gtd_status`, `context_id`,
`waiting_note` para a nova linha; `waiting_since` **não** é copiado — se a nova ocorrência
nascer com `gtd_status='waiting'` herdado, ela conta como uma NOVA espera (R do clarify:
"desde quando" reseta) e recebe `waiting_since = now()` no momento da geração.

**Rationale**: FR-012 exige a herança; a regra de reset de `waiting_since` (clarificação Q2)
se aplica igualmente aqui — é a mesma transição "entrar em waiting" (mesmo que via geração
automática, não edição manual).

## R11 — Estrutura de arquivos (nenhuma tecnologia nova)

Confirma-se pela varredura da base de código: **nenhuma dependência nova** é necessária — a
stack (FastAPI, React/TypeScript, PostgreSQL/psycopg2, python-telegram-bot, google-adk) já
implementa tudo que a feature precisa. Toda a Technical Context é "existente", sem
NEEDS CLARIFICATION remanescente.
