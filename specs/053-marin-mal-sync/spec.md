# Feature Specification: Sincronização bidirecional e agendada com o MyAnimeList

**Feature Branch**: `053-marin-mal-sync`

**Created**: 2026-07-07

**Status**: Rascunho — auditoria completa em 2026-07-07, código ainda não implementado

**Input**: User description: "O diário local da Marin e a lista do MyAnimeList devem ser
espelhos: marquei assistido em um, reflete no outro. Registrar episódios, mudar status ou dar
nota localmente deve propagar para o MAL; progresso vindo do MAL deve entrar no diário local
(hoje o pull grava o contador direto sem criar sessões, e o próximo registro local sobrescreve
o valor do MAL). Além disso, a sincronização deve rodar sozinha em agenda (hoje só existe
disparo manual) e os animes importados do MAL devem receber metadados completos
automaticamente (pôster, gêneros, estúdio, total de episódios), sem depender de script
manual. Animes que chegam completos pelo MAL devem ficar com episódios marcados e data de
término coerente."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Marquei aqui, aparece lá (push local → MAL) (Priority: P1)

Como usuário, quero que ao registrar episódios, mudar o status ou dar nota a um anime pela
Marin (Telegram ou webapp), essa mudança apareça na minha lista do MyAnimeList sem eu precisar
atualizar lá manualmente.

**Why this priority**: É o coração do requisito "espelho". Hoje o fluxo só existe na direção
MAL → local; tudo que eu faço na Marin fica invisível no MAL, obrigando dupla digitação — o
que na prática faz o usuário abandonar um dos dois lados.

**Independent Test**: Registrar 2 episódios de um anime pela Marin e conferir na lista do
MyAnimeList que o contador de episódios subiu.

**Acceptance Scenarios**:

1. **Given** um anime vinculado ao MAL em "assistindo", **When** o usuário registra episódios
   pela Marin, **Then** o contador de episódios assistidos no MAL é atualizado para o novo
   total.
2. **Given** um anime vinculado ao MAL, **When** o usuário muda o status na Marin (ex.: para
   "completo" ou "pausado"), **Then** o status equivalente é aplicado na lista do MAL.
3. **Given** um anime vinculado ao MAL, **When** o usuário dá uma nota pela Marin, **Then**
   a nota é refletida no MAL (na escala do MAL).
4. **Given** o MAL fora do ar ou com erro, **When** o usuário registra um episódio, **Then**
   o registro local é salvo normalmente e a propagação falha de forma silenciosa e
   recuperável (o espelho converge na próxima sincronização).
5. **Given** um anime sem vínculo com o MAL (adicionado só localmente sem id do MAL),
   **When** o usuário registra progresso, **Then** nada é enviado ao MAL e nenhum erro é
   exibido.

---

### User Story 2 - Marquei lá, aparece aqui como diário (pull MAL → diário) (Priority: P1)

Como usuário, quero que o progresso registrado no MyAnimeList (pelo app ou site) entre no
diário da Marin como sessões de fato — não apenas como um contador solto — para que heatmap,
histórico e estatísticas reflitam o que assisti, e para que um registro local posterior não
apague o progresso vindo do MAL.

**Why this priority**: Hoje o pull grava o contador de episódios diretamente, sem criar
sessões no diário. Como o diário recalcula o contador a partir das sessões, o primeiro
registro local depois de um pull sobrescreve o valor do MAL (ex.: MAL diz 12 episódios, o
usuário loga 1 pela Marin e o total vira 1). É corrupção de dados real no fluxo principal.

**Independent Test**: Marcar 3 episódios no MAL, rodar a sincronização, conferir que o diário
da Marin ganhou uma sessão cobrindo esses episódios; registrar mais 1 episódio pela Marin e
conferir que o total é 4 (não 1).

**Acceptance Scenarios**:

1. **Given** progresso novo no MAL (episódios a mais que o local), **When** a sincronização
   roda, **Then** uma sessão de ajuste é criada no diário cobrindo os episódios novos, os
   episódios correspondentes ficam marcados como assistidos e o contador local converge para
   o valor do MAL.
2. **Given** um pull que trouxe progresso do MAL, **When** o usuário registra uma nova sessão
   local, **Then** o contador soma corretamente (progresso do MAL + sessão nova), sem
   sobrescrever nada.
3. **Given** progresso no MAL menor que o local (ex.: usuário corrigiu no MAL para menos),
   **When** a sincronização roda, **Then** o sistema converge para um estado consistente sem
   duplicar sessões (estratégia de reconciliação definida e documentada).
4. **Given** um anime marcado como completo no MAL, **When** a sincronização roda, **Then**
   o anime local fica completo com todos os episódios marcados e data de término preenchida
   (a data real do MAL quando disponível; senão, a data da sincronização).

---

### User Story 3 - Sincronização automática em agenda (Priority: P2)

Como usuário, quero que a sincronização com o MAL rode sozinha em intervalo regular, como já
acontece com o Letterboxd na Akane, para que os dois lados fiquem próximos sem eu precisar
apertar "Sync".

**Why this priority**: Sem agenda, o espelho só converge quando o usuário lembra de disparar
manualmente — o que anula o valor do espelho. A infraestrutura de agendamento (scheduler com
histórico e alerta de falha) já existe e é só aderir ao padrão.

**Independent Test**: Conferir que o job aparece na lista de jobs agendados, roda no horário
previsto, grava histórico de execução e alerta no Telegram em caso de falha.

**Acceptance Scenarios**:

1. **Given** o agendador em execução, **When** o intervalo configurado passa, **Then** a
   sincronização delta com o MAL roda automaticamente e grava seu resultado no histórico de
   execuções.
2. **Given** uma execução agendada que falha, **When** o erro ocorre, **Then** um alerta é
   enviado ao Telegram (padrão dos demais jobs).
3. **Given** o botão "Sync MAL" do webapp, **When** o usuário clica, **Then** ele continua
   funcionando como disparo manual, coexistindo com a agenda.

---

### User Story 4 - Animes importados chegam completos (metadados) (Priority: P2)

Como usuário, quero que animes que entram pelo sync do MAL apareçam com pôster, gêneros,
estúdio e total de episódios — sem que eu precise rodar um script manual de backfill.

**Why this priority**: Hoje o sync importa apenas título/status/progresso/nota; o anime fica
"pelado" no catálogo (sem pôster, sem gêneros, com agenda de episódios vazia) até alguém rodar
o script de enriquecimento manualmente no servidor.

**Independent Test**: Adicionar um anime novo direto no MAL, aguardar a sincronização agendada
e conferir que ele aparece no catálogo da Marin com pôster, gêneros, estúdio e episódios.

**Acceptance Scenarios**:

1. **Given** um anime novo na lista do MAL, **When** a sincronização o importa, **Then** o
   enriquecimento de metadados roda automaticamente na sequência (pôster, gêneros, estúdio,
   total e lista de episódios).
2. **Given** um anime importado cujo enriquecimento falhou (ex.: serviço externo fora),
   **When** a próxima execução roda, **Then** o enriquecimento é reter tentado para os animes
   ainda sem metadados.

---

### Edge Cases

- **Anti-eco**: progresso que acabou de chegar do MAL não deve ser reenviado ao MAL no push
  (e vice-versa) — o sistema precisa distinguir a origem da mudança para não criar loop.
- Conflito simultâneo (mudança local e no MAL entre duas sincronizações): definir vencedor
  determinístico (ex.: maior progresso vence; para status/nota, o mais recente conhecido).
- Exclusão local de sessão que já foi propagada ao MAL: o contador do MAL deve ser reduzido
  no push seguinte (ou na sincronização), não permanecer inflado para sempre.
- Anime excluído localmente (soft-delete): o pull não deve ressuscitá-lo silenciosamente;
  definir comportamento (ignorar ou reativar com aviso).
- Token do MAL expirado ou revogado durante job agendado: falha alertada, sem corromper o
  estado de sincronização; próxima execução retoma do ponto certo.
- Sessão de ajuste criada pelo pull: deve ser identificável como vinda da sincronização
  (para exibição no diário e para o anti-eco), com data coerente (data da atualização no MAL
  quando disponível).
- Rate limit do MAL/serviços de metadados em listas grandes: a execução deve respeitar os
  limites e concluir mesmo que demore.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Registrar episódios, mudar status, dar nota, apagar sessão e excluir anime na
  Marin DEVEM propagar a mudança correspondente à lista do MAL para animes vinculados,
  de forma best-effort: falha na propagação nunca bloqueia nem desfaz a operação local.
- **FR-002**: A sincronização (pull) DEVE converter progresso novo do MAL em sessões do
  diário local (sessões de ajuste), marcando os episódios correspondentes, de modo que o
  contador local seja sempre derivável das sessões.
- **FR-003**: O sistema DEVE registrar a origem de cada mudança (local ou sincronização) e
  usar essa origem para impedir eco entre push e pull.
- **FR-004**: Divergências entre local e MAL DEVEM convergir de forma determinística e
  documentada em até um ciclo de sincronização.
- **FR-005**: Animes completos no MAL DEVEM resultar em estado local completo: episódios
  populados e marcados, status "completo" e data de término preenchida.
- **FR-006**: A sincronização delta com o MAL DEVE rodar automaticamente em agenda no
  agendador existente, com histórico de execução e alerta de falha no Telegram, coexistindo
  com o disparo manual.
- **FR-007**: Animes importados pelo sync DEVEM ser enriquecidos automaticamente com
  metadados (pôster, gêneros, estúdio, total e lista de episódios), com nova tentativa em
  execuções seguintes para os que falharem.
- **FR-008**: A conversão de escalas de nota (local 0–10 em passos de 0,5 ↔ MAL 1–10
  inteiro) DEVE ser definida e aplicada de forma consistente nas duas direções.
- **FR-009**: O mapeamento de status locais ↔ status do MAL (assistindo, completo, pausado,
  abandonado, quero assistir) DEVE ser bijetivo e documentado.

### Key Entities

- **Anime**: item do catálogo, vinculado (ou não) a uma entrada do MAL pelo identificador do
  MAL; carrega progresso, status, nota e carimbo da última mudança conhecida no MAL.
- **Sessão do diário (watch log)**: registro de episódios assistidos; passa a ter uma origem
  (registro manual ou ajuste de sincronização).
- **Estado de sincronização**: marca d'água da última sincronização bem-sucedida, usada pelo
  delta.
- **Execução agendada**: registro histórico de cada rodada (duração, resultado, erros),
  no padrão do agendador existente.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Uma mudança feita em qualquer um dos lados (Marin ou MAL) aparece no outro em
  no máximo um ciclo de sincronização, em 100% dos casos testados.
- **SC-002**: Zero casos de progresso "regredido" após combinação pull + registro local
  (cenário MAL=12 → loga 1 → total 13, nunca 1).
- **SC-003**: Zero loops de eco observados em ciclos consecutivos de sincronização sem
  mudanças novas (sync estável = nenhuma escrita).
- **SC-004**: 100% dos animes importados do MAL exibem pôster, gêneros e total de episódios
  no catálogo após o ciclo de enriquecimento.
- **SC-005**: A sincronização agendada roda no intervalo configurado com histórico visível e
  alerta em falha, sem intervenção manual por pelo menos uma semana contínua.
- **SC-006**: O diário local continua sendo a fonte derivável do progresso: recalcular o
  contador a partir das sessões reproduz o valor exibido em 100% dos animes.

## Assumptions

- O usuário mantém conta ativa no MAL com a autorização OAuth já concedida (fluxo de
  autorização existente); renovação automática de token já funciona.
- O espelhamento cobre progresso de episódios, status e nota. Notas de texto, tags e
  favoritos do MAL ficam fora do escopo.
- Sessões de ajuste vindas do pull entram no diário com a data da última atualização da
  entrada no MAL (quando disponível) e são visualmente identificáveis como "via MAL".
- Em conflito de progresso simultâneo, vale o maior progresso; em conflito de status/nota,
  vale a mudança mais recente conhecida.
- O intervalo padrão da agenda segue o padrão do Letterboxd na Akane (a cada 6 horas),
  ajustável na configuração do agendador.
- Rebaixamento de progresso no MAL (caso raro) converge sem criar sessões negativas —
  a estratégia exata fica para o plano técnico, desde que atenda FR-004 e SC-006.
