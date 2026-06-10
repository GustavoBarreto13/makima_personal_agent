# Implementation Plan: Registro Emocional (TCC)

**Branch**: `005-violet-journal-features` | **Date**: 2026-06-10 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/006-emotion-capture-tcc/spec.md`

---

## Summary

Adicionar ao diário Violet uma camada de **registro emocional no formato Registro de Pensamentos
da TCC** (terapia cognitivo-comportamental). O usuário registra, na página do dia, um ou mais
episódios com: situação → emoção + intensidade (0–10) → pensamento automático → resposta
adaptativa → reavaliação de intensidade. As emoções vêm de um vocabulário (8 emoções base da TCC
predefinidas + emoções custom criadas pelo usuário). Uma nova aba "Emoções" nos Insights agrega
os registros do ano (frequência, intensidade média, distribuição mensal).

A abordagem técnica segue o padrão já estabelecido do journal: **duas novas tabelas PostgreSQL**
(`journal_emotions` e `journal_emotion_logs`) criadas via `_ensure_tables()` em
`agents/journal/tools.py`; **novas tools Python puras**; **novos endpoints REST** em
`webapp/backend/routers/journal.py`; e no frontend uma **seção de captura na tela Write**
(análoga ao prompt de sonho) mais a **aba Emoções** em `Insights.tsx`. Registros emocionais são
ortogonais aos bullets — não contam palavras nem afetam heatmap/coleções existentes.

---

## Technical Context

**Language/Version**: TypeScript 5.8 (React 19 + Vite 6) — frontend; Python 3.12
(FastAPI + psycopg2-binary síncrono) — backend.

**Primary Dependencies**: React 19, Vite 6, Tailwind CSS 3 (frontend); FastAPI, psycopg2-binary,
Pydantic v2 (backend). Nenhuma dependência nova.

**Storage**: PostgreSQL existente (`DATABASE_URL`). **Duas novas tabelas** criadas via
`CREATE TABLE IF NOT EXISTS` dentro de `_ensure_tables()` — mesmo padrão idempotente das tabelas
atuais do journal. Sem migração manual no VPS (as tabelas nascem na importação do módulo).

**Testing**: Sem suíte automatizada no projeto — validação manual via `quickstart.md`.

**Target Platform**: Browser moderno (mesmos requisitos OKLCH do VioletShell). SPA servida pelo
FastAPI / Vite dev proxy.

**Project Type**: Web application (frontend SPA + backend FastAPI; tools reaproveitáveis pelo
agente ADK journal, embora esta feature seja só de webapp).

**Performance Goals**: Registro emocião+intensidade em < 15s (SC-001); aba Emoções carrega em
< 5s para localizar a emoção mais frequente (SC-004). Volume baixo, single-user.

**Constraints**: psycopg2 síncrono (sem async); `Depends(require_user)` em todas as rotas
`/api/*`; intensidade limitada a 0–10 pela interface; emoções deduplicadas por nome
case-insensitive.

**Scale/Scope**: 1 usuário, poucos registros emocionais por dia. Sem concern de escala.

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Status | Evidência |
|---|---|---|
| I. Agent Specialization | ✅ PASS | Toda lógica de banco fica em `agents/journal/tools.py` (domínio diário). O router só embrulha as tools; o frontend só consome REST. Nenhuma lógica de domínio fora do agente. |
| II. Hybrid Batch + Agentic | ✅ PASS | Feature de webapp interativa — não toca scripts batch n8n nem cria automação agendada. |
| III. Self-Contained | ✅ PASS | Extensão dentro de `agents/journal/` (sem dependência de outro agente). UI dentro de `pages/violet/`. As novas tools são importáveis isoladamente. |
| IV. Portuguese-First UX | ✅ PASS | UI é webapp (React) em PT; as 8 emoções base e rótulos são em PT. Não afeta respostas do bot Telegram. |
| V. Minimal Footprint | ✅ PASS (justificado) | Duas tabelas novas em PostgreSQL existente — **não** nova infra de storage. Justificativa: o registro TCC é entidade genuinamente nova (7 campos), e os assumptions da spec exigem que ele **não** conte como bullet (reusar `journal_bullets` poluiria contagem de palavras, heatmap e coleções). Sem ORM, sem cache, sem dependência nova. Ver Complexity Tracking. |

**Architecture Constraints:**
- PostgreSQL via psycopg2-binary síncrono: ✅ (mesmo padrão do journal)
- Sem nova infra de storage (apenas tabelas no banco existente): ✅
- `Depends(require_user)` em todos os endpoints `/api/*`: ✅
- Pydantic para todos os bodies POST/PATCH: ✅

**GATE: PASS** — sem violações reais; a expansão de schema está justificada abaixo.

---

## Project Structure

### Documentation (this feature)

```text
specs/006-emotion-capture-tcc/
├── plan.md              ← este arquivo (/speckit-plan)
├── research.md          ← decisões técnicas (/speckit-plan)
├── data-model.md        ← modelo de dados + DDL (/speckit-plan)
├── quickstart.md        ← guia de validação E2E (/speckit-plan)
├── contracts/
│   ├── api.md           ← contratos dos endpoints REST
│   └── ui.md            ← contrato da seção de captura + aba Emoções
└── tasks.md             ← gerado por /speckit-tasks (ainda não existe)
```

### Source Code (repository root)

```text
# Backend — extensão do journal existente
agents/journal/
└── tools.py             ← +journal_emotions e +journal_emotion_logs em _ensure_tables()
                           (com seed das 8 emoções base);
                           +list_emotions(), +create_emotion(),
                           +list_emotion_logs(page_id), +create_emotion_log(...),
                           +update_emotion_log(...), +delete_emotion_log(id),
                           +get_emotion_stats(year)

webapp/backend/routers/
└── journal.py           ← +GET /emotions, +POST /emotions,
                           +GET /emotion-logs, +POST /emotion-logs,
                           +PATCH /emotion-logs/{id}, +DELETE /emotion-logs/{id},
                           +GET /emotion-stats; novos modelos Pydantic
# main.py — sem mudança (router /api/journal já registrado)

# Frontend — extensão do VioletShell
webapp/frontend/src/
├── lib/api.ts           ← +violetApi: listEmotions, createEmotion, emotionLogs,
                            createEmotionLog, updateEmotionLog, deleteEmotionLog,
                            emotionStats
└── pages/violet/
    ├── types.ts         ← +Emotion, +EmotionLog, +EmotionStats
    ├── screens/
    │   ├── Write.tsx    ← +seção de registro emocional (abaixo do prompt de sonho)
    │   └── Insights.tsx ← +'Emoções' em TABS + render da aba (usa o ano da tela)
    └── components/
        └── EmotionLog.tsx ← formulário/cartão de um registro emocional (criar/editar/excluir)
                              + seletor de emoção (predefinida/custom)
```

**Structure Decision**: Web application existente. Reaproveita integralmente os padrões do
módulo: tools puras no agente, router fino com `_check_result`, `violetApi` tipado, telas dentro
de `pages/violet/`. Nenhum arquivo de infra novo; só extensão dos existentes + um componente de
UI.

---

## Complexity Tracking

> Preenchido porque o Princípio V (Minimal Footprint) merece justificativa explícita da decisão
> de criar tabelas novas.

| Decisão | Por que é necessária | Alternativa mais simples rejeitada porque |
|---|---|---|
| Tabela `journal_emotion_logs` (em vez de reusar `journal_bullets` com um `kind='emotion'`) | O registro TCC tem 7 campos estruturados (situação, emoção, intensidade, pensamento, resposta, reavaliação, timestamp) sem mapeamento natural no `content` de um bullet. | Reusar bullets exigiria serializar campos em texto e **contaminaria** contagem de palavras, heatmap, coleções e busca full-text — violando o assumption "registros não contam como bullets". |
| Tabela `journal_emotions` (vocabulário) | Lista predefinida + custom com dedupe case-insensitive e distinção predefinida/custom; permite agregação consistente nos Insights. | Guardar o nome da emoção como texto livre em cada log inviabilizaria a deduplicação e geraria dados inconsistentes para a aba Emoções (FR-006, US3). |

---

## Phase 0 — Research

Ver `research.md`. Principais decisões: vínculo do log à `page_id` (criação sob demanda como os
bullets), escala 0–10, dedupe por `LOWER(name)`, seed das 8 emoções base, agregações no
backend (não no cliente).

## Phase 1 — Design & Contracts

Ver `data-model.md` (DDL das 2 tabelas + tools), `contracts/api.md` (7 endpoints),
`contracts/ui.md` (seção de captura na Write + aba Emoções nos Insights), `quickstart.md`
(roteiro de validação E2E).
