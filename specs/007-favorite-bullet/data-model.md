# Data Model: Favoritar Bullet pelo Próprio Ícone

**Feature**: 007-favorite-bullet | **Branch**: `007-favorite-bullet` | **Date**: 2026-06-10

---

## Entidade: Bullet (extensão)

O bullet existente ganha um atributo novo. Nenhuma tabela nova é criada.

### Schema atual (sem mudança)

```sql
-- Tabela existente (tools.py:119-130)
CREATE TABLE IF NOT EXISTS journal_bullets (
    id         SERIAL PRIMARY KEY,
    page_id    INT REFERENCES journal_pages(id) ON DELETE CASCADE,
    content    TEXT NOT NULL DEFAULT '',
    position   INT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    search_vec TSVECTOR GENERATED ALWAYS AS (
        to_tsvector('portuguese', content)
    ) STORED,
    UNIQUE (page_id, position)
)
```

### Extensão — Feature 007

```sql
-- Adicionar logo após o bloco do CHECK de kind (tools.py:153)
-- ADD COLUMN IF NOT EXISTS é idempotente: re-executa sem erro em banco existente.
-- DEFAULT FALSE garante que todos os bullets existentes nascem não-favoritos (FR-001).
-- ON DELETE CASCADE em page_id já garante que excluir o bullet remove o favorito junto (FR-006).
ALTER TABLE journal_bullets
    ADD COLUMN IF NOT EXISTS favorite BOOLEAN NOT NULL DEFAULT FALSE
```

### Schema resultante de `journal_bullets`

```
journal_bullets
  id          SERIAL PRIMARY KEY
  page_id     INT REFERENCES journal_pages(id) ON DELETE CASCADE
  content     TEXT NOT NULL DEFAULT ''
  position    INT NOT NULL
  created_at  TIMESTAMPTZ DEFAULT NOW()
  search_vec  TSVECTOR GENERATED ALWAYS AS (to_tsvector('portuguese', content)) STORED
  kind        TEXT NOT NULL DEFAULT 'bullet'  ← extensão anterior (T005)
  favorite    BOOLEAN NOT NULL DEFAULT FALSE  ← extensão Feature 007
  UNIQUE (page_id, position)
```

**Observações de design:**
- `favorite` é ortogonal a `kind` — um bullet de qualquer tipo pode ser favoritado.
- O `DO UPDATE SET` do `upsert_bullet` **não** inclui `favorite` → o favorito é preservado
  em qualquer edição de texto ou tipo do bullet (FR-005).
- O `ON DELETE CASCADE` do `page_id` garante que excluir o bullet (ou a página) elimina o
  favorito junto — sem favorito órfão (FR-006).
- Sem índice adicional: volume baixo (single-user), e as queries de favorito fazem scan
  filtrado por `page_id` ou `EXTRACT(YEAR FROM jp.date)` — já cobertos por índices existentes.

---

## Tools novas em `agents/journal/tools.py`

### `set_favorite(bullet_id, favorite)` — nova

```python
def set_favorite(bullet_id: int, favorite: bool) -> dict:
    """Definir ou remover o estado de favorito de um bullet.

    Args:
        bullet_id: ID do bullet a ser alterado.
        favorite: True para favoritar, False para desfavoritar.

    Returns:
        {"status": "ok", "favorite": bool} se sucesso.
        {"status": "error", "message": str} se bullet não encontrado.
    """
    # UPDATE direto por id — não usa position (que é chave do upsert, não do toggle)
    # RETURNING favorite confirma o valor persistido sem segundo SELECT
    UPDATE journal_bullets SET favorite = %s WHERE id = %s RETURNING favorite
    # rowcount == 0 → bullet não existe → erro amigável (padrão delete_bullet)
```

**Padrão**: idêntico a `delete_bullet` (psycopg2 / `RealDictCursor` / `conn.commit()` /
`finally: conn.close()`). Retorna `{"status": "ok", "favorite": bool}` para encaixar no
`_check_result` do router.

### `list_favorite_days(year)` — nova

```python
def list_favorite_days(year: int) -> list:
    """Retornar as datas que possuem ao menos um bullet favorito no ano.

    Args:
        year: Ano de referência.

    Returns:
        Lista de strings "YYYY-MM-DD" — datas com ao menos um bullet favorite=TRUE.
        Lista vazia se nenhum favorito no ano.
    """
    # JOIN journal_bullets × journal_pages, filtro por ano e favorite=TRUE
    # GROUP BY date → HAVING BOOL_OR(b.favorite) — ou simplificado com DISTINCT
    SELECT DISTINCT jp.date::text
    FROM journal_bullets b
    JOIN journal_pages jp ON jp.id = b.page_id
    WHERE EXTRACT(YEAR FROM jp.date) = %s
      AND b.favorite = TRUE
    ORDER BY jp.date ASC
```

**Padrão**: retorna lista direta (sem campo `status`) — igual a `list_heatmap`. **Não** passar
por `_check_result` no router.

---

## Modificações em tools existentes

### `get_or_create_page` — estender SELECT de bullets

```python
# tools.py:350 — adicionar favorite na lista de colunas
SELECT id, page_id, kind, content, position, created_at, favorite  # ← +favorite
FROM journal_bullets
WHERE page_id = %s
ORDER BY position ASC
```

### `upsert_bullet` — estender RETURNING

```python
# tools.py:688-694 — adicionar favorite no RETURNING (não no DO UPDATE SET)
INSERT INTO journal_bullets (page_id, position, content, kind)
VALUES (%s, %s, %s, %s)
ON CONFLICT (page_id, position)
DO UPDATE SET content = EXCLUDED.content, kind = EXCLUDED.kind
-- favorite NÃO entra no DO UPDATE SET — preserva o favorito em edições (FR-005)
RETURNING id, page_id, kind, content, position, created_at, favorite  -- ← +favorite
```

---

## Modelo TypeScript (frontend)

### `interface Bullet` em `types.ts`

```typescript
// Extensão da interface existente — adicionar campo favorite
export interface Bullet {
  id: number
  page_id: number
  kind: BulletKind
  content: string
  position: number
  created_at: string
  favorite: boolean   // ← novo campo — false por default (bullets antigos recebem false)
}
```

---

## Regras de negócio

| Regra | Origem | Implementação |
|---|---|---|
| Favorito é booleano, default false | FR-001 | `DEFAULT FALSE` no schema |
| Clique no marcador alterna o favorito | FR-002 | `onClick` em `.b-mark` → `toggleFavorite(b)` |
| Marcador fica garnet quando favoritado | FR-003 | Classe `is-fav` + CSS `var(--garnet)` |
| Marcador indica clicabilidade | FR-004 | `cursor:pointer` + `title`/`aria-label` |
| Favorito sobrevive a edições | FR-005 | `DO UPDATE SET` não inclui `favorite` |
| Excluir bullet remove favorito | FR-006 | `ON DELETE CASCADE` (já existente) |
| Dias com favorito identificáveis por ano | FR-007 | `list_favorite_days(year)` |
| Revert visual em falha de rede | FR-008 | Rollback no `.catch` do `toggleFavorite` |
