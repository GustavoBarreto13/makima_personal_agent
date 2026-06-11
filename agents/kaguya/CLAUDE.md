# CLAUDE.md — agents/kaguya

## O que é este agente

**Kaguya** é o agente especialista em **tarefas + agenda**. A partir da spec
`011-tasks-mvp`, o motor de tarefas é um **sistema próprio em PostgreSQL** (o mesmo banco
de Nami/Frieren/Journal) — o TickTick foi aposentado. A agenda continua vindo do **Google
Calendar via MCP**.

Princípio central: **paridade de canais**. Toda capacidade nasce como função na camada de
lógica (`tools_tasks.py` / `tools_projects.py`); o canal Telegram (este agente) e o canal
webapp (router `/api/tasks/*`) são fachadas finas e paritárias sobre ela. O app é 100%
utilizável sem o bot e vice-versa.

---

## Estrutura de arquivos

```
agents/kaguya/
├── __init__.py
├── schema_tasks_pg.sql   # schema completo do domínio (aplicado por scripts/setup_schemas.py)
├── tools_tasks.py        # camada de lógica: CRUD de tarefas/subtarefas, completar, posições
├── tools_projects.py     # camada de lógica: listas, grupos, colunas (Kanban), sidebar
├── tools.py              # FACHADA: re-exporta a lógica + wrappers + cross-agent (Nami)
├── agent.py              # create_kaguya_agent() — factory (só o McpToolset do Calendar)
└── CLAUDE.md             # este arquivo

mcp_servers/calendar/server.py   # único MCP da Kaguya (Google Calendar)
```

> Não há mais `mcp_servers/ticktick/` nem variáveis `TICKTICK_*`. A Kaguya não depende de
> nenhuma API externa de tarefas.

---

## Como o agente é criado

Continua **factory** (`create_kaguya_agent()`) porque o `McpToolset` do Calendar instancia
um processo filho a cada criação (não pode ser compartilhado). O coordinator chama a factory
em `create_makima()`.

```python
# coordinator/agent.py
from agents.kaguya.agent import create_kaguya_agent
kaguya_agent = create_kaguya_agent()   # instancia só o McpToolset do Calendar
```

As tools de tarefas são **funções Python** registradas direto (não MCP).

---

## Camada de lógica (a fonte única)

### `tools_tasks.py` — tarefas e subtarefas

| Função | O que faz |
|---|---|
| `list_tasks(project_id, include_completed)` | tarefas-pai da lista, com subtarefas aninhadas |
| `list_tasks_today()` | `{overdue, today}` — abertas com `due_date <= hoje` |
| `search_tasks(query)` | busca por título/descrição (ILIKE) |
| `list_trash(project_id?)` | soft-deletadas (restauráveis) |
| `create_task(..., recurrence?)` | cria tarefa/subtarefa; sem lista → Inbox; `recurrence={rrule,mode}` opcional; `type=birthday`+data → recorrência anual automática |
| `update_task(task_id, ..., recurrence?, clear_recurrence?)` | edita; trocar de lista aplica a regra da coluna; anexa/edita/remove recorrência |
| `complete_task(task_id, cascade, end_series?)` | completa; subtarefas abertas sem cascade → `needs_cascade`; numa recorrente gera a próxima (`generated_task_id`); `end_series=True` encerra a série |
| `reopen_task(task_id)` | reabre; bloqueia se o pai está concluído |
| `reorder_task(task_id, after_id?, before_id?)` | posição esparsa ×1000 + renormalização |
| `delete_task(task_id, scope="this")` / `restore_task` | soft delete / restaura; recorrente: `scope=this` (gera próxima) \| `series` (desativa a regra) |
| `set_recurrence(task_id, rrule, mode)` / `clear_recurrence(task_id)` | anexa/remove a regra (exige `due_date`) |

`_complete_task_on_cursor(cur, ...)` é a versão transacional reusada pelo pagamento atômico
(pagamentos recorrentes também regeneram a próxima ocorrência atomicamente).

### Recorrência (Fase 2 / fatia 012) — `recurrence.py`

Motor **puro** (`agents/kaguya/recurrence.py`, sem banco) com a aritmética RRULE (RFC 5545 via
`python-dateutil`): `next_occurrence(rrule, anchor_date, mode, current_due, completed_on)`,
`build_rrule(...)`, `describe_rrule(...)` (pt-BR). Dois modos: `fixed` (âncora manda) e
`after_completion` (conta da conclusão real). Modelo **"completar-e-gerar"**: cada ocorrência é
uma linha; concluir consome a atual (vira histórico) e gera **uma** próxima (subtarefas resetam),
realocando a regra (`task_recurrences`, 1:1 com a tarefa viva). Semântica e os 9 edge cases:
`specs/012-tasks-recurrence/research.md` (gate em `tests/agents/test_kaguya_recurrence.py`).

### `tools_projects.py` — listas, grupos, colunas

`get_sidebar`, `create_project`, `update_project`, `delete_project(mode)`, `create_group`,
`update_group`, `delete_group`, `list_columns`, `create_column`, `update_column`,
`delete_column`, `resolve_project_id_by_name`.

**Regras de negócio** (validadas aqui): Inbox indelével/inarquivável; no máximo uma coluna
`is_done_column` por lista; captura órfã → Inbox; mover entre listas → primeira coluna do
destino (ou sem coluna); posições esparsas com renormalização transparente.

Mutações retornam `{"status": "ok"|"error", ...}`; listagens retornam o dado direto.

---

## Tools expostas ao agente (`tools.py`)

| Tool | Origem |
|---|---|
| `list_projects` | wrapper de `get_sidebar` |
| `list_tasks_by_project(project)` | aceita id **ou** nome (resolve por prefixo) |
| `list_tasks_today`, `search_tasks` | tarefas |
| `create_task`, `update_task`, `complete_task`, `reopen_task`, `delete_task`, `restore_task` | tarefas |
| `set_task_recurrence(task_id, freq, interval?, weekday?, monthday?, mode?)` | recorrência por intenção simples (monta a RRULE; ecoa `recurrence_text`) |
| `clear_recurrence(task_id)` | remove a recorrência |
| `create_project`, `update_project`, `delete_project` | listas |
| **`complete_payment_task`** | cross-agent (Kaguya + Nami) — atômico |
| **`create_expense_reminder`** | cross-agent — cria lembrete no Postgres |
| (Calendar) | `list_events_today`, `create_event`, ... via MCP |

### Cross-agent: pagamento atômico

`complete_payment_task(task_id, amount, category, account, transaction_name="")`:
completa a tarefa **e** lança a despesa (via `create_transaction_on_cursor` da Nami) na
**mesma transação PostgreSQL** — tudo-ou-nada (acabou o status `partial`). A Kaguya deve
confirmar valor/categoria/conta **antes** de chamar — sem defaults financeiros.

`create_expense_reminder(title, due_date, project_name="Finanças", amount=0, description="")`:
cria a tarefa de lembrete (prioridade alta) no banco; **não** lança despesa.

---

## Regras importantes de comportamento

- **Chame a tool PRIMEIRO**, depois responda. Nunca mande "aguarde...".
- Capture em linguagem natural e **ecoe a interpretação** (lista/data/prioridade assumidas);
  aceite correção conversacional. Datas no fuso `America/Sao_Paulo`, formato `AAAA-MM-DD`.
- Prioridades: 0 nenhuma · 1 baixa · 2 média · 3 alta.
- `list_tasks_today` já traz as vencidas em `overdue` — não chame nada redundante.
- **`needs_cascade`** não é erro: pergunte ao usuário e repita com `cascade=true`.
- **Recorrência**: tarefa precisa de data; crie e chame `set_task_recurrence(id, freq, ...)`; ecoe
  o `recurrence_text`. Aniversário (`type=birthday`+data) recorre todo ano sozinho. Ao concluir
  uma recorrente a próxima nasce (avise `next_due_date`); "encerrar a série" → `complete_task(id, end_series=true)`.
- `delete_task` e `delete_project` são destrutivas → **confirme sempre antes**.
  Recorrente: pergunte o escopo (`scope="this"` só esta · `scope="series"` a série inteira).
  `delete_project` exige `mode` (`move_to_inbox` | `delete_tasks`).
- Listas resolvidas dinamicamente por nome (prefixo) — nunca nomes fixos.
- "o que tenho pra hoje?" = `list_tasks_today()` (banco) + `list_events_today()` (Calendar).

---

## MCP Server — Google Calendar (`mcp_servers/calendar/server.py`)

Único MCP da Kaguya. Detalhes de configuração/OAuth em `coordinator/CLAUDE.md`.

- **Leitura**: todos os calendários. **Escrita**: apenas `GOOGLE_CALENDAR_MAIN_CALENDAR_ID`.
- `list_events_today` filtra o calendário externo **"TickTick"** (um calendário Google
  sincronizado de fora) via `_BLOCKED_CALENDARS` — isso é um **nome de calendário**, não tem
  relação com o antigo backend de tarefas.
- Tools: `list_calendars`, `list_events`, `list_events_today`, `get_event`, `create_event`,
  `update_event`, `delete_event`, `find_free_slots`.

---

## Formatação (Telegram = HTML)

- Título em `<b>negrito</b>`; prioridade: 🔴 Alta · 🟡 Média · 🔵 Baixa · ⚪ Nenhuma.
- Cada tarefa num bloco com 📋; subtarefas com ↳; vencidas em seção "⚠️ <b>Atrasadas</b>".
- Confirmação: `✅ <b>Título</b> — em 📁 Lista · 📅 data`. Erros: `❌ Houve um problema: ...`.
- **Nunca** use markdown (`*`, `_`, `~`). Só HTML e emojis.

---

## Personalidade

Kaguya Shinomiya — aristocrática, organizada, levemente condescendente.

- Sempre começa com `Kaguya:`
- Tom de quem faz um favor; admira o usuário mas escapa em `...`
- Cria: "Registrei isso para você. ...Apenas desta vez."
- Completa: "Concluído. Era o mínimo esperado."
- Erro: "Houve um problema. Não foi culpa sua, desta vez."
- Nunca quebra o personagem.
</content>
