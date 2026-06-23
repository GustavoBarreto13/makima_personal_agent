# Phase 026: Sincronização bidirecional de aniversários Komi ↔ Kaguya — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-22
**Phase:** 026-aniversario-sync
**Areas discussed:** Estrutura komi_sync.py, Lista "Aniversários", Frontend Komi — datas, Sync reverso de título

---

## Estrutura komi_sync.py

| Opção | Descrição | Selecionada |
|-------|-----------|-------------|
| Import lazy dentro da função | Cada função do komi_sync.py faz import de komi.tools dentro do corpo, padrão já em uso em tools_tasks.py para link_person_on_cursor | ✓ |
| Dependência unidirecional como módulo separado | komi_sync.py nunca importado por komi/tools.py | (não discutida separadamente — incorporada) |

**User's choice (hook location):** Hook Komi→Kaguya fica em `agents/komi/tools.py` (best-effort após commit), não no router FastAPI (que não cobriria o Telegram).

**User's choice (flag):** `_enabled()` dentro de `komi_sync.py`, lendo `KOMI_SYNC_ENABLED`, idêntico ao `gcal_sync`.

**User's choice (anti-loop):** Convergência por comparação de valor (SELECT + compare antes de escrever) — não flag de thread-local.

---

## Lista "Aniversários"

| Opção | Descrição | Selecionada |
|-------|-----------|-------------|
| is_birthdays BOOLEAN em task_projects | Mesma abordagem da Inbox; coluna + unique parcial WHERE is_birthdays=TRUE; _get_birthdays_list_id() cria sob demanda | ✓ |
| Busca por nome 'Aniversários' | SELECT por nome, sem coluna nova — frágil se renomeado | |

| Emoji/cor | Descrição | Selecionada |
|-----------|-----------|-------------|
| 🎂 + #FF6B6B (salmon) | Consistente com o 🎂 do calendar_provider | ✓ |
| 🎉 + cor padrão | Menos relacionado ao 🎂 da agenda | |

**User's choice (visibilidade):** Lista visível na sidebar como qualquer lista normal.

---

## Frontend Komi — datas

| Opção | Descrição | Selecionada |
|-------|-----------|-------------|
| Inline na lista de datas | Botões Edit/Delete na linha; edição in-place | |
| Modal dedicado de edição | Abrir modal/popover com campos label + data + recurring | ✓ |

| Input de data | Descrição | Selecionada |
|---------------|-----------|-------------|
| DatePicker de Kaguya (components/DatePicker.tsx) | Tematizado OKLCH, respeita UTC-3 | ✓ |
| \<input type="date"\> nativo | Proibido pelo webapp/CLAUDE.md | |

**User's choice (badge):** Mostrar badge "🎂 sincronizado" para datas com `is_synced: true`. Campo `is_synced` retornado pelo GET /api/people/{id}/dates (piggyback na resposta existente, sem endpoint novo).

---

## Sync reverso de título

| Opção | Descrição | Selecionada |
|-------|-----------|-------------|
| Salvar komi_label em birthday_sync_links | Coluna `komi_label TEXT` armazena label original; derivar label de mudanças de título da tarefa | ✓ |
| Sempre 'aniversário' como label fixo | Mais simples; nunca reflete customizações do título | |

| Badge is_synced | Descrição | Selecionada |
|-----------------|-----------|-------------|
| Campo is_synced no GET /api/people/{id} | JOIN com birthday_sync_links na resposta existente | ✓ |
| Endpoint separado GET /api/birthday-sync/status | Mais endpoints para manter | |

---

## Claude's Discretion

- Estrutura interna de `komi_sync.py`: nomes de funções privadas, docstrings, ordem de implementação
- Cor exata dos chips/badges no frontend Komi (paleta existente do komi.css)
- Formato de log das operações de sync (campos, nível: info vs debug)

## Deferred Ideas

- Proteção contra exclusão da lista "Aniversários" (is_birthdays protected) — melhoria futura de UX
- Badge clicável que navega para a tarefa Kaguya correspondente — próxima fase frontend Komi
- Update/delete de datas via bot Telegram (Komi agent) — as tools existirão; ativar no prompt depois
- Extensão do sync para outros tipos de data (casamento, formatura) — fase separada
- Tela "Aniversários" no shell Kaguya com view "próximos 30 dias" — fase visual
