# Feature Specification: Unificar progresso, diário e estatísticas das séries

**Feature Branch**: `056-mai-progresso-diario`

**Created**: 2026-07-07

**Status**: Rascunho — auditoria completa em 2026-07-07, código ainda não implementado

**Input**: User description: "A Mai tem dois sistemas de progresso que não conversam: os
checkboxes de episódio/temporada (fluxo principal da interface) marcam episódios e recomputam
o contador via contagem, mas não criam nenhuma sessão no diário; já o registro de sessão grava
no diário e INCREMENTA o contador — modelo incompatível: qualquer toggle posterior recomputa e
sobrescreve (rewatch perdido, sessão por contagem manual zerada, logs sobrepostos inflam o
contador). Como TODAS as estatísticas (totais do ano, heatmap, destaque, gêneros, emissoras)
derivam exclusivamente do diário, quem usa checkboxes tem Stats e Heatmap completamente
vazios. Além disso: série 100% assistida nunca vira 'concluída' automaticamente (a data de
conclusão documentada como inferida nunca é inferida); não existe forma de excluir ou corrigir
uma sessão do diário (erro de log é permanente); e o status de lançamento dos episódios
(lançado/agendado) é congelado no momento do sync — como a Mai não tem NENHUM job agendado no
scheduler, um episódio que estreou ontem fica 'agendado' para sempre e 'Marcar temporada' o
ignora em silêncio. Unificar: toda marcação gera sessão no diário, contador sempre por
contagem, conclusão automática, exclusão de sessão com reversão, e job agendado de re-sync
de metadados/lançamentos no padrão do scheduler (Akane tem Letterboxd a cada 6h)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Marcar episódios alimenta o diário e as estatísticas (Priority: P1)

Como usuário que acompanha séries marcando episódios pelos checkboxes (o fluxo principal da
interface), quero que essas marcações contem como atividade: apareçam no diário, no heatmap,
nos totais do ano e no destaque. Hoje as estatísticas só enxergam sessões registradas pelo
modal — quem usa checkbox tem a tela de Stats vazia mesmo com centenas de episódios vistos.

**Why this priority**: É a falha mais visível da auditoria — uma feature inteira
(estatísticas/heatmap/destaque) inoperante para o modo de uso dominante. Une as duas fontes
de verdade num modelo só.

**Independent Test**: Em um acervo zerado, marcar 5 episódios pelo acordeão de temporadas e
confirmar que o diário mostra a atividade, o heatmap soma no dia local e os totais do ano
refletem os 5 episódios.

**Acceptance Scenarios**:

1. **Given** uma série no catálogo, **When** o usuário marca episódios pelo checkbox (um ou
   a temporada inteira), **Then** a atividade correspondente passa a existir no diário com a
   data local do dia.
2. **Given** episódios marcados via checkbox, **When** o usuário abre Stats e Heatmap,
   **Then** os totais do ano, o heatmap e o destaque refletem essas marcações.
3. **Given** um episódio desmarcado (correção), **When** as estatísticas recarregam, **Then**
   a atividade correspondente é removida ou ajustada — sem resíduo.
4. **Given** uma sessão registrada pelo modal (com nota e comentário), **When** o diário é
   exibido, **Then** ela aparece como hoje, com nota e review preservadas.

---

### User Story 2 - Contador de progresso sempre correto (Priority: P1)

Como usuário, quero que o progresso exibido (episódios assistidos / total) seja sempre
consistente, não importa se marquei pelo checkbox ou registrei sessão pelo modal. Hoje os
dois caminhos usam modelos incompatíveis (incremento vs recontagem): registrar sessões e
depois tocar um checkbox sobrescreve o contador, rewatch se perde e sessões "por contagem"
somem na recontagem seguinte.

**Why this priority**: Corrupção de dados ativa — o número de progresso muda sozinho
dependendo da ordem das ações. A própria documentação do agente proíbe incremento e o código
viola.

**Independent Test**: Registrar uma sessão de 3 episódios pelo modal, depois marcar 1
episódio via checkbox, e confirmar que o progresso reflete o total real de episódios
assistidos (não regride nem infla).

**Acceptance Scenarios**:

1. **Given** qualquer sequência intercalada de sessões pelo modal e toggles de checkbox,
   **When** o progresso é exibido, **Then** ele corresponde à contagem real de episódios
   distintos assistidos.
2. **Given** uma sessão que cobre episódios já assistidos (rewatch), **When** registrada,
   **Then** o progresso não infla além do total de episódios distintos; o rewatch permanece
   visível como atividade no diário.
3. **Given** uma sessão registrada "por contagem" (sem episódios específicos), **When**
   registrada, **Then** ela conta na atividade do diário e o comportamento sobre o progresso
   é definido e estável (não é apagado pela próxima recontagem).
4. **Given** sessões sobrepostas, **When** registradas, **Then** o progresso nunca excede o
   total de episódios da série.

---

### User Story 3 - Conclusão automática da série (Priority: P2)

Como usuário, quero que ao assistir o último episódio a série vire "concluída" sozinha, com a
data de conclusão registrada — hoje ela fica como "assistindo" para sempre até eu mudar o
status manualmente, e a data de conclusão (documentada como inferida) nunca é preenchida.

**Why this priority**: Automatização prometida pela documentação e esperada pelo usuário;
alimenta as estatísticas de conclusão. Depende do modelo unificado das US1/US2.

**Independent Test**: Marcar todos os episódios lançados de uma série finalizada e confirmar
que o status muda para "concluída" com a data local do dia.

**Acceptance Scenarios**:

1. **Given** uma série finalizada com todos os episódios lançados, **When** o usuário marca o
   último episódio restante (por checkbox ou sessão), **Then** o status muda para "concluída"
   e a data de conclusão é gravada com o dia local.
2. **Given** uma série ainda no ar com todos os episódios LANÇADOS assistidos, **When** o
   progresso completa o disponível, **Then** a série NÃO vira "concluída" (ainda há episódios
   futuros) — permanece "assistindo".
3. **Given** uma série concluída automaticamente, **When** o usuário desmarca um episódio,
   **Then** o status reverte para "assistindo" e a data de conclusão é limpa.

---

### User Story 4 - Excluir ou corrigir uma sessão do diário (Priority: P2)

Como usuário, quero poder apagar uma sessão registrada por engano (data, episódios ou nota
errados) e ter os efeitos revertidos — hoje um log errado é permanente. Akane e Marin já têm
exclusão de sessão; a Mai é a única sem.

**Why this priority**: Sem correção de erros, o diário e as estatísticas acumulam lixo sem
remédio. Paridade com os agentes irmãos.

**Independent Test**: Registrar uma sessão errada, excluí-la pelo Diário e confirmar que
progresso, episódios marcados, status e estatísticas voltam ao estado anterior.

**Acceptance Scenarios**:

1. **Given** uma sessão no Diário, **When** o usuário a exclui, **Then** ela some da lista e
   os efeitos derivados (episódios marcados por ela, progresso, conclusão automática, dados
   do ano) são revertidos de forma consistente.
2. **Given** a exclusão de uma sessão cujos episódios também foram cobertos por outra sessão,
   **When** revertida, **Then** os episódios cobertos pela outra sessão permanecem marcados.
3. **Given** falha ao excluir, **When** a operação aborta, **Then** nada muda (tudo-ou-nada)
   e o usuário vê aviso de erro.

---

### User Story 5 - Lançamentos sempre atualizados (job agendado) (Priority: P2)

Como usuário, quero que os episódios que estrearam apareçam como lançados sem eu precisar
sincronizar manualmente — hoje o status lançado/agendado é congelado no momento do sync, a
Mai não tem nenhum job agendado, e "Marcar temporada" ignora silenciosamente episódios que já
estrearam mas constam como agendados.

**Why this priority**: Causa raiz de comportamento silenciosamente errado no fluxo principal
(marcar temporada) e da agenda desatualizada. Paridade com Akane (sync agendado a cada 6h).

**Independent Test**: Com uma série no ar cujo episódio estreou ontem, aguardar a execução do
job agendado (ou dispará-lo manualmente) e confirmar que o episódio consta como lançado e
pode ser marcado.

**Acceptance Scenarios**:

1. **Given** um episódio com data de estreia no passado ainda constando "agendado", **When**
   o job agendado roda, **Then** ele passa a "lançado" e fica marcável.
2. **Given** séries em acompanhamento (não finalizadas), **When** o job roda, **Then**
   metadados e novos episódios/temporadas são atualizados sem intervenção manual.
3. **Given** uma execução do job, **When** ela termina, **Then** fica registrada no histórico
   de execuções do agendador; em falha, o alerta padrão é disparado.
4. **Given** "Marcar temporada" com episódios ainda de fato futuros, **When** executado,
   **Then** o usuário é informado de quantos episódios ficaram de fora por não terem sido
   lançados (nada é ignorado em silêncio).

---

### Edge Cases

- Migração do histórico: marcações de episódios feitas antes desta mudança (sem sessão no
  diário) devem passar a contar nas estatísticas — definir carga retroativa a partir das
  datas de visualização já gravadas.
- Marcar temporada inteira gera atividade agregada (uma sessão pela temporada), não uma
  sessão por episódio — evitar poluir o diário.
- Desmarcar episódio cuja sessão veio do modal com review: a review não pode ser destruída
  sem confirmação.
- Série sem número total de episódios conhecido (em produção): conclusão automática não
  dispara; progresso exibe contagem absoluta.
- Job agendado com API do TMDB fora do ar: falha registrada e alertada, sem corromper estado;
  próxima execução recupera.
- Duas marcações simultâneas (duas abas): recontagem por contagem garante convergência.
- Fuso horário: todas as datas derivadas neste modelo seguem a spec 055 (dia local UTC-3).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Toda marcação de episódio/temporada pelos checkboxes DEVE gerar atividade
  correspondente no diário (com a data local), de forma que diário e episódios marcados
  descrevam a mesma realidade.
- **FR-002**: O contador de progresso DEVE ser sempre derivado por contagem de episódios
  distintos assistidos — nunca por incremento; registrar sessão pelo modal também marca os
  episódios cobertos e recomputa.
- **FR-003**: As estatísticas anuais (totais, heatmap, destaque, gêneros, emissoras) DEVEM
  refletir toda a atividade, independentemente do caminho de registro (checkbox ou modal).
- **FR-004**: Rewatch e sessões sobrepostas NÃO PODEM inflar o progresso além do total de
  episódios distintos; a atividade de rewatch permanece registrada no diário.
- **FR-005**: Quando todos os episódios de uma série finalizada estiverem assistidos, o
  status DEVE mudar automaticamente para "concluída" com data de conclusão no dia local;
  desmarcar reverte status e data.
- **FR-006**: O usuário DEVE poder excluir uma sessão do diário pela interface, com reversão
  atômica dos efeitos derivados (episódios marcados exclusivamente por ela, progresso,
  conclusão, estatísticas).
- **FR-007**: DEVE existir um job agendado da Mai no agendador do sistema que re-sincroniza
  metadados e lançamentos das séries em acompanhamento, atualizando o status
  lançado/agendado dos episódios; execução registrada no histórico e falha alertada, no
  padrão dos jobs existentes.
- **FR-008**: "Marcar temporada" DEVE informar quantos episódios ficaram de fora por serem
  futuros — nunca ignorar em silêncio.
- **FR-009**: O status lançado/agendado usado nas decisões de marcação DEVE considerar a data
  de estreia em relação ao dia local (não depender exclusivamente do valor congelado no
  último sync).
- **FR-010**: O histórico existente (episódios já marcados sem sessão no diário) DEVE ser
  incorporado às estatísticas por carga retroativa única, usando as datas de visualização já
  gravadas.

### Key Entities

- **Episódio assistido**: fonte de verdade do progresso (contagem de distintos).
- **Sessão (diário)**: registro de atividade com data local, nota e review; gerada por
  qualquer caminho de marcação.
- **Série**: status derivável (conclusão automática) com data de conclusão inferida.
- **Job agendado**: execução periódica de re-sync com histórico e alerta de falha.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Usuário que só usa checkboxes vê estatísticas, heatmap e destaque do ano
  refletindo 100% da sua atividade (hoje: zero).
- **SC-002**: Em qualquer sequência intercalada de sessões e toggles, o progresso exibido é
  igual à contagem real de episódios distintos assistidos em 100% dos casos testados.
- **SC-003**: Completar a última exibição de uma série finalizada muda o status para
  "concluída" com data correta sem ação manual, em 100% dos casos.
- **SC-004**: Excluir uma sessão reverte todos os efeitos derivados; nenhum resíduo em
  progresso, episódios ou estatísticas nos casos testados.
- **SC-005**: Episódios que estrearam constam como lançados no máximo N horas após a estreia
  (N = intervalo do job), sem sync manual.
- **SC-006**: Zero perda de reviews/notas existentes após a migração do modelo.

## Assumptions

- A fonte de verdade do progresso passa a ser a contagem de episódios distintos assistidos;
  o diário é o registro de atividade (inclusive rewatch), no espírito do modelo já documentado
  do agente ("contador via COUNT, nunca incremento").
- Marcar temporada gera uma atividade agregada no diário (não uma por episódio).
- O job agendado roda em intervalo comparável ao da Akane (a cada 6 horas ou diário —
  decisão fina no plano técnico), reutilizando o padrão declarativo do agendador existente.
- A carga retroativa usa as datas de visualização já gravadas nos episódios; onde ausentes,
  usa a melhor aproximação disponível (documentada na migração).
- A exclusão de sessão pela interface entra no Diário da Mai (padrão dos irmãos); edição
  completa de sessão (mudar data/nota) pode ser limitada a excluir-e-recriar nesta fase.
- Correções de fuso horário das datas envolvidas são objeto da spec 055 e valem aqui.
