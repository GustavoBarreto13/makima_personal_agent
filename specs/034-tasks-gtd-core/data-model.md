# Data Model: GTD core (Kaguya) — spec 034

Extensão do schema existente (`agents/kaguya/schema_tasks_pg.sql`). Todas as alterações são
`ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS` (idempotentes, padrão do repo).

## `tasks` — colunas novas

| Coluna | Tipo | Regras |
|---|---|---|
| `gtd_status` | `TEXT` | `CHECK (gtd_status IN ('next_action','waiting','someday'))`, `NULL` = não classificada (default) |
| `waiting_note` | `TEXT` | opcional; "por quem/o quê" espera (só relevante quando `gtd_status='waiting'`) |
| `waiting_since` | `TIMESTAMPTZ` | preenchido/resetado sempre que `gtd_status` **se torna** `'waiting'` (transição, não só update qualquer); `NULL` quando `gtd_status <> 'waiting'` |
| `context_id` | `INT` | `REFERENCES task_contexts(id) ON DELETE SET NULL`; no máximo um contexto por tarefa (coluna simples, não N:N) |

**Índices**:
```sql
CREATE INDEX IF NOT EXISTS idx_tasks_gtd_status ON tasks (gtd_status)
    WHERE deleted_at IS NULL AND completed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_context ON tasks (context_id)
    WHERE context_id IS NOT NULL;
```

**Fila do processamento do inbox** (derivada, sem coluna própria — ver research.md R2):
```sql
WHERE project_id = <inbox_id> AND parent_id IS NULL AND deleted_at IS NULL
  AND completed_at IS NULL AND gtd_status IS NULL AND due_date IS NULL
```

**Regras de transição** (aplicadas em `update_task`/`_complete_task_on_cursor`):
1. `gtd_status` passa a ser `'waiting'` (de qualquer outro valor, incluindo `NULL`) →
   `waiting_since = now()`.
2. `gtd_status` deixa de ser `'waiting'` → `waiting_since = NULL`, `waiting_note` é preservado
   (fica "mudo" até uma nova entrada em waiting, sem necessidade de limpar).
3. `due_date` é setado (agendar) enquanto `gtd_status = 'someday'` → `gtd_status` volta a `NULL`
   (FR-012 — "algum dia" e data são contraditórios). Não se aplica a `'waiting'`/`'next_action'`.
4. Ao completar uma ocorrência recorrente e gerar a próxima: `gtd_status`, `context_id`,
   `waiting_note` são copiados; se o valor copiado for `'waiting'`, `waiting_since` é
   recalculado para `now()` na nova linha (mesma regra do item 1 — R10).

## `task_contexts` — nova tabela

```sql
CREATE TABLE IF NOT EXISTS task_contexts (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    icon        TEXT,
    position    BIGINT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Nome único ignorando caixa (mesmo padrão de task_tags / journal_emotions).
CREATE UNIQUE INDEX IF NOT EXISTS uq_task_contexts_name ON task_contexts (LOWER(name));
```

Sem semente (SEED) — usuário começa com zero contextos (clarificação). Excluir um contexto
apenas desassocia (`ON DELETE SET NULL` em `tasks.context_id`) — nunca apaga tarefas.

## Migração das tags reservadas → `gtd_status` (idempotente, roda embutida no schema)

```sql
-- 1) Migra #aguardando → gtd_status='waiting', waiting_since = agora (fallback — R3)
UPDATE tasks t SET gtd_status = 'waiting', waiting_since = now()
FROM task_tag_links l JOIN task_tags g ON g.id = l.tag_id
WHERE l.task_id = t.id AND LOWER(g.name) = 'aguardando' AND t.gtd_status IS NULL;

-- 2) Migra #algum-dia → gtd_status='someday' (só se ainda não tiver status; idempotente)
UPDATE tasks t SET gtd_status = 'someday'
FROM task_tag_links l JOIN task_tags g ON g.id = l.tag_id
WHERE l.task_id = t.id AND LOWER(g.name) = 'algum-dia' AND t.gtd_status IS NULL;

-- 3) Remove os vínculos e as próprias tags reservadas (FR-010 — "MUST remover")
DELETE FROM task_tag_links WHERE tag_id IN (
    SELECT id FROM task_tags WHERE LOWER(name) IN ('aguardando', 'algum-dia')
);
DELETE FROM task_tags WHERE LOWER(name) IN ('aguardando', 'algum-dia');
```

`WHERE t.gtd_status IS NULL` em (1)/(2) é o que torna a migração idempotente — rodar de novo
não sobrescreve nem duplica (passo 3 já apagou as tags na 1ª execução, então nas próximas o
`UPDATE ... FROM task_tag_links` simplesmente não casa nada).

## `BUILTIN_FILTERS` (tools_filters.py) — reescrita das 3 listas de estado

| Chave | Regra nova (DSL) |
|---|---|
| `next-actions` | `state=open AND gtd_status=next_action` |
| `waiting` | `state=open AND gtd_status=waiting` |
| `someday` | `state=open AND gtd_status=someday` |

`quick`/`energy` continuam iguais (tags livres `#5min`/`#alta-energia` — fora do escopo desta
spec; FR-011 só converte esses dois em smart-lists salvas editáveis, não muda a semântica).
`RESERVED_TAGS` é removido do módulo.

## Views fixas (novo módulo `tools_views.py`, não persistidas — ver research.md R7)

| View | Chave | Regra (DSL) |
|---|---|---|
| Todas | `all` | nenhuma condição (só a base "abertas") |
| Hoje | `today` | `due_date before <amanhã>` (mesma regra de `list_today_overdue`, reexposta) |
| Amanhã | `tomorrow` | `due_date eq tomorrow` |
| Próximos 7 Dias | `next7` | `due_date within 7d` (inclui hoje) |
| Inbox | `inbox` | `project_id in [<inbox_id>]` |

Cada view expõe também uma contagem (`COUNT(*)` sobre a mesma regra) para os badges da sidebar.

## DSL (`_FIELD_OPS` em tools_filters.py) — campos novos

| Campo | Ops |
|---|---|
| `gtd_status` | `eq`, `none` |
| `context_id` | `eq`, `none` |

`_resolve_relative_date` ganha o literal `"tomorrow"` (R8).

## Entidades (visão conceitual, espelha o `## Key Entities` do spec.md)

- **Status GTD da tarefa**: `next_action \| waiting \| someday \| NULL`, com `waiting_note`
  (opcional) e `waiting_since` (obrigatório quando `waiting`, gerido pela transição).
- **Contexto**: `task_contexts` — nome único (case-insensitive), ícone opcional, ordem;
  associação 1:N (uma tarefa, no máximo um contexto) via `tasks.context_id`.
- **View fixa**: consulta parametrizada em código (`tools_views.py`), sem linha em banco,
  não editável pelo usuário.
