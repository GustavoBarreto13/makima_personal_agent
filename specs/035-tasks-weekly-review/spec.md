# Feature Specification: Revisão semanal guiada (Kaguya)

**Feature Branch**: `035-tasks-weekly-review`

**Created**: 2026-07-06

**Status**: Draft

**Input**: User description: "Revisão semanal do GTD como ritual guiado na Kaguya: wizard em passos (inbox zero, próximas ações, aguardando, listas/projetos, calendário, someday/maybe), possibilidade de retomar uma revisão abandonada, e lembrete no Telegram no fim de semana quando a revisão não aconteceu."

## Visão geral

O GTD só se sustenta com a **revisão semanal**: o momento de esvaziar o inbox, conferir se as
próximas ações ainda fazem sentido, cobrar o que está aguardando, varrer projetos parados,
olhar o calendário e reavaliar o "algum dia". Com a spec 034 os status GTD passam a ser reais;
esta spec fecha o bloco com o **ritual guiado** — um wizard de 6 passos que agrega, em cada
passo, exatamente o que precisa ser olhado — mais um **lembrete** no Telegram quando a semana
termina sem revisão.

Uma revisão é um registro com início, fim e passos concluídos: pode ser abandonada no meio e
retomada depois, e o histórico ("última revisão há N dias") vira um lembrete visível no
próprio painel.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Fazer a revisão semanal guiada (Priority: P1)

O usuário inicia a revisão e percorre 6 passos, cada um mostrando os dados daquele foco com
ações inline: **(1) Inbox zero** — processa o que sobrou (reusa o fluxo da spec 034);
**(2) Próximas ações** — confere se ainda são as certas, conclui ou repriorisa; **(3)
Aguardando** — vê há quanto tempo espera cada item (os mais antigos em destaque) e decide
cobrar, concluir ou desistir; **(4) Listas/projetos** — varre cada lista procurando itens
órfãos ou paradas; **(5) Calendário** — olha a semana que passou (algo escapou?) e a que vem
(o que precisa preparar?); **(6) Algum dia/talvez** — promove o que amadureceu, apaga o que
morreu. Ao final, registra uma nota livre e conclui a revisão.

**Why this priority**: é a feature — o ritual completo. Cada passo agrega dados que já
existem; o valor está em guiar a sequência.

**Independent Test**: iniciar uma revisão, percorrer os 6 passos executando pelo menos uma
ação em cada (processar 1 item, concluir 1 próxima ação, cobrar 1 aguardando, revisar 1
lista, olhar o calendário, promover 1 algum-dia), escrever a nota e concluir; conferir que a
revisão consta como concluída com os 6 passos marcados.

**Acceptance Scenarios**:

1. **Given** o painel da Kaguya, **When** inicio uma revisão, **Then** entro no passo 1 com a
   fila do inbox e vejo o progresso dos 6 passos.
2. **Given** um passo qualquer, **When** executo ações nos itens exibidos (concluir, editar,
   promover, excluir), **Then** as mudanças valem imediatamente no sistema — não são
   "rascunho da revisão".
3. **Given** o passo "Aguardando", **When** o abro, **Then** os itens aparecem com o tempo de
   espera, os mais antigos em destaque.
4. **Given** o passo "Calendário", **When** o abro, **Then** vejo a semana passada e a
   próxima semana.
5. **Given** o último passo concluído, **When** escrevo a nota final e concluo, **Then** a
   revisão fica registrada com data de início, fim, passos e nota.
6. **Given** um passo sem pendências (ex.: inbox já vazio), **When** o abro, **Then** ele
   celebra o estado limpo e me deixa avançar direto.

---

### User Story 2 - Retomar uma revisão abandonada (Priority: P2)

O usuário começou a revisão, foi interrompido no passo 3 e fechou o navegador. Dias depois,
ao iniciar de novo, o sistema **retoma** a revisão aberta do ponto em que parou — não cria
uma segunda em paralelo.

**Why this priority**: interrupção é o caso comum na vida real; sem retomada, revisões pela
metade viram lixo no histórico.

**Independent Test**: iniciar uma revisão, concluir 2 passos, sair; iniciar de novo e
conferir que volta ao passo 3 da mesma revisão, com os passos 1–2 marcados.

**Acceptance Scenarios**:

1. **Given** uma revisão aberta com passos concluídos, **When** peço para iniciar uma
   revisão, **Then** a aberta é retomada no primeiro passo pendente.
2. **Given** uma revisão aberta, **When** consulto o estado das revisões, **Then** fica claro
   que há uma em andamento (e desde quando).
3. **Given** nenhuma revisão aberta, **When** inicio, **Then** uma nova é criada.

---

### User Story 3 - Lembrete de domingo à noite (Priority: P2)

Se a semana termina sem nenhuma revisão concluída, o usuário recebe **domingo à noite** uma
mensagem no Telegram lembrando — com um resumo curto do que o espera (itens no inbox,
aguardando antigos), para dar vontade de fazer.

**Why this priority**: o ritual só funciona se acontecer; o lembrete é o mecanismo de hábito.
Depende da infraestrutura de jobs agendados que o repo já tem.

**Independent Test**: com uma semana sem revisão concluída, disparar o job manualmente e
conferir a mensagem no Telegram; concluir uma revisão e disparar de novo, conferindo que
**não** envia.

**Acceptance Scenarios**:

1. **Given** nenhuma revisão concluída nos últimos 7 dias, **When** o job de domingo roda,
   **Then** recebo o lembrete no Telegram com o resumo.
2. **Given** uma revisão concluída na semana, **When** o job roda, **Then** nenhum lembrete é
   enviado.
3. **Given** falha no envio, **When** o job termina, **Then** a execução fica registrada no
   histórico do scheduler com o erro (padrão dos demais jobs).

---

### User Story 4 - Saber quando revisei pela última vez (Priority: P3)

No painel, o usuário vê discretamente "Última revisão há N dias" (ou "nunca"), como nudge
permanente — clicar leva ao wizard.

**Why this priority**: reforço leve; o lembrete do Telegram (US3) já cobre o mecanismo
principal.

**Independent Test**: concluir uma revisão e conferir que o indicador mostra "hoje"; avançar
dias (ou simular) e conferir a contagem.

**Acceptance Scenarios**:

1. **Given** revisões passadas, **When** abro o painel, **Then** vejo há quantos dias foi a
   última concluída.
2. **Given** o indicador, **When** clico, **Then** vou para o wizard (iniciando ou retomando).

---

### Edge Cases

- **Duas revisões abertas**: impossível — iniciar com uma aberta sempre retoma; nunca há mais
  de uma em andamento.
- **Revisão muito antiga aberta** (ex.: abandonada há 3 semanas): ainda é retomável; os dados
  de cada passo são sempre os **atuais**, não um snapshot de quando começou.
- **Nada a revisar**: todos os passos vazios — a revisão pode ser concluída em segundos; vale
  como revisão da semana (o lembrete não dispara).
- **Passos fora de ordem**: o usuário pode navegar entre passos livremente; concluir a
  revisão exige todos os passos marcados como vistos.
- **Semana do lembrete**: "semana" = últimos 7 dias corridos no fuso local (UTC-3), avaliada
  no momento do job de domingo à noite.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST oferecer uma revisão guiada em **6 passos**: inbox zero,
  próximas ações, aguardando, listas/projetos, calendário (semana passada + próxima) e algum
  dia/talvez.
- **FR-002**: Cada passo MUST exibir os dados atuais do seu foco e permitir agir neles inline
  (processar, concluir, editar, promover, excluir), com efeito imediato no sistema.
- **FR-003**: O passo "aguardando" MUST destacar os itens com espera mais antiga.
- **FR-004**: Uma revisão MUST registrar início, fim, passos concluídos e uma nota final
  opcional; revisões concluídas MUST ficar no histórico.
- **FR-005**: Iniciar uma revisão com outra aberta MUST retomá-la no primeiro passo pendente;
  no máximo **uma** revisão aberta por vez.
- **FR-006**: O usuário MUST poder navegar entre os passos livremente; concluir a revisão
  MUST exigir todos os passos vistos.
- **FR-007**: O sistema MUST enviar um lembrete pelo Telegram no domingo à noite **somente**
  se não houve revisão concluída nos últimos 7 dias, incluindo um resumo curto (tamanho do
  inbox, aguardando antigos).
- **FR-008**: A execução do lembrete MUST seguir o padrão dos jobs agendados existentes
  (histórico de execuções + alerta em falha).
- **FR-009**: O painel MUST exibir há quantos dias foi a última revisão concluída, com
  atalho para iniciar/retomar.
- **FR-010**: Datas e a noção de "semana" MUST usar o fuso America/Sao_Paulo (UTC-3).

### Key Entities *(include if feature involves data)*

- **Revisão (Review)**: um ritual datado — início, fim (quando concluída), conjunto de passos
  concluídos e nota final. No máximo uma aberta.
- **Passo da revisão**: item fixo do checklist (os 6 do ritual); guarda apenas visto/não
  visto dentro da revisão — os dados exibidos são sempre os vivos do sistema.
- **Marca de revisão da lista**: cada lista/projeto lembra quando foi revisada pela última
  vez, alimentando o passo 4.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Com um volume típico (≤10 itens por passo), a revisão completa leva menos de
  **15 minutos**.
- **SC-002**: Uma revisão interrompida é retomada no passo correto em 100% dos casos
  testados, sem criar duplicata.
- **SC-003**: O lembrete dispara **se e somente se** não houve revisão concluída na semana —
  zero falsos positivos/negativos nos cenários testados.
- **SC-004**: Toda revisão concluída preserva no histórico: datas, passos e nota.
- **SC-005**: O indicador "última revisão há N dias" reflete a realidade em qualquer momento
  do dia, no fuso local.

## Assumptions

- **Depende da spec 034**: os passos 1 (fila de processamento do inbox), 2, 3 e 6 consomem os
  status GTD e o fluxo de clarify definidos lá — esta spec não redefine nada disso.
- **Passo do calendário é leitura**: mostra eventos/tarefas da semana passada e da próxima;
  criar/editar eventos continua nos fluxos existentes.
- **Lembrete via scheduler existente**: o repo já tem o agendador de jobs (`scheduler/`) com
  histórico e alerta em falha — o lembrete é um job novo no padrão estabelecido; horário
  exato (ex.: domingo 20h, fuso local) definível no planejamento.
- **Canal do ritual**: o wizard é do webapp; pelo Telegram vai apenas o lembrete (com resumo).
  Um ritual conversacional completo fica fora de escopo.
- **Usuário único**, como nos demais domínios.
