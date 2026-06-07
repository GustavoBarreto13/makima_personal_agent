## Módulo: agents/journal

Gerencia o diário pessoal em bullet journal. Acesso direto ao PostgreSQL via psycopg2 síncrono — mesmo padrão das tools da Nami e Frieren.

---

### Schema PostgreSQL

```
journal_types       id, name, icon, color
                    → tipo padrão: id=1, name='personal'

journal_pages       id, type_id→journal_types, date (DATE), created_at, updated_at
                    UNIQUE (type_id, date)

journal_bullets     id, page_id→journal_pages, content, position (INT), created_at,
                    search_vec TSVECTOR GENERATED (dicionário 'portuguese')
                    UNIQUE (page_id, position)

journal_mentions    id, bullet_id→journal_bullets, kind CHECK('person','tag'), value
                    CASCADE: deletar bullet apaga menções automaticamente
```

O campo `search_vec` é **gerado pelo banco** a partir de `content` — não inserir nem atualizar manualmente.

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
