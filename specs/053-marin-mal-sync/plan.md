# Plano técnico — 053-marin-mal-sync

## Contexto técnico

Pesquisa confirmou: `mal_sync.py::_upsert_mal_entry` sobrescreve `episodes_watched`
direto na tabela `anime`, sem nunca criar `watch_logs` — é a causa exata do bug "loga 1
episódio localmente e o total vira 1" (US2). Não existe nenhum código de push
(`PATCH`/`DELETE` para a API do MAL) em lugar nenhum do projeto — US1 é construído do
zero. `get_lists`, notas etc. (spec 054) não se sobrepõem a este trabalho.

## Decisão de arquitetura — anti-eco sem coluna de "origem"

Em vez de rastrear "de onde veio a mudança" por mutação, o anti-eco nasce da própria
forma dos dois caminhos:

- **Push** só é disparado pelas 5 funções públicas de mutação local em `tools.py`
  (`log_watch`, `update_anime_status`, `rate_anime`, `delete_watch_log`, `delete_anime`).
- **Pull** (`mal_sync.py`) escreve direto no banco via SQL própria — nunca chama essas
  funções. Logo, pull nunca aciona push.
- **Idempotência natural**: se o pull traz de volta exatamente o que acabou de ser
  empurrado (mesmo `episodes_watched`/`status`/`score`), a comparação "difere do valor
  local atual?" é `False` e nada é escrito — sync estável em ciclos sem mudança nova
  (SC-003) sem precisar de uma tabela de "já processei isso".

Isso elimina a necessidade de uma coluna `origin` por linha. A única coisa que falta
para resolver o Edge Case de "conflito simultâneo" (mudança local E no MAL entre dois
syncs) é saber **quando** a mudança local aconteceu — para isso, uma coluna nova:

- **`anime.local_updated_at TIMESTAMPTZ`** — tocada **só** pelas 5 funções de mutação
  local (nunca pelo pull). Comparada contra `list_status.updated_at` do MAL (já
  guardado em `anime.mal_updated_at` após cada pull) para decidir o vencedor de
  status/nota quando os dois lados divergem e nenhum dos dois é obviamente "o mesmo
  valor que acabamos de mandar".

## Decisões por FR

- **FR-001 (push best-effort)**: cada uma das 5 funções, ao final da transação, se
  `anime["mal_id"]` não for `None`, chama `mal_sync.push_list_status(mal_id, status?,
  score?, num_watched_episodes?)` dentro de `try/except Exception` — falha nunca
  desfaz nem bloqueia a operação local (loga e segue). `push_list_status` é uma função
  nova em `mal_sync.py`: `PATCH /v2/anime/{mal_id}/my_list_status` (form-encoded,
  reusa `MALAuth().auth_header()`), retorna bool, nunca levanta.
- **FR-002 (pull cria sessões)**: `_upsert_mal_entry` para anime já existente passa a:
  1. Calcular `mal_progress` (do MAL) vs `local_progress` (`SUM(watch_logs.episodes_count)`
     do anime).
  2. Se `mal_progress > local_progress`: cria UMA sessão de ajuste em `watch_logs`
     (`source='mal_sync'`, `ep_start=local_progress+1`, `ep_end=mal_progress`,
     `watched_date` = data de `list_status.updated_at` do MAL, ou hoje se ausente),
     marca `episodes.watched=TRUE` para o range, deixa `episodes_watched` ser
     recalculado como soma dos logs (nunca mais um `UPDATE` direto no contador).
  3. Se `mal_progress <= local_progress`: não mexe em progresso (local já é dono —
     "maior progresso vence").
- **FR-003 (anti-eco)**: como descrito acima — arquitetural, não precisa de código
  extra além da comparação idempotente antes de cada `UPDATE`/`INSERT` do pull.
- **FR-004 (convergência determinística)**: para `status`/`score` divergentes (não
  cobertos pelo caso óbvio de "mesmo valor"), vence quem tem o timestamp mais recente
  conhecido: `anime.local_updated_at` vs `list_status.updated_at` do MAL (o próprio
  timestamp que o pull está processando). Documentado nesta seção — não há tabela nova.
- **FR-005 (completo no MAL → completo local)**: quando `list_status.status ==
  'completed'`, além de aplicar o status mapeado, se `episodes_total` for conhecido
  (do cache local ou recém-enriquecido) e ainda não há sessão cobrindo tudo, a sessão
  de ajuste cobre até `episodes_total` (não só o `num_episodes_watched` do MAL, que às
  vezes fica desatualizado para animes finalizados) e `date_finished` recebe a data de
  `list_status.finish_date` do MAL quando disponível, senão a data da sincronização.
- **FR-006 (scheduler)**: novo `scripts/sync_marin_mal.py`? Não — `sync_mal()` já é uma
  função Python pura em `agents.marin.mal_sync`, sem necessidade de subprocess. Wrapper
  em `scheduler/jobs.py::run_marin_mal_sync()` chama `agents.marin.mal_sync.sync_mal()`
  direto (import lazy, mesmo padrão de `run_kurisu_sync`) e levanta `RuntimeError` se
  `len(result["errors"]) > 0` (mesmo padrão de `run_letterboxd`). Registrado em
  `scheduler/registry.py` com `every(hours=6)` — mesmo intervalo do Letterboxd.
- **FR-007 (enriquecimento automático)**: quando `_upsert_mal_entry` insere um anime
  novo (mal_id desconhecido), chama `_enrich_meta(mal_id)` (já importado em `tools.py`,
  precisa ser importado em `mal_sync.py` também) e popula `episodes` — mesma lógica do
  `add_anime`, extraída para uma função compartilhada `_insert_enriched_anime(mal_id,
  meta_overrides)` para não duplicar SQL entre `tools.add_anime` e `mal_sync`. Falha de
  enriquecimento não bloqueia a criação do anime (fica com metadados mínimos; próxima
  sincronização tenta de novo — `episodes_total IS NULL` ou `poster_url IS NULL` como
  sinal de "ainda não enriquecido").
- **FR-008 (conversão de nota)**: push local→MAL faz `round(score)` (int, 0–10);
  pull MAL→local já é compatível (inteiro é sempre um valor válido na escala de 0.5).
  Documentado em `mal_sync.py` junto da função de push.
- **FR-009 (mapeamento de status bijetivo)**: `_MAL_STATUS_MAP` já existe (pull);
  nova `_LOCAL_STATUS_TO_MAL = {v: k for k, v in _MAL_STATUS_MAP.items()}` (push).

## Edge cases

- **Soft-delete não ressuscita**: antes do INSERT de anime novo, checa se já existe uma
  linha com esse `mal_id` e `deleted=TRUE`; se sim, pula (loga, não insere, não conflita
  com o índice único parcial `WHERE mal_id IS NOT NULL`).
- **`delete_anime` propaga**: push best-effort chama `DELETE
  /v2/anime/{mal_id}/my_list_status` (remove da lista do MAL). Falha não bloqueia o
  soft-delete local.
- **`delete_watch_log` reduz o MAL**: após recalcular `episodes_watched`, se
  `anime["mal_id"]`, push do novo total (mesmo mecanismo do log_watch).
- **Token expirado durante job agendado**: `MALAuth` já levanta `RuntimeError` claro;
  o wrapper do scheduler deixa propagar → alerta padrão no Telegram, sem corromper
  `mal_sync_state` (o refresh só persiste depois de confirmado, código já existente).

## Arquivos afetados

- `agents/marin/schema_pg.sql` — `anime.local_updated_at TIMESTAMPTZ`
- `scripts/migrate_nami_reforma.py` **NÃO** — é migração da Marin; nova migração vai em
  `scripts/migrate_marin_reforma.py` (novo, mesmo padrão idempotente)
- `agents/marin/mal_sync.py` — reescreve `_upsert_mal_entry`, adiciona
  `push_list_status`, `_LOCAL_STATUS_TO_MAL`, `_insert_enriched_anime`
- `agents/marin/tools.py` — push best-effort em `log_watch`, `update_anime_status`,
  `rate_anime`, `delete_watch_log`, `delete_anime`; grava `local_updated_at`
- `scheduler/jobs.py`, `scheduler/registry.py` — job `sync_mal` a cada 6h
- `agents/marin/CLAUDE.md`, `webapp/docs/API.md` (nada muda na API pública),
  `scheduler/CLAUDE.md`

## Verificação

- `npx tsc -b --force` (não deve haver mudança de frontend nesta spec — só backend).
- `ast.parse` + smoke import de todos os módulos Python tocados.
- Simular localmente (sem rede real ao MAL): mockar `push_list_status`/`MALAuth` não é
  viável sem infraestrutura de teste no projeto — validar por leitura cuidadosa do
  fluxo e, no VPS, rodar `sync_mal(full=False)` manualmente uma vez após deploy e
  conferir `scheduler_runs`/logs antes de confiar no agendamento automático.
