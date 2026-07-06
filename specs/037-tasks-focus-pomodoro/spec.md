# Feature Specification: Foco / Pomodoro — timer por tarefa e estatísticas (Kaguya)

**Feature Branch**: `037-tasks-focus-pomodoro`

**Created**: 2026-07-06

**Status**: Draft

**Input**: User description: "Pomodoro na Kaguya: timer de foco no webapp ligado (opcionalmente) a uma tarefa, com durações configuráveis desde a v1 (25/5, 50/10 e custom), widget que sobrevive à navegação e ao reload, histórico de sessões e estatísticas de foco no Meu Dia."

## Visão geral

A Kaguya planeja o dia (Meu Dia, time-blocking, capacity), mas não acompanha a **execução**:
quanto tempo de foco real cada tarefa recebeu. Esta spec adiciona o ciclo pomodoro — o
usuário aperta **"Focar"** em qualquer tarefa (ou inicia um foco avulso), escolhe a duração
(presets 25/5 e 50/10, ou custom), e um **timer flutuante** acompanha a sessão por todo o
painel, sobrevivendo à troca de telas e ao reload. Cada sessão vira histórico, e o Meu Dia
passa a mostrar as **estatísticas de foco** do dia ("Focado hoje: 1h15 · 3 pomodoros") e da
semana. Não existe nada disso hoje — é greenfield.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Focar numa tarefa com a duração que eu escolher (Priority: P1)

O usuário abre uma tarefa (ou passa o mouse sobre ela na lista, ou a vê no plano do Meu Dia)
e aperta **"Focar"**. Escolhe a duração — 25/5, 50/10 ou valores próprios — e o timer começa.
Ao fim do tempo de foco, o sistema sinaliza e oferece a pausa; ao fim da pausa, oferece
emendar outra sessão. Ele pode também **concluir antes** (conta o tempo real) ou **cancelar**
(descarta). Um foco pode ser iniciado sem tarefa (avulso). A duração padrão fica lembrada
entre sessões.

**Why this priority**: é o núcleo — sem iniciar/terminar sessões, não há histórico nem
estatísticas.

**Independent Test**: iniciar um foco de 25/5 numa tarefa, deixar terminar, registrar a
sessão; iniciar outro custom (15 min) e concluir antes do fim; iniciar um terceiro e
cancelar — conferir que só os dois primeiros constam no histórico, com os tempos corretos.

**Acceptance Scenarios**:

1. **Given** uma tarefa qualquer, **When** aperto "Focar" e escolho um preset ou duração
   custom, **Then** a sessão inicia vinculada àquela tarefa.
2. **Given** uma sessão em andamento, **When** o tempo de foco termina, **Then** sou
   sinalizado e a pausa é oferecida com a duração configurada.
3. **Given** uma sessão em andamento, **When** concluo antes da hora, **Then** a sessão é
   registrada com o tempo efetivamente focado.
4. **Given** uma sessão em andamento, **When** cancelo, **Then** nada entra nas estatísticas.
5. **Given** nenhuma tarefa escolhida, **When** inicio um foco avulso, **Then** a sessão
   funciona igual, sem vínculo.
6. **Given** uma duração custom usada, **When** abro o timer de novo, **Then** minha última
   configuração é a sugerida.

---

### User Story 2 - O timer me acompanha pelo painel inteiro (Priority: P1)

Com uma sessão ativa, o usuário navega livremente — Meu Dia, listas, calendário, hábitos — e
o **widget flutuante** continua visível com o tempo restante e a tarefa em foco. Se ele
recarrega a página ou fecha e reabre o navegador, a sessão **continua de onde estava** (o
tempo é contado pelo relógio real, não por um cronômetro da tela).

**Why this priority**: sem persistência, qualquer navegação mata a sessão — o timer viraria
um brinquedo de uma tela só.

**Independent Test**: iniciar um foco, navegar por 3 telas diferentes conferindo o widget,
dar F5 e conferir que o tempo restante está certo (descontando o tempo decorrido, não
resetado).

**Acceptance Scenarios**:

1. **Given** uma sessão ativa, **When** troco de tela dentro do painel, **Then** o widget
   permanece visível com o tempo correndo.
2. **Given** uma sessão ativa, **When** recarrego a página, **Then** o widget volta com o
   tempo restante correto (base = hora de início real).
3. **Given** o widget, **When** o observo, **Then** vejo tempo restante, fase (foco/pausa) e
   a tarefa vinculada (se houver), com ações de concluir/cancelar à mão.

---

### User Story 3 - Ver quanto foquei hoje e na semana (Priority: P2)

No Meu Dia, o usuário vê o resumo do foco do dia — tempo total e número de sessões — e uma
visão da semana (por dia). O histórico permite conferir as sessões de um dia: em quê focou,
quando, por quanto tempo.

**Why this priority**: transforma sessões em feedback — o motivo declarado do pedido
("estatísticas de foco") — mas depende de sessões existirem (US1).

**Independent Test**: completar 2 sessões hoje (25 min numa tarefa, 15 avulsa) e conferir
"Focado hoje: 40min · 2 sessões" no Meu Dia; conferir a série da semana com os valores por
dia; listar as sessões de hoje com tarefa, horário e duração.

**Acceptance Scenarios**:

1. **Given** sessões concluídas hoje, **When** abro o Meu Dia, **Then** vejo tempo total e
   contagem de sessões do dia.
2. **Given** sessões na semana, **When** consulto as estatísticas, **Then** vejo o total por
   dia dos últimos 7 dias.
3. **Given** um dia com sessões, **When** listo o histórico, **Then** cada sessão mostra
   tarefa (ou "avulsa"), início e duração focada.
4. **Given** a virada do dia no fuso local (UTC-3), **When** uma sessão acontece à noite,
   **Then** ela conta no dia local correto.

---

### Edge Cases

- **Sessão abandonada** (navegador fechado, sessão nunca concluída): na volta ao painel, a
  sessão vencida é encerrada automaticamente como não-completada, creditando no máximo o
  tempo planejado — nunca um foco de 14 horas.
- **Duas sessões ao mesmo tempo**: impossível — iniciar um foco com outro ativo fecha o
  anterior (com confirmação) antes de abrir o novo.
- **Tarefa excluída durante o foco**: a sessão sobrevive como avulsa; o histórico não quebra.
- **Tarefa concluída durante o foco**: permitido — a sessão continua até o usuário encerrá-la.
- **Relógio da tela vs. servidor**: o tempo autoritativo da sessão é o do servidor; a tela
  apenas exibe a contagem derivada da hora de início.
- **Pausa recusada**: o usuário pode pular a pausa e emendar outro foco, ou simplesmente
  parar — a pausa não é obrigatória.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O usuário MUST poder iniciar uma sessão de foco **a partir de uma tarefa** (do
  detalhe, da lista e do plano do Meu Dia) ou **avulsa** (sem tarefa).
- **FR-002**: As durações de foco e pausa MUST ser configuráveis na v1: presets **25/5** e
  **50/10** e valores **custom**; a última escolha do usuário MUST ser lembrada como padrão.
- **FR-003**: No máximo **uma** sessão ativa por vez; iniciar outra MUST encerrar a anterior
  com confirmação.
- **FR-004**: O fim do tempo de foco MUST ser sinalizado ao usuário, com oferta da pausa; ao
  fim da pausa, MUST ser possível emendar nova sessão ou parar.
- **FR-005**: O usuário MUST poder **concluir antecipadamente** (registra o tempo real) ou
  **cancelar** (não entra nas estatísticas) a sessão ativa.
- **FR-006**: Um widget flutuante MUST exibir a sessão ativa em **todas as telas** do painel
  da Kaguya, com tempo restante, fase e tarefa, e ações de concluir/cancelar.
- **FR-007**: A sessão MUST sobreviver a navegação e reload: o tempo restante deriva da hora
  de início real, e o registro autoritativo vive no servidor.
- **FR-008**: Sessões abandonadas MUST ser encerradas automaticamente na próxima abertura do
  painel, como não-completadas e creditando no máximo o tempo planejado.
- **FR-009**: Cada sessão registrada MUST guardar: tarefa (opcional), início, fim, duração
  planejada, pausa planejada, se foi completada e nota opcional.
- **FR-010**: O Meu Dia MUST exibir o resumo de foco do dia (tempo total + sessões) e uma
  visão dos últimos 7 dias; MUST existir a listagem das sessões de um dia.
- **FR-011**: Excluir uma tarefa MUST preservar suas sessões passadas (que passam a constar
  sem tarefa); a exclusão de sessões individuais não é oferecida na v1.
- **FR-012**: Agregações por dia MUST usar o fuso America/Sao_Paulo (UTC-3).

### Key Entities *(include if feature involves data)*

- **Sessão de foco**: um intervalo de trabalho — tarefa vinculada (opcional), início, fim,
  duração de foco planejada, pausa planejada, completada ou não, nota. É o registro atômico
  de todo o histórico e das estatísticas.
- **Preferência de duração**: o par foco/pausa padrão do usuário (preset ou custom),
  lembrado entre sessões.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Iniciar um foco numa tarefa leva no máximo **2 cliques** a partir de qualquer
  lugar onde a tarefa aparece.
- **SC-002**: Após reload no meio de uma sessão, o tempo restante exibido difere do real em
  menos de **2 segundos**, em 100% dos testes.
- **SC-003**: O resumo "Focado hoje" bate com a soma das sessões do dia (fuso local) em 100%
  dos casos, incluindo sessões concluídas antecipadamente.
- **SC-004**: Nenhuma sessão abandonada credita mais que seu tempo planejado.
- **SC-005**: O widget está visível e correto em todas as telas do painel com sessão ativa
  (verificação tela a tela na entrega).

## Assumptions

- **Canal**: o timer é do **webapp**; pelo Telegram, a Kaguya pode responder sobre o foco do
  dia (leitura), mas iniciar/parar sessões por chat fica fora de escopo da v1.
- **Notificação de fim**: sinalização dentro do painel (som/visual do widget); notificações
  push/desktop ficam fora de escopo da v1.
- **Sem gamificação**: streaks de pomodoro, metas de foco diárias e integrações com hábitos
  ficam para depois (a spec 036 já cobre hábitos automáticos por outras fontes).
- **Greenfield**: não existe nada de foco/pomodoro no sistema hoje; nenhuma migração de
  dados é necessária.
- **Detalhes para o planejamento**: onde guardar a preferência de duração (servidor vs.
  navegador) e o formato exato da série semanal são decisões do plan.md.
- **Usuário único**, como nos demais domínios.
