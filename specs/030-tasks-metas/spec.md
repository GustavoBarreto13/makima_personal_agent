# Feature Specification: Metas (Kaguya)

**Feature Branch**: `030-tasks-metas`

**Created**: 2026-06-29

**Status**: Draft

**Input**: User description: "Feature de Metas dentro da Kaguya, como fundação à qual a Tiny Experiments se vincula. Modelo combinando o melhor de SMART + GPS (título específico, porquê/valor, área da vida, métrica-alvo e/ou marcos, prazo, anti-metas, accountability). Uma meta agrega experimentos + tarefas + hábitos como os 'movimentos' do plano. Progresso por métrica alvo→atual + marcos. Webapp primeiro."

## Visão geral

Na base de conhecimento pessoal do usuário, o tema de **metas/planejamento** converge num
modelo claro: metas falham quando construídas sobre a fundação errada — começam pelo *como*
(apps, frameworks) antes do *porquê* (valores). A síntese das fontes (psicologia ACT, método
GPS de Ali Abdaal, SMART, planejamento anual) aponta que uma meta sustentável precisa de:
um **porquê** enraizado num valor, **especificidade** (o quê + número + prazo), um **plano**
de ações concretas, e um **sistema** de acompanhamento.

Esta feature traz Metas para dentro da **Kaguya** (o domínio de tarefas, hábitos e rotinas do
usuário) como a camada de *direção* que faltava. Uma meta deixa de ser um desejo vago e passa
a ter alvo mensurável, prazo e um conjunto de **movimentos** concretos — que são justamente os
**experimentos, tarefas e hábitos** já geridos pela Kaguya, agora vinculados à meta que
servem. A **Tiny Experiments** (spec 029) é o caso de uso principal desse vínculo: cada
experimento é uma aposta pequena e com prazo para avançar (ou testar) uma meta, onde "falha
vira dado".

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Definir uma meta e acompanhar seu progresso (Priority: P1)

O usuário quer transformar uma intenção ("ler mais", "melhorar a saúde") numa meta concreta.
Ele cria a meta dando um título específico, registra **por que** ela importa (o valor por
trás), opcionalmente associa a uma **área da vida**, define como vai medir o sucesso — uma
**métrica-alvo** (ex.: "12 livros") e/ou uma lista de **marcos** — e um **prazo**. A partir
daí, atualiza o valor atual da métrica e marca os marcos concluídos, vendo uma barra de
progresso. Opcionalmente registra **anti-metas** (o que quer evitar no caminho) e uma nota de
**accountability** (com quem/como vai se responsabilizar).

**Why this priority**: É a unidade mínima de valor — sem definir e medir uma meta, nada mais
existe. Entrega valor sozinha (um painel de metas com progresso) mesmo sem vínculos ou revisão.

**Independent Test**: Criar uma meta com título, porquê, prazo e uma métrica-alvo; atualizar o
valor atual; adicionar dois marcos e concluir um; confirmar que a barra de progresso reflete
métrica e marcos corretamente.

**Acceptance Scenarios**:

1. **Given** que estou na seção de Metas, **When** crio uma meta com título, porquê, prazo e
   métrica-alvo (número + unidade), **Then** ela aparece na lista de metas ativas com progresso
   inicial em zero.
2. **Given** uma meta com métrica-alvo, **When** atualizo o valor atual, **Then** a barra de
   progresso reflete a razão atual/alvo.
3. **Given** uma meta, **When** adiciono marcos e concluo um deles, **Then** o progresso por
   marcos é exibido (ex.: "1 de 3 marcos").
4. **Given** uma meta, **When** registro anti-metas e accountability (opcionais), **Then** eles
   são salvos e exibidos no detalhe da meta.
5. **Given** uma meta existente, **When** edito qualquer campo, **Then** as mudanças persistem e
   o progresso recalcula quando aplicável.

---

### User Story 2 - Vincular experimentos, tarefas e hábitos como o "plano" da meta (Priority: P1)

O usuário quer conectar à meta as ações concretas que a movem. No detalhe da meta, ele
**vincula** itens já existentes na Kaguya — um ou mais **experimentos** (Tiny Experiments),
**tarefas** e **hábitos** — que passam a constar como os "movimentos" do plano daquela meta.
Ele vê esses itens agrupados por tipo, cada um com seu próprio status (ex.: experimento ativo,
tarefa concluída, hábito com sua aderência), e pode **desvincular** quando deixarem de servir
à meta. Assim entende, num só lugar, o que está efetivamente empurrando a meta adiante.

**Why this priority**: É o vínculo central pedido — conecta a camada de direção (meta) às
camadas de execução (experimentos/tarefas/hábitos) que a Kaguya já gerencia. Sem ela, a meta é
só um número solto. Constrói sobre US1 mas é testável de forma independente.

**Independent Test**: Em uma meta existente, vincular um experimento, uma tarefa e um hábito;
confirmar que aparecem agrupados no detalhe da meta com seus status; desvincular um e confirmar
que ele some da meta mas continua existindo na sua própria seção.

**Acceptance Scenarios**:

1. **Given** uma meta e um experimento já criado, **When** vinculo o experimento à meta,
   **Then** ele aparece na seção "movimentos" da meta como experimento, com seu status atual.
2. **Given** uma meta, **When** vinculo uma tarefa e um hábito, **Then** ambos aparecem
   agrupados por tipo no detalhe da meta.
3. **Given** um item vinculado, **When** o desvinculo, **Then** ele some da meta, mas o item
   permanece intacto na sua seção de origem.
4. **Given** uma meta com itens vinculados, **When** consulto o detalhe, **Then** vejo o status
   de cada item (ex.: experimento ativo/encerrado, tarefa aberta/concluída, hábito e sua
   aderência) como contexto do progresso.
5. **Given** que crio um experimento a partir do contexto de uma meta, **When** ele é salvo,
   **Then** já nasce vinculado àquela meta.

---

### User Story 3 - Revisar e encerrar uma meta com um veredicto (Priority: P2)

Ao chegar o prazo (ou quando decidir antes), o usuário revisa a meta: registra um **aprendizado**
e escolhe um **desfecho** — **atingida**, **não atingida** ou **revisar** (replanejar/seguir
adiante de forma diferente). A meta então sai da lista de ativas e passa a constar como
encerrada, preservando o histórico, os itens que estiveram vinculados e a reflexão. A separação
entre metas ativas e encerradas, somada à possibilidade de associar cada meta a uma área da
vida, sustenta a disciplina de "menos é mais" — poucas metas ativas por vez.

**Why this priority**: Fecha o ciclo e dá memória ao planejamento, mas o acompanhamento (US1) e
o vínculo (US2) já entregam valor antes disto existir.

**Independent Test**: Em uma meta ativa, abrir a revisão, escrever um aprendizado, escolher
"atingida" e confirmar; verificar que ela deixa a lista de ativas, aparece entre as encerradas
com desfecho e aprendizado preservados, e que os vínculos históricos permanecem visíveis.

**Acceptance Scenarios**:

1. **Given** uma meta ativa, **When** a encerro com um aprendizado e um desfecho, **Then** ela
   passa a constar como encerrada e some da lista de ativas.
2. **Given** uma meta encerrada, **When** a consulto, **Then** vejo o desfecho, o aprendizado e
   os itens que estiveram vinculados.
3. **Given** uma meta antes do prazo, **When** decido encerrá-la mesmo assim, **Then** o sistema
   permite o encerramento antecipado.
4. **Given** várias metas, **When** filtro/visualizo por área da vida, **Then** vejo quantas
   metas ativas existem em cada área (apoio à decisão "menos é mais").

---

### Edge Cases

- **Prazo no passado**: uma meta cujo prazo já passou e segue ativa é sinalizada como atrasada,
  mas continua editável e encerrável.
- **Meta sem métrica numérica**: permitido — o progresso vem só dos marcos (ou é puramente
  qualitativo até o encerramento).
- **Meta sem marcos e sem métrica**: permitido — serve como meta direcional; progresso só se
  resolve no desfecho da revisão.
- **Valor atual acima do alvo** (ex.: superou a meta): o progresso é exibido como atingido
  (100%) sem erro; o excedente pode ser mostrado mas não quebra a barra.
- **Excluir uma meta**: ação destrutiva — pede confirmação; ao excluir, os itens vinculados são
  **desvinculados** (jamais apagados), continuando a existir nas suas seções.
- **Item já vinculado a outra meta**: o sistema deixa claro se um item pode pertencer a mais de
  uma meta ou só a uma (ver Assumptions); o comportamento é consistente e previsível.
- **Vincular item inexistente/arquivado**: vínculos a itens removidos não quebram a tela; o item
  some da lista de movimentos sem erro.
- **Área da vida**: opcional; metas sem área caem num grupo "sem área".

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST permitir criar uma meta com, no mínimo, um **título** específico e
  um **prazo**.
- **FR-002**: O sistema MUST permitir registrar o **porquê** (motivação/valor) da meta.
- **FR-003**: O sistema MUST permitir associar a meta a uma **área da vida** (opcional) e
  agrupar/visualizar metas por área.
- **FR-004**: O sistema MUST permitir definir como medir o sucesso por uma **métrica-alvo**
  (número + unidade) e/ou por uma lista de **marcos**.
- **FR-005**: O usuário MUST poder **atualizar o valor atual** da métrica e **concluir/reabrir
  marcos**, com o progresso refletindo ambos.
- **FR-006**: O sistema MUST permitir registrar **anti-metas** (o que evitar) e uma nota de
  **accountability** (opcionais).
- **FR-007**: O sistema MUST permitir **editar** e **excluir** uma meta; a exclusão MUST pedir
  confirmação e **desvincular** (nunca apagar) os itens associados.
- **FR-008**: O usuário MUST poder **vincular e desvincular** experimentos (Tiny Experiments),
  tarefas e hábitos a uma meta.
- **FR-009**: O sistema MUST exibir, no detalhe da meta, os itens vinculados **agrupados por
  tipo**, cada um com seu **status atual** (experimento, tarefa, hábito), como contexto do
  progresso.
- **FR-010**: Desvincular ou excluir um item de origem MUST **não** afetar a meta além de
  removê-lo da lista de movimentos; excluir a meta MUST **não** afetar os itens além de
  desvinculá-los.
- **FR-011**: O sistema MUST permitir **criar um experimento já vinculado** a uma meta a partir
  do contexto dela (a partida do vínculo pedido com a spec 029).
- **FR-012**: O sistema MUST exibir o **progresso** de cada meta combinando métrica (atual/alvo)
  e marcos (concluídos/total), tratando valores acima do alvo como atingido sem erro.
- **FR-013**: O usuário MUST poder **encerrar** uma meta por meio de uma **revisão** que registra
  um **aprendizado** e um **desfecho** entre atingida, não atingida ou revisar.
- **FR-014**: O sistema MUST permitir o **encerramento antecipado** (antes do prazo) e MUST
  preservar, nas encerradas, o desfecho, o aprendizado e os vínculos históricos.
- **FR-015**: O sistema MUST separar visualmente metas **ativas** de **encerradas**.
- **FR-016**: O sistema MUST sinalizar metas **ativas com prazo vencido** como atrasadas, sem
  bloquear edição ou encerramento.
- **FR-017**: Datas e o conceito de "hoje"/prazo MUST respeitar o fuso local do usuário (UTC-3).
- **FR-018**: A seção de Metas MUST viver **dentro da Kaguya**, acessível pela navegação do
  domínio, ao lado das demais seções (Tarefas, Hábitos, Meu Dia, Experimentos).

### Key Entities *(include if feature involves data)*

- **Meta (Goal)**: a direção com prazo. Atributos: título (específico), porquê (motivação/valor),
  área da vida (opcional), métrica-alvo (número + unidade, opcional), valor atual da métrica,
  prazo, anti-metas (opcional), accountability (opcional), situação (ativa / encerrada),
  desfecho (atingida / não atingida / revisar, quando encerrada) e aprendizado (texto, quando
  encerrada).
- **Marco (Milestone)**: um passo nomeado dentro de uma meta, com estado concluído/pendente.
  Pertence a uma meta; contribui para o progresso por marcos.
- **Vínculo Meta↔Movimento**: a associação entre uma meta e um item de execução da Kaguya
  (experimento, tarefa ou hábito). Guarda o tipo do item e a referência ao item; não duplica o
  item, apenas o referencia.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: O usuário consegue criar uma meta completa (título + porquê + prazo + métrica ou
  marcos) em menos de **2 minutos**.
- **SC-002**: A partir do detalhe de uma meta, vincular um item existente (experimento, tarefa
  ou hábito) leva no máximo **2 passos** (escolher tipo/item → confirmar).
- **SC-003**: O progresso exibido reflete corretamente **tanto** a métrica (atual/alvo) **quanto**
  os marcos (concluídos/total) em 100% dos casos testados, incluindo o caso de valor acima do
  alvo.
- **SC-004**: 100% das metas encerradas preservam, na consulta posterior, o desfecho, o
  aprendizado e a lista de itens que estiveram vinculados.
- **SC-005**: Excluir uma meta **nunca** apaga itens de execução: a contagem de experimentos,
  tarefas e hábitos nas suas seções permanece inalterada após a exclusão da meta.
- **SC-006**: O usuário consegue ver, por área da vida, quantas metas ativas existem — apoiando a
  decisão de manter poucas metas ativas ao mesmo tempo.

## Assumptions

- **Usuário único**: o sistema atende a uma única pessoa autenticada (o dono do painel), como os
  demais domínios da Kaguya; não há multiusuário nem permissões.
- **Canal nesta fatia**: a interface é o **painel web**. O acompanhamento conversacional pelo bot
  do Telegram fica para uma fatia futura; a regra de negócio deve nascer agnóstica de canal.
- **Vínculo de itens — cardinalidade**: um item de execução (experimento/tarefa/hábito) pode
  pertencer a **no máximo uma** meta por vez (mantém o modelo simples e o progresso não-ambíguo);
  reatribuir a outra meta apenas troca o vínculo. (Decisão revisável no planejamento.)
- **Porquê/valor como texto livre**: nesta versão o "porquê" é texto livre; não há taxonomia
  formal de valores nem os 12 domínios ACT estruturados. A "área da vida" é uma etiqueta simples
  e opcional.
- **Escopo de planejamento**: "tema do ano" e o horizonte trimestral formal (revisões
  periódicas agendadas) ficam **fora de escopo** desta fatia — o foco é a meta individual com
  seus movimentos e revisão de encerramento.
- **Dependências entre specs**: esta feature **estende** a Tiny Experiments (spec 029) e
  reaproveita as seções de **tarefas** (spec 011) e **hábitos** (spec 014-habitos) ao permitir
  vinculá-las a uma meta; nenhuma dessas seções precisa mudar de comportamento próprio — apenas
  passam a poder ser referenciadas por uma meta.
- **Reaproveitamento de UI**: a seção segue os padrões visuais e de navegação já usados pelas
  outras seções da Kaguya (tema, componentes de data, etc.).
