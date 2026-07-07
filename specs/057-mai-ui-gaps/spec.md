# Feature Specification: Expor na interface as funcionalidades de séries prontas ou prometidas

**Feature Branch**: `057-mai-ui-gaps`

**Created**: 2026-07-07

**Status**: Rascunho — auditoria completa em 2026-07-07, código ainda não implementado

**Input**: User description: "Expor pela interface web da Mai funcionalidades que já têm
suporte parcial mas nenhum acesso pela UI, e trazer para as séries as funcionalidades de
paridade já existentes na Akane (filmes) e Marin (animes): editar as notas de uma série pela
tela de detalhe (o endpoint e a função de API existem, a seção renderiza, mas não há editor —
recurso pela metade); listas/coleções personalizadas com tela própria e adição pelo detalhe;
etiquetas (tags) com tela própria (a coluna existe no banco e no tipo do frontend, mas
nenhuma tool grava e nenhuma tela lê); ordenação do catálogo e filtro por gênero (o backend
já filtra por gênero, a UI não expõe; ordenação não existe no servidor); e o Rewind anual
(retrospectiva do ano) como a Akane tem. Favoritos permanecem em localStorage (fora do
escopo, decisão do usuário)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Escrever as notas de uma série (Priority: P1)

Como usuário, quero escrever e editar as anotações pessoais de uma série pela tela de
detalhe — hoje a seção "Notas" só aparece se já houver texto vindo do bot, e não existe
nenhum meio de criar ou editar esse texto pela interface, apesar de o suporte de gravação já
existir por completo no servidor.

**Why this priority**: É o recurso pela metade mais flagrante da auditoria: endpoint de
escrita, função do cliente de API e seção de exibição existem — falta só o editor. Akane já
tem o fluxo completo; é o menor esforço com maior destravamento.

**Independent Test**: Abrir o detalhe de uma série sem notas, escrever um texto, salvar,
recarregar e confirmar que a seção "Notas" exibe o texto.

**Acceptance Scenarios**:

1. **Given** uma série sem notas, **When** o usuário escreve um texto e salva, **Then** o
   texto persiste e a seção passa a exibi-lo.
2. **Given** uma série com notas, **When** o usuário edita o texto, **Then** a versão nova
   substitui a anterior.
3. **Given** uma série com notas, **When** o usuário apaga todo o texto e salva, **Then** a
   seção volta ao estado vazio.
4. **Given** falha ao salvar, **When** a operação aborta, **Then** o usuário vê aviso de erro
   e o texto digitado não é perdido.

---

### User Story 2 - Ordenar e filtrar o catálogo (Priority: P2)

Como usuário com acervo grande, quero ordenar o catálogo (por nota, título, adição,
atualização) e filtrar por gênero — hoje só há chips de status; o filtro por gênero já
existe no servidor mas nenhuma tela o envia, e não há nenhuma ordenação disponível.

**Why this priority**: Capacidade de servidor ociosa + navegação que degrada com o
crescimento do acervo. Paridade com o catálogo da Akane (que tem ordenação).

**Independent Test**: No catálogo, escolher ordenação por nota e filtro por um gênero, e
confirmar que a lista reflete ambos; recarregar e confirmar comportamento estável.

**Acceptance Scenarios**:

1. **Given** o catálogo, **When** o usuário escolhe uma ordenação (nota, título, adição,
   atualização), **Then** a lista reordena de acordo — e a opção oferecida corresponde a uma
   ordenação real (nenhuma opção sem efeito).
2. **Given** o catálogo, **When** o usuário filtra por gênero, **Then** só séries do gênero
   aparecem; combinável com o filtro de status existente.
3. **Given** filtros ativos sem resultado, **When** a lista renderiza, **Then** o estado
   vazio explica que são os filtros (com ação de limpar), não "catálogo vazio".

---

### User Story 3 - Organizar séries em listas personalizadas (Priority: P2)

Como usuário, quero criar listas/coleções de séries (ex.: "Para maratonar", "Melhores
dramas"), adicionar séries a elas pela tela de detalhe e navegar pelas listas em tela
própria — como já existe para filmes na Akane.

**Why this priority**: Maior funcionalidade de organização da Akane sem equivalente na Mai;
sem listas, a única organização é o status. Exige backend novo.

**Independent Test**: Criar uma lista, adicionar duas séries pelo detalhe, abrir a tela de
listas e confirmar que a lista mostra as duas.

**Acceptance Scenarios**:

1. **Given** a tela de listas, **When** o usuário cria uma lista com nome, descrição e cor,
   **Then** ela aparece na tela de listas.
2. **Given** uma lista e uma série do catálogo, **When** o usuário adiciona a série pelo
   detalhe, **Then** ela aparece dentro da lista, sem duplicatas.
3. **Given** uma lista com séries, **When** o usuário edita nome/descrição/cor ou remove uma
   série, **Then** as alterações persistem ao reabrir.
4. **Given** uma lista, **When** o usuário a exclui, **Then** ela some sem afetar as séries
   do catálogo.

---

### User Story 4 - Etiquetar séries (tags) (Priority: P2)

Como usuário, quero atribuir etiquetas livres às séries (ex.: "conforto", "assistir com a
família") e navegar por elas em tela própria — a coluna de etiquetas já existe no banco e no
modelo do frontend, mas nada a grava nem a exibe (recurso documentado e inerte).

**Why this priority**: Paridade com Akane e Marin; destrava filtragem transversal que status
e gêneros oficiais não cobrem. A coluna morta hoje é uma promessa não cumprida da própria
documentação do agente.

**Independent Test**: Etiquetar duas séries com "conforto", abrir a tela de etiquetas e
confirmar que a etiqueta lista as duas.

**Acceptance Scenarios**:

1. **Given** a tela de detalhe, **When** o usuário adiciona uma etiqueta nova, **Then** ela
   fica visível no detalhe e passa a existir na tela de etiquetas.
2. **Given** uma etiqueta existente, **When** atribuída a outra série, **Then** a tela de
   etiquetas mostra as duas séries sob a mesma etiqueta.
3. **Given** uma série etiquetada, **When** o usuário remove a etiqueta, **Then** ela some do
   detalhe; se era a última série com a etiqueta, ela some da tela de etiquetas.
4. **Given** nomes com caixa/acentos divergentes ("Conforto" vs "conforto"), **When**
   atribuídos, **Then** são normalizados para não criar duplicatas.

---

### User Story 5 - Rewind anual (retrospectiva do ano) (Priority: P3)

Como usuário, quero uma retrospectiva anual das minhas séries — episódios e horas assistidas,
séries concluídas, destaques, gêneros e emissoras mais assistidos, maior maratona — no mesmo
espírito do Rewind de filmes da Akane.

**Why this priority**: Funcionalidade "deleite"; agrega valor emocional mas não destrava
fluxo diário. Depende da spec 056 (progresso unificado) para os dados serem coerentes — sem
ela, as estatísticas ignoram o fluxo de checkboxes.

**Independent Test**: Abrir o Rewind de um ano com atividade e confirmar que os blocos
(totais, destaques, gêneros, emissoras, maratona) exibem dados coerentes com a tela de Stats.

**Acceptance Scenarios**:

1. **Given** um ano com atividade, **When** o usuário abre o Rewind, **Then** vê totais
   (séries concluídas, episódios, tempo estimado), melhor avaliada, gêneros e emissoras mais
   frequentes e a maior maratona.
2. **Given** um ano sem atividade, **When** o usuário abre o Rewind, **Then** vê estado vazio
   amigável (sem erro).
3. **Given** o Rewind aberto, **When** o usuário troca o ano, **Then** os blocos atualizam —
   incluindo anos anteriores a 2020 se houver dados (o seletor não pode ter piso arbitrário).

---

### Edge Cases

- Excluir uma série que pertence a listas/etiquetas: vínculos somem junto, sem itens
  fantasma.
- Notas com texto longo e quebras de linha: preservar formatação simples na exibição.
- Ordenação por nota com séries sem nota: agrupá-las de forma previsível (fim da lista).
- Lista vazia recém-criada: estado vazio com orientação de como adicionar.
- Rewind de série concluída sem sessões no diário (importada pronta): contar de forma
  coerente com a regra da tela de Stats (mesma política da spec 056).
- Seletor de ano das estatísticas atuais trava em 2020 (piso hardcoded) — remover o piso
  junto com o Rewind para dar acesso a anos anteriores.
- Etiquetas e listas devem funcionar com o catálogo completo (não sujeitas ao truncamento
  tratado na spec 055).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O usuário DEVE poder criar, editar e limpar as notas de uma série pela tela de
  detalhe, usando o suporte de gravação já existente no servidor; as notas persistem e a
  seção reflete o estado atual.
- **FR-002**: O catálogo DEVE oferecer ordenação server-side (no mínimo: nota, título, data
  de adição, data de atualização) e filtro por gênero exposto na interface; nenhuma opção de
  ordenação oferecida pode ser sem efeito.
- **FR-003**: O sistema DEVE oferecer listas personalizadas de séries: criar, editar (nome,
  descrição, cor), excluir, adicionar/remover séries pelo detalhe e navegar por tela própria —
  sem duplicatas dentro de uma lista.
- **FR-004**: O sistema DEVE oferecer etiquetas livres: atribuir/remover no detalhe, navegar
  por tela própria agrupando séries por etiqueta, com normalização de nomes; a coluna de
  etiquetas existente passa a ser gravável (ou o modelo é substituído — decisão de plano).
- **FR-005**: O sistema DEVE oferecer uma retrospectiva anual (Rewind) com, no mínimo: totais
  do ano (séries concluídas, episódios, tempo estimado), destaque de melhor avaliada, gêneros
  e emissoras mais assistidos e maior maratona; com seletor de ano sem piso arbitrário e
  estado vazio para anos sem atividade.
- **FR-006**: Excluir uma série DEVE remover seus vínculos com listas e etiquetas.
- **FR-007**: Os órfãos de interface catalogados na auditoria que esta spec conecta (função
  de gravação de notas, campo de etiquetas) DEVEM deixar de ser órfãos; o que permanecer sem
  consumidor deve ser removido ou documentado.

### Key Entities

- **Série**: item do catálogo; ganha notas editáveis, vínculos com listas e etiquetas.
- **Lista**: coleção nomeada de séries com descrição e cor; relação N:N, sem duplicatas.
- **Etiqueta (tag)**: rótulo livre normalizado; relação N:N com séries.
- **Rewind**: visão agregada anual derivada do diário/episódios/notas (não armazena dados
  próprios).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: É possível escrever uma nota do zero pela interface em menos de 15 segundos a
  partir da tela de detalhe; 100% das notas persistem após recarregar.
- **SC-002**: Todas as opções de ordenação e filtro oferecidas têm efeito real e combinável;
  zero opções no-op.
- **SC-003**: Uma série adicionada a uma lista aparece nela imediatamente e após recarregar,
  sem duplicatas, em 100% dos casos testados.
- **SC-004**: A tela de etiquetas reflete exatamente os vínculos existentes (zero etiquetas
  fantasma após remoções e exclusões de série).
- **SC-005**: O Rewind de um ano com atividade renderiza todos os blocos com dados coerentes
  com a tela de estatísticas (mesmos totais para o mesmo ano).
- **SC-006**: Anos anteriores a 2020 com dados ficam acessíveis no seletor de ano.

## Assumptions

- O modelo segue o padrão validado na Akane: listas e etiquetas como funcionalidades
  separadas (coleções curadas vs. rótulos livres), telas próprias na navegação do shell.
- Favoritos permanecem como estão (armazenamento local do navegador) — fora do escopo, por
  decisão do usuário na auditoria.
- O Rewind pressupõe a spec 056 implementada (estatísticas refletindo todo o fluxo de
  marcação); se implementado antes, herda a limitação atual documentada.
- O tempo estimado do Rewind usa a duração média por episódio dos metadados (com fallback
  razoável quando ausente), no mesmo critério da tela de estatísticas.
- O Rewind é uma tela do shell da Mai (não um export/imagem compartilhável) nesta fase.
- O editor de notas segue o padrão já existente na Akane (edição inline no detalhe).
