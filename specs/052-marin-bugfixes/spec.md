# Feature Specification: Correções de bugs da Marin (backend + frontend)

**Feature Branch**: `052-marin-bugfixes`

**Created**: 2026-07-07

**Status**: Rascunho — auditoria completa em 2026-07-07, código ainda não implementado

**Input**: User description: "Corrigir os bugs encontrados na auditoria da Marin (agente de
animes), backend e frontend: pôster tipográfico com paleta não-determinística; thumbnails de
episódio nunca preenchidos; deleção de sessão do diário que não reverte estado derivado;
crash potencial no seed do token MAL; estatística de nota média que exclui sessões válidas;
decisão de status de episódio usando UTC em vez do fuso local; carimbo de sincronização
gravado com a data de estreia; ordenação por progresso que não funciona; bug de fuso horário
ao registrar sessão após as 21h; erros de rede silenciosos; rótulo de favoritos sem valor;
telas que não atualizam após ações; e correções de documentação do agente."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Registrar sessão à noite com a data certa (Priority: P1)

Como usuário em fuso UTC-3, quero que ao registrar episódios assistidos depois das 21h a
sessão seja gravada com a data de hoje (data local), e não com a data de amanhã.

**Why this priority**: É o mesmo bug de fuso já corrigido na Violet — corrompe dados reais
do diário (data errada em toda sessão noturna), distorce o heatmap, as estatísticas mensais
e o histórico. É perda de integridade de dados em uso cotidiano.

**Independent Test**: Com o relógio local após as 21h (UTC-3), abrir o modal de registrar
episódio e confirmar que a data sugerida é a de hoje; salvar e verificar que a sessão aparece
no diário no dia de hoje.

**Acceptance Scenarios**:

1. **Given** horário local 22h (UTC-3), **When** o usuário abre o modal de registro de
   episódios, **Then** o campo de data vem preenchido com a data local de hoje (não amanhã).
2. **Given** horário local 22h, **When** o usuário tenta escolher uma data no seletor,
   **Then** o limite máximo permitido é a data local de hoje.
3. **Given** o heatmap de atividade, **When** renderizado em qualquer horário do dia,
   **Then** a grade de dias é construída com datas locais (nunca deslocada pelo UTC).

---

### User Story 2 - Apagar uma sessão do diário reverte o estado do anime (Priority: P1)

Como usuário, quero que ao apagar uma sessão do diário o anime volte ao estado coerente:
episódios daquela sessão desmarcados, e o status "completo" revertido se o anime deixou de
estar completo.

**Why this priority**: Hoje apagar a sessão que completou um anime deixa dados inconsistentes
— o anime continua "completo" com data de término, e os episódios continuam marcados como
assistidos. O diário deixa de ser confiável como registro reconciliável.

**Independent Test**: Completar um anime registrando os episódios finais, apagar essa sessão
e verificar que o anime voltou para "assistindo", sem data de término, com os episódios da
sessão desmarcados.

**Acceptance Scenarios**:

1. **Given** um anime completo cuja última sessão cobriu os episódios finais, **When** o
   usuário apaga essa sessão, **Then** o status volta a "assistindo", a data de término é
   limpa e os episódios da sessão apagada ficam desmarcados.
2. **Given** um anime com várias sessões, **When** o usuário apaga uma sessão intermediária,
   **Then** o contador de episódios assistidos reflete a soma das sessões restantes e apenas
   os episódios cobertos exclusivamente pela sessão apagada são desmarcados.

---

### User Story 3 - Ordenar o catálogo por progresso de verdade (Priority: P2)

Como usuário, quero que a opção "Progresso" na ordenação do catálogo realmente ordene os
animes pelo progresso de episódios, em vez de silenciosamente ordenar por outra coisa.

**Why this priority**: A opção existe na interface e exibe o rótulo "por progresso" na linha
de resultados, mas não faz nada — é uma promessa quebrada visível a cada uso do catálogo.

**Independent Test**: Ter animes com progressos distintos (0%, 50%, 100%), escolher a
ordenação "Progresso" e confirmar que a ordem exibida segue o percentual de episódios
assistidos.

**Acceptance Scenarios**:

1. **Given** animes com progressos diferentes, **When** o usuário escolhe ordenar por
   "Progresso", **Then** os cards aparecem ordenados pelo percentual de episódios assistidos.
2. **Given** a ordenação "Progresso" selecionada, **When** a lista é exibida, **Then** o
   rótulo "por progresso" corresponde à ordenação realmente aplicada.

---

### User Story 4 - Pôsteres tipográficos com cor estável (Priority: P2)

Como usuário, quero que animes sem imagem de pôster mantenham sempre a mesma paleta de cores
no pôster tipográfico, em vez de mudar de cor aleatoriamente de tempos em tempos.

**Why this priority**: A paleta é derivada de um mecanismo que muda a cada reinício do
servidor, então a identidade visual dos cards muda sem motivo — quebra o reconhecimento
visual da coleção e contradiz o comportamento documentado.

**Independent Test**: Anotar a cor do pôster tipográfico de um anime, reiniciar o serviço e
confirmar que a cor permanece a mesma.

**Acceptance Scenarios**:

1. **Given** um anime sem pôster, **When** o serviço é reiniciado, **Then** o pôster
   tipográfico mantém exatamente a mesma paleta de antes.
2. **Given** dois acessos em momentos diferentes, **When** o mesmo anime é exibido em
   qualquer tela (catálogo, home, diário), **Then** a paleta é idêntica em todas.

---

### User Story 5 - Ver miniaturas dos episódios (Priority: P2)

Como usuário, quero ver as miniaturas (thumbnails) dos episódios na tela de detalhe do anime,
que hoje nunca aparecem apesar de a interface estar pronta para exibi-las.

**Why this priority**: Toda a cadeia de exibição existe (banco, API, tela), mas o passo que
busca as imagens nunca é executado — a funcionalidade prometida pela spec original (021)
nunca funcionou.

**Independent Test**: Adicionar um anime que tenha correspondência no serviço de imagens,
abrir o detalhe e confirmar que os episódios exibem miniaturas.

**Acceptance Scenarios**:

1. **Given** um anime recém-adicionado com correspondência no serviço de imagens, **When**
   o usuário abre a tela de detalhe, **Then** os episódios listados exibem miniaturas.
2. **Given** um anime sem correspondência no serviço de imagens, **When** o detalhe é aberto,
   **Then** os episódios aparecem normalmente sem miniatura (sem erro nem espaço quebrado).

---

### User Story 6 - Feedback visível quando algo falha ou muda (Priority: P2)

Como usuário, quero ver um aviso quando uma ação falha (ex.: apagar sessão do diário, carregar
o catálogo ou os lançamentos) e quero que as telas atualizem sozinhas depois de ações que
mudam dados (registrar episódio pelo Home, sincronizar com o MAL).

**Why this priority**: Hoje falhas de rede são engolidas em silêncio — a entrada "reaparece"
sem explicação ou a tela fica vazia como se não houvesse dados — e telas continuam mostrando
dados velhos até o usuário navegar para fora e voltar. Isso mina a confiança na interface.

**Independent Test**: Simular falha de rede ao apagar uma sessão e confirmar que um aviso
aparece; registrar um episódio pelo destaque do Home e confirmar que os blocos do Home
refletem o novo progresso sem precisar renavegar.

**Acceptance Scenarios**:

1. **Given** uma falha de rede ao apagar uma sessão do diário, **When** a exclusão falha,
   **Then** um aviso de erro é exibido e a entrada permanece visível.
2. **Given** uma falha de rede ao carregar catálogo ou lançamentos, **When** a tela abre,
   **Then** o usuário vê um aviso de erro distinguível do estado vazio legítimo.
3. **Given** o usuário registra episódios pelo destaque do Home, **When** o registro é salvo,
   **Then** os blocos do Home (continuar assistindo, contadores) refletem o novo progresso.
4. **Given** uma sincronização com o MAL concluída, **When** ela termina, **Then** os
   contadores da navegação e a barra de próximos episódios são atualizados.

---

### User Story 7 - Estatísticas e metadados corretos (Priority: P3)

Como usuário, quero que a nota média das estatísticas considere todas as sessões avaliadas,
que a decisão de "lançado vs. agendado" dos episódios use meu fuso local, que o rótulo
"💖 favoritos" no Home mostre um valor real (ou seja removido), e que o carimbo interno de
sincronização não seja preenchido com a data de estreia do anime.

**Why this priority**: São incorreções menores e de baixo impacto individual, mas que juntas
degradam a precisão das estatísticas e a semântica dos dados internos.

**Independent Test**: Criar uma sessão com nota mas sem contagem de episódios e confirmar que
ela entra na nota média; conferir o stat-card do Home.

**Acceptance Scenarios**:

1. **Given** uma sessão avaliada sem contagem de episódios informada, **When** as
   estatísticas são calculadas, **Then** a nota dessa sessão entra na média.
2. **Given** um episódio que estreia hoje no fuso local, **When** o status
   lançado/agendado é decidido, **Then** a fronteira do dia usa o fuso America/Sao_Paulo.
3. **Given** o stat-card de nota média no Home, **When** exibido, **Then** o rodapé mostra
   uma contagem real de favoritos ou o rótulo é removido.
4. **Given** um anime adicionado pela busca, **When** gravado no catálogo, **Then** o carimbo
   de última atualização da sincronização não é preenchido com a data de estreia.

---

### User Story 8 - Documentação do agente fiel ao código (Priority: P3)

Como desenvolvedor do projeto, quero que a documentação da Marin reflita o código real, para
não induzir a erros em manutenções futuras.

**Why this priority**: A doc diverge do código em pontos que causariam bugs se seguidos à
risca (nome de coluna do token, precisão de nota, intervalos de rate limit, host de API,
módulo de calendário não documentado).

**Independent Test**: Ler a documentação da Marin e conferir cada afirmação contra schema e
código.

**Acceptance Scenarios**:

1. **Given** a documentação da Marin, **When** comparada ao schema e código, **Then** o nome
   da coluna de expiração do token, a precisão dos campos de nota, o intervalo de rate limit
   e o host do serviço de mapeamento de IDs estão corretos.
2. **Given** a lista de módulos do agente, **When** consultada, **Then** o provedor de
   calendário e o campo de carimbo de sincronização estão documentados.

---

### Edge Cases

- O que acontece ao apagar a única sessão de um anime? O contador volta a zero, o status e a
  data de início/término derivadas devem voltar ao estado anterior coerente.
- Sessões sobrepostas cobrindo o mesmo episódio: apagar uma delas não deve desmarcar um
  episódio ainda coberto por outra sessão.
- Anime sem correspondência no serviço de imagens externas (miniaturas): fluxo segue sem
  erro e sem tentativa repetida a cada visualização.
- Variável de ambiente do token MAL com data sem fuso: o sistema deve interpretá-la sem
  quebrar (assumindo UTC) em vez de falhar na primeira verificação de expiração.
- Ordenação por progresso com animes sem total de episódios conhecido: definir posição
  estável (ex.: tratá-los como 0% ou ao final da lista).
- Falha de rede intermitente: avisos de erro não devem se acumular em duplicata.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema DEVE derivar a paleta do pôster tipográfico de forma determinística
  a partir do título, estável entre reinícios e processos.
- **FR-002**: O fluxo de enriquecimento de metadados DEVE buscar e gravar as miniaturas dos
  episódios quando houver correspondência no serviço de imagens, e a tela de detalhe DEVE
  exibi-las.
- **FR-003**: Apagar uma sessão do diário DEVE reverter o estado derivado: recalcular o
  contador de episódios, desmarcar episódios cobertos exclusivamente pela sessão apagada e
  reverter status "completo"/data de término quando aplicável.
- **FR-004**: A inicialização do token MAL a partir de variável de ambiente DEVE aceitar
  datas sem indicação de fuso sem gerar erro (normalizando para UTC).
- **FR-005**: A nota média das estatísticas DEVE incluir sessões avaliadas mesmo quando a
  contagem de episódios da sessão não foi informada.
- **FR-006**: A decisão de status lançado/agendado de episódios DEVE usar a data local
  (America/Sao_Paulo), conforme a convenção global do projeto.
- **FR-007**: Ao adicionar um anime, o carimbo de última atualização da sincronização NÃO
  DEVE ser preenchido com a data de estreia; deve ficar vazio até a primeira sincronização
  real.
- **FR-008**: A ordenação "Progresso" do catálogo DEVE ordenar pelo percentual de episódios
  assistidos, aceita pela API de listagem.
- **FR-009**: Todo campo de data preenchido com "hoje" no frontend da Marin DEVE usar a data
  local do navegador (helper de data local próprio do shell), nunca a data UTC — incluindo o
  valor padrão e o limite máximo do registro de sessão e a grade do heatmap.
- **FR-010**: Falhas de rede em ações do usuário (apagar sessão) e em carregamentos de tela
  (catálogo, lançamentos) DEVEM exibir aviso visível, distinguível do estado vazio.
- **FR-011**: Após registrar episódios pelo Home ou concluir sincronização com o MAL, os
  blocos dependentes (Home, contadores de navegação, barra de próximos) DEVEM ser
  recarregados automaticamente.
- **FR-012**: A documentação do agente DEVE ser corrigida: nome real da coluna de expiração
  do token, precisão real dos campos de nota, intervalo real de rate limit, host real do
  serviço de mapeamento de IDs, e inclusão do provedor de calendário e do campo de carimbo
  de sincronização.

### Key Entities

- **Anime**: item do catálogo com status, progresso de episódios, nota, datas de início e
  término e carimbo de sincronização.
- **Sessão do diário (watch log)**: registro de episódios assistidos em uma data, com nota e
  notas opcionais; fonte da verdade do progresso.
- **Episódio**: unidade com número, título, data de exibição, marcação de assistido e
  miniatura opcional.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% das sessões registradas após as 21h (UTC-3) ficam gravadas com a data
  local correta.
- **SC-002**: Apagar qualquer sessão deixa o anime em estado consistente (contador, episódios,
  status e datas coerentes) em 100% dos casos testados.
- **SC-003**: A paleta do pôster tipográfico de um mesmo anime é idêntica antes e depois de
  um reinício do serviço.
- **SC-004**: Animes com correspondência no serviço de imagens exibem miniaturas de episódio
  na tela de detalhe.
- **SC-005**: Escolher "Progresso" no catálogo produz ordem visivelmente decrescente (ou
  crescente) de percentual assistido.
- **SC-006**: Nenhuma ação de usuário falha em silêncio: toda falha de rede exibe aviso.
- **SC-007**: Após registrar episódio ou sincronizar, os dados exibidos refletem a mudança
  sem necessidade de renavegar.
- **SC-008**: Zero divergências entre a documentação do agente e o schema/código nos pontos
  auditados.

## Assumptions

- A troca do mecanismo de derivação da paleta muda a cor de alguns pôsteres tipográficos uma
  única vez (nova base determinística); isso é aceitável e esperado.
- As miniaturas de episódio são buscadas no momento do enriquecimento (adição do anime e
  backfill), não sob demanda a cada visualização.
- Para "episódios cobertos exclusivamente pela sessão apagada", a reconstrução pode ser feita
  a partir das sessões restantes (re-derivar marcações do zero é aceitável).
- O aviso de erro reutiliza o componente de toast já existente no shell da Marin.
- A correção de fuso segue o padrão canônico do projeto (helper de data local por shell,
  como Violet/Nami); a Marin ganha o seu próprio helper.
- Animes sem total de episódios conhecido são ordenados como 0% de progresso.
