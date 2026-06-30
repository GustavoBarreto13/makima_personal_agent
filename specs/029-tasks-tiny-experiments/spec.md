# Feature Specification: Tiny Experiments (Kaguya)

**Feature Branch**: `029-tasks-tiny-experiments`

**Created**: 2026-06-29

**Status**: Draft

**Input**: User description: "Aba 'Tiny Experiments' dentro da Kaguya — cada experimento é 'Vou [ação] por [duração]', time-boxed, com check-in periódico (Fez? / Como foi 1–5 / nota) onde falha vira dado, e uma Review final com verdict persistir/pausar/pivotar. Escopo enxuto. Webapp primeiro. Experimentos ativos do dia aparecem no ritual 'Meu Dia' com check-in de 1 toque."

## Visão geral

O usuário estuda e sintetiza, na sua base de conhecimento pessoal, o método **Tiny
Experiments** (Anne-Laure Le Cunff, popularizado por Ruri Ohama). A premissa: metas falham
pelo enquadramento *tudo-ou-nada*; a correção é tratar cada intenção como um **experimento
pequeno e com prazo** — *"Vou [ação] por [duração]"* — acompanhado por check-ins onde **uma
falha é um dado, não um veredicto**. Ao fim do prazo, o usuário reflete e decide **persistir,
pausar ou pivotar**.

Esta feature traz esse método para dentro da **Kaguya** (o domínio de tarefas e rotinas do
usuário) como uma nova seção, ao lado de Tarefas, Hábitos e Meu Dia — para que experimentar
mudanças de comportamento seja tão fácil quanto registrar uma tarefa, e para que o
acompanhamento diário caiba no ritual que o usuário já faz todo dia.

## Clarifications

### Session 2026-06-29

- Q: Como um experimento entra em "pausado" (a entidade e o FR-014 citam o estado, mas nenhum requisito o cria)? → A: "Pausar/retomar" é uma ação durante o experimento (ativo ⇄ pausado), separada do veredicto final "pausar" da revisão; enquanto pausado, não aparece no Meu Dia e não conta período; pode ser retomado a qualquer momento.
- Q: Como "a semana" é definida na cadência semanal (afeta período do check-in, unicidade e o "cai hoje?" do Meu Dia)? → A: Semana de calendário, segunda a domingo; o período é identificado pela segunda-feira daquela semana, e o experimento fica pendente enquanto não houver check-in na semana corrente.
- Q: O usuário pode preencher um check-in de período passado (backfill) que esqueceu de marcar? → A: Sim — pode registrar/editar o check-in de qualquer período (corrente ou passado) dentro do intervalo início–fim do experimento.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Criar um experimento e acompanhá-lo com check-ins (Priority: P1)

O usuário quer testar uma mudança ("meditar 5 minutos") por um período curto. Ele cria um
experimento descrevendo a fórmula *"Vou [ação] por [duração]"*, define quando começa e
termina, e a partir daí registra check-ins periódicos: marcou se fez ou não, dá uma nota de
como se sentiu (1–5) e, opcionalmente, escreve uma nota. A qualquer momento ele vê o quanto
aderiu ao experimento até agora, sem que uma falha isolada "zere" nada.

**Why this priority**: É o coração do método e a unidade mínima de valor — sem criar e
acompanhar um experimento, nada mais existe. Entrega valor sozinha (um tracker de
experimento) mesmo sem as outras histórias.

**Independent Test**: Criar um experimento com fórmula e datas, registrar dois check-ins (um
"fez", um "não fez", com notas e sensações), e confirmar que a tela mostra ambos no histórico
e a aderência calculada corretamente.

**Acceptance Scenarios**:

1. **Given** que estou na seção de experimentos, **When** crio um experimento com fórmula,
   data de início e data de fim, **Then** ele aparece na lista de experimentos ativos com o
   prazo e aderência zerada.
2. **Given** um experimento ativo sem check-in hoje, **When** registro o check-in de hoje
   (fez = sim, sensação = 4, nota opcional), **Then** o check-in é salvo e a aderência do
   experimento se atualiza.
3. **Given** que já registrei o check-in de hoje, **When** registro novamente para hoje com
   valores diferentes, **Then** o registro de hoje é **atualizado** (não duplicado).
4. **Given** um check-in registrado por engano, **When** o desfaço, **Then** ele some do
   histórico e a aderência recalcula.
5. **Given** um experimento com vários check-ins, **When** abro o seu detalhe, **Then** vejo o
   histórico (data · fez? · sensação · nota) e o progresso até o prazo.

---

### User Story 2 - Fechar o experimento com uma reflexão e um veredicto (Priority: P2)

Ao chegar o fim do prazo (ou quando decidir parar antes), o usuário revisa o experimento:
escreve o que aprendeu e escolhe um veredicto — **persistir** (virou rotina), **pausar**
(deixar para depois) ou **pivotar** (ajustar e tentar diferente). O experimento então sai da
lista de ativos e passa a constar como concluído, preservando a reflexão.

**Why this priority**: É o que diferencia um experimento de um hábito comum — o ciclo só fecha
na reflexão. Importante, mas o acompanhamento (P1) já entrega valor antes disto existir.

**Independent Test**: Em um experimento ativo, abrir a revisão, escrever um aprendizado,
escolher "pivotar" e confirmar; verificar que ele deixa a lista de ativos, aparece entre os
concluídos com o veredicto e o texto preservados.

**Acceptance Scenarios**:

1. **Given** um experimento ativo, **When** abro sua revisão e a concluo com um aprendizado e
   um veredicto, **Then** ele passa a constar como concluído e some da lista de ativos.
2. **Given** um experimento concluído, **When** o consulto, **Then** vejo o aprendizado, o
   veredicto e o histórico de check-ins preservados.
3. **Given** um experimento que ainda não chegou ao prazo, **When** decido concluí-lo mesmo
   assim, **Then** o sistema permite e registra a conclusão antecipada.

---

### User Story 3 - Lembrar do experimento no ritual diário "Meu Dia" (Priority: P2)

Para que o experimento seja de fato seguido, o usuário quer ser lembrado durante o ritual
"Meu Dia" que já faz. Os experimentos ativos cuja cadência é "hoje" e que ainda não têm
check-in aparecem ali, com a possibilidade de registrar o check-in com **um toque**, sem
precisar abrir a seção de experimentos.

**Why this priority**: É o que torna o método "fácil de implementar na vida" — o nudge diário
no fluxo existente fecha o loop. Depende de P1 (precisa existir um experimento para lembrar),
mas amplia muito a adesão.

**Independent Test**: Com um experimento ativo de cadência diária sem check-in hoje, abrir
"Meu Dia" e confirmar que ele aparece; registrar o check-in de hoje por ali e confirmar que
ele some da seção de lembretes e passa a constar no histórico do experimento.

**Acceptance Scenarios**:

1. **Given** um experimento ativo de cadência diária sem check-in hoje, **When** abro "Meu
   Dia", **Then** ele aparece numa seção de experimentos do dia com ação de check-in rápido.
2. **Given** esse lembrete em "Meu Dia", **When** registro o check-in com um toque, **Then** o
   lembrete some e o check-in consta no experimento.
3. **Given** um experimento cujo check-in de hoje já foi feito, **When** abro "Meu Dia",
   **Then** ele **não** aparece na seção de lembretes do dia.
4. **Given** um experimento pausado/concluído ou fora do período (antes do início / depois do
   fim), **When** abro "Meu Dia", **Then** ele **não** aparece na seção de lembretes do dia.

---

### Edge Cases

- **Data de fim antes da de início**: o sistema rejeita a criação/edição com mensagem clara.
- **Nota de sensação fora de 1–5 ou ausente**: a sensação é opcional; quando informada, só
  aceita 1–5. "Fez? sim/não" é obrigatório no check-in.
- **Check-in fora do período do experimento** (antes do início / depois do fim): permitido
  registrar, mas a aderência usa o período oficial como base; o caso é tratado sem erro.
- **Cadência semanal**: a "semana" é a **semana de calendário (segunda a domingo)**, com o
  período identificado pela **segunda-feira**. O experimento fica pendente enquanto não houver
  check-in na semana corrente; o lembrete em "Meu Dia" e o cálculo de aderência consideram um
  check-in por semana (não por dia).
- **Experimento sem nenhum check-in ao concluir**: a revisão ainda é possível; a aderência
  final é 0% e o aprendizado é registrado mesmo assim.
- **Excluir um experimento**: é uma ação destrutiva — pede confirmação; o histórico de
  check-ins associado é removido junto.
- **Campos opcionais (porquê / hipótese) em branco**: permitido; só a fórmula e as datas são
  obrigatórias.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST permitir criar um experimento com, no mínimo, uma **fórmula**
  textual ("Vou [ação] por [duração]"), uma **data de início** e uma **data de fim**.
- **FR-002**: O sistema MUST permitir registrar, opcionalmente e num único formulário, um
  **porquê** (motivação) e uma **hipótese** ("talvez se eu __, então __") ao criar/editar.
- **FR-003**: O sistema MUST permitir definir a **cadência** do experimento como diária ou
  semanal.
- **FR-004**: O sistema MUST permitir editar e excluir um experimento; a exclusão MUST pedir
  confirmação e remover os check-ins associados.
- **FR-005**: O usuário MUST poder registrar um **check-in** por período (dia ou semana,
  conforme a cadência) contendo: se **fez** (sim/não), uma **sensação** opcional de 1 a 5 e
  uma **nota** opcional. O check-in pode ser registrado/editado para **qualquer período
  (corrente ou passado)** dentro do intervalo início–fim do experimento (backfill permitido).
- **FR-006**: O sistema MUST tratar um segundo registro para o **mesmo período** como
  atualização do existente, nunca como duplicata.
- **FR-007**: O usuário MUST poder **desfazer** o check-in de um período.
- **FR-008**: O sistema MUST calcular e exibir a **aderência** do experimento (quanto dos
  períodos esperados foram cumpridos) de forma que **uma falha isolada não zere** o
  acompanhamento.
- **FR-009**: O sistema MUST exibir, para cada experimento, o **histórico de check-ins**
  (data, fez?, sensação, nota) e o **tempo restante** até o prazo.
- **FR-010**: O usuário MUST poder **concluir** um experimento por meio de uma **revisão** que
  registra um **aprendizado** (texto) e um **veredicto** entre persistir, pausar ou pivotar.
- **FR-011**: O sistema MUST permitir concluir um experimento **antes** do fim do prazo.
- **FR-012**: O sistema MUST separar visualmente experimentos **ativos** de **concluídos** e
  preservar, nos concluídos, a revisão e o histórico.
- **FR-013**: O sistema MUST exibir, no ritual diário "Meu Dia", os experimentos **ativos**
  cuja cadência cai **hoje** e que **ainda não têm check-in** no período corrente, com ação de
  check-in rápido.
- **FR-014**: O sistema MUST **omitir** de "Meu Dia" experimentos já checados no período,
  pausados, concluídos ou fora do intervalo início–fim.
- **FR-015**: A seção de experimentos MUST viver **dentro da Kaguya**, acessível pela
  navegação do domínio, ao lado das demais seções (Tarefas, Hábitos, Meu Dia).
- **FR-016**: Datas e o conceito de "hoje" MUST respeitar o fuso local do usuário (UTC-3),
  sem deslize de dia ao redor da virada da meia-noite.
- **FR-017**: O usuário MUST poder **pausar** um experimento ativo e **retomá-lo** depois
  (ativo ⇄ pausado). Esta é uma ação durante o experimento, **distinta** do veredicto final
  "pausar" da revisão (FR-010). Enquanto pausado, o experimento **não** aparece no "Meu Dia"
  (já coberto pelo FR-014) e o período pausado **não** conta como período esperado no cálculo
  de aderência.

### Key Entities *(include if feature involves data)*

- **Experimento (Tiny Experiment)**: uma intenção testável com prazo. Atributos: fórmula
  (ação + duração em texto), porquê (opcional), hipótese (opcional), cadência (diária/semanal),
  data de início, data de fim, situação (ativo / pausado / concluído — onde **pausado** é um
  estado reversível durante o experimento, distinto do veredicto final "pausar"), veredicto
  final (persistir / pausar / pivotar, quando concluído) e aprendizado (texto, quando concluído).
- **Check-in (registro do tracker)**: um registro por período pertencente a um experimento.
  Atributos: período (data — o **dia** na cadência diária; a **segunda-feira da semana** na
  cadência semanal), fez? (sim/não), sensação (1–5, opcional), nota (opcional). No máximo um
  por período por experimento.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: O usuário consegue criar um experimento completo (fórmula + datas) em menos de
  **1 minuto**.
- **SC-002**: Registrar o check-in do dia a partir do ritual "Meu Dia" leva **um único toque**
  para o caso simples (fez = sim, sem nota).
- **SC-003**: Após registrar uma falha (não fez) num dia, a aderência exibida **diminui
  gradualmente** e permanece acima de zero enquanto houver cumprimentos — nunca zera por uma
  única falha.
- **SC-004**: 100% dos experimentos concluídos preservam, na consulta posterior, o veredicto e
  o aprendizado registrados.
- **SC-005**: Em "Meu Dia", aparecem **exatamente** os experimentos elegíveis do dia (ativos,
  no período, cadência hoje, sem check-in) — nenhum a mais, nenhum a menos.
- **SC-006**: Um registro repetido para o mesmo período nunca gera duplicata: a contagem de
  check-ins de um experimento é igual ao número de períodos distintos registrados.

## Assumptions

- **Usuário único**: o sistema atende a uma única pessoa autenticada (o dono do painel), como
  os demais domínios da Kaguya; não há multiusuário nem permissões.
- **Canal nesta fatia**: a interface é o **painel web**. O acompanhamento conversacional pelo
  bot do Telegram fica para uma fatia futura; a regra de negócio deve nascer agnóstica de
  canal para permitir essa extensão sem retrabalho.
- **Cadências suportadas**: apenas **diária** e **semanal** nesta versão (cobrem o "Continuous"
  do método para o uso pretendido); outras cadências ficam fora de escopo.
- **Sensação 1–5**: a escala de "como me senti" é de 1 a 5, tratada como métrica (dado), não
  como julgamento — coerente com o método.
- **Vínculo com Metas/Valores**: o "porquê" é um campo de texto livre nesta versão; não há
  integração formal com um sistema de metas/valores estruturado (ex.: domínios de vida).
- **Aderência "que perdoa falhas"**: adota-se um cálculo de aderência contínuo (no espírito do
  score de hábitos já existente no produto), em vez de streak que zera — o detalhe exato do
  cálculo é decisão de planejamento/implementação.
- **Reaproveitamento de UI**: a seção segue os padrões visuais e de navegação já usados pelas
  outras seções da Kaguya (tema, componentes de data, etc.).
- **Vínculo com Metas (spec 030)**: um experimento PODE, opcionalmente, pertencer a uma **meta**
  (feature de Metas, spec `030-tasks-metas`) — o experimento é um dos "movimentos" que avançam
  a meta. Esse vínculo é **opcional** e definido pela feature de Metas; nesta fatia (029) um
  experimento permanece plenamente utilizável **sem** estar associado a nenhuma meta. O campo de
  associação (ex.: um `goal_id` opcional) será detalhado no plano de implementação da spec 030.
