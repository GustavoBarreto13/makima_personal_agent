# Data Model — Meu Dia + Time-blocking (fatia 016)

Esta fatia **não cria tabelas nem altera o schema**. Ela **ativa** colunas que já nasceram dormentes
na Fase 1 (ver master [`010/data-model.md`](../010-kaguya-tasks-app/data-model.md)) e define a
**métrica derivada** de capacity. Referência da definição física:
`agents/kaguya/schema_tasks_pg.sql`.

---

## 1. Colunas ativadas em `tasks`

| Coluna | Tipo | Papel nesta fatia |
|---|---|---|
| `my_day_date` | `DATE` | Data para a qual a tarefa está **selecionada no Meu Dia**. Independente de `due_date`. `NULL` = fora do Meu Dia. Índice parcial `idx_tasks_my_day` (já existe). |
| `start_at` | `TIMESTAMPTZ` | Início do bloco de tempo (time-blocking). |
| `end_at` | `TIMESTAMPTZ` | Fim do bloco. **CHECK** `end_at IS NULL OR start_at IS NOT NULL` (já no schema). |
| `duration_min` | `INT` | Estimativa de duração — insumo da CapacityBar. |

Nenhuma constraint nova. Nenhuma migração. A única mudança de banco possível seria um índice extra se
a query de "pendências de ontem" / "plano do dia" exigir — **avaliar na implementação**; o
`idx_tasks_my_day` parcial provavelmente basta.

---

## 2. Estados derivados (não são colunas)

- **No plano de hoje**: `my_day_date = :hoje AND completed_at IS NULL AND deleted_at IS NULL`.
- **Pendência de ontem**: `my_day_date < :hoje AND completed_at IS NULL AND deleted_at IS NULL`.
- **Sugestão**: `due_date BETWEEN :hoje AND :hoje + 7 AND (my_day_date IS NULL OR my_day_date <> :hoje)
  AND completed_at IS NULL AND deleted_at IS NULL`. (Régua "vence em breve" do protótipo — distinta
  da régua "urgente" `≤2 dias` da fatia 017.)
- **Com bloco de tempo**: `start_at IS NOT NULL`.

---

## 3. Capacity — métrica derivada (cálculo na leitura)

Função **pura** sobre três entradas, sem persistência (candidata a motor isolado para teste, ex.:
`agents/kaguya/capacity.py`):

```
entradas:
  estimativas  = lista de duration_min das tarefas do plano de hoje (None → 0)
  eventos      = lista de (start, end) dos eventos do Google Calendar do dia (via tools_calendar)
  janela       = [08:00, 22:00]  (minutos úteis = 14h = 840 min)

cálculo:
  estimado_min = soma(estimativas)
  agenda_min   = soma(duracao de cada evento, recortado à janela)
  livre_min    = max(0, janela_total - agenda_min)
  folga_min    = livre_min - estimado_min        # negativo = plano excede a janela livre

saída (os 3 stats do hero + a barra):
  { no_plano: int, estimado_min, agenda_min, livre_min, folga_min, excedeu: folga_min < 0 }
```

Quando o Calendar está indisponível, `agenda_min = 0` e a saída inclui `calendar_ok: false` (a UI
sinaliza, mas a tela funciona — FR-008/SC-005).

---

## 4. Novas funções na camada de lógica (`tools_tasks.py`)

Hoje `update_task` (`tools_tasks.py:663`) **não** aceita `my_day_date`/`start_at`/`end_at`/
`duration_min`. Esta fatia adiciona (assinaturas indicativas — a implementação decide entre estender
`update_task` e/ou criar tools dedicadas; recomenda-se tools dedicadas para a semântica clara + a
extensão de `update_task` para `duration_min`):

| Função | O que faz | Retorno |
|---|---|---|
| `add_to_my_day(task_id, date=None)` | `my_day_date = date or hoje`. | `{status, ...}` |
| `remove_from_my_day(task_id)` | `my_day_date = NULL`. | `{status, ...}` |
| `reschedule_pending(task_id, when)` | atalho do ritual: `when ∈ {"today","tomorrow","later"}` → ajusta `my_day_date` (later = NULL). | `{status, ...}` |
| `set_estimate(task_id, duration_min)` | grava `duration_min` (também via `update_task`). | `{status, ...}` |
| `set_time_block(task_id, start_at, end_at=None, duration_min=None)` | grava bloco; se `end_at` ausente, deriva de `start_at + (duration_min or 30)`; valida CHECK. | `{status, ...}` |
| `clear_time_block(task_id)` | `start_at = end_at = NULL`. | `{status, ...}` |
| `list_my_day(date=None)` | monta o ritual: `{plano, pendencias_ontem, sugestoes, capacity}`. `capacity` usa §3 + `tools_calendar`. | dado direto (listagem) |

Convenção do repo: mutações retornam `{"status": "ok"|"error", ...}`; `list_my_day` retorna o dado
direto (sem `status`) — o router **não** usa `_check_result` nela.

---

## 5. Fachada do agente (`tools.py`) — paridade Telegram

- `plan_my_day()` / `my_day_status()` → relato textual de `list_my_day` (plano + capacity em texto).
- `add_to_my_day(task_or_name)` / `remove_from_my_day(task_or_name)` — resolve por id **ou** nome
  (prefixo, como as outras tools da Kaguya).
- `set_estimate(task_or_name, minutes)`.
- (Opcional) `block_time(task_or_name, start_at, minutes?)` — time-block por intenção.

A *timeline* e a *CapacityBar* visuais são webapp-only; no Telegram a Kaguya relata o plano e o
capacity em texto (ex.: "Plano de hoje: 5 tarefas · ~3h estimadas · 4h de agenda · folga de 1h").
