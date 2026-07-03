# Implementation Plan: Tutor de Idiomas na Violet (Kurisu)

**Branch**: `031-violet-tutor-idiomas` | **Date**: 2026-07-03 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/031-violet-tutor-idiomas/spec.md`

## Summary

Adicionar um tutor de escrita à Violet: um botão discreto em cada bullet dispara uma análise
gramatical do texto (persona Kurisu, via Gemini one-shot com saída JSON estruturada). A análise
devolve correção gramatical, reescrita natural/idiomática, erros explicados por conceito, resumo
(voz Kurisu, PT-BR) e nota. A correção fica salva e o bullet ganha um toggle original ↔ corrigido
(o original nunca é sobrescrito). Cada análise alimenta um perfil de habilidade por conceito
(maestria EMA + tendência) numa tabela própria da Violet, exibido numa nova tela de progresso com
nível estimado (CEFR) e sugestão de próximo foco. Um **guia de estudo** ativo (texto livre +
conceitos-alvo) orienta as análises e destaca conceitos no progresso.

**Abordagem técnica** (segue os padrões do repo — motor puro → lógica → router → frontend):
- **Motor puro** `agents/kurisu/tutor_mastery.py` (EMA por conceito, estimativa CEFR, ranking de
  próximo foco) — sem banco, espelhando `agents/kaguya/habit_strength.py`.
- **Lógica** `agents/kurisu/tutor.py` — chamada Gemini one-shot (`google-genai`) + persistência
  transacional + leituras + DDL próprio das tabelas `journal_tutor_*` (Kurisu é dona delas).
- **Router** estende `webapp/backend/routers/journal.py` com os endpoints `/api/journal/tutor/*`
  e compõe a meta do tutor no payload de bullets (sem acoplar `agents/journal/` à Kurisu).
- **Frontend** Violet: botão + toggle no bullet ([Write.tsx](../../webapp/frontend/src/pages/violet/screens/Write.tsx)),
  `TutorModal.tsx`, tela `Tutor.tsx` (progresso + guia), entradas em `violetApi`/`types.ts`/`VioletShell`.

## Technical Context

**Language/Version**: Python 3.12 (backend/agents) · TypeScript + React 19 (frontend, Vite 6)

**Primary Dependencies**: `google-genai` (chamada Gemini one-shot; já vem transitivo do
`google-adk`, será fixado explícito em `requirements.txt`) · `psycopg2-binary` (PostgreSQL síncrono)
· FastAPI · React 19

**Storage**: PostgreSQL compartilhado (`DATABASE_URL`) — 4 tabelas novas `journal_tutor_*`

**Testing**: `pytest` para o motor puro (`tests/agents/test_kurisu_tutor_mastery.py`); verificação
manual end-to-end para a stack web (quickstart.md)

**Target Platform**: container Linux (webapp `makima-web`) servindo API + SPA

**Project Type**: Web application (backend FastAPI + frontend React)

**Performance Goals**: análise sob demanda ≈ 1 chamada Gemini (poucos segundos, SC-001); leituras
de progresso baratas (cache materializado em `journal_tutor_skills`); nível CEFR e próximo foco
computados na leitura sem chamada extra de LLM

**Constraints**: modelo `gemini-2.5-flash` via `GEMINI_API_KEY` (constituição); webapp **não**
instancia ADK (chamada genai direta); datas em UTC-3 (`America/Sao_Paulo`); toda rota `/api/*`
sob `Depends(require_user)`

**Scale/Scope**: usuário único; volume de análises baixo (sob demanda por bullet)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Agent Specialization (NON-NEGOTIABLE)** — ✅ A lógica de tutoria vive no domínio da Kurisu
  (`agents/kurisu/tutor.py`), não em Makima nem no webapp. As tabelas levam prefixo `journal_tutor_*`
  por serem consumidas pela Violet, mas o **dono** (DDL + tools) é a Kurisu. Acoplamento cross-domain:
  a análise referencia `journal_bullets(id)` por FK — justificado (uma análise pertence a um bullet)
  e documentado no `agents/kurisu/CLAUDE.md`. O webapp compõe a meta do tutor no payload de bullets
  na camada de router, então `agents/journal/` **não** passa a depender da Kurisu.
- **II. Hybrid Batch + Agentic** — ✅ Interação sob demanda (clique do usuário) → agentic. Nada de
  batch/n8n é migrado.
- **III. Self-Contained Agents** — ✅ `agents/kurisu/tutor.py` é importável e testável isolado; cria
  suas próprias tabelas via `_ensure_tutor_tables()` (padrão de `agents/journal/tools.py`). O motor
  puro não toca banco. A leitura de `journal_bullets` é por SQL direto no mesmo banco (não importa
  `agents/journal/`).
- **IV. Portuguese-First UX** — ✅ Resumo, explicações e sugestão de foco em PT-BR, voz Kurisu.
  Erros comunicados em PT-BR (o router converte falha em HTTP 400 amigável).
- **V. Minimal Footprint** — ✅ Nenhum agente novo (estende a Kurisu). `google-genai` já é transitivo.
  Reusa o padrão EMA de `habit_strength.py`. As 4 tabelas são justificadas: análises (correção
  persistida p/ toggle), events (série temporal — fonte da verdade do progresso), skills (cache de
  leitura), guides (foco direcionável). CEFR e próximo foco são **derivados na leitura** (sem tabela).

**Architecture Constraints**: `gemini-2.5-flash` ✓; sem MCP novo ✓; PostgreSQL síncrono ✓. Desvio
consciente: a análise usa `google-genai` direto (one-shot, JSON estruturado) em vez de um `Agent`
ADK — coerente com o padrão do webapp (routers chamam funções puras, nunca ADK). Registrado em
`research.md`.

**Resultado do gate**: PASS (sem violações; nada em Complexity Tracking).

## Project Structure

### Documentation (this feature)

```text
specs/031-violet-tutor-idiomas/
├── plan.md              # Este arquivo
├── spec.md              # Especificação (com Clarifications)
├── research.md          # Fase 0 — decisões técnicas
├── data-model.md        # Fase 1 — 4 tabelas + entidades derivadas
├── quickstart.md        # Fase 1 — roteiro de verificação end-to-end
├── contracts/
│   └── api.md           # Fase 1 — endpoints REST /api/journal/tutor/*
└── checklists/
    └── requirements.md  # Checklist de qualidade da spec (16/16)
```

### Source Code (repository root)

```text
agents/kurisu/
├── tutor_mastery.py     # NOVO — motor puro: EMA por conceito, CEFR, ranking de próximo foco
├── tutor.py             # NOVO — Gemini one-shot + persistência transacional + leituras + DDL
└── CLAUDE.md            # editar — documentar o tutor + acoplamento cross-domain

tests/agents/
└── test_kurisu_tutor_mastery.py   # NOVO — gate do motor puro

webapp/backend/routers/
└── journal.py           # editar — endpoints /api/journal/tutor/* + composição da meta no /page

webapp/frontend/src/lib/
└── api.ts               # editar — métodos do violetApi + tipos do tutor

webapp/frontend/src/pages/violet/
├── types.ts             # editar — TutorAnalysis, TutorSkill, TutorProgress, TutorGuide, campo tutor no Bullet
├── VioletShell.tsx      # editar — item de sidebar + rota interna "Tutor"
├── screens/
│   ├── Write.tsx        # editar — botão discreto no bullet + toggle original↔corrigido
│   └── Tutor.tsx        # NOVO — progresso (skills + CEFR + próximo foco) + gestão do guia
└── components/
    └── TutorModal.tsx   # NOVO — painel de correção/reescrita/erros/resumo/nota

requirements.txt         # editar — linha explícita google-genai
docs/referencia/POSTGRES.md · ROADMAP.md   # editar — checklist de entrega
```

**Structure Decision**: Web application. Estende dois pacotes existentes — `agents/kurisu/`
(lógica + motor puro, dono das tabelas) e o shell `webapp/frontend/src/pages/violet/` (UI) — mais
o router `journal.py`. Nenhum diretório novo de topo; segue o layout por domínio já estabelecido.

## Complexity Tracking

> Sem violações de constituição — seção não aplicável.
