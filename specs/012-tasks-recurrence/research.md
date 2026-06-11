# Research — Datas e Recorrência (fatia 012)

Phase 0 do plano. Registra as decisões técnicas e, principalmente, a **tabela-verdade** dos 9 edge
cases de recorrência — o contrato que o motor `agents/kaguya/recurrence.py` deve satisfazer (SC-001).

## Decisão 1 — Biblioteca de RRULE: `python-dateutil`

- **Escolha**: `python-dateutil` (`dateutil.rrule.rrulestr`).
- **Por quê**: implementa a RFC 5545 (RRULE) inteira, incluindo `.after(dt, inc)` e `.before(dt, inc)`
  — exatamente as primitivas que o cálculo de "próxima ocorrência" precisa. Reimplementar isso à mão
  seria a fonte mais provável de bugs nos 9 edge cases.
- **Alternativas descartadas**: `recurring-ical-events`/`icalendar` (peso desnecessário — queremos só
  a aritmética da regra, não parse de VEVENT); aritmética manual (frágil para BYDAY/BYMONTHDAY/meses
  com 28–31 dias).
- **Custo**: 1 dependência pura-Python, sem binários, já transitiva de muitos pacotes. Alinha com o
  princípio V (a Fase 1 já registrava "rrule/dateutil só na Fase 2").

## Decisão 2 — Modelo de persistência: "completar-e-gerar" (cada ocorrência é uma linha)

A master diz *"apenas a próxima ocorrência existe como linha viva"* e *"o histórico vem de
`completed_at` das linhas consumidas"*. Logo:

- Ao concluir uma ocorrência recorrente **ativa**, a linha atual fica `completed_at` (vira histórico)
  e nasce **uma nova linha** para a próxima ocorrência (herda título/descrição/prioridade/lista/tipo;
  `due_date`/`due_time` = próxima data; subtarefas recriadas **não-concluídas**).
- A regra (`task_recurrences`, `UNIQUE`/1:1 com a tarefa viva) é **realocada** para a nova linha
  (`UPDATE task_recurrences SET task_id = <nova>`). `anchor_date` **não muda** (série estável em
  `fixed`).
- Tudo na **mesma transação** da conclusão (reusa `_complete_task_on_cursor`).

Descartado: "reusar a mesma linha" (limpando `completed_at` e bumpando a data) — perderia o histórico
de conclusões (só guardaria a última), contrariando a master.

## Decisão 3 — Algoritmo de próxima ocorrência (o coração)

Dados no momento da conclusão: `rrule`, `anchor_date` (DTSTART), `mode`, `current_due` (data da linha
viva, possivelmente reagendada), `completed_on` (= hoje).

**Modo `fixed`** (a série é totalmente determinada por RRULE+âncora; reagendamento pontual não move a
âncora):

1. `O` = maior ocorrência da RRULE **≤ `current_due`** (`rule.before(current_due, inc=True)`); se não
   houver (ex.: `current_due` < âncora), `O = anchor_date`. — isto recupera a ocorrência **lógica**
   mesmo quando a linha foi reagendada (a âncora manda, não o `due_date` mexido).
2. `ref = max(O, completed_on)`.
3. **próxima** = primeira ocorrência da RRULE **estritamente após `ref`** (`rule.after(ref,
   inc=False)`), usando `dtstart = anchor_date`.

**Modo `after_completion`** (re-ancora na conclusão real):

- **próxima** = primeira ocorrência da RRULE estritamente após `completed_on`, usando
  `dtstart = completed_on` (`rule.after(completed_on, inc=False)`). A âncora original é ignorada para o
  passo (mantida só para referência/descrição).

**Fim natural da série**: se `rule.after(...)` retorna `None` (RRULE com `COUNT`/`UNTIL` esgotado),
`next_occurrence` retorna `None` → não gera, desativa a regra.

> Recorrência opera em **datas civis** (`DATE`); internamente converte para `datetime` à meia-noite só
> para usar a API do dateutil, e volta para `date`. Imune a DST.

## Tabela-verdade dos 9 edge cases

Convenção dos exemplos: "todo dia 5" = `FREQ=MONTHLY;BYMONTHDAY=5`, âncora `2026-06-05`; "toda segunda"
= `FREQ=WEEKLY;BYDAY=MO`, âncora `2026-06-01` (segunda).

| # | Edge case (master) | Entrada | `next_occurrence` | Efeito na persistência |
|---|---|---|---|---|
| 1 | Reagendar + completar (`fixed`) | "toda segunda", `current_due`=2026-06-02 (ter, reagendada), `completed_on`=2026-06-02 | O=2026-06-01; ref=2026-06-02; próxima=**2026-06-08** (segunda) | nova linha 08/06; âncora intacta |
| 2 | Completar adiantado (`fixed`) | "todo dia 5", `current_due`=2026-06-05, `completed_on`=2026-06-03 | O=2026-06-05; ref=2026-06-05; próxima=**2026-07-05** | nova linha 05/07 |
| 3 | Completar atrasado (`fixed`) | "todo dia 5", `current_due`=2026-06-05, `completed_on`=2026-06-20 | O=2026-06-05; ref=2026-06-20; próxima=**2026-07-05** | **uma** nova linha; puladas não acumulam |
| 3b | Diária atrasada (`fixed`) | "todo dia", âncora 06-01, `completed_on`=2026-06-20 | ref=2026-06-20; próxima=**2026-06-21** | uma nova linha; sem backlog |
| 4 | Modo `after_completion` | "a cada 3 dias", `completed_on`=2026-06-10 | dtstart=10/06; próxima=**2026-06-13** | nova linha 13/06 a partir da conclusão real |
| 5 | Fim de série ("complete forever") | flag `end_series=True` | (não calcula) | conclui a atual; `active=FALSE`; **não** gera; regra preservada |
| 6 | Subtarefas resetam | recorrente com subtarefas concluídas regenera | — | nova linha recebe cópias das subtarefas **não-concluídas** |
| 7 | Futuras não materializadas | qualquer série viva | — | só a próxima existe como linha; futuras são virtuais (projeção em calendário é da 013) |
| 8 | Editar a regra com ocorrência aberta | troca de RRULE com linha viva aberta | — | `tasks.due_date` da linha viva **fica**; só `task_recurrences` muda; nova regra vale da próxima geração |
| 9 | Excluir recorrente | `scope=this` \| `scope=series` | `this`: calcula próxima e gera; `series`: não gera | `this`: soft-delete + gera; `series`: soft-delete + `active=FALSE` |
| extra | Série esgotada (`COUNT`/`UNTIL`) | última ocorrência concluída | `None` | não gera; `active=FALSE`; sem erro |

## Decisão 4 — Parsing determinístico de datas pt-BR (webapp)

`webapp/frontend/src/lib/parseDate.ts` reconhece, sem LLM, no fuso `America/Sao_Paulo`:

- relativos: `hoje`, `amanhã`/`amanha`, `depois de amanhã`;
- dias da semana: `seg|ter|qua|qui|sex|sab|dom` e por extenso (`segunda`..`domingo`) → **próxima
  ocorrência futura** desse dia; `próxima <dia>` força a semana seguinte;
- `DD/MM` (e `DD/MM/AAAA`);
- hora: `9h`, `17h`, `17:30`, `9:00` (hora exige uma data no mesmo input; hora órfã é ignorada).

O parser devolve `{due_date, due_time, matchedRanges}` para o ParseMirror destacar o trecho
(classe `tok-date`). Casos exóticos ("daqui a duas terças", "todo dia útil") ficam para o canal
Telegram (NLP) — não bloqueiam a fatia. A semântica de "próxima ocorrência futura" é a **mesma** que a
Kaguya usa ao resolver ambiguidade (FR-011), garantindo paridade de comportamento entre canais.

## Decisão 5 — Recorrência no Telegram via instrução do agente (NLP)

Sem ferramenta nova de parsing no Telegram: a Kaguya (Gemini) interpreta "toda segunda"/"todo dia 5"/
"a cada 3 dias"/"todo ano", monta a RRULE (via os mesmos presets de `build_rrule`) e passa
`recurrence={rrule, mode}` para `create_task`/`update_task`. A resposta **ecoa** `describe_rrule(...)`
em português ("Recorrência: toda segunda, a partir de 16/06"). Exclusão de recorrente: a Kaguya
**pergunta** "só esta ocorrência ou a série inteira?" e chama `delete_task(scope=...)`.

## Decisão 6 — Aniversário = recorrência anual pelo mesmo motor

`type=birthday` + `due_date` → `create_task` cria automaticamente uma regra
`build_rrule(freq="YEARLY")` (`FREQ=YEARLY`), modo `fixed`, âncora = `due_date`. Nada de caminho
especial de geração: aniversário regenera pelo mesmo `next_occurrence`.
