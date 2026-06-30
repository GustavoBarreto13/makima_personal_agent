# Phase 0 — Research & Decisions: Tiny Experiments (Kaguya)

Resolve os pontos deixados para o planejamento pela spec/clarificação. Não há
`NEEDS CLARIFICATION` no Technical Context (stack e padrões já conhecidos do repo). As
decisões abaixo fecham as questões de *método/algoritmo* e *política de dados*.

---

## D1 — Cálculo da aderência ("perdoa falhas")

**Decision**: Aderência = **razão simples** `períodos_cumpridos / períodos_esperados_decorridos`,
em [0,100]%, onde:
- `períodos_esperados_decorridos` = nº de períodos (dias na cadência diária; semanas na semanal)
  entre `start_date` e `min(hoje, end_date)`, **menos** os períodos em que o experimento esteve
  **pausado** (FR-017).
- `períodos_cumpridos` = nº de check-ins com `done = true` no intervalo.
- Calculada **na leitura** (nunca persistida), no motor puro `experiment_adherence.py`.

**Rationale**: Um experimento é **curto e com prazo** (≈1–4 semanas). Para esse horizonte, a
razão simples é transparente ("5 de 7 dias"), satisfaz o SC-003 (uma falha isolada só reduz a
proporção, nunca zera enquanto houver cumprimentos) e é trivial de testar. Não há necessidade
de ponderar recência.

**Alternatives considered**:
- *EMA "caixa d'água"* (como `habit_strength.py`): ótima para **hábitos contínuos** onde a
  recência importa e não há fim. Para um experimento finito ela adiciona complexidade
  (parâmetro de peso, 2 EMAs para tendência) sem ganho de clareza. Rejeitada — escopo enxuto.
- *Streak* (sequência): viola explicitamente o princípio "falha = dado" (uma falha zera).
  Rejeitada.

---

## D2 — Definição de "período" e fuso

**Decision**: Toda derivação de data usa **`America/Sao_Paulo` (UTC-3)** no SQL
(`(NOW() AT TIME ZONE 'America/Sao_Paulo')::date`) e no frontend via `lib/dateUtils`
(`todayISO`, partes locais), **nunca** `CURRENT_DATE`/`toISOString().slice(0,10)`.
- Cadência **diária**: `period_date` = o próprio dia.
- Cadência **semanal**: `period_date` = a **segunda-feira** da semana de calendário
  (segunda→domingo) — clarificação Q2. Normalização: `date - (ISODOW(date) - 1)` dias.

**Rationale**: Regra de fuso é mandatória no projeto (`CLAUDE.md` raiz; bug histórico da
Violet). A semana de calendário ancorada na segunda é simples de exibir e bate com o
vocabulário do usuário ("essa semana").

**Alternatives considered**: janelas de 7 dias a partir de `start_date` — rejeitada na
clarificação (menos intuitiva para exibir/raciocinar).

---

## D3 — Exclusão de experimento (destrutiva)

**Decision**: **Hard delete** do experimento com `ON DELETE CASCADE` nos check-ins
(`tiny_experiment_logs`). O endpoint DELETE exige confirmação explícita na UI antes de chamar.

**Rationale**: A spec (edge case) diz que ao excluir "o histórico de check-ins associado é
removido junto". O escopo enxuto **não** inclui uma "lixeira" de experimentos (diferente das
tarefas, que têm tela de Lixeira e por isso usam soft-delete). Sem UI de restauração, o
soft-delete só adicionaria colunas e filtros sem benefício. Hard delete + CASCADE é o mais
fiel e o mais simples.

**Alternatives considered**: soft-delete `deleted_at` (convenção das tarefas) — rejeitado:
exigiria filtros em todas as queries e contradiz "removido junto" sem entregar restauração.

---

## D4 — Pausar/retomar e contagem de períodos pausados

**Decision**: Estados `active` ⇄ `paused` (clarificação Q1). Para excluir do cálculo de
aderência os períodos pausados (FR-017) sem rastrear intervalos complexos:
- Coluna `paused_at DATE` (a data em que entrou em pausa; `NULL` quando ativo/concluído).
- Coluna `paused_period_days INTEGER NOT NULL DEFAULT 0` — acumulador de **dias** pausados.
- Ao **retomar**: `paused_period_days += (hoje - paused_at)` e `paused_at = NULL`.
- No cálculo: `períodos_esperados_decorridos` subtrai `paused_period_days` (diária) ou
  `paused_period_days / 7` arredondado (semanal). Se atualmente pausado, o intervalo
  `[paused_at, hoje]` também é descontado on-the-fly.

**Rationale**: Um acumulador + a data corrente de pausa capturam o tempo pausado com 2 colunas
simples, sem uma tabela de histórico de pausas. Suficiente para a precisão pretendida (escopo
enxuto).

**Alternatives considered**: tabela `tiny_experiment_pauses(start,end)` — mais precisa para
múltiplas pausas sobrepostas a relatórios, mas excessiva para o uso pessoal de um único
usuário. Rejeitada (YAGNI / Princípio V).

---

## D5 — Vínculo com Metas (spec 030)

**Decision**: **Fora desta fatia.** Não adicionar `goal_id` agora. A spec 030 (Metas)
adicionará a coluna opcional `goal_id` à tabela `tiny_experiments` via migração idempotente
(`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`) quando for implementada.

**Rationale**: A 029 é autossuficiente (um experimento é usável sem meta). Ordem de
implementação acordada: 029 → 030. Evita acoplamento prematuro.

---

## D6 — Exposição ao agente ADK (Telegram)

**Decision**: **Não** registrar tools de experimento em `agents/kaguya/agent.py` nesta fatia
(webapp-first). A fachada `tools.py` re-exporta as funções (para o webapp) e deixa um
comentário marcando o ponto de extensão futuro.

**Rationale**: Decisão do usuário (webapp primeiro). A lógica nasce agnóstica de canal, então
a fatia futura do Telegram só adiciona registro + instruções no `_INSTRUCTION`, sem refatorar.

---

## Padrões reutilizados (sem pesquisa nova — já mapeados no repo)

- Conexão/transações: `agents/db.py` → `get_conn()` (commit/rollback) e `run_select()`.
- Serialização de datas para ISO: padrão de `_serialize_task` (`tools_tasks.py`).
- Motor puro testável: `habit_strength.py` / `capacity.py` (espelho para `experiment_adherence.py`).
- Schema idempotente: `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ADD COLUMN IF NOT EXISTS`
  + índice parcial (`agents/kaguya/schema_tasks_pg.sql`).
- Router REST: `Depends(require_user)`, modelos Pydantic, `_check_result` só em mutações
  (`webapp/CLAUDE.md`).
- Frontend: `view`/`param` na `KaguyaShell`; `kaguyaApi` tipado; tokens `--kg*`; `DatePicker`,
  `kg-input`; `lib/dateUtils`; carregamento silencioso (`firstLoad` ref) em telas que recarregam.
