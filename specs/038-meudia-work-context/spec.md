# Feature Specification: Meu Dia com contexto Trabalho vs Pessoal (Kaguya)

**Feature Branch**: `038-meudia-work-context`

**Created**: 2026-07-06

**Status**: Draft

**Input**: User description: "Work separado no Meu Dia: dividir o Meu Dia em seções Trabalho e Pessoal, cada uma com sua própria barra de capacity. O contexto vem de uma flag na lista (não por tarefa), e calendários corporativos contam contra a capacity de trabalho."

## Visão geral

O Meu Dia (spec 016) planeja o dia num bloco único: uma capacity, uma lista de planos. Mas o
dia real do usuário tem duas naturezas — **trabalho** e **pessoal** — e misturá-las distorce
o planejamento: a capacity estoura por causa de reuniões corporativas enquanto as tarefas
pessoais parecem não caber, e vice-versa.

Esta spec divide o Meu Dia em **duas seções com capacity própria**. O contexto é definido no
nível da **lista** (uma lista é de trabalho ou pessoal; suas tarefas herdam) e no nível do
**calendário** (a agenda corporativa consome a capacity de trabalho). Quem prefere o
comportamento antigo tem um toggle de **visão única**.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Marcar listas (e calendários) como Trabalho (Priority: P1)

O usuário define, na configuração da lista, se ela é **Trabalho** ou **Pessoal** (padrão:
Pessoal). Todas as tarefas da lista herdam o contexto automaticamente — sem marcação
tarefa a tarefa. Da mesma forma, cada calendário conectado pode ser marcado como de
trabalho ou pessoal.

**Why this priority**: é a fonte do contexto — sem listas marcadas, a divisão do Meu Dia
(US2) não tem de onde vir.

**Independent Test**: marcar a lista "Projetos do escritório" como Trabalho e conferir que
suas tarefas contam como trabalho; mover uma tarefa dela para uma lista pessoal e conferir
que o contexto muda junto.

**Acceptance Scenarios**:

1. **Given** uma lista, **When** defino seu contexto como Trabalho, **Then** todas as suas
   tarefas passam a contar como trabalho — imediatamente, sem editar tarefa alguma.
2. **Given** uma tarefa numa lista de trabalho, **When** a movo para uma lista pessoal,
   **Then** ela passa a contar como pessoal (o contexto é sempre herdado da lista atual).
3. **Given** um grupo com várias listas, **When** aplico o contexto às listas do grupo (ação
   em massa), **Then** todas mudam de uma vez.
4. **Given** os calendários conectados, **When** marco um como de trabalho, **Then** seus
   eventos passam a contar contra a capacity de trabalho.
5. **Given** o Inbox, **When** consulto seu contexto, **Then** ele é sempre Pessoal (tarefas
   ganham contexto de trabalho ao serem movidas para uma lista de trabalho).

---

### User Story 2 - Meu Dia dividido com duas capacities (Priority: P1)

No Meu Dia, o usuário vê duas seções — **Trabalho** e **Pessoal** — cada uma com seus planos
do dia e sua **própria barra de capacity** (estimativas + eventos daquele contexto contra a
janela do dia). Assim ele responde separadamente "meu dia de trabalho cabe?" e "minha vida
pessoal cabe?". A timeline do dia continua única (o dia é um só).

**Why this priority**: é a entrega visível — o motivo do pedido.

**Independent Test**: com tarefas de listas work e personal no Meu Dia (com estimativas) e
eventos nos dois tipos de calendário, conferir que cada seção lista só os seus itens e que
cada barra soma só as suas estimativas/eventos.

**Acceptance Scenarios**:

1. **Given** tarefas de ambos os contextos no Meu Dia, **When** o abro, **Then** vejo as
   seções Trabalho e Pessoal, cada uma com seus itens.
2. **Given** estimativas e eventos nos dois contextos, **When** olho as barras, **Then**
   cada capacity considera apenas estimativas e eventos do seu contexto.
3. **Given** um dos contextos vazio, **When** abro o Meu Dia, **Then** a seção vazia se
   recolhe discretamente (sem poluir o dia de folga ou o fim de semana).
4. **Given** a timeline do dia, **When** a consulto, **Then** ela é única, com os blocos dos
   dois contextos.
5. **Given** o resumo do dia pelo Telegram, **When** o peço, **Then** ele menciona os dois
   blocos ("trabalho: X de Y; pessoal: Z de W").

---

### User Story 3 - Voltar à visão única quando eu quiser (Priority: P2)

Um toggle no Meu Dia alterna entre a visão dividida e a **visão única** (comportamento
atual: uma lista, uma capacity total). A escolha é lembrada.

**Why this priority**: rede de segurança da mudança — dias atípicos (férias, fim de semana)
ficam melhores sem a divisão.

**Independent Test**: alternar para visão única e conferir lista e capacity unificadas;
recarregar e conferir que a escolha persistiu; voltar à dividida.

**Acceptance Scenarios**:

1. **Given** a visão dividida, **When** alterno o toggle, **Then** vejo uma lista única e
   uma capacity total (soma dos dois contextos).
2. **Given** uma escolha de visão, **When** recarrego a página, **Then** a escolha persiste.

---

### Edge Cases

- **Inbox**: é sempre Pessoal e não pode ser marcada como Trabalho — o fluxo natural é a
  tarefa ganhar contexto ao ser processada/movida para uma lista (o clarify da spec 034
  cobre isso, quando existir).
- **Tarefa sem lista no Meu Dia** (se possível no modelo atual): conta como Pessoal.
- **Mudar o contexto de uma lista com tarefas já planejadas no Meu Dia**: os itens migram de
  seção imediatamente; nenhuma reconfiguração por tarefa.
- **Capacity estourada num contexto só**: cada barra sinaliza excesso de forma independente —
  estourar o trabalho não pinta o pessoal de vermelho.
- **Janela do dia**: a mesma janela de horas vale para os dois contextos na v1 (sem "horário
  comercial" separado).
- **Fim de semana / contexto vazio**: seção sem itens se recolhe; a visão única ignora a
  divisão por completo.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Toda lista MUST ter um contexto: **Pessoal** (padrão) ou **Trabalho**,
  definível na criação e na edição; o Inbox MUST ser sempre Pessoal.
- **FR-002**: O contexto de uma tarefa MUST ser **herdado da lista atual** — sem marcação
  por tarefa; mover de lista MUST atualizar o contexto na hora.
- **FR-003**: MUST existir ação em massa para definir o contexto das listas de um grupo.
- **FR-004**: Cada calendário conectado MUST poder ser marcado como Trabalho ou Pessoal
  (padrão: Pessoal); seus eventos MUST contar contra a capacity do seu contexto.
- **FR-005**: O Meu Dia MUST exibir seções separadas Trabalho e Pessoal, cada uma com seus
  planos e sua **capacity própria** (estimativas + eventos do contexto); seções vazias MUST
  se recolher.
- **FR-006**: As duas capacities MUST usar a mesma janela de horas do dia na v1; a soma das
  duas MUST equivaler à capacity total da visão única.
- **FR-007**: A timeline do dia MUST permanecer única, com os blocos de ambos os contextos.
- **FR-008**: MUST existir o toggle **visão única / dividida**, com a escolha lembrada entre
  sessões.
- **FR-009**: O resumo do dia no Telegram MUST refletir os dois blocos quando a visão
  dividida estiver ativa.
- **FR-010**: A mudança MUST ser retrocompatível: listas existentes nascem Pessoal e o Meu
  Dia continua funcional sem nenhuma lista de trabalho marcada.

### Key Entities *(include if feature involves data)*

- **Contexto da lista**: propriedade da lista/projeto — Pessoal ou Trabalho; fonte única do
  contexto das tarefas (herança, nunca cópia).
- **Contexto do calendário**: propriedade de cada calendário conectado — decide contra qual
  capacity seus eventos contam.
- **Capacity por contexto**: o cálculo de capacity existente, aplicado duas vezes com os
  insumos filtrados por contexto — não é um novo motor.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Marcar uma lista como Trabalho reclassifica 100% das suas tarefas no Meu Dia
  imediatamente, sem tocar em nenhuma tarefa.
- **SC-002**: Em qualquer cenário testado, capacity(trabalho) + capacity(pessoal) =
  capacity(visão única) — mesmos insumos, mesma janela.
- **SC-003**: Nenhum evento ou estimativa conta no contexto errado nos cenários de teste
  (listas e calendários mistos).
- **SC-004**: Com zero listas de trabalho, a experiência é indistinguível da atual
  (retrocompatibilidade verificada).
- **SC-005**: O resumo do Telegram menciona os dois blocos com os mesmos números exibidos no
  webapp.

## Assumptions

- **Contexto na lista, não na tarefa** — decisão de produto de 2026-07-06: evita divergência
  e marcação item a item; a granularidade por tarefa pode ser revisitada no futuro se
  necessário.
- **Dois contextos fixos** (Pessoal/Trabalho) na v1 — sem contextos arbitrários.
- **Motor de capacity intocado**: o cálculo existente é reutilizado por filtragem de insumos;
  nenhuma mudança na regra da janela 8h–22h nesta spec.
- **Interação com a spec 034**: quando o clarify existir, mover para lista de trabalho
  durante o processamento já resolve o contexto — nenhum acoplamento além disso; as specs
  são independentes.
- **Canal**: webapp entrega a divisão; Telegram entrega o resumo com os dois blocos.
- **Usuário único**, como nos demais domínios.
