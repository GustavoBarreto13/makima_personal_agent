# Implementation Plan: Violet · Diário

**Branch**: `003-violet-diario` | **Date**: 2026-06-09 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/003-violet-diario/spec.md`

---

## Summary

Redesign completo do diário pessoal ("Violet · Diário") — um app de bullet journal temático
com a personagem Violet Evergarden. A implementação substitui a página `Journal.tsx` existente
(dark "Journalistic") por um shell auto-contido (`VioletShell`) que espelha a arquitetura do
`FrierenShell`, com sidebar própria, roteamento interno por estado e sistema visual OKLCH
independente. O backend do journal é estendido para suportar bullets tipados (`kind`), campo
de sonho por entrada (`dream`) e contagem de palavras para o heatmap. Coleções derivadas
(Dreams, Highlights, Ideas, Wisdom, Notes, Tags, People), Insights com heatmap/charts, Reflect
com prompts da Violet e painel de Tweaks (tema/acento/modo/tipografia) completam a feature.

---

## Technical Context

**Language/Version**: TypeScript 5.8 (React 19 + Vite 6) — frontend; Python 3.11
(FastAPI + psycopg2-binary) — backend.

**Primary Dependencies**: React 19, Vite 6, Tailwind CSS 3.4 (frontend); FastAPI, psycopg2-binary,
Pydantic v2, itsdangerous (backend); `google-adk` é usado pelos agentes ADK (Telegram), não
pelo webapp em si.

**Storage**: PostgreSQL — banco existente (`DATABASE_URL`). Extensão do schema do journal
via `ALTER TABLE … ADD COLUMN IF NOT EXISTS` dentro do `_ensure_tables()` de
`agents/journal/tools.py` (padrão já adotado pelos agentes existentes).

**Testing**: Sem test suite automatizado no projeto — validação via uso manual seguindo
`quickstart.md`.

**Target Platform**: Browser moderno (Safari ≥ 15.4, Chrome ≥ 111, Firefox ≥ 113) — necessário
para `oklch()` CSS. SPA servida pelo backend FastAPI / Vite dev proxy.

**Project Type**: Web application (frontend SPA + backend FastAPI + agente ADK).

**Performance Goals**: Carregamento de tela em menos de 2s com banco populado (ver SC-002 na spec).
Sem SLA formal — uso pessoal, single-user.

**Constraints**: OKLCH para todos os tokens de cor (sem fallback para hex). Fontes via Google Fonts
(online). Tweaks em `localStorage` — não persiste entre dispositivos. Single-user (`ALLOWED_EMAIL`);
psycopg2 síncrono (sem async no backend do journal).

**Scale/Scope**: 1 usuário, ~132 entradas/ano, ~6 bullets/dia. Volume baixo, sem concern de escala.

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Status | Evidência |
|---|---|---|
| I. Agent Specialization | ✅ PASS | Toda lógica de acesso ao PostgreSQL fica em `agents/journal/tools.py`. O webapp só consome via REST (`/api/journal/*`). Nenhuma lógica de domínio no frontend ou no router FastAPI. |
| II. Hybrid Batch + Agentic | ✅ PASS | Esta feature é da webapp (frontend interativo), não um agente ADK. Sem impacto nos scripts batch n8n. |
| III. Self-Contained | ✅ PASS | O agente journal é estendido dentro de `agents/journal/` — sem dependência de outros agentes. O VioletShell é auto-contido dentro de `pages/violet/`. |
| IV. Portuguese-First UX | ✅ PASS | Viola UX é o webapp (React), não o Telegram. Não se aplica à linguagem das respostas do bot. (O agente journal via Telegram, se usado, já responde em PT.) |
| V. Minimal Footprint | ✅ PASS | Sem nova tabela — apenas `ALTER TABLE … ADD COLUMN IF NOT EXISTS` nas tabelas existentes. Tweaks em `localStorage` (sem infra de usuário). Shell espelha FrierenShell (sem nova abstração). Insights computados no cliente (single-user, volume baixo). |

**Architecture Constraints:**
- PostgreSQL via psycopg2-binary síncrono: ✅ (sem ORM, sem async — mesmo padrão do journal)
- Sem nova infra de storage: ✅
- `Depends(require_user)` em todos os endpoints `/api/*`: ✅

**GATE: PASS — nenhuma violação. Sem Complexity Tracking necessário.**

---

## Project Structure

### Documentation (this feature)

```text
specs/003-violet-diario/
├── plan.md              ← este arquivo (/speckit-plan)
├── research.md          ← decisões técnicas (/speckit-plan)
├── data-model.md        ← modelo de dados + DDL (/speckit-plan)
├── quickstart.md        ← guia de validação E2E (/speckit-plan)
├── contracts/           ← contratos de API e UI (/speckit-plan)
│   ├── api.md
│   └── ui.md
└── tasks.md             ← gerado por /speckit-tasks (ainda não existe)
```

### Source Code (repository root)

```text
# Backend — extensão do journal existente
agents/journal/
└── tools.py             ← +kind em journal_bullets, +dream em journal_pages,
                           +upsert_bullet(kind), +set_dream(), +list_collection(),
                           +list_dreams(), +get_stats(); _ensure_tables() com ALTERs

webapp/backend/
├── routers/
│   └── journal.py       ← +PUT /page/dream, +GET /collection/{kind},
│                          +GET /dreams, +GET /stats; POST /bullets +kind
└── main.py              ← sem mudança (router já registrado)

# Frontend — novo shell VioletShell
webapp/frontend/
├── index.html           ← +Newsreader no <link> Google Fonts
├── public/
│   └── violet.png       ← copiado de docs/claude_design/.../violet/violet.png
└── src/
    ├── App.tsx          ← +Route path="/journal/*" antes do catch-all;
    │                      remover Route path="/journal" do Layout
    ├── lib/
    │   └── api.ts       ← +violetApi { page, upsertBullet, deleteBullet,
    │                        setDream, heatmap, mentions, filter, search,
    │                        collection, dreams, stats }
    └── pages/
        ├── Journal.tsx  ← REMOVER (substituído pelo VioletShell)
        └── violet/
            ├── VioletShell.tsx   ← shell: sidebar, topbar, useState routing
            ├── violet.css        ← tokens OKLCH escopados em .vl-app; dark mode
            ├── TweaksPanel.tsx   ← tema/acento/modo/tipografia + localStorage
            ├── types.ts          ← Entry, Bullet, Collection, Stats, Prefs, etc.
            ├── ui/
            │   ├── Icon.tsx      ← SVG inline por nome (paths do handoff)
            │   ├── RichText.tsx  ← parse @pessoa → emerald, #tag → accent-deep
            │   ├── HeatmapRow.tsx
            │   └── AreaChart.tsx
            └── screens/
                ├── Write.tsx         ← tela P1
                ├── WriteFooter.tsx   ← barra de navegação fixa
                ├── Journal.tsx       ← tela P2 (arquivo)
                ├── Reflect.tsx       ← tela P5
                ├── Insights.tsx      ← tela P4
                ├── Collection.tsx    ← telas P3: Dreams/Highlights/Ideas/Wisdom/Notes
                ├── Tags.tsx          ← tela P3: nuvem de tags
                └── People.tsx        ← tela P3: grid de pessoas
```

**Structure Decision**: Web application (Option 2). Frontend em `webapp/frontend/src/pages/violet/`
(espelha `pages/frieren/` como precedente direto). Backend em `agents/journal/tools.py` (extensão
do agente existente) + `webapp/backend/routers/journal.py` (endpoints novos no router existente).
Nenhum novo diretório de top-level criado — Minimal Footprint.

---

## Complexity Tracking

> Sem violações da Constituição — seção vazia.
