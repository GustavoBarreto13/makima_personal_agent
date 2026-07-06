# Feature Specification: GTD core — status reais, processamento do inbox, contextos e smart lists padrão de mercado (Kaguya)

**Feature Branch**: `034-tasks-gtd-core`

**Created**: 2026-07-06

**Status**: Draft

**Input**: User description: "Melhorar GTD na Kaguya: inbox com processamento guiado (clarify), próximas ações, Waiting For e Someday/Maybe como status de primeira classe (hoje são tags heurísticas), contextos dedicados (@casa, @computador...) e reorganização das smart lists no padrão de mercado (TickTick/Todoist): Todas, Hoje, Amanhã, Próximos 7 Dias, Inbox."

## Visão geral

O suporte a GTD na Kaguya hoje é **heurístico**: "Próximas Ações" e "Aguardando" são
smart-lists construídas sobre tags reservadas (`#aguardando`, `#algum-dia`). Não existe o
ritual central do GTD — **processar o inbox** decidindo item a item o que cada coisa é — nem
contextos de execução. E a navegação principal da sidebar não segue o padrão consolidado dos
apps de tarefas do mercado.

Esta spec transforma o GTD em cidadão de primeira classe: cada tarefa pode ter um **status
GTD** real (próxima ação, aguardando alguém, algum dia/talvez), o inbox ganha um
**processamento guiado** card a card (com a regra dos 2 minutos), tarefas ganham um
**contexto de execução** dedicado e gerenciável, e a sidebar passa a ter o bloco fixo de
views padrão de mercado: **Todas, Hoje, Amanhã, Próximos 7 Dias, Inbox** — com contadores.
As tags reservadas antigas são migradas para os status reais e aposentadas.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Processar o inbox item a item (Priority: P1)

O usuário acumula capturas no Inbox ao longo do dia (via web e Telegram). Em um momento de
organização, ele inicia o **processamento**: o sistema apresenta um item por vez e ele decide,
com botões claros, o que aquilo é — **é uma próxima ação** (define contexto/lista), **estou
aguardando alguém** (registra quem/o quê), **algum dia/talvez**, **agendar** (define data),
**leva menos de 2 minutos → faço agora** (conclui), ou **lixo** (exclui). Um contador
("3 de 12") mostra o andamento. Ele pode parar no meio e retomar depois: itens já processados
não voltam à fila.

**Why this priority**: é o coração do GTD — sem o clarify, inbox é só uma lista que cresce.
Entrega valor sozinho mesmo sem as demais partes.

**Independent Test**: capturar 5 itens no Inbox, iniciar o processamento, dar um destino
diferente a cada um (próxima ação, aguardando, algum dia, agendar, concluir) e confirmar que
a fila esvazia, que cada item foi parar no lugar certo e que reabrir o processamento mostra
fila vazia.

**Acceptance Scenarios**:

1. **Given** um Inbox com itens não processados, **When** inicio o processamento, **Then**
   vejo um item por vez com as decisões possíveis e um contador de progresso.
2. **Given** um item na fila, **When** escolho "próxima ação", **Then** a tarefa recebe o
   status de próxima ação (podendo definir contexto e lista de destino) e sai da fila.
3. **Given** um item na fila, **When** escolho "aguardando" e informo quem/o quê, **Then** a
   tarefa fica marcada como aguardando, com o registro de por quem espera e desde quando.
4. **Given** um item na fila, **When** escolho "agendar" com uma data, **Then** a tarefa ganha
   a data e passa a aparecer nas views de data (Hoje/Amanhã/Próximos 7 Dias) conforme o caso.
5. **Given** um item que resolvo na hora (regra dos 2 minutos), **When** escolho "feito",
   **Then** a tarefa é concluída e sai da fila.
6. **Given** um processamento interrompido no meio, **When** retomo depois, **Then** a fila
   contém apenas os itens ainda não processados.

---

### User Story 2 - Navegar pelas smart lists padrão de mercado (Priority: P1)

O usuário quer a navegação que já conhece dos apps de tarefas: no topo da sidebar, um bloco
fixo com **Todas** (todas as tarefas abertas), **Hoje** (vencem hoje + atrasadas), **Amanhã**,
**Próximos 7 Dias** e **Inbox**, cada uma com um **contador** de itens. As listas de estado
GTD (**Próximas Ações**, **Aguardando**, **Algum dia**) ficam numa seção própria logo abaixo,
agora refletindo o status real das tarefas — não mais tags.

**Why this priority**: é a mudança mais visível do dia a dia — toda sessão de uso passa por
essa navegação. Independe do processamento (US1) para ser testável.

**Independent Test**: criar tarefas com datas variadas (hoje, amanhã, +5 dias, sem data,
atrasada) e conferir que cada view fixa mostra exatamente o esperado, com contadores corretos,
no fuso local (UTC-3).

**Acceptance Scenarios**:

1. **Given** tarefas abertas com e sem data, **When** abro "Todas", **Then** vejo todas as
   abertas, independentemente de data ou lista.
2. **Given** uma tarefa vencendo hoje e outra atrasada, **When** abro "Hoje", **Then** vejo
   ambas (Hoje absorve as vencidas).
3. **Given** uma tarefa vencendo amanhã, **When** abro "Amanhã", **Then** ela aparece — e não
   aparece em "Hoje".
4. **Given** tarefas vencendo em 3 e em 10 dias, **When** abro "Próximos 7 Dias", **Then**
   vejo a de 3 dias e não a de 10.
5. **Given** qualquer estado do banco, **When** olho a sidebar, **Then** cada view fixa exibe
   um contador coerente com seu conteúdo.
6. **Given** que a virada do dia acontece às 00:00 no fuso local (UTC-3), **When** uso as
   views após as 21h, **Then** "Hoje"/"Amanhã" continuam corretas (sem o bug de UTC).

---

### User Story 3 - Status GTD e listas de estado reais (Priority: P2)

O usuário marca (ou o clarify marca por ele) tarefas como **próxima ação**, **aguardando**
(com "por quem/o quê" e "desde quando") ou **algum dia/talvez**, direto no detalhe da tarefa.
As listas "Próximas Ações", "Aguardando" e "Algum dia" consultam esse status real. As tags
reservadas antigas (`#aguardando`, `#algum-dia`) são migradas automaticamente para os novos
status e deixam de existir.

**Why this priority**: dá a base de dados correta ao GTD; o clarify (US1) escreve nesses
status, mas editar manualmente também precisa funcionar.

**Independent Test**: marcar uma tarefa como aguardando ("orçamento do João") pelo detalhe,
conferir que aparece na lista "Aguardando" com a anotação e o tempo de espera; verificar que
uma tarefa antiga com tag `#algum-dia` aparece em "Algum dia" após a migração, sem a tag.

**Acceptance Scenarios**:

1. **Given** uma tarefa qualquer, **When** defino seu status GTD no detalhe, **Then** ela
   passa a constar na lista de estado correspondente.
2. **Given** uma tarefa aguardando, **When** consulto a lista "Aguardando", **Then** vejo por
   quem/o quê espera e há quanto tempo.
3. **Given** tarefas antigas com as tags reservadas, **When** a migração roda, **Then** elas
   ganham o status equivalente e as tags reservadas somem do sistema.
4. **Given** uma tarefa "algum dia", **When** eu a agendo com uma data, **Then** ela deixa de
   ser "algum dia" (agendar limpa esse estado).
5. **Given** uma tarefa recorrente com status de próxima ação, **When** a ocorrência é
   concluída e a próxima é gerada, **Then** a nova ocorrência herda o status.

---

### User Story 4 - Contextos de execução dedicados (Priority: P2)

O usuário mantém uma lista gerenciável de **contextos** (ex.: @casa, @computador, @rua) e
atribui no máximo um contexto por tarefa. Ele filtra por contexto para responder "o que dá
pra fazer agora, daqui?". Contextos são um campo próprio — não tags — com criação, edição,
reordenação e exclusão pela UI.

**Why this priority**: completa o trio do GTD (o quê → status, quando → data, onde → contexto),
mas as listas e o clarify funcionam sem ele.

**Independent Test**: criar os contextos @casa e @rua, atribuí-los a tarefas distintas,
filtrar por @casa e ver só as tarefas certas; excluir @rua e conferir que as tarefas que o
usavam ficam sem contexto (não somem).

**Acceptance Scenarios**:

1. **Given** a tela de contextos, **When** crio/renomeio/reordeno contextos, **Then** as
   mudanças persistem e aparecem nos seletores.
2. **Given** tarefas com contexto, **When** filtro por um contexto, **Then** vejo apenas as
   tarefas dele.
3. **Given** um contexto em uso, **When** o excluo, **Then** as tarefas que o usavam
   permanecem intactas, apenas sem contexto.
4. **Given** o processamento do inbox (US1), **When** escolho "próxima ação", **Then** posso
   atribuir o contexto na mesma decisão.

---

### User Story 5 - GTD pelo Telegram (Priority: P3)

Pelo bot, o usuário processa o inbox conversacionalmente ("Kaguya, vamos processar o inbox" →
ela apresenta um item por vez e entende as decisões em linguagem natural) e pede as novas
views pelo nome ("o que tem pra amanhã?", "próximos 7 dias", "todas").

**Why this priority**: paridade de canal é princípio da Kaguya, mas o fluxo web entrega o
valor principal primeiro.

**Independent Test**: no Telegram, processar 2 itens do inbox com decisões diferentes e pedir
"tarefas de amanhã", conferindo respostas corretas.

**Acceptance Scenarios**:

1. **Given** itens no inbox, **When** peço para processar pelo Telegram, **Then** a Kaguya
   apresenta um item por vez e aplica a decisão que eu der.
2. **Given** os novos nomes de views, **When** peço "amanhã"/"próximos 7 dias"/"todas",
   **Then** recebo a lista correspondente.

---

### Edge Cases

- **Subtarefas**: têm status GTD próprio, mas **não** entram na fila do processamento do
  inbox (processa-se a tarefa-mãe).
- **Inbox parcialmente processado**: permitido — a fila considera só itens não processados;
  itens novos capturados depois entram na próxima fila.
- **Agendar vs. algum dia**: dar data a uma tarefa "algum dia" limpa o estado; a tarefa segue
  o fluxo normal de datas.
- **Recorrentes**: a próxima ocorrência herda o status GTD da anterior.
- **"Aguardando" sem anotação**: permitido, mas a UI incentiva registrar por quem/o quê;
  "desde quando" é preenchido automaticamente.
- **Item processado direto no detalhe** (sem passar pelo wizard): definir status GTD ou
  concluir a tarefa também a marca como processada — ela não aparece mais na fila.
- **Views fixas vs. smart-lists salvas**: os built-ins "Rápidas (5 min)" e "Alta energia"
  viram smart-lists salvas normais (o usuário pode editá-las ou apagá-las); nenhuma smart-list
  salva do usuário é perdida na reorganização.
- **Fuso horário**: todas as noções de "hoje/amanhã/7 dias" usam o fuso local UTC-3
  (America/Sao_Paulo), nunca UTC puro.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST suportar um **status GTD** por tarefa entre: próxima ação,
  aguardando, algum dia/talvez — além do estado "não classificada".
- **FR-002**: Tarefas aguardando MUST registrar opcionalmente **por quem/o quê** esperam e
  MUST registrar **desde quando**.
- **FR-003**: O sistema MUST oferecer um **processamento do inbox** item a item com as
  decisões: próxima ação, aguardando, algum dia, agendar, concluir agora (regra dos 2
  minutos) e excluir — com contador de progresso e retomada.
- **FR-004**: Um item MUST ser considerado **processado** ao receber qualquer decisão (pelo
  wizard ou por edição direta) e MUST sair da fila.
- **FR-005**: O sistema MUST manter uma lista gerenciável de **contextos** (criar, renomear,
  reordenar, excluir) e permitir no máximo **um contexto por tarefa**; excluir um contexto
  MUST apenas desassociá-lo das tarefas.
- **FR-006**: A sidebar MUST exibir o bloco fixo de views, nesta ordem: **Todas, Hoje,
  Amanhã, Próximos 7 Dias, Inbox**, cada uma com **contador**.
- **FR-007**: "Hoje" MUST incluir as tarefas vencidas (atrasadas); "Próximos 7 Dias" MUST
  cobrir os 7 dias corridos a partir de hoje, no fuso local.
- **FR-008**: As listas de estado GTD (**Próximas Ações, Aguardando, Algum dia**) MUST
  consultar o status real e viver numa seção própria da sidebar, abaixo do bloco fixo.
- **FR-009**: As smart-lists salvas MUST poder filtrar por **status GTD** e por **contexto**,
  além dos critérios já existentes; o vocabulário de datas MUST ganhar o atalho "amanhã".
- **FR-010**: A migração MUST converter as tags reservadas `#aguardando`/`#algum-dia` nos
  status equivalentes, MUST remover essas tags após a conversão e MUST ser idempotente
  (rodar duas vezes não duplica nem corrompe).
- **FR-011**: Os built-ins "Rápidas (5 min)" e "Alta energia" MUST ser convertidos em
  smart-lists salvas editáveis do usuário, preservando seu comportamento atual.
- **FR-012**: Agendar uma tarefa "algum dia" MUST limpar esse estado; concluir uma ocorrência
  recorrente MUST propagar o status GTD à próxima ocorrência.
- **FR-013**: Subtarefas MUST poder ter status GTD próprio e MUST ficar fora da fila do
  processamento do inbox.
- **FR-014**: O Telegram MUST oferecer o processamento conversacional do inbox e MUST
  resolver os novos nomes de views ("todas", "amanhã", "próximos 7 dias").
- **FR-015**: Todo cálculo de "hoje/amanhã/próximos dias" MUST usar o fuso
  America/Sao_Paulo (UTC-3).

### Key Entities *(include if feature involves data)*

- **Status GTD da tarefa**: classificação de fluxo (próxima ação / aguardando / algum dia /
  não classificada), com anotação de espera (por quem/o quê, desde quando) quando aguardando,
  e marca de processamento (quando o item foi clarificado).
- **Contexto**: etiqueta de execução gerenciável (nome, ícone opcional, ordem), associável a
  no máximo uma por tarefa; existe independentemente das tarefas.
- **View fixa (smart list de mercado)**: consulta padronizada por data/escopo (Todas, Hoje,
  Amanhã, Próximos 7 Dias, Inbox) com contador; não é editável pelo usuário.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: O usuário processa um inbox de 10 itens em menos de **3 minutos**, sem sair do
  fluxo (uma decisão por item, sem navegar entre telas).
- **SC-002**: Após processar todo o inbox, a fila exibe **zero** itens e cada item consta no
  destino escolhido — verificável em 100% dos casos testados.
- **SC-003**: As 5 views fixas retornam exatamente as tarefas esperadas nos casos-limite de
  data (hoje, atrasada, amanhã, dentro de 7 dias, fora de 7 dias, sem data), inclusive após
  as 21h no fuso local.
- **SC-004**: Após a migração, **nenhuma** tarefa mantém as tags reservadas e 100% das que as
  tinham exibem o status GTD equivalente.
- **SC-005**: Filtrar por um contexto retorna somente tarefas daquele contexto, em qualquer
  combinação com as demais views.
- **SC-006**: Pelo Telegram, as frases "processar inbox", "tarefas de amanhã" e "próximos 7
  dias" produzem as respostas corretas sem instrução adicional.

## Assumptions

- **Usuário único**, como nos demais domínios da Kaguya; sem multiusuário.
- **"Agendada" não é status GTD**: uma tarefa com data é "scheduled" por derivação da própria
  data — não há dupla fonte de verdade; do mesmo modo, "inbox" é a lista de inbox existente.
- **Contexto é campo dedicado** (decisão do usuário), não tag — tabela própria gerenciável;
  tags seguem existindo para outros usos.
- **Padrão de referência**: a organização da sidebar segue TickTick/Todoist (bloco fixo de
  views por data + seção GTD + listas do usuário + smart-lists salvas).
- **Canal**: o webapp entrega o fluxo completo; o Telegram entrega o processamento
  conversacional e a resolução dos nomes de views (paridade de canal da Kaguya).
- **Base técnica existente**: a DSL de smart-lists já suporta os atalhos de data
  `today`/`Nd`/`overdue`/`none`/`within` — "Amanhã" exige adicionar o atalho `tomorrow`; os
  built-ins atuais vivem em `agents/kaguya/tools_filters.py` (`BUILTIN_FILTERS`).
- **Migração**: roda embutida no schema (padrão das specs 026/030), validada localmente antes
  do VPS; no VPS, executada de dentro do container `makima-web`.
- **Dependente desta spec**: a revisão semanal guiada (spec 035) consome os status GTD e a
  fila de processamento definidos aqui.
