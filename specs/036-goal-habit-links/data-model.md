# Data Model — 036 Metas e Hábitos cross-agent

## Alterações de schema (todas em `agents/kaguya/schema_tasks_pg.sql`, idempotentes)

### `goals` — nova coluna `metric_mode`

```sql
ALTER TABLE goals ADD COLUMN IF NOT EXISTS metric_mode TEXT NOT NULL DEFAULT 'manual'
    CHECK (metric_mode IN ('manual', 'auto'));
```

- `manual` (padrão, comportamento atual): `metric_current` é editável pelo usuário.
- `auto`: `metric_current` é somente leitura na API (bloqueado por `update_goal`); o valor
  exibido é sempre recalculado a partir de `goal_external_links` (ver R6).

### `goal_external_links` — nova tabela (vínculo meta ↔ entidade de outro agente)

```sql
CREATE TABLE IF NOT EXISTS goal_external_links (
    id          SERIAL PRIMARY KEY,
    goal_id     INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    provider_id TEXT NOT NULL,      -- chave no registry de goal_link_providers (ex.: 'frieren_books')
    entity_id   TEXT NOT NULL,      -- id da entidade no domínio dono (TEXT absorve UUID e SERIAL)
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (goal_id, provider_id, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_goal_external_links_goal ON goal_external_links (goal_id);
```

- `ON DELETE CASCADE` em `goal_id`: excluir a meta remove os vínculos (FR-011) — nunca toca a
  entidade de origem (o provedor dono nem é consultado na exclusão).
- Não exclusivo: o mesmo `(provider_id, entity_id)` pode aparecer em vínculos de metas diferentes
  (edge case "mesmo livro em duas metas").
- Sem FK para a tabela de origem (ela nem está neste banco de dados lógico do domínio, embora seja
  o mesmo Postgres físico) — igual ao padrão de `person_links` da Komi.

### `habits` — nova coluna `source_provider_id`

```sql
ALTER TABLE habits ADD COLUMN IF NOT EXISTS source_provider_id TEXT;
```

- `NULL` (padrão): hábito manual, comportamento atual — sem mudança para os ~existentes.
- Preenchido (ex.: `'violet_diary'`, `'frieren_reading'`): chave no registry de
  `habit_source_providers`; hábitos binários usam qualquer provedor (presença = cumprido),
  hábitos mensuráveis (com `target_value`) usam o valor numérico do provedor.
- Sem validação de FK (o valor só precisa bater com uma chave registrada em runtime — se o
  provedor não existir mais, o registry degrada para "sem atividade" em vez de erro, R8).

`habit_checkins` **não muda** — check-ins automáticos nunca são gravados nessa tabela (R4).

## Entidades novas (conceituais, não-tabela)

### Goal Link Provider (contrato, `agents/kaguya/goal_link_providers.py`)

| Campo do registro | Tipo | Descrição |
|---|---|---|
| `id` | str | Chave única (ex.: `"frieren_books"`) |
| `name` | str | Nome de exibição (ex.: `"Livros (Frieren)"`) |
| `search_fn` | callable | `(query: str) -> list[dict]` |
| `resolve_fn` | callable | `(ids: list[str]) -> list[dict]` |

### Habit Source Provider (contrato, `agents/kaguya/habit_source_providers.py`)

| Campo do registro | Tipo | Descrição |
|---|---|---|
| `id` | str | Chave única (ex.: `"violet_diary"`, `"frieren_reading"`) |
| `name` | str | Nome de exibição (ex.: `"Diário (Violet)"`) |
| `fn` | callable | `(start_date: str, end_date: str) -> dict[str, float]` |

## Como cada requisito mapeia para o dado

| Requisito | Fonte do dado |
|---|---|
| FR-001/FR-002 vínculo manual + exibição de movimentos externos | `goal_external_links` + `resolve_items` (ao vivo) |
| FR-003/FR-004 métrica auto calculada na leitura, edição bloqueada | `goals.metric_mode` + agregação de `resolve_items(done=True)` |
| FR-005/FR-006 fonte automática de hábito, distinguível, alimenta força | `habits.source_provider_id` + `get_activity` mesclado com `habit_checkins` |
| FR-007 check-in automático desaparece com a fonte, sem duplicidade | Nada persistido (R4) — união de conjuntos na leitura |
| FR-008 best-effort | `try/except` dentro dos dois registries (R8) |
| FR-009 vínculo para entidade inexistente é ignorado | `resolve_items`/`resolve` simplesmente omite o id que não existe |
| FR-010 extensível sem mudança estrutural | Registry por `provider_id` — novo agente = novo módulo `goal_provider.py`/`habit_provider.py` + 1 `register()` |
| FR-011 excluir meta só desvincula | `ON DELETE CASCADE` em `goal_external_links.goal_id` |
| FR-012 dia local (UTC-3) do check-in automático | `habit_provider.get_activity` já recebe/devolve datas no fuso America/Sao_Paulo (mesma convenção de `_today()` em `tools_habits`/`tools_goals`) |
