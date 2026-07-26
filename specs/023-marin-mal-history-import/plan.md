# Plano — Importar histórico do MAL para o diário da Marin

> Status: **pendente** (planejado, não iniciado). Trabalho na worktree `marin-dev`.

## Contexto

Hoje o `sync_mal()` (`agents/marin/mal_sync.py`) traz apenas **status, episódios assistidos e nota** por anime — **não cria nenhuma linha em `watch_logs`** e ignora as datas de início/fim. Por isso o diário, o heatmap e as estatísticas por ano da Marin ficam vazios para tudo que veio do MAL.

O objetivo é fazer um **import histórico único** (baseline) a partir da exportação nativa do MAL, e deixar o `sync_mal()` via API cuidando do dia a dia depois.

### Limitação fundamental (alinhada com o usuário)
O MAL — tanto no export quanto na API v2 — **não tem diário por episódio**. O único dado temporal é, por anime: `my_start_date` e `my_finish_date`. Decisão tomada: criar **1 sessão sintética por anime** no `watch_logs` (ep 1 → assistidos, data = finish_date, nota = score). Isso popula diário/heatmap/stats de forma aproximada.

### Pré-requisito a confirmar (Fase 0)
Ainda não se sabe se as datas de início/fim estão preenchidas no MAL. Se a maioria estiver `0000-00-00`, o import gera poucas sessões (sem data → sem log). O script deve degradar graciosamente: anime é sempre criado/atualizado; a sessão sintética só nasce quando há data utilizável.

---

## Fase 0 — Exportar e checar (usuário, manual)

1. MAL → `https://myanimelist.net/panel.php?go=export` → "Export Your Anime List" → baixa um arquivo `.xml.gz`.
2. Checagem rápida de datas: abrir o XML e procurar `<my_finish_date>`. Se a maioria for `0000-00-00`, o ganho será pequeno (só status/nota, que a API já sincroniza). Se houver datas reais → o import vale muito.

---

## Fase 1 — Lógica de negócio em `tools.py`

Adicionar **uma função** em `agents/marin/tools.py`, espelhando `upsert_movie_from_letterboxd` da Akane:

`upsert_anime_from_mal_export(mal_id, title, status_mal, episodes_watched, score, start_date, finish_date, source="mal_import") -> dict`

Comportamento (tudo em **uma transação**, reusando `get_conn`):
- **Anime (dedup por `mal_id`, índice único já existe):**
  - Se existe: `UPDATE` de `status`, `episodes_watched`, `score`, e — só quando vierem do export e estiverem vazios no banco — `date_started`/`date_finished` (usar `COALESCE`/`WHERE ... IS NULL` para não sobrescrever datas já melhores).
  - Se não existe: `INSERT` com dados mínimos + datas (igual ao `_upsert_mal_entry` de `mal_sync.py:197`, com `source='mal_import'` e `normalizado=_norm(title)`).
  - Mapear status MAL→pt-BR reusando `_MAL_STATUS_MAP` (mover/importar de `mal_sync.py`).
- **Sessão sintética (só quando há data):**
  - `watched_date` = `finish_date` ou, na falta, `start_date`. Sem nenhuma → **não cria log** (retorna `created/updated` só do anime).
  - `ep_start=1`, `ep_end=episodes_watched` (quando > 0), `episodes_count=episodes_watched`, `rating = score if score>0 else None`, `source='mal_import'`, `anime_title` denormalizado.
  - **Idempotência:** dedup por `(anime_id, source='mal_import')` — `DELETE` dos logs `mal_import` daquele anime antes do `INSERT` (rodar 2x não duplica).
  - Recalcular `anime.episodes_watched = SUM(watch_logs.episodes_count)` como o `log_watch` faz (`tools.py:540`), para o número bater com o diário.
- Retorno no padrão `_ok(...)/_err(...)` com `status: created|updated|skipped`.

> **Não enriquecer inline.** Enriquecer (Jikan/AniList/ARM/TMDB) é lento e rate-limited; fica para o `scripts/enrich_marin.py` rodar depois (já seleciona `source` não enriquecido).

## Fase 2 — Script parser/orquestrador `scripts/import_mal_xml.py`

Thin script espelhando `scripts/import_letterboxd_csv.py` (parser + contadores + CLI + JSON no stdout). Responsabilidades:
- Aceitar caminho de `.xml` **ou** `.xml.gz` (auto-detectar gzip por extensão/magic bytes; usar `gzip` + `xml.etree.ElementTree`).
- Iterar `<anime>` e extrair: `series_animedb_id`, `series_title`, `my_status`, `my_watched_episodes`, `my_score`, `my_start_date`, `my_finish_date`.
- Mapear `my_status` do export (`Watching`/`Completed`/`On-Hold`/`Dropped`/`Plan to Watch`) → chaves do `_MAL_STATUS_MAP`.
- Helpers `_parse_date` (tratar `0000-00-00` → None) e `_parse_score`.
- Chamar `upsert_anime_from_mal_export(...)` por entrada; acumular `criados/atualizados/pulados/erros`; um erro de entrada não derruba o import (try/except por item).
- CLI: `python -m scripts.import_mal_xml <caminho.xml[.gz]> [-v]`; saída JSON; `sys.exit(0 if erros==0 else 1)`.

## Fase 3 — Enriquecer + docs

- Rodar `python -m scripts.enrich_marin` para preencher poster/sinopse/estúdio/gêneros/episódios dos novos registros.
- Atualizar comentário de `source` no `schema_pg.sql` (anime e watch_logs) para incluir `'mal_import'`.
- Atualizar `agents/marin/CLAUDE.md` (seção de integrações/tools) documentando o import histórico.
- Refletir no Obsidian (skill `obsidian-wiki`) — convenção do projeto.

---

## Arquivos

| Arquivo | Mudança |
|---|---|
| `agents/marin/tools.py` | **+** `upsert_anime_from_mal_export(...)` (lógica + transação) |
| `scripts/import_mal_xml.py` | **novo** — parser XML/gz + CLI (template: `import_letterboxd_csv.py`) |
| `agents/marin/schema_pg.sql` | comentário `source` inclui `'mal_import'` |
| `agents/marin/CLAUDE.md` | documentar o import histórico |

Reuso: `_MAL_STATUS_MAP` e `_norm` (`mal_sync.py`); `get_conn`/`run_select`/`run_dml` (`agents/db.py`); padrão de transação/recálculo de `log_watch` (`tools.py:506-605`); estrutura de CLI/contadores de `import_letterboxd_csv.py`.

## Verificação

1. **Seco/amostra:** rodar o import num XML pequeno (ou primeiras N entradas) localmente com `-v`; conferir o JSON de contadores.
2. **Banco:** `SELECT count(*) FROM watch_logs WHERE source='mal_import';` e amostrar 3 animes — `date_started/date_finished` e `episodes_watched` coerentes com a sessão.
3. **Idempotência:** rodar o import **2x** seguidas; a 2ª rodada deve dar `atualizados`/`pulados` e **zero duplicatas** em `watch_logs`.
4. **UI:** abrir `/animes` → diário, heatmap e `get_stats(ano)` devem refletir as sessões importadas.
5. **VPS:** `docker cp` do XML + `docker exec makima-web sh -c "cd /app && python -m scripts.import_mal_xml /app/<arquivo>.xml.gz"`, depois `python -m scripts.enrich_marin`.
