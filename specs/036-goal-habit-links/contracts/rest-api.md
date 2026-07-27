# Contrato REST — 036 Metas e Hábitos cross-agent

Todas as rotas em `webapp/backend/routers/tasks.py`, prefixo `/api/tasks`, `Depends(require_user)`.
Convenção herdada: mutações usam `_check_result()` (erro `{"status":"error"}` → HTTP 400), exceto
onde indicado.

## Vínculo de metas (US1)

### `GET /api/tasks/goals/link-providers`
Lista os provedores de vínculo de meta registrados.
```json
[{"id": "frieren_books", "name": "Livros (Frieren)"}]
```

### `GET /api/tasks/goals/link-providers/{provider_id}/search?q=...`
Busca itens vinculáveis num provedor (best-effort — `[]` se o provedor falhar).
```json
[{"id": "uuid-do-livro", "label": "Duna", "sublabel": "Frank Herbert", "cover_url": "https://..."}]
```
404 se `provider_id` não estiver registrado.

### `POST /api/tasks/goals/{goal_id}/links`
Body: `{"provider_id": "frieren_books", "entity_id": "uuid-do-livro"}`
Vincula o item à meta (idempotente — repetir não duplica). 400 se a meta não existir.

### `DELETE /api/tasks/goals/{goal_id}/links/{provider_id}/{entity_id}`
Desvincula. 400 se o vínculo não existir. O item de origem nunca é tocado (FR-011).

### `PATCH /api/tasks/goals/{goal_id}/metric-mode`
Body: `{"mode": "manual"|"auto"}`
Alterna o modo da métrica (R7). `auto → manual` congela o último valor calculado em
`metric_current`.

### `GET /api/tasks/goals/{goal_id}` (rota já existente — payload estendido)
`movements` passa a incluir a chave `external`, agrupada por provedor:
```json
{
  "...": "...",
  "metric_mode": "auto",
  "movements": {
    "experiments": [...], "tasks": [...], "habits": [...],
    "external": {
      "frieren_books": {
        "provider_name": "Livros (Frieren)",
        "unavailable": false,
        "items": [{"entity_id": "...", "label": "Duna", "sublabel": "Frank Herbert",
                   "cover_url": "...", "done": true, "deep_link": "/books/..."}]
      }
    }
  }
}
```
`unavailable: true` quando o provedor falhou na consulta (FR-008) — a UI mostra aviso, sem quebrar
o resto da tela.

## Fonte automática de hábito (US2/US3)

### `GET /api/tasks/habits/source-providers`
Lista os provedores de fonte de hábito registrados.
```json
[{"id": "violet_diary", "name": "Diário (Violet)"},
 {"id": "frieren_reading", "name": "Leitura (Frieren)"}]
```

### `POST /api/tasks/habits/` e `PATCH /api/tasks/habits/{habit_id}` (rotas já existentes)
Body ganha campo opcional `source_provider_id` (string ou `null` para remover a fonte).

### `GET /api/tasks/habits/` e `GET /api/tasks/habits/{habit_id}` (rotas já existentes — payload estendido)
```json
{
  "...": "...",
  "source_provider_id": "violet_diary",
  "done_today": true,
  "done_today_source": "auto"
}
```
`done_today_source` ∈ `"manual" | "auto" | null` (null quando `done_today` é `false`).

### `GET /api/tasks/habits/{habit_id}/history?year=2026` (rota já existente — payload estendido)
Cada dia esparso ganha `source`:
```json
[{"date": "2026-07-05", "value": 1.0, "done": true, "source": "auto"}]
```
`source` é `"manual"` quando só há check-in manual naquele dia, `"auto"` quando só há atividade
da fonte, `"both"` quando os dois coincidem no mesmo dia (FR-007 — conta uma vez, mas a origem
dupla fica visível).
