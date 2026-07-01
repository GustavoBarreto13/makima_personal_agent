# Phase 0 — Research & Decisions: Metas (Kaguya)

Resolve os pontos deixados para o planejamento pela spec/assumptions. Não há
`NEEDS CLARIFICATION` no Technical Context (stack e padrões já conhecidos do repo). As
decisões abaixo fecham as questões de *modelo de dados/vínculo* e *cálculo de progresso*.

---

## D1 — Modelo do vínculo Meta↔Movimento e cardinalidade

**Decision**: Um item de execução aponta para a meta por uma **coluna `goal_id`** (FK nullable)
na própria tabela do item — `tiny_experiments`, `tasks` e `habits` — com
`REFERENCES goals(id) ON DELETE SET NULL`. A cardinalidade "um item pertence a **no máximo uma**
meta" (Assumptions) é imposta naturalmente por um único valor de coluna. Vincular = setar
`goal_id`; desvincular = setar `NULL`; reatribuir = sobrescrever.

**Rationale**: O requisito de cardinalidade exclusiva torna a coluna `goal_id` a modelagem mais
enxuta e correta (Princípio V) — sem tabela de junção, sem guardas para impedir múltiplos vínculos.
`ON DELETE SET NULL` entrega diretamente a FR-010/SC-005 ("excluir a meta desvincula, nunca apaga
os itens"). É também o gancho **D5** que a 029 reservou explicitamente
("a spec 030 adicionará a coluna opcional `goal_id` à `tiny_experiments`"). A coluna é adicionada de
forma **idempotente** (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`) às três tabelas.

**Alternatives considered**:
- *Tabela polimórfica `goal_links(goal_id, item_type, item_id)`* — necessária se um item pudesse
  pertencer a várias metas (N:N). Como a cardinalidade é 1, ela só adicionaria uma tabela e um
  índice único `(item_type, item_id)` para *reimpor* a exclusividade que a coluna já garante de
  graça. Rejeitada (YAGNI / Princípio V). Se no futuro a cardinalidade virar N:N, migra-se para
  essa tabela sem quebrar a UI (o agregador de movimentos é o único ponto de leitura).

---

## D2 — Cálculo do progresso (métrica + marcos)

**Decision**: Progresso é **calculado na leitura** por um motor puro `goal_progress.py` (sem banco),
combinando duas dimensões independentes, cada uma em `[0,100]`:
- **métrica**: `metric_pct = min(100, round(100 * atual / alvo))` quando há `metric_target > 0`
  (valor acima do alvo satura em 100 sem erro — FR-012/edge case; o excedente pode ser exibido).
- **marcos**: `milestones_pct = round(100 * concluídos / total)` quando há ≥1 marco.
- **progresso combinado** (`progress_pct`): média das dimensões presentes —
  ambas → `round((metric_pct + milestones_pct) / 2)`; só uma → aquela; **nenhuma** → `None`
  (meta direcional/qualitativa: o progresso só se resolve no desfecho da revisão — edge cases).

**Rationale**: Média simples das dimensões presentes é transparente, satisfaz o SC-003 (reflete
*ambas* quando existem) e trata os três casos de borda da spec (só métrica, só marcos, nenhuma)
sem exceção. Puro e determinístico ⇒ testável isoladamente (gate espelhando
`experiment_adherence`). Nada persistido — a fonte da verdade é `metric_current` + as linhas de
`goal_milestones`.

**Alternatives considered**:
- *Peso configurável entre métrica e marcos* — flexível, mas exige um parâmetro por meta sem ganho
  claro para uso pessoal. Rejeitada (enxuto).
- *Persistir `progress_pct`* — desnormalização que precisa de recálculo a cada mutação de métrica/
  marco. Rejeitada — calcular na leitura é trivial e sempre consistente.

---

## D3 — Área da vida

**Decision**: **Etiqueta de texto livre** opcional — coluna `life_area TEXT` (nullable) em `goals`.
O agrupamento/contagem por área (FR-003/SC-006) é um `GROUP BY life_area` (metas sem área caem no
grupo "sem área"). Sem tabela de áreas nem taxonomia fixa.

**Rationale**: As Assumptions dizem explicitamente que a área é "uma etiqueta simples e opcional",
sem os 12 domínios ACT estruturados. Uma coluna de texto entrega o agrupamento e a contagem sem
infra nova (Princípio V). A UI pode oferecer as áreas já usadas como sugestões (distinct).

**Alternatives considered**: tabela `life_areas` com FK — permitiria renomear em massa e cor por
área, mas é excesso para uma etiqueta pessoal. Rejeitada.

---

## D4 — Exclusão da meta e semântica de desvínculo

**Decision**: Excluir uma meta é **hard delete** da linha em `goals` (a UI confirma antes). Os
**marcos** somem por `ON DELETE CASCADE` (`goal_milestones.goal_id`). Os **itens vinculados** são
**desvinculados** automaticamente por `ON DELETE SET NULL` na coluna `goal_id` de cada tabela —
os itens continuam existindo intactos nas suas seções (FR-007/FR-010/SC-005).

**Rationale**: Espelha o hard delete dos experimentos (029/D3): metas não têm "lixeira" nesta
fatia. As duas cláusulas de FK (`CASCADE` para marcos, `SET NULL` para itens) fazem o Postgres
garantir a semântica pedida sem código extra.

**Alternatives considered**: soft delete (`deleted_at`) — exigiria filtros em toda query sem
entregar restauração (não há UI de lixeira de metas). Rejeitada.

---

## D5 — Revisão / encerramento e vínculos históricos

**Decision**: Estados `active → closed` (terminal nesta fatia). A revisão grava `outcome`
(`achieved` | `missed` | `revise`) + `review` (aprendizado) e seta `status = 'closed'`. Permite
**encerramento antecipado** (antes do prazo — FR-014). Os **vínculos históricos são preservados**:
como o vínculo é a coluna `goal_id` no item, encerrar (não excluir) a meta **mantém** os `goal_id`
apontando para ela, então o detalhe da meta encerrada continua listando os movimentos que a
serviram (FR-014/SC-004). Um item vinculado a uma meta encerrada continua "ocupando" seu único
vínculo até ser re-vinculado a outra meta (a cardinalidade de D1 considera metas ativas e
encerradas — o usuário re-vincula explicitamente se quiser mover o item).

**Rationale**: Espelha a revisão dos experimentos (029/US2). Preservar `goal_id` no encerramento é
o que torna o histórico consultável sem uma tabela de "vínculos arquivados".

---

## D6 — "Hoje"/prazo e fuso

**Decision**: Toda derivação de data usa **`America/Sao_Paulo` (UTC-3)** — no backend via
`datetime.now(ZoneInfo("America/Sao_Paulo")).date()` (helper `_today()`, idêntico ao de
`tools_experiments`), no frontend via `lib/dateUtils`. `is_overdue = status='active' AND hoje >
deadline`; `days_remaining = deadline - hoje` (FR-016/FR-017). Nunca `CURRENT_DATE` /
`toISOString().slice(0,10)`.

**Rationale**: Regra de fuso mandatória no projeto (`CLAUDE.md` raiz; bug histórico da Violet).

---

## D7 — Criar experimento já vinculado (FR-011)

**Decision**: A partir do detalhe da meta, "novo experimento" abre o `ExperimentModal` recebendo um
`goalId` de contexto. O fluxo é: **criar** o experimento (fluxo 029 intacto) e, em seguida,
**vincular** via `link_movement(goal_id, 'experiment', new_id)` — dois passos no cliente, atômico o
suficiente para uso pessoal. A camada de lógica da 029 **não muda** (o INSERT de `create_experiment`
continua sem `goal_id`; a coluna nasce `NULL` e é preenchida pelo link).

**Rationale**: Mantém a 029 self-contained e sem regressão (Princípio III). O link é uma única
tool de 030 (`link_movement`) que serve tanto ao vínculo manual (US2) quanto ao pré-vínculo (FR-011).

**Alternatives considered**: adicionar `goal_id` como parâmetro a `create_experiment` — acopla a 029
à 030 sem ganho real (o link separado já resolve). Rejeitada.

---

## D8 — Exposição ao agente ADK (Telegram)

**Decision**: **Não** registrar tools de meta em `agents/kaguya/agent.py` nesta fatia (webapp-first,
igual à 029/D6). A fachada `tools.py` re-exporta as funções (para o webapp) e deixa o comentário
marcando o ponto de extensão futuro.

**Rationale**: Decisão do usuário (webapp primeiro). A lógica nasce agnóstica de canal.

---

## Padrões reutilizados (sem pesquisa nova — já mapeados no repo)

- Conexão/transações: `agents/db.py` → `get_conn()` (commit/rollback) e `run_select()`.
- Motor puro testável: `experiment_adherence.py` (espelho direto para `goal_progress.py`).
- Camada de lógica: `tools_experiments.py` (serialização de datas, sentinela `_UNSET`, `_today()`
  UTC-3, mutações `{"status": ...}` vs listagens diretas).
- Schema idempotente: `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ADD COLUMN IF NOT EXISTS`
  + índice parcial (`agents/kaguya/schema_tasks_pg.sql`).
- Router REST: `Depends(require_user)`, modelos Pydantic, `_check_result` só em mutações; rotas
  estáticas antes das paramétricas (`webapp/CLAUDE.md`).
- Frontend: `view`/`param` na `KaguyaShell`; `kaguyaApi` tipado; tokens `--kg*`; `DatePicker`,
  `lib/dateUtils`; carregamento silencioso (`firstLoad` ref) em telas que recarregam.
