# ROADMAP — makima_personal_agent

> **Fonte única da verdade** para o status das fases do projeto. O `README.md` e o
> `CLAUDE.md` apontam para cá — ao entregar uma fase nova, atualize **apenas este arquivo**
> (e a documentação técnica afetada), não as tabelas de lá.

**Legenda:** ✅ entregue · 🔧 parcial (pendência aberta) · ⏳ planejado

## Fases

| Fase | O que é | Status |
|---|---|---|
| 1 | Nami (finanças): tools PostgreSQL + agente | ✅ |
| 2 | Kaguya (tarefas + agenda): motor próprio em PostgreSQL + Calendar via MCP + cross-agent atômico Kaguya+Nami. TickTick aposentado (spec 011) | ✅ |
| 012 | Kaguya — recorrência via RRULE (motor próprio `recurrence.py`) | ✅ |
| 013 | Kaguya — tags N:N, smart-lists (DSL) e calendário | ✅ |
| 014 (tasks) | Kaguya — hábitos com check-ins, heatmap e "força" (EMA) | ✅ |
| 3 / 027 | Kurisu (knowledge base): Vertex AI RAG sobre o vault Obsidian — corpus no ar (410/410 páginas), agente ativo no Telegram | ✅ |
| 4 | Lucy (email): tools Gmail + agente | ⏳ |
| 5a | Frieren (livros): PostgreSQL + Google Books API + log de leitura + estantes | ✅ |
| — | Webapp (FastAPI + React) + diário Violet na web | ✅ |
| 014 | Komi (pessoas): identidade canônica + vínculos cross-agent + REST `/api/people/*` + shell `/people/*` | ✅ |
| 015 | Akane (filmes): PostgreSQL + TMDB v3 + Letterboxd + shell `/movies/*` | ✅ |
| 016 | Kaguya — Meu Dia + time-blocking (capacity bar, blocos de tempo) | ✅ |
| 017 | Kaguya — Matriz de Eisenhower (drag-and-drop 2×2) | ✅ |
| 018 | Kaguya — Command Palette ⌘K + atalhos + recorrência no quick-add | ✅ |
| 019 | Kaguya — Calendar Hub (fan-out multi-fonte: tarefas + Nami + Frieren + GCal) | ✅ |
| 020 | Kaguya — projetos/grupos/colunas (rework de listas) | ✅ |
| 021 | Marin (animes): PostgreSQL + Jikan/AniList/ARM + MAL OAuth2 PKCE + shell `/animes/*` | ✅ |
| 022 | Mai (séries de TV): PostgreSQL + TMDB API v3 + shell `/series/*` | ✅ |
| 023 | Makima Hub: página inicial agregadora (`/api/hub/summary` + MakimaShell) | ✅ |
| 024 | Kaguya — Kanban "Vidro" + views configuráveis (`kanban_views`) | ✅ |
| 025 | Kaguya — rework da lista de tarefas (árvore por grupo + board de grupo) | ✅ |
| 026 | Sync de aniversários Komi ↔ Kaguya (datas importantes viram tarefas recorrentes) | ✅ |
| 028 | Kurisu — memória unificada (multi-corpus + exporters + sync incremental) | 🔧 parcial |
| 029 | Kaguya — Tiny Experiments (mini-experimentos com log, pausa, revisão e aderência) | ✅ |
| 030 | Kaguya — Metas (áreas da vida, marcos, vínculos, progresso) | ✅ |
| 031 | Violet — Tutor de Idiomas (persona Kurisu): análise de escrita via Gemini, toggle original/corrigido, maestria por conceito (EMA), nível CEFR estimado, guia de estudo direcionável | ✅ |
| 032 | Scheduler de jobs recorrentes (`scheduler/`): APScheduler num container dedicado (`makima-scheduler`), registro declarativo de jobs (cron/intervalo, fuso São Paulo), log em `scheduler_runs` + alerta no Telegram em falha. Consolida backup + sync-Kurisu (loops aposentados) | ✅ |

## Status atual (jul/2026)

Fases 001–027, 029, 030, 031 e 032 entregues. A **028** (memória unificada da Kurisu) está parcial:
fundação (`agents/kurisu/memory/`) + sync incremental + 2 dos 8 exporters (diário, tarefas)
prontos localmente; deploy no VPS e os 6 exporters restantes pendentes.

## Pendências em aberto

| Pendência | Onde está o plano |
|---|---|
| Concluir a 028 (6 exporters + deploy VPS) | `specs/028-kurisu-unified-memory/` |
| Lucy (email, fase 4) | `PLAN.md` histórico (`docs/arquivo/PLAN.md`) |
| Personalidade Violet + rename `agents/journal → agents/violet` | `docs/planos/PLANO_VIOLET_EVERGARDEN.md` |
| Integração Violet ↔ Komi (autocomplete `@menção` no diário) | `docs/planos/PLANO_INTEGRACAO_VIOLET_KOMI.md` |
