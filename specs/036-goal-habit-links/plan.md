# Implementation Plan: Metas e Hábitos vinculados a outros agentes (Kaguya ↔ Frieren/Violet)

**Branch**: `master` (repo trabalha direto na branch padrão) | **Date**: 2026-07-27 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/036-goal-habit-links/spec.md`

## Summary

Metas e hábitos da Kaguya ganham vínculo cross-agent: uma meta pode ter **movimentos externos**
(itens de outro agente, ex.: livros da Frieren) cujo estado alimenta o progresso automático da
métrica; um hábito pode ter uma **fonte automática** de check-in (ex.: diário da Violet, leitura da
Frieren). A abordagem técnica reusa dois padrões já validados no repo — o registry fan-out do
Calendar Hub (`calendar_hub.py`, fatia 019) e a tabela de vínculo idempotente da Komi
(`person_links`) — criando **dois registries pequenos e tipados** (não um genérico "gordo"):
`goal_link_providers` (busca + resolve de status) e `habit_source_providers` (série temporal de
atividade). Nada é persistido derivado: progresso automático e check-ins automáticos são
calculados na leitura, mesclando os dados do provedor em memória antes dos motores puros
(`goal_progress.py`, `habit_strength.py`) já existentes — sem tocá-los. Fase 1 entrega dois
provedores (Frieren para ambos os casos, Violet para o diário); um terceiro agente exigiria apenas
um novo módulo `goal_provider.py`/`habit_provider.py` no seu próprio pacote e uma chamada de
`register()`, sem migração de schema nem mudança nas telas genéricas (FR-010).

## Technical Context

**Language/Version**: Python 3.11 (backend), TypeScript/React (frontend webapp)

**Primary Dependencies**: FastAPI, psycopg2-binary (síncrono), React + Vite

**Storage**: PostgreSQL — 1 coluna nova em `goals` (`metric_mode`), 1 tabela nova
(`goal_external_links`), 1 coluna nova em `habits` (`source_provider_id`). `habit_checkins` não muda.

**Testing**: Nenhum framework de teste automatizado no repo para esta camada (padrão das fatias
anteriores 024/029/030/035) — validação por `quickstart.md` + `py_compile`/`tsc -b`.

**Target Platform**: Webapp (FastAPI + React), Linux server (VPS) via Docker.

**Project Type**: Web application (backend + frontend), feature adicionada a um agente existente
(Kaguya), consumindo dados de dois outros agentes existentes (Frieren, Journal/Violet).

**Performance Goals**: N/A — volume de dados pessoal (dezenas de metas/hábitos, não milhares);
sem exigência de latência além do razoável para uma tela webapp.

**Constraints**: Best-effort/degradação graciosa obrigatória (FR-008) — nenhuma falha de provedor
pode derrubar a consulta de meta/hábito (HTTP 500). "Nada persistido derivado" (Assumptions) —
progresso e check-ins automáticos são sempre recalculados na leitura.

**Scale/Scope**: 2 provedores de meta/hábito na fase 1 (frieren_books, frieren_reading,
violet_diary — 3 registros, 2 pacotes). Extensível para mais 4 agentes (Nami, Akane, Marin, Mai)
em fases futuras, sem mudança estrutural.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Agent Specialization**: ✅ Kaguya continua dona de metas/hábitos; cada provedor
  (`goal_provider.py`/`habit_provider.py`) vive no pacote do agente dono (Frieren, Journal) — a
  Kaguya não consulta tabelas alheias diretamente, só chama funções registradas (Assumptions).
- **II. Hybrid Batch + Agentic**: ✅ N/A — feature é puramente interativa via webapp, sem
  automação agendada.
- **III. Self-Contained Agents**: ✅ Cada provedor é um módulo novo dentro do pacote do próprio
  agente (`agents/frieren/goal_provider.py`, `agents/frieren/habit_provider.py`,
  `agents/journal/habit_provider.py`); a Kaguya só depende do contrato (função com assinatura
  fixa), resolvido via `importlib` com fallback gracioso — mesmo padrão de
  `_try_import_provider` do Calendar Hub, então não há import direto de módulo específico no
  código genérico.
- **IV. Portuguese-First UX**: ✅ Nomes de provedor em português na resposta (`"Livros (Frieren)"`,
  `"Diário (Violet)"`); mensagens de erro/aviso em português.
- **V. Minimal Footprint**: ✅ Sem coluna de parâmetros no provedor de hábito (R10, YAGNI); sem
  tabela nova para hábitos (reusa `habits.source_provider_id` + registry); sem dependência nova.
  Webapp-only — nenhuma tool ADK nova (R9, mesma decisão de 024/029/030/035).

**Resultado**: PASS, sem violações a justificar em Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/036-goal-habit-links/
├── plan.md              # este arquivo
├── research.md          # Phase 0 — R1..R10
├── data-model.md        # Phase 1 — schema + entidades conceituais
├── quickstart.md        # Phase 1 — 5 cenários (SC-001..SC-006)
├── contracts/
│   └── rest-api.md      # Phase 1 — rotas novas/estendidas
└── tasks.md              # Phase 2 (/speckit-tasks — ainda não gerado)
```

### Source Code (repository root)

```text
agents/
├── kaguya/
│   ├── goal_link_providers.py      # NOVO — registry de vínculo de meta (search/resolve)
│   ├── habit_source_providers.py   # NOVO — registry de fonte de hábito (get_activity)
│   ├── tools_goals.py              # MODIFICADO — metric_mode, goal_external_links, movements.external
│   ├── tools_habits.py             # MODIFICADO — source_provider_id, merge de atividade automática
│   ├── tools.py                    # MODIFICADO — re-exporta as funções novas
│   ├── schema_tasks_pg.sql         # MODIFICADO — metric_mode, goal_external_links, source_provider_id
│   └── CLAUDE.md                   # MODIFICADO — documenta os dois registries
├── frieren/
│   ├── goal_provider.py            # NOVO — search_items/resolve_items (livros)
│   ├── habit_provider.py           # NOVO — get_activity (páginas lidas/dia)
│   └── CLAUDE.md                   # MODIFICADO — nota os dois provedores expostos
└── journal/
    ├── habit_provider.py           # NOVO — get_activity (dias com bullet não-vazio)
    └── CLAUDE.md                   # MODIFICADO — nota o provedor exposto

webapp/
├── backend/routers/tasks.py        # MODIFICADO — rotas de link-providers/source-providers/links/metric-mode
├── docs/API.md                     # MODIFICADO
├── docs/FRONTEND.md                 # MODIFICADO
└── frontend/src/pages/kaguya/
    ├── kaguyaApi.ts                 # MODIFICADO — novos métodos de API
    ├── types.ts                     # MODIFICADO — GoalExternalLink, HabitSourceProvider etc.
    ├── modals/GoalDetailModal.tsx    # MODIFICADO (nome pode variar — localizar na exploração) — picker de vínculo + toggle auto/manual
    └── modals/HabitModal.tsx         # MODIFICADO — dropdown de fonte automática
```

**Structure Decision**: extensão de módulos existentes na Kaguya (dono do domínio) + dois módulos
novos e pequenos em cada agente-fonte (Frieren, Journal), seguindo exatamente o layout de arquivos
já documentado no `CLAUDE.md` raiz. Nenhum pacote/agente novo — Principle V.

## Complexity Tracking

*Sem violações do Constitution Check — seção não aplicável.*
