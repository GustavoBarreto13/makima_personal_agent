# Contrato das tools da Kaguya (delta da fatia 012)

Estende [`011-tasks-mvp/contracts/kaguya-tools.md`](../../011-tasks-mvp/contracts/kaguya-tools.md).
Paridade com [`api-tasks.md`](./api-tasks.md): cada capacidade existe nos **dois** canais sobre a
mesma camada de lógica. A Kaguya **ecoa a interpretação** (data/recorrência) em português e pede
confirmação onde é destrutivo.

## Tools alteradas

| Tool | Mudança |
|---|---|
| `create_task(title, ..., due_date?, due_time?, recurrence?)` | `recurrence={rrule, mode}` opcional; `type="birthday"` + `due_date` ⇒ recorrência anual automática |
| `update_task(task_id, ..., recurrence?, clear_recurrence?)` | anexar/editar a regra; `clear_recurrence=True` remove |
| `complete_task(task_id, cascade=False, end_series=False)` | `end_series=True` encerra a série (conclui sem gerar a próxima) |
| `delete_task(task_id, scope="this")` | `scope="this"` (gera a próxima) \| `scope="series"` (desativa a regra) |

## Tools novas

| Tool | Descrição |
|---|---|
| `set_recurrence(task_id, rrule, mode="fixed")` | anexa/substitui a regra; exige `due_date` na tarefa |
| `clear_recurrence(task_id)` | remove a regra (volta a ser tarefa simples) |

## Helpers de RRULE expostos à instrução do agente

A Kaguya **não** lida com RRULE crua na conversa — ela usa os presets de `build_rrule` e descreve com
`describe_rrule`:

| Helper (camada de lógica) | Uso pelo agente |
|---|---|
| `build_rrule(freq, interval=1, weekday=None, monthday=None)` | montar a regra a partir da intenção ("toda segunda" → `FREQ=WEEKLY;BYDAY=MO`) |
| `describe_rrule(rrule)` | verbalizar a regra no eco ("Recorrência: todo dia 5") |

## Comportamento esperado na conversa (instrução)

- **Captura com data**: "me lembra de pagar o cartão dia 10" → `create_task(..., due_date="2026-06-10")`;
  resposta ecoa a data assumida. Ambiguidade ("sexta") → **próxima sexta futura**, dito na resposta.
- **Captura recorrente**: "pagar aluguel todo dia 5" → `create_task(..., due_date=<próximo dia 5>,
  recurrence={rrule: build_rrule("MONTHLY", monthday=5), mode:"fixed"})`; ecoa "todo dia 5".
- **Pós-conclusão**: "trocar a água do filtro a cada 3 dias, contando de quando eu trocar" →
  `mode="after_completion"`.
- **Concluir série**: "não preciso mais lembrar disso" numa recorrente → confirmar e
  `complete_task(..., end_series=True)`.
- **Excluir recorrente**: **sempre** perguntar "só esta ocorrência ou a série inteira?" antes de
  `delete_task(scope=...)`. Exclusão continua exigindo confirmação prévia (regra do MVP).
- **Aniversário**: "anota o aniversário da minha mãe, 16 de setembro" → `create_task(type="birthday",
  due_date="2026-09-16")`; a recorrência anual é automática; ecoa "todo ano, 16/09".
