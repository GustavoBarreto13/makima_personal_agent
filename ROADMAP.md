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
| 4 | Lucy (email): tools Gmail + agente | ✅ |
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
| 032 (lucy) | Lucy (email/Gmail): agente interativo somente-leitura (IMAP) + digest matinal agendado (classificação Gemini + labels/arquivamento + Telegram) + histórico idempotente (`lucy_emails`). Aposenta o script externo do n8n | ✅ |
| 033 | **Frieren — reforma da webapp de livros** (só webapp, sem bot): (a) **página do livro editável** — modal "Editar livro" com todos os campos (capa por URL, título, autor, gênero, ano, páginas, ISBN, idioma, descrição, status, nota, datas, resenha, loja, preço) via `PATCH /metadata` estendido (+rating/datas/store_url/price); (b) **marcações coloridas** — seção "Minhas marcações" com bullets rosa/amarelo/verde/azul/laranja + página opcional (tabela `book_bullets` + tools/rotas); (c) **resenha inline** — editor estilo Violet na seção "Sua resenha" (escreve a qualquer momento; campo `notes`); (d) **gerenciamento de estantes** — criar/editar/excluir estante (`ShelfModal`) + adicionar/remover livros pela UI (backend já existia, faltava a UI); (e) **Biblioteca unificada** — agrupada por status (Lendo→Quero ler→Wishlist→Lidos), filtro lembrado + ordenação na toolbar (`created_at` exposto no `GET /api/books`), aba "Lendo agora" removida; (f) **heatmap** — meses em linha única com scroll (padrão Violet) cobrindo o ano inteiro (Frieren + Violet) | ✅ |
| 034 | **Kaguya — GTD core**: status GTD real (próxima ação/aguardando/algum dia — aposenta as tags heurísticas `#aguardando`/`#algum-dia`), contextos de execução dedicados (`task_contexts`, CRUD), processamento guiado do inbox (`process_inbox_item`, 6 decisões, web + Telegram `/processar_inbox`) e bloco fixo de views padrão de mercado (Todas/Hoje/Amanhã/Próximos 7 Dias/Inbox) | ✅ |
| 035 | **Kaguya — revisão semanal guiada**: wizard de 6 passos (inbox zero, próximas ações, aguardando, listas/projetos, calendário, algum dia/talvez) reusando a lógica da 034, registro leve (`task_weekly_reviews`) com retomada de revisão aberta (no máximo uma por vez, garantida por índice único parcial), lembrete no Telegram todo domingo 20h quando a semana termina sem revisão concluída (job `weekly_review_reminder` no scheduler) e indicador "última revisão há N dias" no painel. Webapp-only (sem tool ADK) | ✅ |
| 061 | **Violet — Conselho do Dia** (persona Violet, lógica na Kurisu): seção no topo da tela Escrever que, sob demanda, lê o dia (bullets + registros emocionais + cartas) + janela de 7 dias + tarefas/hábitos da Kaguya + os 3 conselhos anteriores, cruza com o RAG da Kurisu (`buscar_na_base`) e devolve 4 blocos (espelho do dia, ferramentas da base com citação real, pergunta de reflexão, ações — podem virar tarefa). Busca web só como complemento quando a base não cobre; origem ("base"/"web") decidida no servidor por checagem de `uri`, nunca por auto-declaração do modelo. Uma análise por dia (`journal_counsel`, `UNIQUE page_id`) | ✅ |

## Status atual (jul/2026)

Fases 001–027, 029, 030, 031, 032, 032 (lucy), 033, 034, 035 e 061 entregues. A **028** (memória unificada da Kurisu) está parcial:
fundação (`agents/kurisu/memory/`) + sync incremental + 2 dos 8 exporters (diário, tarefas)
prontos localmente; deploy no VPS e os 6 exporters restantes pendentes.

## Pendências em aberto

| Pendência | Onde está o plano |
|---|---|
| Concluir a 028 (6 exporters + deploy VPS) | `specs/028-kurisu-unified-memory/` |
| Personalidade Violet + rename `agents/journal → agents/violet` | `docs/planos/PLANO_VIOLET_EVERGARDEN.md` |
| Integração Violet ↔ Komi (autocomplete `@menção` no diário) | `docs/planos/PLANO_INTEGRACAO_VIOLET_KOMI.md` |
| ⏳ 036 — Metas/Hábitos ↔ outros agentes (Frieren, Violet; registry extensível) | `specs/036-goal-habit-links/` (roadmap: `docs/planos/PLANO_KAGUYA_MELHORIAS_2026H2.md`) |
| ⏳ 037 — Kaguya pomodoro/foco (timer por tarefa + stats) | `specs/037-tasks-focus-pomodoro/` (roadmap: `docs/planos/PLANO_KAGUYA_MELHORIAS_2026H2.md`) |
| ⏳ 038 — Meu Dia com contexto Trabalho vs Pessoal (duas capacities) | `specs/038-meudia-work-context/` (roadmap: `docs/planos/PLANO_KAGUYA_MELHORIAS_2026H2.md`) |
| ⏳ 039 — QoL: arquivar listas + localização nos eventos | `specs/039-tasks-qol/` (roadmap: `docs/planos/PLANO_KAGUYA_MELHORIAS_2026H2.md`) |
