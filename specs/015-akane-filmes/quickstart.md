# Quickstart — Validação end-to-end: Filmes (015-akane-filmes)

Guia de verificação manual + automatizada, organizado pelas ondas e amarrado aos Success Criteria
(SC-001..SC-008) da `spec.md`.

---

## 0. Pré-requisitos

```bash
# Local: venv do makima ativa, DATABASE_URL apontando para um Postgres de teste
export DATABASE_URL="postgresql://postgres:test@localhost:55432/makima_test"
# Metadados (TMDB) e fonte do histórico (Letterboxd)
export TMDB_TOKEN="<bearer-token-v4-do-TMDB>"
export LETTERBOXD_USERNAME="gustavob"   # seu username do Letterboxd
```

## 1. Aplicar o schema novo

No VPS o hostname do Postgres é serviço Docker Swarm (não resolve no host) — rodar **dentro do
container** `makima-web`:

```bash
# VPS
docker exec makima-web sh -c "cd /app && python -m scripts.setup_schemas"
# Local (DATABASE_URL apontando p/ Postgres acessível)
python -m scripts.setup_schemas
```

**Esperado**: as 4 tabelas criadas (`movies`, `diary_entries`, `movie_lists`, `movie_list_items`),
com os índices únicos parciais (`movies.letterboxd_uri`, `diary_entries (letterboxd_uri, watched_date)`).

```sql
\dt   -- deve listar as 4 tabelas
\d+ movies          -- conferir idx_movies_letterboxd (UNIQUE, parcial)
\d+ diary_entries   -- conferir idx_diary_dedup (UNIQUE, parcial)
```

## 2. Testes automatizados

```bash
# Onda 1 — catálogo, log, rewatch, stats
pytest tests/agents/test_akane.py -v
# Onda 2 — RSS/CSV (TMDB e RSS mockados, sem rede)
pytest tests/agents/test_akane_letterboxd.py -v
```

Cobertura esperada:
- **SC-001** buscar "Dune" + add watchlist + log sessão → filme `watched` com pôster + sessão no diário.
- **SC-002** rewatch → **1** linha em `movies` (`times_watched=2`), **2** em `diary_entries`.
- **SC-003** sync RSS 2× sem novos filmes → **0** linhas novas (dedup `letterboxd_uri`+`watched_date`).
- **SC-004** import CSV → contagens batem com `diary.csv`/`watchlist.csv`; rerun não duplica.
- **SC-005** TMDB fora → filme criado sem `poster_url`, sem exceção.
- **SC-006** `get_stats` ano com filmes (contagem/média/top) e ano vazio (zeros/listas) sem erro.

---

## 3. Onda 1 (US1) — webapp: catálogo, diário, watchlist, stats

```bash
# build do frontend
cd webapp/frontend && npm run build
# backend (local)
uvicorn webapp.backend.main:app --reload --port 8080
# (dev alternativo: npm run dev em :5173, proxy para :8000)
```

| Passo | Ação | Esperado (SC) |
|---|---|---|
| Auth | `curl /api/movies/` **sem** cookie | **401** (SC-008) |
| Buscar | abrir Filmes → modal → buscar "Dune" | resultados do TMDB com pôster/ano/diretor |
| Watchlist | adicionar "Dune" à watchlist | aparece na Watchlist com pôster (SC-001) |
| Log | logar sessão de "Dune" nota 4.5 + review | vira `watched`, aparece no grid e no diário (SC-001) |
| Rewatch | logar "Dune" de novo | 2 sessões no histórico; `times_watched=2` (SC-002) |
| Diário | abrir o diário | sessões em ordem decrescente, glyph de rewatch |
| Página | abrir a página do filme | backdrop hero + metadados + nota/review + histórico de sessões |
| Stats | abrir estatísticas (ano atual) | contagem, média, top gêneros/diretores; ano vazio sem erro (SC-006) |
| Like | marcar coração | `liked=true` persiste |
| Placeholder | adicionar filme sem pôster (TMDB fora) | card com placeholder, sem quebrar o grid (SC-005) |

## 4. Onda 2 (US2) — ingestão Letterboxd

```bash
# Sync RSS (dentro do container no VPS; local com DATABASE_URL acessível)
docker exec makima-web sh -c "cd /app && python -m scripts.sync_letterboxd --yesterday -v"
python -m scripts.sync_letterboxd            # local: últimos itens do feed
```

| Passo | Ação | Esperado (SC) |
|---|---|---|
| Sync inicial | rodar o sync | `movies`/`diary_entries` populados; resumo `created/updated/skipped` |
| Idempotência | rodar de novo sem novos filmes | **0** criados (SC-003); rating/review alterados → `updated` |
| Sem nota | item do RSS sem `memberRating` | sessão com `rating` nulo, sem erro |
| Botão | webapp autenticado → "Sincronizar agora" | `POST /api/movies/sync-letterboxd` retorna o resumo |
| Import CSV | `python -m scripts.import_letterboxd_csv <pasta-export>` | `diary.csv` → sessões; `watchlist.csv` → watchlist (SC-004) |
| Idempotência CSV | reexecutar o import | **não** duplica (SC-004) |

> **Carregar seu histórico depois**: baixar a exportação no Letterboxd (Settings → Data → Export),
> descompactar e rodar `python -m scripts.import_letterboxd_csv /caminho/para/export` (via
> `docker exec makima-web` no VPS, com a pasta copiada para dentro do container via `docker cp`).

## 5. Onda 3 (US3) — agente Akane (Telegram) + cross-agent Kaguya

| Passo | Mensagem ao bot | Esperado |
|---|---|---|
| Roteamento | "assisti um filme ontem" | Makima roteia para a Akane (domínio "filmes") |
| Log | "assisti Oppenheimer ontem, nota 4.5" | sessão criada (data=ontem, nota 4.5); confirma com dados salvos |
| Watchlist | "quero assistir Interstellar" | adicionado à watchlist (enriquecido via TMDB) |
| Consulta | "quais filmes vi esse mês?" / "stats do ano" | resposta a partir das mesmas tools do webapp (HTML) |
| Cross-agent | "me lembra de assistir Interstellar sábado" | tarefa/lembrete na Kaguya (e/ou evento Calendar) |

## 6. Paridade de canais (SC-007)

Checklist: **buscar / adicionar / logar / avaliar / consultar** de filmes funcionam tanto pelo
**Telegram** (Akane) quanto pelo **webapp** (`/api/movies/*`), com a lógica vivendo só em
`agents/akane/tools.py`. A página visual (grid/diário/detalhe/stats) é webapp-only; o equivalente
Telegram é a resposta conversacional.

---

## Definition of Done da fatia

- [ ] `scripts.setup_schemas` cria as 4 tabelas no container `makima-web`.
- [ ] `test_akane.py` e `test_akane_letterboxd.py` passam (SC-001..SC-006).
- [ ] Seção Filmes no webapp (grid + diário + watchlist + página do filme + stats) com acento vermelho em `.akane-shell`.
- [ ] `GET/POST/PATCH/DELETE /api/movies/*` protegidos por `require_user` (SC-008).
- [ ] Sync RSS idempotente, agendado (cron no container) + botão "Sincronizar agora".
- [ ] `import_letterboxd_csv.py` pronto e idempotente (usuário carrega o histórico depois).
- [ ] Akane roteada pela Makima; domínio "filmes" reconhecido no `coordinator/main.py`; cross-agent Kaguya.
- [ ] `agents/akane/CLAUDE.md` documenta tools, schema, TMDB, Letterboxd e cross-agent.
- [ ] CLAUDE.md raiz: tabela de agentes atualizada (Akane → filmes; `media` → séries+anime).
- [ ] env `TMDB_TOKEN` e `LETTERBOXD_USERNAME` documentadas em `webapp/CLAUDE.md` / `coordinator/CLAUDE.md`.
