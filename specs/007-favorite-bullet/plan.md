# Implementation Plan: Favoritar Bullet pelo Próprio Ícone

**Branch**: `007-favorite-bullet` | **Date**: 2026-06-10 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/007-favorite-bullet/spec.md`

---

## Summary

Adicionar ao diário Violet a capacidade de **favoritar um bullet com um clique direto no seu
marcador (ícone/ponto à esquerda do texto)**. O marcador vira vermelho (cor garnet) quando
o bullet está favoritado — feedback imediato sem menus. Um segundo clique desfaz. O estado
persiste entre sessões e sobrevive a edições de texto e tipo do bullet.

A abordagem segue rigorosamente o padrão do journal: **uma coluna nova em `journal_bullets`**
(`favorite BOOLEAN NOT NULL DEFAULT FALSE`) criada via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
em `_ensure_tables()`; **duas tools Python puras** (`set_favorite`, `list_favorite_days`);
**dois endpoints REST** em `routers/journal.py`; e no frontend um **clique no `.b-mark` com
optimistic update + rollback** em `Write.tsx`, cor garnet via CSS (token `--garnet` já existe).
Nenhuma nova tabela, nenhuma nova dependência.

---

## Technical Context

**Language/Version**: TypeScript 5.8 (React 19 + Vite 6) — frontend; Python 3.12
(FastAPI + psycopg2-binary síncrono) — backend.

**Primary Dependencies**: React 19, Vite 6, Tailwind CSS 3 (frontend); FastAPI, psycopg2-binary,
Pydantic v2 (backend). Nenhuma dependência nova.

**Storage**: PostgreSQL existente (`DATABASE_URL`). **Coluna nova** `favorite BOOLEAN` em
`journal_bullets` criada via `ADD COLUMN IF NOT EXISTS` em `_ensure_tables()` — idempotente,
sem migração manual no VPS (aplica-se no próximo restart do container `makima-web`).
`DEFAULT FALSE` cobre todos os bullets existentes — sem backfill necessário.

**Testing**: Sem suíte automatizada no projeto — validação manual via `quickstart.md`.

**Target Platform**: Browser moderno (mesmos requisitos OKLCH do VioletShell). SPA servida
pelo FastAPI / Vite dev proxy.

**Project Type**: Web application (frontend SPA + backend FastAPI; tools reaproveitáveis
pelo agente ADK journal, embora esta feature seja de webapp).

**Performance Goals**: Toggle favorito com feedback visual em < 200 ms (SC-001, optimistic UI).
Volume baixo, single-user.

**Constraints**: psycopg2 síncrono (sem async); `Depends(require_user)` em todas as rotas
`/api/*`; optimistic update com rollback obrigatório em falha de rede (FR-008).

**Scale/Scope**: 1 usuário, sem limite de favoritos. Sem concern de escala.

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Status | Evidência |
|---|---|---|
| I. Agent Specialization | ✅ PASS | Toda lógica de banco fica em `agents/journal/tools.py` (domínio diário). O router só embrulha as tools; o frontend só consome REST. Nenhuma lógica de domínio fora do agente. |
| II. Hybrid Batch + Agentic | ✅ PASS | Feature de webapp interativa — não toca scripts batch n8n nem cria automação agendada. |
| III. Self-Contained | ✅ PASS | Extensão dentro de `agents/journal/` (sem dependência de outro agente). UI dentro de `pages/violet/`. As novas tools são importáveis isoladamente. |
| IV. Portuguese-First UX | ✅ PASS | UI é webapp (React) em PT; labels e tooltips em PT. Não afeta respostas do bot Telegram. |
| V. Minimal Footprint | ✅ PASS | Uma coluna nova em tabela existente — nenhuma nova tabela, nenhuma nova infra de storage, nenhuma nova dependência. Favorito é ortogonal ao `kind`; o padrão `ADD COLUMN IF NOT EXISTS` já existe para `kind`. A agregação por ano (FR-007) reutiliza o mesmo banco e o padrão de `list_heatmap`. |

**Architecture Constraints:**
- PostgreSQL via psycopg2-binary síncrono: ✅
- Sem nova infra de storage (apenas coluna no banco existente): ✅
- `Depends(require_user)` em todos os endpoints `/api/*`: ✅
- Pydantic para todos os bodies POST/PATCH: ✅

**GATE: PASS** — sem violações; a extensão de schema é mínima e justificada.

---

## Project Structure

### Documentation (this feature)

```text
specs/007-favorite-bullet/
├── plan.md              ← este arquivo (/speckit-plan)
├── research.md          ← decisões técnicas (/speckit-plan)
├── data-model.md        ← modelo de dados + DDL (/speckit-plan)
├── quickstart.md        ← guia de validação E2E (/speckit-plan)
├── contracts/
│   ├── api.md           ← contratos dos endpoints REST
│   └── ui.md            ← contrato do marcador clicável + cores
└── tasks.md             ← gerado por /speckit-tasks (ainda não existe)
```

### Source Code (repository root)

```text
# Backend — extensão do journal existente
agents/journal/
└── tools.py             ← +favorite BOOLEAN em _ensure_tables() (ADD COLUMN IF NOT EXISTS)
                           +favorite nos SELECTs de get_or_create_page e upsert_bullet
                           +set_favorite(bullet_id, favorite) → {"status":"ok","favorite":bool}
                           +list_favorite_days(year) → ["YYYY-MM-DD", ...]

webapp/backend/routers/
└── journal.py           ← +SetFavoriteBody (Pydantic)
                           +PATCH /bullets/{id}/favorite → set_favorite → _check_result
                           +GET  /favorite-days?year=   → list_favorite_days (sem _check_result)
# main.py — sem mudança (router /api/journal já registrado)

# Frontend — extensão do VioletShell
webapp/frontend/src/
├── lib/api.ts           ← +violetApi.setFavorite(id, favorite)
│                           +violetApi.favoriteDays(year)   [insumo para spec 008]
└── pages/violet/
    ├── types.ts         ← +favorite: boolean em interface Bullet
    ├── screens/
    │   └── Write.tsx    ← +renderMark recebe favorite; +onClick em .b-mark; +toggleFavorite()
    └── violet.css       ← +.b-mark cursor:pointer + hover; +.dot.is-fav e .glyph.is-fav garnet
```

**Structure Decision**: Web application existente. Reaproveita integralmente os padrões do
módulo: tools puras no agente, router fino com `_check_result`, `violetApi` tipado, telas
dentro de `pages/violet/`. Nenhum arquivo de infra novo; só extensão de existentes.

---

## Complexity Tracking

> Seção preenchida pois o design de endpoint dedicado merece justificativa frente ao
> `upsert_bullet` existente.

| Decisão | Por que é necessária | Alternativa mais simples rejeitada porque |
|---|---|---|
| Endpoint `PATCH /bullets/{id}/favorite` separado do `upsert_bullet` | `upsert_bullet` usa `ON CONFLICT (page_id, position) DO UPDATE SET content = ..., kind = ...` — se `favorite` fosse passado no upsert, cada edição de texto que não inclua o campo reseta o favorito para o default. | Passar `favorite` pelo upsert exigiria que o frontend sempre reenviasse o estado de favorito em qualquer edição de texto, acoplando os dois fluxos. Endpoint separado mantém favorito ortogonal a conteúdo/tipo (FR-005). |
| `set_favorite(id, favorite: bool)` em vez de `toggle_favorite(id)` | O frontend faz optimistic update antes da resposta — se a ação foi "favoritar" e a requisição retornar após um segundo clique, o estado final precisa ser o estado-alvo enviado, não o toggle do servidor. | `toggle_favorite` no servidor pode divergir do estado local se o usuário clicar duas vezes antes da resposta: o segundo toggle no servidor anularia o primeiro, produzindo o estado errado visualmente. |

---

## Phase 0 — Research

Ver `research.md`. Principais decisões: coluna `favorite` (não tabela separada), endpoint
dedicado PATCH (não reusar upsert), estado-alvo explícito (não toggle no servidor), cor
garnet (token já existente), rollback otimista no frontend.

## Phase 1 — Design & Contracts

Ver `data-model.md` (DDL da coluna + tools), `contracts/api.md` (2 endpoints),
`contracts/ui.md` (marcador clicável + feedback visual), `quickstart.md` (roteiro de
validação E2E).
