# Data Model — Datas e Recorrência (fatia 012)

**Sem migração de schema.** Todas as tabelas e colunas usadas aqui já nasceram na Fase 1
(`agents/kaguya/schema_tasks_pg.sql`). Este documento descreve a **semântica** que a fatia 012 passa
a impor sobre elas. O modelo físico completo está na master
([`specs/010-kaguya-tasks-app/data-model.md`](../010-kaguya-tasks-app/data-model.md)).

## Entidade ativada: Recorrência (`task_recurrences`)

```
task_recurrences
├── id          SERIAL PK
├── task_id     INT  UNIQUE  → tasks(id) ON DELETE CASCADE   -- 1:1 com a tarefa VIVA da série
├── rrule       TEXT NOT NULL          -- regra iCal RFC 5545 (ex.: 'FREQ=MONTHLY;BYMONTHDAY=5')
├── mode        TEXT NOT NULL          -- 'fixed' | 'after_completion'
├── anchor_date DATE NOT NULL          -- DTSTART: base do cálculo em modo fixed
├── active      BOOLEAN NOT NULL        -- FALSE = série encerrada (preserva histórico)
└── created_at  TIMESTAMPTZ
```

**Invariantes que a fatia 012 garante:**

- **1:1 com a tarefa viva**: `task_id` aponta sempre para a única ocorrência **viva** da série. Ao
  concluir e gerar a próxima, a fatia faz `UPDATE task_recurrences SET task_id = <nova linha>` (o
  `UNIQUE` continua válido porque a linha antiga deixou de ser a viva).
- **`anchor_date` imutável** em modo `fixed`: reagendamento pontual da ocorrência (mudar
  `tasks.due_date`) **não** altera a âncora. Editar a regra também não move a âncora (a não ser que o
  usuário explicitamente re-ancore — fora do escopo desta fatia; editar a regra mantém a âncora).
- **`active=FALSE`** = série encerrada ("complete forever") ou excluída como série: a linha de regra é
  preservada (histórico), mas nenhuma próxima ocorrência é gerada e a UI não a trata como recorrente
  viva.
- **Recorrência exige `tasks.due_date`**: a âncora vem da data de vencimento; criar/editar recorrência
  sem data é rejeitado na camada de lógica.

## Campos de data da Tarefa (`tasks`)

Já existentes; a fatia 012 passa a exercê-los pelos dois canais:

| Campo | Tipo | Semântica na 012 |
|---|---|---|
| `due_date` | DATE | data de vencimento; âncora da recorrência; base da tela Hoje |
| `due_time` | TIME | hora opcional (NULL = dia inteiro); exige `due_date` (CHECK já existe) |
| `type` | TEXT | `task`/`event`/`birthday`; `birthday` ⇒ recorrência anual automática |
| `completed_at` | TIMESTAMPTZ | nas recorrentes, marca a ocorrência **consumida** (histórico) |

Campos `start_at`/`end_at`/`duration_min`/`my_day_date` continuam **dormentes** (Fase 3).

## Ciclo de vida de uma série recorrente

```
criar tarefa com due_date + recurrence{rrule, mode}
        │
        ▼
  [linha viva A] ──(concluir)──►  A.completed_at = now()   (histórico, "consumida")
        │                          │
        │                          ├─ next = next_occurrence(...)  (ver research.md §3)
        │                          │
        │            next ≠ None ──► cria [linha viva B] (subtarefas resetadas)
        │                          │   UPDATE task_recurrences.task_id = B
        │                          │
        │            next = None ──► task_recurrences.active = FALSE   (série esgotada)
        │
        ├─(concluir com end_series=True)──► A.completed_at = now(); active=FALSE; SEM próxima
        │
        ├─(excluir scope=this)──► A.deleted_at = now(); gera B normalmente
        │
        └─(excluir scope=series)──► A.deleted_at = now(); active=FALSE; SEM próxima
```

**Subtarefas no reset (edge case 6):** ao criar a linha B, as subtarefas vivas de A são copiadas para
B com `completed_at = NULL` e `deleted_at = NULL` (renascem abertas), preservando título/descrição/
prioridade/posição. As subtarefas de A permanecem como estavam (parte do histórico de A).

## DSL de RRULE usada (subconjunto)

A fatia gera/consome um subconjunto pragmático da RFC 5545 — o que `build_rrule` produz e
`describe_rrule` sabe verbalizar em pt-BR:

| Intenção | RRULE | `describe_rrule` (pt-BR) |
|---|---|---|
| Todo dia | `FREQ=DAILY` | "todo dia" |
| A cada N dias | `FREQ=DAILY;INTERVAL=N` | "a cada N dias" |
| Toda \<dia da semana\> | `FREQ=WEEKLY;BYDAY=MO` | "toda segunda" |
| Toda semana | `FREQ=WEEKLY` | "toda semana" |
| Todo dia D do mês | `FREQ=MONTHLY;BYMONTHDAY=D` | "todo dia D" |
| Todo mês | `FREQ=MONTHLY` | "todo mês" |
| Todo ano (aniversário) | `FREQ=YEARLY` | "todo ano" |

Regras fora desse subconjunto (escritas à mão por um usuário avançado) ainda **funcionam** no motor
(o dateutil parseia a RFC inteira); `describe_rrule` cai num fallback genérico ("recorrente") quando
não reconhece o padrão.
