# Phase 026: Sincronização bidirecional de aniversários Komi ↔ Kaguya — Context

**Gathered:** 2026-06-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Implementar sincronização bidirecional automática entre `person_dates` da Komi (label ILIKE
'%aniver%') e tarefas `type='birthday'` da Kaguya, via tabela de correspondência
`birthday_sync_links`, módulo `komi_sync.py` (espelho de gcal_sync), extensões nas tools da
Komi (add/update/delete de datas), endpoints REST de datas, flag `is_birthdays` na lista
dedicada "Aniversários", e frontend de edição/exclusão de datas na ficha da pessoa (Komi shell).

</domain>

<spec_lock>
## Requirements (locked via SPEC.md)

**12 requirements are locked.** Ver `026-SPEC.md` para requirements completos, boundaries e
acceptance criteria.

Agents downstream DEVEM ler `026-SPEC.md` antes de planejar ou implementar. Requirements não
são duplicados aqui.

**In scope (from SPEC.md):**
- Tabela `birthday_sync_links` (schema + migração de criação)
- `add_important_date` com `RETURNING id`
- Novas funções `update_important_date` e `delete_important_date` em `agents/komi/tools.py`
- Endpoints `PATCH` e `DELETE` para datas em `routers/pessoas.py`
- Módulo `agents/kaguya/komi_sync.py` (push_birthday, remove_birthday, push_person_date, remove_person_date)
- Hook Komi→Kaguya em `add_important_date` / `update_important_date` / `delete_important_date`
- Hook Kaguya→Komi em `tools_tasks.py` (create_task, update_task, delete_task) para type='birthday'
- Helper `_get_birthdays_list_id()` + criação da lista "Aniversários" sob demanda
- Dedup na agenda: `agents/komi/calendar_provider.py` omite person_dates que têm link em `birthday_sync_links`
- Frontend Komi: editar e excluir datas de uma pessoa (usa os novos PATCH/DELETE)
- Script de migração retroativa `scripts/migrate_birthday_sync.py`
- Flag de feature `KOMI_SYNC_ENABLED` (env var, default on)

**Out of scope (from SPEC.md):**
- Datas com label SEM 'anivers' (casamento, formatura, etc.)
- Sincronização com Google Calendar (já responsabilidade do gcal_sync.py)
- Update/delete de datas via bot Telegram (tools existem, agente usa depois)
- Tela/seção dedicada "Aniversários" no shell Kaguya
- Push notifications de aniversário
- Modificar `calendar_hub.py`

</spec_lock>

<decisions>
## Implementation Decisions

### Módulo komi_sync.py (agents/kaguya/)

- **D-01:** Imports de `agents.komi.tools` dentro do corpo das funções (lazy import), idêntico
  ao padrão já em uso em `tools_tasks.py` para `link_person_on_cursor`. Elimina risco de import
  circular sem overhead real (Python cacheia módulos).
- **D-02:** Hook Komi→Kaguya (chamar `komi_sync` após mutação de person_date) fica em
  `agents/komi/tools.py`, best-effort após commit — `try/except Exception: pass` + lazy import
  de `agents.kaguya.komi_sync`. Cobre tanto o bot Telegram quanto a webapp (ambos chamam as
  mesmas tools).
- **D-03:** Flag `KOMI_SYNC_ENABLED` verificada dentro de `komi_sync._enabled()` via
  `os.environ.get("KOMI_SYNC_ENABLED", "true").lower() != "false"`. Padrão identico ao
  `gcal_sync._enabled()` (linha ~34-44 de `agents/kaguya/gcal_sync.py`).
- **D-04:** Anti-loop por **convergência de valor**: `push_birthday(task_id)` e
  `push_person_date(date_id)` leem o estado atual do lado destino via SELECT antes de escrever;
  se os valores já batem (data idêntica, label idêntico) → no-op sem write. Sem flag de
  thread-local. Funciona em contextos sync/async/multi-thread.

### Lista "Aniversários" (task_projects)

- **D-05:** Adicionar coluna `is_birthdays BOOLEAN NOT NULL DEFAULT FALSE` em `task_projects`,
  com índice único parcial `UNIQUE (id) WHERE is_birthdays = TRUE` (garante exatamente 1 lista).
  Padrão idêntico ao `is_inbox`. Migração simples (`ALTER TABLE task_projects ADD COLUMN ...`).
- **D-06:** Helper `_get_birthdays_list_id(cur)` espelha `_get_inbox_id(cur)`:
  `SELECT id FROM task_projects WHERE is_birthdays = TRUE LIMIT 1` — se não existir, cria a
  lista com `INSERT INTO task_projects (name, icon, color, is_birthdays) VALUES ('Aniversários',
  '🎂', '#FF6B6B', TRUE) RETURNING id`.
- **D-07:** Lista "Aniversários" é **visível na sidebar** como qualquer lista normal (o flag
  `is_birthdays` serve como identidade, não esconde a lista). Usuário pode abrir e ver as
  tarefas; deleção da lista pelo usuário não é bloqueada nesta fase (proteger pode vir depois).

### birthday_sync_links — schema estendido

- **D-08:** Adicionar coluna `komi_label TEXT NOT NULL DEFAULT 'aniversário'` em
  `birthday_sync_links`. Armazena o label original do person_date (ex.: "aniversário de namoro").
  Ao criar pelo lado Kaguya (sem person_date prévio), `komi_label = 'aniversário'` (padrão).
  Ao propagar mudança de título da tarefa → Komi, o novo label é derivado do título (strip do
  sufixo " de {nome}") e gravado em `komi_label` + atualizado em `person_dates.label`.

### Endpoint GET /api/people/{id}/dates — campo is_synced

- **D-09:** O endpoint `GET /api/people/{person_id}` (via `get_person()`) e o campo `datas`
  retornado passam a incluir `is_synced: bool` por data via JOIN com `birthday_sync_links`. Sem
  endpoint separado. O frontend lê `is_synced` para decidir se mostra o badge "🎂 sincronizado".

### Frontend Komi — edição de datas

- **D-10:** Controles de editar/excluir aparecem em **modal dedicado** (não inline na lista).
  Cada item da lista de datas terá botões ✏ e 🗑; clicar ✏ abre um popover/modal com campos
  label (text), data (DatePicker) e recurring (toggle).
- **D-11:** Input de data usa **`DatePicker` de `pages/kaguya/components/DatePicker.tsx`**.
  Como o componente está no shell Kaguya, deve ser movido para `src/components/DatePicker.tsx`
  (e re-importado pelos usos da Kaguya) OU importado diretamente cross-shell. O correto
  conforme `webapp/CLAUDE.md` é mover para `src/components/`. O `TimePicker` pode aguardar
  (não necessário para datas de aniversário).
- **D-12:** Badge **"🎂 sincronizado"** exibido no item de data quando `is_synced === true`
  (campo retornado pelo GET /api/people/{id}). Chip pequeno, visual informativo apenas (não
  clicável nesta fase).

### Claude's Discretion

- Estrutura interna de `komi_sync.py`: nomes de funções privadas, docstrings, ordem de
  implementação dentro do módulo.
- Cor exata dos chips/badges no frontend Komi (usar paleta existente do `komi.css`).
- Formato de log das operações de sync (quais campos logar, nível: info vs debug).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents DEVEM ler estes arquivos antes de planejar ou implementar.**

### SPEC e plano técnico
- `specs/026-aniversario-sync/026-SPEC.md` — 12 requisitos travados (MUST READ antes de planejar)
- `C:\Users\gusta\.claude\plans\failed-to-load-resource-cozy-reddy.md` — Plano técnico completo com arquitetura detalhada (birthday_sync_links DDL, fluxos, anti-loop, dedup)

### Padrão de espelho (gcal_sync → komi_sync)
- `agents/kaguya/gcal_sync.py` — template a copiar: `_enabled()`, `push_task()`, `remove_task_event()`, padrão try/except best-effort, lazy imports
- `agents/kaguya/tools_tasks.py` linhas 874-879, 1039-1043, 1515-1519 — onde gcal_sync é chamado (replicar para komi_sync nas mesmas posições)

### Komi — tools e schema
- `agents/komi/tools.py` — `add_important_date` (linhas 322-357), `link_person_on_cursor` (482-516), `unlink_people_on_cursor` (523-551)
- `agents/komi/schema_pg.sql` — DDL das 4 tabelas da Komi; `person_dates` linhas 67-76
- `agents/komi/calendar_provider.py` — a editar para dedup (linhas 65-122: lista person_dates; 125-165: _make_item com ref_id=person_dates.id)

### Kaguya — tasks e schema
- `agents/kaguya/schema_tasks_pg.sql` — tasks (linhas 82-125), task_recurrences (152-163), task_projects + is_inbox (47-48, 56-57, 278-280)
- `agents/kaguya/tools_tasks.py` — `_get_inbox_id` (97-103, padrão para `_get_birthdays_list_id`), `create_task` (690-705 + type=birthday logic 759-769 + person_ids 866-871)

### REST e frontend
- `webapp/backend/routers/pessoas.py` — endpoints de datas: `POST /api/people/{id}/dates` (327-344); só este existe hoje
- `webapp/frontend/src/pages/kaguya/components/DatePicker.tsx` — componente a mover para `src/components/` para uso cross-shell na Komi
- `webapp/CLAUDE.md` §"Inputs, data e hora" — regras obrigatórias de DatePicker/TimePicker
- `webapp/frontend/src/pages/komi/` — shell Komi existente (PersonPage, PersonModal, tipos)

### Migração (VPS)
- `docs/MIGRACAO_POSTGRES.md` — checklist de deploy; scripts devem rodar via `docker exec makima-web`
- `coordinator/CLAUDE.md` — hostname do PostgreSQL (`personal-agent-makimadb-k3bxg9`) resolve só dentro do container

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `agents/kaguya/gcal_sync.py`: template direto para `komi_sync.py` — copiar estrutura `_enabled()`, padrão de try/except, lazy import, `push_*`/`remove_*` naming
- `agents/kaguya/tools_tasks.py` → `_get_inbox_id(cur)` (linhas 97-103): copiar para `_get_birthdays_list_id(cur)`, mesma query padrão com INSERT ON CONFLICT
- `agents/komi/tools.py` → `link_person_on_cursor` (482-516): import lazy dentro da função — padrão estabelecido para evitar ciclo
- `webapp/frontend/src/pages/kaguya/components/DatePicker.tsx`: componente de seleção de data tematizado, respeita UTC-3; mover para `src/components/`
- `webapp/frontend/src/pages/kaguya/components/MiniCalendar.tsx`: usado internamente pelo DatePicker; acompanha na mudança se DatePicker for movido

### Established Patterns
- **Best-effort hook pós-commit** (gcal_sync): `try: <import e call> except Exception: pass` — nunca aborta a operação principal
- **Lazy import cross-agent**: `from agents.komi.tools import X` dentro do corpo da função (não no topo do módulo) — evita import circular
- **is_inbox pattern**: coluna boolean + índice único parcial + helper `_get_*_id(cur)` com CREATE IF NOT EXISTS — replicar para is_birthdays
- **Convergência como anti-loop**: SELECT + compare antes de UPDATE/INSERT → no-op se igual. Evita flag de thread-local
- **model_dump(exclude_unset=True)** em todos os PATCH do FastAPI — permite atualização parcial sem sobrescrever campos não enviados
- **`person_links` entity_id como TEXT**: tasks usam SERIAL int mas `person_links.entity_id` é TEXT → cast `pl.entity_id::int` nas queries que juntam com tasks

### Integration Points
- `agents/komi/tools.py`: adicionar chamadas ao `komi_sync` no final de `add_important_date`, `update_important_date`, `delete_important_date`
- `agents/kaguya/tools_tasks.py`: adicionar chamadas ao `komi_sync.push_birthday`/`remove_birthday` nas posições onde já existem chamadas ao `gcal_sync` (create/update/delete de tasks)
- `agents/komi/calendar_provider.py` linhas 65-122: adicionar LEFT JOIN com `birthday_sync_links` para filtrar person_dates já sincronizados (dedup)
- `webapp/backend/routers/pessoas.py`: adicionar 2 rotas novas (PATCH/DELETE `/dates/{date_id}`) e enriquecer resposta de GET `/{id}` com `is_synced`
- Schema PostgreSQL compartilhado: `birthday_sync_links` referencia `person_dates.id` (Komi) e `tasks.id` (Kaguya) — FKs cross-schema funcionam no mesmo banco

</code_context>

<specifics>
## Specific Ideas

- **Título gerado (Komi→Kaguya)**: `"Aniversário de {nome}"` para label base. Label com
  complemento (ex: "aniversário de namoro") → `"Aniversário de namoro de {nome}"` (capitaliza
  primeira letra do label, append " de {nome}").
- **Cor da lista "Aniversários"**: `#FF6B6B` (salmon), emoji `🎂`.
- **badge "🎂 sincronizado"**: chip pequeno, somente informativo, aparece em cada data que
  tenha `is_synced: true` na resposta da API.
- **SPEC.md**: 12 requisitos com critérios pass/fail — o verifier pode usar diretamente como
  checklist de testes manuais.

</specifics>

<deferred>
## Deferred Ideas

- Proteção contra exclusão acidental da lista "Aniversários" (is_birthdays protected) — futura
  melhoria de UX
- Badge clicável que navega para a tarefa Kaguya correspondente — próxima fase do frontend Komi
- Update/delete de datas via bot Telegram (Komi agent) — as tools existirão após esta fase;
  ativar no prompt da Komi em fase separada
- Extensão do sync para outros tipos de data (casamento, formatura) — escopo explicitamente
  fora desta fase; requer análise separada
- Tela/seção "Aniversários" dedicada no shell Kaguya — sidebar já mostra a lista, mas uma
  tela com view de aniversários do ano (tipo "próximos 30 dias") poderia ser uma fase visual

</deferred>

---

*Phase: 026-aniversario-sync*
*Context gathered: 2026-06-22*
