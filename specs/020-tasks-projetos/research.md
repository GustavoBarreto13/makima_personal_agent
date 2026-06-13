# Research — Planejamento de Projetos (020)

Decisões técnicas do Phase 0. O repo já contém o padrão para quase todas as escolhas
(camada de lógica única, motor puro, motor de capacidade, schema idempotente); pesquisa
externa limitou-se à definição conceitual dos três frameworks (PARA, GTD Natural Planning),
feita na sessão de brainstorming. Nenhum `NEEDS CLARIFICATION` ficou em aberto.

## D1 — Três frameworks em camadas (a arquitetura conceitual)

**Decision**: compor **PARA** (organização: onde a Lista vive), **GTD Natural Planning**
(estrutura: como o projeto é planejado) e o **Meu Dia** existente (execução: o que faço
agora). Os três não competem — cada um responde a uma pergunta diferente e atua numa camada.

**Rationale**: o usuário precisa de um esqueleto único que sirva para projeto técnico
(DS/BI/código) **e** pessoal não-técnico. O Natural Planning é domínio-agnóstico (é como o
cérebro já planeja qualquer coisa); o PARA organiza por acionabilidade, não por assunto,
servindo igual a "Trabalho" e "Casa". A composição foi validada com o usuário.

**Alternatives considered**: (a) OKR (objetivos + resultados-chave) — bom para metas
corporativas, pesado demais para "organizar uma viagem"; (b) modelo livre sem framework —
não dá o "esqueleto guia" que faz alguém destravar o planejamento (o oposto do SC-001).

## D2 — Projeto = Lista promovida (não uma entidade paralela)

**Decision**: o Projeto **não** é uma tabela de tarefas nova. É uma **Lista
(`task_projects`) promovida**: ganha uma linha 1:1 em `project_plans` e `para_type='project'`.
As tarefas continuam na Lista; só ganham `phase_id` opcional.

**Rationale**: tarefas já têm `project_id NOT NULL` apontando para uma Lista. Reusar a Lista
como container evita duplicar ownership de tarefa, e o Kanban/Calendário/Meu Dia existentes
continuam funcionando sem mudança. Minimal Footprint (Principle V).

**Alternatives considered**: (a) tabela `projects` independente com suas próprias tarefas —
duplicaria todo o motor de tarefas; (b) estender `task_projects` com dezenas de colunas de
planejamento — mistura o container (Lista) com a camada de planejamento (Plano), poluindo a
tabela mais quente do sistema. A tabela-satélite `project_plans` mantém os conceitos
separados e a `task_projects` enxuta.

## D3 — Fase = marco (uma tabela só)

**Decision**: uma única tabela `project_phases`. Cada Fase tem `target_date` **opcional**;
quando preenchida, a Fase é renderizada como **marco** na timeline. Não há tabela de marcos.

**Rationale**: decisão explícita do usuário ("fase já é o marco"). Evita uma segunda tabela
e a complexidade de marcos soltos no meio de fases, que raramente se justifica em projeto
pessoal. YAGNI.

**Alternatives considered**: tabela `project_milestones` separada — mais expressiva (marcos
datados independentes de fases), mas não pedida; fica como evolução se surgir necessidade.

## D4 — Saúde ponderada por estimativa (motor puro derivado)

**Decision**: módulo puro `agents/kaguya/project_health.py` com
`compute_project_health(tasks, phases, start_date, target_date, today)`, **sem banco, sem
rede** (espelha `capacity.py`). Peso de cada tarefa = `duration_min`; tarefa sem estimativa
recebe **peso-fallback** = mediana das estimativas do projeto (ou `30` min se nenhuma).
`pct_concluido = soma(peso das concluídas) / soma(peso de todas)`. Status de prazo compara
`pct_concluido` com `pct_esperado = (today − start_date) / (target_date − start_date)`:
🟢 se real ≥ esperado; 🟡 se a defasagem ≤ 15 pontos; 🔴 acima disso ou `target_date`
vencida com projeto incompleto. A saúde **nunca** é persistida — é sempre recalculada.

**Rationale**: ponderação por estimativa foi a decisão do usuário (tarefas maiores contam
mais). Reaproveitar o `duration_min` do Meu Dia evita campo novo. Motor puro = testável em
isolamento (SC-004) e reusável pelos dois canais. Derivado evita estado obsoleto.

**Alternatives considered**: (a) contagem simples de tarefas — mais previsível, mas menos
fiel ao esforço; (b) % por fases concluídas — visão macro demais. Ambas viram fácil
fallback se a estimativa não for preenchida (a ponderação degrada para contagem quando todas
recebem o peso-fallback).

## D5 — PARA é o nível de topo; Grupos aninham dentro

**Decision**: `para_type` (`project`/`area`/`resource`) entra **tanto** em `task_projects`
(Lista) **quanto** em `task_project_groups` (Grupo). A sidebar passa a ter baldes de topo
fixos (Projetos / Áreas / Arquivo nesta fase); dentro de cada balde, os Grupos (filtrados
pelo seu `para_type`) e as Listas. O balde **Arquivo** é derivado de `archived_at`, não de
`para_type`.

**Rationale**: o usuário escolheu "PARA é o nível de cima, Grupos aninham dentro". `para_type`
no Grupo garante que um Grupo viva sob um único balde. Default `area` preserva o legado sem
migração de dados (SC-006). Arquivo reusa o soft-delete existente.

**Alternatives considered**: (a) `para_type` só na Lista, Grupo agnóstico — Grupos poderiam
misturar baldes, quebrando a hierarquia; (b) Grupos viram os baldes (sem coluna nova) — zero
schema, mas a Kaguya não "saberia" o que é uma Área (sem semântica para saúde/regra futura).

## D6 — Recursos (R) fora do v1; ponte futura com a Kurisu

**Decision**: o `para_type` já inclui `resource` no CHECK (forward-compat), mas o balde
**Recursos não é exibido nem semeado** nesta fase. Recursos (material de referência) é o
domínio natural da **Kurisu** (RAG sobre o vault Obsidian) — a integração fica como evolução.

**Rationale**: decisão do usuário ("deixar R fora por enquanto"). Evita duplicar na Kaguya o
que a Kurisu fará melhor. Manter o enum aberto evita migração quando R chegar.

**Alternatives considered**: implementar Recursos como Listas ricas na Kaguya — duplicação
provável; remover `resource` do enum — exigiria migração de schema depois.

## D7 — Áreas: só marcação agora (ritual de revisão é futuro)

**Decision**: nesta fase, Área é apenas uma Lista com `para_type='area'` — **sem** data-alvo
e **sem** cálculo de saúde de prazo (o motor degrada graciosamente). A cadência de revisão
(weekly/monthly review do GTD) fica para uma fase futura.

**Rationale**: decisão do usuário. Entrega a organização PARA sem o peso de um motor de
revisão recorrente agora. O motor de saúde já trata "sem datas" → sem status de prazo.

**Alternatives considered**: Área com cadência de revisão desde já (aparecendo no Meu Dia) —
mais completo, fora do escopo desta fatia.

## D8 — Onde vive a camada de lógica (paridade de canais)

**Decision**: `agents/kaguya/tools_plans.py` (funções puras sobre `agents/db.py`, retornando
dicts com `"status"`) concentra CRUD de `project_plans`/`project_phases`, promover/rebaixar,
mover `para_type` e leitura da saúde (chamando `project_health.py`). O router
`webapp/backend/routers/tasks.py` **importa e envelopa** essas funções; o agente as expõe ao
Gemini via `tools.py`. Os motores `project_health.py` e `project_templates.py` são puros.

**Rationale**: é o padrão consagrado do repo (FR-002 da 011; `routers/finances.py` envelopa
as tools da Nami). Paridade de canais sai de graça. Motores puros isolam o que é testável sem
banco.

**Alternatives considered**: pacote `services/` novo — sem precedente, viola Minimal
Footprint; lógica no router com o agente chamando HTTP — acopla Telegram ao webapp.

## D9 — Schema idempotente, aplicado de uma vez

**Decision**: um arquivo novo `agents/kaguya/schema_projects_pg.sql` com `CREATE TABLE IF NOT
EXISTS` (`project_plans`, `project_phases`) e `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
(`para_type` em Lista/Grupo, `phase_id` em `tasks`), registrado em `scripts/setup_schemas.py`.

**Rationale**: mesmo mecanismo dos outros agentes (a 014/komi registrou seu próprio
`schema_pg.sql` no setup). Idempotência permite rodar com segurança sobre o banco existente
(SC-006). `ADD COLUMN IF NOT EXISTS` evita migração destrutiva.

**Alternatives considered**: embutir no `schema_tasks_pg.sql` existente — mistura o schema
base de tarefas com a camada de planejamento; um arquivo separado é mais legível e isolado.

## D10 — Webapp que guia (wizard) — o coração da UX

**Decision**: a criação/promoção de Projeto é um componente **`ProjectWizard.tsx`** que
conduz por *uma pergunta por vez* na ordem do GTD (tipo → propósito → visão → fases sugeridas
→ primeira ação), cada passo pulável. A tela `ProjectScreen.tsx` usa empty states que ensinam,
divulgação progressiva e a próxima ação sempre visível. Detalhes no `design-guide.md`.

**Rationale**: SC-001 é o critério de sucesso da feature (decisão do usuário). Um wizard
remove a "tela em branco" que trava o planejamento. Reusa os tokens/padrões visuais do shell
Kaguya — sem biblioteca nova.

**Alternatives considered**: um único formulário rico com todos os campos — rápido de
construir, mas é exatamente o "formulário vazio" que o SC-001 proíbe; um assistente em
modal único sem passos — perde a sensação de condução.

## D11 — Templates como dados puros no código

**Decision**: `agents/kaguya/project_templates.py` — um dicionário `template_type → {fases:
[...], tarefas_esqueleto?: [...]}` (dados puros, sem banco). Na criação, a camada de lógica lê
o template e semeia as fases. Moldes: `data_science` (CRISP-DM), `bi` (Dashboard BI), `codigo`
(Discovery→Deploy), `pessoal` (Definir→Organizar→Executar→Revisar).

**Rationale**: moldes fixos no código atendem o pedido sem a complexidade de templates
editáveis (YAGNI). Dados puros = testáveis e fáceis de revisar. Semear fases reusa o CRUD de
fase já existente da camada de lógica.

**Alternatives considered**: templates no banco editáveis pelo usuário — fora de escopo;
templates em JSON externo — sem ganho sobre um módulo Python versionado.

## D12 — Testes

**Decision**: pytest no padrão do repo. Motores puros: `tests/agents/test_project_health.py`
e `test_project_templates.py` (à la `test_capacity` — sem banco). Camada de lógica:
adicionar a `tests/agents/` casos de `tools_plans.py` contra banco com schema aplicado
(promover, semear template, atribuir tarefa a fase, mover entre baldes, `project_status`
agrega certo). Router: estender `tests/test_tasks_router.py` com `/api/tasks/plans/*` e
`para_type`. E2E manual via `quickstart.md`.

**Rationale**: SC-004 exige teste do motor (cálculo de saúde); o resto segue o costume do
repo (motor puro testado isolado, lógica contra banco, router via TestClient, E2E manual).
