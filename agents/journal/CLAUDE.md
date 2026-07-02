## Módulo: agents/journal

Gerencia o diário pessoal em bullet journal. Acesso direto ao PostgreSQL via psycopg2 síncrono — mesmo padrão das tools da Nami e Frieren.

> **Não é um sub-agente ADK**: este pacote não tem `agent.py` e não é importado pelo coordinator — as tools são consumidas apenas pelo webapp via `webapp/backend/routers/journal.py`. A personalidade "Violet" e o rename `agents/journal → agents/violet` estão planejados em `docs/planos/PLANO_VIOLET_EVERGARDEN.md` (não executado). As tabelas são criadas sob demanda por `_ensure_tables()` em `tools.py` (não há `schema_pg.sql` aqui).

---

### Schema PostgreSQL

```
journal_types       id, name, icon, color
                    → tipo padrão: id=1, name='personal'

journal_pages       id, type_id→journal_types, date (DATE), created_at, updated_at
                    UNIQUE (type_id, date)

journal_bullets     id, page_id→journal_pages, content, position (INT), created_at,
                    search_vec TSVECTOR GENERATED (dicionário 'portuguese'),
                    kind TEXT NOT NULL DEFAULT 'bullet',
                    favorite BOOLEAN NOT NULL DEFAULT FALSE   [Feature 007]
                    UNIQUE (page_id, position)

journal_mentions    id, bullet_id→journal_bullets, kind CHECK('person','tag'), value
                    CASCADE: deletar bullet apaga menções automaticamente

journal_emotions       id, name, is_predefined (BOOL)        [Feature 006]
                       UNIQUE LOWER(name) — dedupe case-insensitive
                       → seed: 8 emoções base da TCC (is_predefined=TRUE)

journal_emotion_logs   id, page_id→journal_pages (CASCADE), emotion_id→journal_emotions,
                       intensity (0–10), situation, automatic_thought,
                       adaptive_response, reappraised_intensity (0–10, nullable),
                       created_at                              [Feature 006]

journal_letters        id, page_id→journal_pages (CASCADE), recipient, title (nullable),
                       body, status CHECK('draft','sealed'), sealed_at (nullable),
                       created_at, updated_at                  [Cartas]
                       → vínculo com pessoas via person_links (entity_type 'journal_letter')
```

O campo `search_vec` é **gerado pelo banco** a partir de `content` — não inserir nem atualizar manualmente.

**Registros emocionais são ortogonais aos bullets.** `journal_emotion_logs` NÃO conta como bullet — não afeta contagem de palavras, heatmap, coleções nem busca full-text. Não cruzar essas queries com a tabela de emoções.

**Cartas também são ortogonais aos bullets.** `journal_letters` NÃO conta como bullet (mesma regra das emoções). Uma carta lacrada (`status='sealed'`) é imutável — `update_letter` recusa editá-la; `seal_letter` só lacra rascunhos. A constraint CHECK de `person_links.entity_type` foi ampliada (em `komi/schema_pg.sql` e, idempotente, no `_ensure_tables` do journal) para aceitar `'journal_letter'`; sem isso o INSERT do vínculo derrubaria a transação inteira da carta. `person_links` não tem FK para `journal_letters` (entity_id é polimórfico/TEXT), então `delete_letter` remove os vínculos explicitamente — não há CASCADE.

---

### Tools disponíveis

| Função | Retorno |
|---|---|
| `get_or_create_page(date, type_id=1)` | `{"page": {id, date, type_id}, "bullets": [{id, content, position, created_at}, ...]}` |
| `upsert_bullet(page_id, position, content)` | `{"status": "ok", "bullet": {id, content, position, created_at}}` |
| `delete_bullet(bullet_id)` | `{"status": "ok"}` ou `{"status": "error", "message": ...}` |
| `list_heatmap(year)` | `{"YYYY-MM-DD": count, ...}` |
| `list_mentions(kind)` | `[{"value": str, "count": int}, ...]` |
| `get_bullets_by_mention(kind, value)` | `[{"date": str, "bullets": [{id, content}]}, ...]` |
| `search_bullets(query)` | `[{"date": str, "bullets": [{id, content}]}, ...]` |
| `list_emotions()` | `[{id, name, is_predefined}, ...]` (predefinidas primeiro) |
| `create_emotion(name)` | `{"status":"ok","emotion":{...}}` — dedupe por LOWER(name), idempotente |
| `list_emotion_logs(page_id)` | `[{id, page_id, emotion_id, emotion_name, intensity, situation, automatic_thought, adaptive_response, reappraised_intensity, created_at}, ...]` |
| `create_emotion_log(page_id, emotion_id, intensity, ...)` | `{"status":"ok","log":{...}}` |
| `update_emotion_log(log_id, **campos)` | `{"status":"ok","log":{...}}` — atualização parcial |
| `delete_emotion_log(log_id)` | `{"status":"ok"}` ou `{"status":"error", ...}` |
| `get_emotion_stats(year)` | `{total, avg_intensity, top_emotion, by_emotion:[...], by_month:[12]}` |
| `set_favorite(bullet_id, favorite)` | `{"status":"ok","favorite":bool}` — define favorito de um bullet por id (Feature 007) |
| `list_favorite_days(year)` | `["YYYY-MM-DD", ...]` — datas com ao menos um bullet favorito no ano (Feature 007) |
| `list_letters(page_id)` | `[{id, page_id, recipient, title, body, status, sealed_at, created_at, updated_at, people:[{id,name}]}, ...]` |
| `create_letter(page_id, recipient, body, title=None, status='draft', person_ids=None)` | `{"status":"ok","letter":{...}}` |
| `update_letter(letter_id, person_ids=None, **campos)` | `{"status":"ok","letter":{...}}` — só rascunhos; recusa carta lacrada |
| `seal_letter(letter_id)` | `{"status":"ok","letter":{...}}` — lacra (só rascunho) |
| `delete_letter(letter_id)` | `{"status":"ok"}` ou `{"status":"error", ...}` — remove vínculos juntos |

#### `_check_result` não se aplica em algumas tools
`list_emotions`, `list_emotion_logs`, `get_emotion_stats` e `list_letters` retornam dados direto (lista/dict), **sem** campo `"status"` — não passar para `_check_result`.

#### `created_at` nos bullets
`journal_bullets.created_at` é `TIMESTAMPTZ DEFAULT NOW()`. As tools já convertem para string ISO antes de retornar — o frontend recebe string, não objeto `datetime`.

---

### Regras críticas

**Upsert é por posição, não por ID.**
`upsert_bullet` usa `ON CONFLICT (page_id, position)` — inserir o mesmo bullet com posição diferente cria uma nova linha. Para atualizar um bullet existente, sempre passar a mesma `position`.

**Espaçamento esparso de posições (×1000).**
O frontend usa posições 0, 1000, 2000, ... para permitir inserção no meio sem reindexar (posição intermediária = média das adjacentes). Não assumir que posições são densas.

**Menções: delete + insert.**
A cada `upsert_bullet`, todas as menções do bullet são deletadas e re-inseridas. Não fazer update seletivo de menções — isso evita inconsistência quando o usuário edita um bullet.

**`_check_result` não se aplica em 4 tools.**
`list_heatmap`, `list_mentions`, `get_bullets_by_mention` e `search_bullets` retornam dados diretamente (dict ou lista), **sem** campo `"status"`. Não passar para `_check_result` no router.

**Erro de `get_or_create_page` tem formato diferente.**
Retorna `{"error": "type_id não encontrado"}` (não `{"status": "error"}`). Verificar com `result.get("error")` antes de chamar `_check_result`.

---

### O que NÃO fazer aqui

- **Não inserir/atualizar `search_vec` manualmente** — é coluna GENERATED, o banco cuida
- **Não criar type_id diferente de 1** sem inserir antes em `journal_types` — gera FK violation silenciosa
- **Não confiar que posições são sequenciais** — o frontend usa gaps intencionais (×1000)
- **Não usar `_check_result`** em `list_heatmap`, `list_mentions`, `get_bullets_by_mention`, `search_bullets`
- **Não modificar `journal_mentions` diretamente** — sempre via `upsert_bullet` que faz delete+insert

---

### Endpoint de exposição (webapp)

`webapp/backend/routers/journal.py` expõe todas as tools acima como REST.
O router passa os dicts direto — **não transforma** os dados, apenas valida autenticação com `Depends(require_user)`.
