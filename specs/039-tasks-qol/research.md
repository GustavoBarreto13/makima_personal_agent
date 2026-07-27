# Research: QoL — arquivar listas + localização nos eventos (Kaguya)

Duas melhorias independentes (Parte A / Parte B). Pesquisa feita direto no código existente
(sem "NEEDS CLARIFICATION" — a spec já veio com as duas bases mapeadas nas Assumptions).

## Parte A — Arquivar listas

### R1: Reusar `task_projects.archived_at`, não criar coluna nova

**Decisão**: o campo `archived_at` já existe em `task_projects` e já é gravado por
`delete_project()` (`agents/kaguya/tools_projects.py:405`) — hoje ele funciona como o único
"desligador" de uma lista (some das views), mas só é acionado internamente pelo fluxo de
exclusão, sem exposição de arquivar/restaurar direto. Isso bate exatamente com a Assumption
da spec ("a marca de arquivamento já existe... hoje só é usada internamente pelo fluxo de
exclusão"). Reusamos o mesmo campo para o novo fluxo de **arquivar** (`archive_project`) e
adicionamos o que faltava: **restaurar** (`restore_project`, hoje inexistente para nenhum
caso).

**Rationale**: nenhuma migração de schema é necessária para a Parte A. `archive_project`
grava `archived_at = now()` **sem tocar em tarefas/colunas** (diferente de `delete_project`,
que sempre reaponta ou soft-deleta as tarefas e apaga as colunas do board). `restore_project`
zera `archived_at`.

**Efeito colateral aceito**: como é o mesmo campo, `restore_project` tecnicamente também
conseguiria "reviver" uma lista que passou por `delete_project` (já que ambas ficam com
`archived_at` preenchido). Isso não viola FR-007 (a exclusão em si — o que acontece com as
tarefas e colunas — continua inalterada); na pior hipótese o usuático ganha de graça uma
forma de desfazer a parte "lista sumiu" de uma exclusão antiga, sem as colunas do board (que
foram de fato apagadas). Não implementamos nenhuma trava extra para isso — é uma
generosidade aceitável do reaproveitamento, não um requisito quebrado.

**Alternativas consideradas**: renomear o `archived_at` atual para `deleted_at` (semântica
mais precisa, já que `delete_project` é quem o usa) e criar um `archived_at` novo e
dedicado. Rejeitada por escopo: tocaria ~10 pontos de código já estáveis (tools_tasks,
tools_projects, testes) só por clareza de nome, sem nenhum requisito funcional exigindo a
distinção binária entre "arquivada pelo usuário" vs "arquivada pelo delete".

### R2: Auditoria das views operacionais — todas passam por 2 pontos de JOIN

**Decisão**: mapeei todo `JOIN task_projects` em `agents/kaguya/*.py` e descobri que a
maioria das views de mercado/smart-lists **já convergem** para um único helper:
`tools_filters._build_where_from_rules()` (linha ~253, `base = "t.deleted_at IS NULL"`).
Isso é usado por `_run_filter_rules` (smart-lists salvas), `tools_views.py` (as 5 views
fixas: Todas/Hoje/Amanhã/Próximos 7/Inbox) e `tools_kanban_views.py` (filtro de view
configurável do Kanban). **Um único ponto de correção resolve a maior parte da auditoria.**

Os pontos que NÃO passam por esse helper (queries próprias) e precisam do fix
individualmente:
- `tools_calendar.py::list_tasks_in_range` — 2 queries (reais + recorrentes virtuais) —
  alimenta o `CalendarScreen` (mês/semana) e a suspensão de recorrência (FR-006, de graça:
  se a query já não traz a tarefa-mãe da série, `project_occurrences` nunca é chamado para
  ela).
- `tools_tags.py::list_tasks_by_tag` — clique numa tag na sidebar.
- `tools_tasks.py::list_tasks_today` — usada pelo widget "hoje/vencidas" fora do bloco de
  filtros (mantido por retrocompat de uma versão anterior à unificação em `tools_views`).
- `tools_tasks.py::list_eisenhower_tasks` — matriz de Eisenhower.
- `tools_tasks.py::list_my_day` — as 3 queries (`plano_rows`/`pendencias_rows`/
  `sugestoes_rows`) já fazem `JOIN task_projects p` (spec 038 adicionou `p.context`) —
  só falta o `AND p.archived_at IS NULL`.

**Rationale**: em vez de inventar uma abstração nova de "filtro global de arquivadas",
aproveitamos que o código já convergiu a maior parte das views num único helper (dívida
técnica zero) e aplicamos o mesmo padrão (`AND p.archived_at IS NULL` no JOIN) nos poucos
pontos que sobraram — mesmo estilo de fix pontual usado no spec 038 para `context`.

### R3: Busca global é a única exceção — não filtra, mas sinaliza

**Decisão**: `tools_tasks.py::search_tasks` (rota `GET /api/tasks/search`, consumida pelo
Command Palette ⌘K — spec 018) é a **única** consulta que continua trazendo tarefas de
listas arquivadas (FR-003), acrescentando `p.archived_at IS NOT NULL AS project_archived`
no SELECT e repassando esse booleano (`archived: bool`) no item serializado para o
frontend renderizar o badge "lista arquivada".

### R4: Telegram — resolução de nome cai numa lista arquivada (FR-008)

**Decisão**: `resolve_project_id_by_name()` (usado por `create_task`/
`list_tasks_by_project` quando o usuário fala o nome da lista) já filtra
`archived_at IS NULL` — então hoje uma lista arquivada simplesmente "não existe" para
quem fala o nome dela. Criamos `resolve_project_id_by_name_any()` (mesma lógica de
match exato→prefixo, mas sem o filtro) só para o caminho de erro: quando o resolve normal
falha, tentamos esse; se achar e a lista estiver arquivada, devolvemos
`{"status": "error", "message": "A lista '<nome>' está arquivada. Restaure-a antes de usar (chame restaurar com o id <id>)."}`
em vez do genérico "não encontrada". O LLM da Kaguya, com a tool `restore_project` já
registrada, consegue oferecer e executar a restauração na mesma conversa.

### R5: Recorrência suspensa "de graça"

**Decisão**: nenhuma mudança no motor de recorrência (`recurrence.py`). A suspensão
(FR-006) é um efeito colateral do R2: `tools_calendar.py::list_tasks_in_range` só projeta
ocorrências virtuais para tarefas cuja lista está viva (`p.archived_at IS NULL` no
`rec_rows`) — arquivar a lista tira a tarefa-mãe da consulta, então
`project_occurrences()` nunca roda para ela. Restaurar a lista devolve a tarefa à consulta
e as ocorrências voltam a aparecer automaticamente.

## Parte B — Localização nos eventos

### R6: O campo já existe ponta a ponta — falta um elo na cadeia (Meu Dia)

**Decisão**: `agents/kaguya/gcal.py::_format_event()` (linha 720) já normaliza
`location` de todo evento bruto da Google Calendar API, e isso já chega ao
`CalendarScreen.tsx` (linha 202: `loc: ev.location || undefined`) e ao `EventPopover.tsx`
(linha 292, exibido como texto puro). O único elo que falta é
`agents/kaguya/tools_tasks.py::_gcal_events_for_day()` (usado só pelo Meu Dia) — o dict
`item` que ele monta (linha ~2116) não inclui `location`, mesmo o `ev` de entrada já
tendo o campo (vem do mesmo `_gcal.list_events()`). Fix: uma linha
(`"location": ev.get("location", "")`).

**Rationale**: nenhuma mudança no `gcal.py` nem em nenhuma chamada à API do Google —
é estritamente "parar de descartar um campo que já chegou".

### R7: Link do Maps é uma função pura no frontend, sem nova dependência

**Decisão**: função `mapsLinkFor(loc: string): string` em
`webapp/frontend/src/pages/kaguya/lib/maps.ts` — se `loc` já for uma URL
(`/^https?:\/\//i`), devolve ela mesma (FR-010, cenário 4: vídeo/Meet); senão, devolve
`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc)}` (busca
universal do Maps, sem chave de API — mesma decisão já assumida na spec). `encodeURIComponent`
cobre acentos/vírgulas/`&` (SC-004) nativamente.

**Onde aplicar**: `EventPopover.tsx` (troca o `<span>{ev.loc}</span>` por um `<a>` com esse
href, `target="_blank" rel="noreferrer"`) e `DayTimeline.tsx` (nova linha dentro do bloco de
evento com hora, mesma âncora). Eventos de dia inteiro (chip compacto) **não** ganham o link
— são só um rótulo de 1 linha sem espaço para mais um elemento; local sem endereço continua
sem nenhum resíduo (FR-011) porque a renderização é condicional (`ev.location &&`/`ev.loc &&`).

### R8: Sem popover novo no Meu Dia

**Decisão**: o bloco de evento do Meu Dia (`DayTimeline.tsx`) é hoje só uma leitura
(`title` do HTML nativo, sem clique/popover). Em vez de construir um popover novo só para
isso, o local vira uma segunda linha de texto **dentro do próprio bloco** (mesmo padrão do
`kg-tl-slot-time` já existente), e essa linha é o link clicável — atende literalmente
"o local é exibido no bloco do evento" (US3, critério 1) sem inventar uma superfície de UI
nova. O clique no link usa `stopPropagation` para não conflitar com o drag/drop do bloco.

## Resumo de escopo

Nenhuma migração de schema (Parte A reusa `archived_at` já existente; Parte B só transporta
um campo que já existe). Toda a mudança é lógica de consulta (backend) + exibição
(frontend) — webapp + Telegram, mesmo padrão de paridade de canais das specs anteriores.
