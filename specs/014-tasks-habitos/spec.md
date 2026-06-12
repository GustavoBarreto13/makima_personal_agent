# Feature Specification: Hábitos — Fase 4 (fatia 014) do Sistema de Tarefas Próprio

**Feature Branch**: `014-tasks-habitos`

**Created**: 2026-06-12

**Status**: Implementado — P1 (backend: motor de força + CRUD + check-ins + paridade Telegram) e
P2 (UI webapp: HabitsScreen + HabitModal + heatmap anual) entregues. Motor puro:
`agents/kaguya/habit_strength.py`. Camada de lógica: `agents/kaguya/tools_habits.py`. Fachadas:
router `/api/tasks/habits/*` e tools no agente (`check_in_habit`, `habit_status`). UI:
`HabitsScreen`/`HabitModal`/`HabitHeatmap` + entrada na sidebar. Gates:
`tests/agents/test_kaguya_habit_strength.py` (puro, SC-006) e `tests/agents/test_kaguya_habits.py`
(integração).

**Spec master**: [`specs/010-kaguya-tasks-app/`](../010-kaguya-tasks-app/spec.md) — esta é a spec
filha da **Fase 4** ("hábitos" da master). O schema (`habits`, `habit_checkins`) e os princípios
(paridade de canais, soft delete, fuso `America/Sao_Paulo`, single-user) estão definidos lá e em
[`data-model.md`](../010-kaguya-tasks-app/data-model.md). **Nota sobre a métrica**: a master
esboçou a força pela fórmula Loop; esta fatia **implementa o modelo "caixa d'água"** (EMA de peso
fixo reescalada pela meta + 3 dimensões — ver abaixo), que substitui aquele esboço. O frontend
segue o **guia canônico** [`frontend-design-guide.md`](../010-kaguya-tasks-app/frontend-design-guide.md).

**Input**: User description: "User Story 4 da master 010 — Hábitos com força que perdoa falhas.
Tabelas já nasceram dormentes na Fase 1 (habits, habit_checkins) — SEM migração de schema; só
lógica, fachadas (router /api/tasks/habits/* + agente Telegram) e UI. Força calculada na leitura
(fórmula Loop, anti-streak). Check-ins diários, inclusive mensuráveis. Heatmap anual no webapp.
Paridade total Telegram ⇄ webapp."

---

## Escopo da fatia

**Entra na 014** (tabelas já existem no banco desde a Fase 1):

- **Motor de score** (`habit_strength.py`) — função pura (sem banco) com o modelo **"caixa
  d'água"**: uma média móvel exponencial (EMA) de **peso fixo** (`peso=0.1`, histórico pesa 90%)
  reescalada pela meta semanal (`esperado = min(meta/7, 1)`). Expõe **3 dimensões**:
  **consistência** (0–100), **tendência** (subindo/caindo/estável, via 2 EMAs rápida/lenta) e
  **recente** (cumpridos nas últimas 2 semanas). Calculado **na leitura**, nunca persistido. Gate
  automatizado do SC-006.
- **CRUD de hábitos** (`tools_habits.py`) — criar/editar/arquivar (soft delete por `archived_at`),
  com frequência alvo (`freq_num`/`freq_den`) e tipo sim/não **ou** mensurável (`target_value`+`unit`).
- **Check-ins** — um por dia por hábito (`UNIQUE (habit_id, date)`, upsert para corrigir valor);
  mensurável conta como cumprido quando `value >= target_value`.
- **Heatmap anual** — endpoint de histórico esparso + componente `HabitHeatmap` (porta do heatmap
  da Frieren), com classes/tokens próprios do domínio Kaguya.
- **Paridade total** — toda capacidade nasce na camada de lógica; o Telegram (`check_in_habit` por
  nome, `habit_status`) e o router `/api/tasks/habits/*` são fachadas finas. O heatmap é
  webapp-only (visual); o equivalente Telegram é o relato textual das 3 dimensões.

**Fica para depois**: lembretes proativos de hábito via Telegram (Fase 5); estatísticas avançadas
e metas semanais; Eisenhower e Meu Dia rico (fases próprias). Sem gamificação (decisão da master:
a motivação vem da força anti-streak, não de pontos).

**Sem migração de schema**: `habits` e `habit_checkins` já nasceram na Fase 1. Esta fatia só
acrescenta lógica, fachadas e UI.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Construir hábitos com score que perdoa falhas (Priority: P1)

Registro hábitos ("meditar", "ler 20 páginas") com uma frequência alvo (ex.: 5x por semana) e faço
check-ins diários, inclusive com valor mensurável. O sistema mostra a **consistência** (0–100) —
uma métrica "caixa d'água" que cresce com o hábito e decai suavemente com falhas, em vez de um
streak que zera num dia ruim — além da **tendência** (📈/📉/➡️) e do **recente** ("5/6 nas últimas
2 semanas"). Faço tudo por qualquer canal: pelo Telegram ("fiz minha meditação hoje") ou pelo
webapp (botão de check-in na tela de Hábitos).

**Why this priority**: é o núcleo do módulo — sem o motor de score e o check-in nos dois canais, o
resto não existe. Sozinha, já entrega o diferencial anti-streak.

**Independent Test**: criar um hábito, simular uma sequência de check-ins com uma falha isolada e
verificar que a consistência segue o modelo e permanece alta; fazer check-in pelo Telegram e
ver o estado refletido no webapp.

**Acceptance Scenarios**:

1. **Given** um hábito 3x/semana cumprido exatamente 3x na semana, **When** o usuário vê o hábito, **Then** a consistência chega a ~100 (a régua se ajusta à meta; os dias de folga não punem).
2. **Given** um hábito mensurável "ler 20 páginas", **When** o usuário faz check-in com valor 25, **Then** o check-in registra o valor e conta como cumprido (25 ≥ 20).
3. **Given** um hábito consistente, **When** o usuário falha um único dia, **Then** a consistência cai só um pouco e continua alta (anti-streak — SC-006).
4. **Given** um hábito criado pelo webapp, **When** o usuário pergunta à Kaguya "como está meu hábito de meditar?", **Then** a resposta traz consistência + tendência + recente — o mesmo dado do webapp (paridade).
5. **Given** o check-in de hoje já feito, **When** o usuário desfaz, **Then** o cumprimento de hoje some e a consistência recalcula.

---

### User Story 2 - Ver o histórico em heatmap anual (Priority: P2)

Abro o hábito e vejo um **heatmap anual** dos dias cumpridos — uma grade por mês, com a intensidade
da célula refletindo o cumprimento (sim/não) ou o quanto da meta foi alcançado (mensurável). Vejo
de relance a regularidade do hábito ao longo do ano.

**Why this priority**: é a leitura visual que fecha o ciclo de feedback; depende só do histórico de
check-ins (US1). É webapp-only por natureza visual.

**Independent Test**: com um ano de check-ins, abrir o hábito e conferir que o heatmap posiciona
cada dia no lugar certo (alinhamento por dia da semana) e colore pela intensidade correta.

**Acceptance Scenarios**:

1. **Given** um ano de check-ins, **When** o usuário expande o hábito, **Then** vê um heatmap anual com os dias cumpridos coloridos por mês.
2. **Given** um hábito mensurável, **When** o usuário vê o heatmap, **Then** a cor da célula reflete a proporção do valor em relação à meta.
3. **Given** um dia sem check-in, **When** o usuário olha o heatmap, **Then** a célula aparece "vazia" (nível base), mantendo a grade contínua.

---

### Edge Cases

- **Dia perdido não zera**: a força é uma média móvel exponencial — uma falha isolada num histórico
  consistente causa só um pequeno arranhão, nunca um reset (diferencial central, SC-006).
- **Um check-in por dia**: a constraint `UNIQUE (habit_id, date)` garante um registro por dia;
  refazer o check-in do mesmo dia **atualiza** o valor (upsert) em vez de estourar.
- **Mensurável abaixo da meta**: registrar `value < target_value` guarda o valor mas **não** conta
  como cumprido (o dia não soma força nem fica "feito hoje").
- **Hábito arquivado**: arquivar (soft delete por `archived_at`) tira o hábito das listas mas
  **preserva** o histórico; reativar traz a força de volta calculada sobre os check-ins antigos.
- **Frequência inválida**: `freq_num > freq_den` é rejeitado na camada de lógica (mesma invariante
  da CHECK do schema) com erro amigável — nunca um IntegrityError 500.
- **Ano sem check-ins**: o heatmap de um ano vazio desenha a grade toda em nível base, sem quebrar.
- **Hábito menos frequente perdoa mais**: a frequência alvo entra na régua (`esperado`) — um
  hábito 3x/semana estabiliza num nível cru menor e os dias de folga **não** contam como falha
  (cobrar todo dia seria injusto). Por isso 3 de 3 dá consistência ~100, igual a 7 de 7 num diário.
- **Oscilação não derruba a nota**: o nível "cru" da caixa oscila (sobe ao cumprir, vaza nas
  folgas), mas a **consistência** (0–100) fica estável porque a divisão por `esperado` já espera
  esse nível baixo. A nota só muda de patamar quando o **padrão real** muda (cair de 3x para 2x).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001** (≡ master FR-021): O usuário MUST poder criar hábitos com frequência alvo
  (`freq_num`/`freq_den`, ex.: 5/7 = "5x por semana") e fazer check-ins diários, opcionalmente com
  valor mensurável (`target_value`+`unit`).
- **FR-002** (≡ master FR-022): O sistema MUST calcular o score do hábito com decaimento suave —
  modelo **"caixa d'água"**: EMA de peso fixo (`peso=0.1`) reescalada pela meta
  (`esperado = min(meta_semanal/7, 1)`), nunca um streak que zera com uma falha. MUST expor as
  **3 dimensões**: consistência (0–100), tendência (subindo/caindo/estável) e recente (cumpridos
  nas últimas 2 semanas).
- **FR-003**: O score MUST ser **calculado na leitura** a partir de `habit_checkins` — nunca
  persistido (a tabela de check-ins é a única fonte da verdade).
- **FR-004**: O check-in MUST respeitar **um por dia por hábito**; refazer o do mesmo dia atualiza o
  valor (upsert). Mensurável conta como cumprido quando `value >= target_value`.
- **FR-005**: "Excluir" um hábito MUST ser **arquivar** (soft delete por `archived_at`), preservando
  o histórico; reativar é possível.
- **FR-006**: O sistema MUST oferecer um **heatmap anual** dos check-ins no webapp; a intensidade
  reflete cumprimento (sim/não) ou proporção da meta (mensurável).
- **FR-007** (paridade): Toda capacidade de hábitos (criar, editar, arquivar, check-in, consultar
  o score) MUST estar disponível e idêntica nos dois canais; a *view* de heatmap é webapp-only e
  seu equivalente no Telegram é o relato textual das 3 dimensões (consistência/tendência/recente).

### Key Entities

Definidas na master (`data-model.md`). Esta fatia ativa duas entidades que estavam adormecidas:

- **Hábito** (`habits`): `name`, `icon`, `color`, frequência (`freq_num`/`freq_den`), meta
  (`target_value`, `unit`) e `archived_at` (soft delete). `CHECK (1 ≤ freq_num ≤ freq_den)`.
- **Check-in** (`habit_checkins`): registro diário (`date`, `value`), `UNIQUE (habit_id, date)`,
  cascade ao excluir o hábito.

Consistência, tendência e recente são **métricas derivadas** (não colunas) — calculadas pelo
motor puro `habit_strength` (modelo caixa d'água).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001** (≡ master SC-006): A consistência de um hábito com bom histórico **permanece alta**
  após uma falha isolada (cai só ~o peso, não zera) — coberto por teste automatizado puro
  (`test_kaguya_habit_strength.py`).
- **SC-002**: A régua reescala pela meta: cumprir **3 de 3** num hábito 3x/semana dá consistência
  **~100** (igual a 7 de 7 num diário); fazer 2x/semana num hábito 3x/semana cai para **~67** —
  teste puro (tabela de referência).
- **SC-003**: Um hábito mensurável só conta o dia como cumprido quando `value >= target_value` —
  teste (puro + integração).
- **SC-004**: 100% das capacidades de hábitos executáveis pelos **dois canais**, com cada canal
  funcionando com o outro desligado (auditável por checklist de paridade).
- **SC-005**: O heatmap anual posiciona corretamente os check-ins por dia da semana e colore pela
  intensidade certa, sem quebrar com anos vazios.

## Assumptions

- O schema da Fase 1 (com `habits` e `habit_checkins`) já está aplicado em produção — esta fatia
  **não** altera o schema.
- O score é calculado na leitura pelo motor puro (`habit_strength`), com o modelo caixa d'água
  (que substitui o esboço Loop da master); nada é persistido além dos check-ins.
- "Hoje" usa `date.today()` (fuso do sistema, `America/Sao_Paulo`), consistente com `tools_tasks`.
- O heatmap é **webapp-only** por natureza visual; a paridade no Telegram é o relato das 3
  dimensões (`habit_status`), não uma grade.
- O `peso` da EMA é fixo em 0.1 (estável, perdoa muito); a frequência semanal usada pelo motor
  vem de `freq_num/freq_den*7` (a conversão fica na camada de lógica).
- Lembretes proativos de hábito ficam para a Fase 5 (decisão da master).
- Single-user: sem compartilhamento de hábitos.
