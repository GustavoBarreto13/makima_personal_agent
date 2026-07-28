# Implementation Plan: Carga histórica do Letterboxd e correção de dados (Akane)

**Branch**: `master` | **Date**: 2026-07-27 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/050-akane-letterboxd-carga/spec.md`

## Summary

Fechar as duas lacunas conhecidas do importador CSV do Letterboxd (`watched.csv` ignorado,
`--no-tmdb` vazando na watchlist), documentar o roteiro de carga em produção, e adicionar o
ciclo de correção pós-importação: metadados em inglês, botão "Buscar Dados" para
re-enriquecer/trocar o match de um filme, edição manual de filme e sessões, deduplicação por
identidade externa (TMDB) com fallback título+ano, e ordem confiável (+ reordenável) de
sessões no mesmo dia. Tudo dentro do agente Akane já existente — nenhuma tabela nova, nenhuma
dependência nova.

## Technical Context

**Language/Version**: Python 3.11 (backend/scripts) + TypeScript/React (frontend, Vite)

**Primary Dependencies**: FastAPI (`webapp/backend`), `psycopg2-binary` (síncrono), `requests`
(TMDB), React (`webapp/frontend/src/pages/akane`)

**Storage**: PostgreSQL compartilhado (`DATABASE_URL`) — tabelas `movies` e `diary_entries`
já existentes; **nenhuma migração de schema nesta feature**.

**Testing**: Sem suíte automatizada no repo (padrão das specs 024–051) — validação via
`quickstart.md` + `tsc -b --force` + `npm run build` + execução manual dos scripts.

**Target Platform**: Linux server (VPS, Docker) para backend/scripts; navegador para o
webapp.

**Project Type**: Web application (backend FastAPI + frontend React) + scripts CLI.

**Performance Goals**: N/A — operação pessoal, volume de centenas a poucos milhares de
filmes; sem requisito de throughput.

**Constraints**: Chamadas TMDB sujeitas a rate limit da API pública — reaproveitar o cliente
e retry já existentes (`_tmdb_get`), sem paralelizar.

**Scale/Scope**: Catálogo de um único usuário; import roda uma vez (carga histórica) e depois
o refresh é acionado manualmente, filme a filme.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Agent Specialization**: toda a lógica nova fica em `agents/akane/tools.py` (dono do
  domínio); `webapp/backend/routers/movies.py` continua fachada fina. ✅
- **II. Hybrid Batch + Agentic**: a carga histórica continua um script batch
  (`scripts/import_letterboxd_csv.py`), não migra para tool ADK. A correção pós-importação é
  interativa (webapp), corretamente modelada como tools/rotas, não como script. ✅
- **III. Self-Contained Agents**: nenhuma dependência cross-agent nova; tudo dentro de
  `agents/akane/`. ✅
- **IV. Portuguese-First UX**: não se aplica a este webapp (é interface própria, não
  Telegram) — mensagens de erro/toast em português, seguindo o padrão já usado em
  `webapp/frontend/src/pages/akane/*.tsx`. ✅
- **V. Minimal Footprint**: nenhuma tabela nova, nenhum índice novo, nenhuma dependência
  nova. Dedup e ordenação resolvidos com as colunas já existentes (`tmdb_id`, `normalizado`,
  `created_at`). ✅

Nenhuma violação — sem entradas em Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/050-akane-letterboxd-carga/
├── plan.md              # Este arquivo
├── research.md          # Fase 0
├── data-model.md        # Fase 1
├── contracts/
│   └── rest-api.md      # Fase 1
├── quickstart.md         # Fase 1
└── tasks.md              # Fase 2 (gerado por /speckit-tasks)
```

### Source Code (repository root)

```text
scripts/
└── import_letterboxd_csv.py     # + fase watched.csv, + fix enrich_tmdb na watchlist,
                                  #   + created_at incremental por linha

agents/akane/
├── tools.py                     # + _resolve_movie_identity(), refresh_movie_metadata(),
│                                 #   update_movie_catalog(), update_diary_entry(),
│                                 #   reorder_diary_entries(); + en-US no cliente TMDB;
│                                 #   dedup por tmdb_id em add_movie/upsert_movie_from_letterboxd
└── CLAUDE.md                    # + tabela de tools novas

webapp/backend/routers/
└── movies.py                    # + POST /{id}/refresh-metadata, PATCH /{id}/catalog,
                                  #   PATCH /diary/{id}, PATCH /diary/reorder

webapp/frontend/src/pages/akane/
├── akaneApi.ts                  # + refreshMetadata, updateCatalog, updateDiaryEntry,
│                                 #   reorderDiary
├── modals/
│   └── EditMovieModal.tsx       # novo — edição de campos de catálogo + pessoais
├── modals/
│   └── TmdbCandidatesModal.tsx  # novo — lista de candidatos para trocar o match
└── screens/
    └── MovieDetailScreen.tsx    # + botão "Buscar Dados", + edição inline de sessão,
                                  #   + reordenar sessões do mesmo dia
```

**Structure Decision**: reaproveita a estrutura existente da Akane (agente + fachada FastAPI +
shell React); nenhum diretório novo além dos dois modais React e dos artefatos de spec.

## Complexity Tracking

*Sem violações — seção vazia.*
