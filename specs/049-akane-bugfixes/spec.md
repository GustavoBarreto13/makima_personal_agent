# Feature Specification: Correções de bugs da Akane (backend, sync Letterboxd, webapp)

**Feature Branch**: `049-akane-bugfixes`

**Created**: 2026-07-07

**Status**: Rascunho — auditoria completa em 2026-07-07 (backend, sync Letterboxd, frontend/API), código ainda não implementado

**Input**: User description: "Correções de bugs da Akane (agente de filmes): get_home quebra com erro de coluna inexistente (d.liked deveria ser m.liked) derrubando a tela Início e o tool do Telegram; sparkline de 7 dias conta filmes soft-deletados; Rewind exibe nome de pessoa normalizado em vez do nome de exibição; paleta de pôster não é determinística entre processos; rating vindo do sync RSS do Letterboxd não é validado/clampado como no import CSV; fallback de data do sync RSS quebra quando falta watchedDate; falha total de fetch do RSS não gera alerta; histograma de notas no Início e no Rewind do webapp sempre mostra zero nas notas inteiras; botão 'Logar filme' não consegue registrar um rewatch de filme já cadastrado; campo de data 'assistido hoje' no modal de log usa UTC, gravando no dia errado após as 21h no horário do Brasil."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Tela Início carrega sem erro (Priority: P1)

Como usuária da Akane, ao abrir a tela Início do webapp (ou pedir o resumo pelo Telegram),
vejo minha atividade recente, sequência de filmes e estatísticas — a tela nunca quebra com
erro de servidor.

**Why this priority**: É a porta de entrada do app; uma tela Início quebrada (erro 500)
torna toda a experiência inutilizável, tanto na web quanto no Telegram.

**Independent Test**: Abrir a tela Início do webapp com dados reais no banco (filmes com
sessões no diário) e confirmar que carrega sem erro; pedir o resumo pelo Telegram e confirmar
resposta sem falha.

**Acceptance Scenarios**:

1. **Given** um usuário com filmes registrados no diário, **When** abre a tela Início,
   **Then** a atividade recente aparece com like/curtida correto por filme, sem erro 500.
2. **Given** o mesmo usuário, **When** pede o resumo da coleção pelo Telegram, **Then**
   recebe a resposta normalmente, sem falha do agente.
3. **Given** filmes excluídos (soft-delete) com sessões nos últimos 7 dias, **When** a
   tela Início calcula a tendência de atividade da semana, **Then** essas sessões não
   entram na contagem.

---

### User Story 2 - Notas exibidas corretamente nos gráficos (Priority: P1)

Como usuária, ao ver o histograma de notas na tela Início e no Rewind anual, quero que as
barras reflitam minhas notas reais — incluindo notas inteiras (1, 2, 3, 4, 5 estrelas), não
só as meias-estrelas.

**Why this priority**: Dado errado visível mina a confiança nos números do app; hoje a
maioria das notas (todas as inteiras) desaparece dos gráficos.

**Independent Test**: Avaliar filmes com notas 1, 2, 3, 4 e 5 (inteiras) e 1.5, 2.5, etc.
(meias) e conferir que todas aparecem nos histogramas da Início e do Rewind.

**Acceptance Scenarios**:

1. **Given** um filme avaliado com nota 4 (inteira), **When** o usuário visualiza o
   histograma de notas na Início, **Then** a barra de "4 estrelas" reflete essa avaliação.
2. **Given** o mesmo cenário no fechamento anual (Rewind), **When** o usuário abre a tela
   Rewind, **Then** o histograma de notas do ano mostra a mesma nota corretamente.
3. **Given** o Rewind exibe as pessoas mais assistidas do ano, **When** o usuário vê o
   nome de um diretor/ator, **Then** o nome aparece com capitalização e acentos normais
   (nome de exibição), não em texto normalizado para busca.

---

### User Story 3 - Registrar reassistida de um filme já no catálogo (Priority: P1)

Como usuária, ao clicar em "Logar filme" e buscar um título que já está na minha coleção,
quero conseguir registrar que assisti de novo (rewatch) — não receber um erro dizendo que
o filme já existe.

**Why this priority**: É o fluxo mais comum de uso recorrente do app (revisitar um filme
já catalogado); hoje ele falha silenciosamente para o usuário.

**Independent Test**: Ter um filme já cadastrado no catálogo; abrir "Logar filme", buscar
o mesmo título e confirmar; a sessão de reassistida é criada sem erro.

**Acceptance Scenarios**:

1. **Given** um filme já cadastrado no catálogo (ex.: já assistido antes), **When** o
   usuário busca esse título em "Logar filme" e seleciona o resultado, **Then** uma nova
   sessão de reassistida é registrada no diário, sem mensagem de erro.
2. **Given** um filme que ainda não está no catálogo, **When** o usuário busca e confirma
   o log, **Then** o filme é criado normalmente e a primeira sessão é registrada (comportamento
   já existente, preservado).
3. **Given** o usuário registra a sessão às 22h no horário do Brasil, **When** confirma sem
   alterar a data padrão, **Then** a sessão é gravada com a data local de hoje (não o dia
   seguinte por causa da conversão para UTC).

---

### User Story 4 - Sincronização confiável com o Letterboxd (Priority: P2)

Como usuária, quero que a sincronização automática com o Letterboxd capture corretamente
minhas sessões (incluindo notas e datas), e que eu seja avisada se a sincronização falhar
por completo, para não perder atividade silenciosamente.

**Why this priority**: A Akane depende do Letterboxd como fonte principal de atividade
recorrente; falhas silenciosas na sincronização geram lacunas na coleção sem que a usuária
saiba.

**Independent Test**: Simular uma entrada do feed do Letterboxd sem data de "assistido" (só
com data de publicação) e confirmar que a sessão é criada com uma data válida; simular
indisponibilidade total do feed e confirmar que um alerta é emitido.

**Acceptance Scenarios**:

1. **Given** uma entrada do feed do Letterboxd sem a data específica de "assistido em",
   **When** a sincronização processa essa entrada, **Then** a sessão é criada usando a data
   de publicação da entrada como aproximação, em vez de ser descartada.
2. **Given** o feed do Letterboxd está indisponível (todas as tentativas falham),
   **When** a sincronização roda, **Then** um alerta é enviado avisando da falha, em vez de
   reportar sucesso sem nenhum dado processado.
3. **Given** uma nota chega da sincronização com valor fora da escala válida (0.5 a 5.0,
   incrementos de 0.5), **When** a sessão é gravada, **Then** o valor é ajustado para os
   limites válidos, do mesmo jeito que já acontece na importação manual do histórico.

### Edge Cases

- Filme com pôster e sem pôster: paleta de cor do pôster deve ser sempre a mesma para o
  mesmo título, em qualquer execução do sistema (hoje pode variar entre reinícios do servidor).
- Usuário sem nenhuma sessão no diário: gráficos e tela Início continuam funcionando (vazios),
  sem quebrar.
- Sincronização do Letterboxd retorna zero itens novos genuinamente (nada assistido desde a
  última vez) — isso não deve gerar alerta de falha; só a indisponibilidade real do feed deve.
- Reassistida registrada no mesmo dia de uma sessão já existente do mesmo filme — ambas
  devem coexistir como sessões distintas.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A tela Início e o resumo de atividade da Akane MUST carregar com sucesso
  sempre que houver dados válidos de filmes e sessões no diário, sem erro de servidor.
- **FR-002**: O cálculo de tendência de atividade recente (últimos 7 dias) MUST excluir
  filmes marcados como excluídos (soft-delete) da contagem.
- **FR-003**: Os histogramas de notas exibidos na tela Início e no fechamento anual (Rewind)
  MUST refletir corretamente todas as notas possíveis, incluindo notas inteiras e meias-notas.
- **FR-004**: A exibição de pessoas mais assistidas (diretores/elenco) no Rewind MUST usar o
  nome de exibição original (capitalização e acentuação corretas), nunca a forma normalizada
  usada internamente para busca.
- **FR-005**: A paleta de cor gerada para pôsteres ausentes MUST ser determinística — o mesmo
  título de filme MUST sempre gerar a mesma paleta, independentemente de reinícios do servidor
  ou de qual processo calculou o valor.
- **FR-006**: A busca de filmes usada no fluxo de registro (log) MUST indicar quando um
  resultado já existe no catálogo do usuário, permitindo registrar uma nova sessão de
  reassistida em vez de tentar recriar o filme.
- **FR-007**: O campo de data "assistido em" no fluxo de registro MUST usar a data local do
  usuário (fuso America/Sao_Paulo) como padrão, nunca a data UTC do dispositivo.
- **FR-008**: A sincronização com o Letterboxd MUST atribuir uma data válida à sessão mesmo
  quando a data específica de "assistido em" não estiver presente na entrada do feed, usando
  a data de publicação da entrada como aproximação.
- **FR-009**: A sincronização com o Letterboxd MUST validar e ajustar aos limites válidos
  (0.5 a 5.0, incrementos de 0.5) qualquer nota recebida do feed, com a mesma regra já aplicada
  na importação manual do histórico.
- **FR-010**: A sincronização com o Letterboxd MUST emitir um alerta quando a busca pelo feed
  falhar completamente (indisponibilidade), distinguindo esse caso de uma sincronização bem-sucedida
  que simplesmente não encontrou itens novos.

### Key Entities

- **Sessão de diário (assistida)**: registro de que um filme foi assistido em uma data,
  com nota, indicador de reassistida e revisão opcional; pertence a um filme do catálogo.
- **Filme**: item do catálogo com pôster, paleta de cor de fallback, e indicador de exclusão
  lógica (soft-delete).
- **Pessoa (elenco/equipe)**: nome associado a um filme, exibido com nome de exibição
  original nas telas de estatísticas.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A tela Início carrega com sucesso em 100% das tentativas com dados válidos
  (zero erros de servidor observados em teste de regressão).
- **SC-002**: Notas inteiras (1 a 5 estrelas) aparecem corretamente nos histogramas da
  Início e do Rewind em 100% dos casos testados.
- **SC-003**: Registrar uma reassistida de um filme já catalogado é concluído sem erro em
  100% das tentativas pelo fluxo "Logar filme".
- **SC-004**: Sessões registradas após as 21h no horário do Brasil usam a data local correta
  em 100% dos casos (sem off-by-one por UTC).
- **SC-005**: Entradas do feed do Letterboxd sem data específica de "assistido em" resultam
  em sessão criada (não descartada) em 100% dos casos de teste.
- **SC-006**: Uma indisponibilidade simulada do feed do Letterboxd gera um alerta em 100%
  das execuções de teste.

## Assumptions

- O usuário está sempre em UTC-3 (America/Sao_Paulo) — convenção global do projeto
  documentada no CLAUDE.md raiz.
- A data de publicação da entrada do feed do Letterboxd é uma aproximação aceitável quando
  a data específica de "assistido em" não está presente (perda de precisão de poucos dias,
  preferível a perder a sessão inteira).
- A escala de nota do Letterboxd (0.5 a 5.0, passo 0.5) é a mesma já usada e validada na
  importação manual do histórico (spec 050) — reaproveitar a mesma regra de validação.
- Ocorrências de bugs de timezone fora do domínio da Akane (outros agentes) são conhecidas
  e ficam fora do escopo desta spec.
- A sincronização e a importação histórica do Letterboxd (execução da carga, lacunas de
  cobertura de arquivos do export) são tratadas na spec 050, não nesta.
- Funcionalidades com backend pronto mas sem acesso pela interface (listas, cofre, heatmap,
  botão de sincronização manual, exclusões) são tratadas na spec 051, não nesta.
