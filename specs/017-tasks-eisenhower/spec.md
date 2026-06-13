# Feature Specification: Matriz de Eisenhower — view derivada (fatia 017) do Sistema de Tarefas Próprio

**Feature Branch**: `017-tasks-eisenhower`

**Created**: 2026-06-13

**Status**: Planejada — não implementada. Hoje a view `eisenhower` existe no enum `KaguyaView` e na
sidebar, mas `KaguyaShell.tsx` renderiza só o placeholder *"A matriz de Eisenhower chega numa fase
futura."* Fonte de design:
`docs/claude_design/design_handoff_kaguya_tarefas/README.md` (§6.5) + protótipo
`docs/claude_design/design_handoff_kaguya_tarefas/kaguya/screens-cal.jsx` (`EisenhowerScreen`, `QUADS`).

**Spec master**: [`specs/010-kaguya-tasks-app/`](../010-kaguya-tasks-app/spec.md) — a Eisenhower é
prevista na master como **view derivada de prioridade × urgência** (ver tabela de capacidades e
**FR-018**, "Fase 2+"). Esta fatia a especifica em detalhe. Constrói sobre as Fases 1/2 (datas e
prioridades já existem). O frontend segue o **guia canônico**
[`frontend-design-guide.md`](../010-kaguya-tasks-app/frontend-design-guide.md) + o
[`design-guide.md`](design-guide.md) desta fatia.

**Input**: "Matriz de Eisenhower (2×2) como view **derivada** de prioridade × urgência. Não é campo
novo nem tabela nova — é uma forma de ver e ajustar tarefas existentes. Arrastar entre quadrantes
ajusta os campos derivados (prioridade e data). Paridade: webapp é a view; o Telegram tem o relato
textual equivalente."

---

## Escopo da fatia

**Entra na 017** (sem schema novo — deriva de campos já existentes):

- **View 2×2** com 4 quadrantes derivados de **urgência × importância**:
  - **Faça agora** (urgente + importante) — lacre `--p-high`
  - **Agende** (importante, não urgente) — dourado `--p-med`
  - **Resolva rápido** (urgente, não importante) — ardósia `--p-low`
  - **Depois** (nem urgente, nem importante) — neutro `--ink-4`
- **Classificação derivada** (sem coluna nova): **urgente** = tem `due_date` e vence em **≤2 dias**;
  **importante** = `priority ≥ 2` (média ou alta).
- **Drag entre quadrantes ajusta os campos de origem** (não inventa um campo "quadrante"): mover para
  um quadrante importante **sobe** a prioridade; para não importante, **baixa**; para urgente,
  **antecipa** a data; para não urgente, **empurra** a data. Reusa `update_task` (prioridade e
  `due_date` já existem).
- **Substituir o placeholder** atual da view por uma tela funcional.
- **Paridade** — a *matriz* visual é webapp-only; o equivalente no Telegram é o relato textual
  ("o que é urgente e importante?") sobre a mesma classificação.

**Fica para depois**: Meu Dia (fatia 016, se ainda não entregue); Command Palette / atalhos / lembretes
(fatia 018 / Fase 5). Sem novos campos, sem AI scheduling (out of scope da master).

**Sem migração de schema**: a Eisenhower é 100% derivada de `priority` e `due_date`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ver as tarefas priorizadas na matriz 2×2 (Priority: P1)

Abro a view **Eisenhower** e vejo minhas tarefas abertas distribuídas em quatro quadrantes conforme
urgência (vence em ≤2 dias) e importância (prioridade ≥ média). De relance entendo o que fazer agora,
o que agendar, o que resolver rápido e o que pode esperar — sem mudar nada nas tarefas, só uma nova
lente sobre os mesmos dados.

**Why this priority**: é o núcleo da fatia — a leitura. Sem a classificação correta e a grade, não há
o que arrastar. Sozinha já entrega a priorização visual.

**Independent Test**: com tarefas variando prioridade e proximidade de vencimento, abrir a view e
conferir que cada uma cai no quadrante certo (urgente×importante derivados das regras), e que tarefas
concluídas não aparecem.

**Acceptance Scenarios**:

1. **Given** uma tarefa `priority=3` que vence amanhã, **When** abro a Eisenhower, **Then** ela aparece em **Faça agora** (urgente + importante).
2. **Given** uma tarefa `priority=3` sem data (ou vence daqui a 10 dias), **When** vejo a matriz, **Then** ela cai em **Agende** (importante, não urgente).
3. **Given** uma tarefa `priority=0` que vence hoje, **When** vejo a matriz, **Then** ela cai em **Resolva rápido** (urgente, não importante).
4. **Given** uma tarefa `priority=0` sem data, **When** vejo a matriz, **Then** ela cai em **Depois**.
5. **Given** uma tarefa concluída, **When** abro a matriz, **Then** ela **não** aparece em nenhum quadrante.

---

### User Story 2 - Repriorizar arrastando entre quadrantes (Priority: P2)

Arrasto uma tarefa de **Depois** para **Faça agora** e o sistema entende que quero torná-la urgente e
importante: sobe a prioridade e antecipa a data. Não preciso abrir o formulário — a matriz é uma forma
de **editar** prioridade e prazo de um jeito visual e direto.

**Why this priority**: transforma a matriz de leitura em ação. Depende da classificação (US1).

**Independent Test**: arrastar uma tarefa entre quadrantes e verificar que `priority` e/ou `due_date`
mudam conforme as regras, e que ela passa a aparecer no quadrante de destino ao reclassificar.

**Acceptance Scenarios**:

1. **Given** uma tarefa em **Depois** (`priority<2`, sem urgência), **When** a arrasto para **Faça agora**, **Then** a prioridade sobe para ≥ média (2) **e** a data é antecipada para dentro de ≤2 dias.
2. **Given** uma tarefa importante em **Agende**, **When** a arrasto para **Resolva rápido** (não importante), **Then** a prioridade **baixa** (para 1) e a data é antecipada (urgente).
3. **Given** uma tarefa urgente, **When** a arrasto para um quadrante **não urgente**, **Then** a data é **empurrada** para além de 2 dias.
4. **Given** um drag que não muda nada (já estava no quadrante), **When** solto, **Then** nenhuma atualização é feita (sem patch vazio).
5. **Given** uma repriorização feita na matriz, **When** abro a mesma tarefa na Lista ou no Telegram, **Then** a nova prioridade/data estão lá (é o mesmo dado — paridade).

---

### Edge Cases

- **Matriz é view, não campo**: não existe coluna "quadrante". O quadrante é **sempre** derivado de
  `priority` + `due_date` no momento da leitura; mover entre quadrantes só altera esses dois campos.
- **Tarefa sem data**: nunca é "urgente" (urgência exige `due_date`). Some das colunas urgentes.
- **Mover para urgente uma tarefa sem data**: ganha `due_date` = amanhã (entra na janela ≤2 dias).
- **Mover para não-urgente uma tarefa que vence hoje/amanhã**: a data é empurrada (ex.: +5 dias) para
  sair da janela de urgência — o usuário pode reajustar a data exata depois no TaskModal.
- **Recorrente na matriz**: aparece pela ocorrência viva (uma linha). Reclassificar ajusta a ocorrência
  atual; a recorrência (regra) não é tocada aqui.
- **Subtarefas**: a matriz mostra tarefas-pai (consistente com a Lista); subtarefas seguem dentro da
  parent (decisão de UI — manter simples nesta fatia).
- **Empate de ordenação dentro do quadrante**: ordenar por `due_date` ascendente, depois por
  prioridade descendente (do protótipo).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001** (≡ master FR-018): O sistema MUST oferecer a **view Eisenhower** como uma grade 2×2
  **derivada** de prioridade × urgência, sobre as mesmas tarefas (sem duplicar dado), substituindo o
  placeholder atual.
- **FR-002**: A classificação MUST ser derivada na leitura: **urgente** = `due_date` presente e
  vencendo em **≤2 dias** (a partir de hoje, fuso `America/Sao_Paulo`); **importante** =
  `priority ≥ 2`. Os 4 quadrantes são as combinações dessas duas dimensões.
- **FR-003**: A matriz MUST listar apenas tarefas **abertas** (não concluídas, não excluídas).
- **FR-004**: Arrastar uma tarefa entre quadrantes MUST **ajustar os campos de origem** via
  `update_task`, conforme as regras:
  - destino **importante** e `priority < 2` → `priority = 2`;
  - destino **não importante** e `priority ≥ 2` → `priority = 1`;
  - destino **urgente** e tarefa não vence em ≤2 dias → `due_date = amanhã`;
  - destino **não urgente** e tarefa vence em ≤2 dias → `due_date = hoje + 5`.
  Nenhum campo "quadrante" é persistido. Um drag que não altera nada **não** gera atualização.
- **FR-005** (paridade): A classificação MUST ser a mesma nos dois canais (mesma régua na camada de
  lógica/utilitário compartilhado). A *grade* visual é webapp-only; o equivalente no Telegram é o
  relato textual por quadrante ("o que é urgente e importante?").

### Key Entities

Nenhuma entidade ou coluna nova. Usa os campos existentes da **Tarefa** (`tasks.priority`,
`tasks.due_date`). A classificação de quadrante é uma **função derivada** — candidata a um utilitário
compartilhado (front + camada de lógica) para garantir a mesma régua nos dois canais.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Para um conjunto de tarefas com prioridade/data variadas, a classificação coloca cada
  uma no quadrante correto segundo as regras de FR-002 — coberto por teste da função de classificação
  (pura).
- **SC-002**: Arrastar entre quadrantes altera `priority`/`due_date` exatamente conforme FR-004, e a
  tarefa some/aparece nos quadrantes coerentes ao reclassificar — teste de integração.
- **SC-003**: A view não cria nenhuma coluna/tabela nova — a Eisenhower é 100% derivada (verificável:
  schema inalterado).
- **SC-004**: A mesma classificação é obtida pelos dois canais (auditável por checklist de paridade).

## Assumptions

- **Urgente = vence em ≤2 dias** e **importante = prioridade ≥ média (2)** — réguas do protótipo
  (`isUrgent`/`isImportant` em `screens-cal.jsx`). Distintas da régua "vence em breve ≤7 dias" das
  Sugestões da fatia 016.
- O empurrão de data ao tirar a urgência usa **+5 dias** e a antecipação usa **amanhã** (do
  protótipo); são heurísticas de conveniência — o usuário ajusta a data fina no TaskModal.
- A matriz mostra tarefas-pai; subtarefas ficam dentro da parent (não como cards próprios na grade).
- A view é **webapp-only** por natureza visual; a paridade no Telegram é o relato textual por
  quadrante (sem grade).
- `update_task` já aceita `priority` e `due_date` (Fases 1/2) — esta fatia **não** precisa de novos
  campos nem, em princípio, de endpoint novo (a classificação roda no front sobre `list_tasks`; um
  utilitário compartilhado garante a paridade da régua).
