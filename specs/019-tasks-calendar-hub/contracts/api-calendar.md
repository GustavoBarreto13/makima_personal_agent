# Contrato — Calendar Hub (fatia 019)

Camadas: (1) cliente `gcal.py`, (2) sync `gcal_sync.py`, (3) protocolo de provider/conector +
agregador `calendar_hub`, (4) preferências de calendário, e os endpoints do webapp. Convenção: mutações
`{status: ok|error}` (via `_check_result` → 400); listagens devolvem o dado direto. Todas as rotas com
`Depends(require_user)`.

---

## 1. Cliente compartilhado — `agents/kaguya/gcal.py`
```python
ensure_kaguya_calendar() -> str                 # acha/cria "Kaguya — Tarefas"; id cacheado (idempotente)
list_calendars() -> list[dict]                  # [{id, name, role, is_main, is_kaguya}]
list_events(date_from, date_to, exclude_calendars=("Kaguya — Tarefas","TickTick")) -> list[dict]
create_event(calendar_id, summary, start, end, all_day=False, description="", location="") -> dict
update_event(calendar_id, event_id, **campos) -> dict
delete_event(calendar_id, event_id) -> dict
```
Mesma lógica/credenciais OAuth do MCP (`server.py:_get_service`); refresh on-demand; sem
re-autorização (escopo já `calendar`).

## 2. Sync outbound — `agents/kaguya/gcal_sync.py`
```python
push_task(task_id) -> None          # upsert do evento espelho (ver data-model §5); guarda google_event_id
remove_task_event(task_id) -> None  # apaga o espelho (soft-delete / perdeu data)
```
**Best-effort** (try/except + log; nunca levanta), respeita `GCAL_SYNC_ENABLED`. **Gatilho** na camada
de lógica (`tools_tasks.py`) após commit de create/update/complete/reopen/delete/restore/set_time_block.

## 3. Providers/conectores + agregador

### Protocolo (cada fonte)
```python
# bases cross-agent: agents/<dominio>/calendar_provider.py
# conectores externos: agents/kaguya/connectors/<nome>.py (ou pacote dedicado)
SOURCE = {"id": "nami", "account": "makima", "kind": "base", "name": "Nami · Finanças", "color": "oklch(...)"}
def list_calendar_events(start_date, end_date) -> list[CalendarItem]: ...
```
`CalendarItem` = `{cal, date, start?, end?, all_day, title, kind, ref_id?, deep_link?, color?, loc?}`
(ver data-model §4).

### Agregador — `agents/kaguya/calendar_hub.py`
```python
register(source)                          # registra provider/conector
list_sources() -> list[dict]              # [{id, account, kind, name, color}] (+ prefs aplicadas)
aggregate(start, end, sources=None) -> dict
    # {sources:[...], items:[CalendarItem...], errors:[source_id...]}  (fan-out best-effort)
```

## 4. Preferências de calendário
```python
get_calendar_prefs() -> list[dict]                 # [{calendar_id, visible, color, position}]
set_calendar_pref(calendar_id, visible?, color?, position?) -> dict
```
Persistidas (tabela `calendar_prefs` ou storage equivalente — ver data-model §2).

---

## 5. Endpoints do webapp — `webapp/backend/routers/tasks.py`

### Calendários e camadas
- `GET /api/tasks/calendar/sources` → `calendar_hub.list_sources()` (bases + integrações + prefs).
- `GET /api/tasks/calendar/aggregate?start=&end=&sources=nami,frieren,...` →
  `calendar_hub.aggregate(...)` (itens + `errors`). Listagem.
- `GET /api/tasks/calendar/prefs` · `PATCH /api/tasks/calendar/prefs/{calendar_id}` → visibilidade/cor.

### Eventos do Google (base "Agenda pessoal" — editável)
- `GET /api/tasks/calendar/calendars` → `gcal.list_calendars()`.
- `GET /api/tasks/calendar/events?start=&end=` → `gcal.list_events(...)` (exclui espelho + TickTick).
- `POST /api/tasks/calendar/events` · `PATCH .../events/{id}` · `DELETE .../events/{id}` →
  `gcal.*` no calendário **principal**. Mutações.

### Eventos da base "Kaguya" (= tarefas)
Reusam os endpoints de tarefa existentes (não há endpoint de evento próprio):
- **mover/redimensionar** → `POST /api/tasks/{id}/time-block` (fatia 016) ou `PATCH /api/tasks/{id}`
  (due_date/start_at/end_at).
- **criar no grid / drop da bandeja** → `POST /api/tasks` (com `due_date` + bloco) / `POST
  /api/tasks/{id}/time-block`.
- **excluir/duplicar** → `DELETE /api/tasks/{id}` / `POST /api/tasks` (cópia).

> A `CalendarScreen` compõe **3 fontes**: tarefas (endpoints de tarefa + `/calendar` da 013), eventos
> do Google (`/calendar/events`) e camadas agregadas (`/calendar/aggregate`). Implementação pode
> consolidar num `/calendar?include=tasks,gevents,sources` — a decidir.

---

## 6. Telegram (paridade)
- Maneja eventos do Google principal via MCP (já existe).
- Espelho de tarefas automático (gatilho na camada de lógica).
- "O que tenho essa semana" pode incluir as camadas via `calendar_hub.aggregate` (mesmo dado do webapp).

---

## 7. Editabilidade por fonte (resumo p/ a UI)
| Fonte | Mover/Resize/Criar/Excluir | Clique |
|---|---|---|
| `kaguya` (tarefas) | sim (endpoints de tarefa) | abre TaskModal |
| `gcal` (Agenda pessoal) | sim (`/calendar/events`) | popover de evento |
| `nami`/`frieren`/`akane`/`violet` | não | deep-link ao domínio |
| `animes`/`futebol`/`feriados` | não | info read-only |
