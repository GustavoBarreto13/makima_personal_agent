# Implementation Plan: Yato — agente de Viagens

**Branch**: `066-travel-agent` | **Date**: 2026-08-21 | **Spec**: `specs/066-travel-agent/spec.md`

**Input**: Feature specification from `specs/066-travel-agent/spec.md`

**Nota**: `specs/066-travel-agent/research.md` já existe e é a **pesquisa de domínio** (fonte do
protocolo de 7 passos, da matriz ANTT e da base de apps regionais) — não é o Phase 0 deste plano e
não é tocado por ele. As decisões técnicas de implementação vivem na seção "Phase 0" abaixo.

## Summary

Criar o agente **Yato** — domínio de viagens (roteiro dia a dia + dossiê de mobilidade urbana do
destino + matriz economia×conforto + orçamento com lançamento atômico na Nami), entregue
simultaneamente como agente conversacional (bot via Hermes/MCP, ADK legado via coordinator) e como
shell React em `webapp/frontend/src/pages/yato/`, consumindo `/api/travel/*`. MVP sem nenhuma API
paga: cobertura de apps e transporte público são heurísticas declaradas, nunca veredito — quem
decide é o protocolo de verificação manual conduzido passo a passo. Abordagem técnica: replicar
ponto a ponto o padrão dos agentes mais recentes do repo (Mai/Akane para a anatomia do pacote,
Kaguya/`capacity.py` para o motor puro da matriz de conforto, Kaguya↔Nami/`complete_payment_task`
para a transação atômica do orçamento) — nenhum padrão novo é introduzido.

## Technical Context

**Language/Version**: Python 3.11 (agente/backend) · TypeScript 5 / React 19 (frontend)

**Primary Dependencies**: `google-adk` (ADK `Agent`, modelo `gemini-2.5-flash`) ·
`psycopg2-binary` síncrono via `agents/db.py` · FastAPI (`webapp/backend`) · Vite 6 (frontend) —
todas já presentes em `requirements.txt` / `package.json`, nenhuma dependência nova

**Storage**: PostgreSQL existente do projeto (mesmo banco de todos os agentes). 8 tabelas novas:
`trips`, `trip_items`, `mobility_dossiers`, `mobility_checks`, `trip_mobility_snapshots`,
`mobility_apps`, `trip_checklist_items`, `trip_budget_items`. Sem migração de dados (schema novo)

**Testing**: `pytest` — `tests/agents/test_yato.py` (tools, contra banco de teste, padrão dos
demais `test_<agente>.py`) e `tests/agents/test_yato_comfort.py` (motor puro `comfort_matrix.py`,
sem banco, um caso por linha da tabela ANTT do `research.md`)

**Target Platform**: Linux server (VPS, Docker Swarm) — sem mudança de infraestrutura; agente é
pacote Python importado pelo `makima-mcp` e pelo `webapp`, sem container próprio

**Project Type**: Web application (backend FastAPI + frontend React), já existente no repo —
Yato adiciona um domínio de agente + um router + um shell, no padrão dos 10 domínios existentes

**Performance Goals**: sem meta numérica própria — herda o comportamento síncrono/request-response
dos demais agentes (SC-001: montar viagem de 4 dias com 10 itens em <5 min de conversa)

**Constraints**: **zero variável de ambiente nova, zero dependência nova, zero chamada a API
externa paga** (FR-030 / SC-009) — é a restrição mais dura da fatia e reduz o design space:
qualquer heurística que pareça precisar de geocodificação, distância real ou horário de
funcionamento fica fora de escopo (registrado em "Fica para depois" no spec.md)

**Scale/Scope**: single-user (padrão do repo); 8 tabelas, ~2 dúzias de tools, 1 motor puro, 6 telas
de frontend, ~12 endpoints REST — escopo comparável ao da fatia 022 (Mai)

## Constitution Check

*GATE: avaliado antes do Phase 0 e reavaliado após o Phase 1.*

| Princípio | Status | Nota |
|---|---|---|
| I. Agent Specialization | ✅ PASS | Domínio genuinamente novo (viagens). Makima/Hermes não implementam lógica — tudo em `agents/yato/tools.py`. Única tool cross-domain é `log_trip_expense` → Nami (via `create_transaction_on_cursor`), documentada como fluxo de negócio real (FR-021) em `agents/yato/CLAUDE.md`, no mesmo padrão de `complete_payment_task`. |
| II. Hybrid Batch + Agentic | ✅ PASS | Nada nesta fatia roda em `makima-scheduler`; toda interação é conversacional/sob demanda. A semeadura de `mobility_apps` é script one-time (`scripts/`), não um job agendado. |
| III. Self-Contained Agents | ✅ PASS | `agents/yato/` segue `__init__.py` + `tools.py` + `agent.py` + `toolset.py` + `schema_pg.sql` + `CLAUDE.md`. O import de `agents.nami.tools.create_transaction_on_cursor` é lazy (dentro da função), evitando acoplamento em startup — mesmo padrão de `agents/kaguya/tools.py`. |
| IV. Portuguese-First UX | ✅ PASS | Toda resposta do Yato em português; erros nunca expõem stacktrace (FR-025). |
| V. Minimal Footprint | ✅ PASS | Nenhuma infraestrutura nova — PostgreSQL existente, nenhuma lib nova. Domínio novo justificado (mobilidade urbana + roteiro de viagem não cabe em nenhum agente existente). |

**Desvio identificado** (registrado em Complexity Tracking): FR-025 exige que o Yato responda em
**HTML** e sempre comece a resposta com `"Yato:"` — instrução cozida na personalidade do agente.
Isso está em tensão com *Agent Architecture Constraints → Formatação de canal* ("nenhuma
instrução de formato específico de plataforma... MUST estar cozida na personalidade ou nas tools
de um agente — isso é responsabilidade exclusiva do gateway"). Ver justificativa abaixo.

## Project Structure

### Documentation (this feature)

```text
specs/066-travel-agent/
├── spec.md                          # já existe — não editado por este plano
├── research.md                      # já existe — pesquisa de domínio, não editado por este plano
├── plan.md                          # este arquivo
├── data-model.md                    # Phase 1 — 8 tabelas, coluna a coluna
├── quickstart.md                    # Phase 1 — guia de validação ponta a ponta
├── contracts/
│   ├── api-travel.md                # Phase 1 — contrato REST /api/travel/*
│   └── tools-yato.md                # Phase 1 — contrato das tools MCP (/mcp/yato)
├── checklists/requirements.md       # já existe
└── design_handoff_yato_viagens/     # já existe — fonte normativa de UI (design-guide.md + README.md)
```

### Source Code (repository root)

```text
agents/yato/
├── __init__.py                # comentário de 2 linhas, padrão dos demais pacotes
├── tools.py                   # fachada pública: trips, itinerário, checklist, apps, orçamento
├── tools_mobility.py          # dossiê + protocolo de 7 passos + estratégia consolidada
├── comfort_matrix.py          # motor PURO (sem banco) — matriz ANTT + fila de ROI (padrão capacity.py)
├── toolset.py                 # TOOLS: list[Callable] — reaproveitado por mcp_servers/makima
├── agent.py                   # yato_agent — singleton ADK gemini-2.5-flash, sem MCP próprio
├── schema_pg.sql              # 8 tabelas (ver data-model.md)
└── CLAUDE.md                  # tools, schema, personalidade, integração cross-agent

mcp_servers/makima/registry.py         # + import de agents.yato.toolset + DOMAINS["yato"]
scripts/setup_schemas.py               # + "agents/yato/schema_pg.sql" em SCHEMA_FILES
scripts/seed_mobility_apps.py          # NOVO — semeia mobility_apps a partir do research.md
coordinator/agent.py                   # + import yato_agent + sub_agents + _MAKIMA_INSTRUCTION
hermes/skills/yato-viagens/SKILL.md    # NOVO — skill do Hermes, padrão nami-financas/mai-series
hermes/config.yaml                     # + bloco mcp_servers.yato

webapp/backend/routers/travel.py       # NOVO — /api/travel/*, padrão series.py + _check_result
webapp/backend/main.py                 # + import travel_router + include_router (antes do catch-all)
webapp/backend/routers/hub.py          # + 2 stats do Yato no GET /api/hub/summary

webapp/frontend/src/pages/yato/
├── YatoShell.tsx
├── TweaksPanel.tsx
├── yatoApi.ts
├── types.ts
├── dateUtils.ts                # cópia local (padrão akane/marin/nami) — todayLocalISO() + helpers
├── yato.css                    # portado de design_handoff_yato_viagens/yato/styles.css
├── screens/      # Home, Trips, TripDetail, Mobility, Budget, Checklist
├── components/   # MobilityDossier, VerdictChip, ReadinessMeter, TripCard, DayColumn,
│                 # ItineraryItem, AppSuggestionCard, ComfortMatrix, BudgetBar, ChecklistRow
├── modals/       # NewTripModal, NewItemModal, LogExpenseModal, ProtocolWizard
└── ui/Toast.tsx

webapp/frontend/src/App.tsx            # + <Route path="/travel/*"> antes do catch-all /*
webapp/frontend/src/components/Layout.tsx   # + entrada Yato em DOMAINS
webapp/frontend/src/index.css               # + --c-yato / --c-yato-dim
webapp/frontend/src/pages/makima/data.ts    # + card do Yato em AGENTS
webapp/frontend/public/yato.png             # retrato (já existe em design_handoff.../yato/yato.png)

tests/agents/test_yato.py               # NOVO
tests/agents/test_yato_comfort.py       # NOVO — motor puro
```

**Structure Decision**: Web application com dois sub-projetos já existentes no repo (`webapp/backend`
FastAPI + `webapp/frontend` React/Vite), mais o pacote de agente de domínio (`agents/yato/`) que é
importado por três consumidores (Hermes via MCP, coordinator ADK legado, webapp router) — exatamente
a estrutura tripla usada por `agents/mai/` (spec 022) e `agents/akane/` (spec 015). Nenhuma opção nova
de estrutura é necessária; a árvore acima é a extensão direta do padrão existente.

## Phase 0: Decisões técnicas

Todas as ambiguidades da spec já foram resolvidas no `/speckit-clarify` (ver seção Clarifications do
spec.md). As decisões abaixo são de **implementação**, não de produto — escolhas entre alternativas
técnicas equivalentes, fixadas para manter paridade com o resto do repo.

| # | Decisão | Racional | Alternativa rejeitada |
|---|---|---|---|
| D1 | IDs `TEXT PRIMARY KEY`, `str(uuid.uuid4())` gerado em Python | Convenção universal do repo (`agents/mai/schema_pg.sql:13`) | `SERIAL` / tipo `uuid` nativo do Postgres |
| D2 | Enums (`status`, `period`, `transport_mode`, `verdict`, `source`, `check_key`, `category`, `city_size`, `coverage_scope`) como `TEXT NOT NULL DEFAULT '...'` com comentário `-- valores: a \| b \| c`, sem CHECK nem PG enum | Nenhum schema do repo usa CHECK ou `CREATE TYPE ... AS ENUM`; validação é responsabilidade da camada de tools (mensagens de erro em português, mais fácil de evoluir sem migração) | `CHECK (col IN (...))` |
| D3 | `updated_at` setado à mão em cada `UPDATE ... SET updated_at = NOW()` | Nenhum schema do repo usa trigger (`grep CREATE TRIGGER agents/` não retorna nada) | Trigger `BEFORE UPDATE` |
| D4 | Tabelas prefixadas `trip_*` (`trip_items`, `trip_checklist_items`, `trip_budget_items`, `trip_mobility_snapshots`) e `mobility_*` (`mobility_dossiers`, `mobility_checks`, `mobility_apps`) | Banco flat compartilhado por todos os agentes; Mai já precisou renomear `episodes`→`series_episodes` e `watch_logs`→`series_watch_logs` por colisão com Marin | Nomes curtos (`items`, `checks`, `apps`) |
| D5 | Motor puro `agents/yato/comfort_matrix.py`, sem acesso a banco/rede, consumido por `tools.py` | Mesmo padrão de `agents/kaguya/capacity.py` e `goal_progress.py` — testável sem PostgreSQL, docstring com `Example:` doctest | Lógica da matriz embutida direto em `tools.py` |
| D6 | Mapa fixo de categoria Yato→Nami ao lançar gasto: `alimentacao`→`Alimentacao`; `transporte_ida`/`transporte_volta`/`mobilidade_local`→`Transporte`; `hospedagem`/`passeios`/`outros`→`Viagem` | Preserva granularidade real nos relatórios financeiros da Nami (café da manhã não vira "Viagem" genérico) | Tudo em `Viagem` (perde granularidade) |
| D7 | `log_trip_expense(...)` pública em `tools.py`, chama `_log_trip_expense_on_cursor(cur, ...)` privada internamente | Convenção confirmada em `agents/nami/toolset.py:7` e `agents/kaguya/toolset.py:8`: `*_on_cursor` recebe cursor psycopg2 aberto, não serializável por MCP — nunca exportado em `toolset.py` | Expor a variante `_on_cursor` diretamente |
| D8 | `webapp/frontend/src/pages/yato/dateUtils.ts` — cópia local de `todayLocalISO()` + helpers de intervalo de dias | Padrão majoritário (Akane, Marin, Nami copiam localmente; só Kaguya importa de `../../violet/dateUtils`) — evita acoplar o shell de viagens ao pacote do diário | Importar de `../../violet/dateUtils` |
| D9 | `trip_mobility_snapshots.checks_payload` como `JSONB` (array dos 7 checks congelados) | Congela o estado dos vereditos no momento da confirmação sem duplicar 7 colunas por check nem criar uma segunda tabela espelho de `mobility_checks` — FR-013a só exige leitura, nunca join | Tabela espelho `trip_mobility_snapshot_checks` (linha por check) |
| D10 | Sem `agents/yato/calendar_provider.py` nesta fatia | Cross-agent Kaguya (tarefas/eventos de viagem no Calendar) está explicitamente em "Fica para depois" no spec.md | Registrar Yato no Calendar Hub agora |
| D11 | `hermes/config.yaml`: bloco `yato:` idêntico ao de `mai`/`akane`, apontando para `http://makima-mcp:8090/mcp/yato` | Espelha 1:1 `DOMAINS["yato"]` de `registry.py`, conforme documentado no próprio `config.yaml` | — |
| D12 | Hub da Makima: card em `pages/makima/data.ts` (`AGENTS`) + 2 stats em `routers/hub.py` (ex.: "próxima viagem" e "prontidão do dossiê") | Decisão explícita desta sessão — paridade com os 9 agentes já presentes no hub; cada stat em seu próprio `try/except` → `"—"` no fallback (padrão do arquivo) | Deixar Yato fora do hub nesta fatia |

## Complexity Tracking

> Preenchido porque o Constitution Check acima registrou um desvio.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| FR-025 força HTML + prefixo `"Yato:"` na instrução de personalidade do agente, contradizendo "formatação de canal é responsabilidade exclusiva do gateway" (Agent Architecture Constraints) | Todos os 10 agentes existentes (Nami, Kaguya, Kurisu, Frieren, Akane, Marin, Mai, Komi, Lucy, Violet) já fazem exatamente isso — é o padrão real do repo hoje, não uma exceção do Yato. Manter paridade evita que o Yato seja o único agente com um contrato de resposta diferente, o que confundiria tanto o Hermes (que já lida com HTML vindo de todos os outros domínios) quanto a manutenção futura. | Reescrever a formatação de resposta de UM agente (Yato) para texto puro, deixando o Hermes decidir o HTML, exigiria abrir uma frente de refatoração nos outros 10 agentes para não deixar o repo inconsistente — isso é maior que esta fatia e vira trabalho de uma fatia de higiene dedicada (não anotada no ROADMAP ainda). Adiado deliberadamente; o desvio já existe no repo pré-066, este plano só o herda. |

## Phase 1 outputs

Ver `data-model.md`, `contracts/api-travel.md`, `contracts/tools-yato.md` e `quickstart.md` neste
mesmo diretório.
