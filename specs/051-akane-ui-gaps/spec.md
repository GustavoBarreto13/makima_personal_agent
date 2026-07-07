# Feature Specification: Expor na interface as funcionalidades de filmes já prontas no backend

**Feature Branch**: `051-akane-ui-gaps`

**Created**: 2026-07-07

**Status**: Rascunho — auditoria completa em 2026-07-07, código ainda não implementado

**Input**: User description: "Expor pela interface web da Akane funcionalidades que já têm
suporte completo no backend mas nenhum acesso pela UI: adicionar filme a uma lista e editar
lista, cofre editável (adicionar/remover), botão de sincronização manual com o Letterboxd,
tela ou bloco de mapa de calor de atividade (heatmap), excluir filme e excluir sessão do
diário, bloco de pessoas mais assistidas no fechamento anual, além de polimentos de estado
vazio e tratamento de erro de rede."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Organizar filmes em listas personalizadas (Priority: P1)

Como usuária, quero adicionar filmes às listas que eu criei (ex.: "Favoritos de terror",
"Para assistir com amigos") diretamente da tela de detalhe do filme, e editar o nome,
descrição e cor de uma lista existente, para que as listas sejam realmente úteis para
organizar minha coleção.

**Why this priority**: Hoje é possível criar uma lista, mas não há nenhum jeito de colocar
filmes dentro dela pela interface — a funcionalidade nasce e morre vazia, tornando a tela
de Listas inútil na prática.

**Independent Test**: Criar uma lista, abrir o detalhe de um filme, adicionar esse filme à
lista criada, e confirmar que ele aparece ao abrir a lista.

**Acceptance Scenarios**:

1. **Given** uma lista existente e um filme no catálogo, **When** o usuário abre o detalhe
   do filme e escolhe adicioná-lo a essa lista, **Then** o filme passa a aparecer dentro
   da lista.
2. **Given** uma lista com filmes já adicionados, **When** o usuário edita o nome, a
   descrição ou a cor de destaque da lista, **Then** as alterações são salvas e refletidas
   ao reabrir a lista.
3. **Given** um filme já presente em uma lista, **When** o usuário tenta adicioná-lo
   novamente à mesma lista, **Then** o sistema não cria duplicata (ou informa que já está
   presente).

---

### User Story 2 - Gerenciar itens do Cofre (Priority: P2)

Como usuária, quero adicionar e remover itens do meu "Cofre" (registros especiais ligados a
um filme) diretamente pela tela de detalhe do filme, em vez de depender de outra via de
entrada.

**Why this priority**: O Cofre hoje só exibe dados que entraram por outro caminho; sem
entrada pela interface, a funcionalidade é invisível para quem usa só o webapp.

**Independent Test**: Abrir o detalhe de um filme, adicionar um item ao Cofre, confirmar que
aparece na lista do Cofre daquele filme, e depois removê-lo.

**Acceptance Scenarios**:

1. **Given** o detalhe de um filme, **When** o usuário adiciona um novo item ao Cofre desse
   filme, **Then** o item aparece imediatamente na seção do Cofre.
2. **Given** um item existente no Cofre de um filme, **When** o usuário o remove, **Then**
   ele deixa de aparecer na seção do Cofre.

---

### User Story 3 - Disparar sincronização com o Letterboxd manualmente (Priority: P2)

Como usuária, quero poder forçar uma sincronização com o Letterboxd a qualquer momento pela
interface, sem esperar o próximo ciclo automático, para ver minha atividade mais recente
refletida imediatamente.

**Why this priority**: A sincronização automática roda em intervalo fixo; sem um botão
manual, a usuária não tem controle para atualizar sob demanda (ex.: logo após assistir algo).

**Independent Test**: Clicar no botão de sincronizar e confirmar que um retorno visível
(sucesso ou erro) aparece, com a atividade recém-registrada no Letterboxd refletida na
coleção.

**Acceptance Scenarios**:

1. **Given** a usuária tem atividade recente no Letterboxd ainda não sincronizada, **When**
   ela aciona a sincronização manual pela interface, **Then** recebe uma confirmação visível
   do resultado e a atividade nova aparece na coleção.
2. **Given** a sincronização manual falha (ex.: indisponibilidade do Letterboxd), **When** a
   usuária aciona o botão, **Then** recebe uma mensagem de erro visível, não uma falha
   silenciosa.

---

### User Story 4 - Visualizar o mapa de calor de atividade (Priority: P3)

Como usuária, quero ver um mapa de calor da minha atividade de filmes ao longo do tempo
(dias com mais ou menos sessões assistidas), para entender meus hábitos de consumo.

**Why this priority**: É uma visualização de valor agregado (não bloqueia o uso diário do
catálogo), mas os dados já são calculados no backend e ficam desperdiçados sem exibição.

**Independent Test**: Abrir a visualização de mapa de calor e confirmar que os dias com
sessões registradas aparecem destacados proporcionalmente à quantidade de sessões.

**Acceptance Scenarios**:

1. **Given** sessões registradas em dias específicos do ano, **When** o usuário abre o mapa
   de calor, **Then** esses dias aparecem visualmente destacados de acordo com a quantidade
   de sessões.

---

### User Story 5 - Excluir filme e excluir sessão do diário (Priority: P2)

Como usuária, quero poder remover um filme que adicionei por engano ou remover uma sessão
específica do diário, diretamente pela interface, para manter minha coleção correta.

**Why this priority**: Erros de entrada de dados são inevitáveis; sem uma via de correção
pela interface, a usuária fica sem alternativa dentro do webapp.

**Independent Test**: Adicionar um filme de teste, confirmar que aparece na coleção,
excluí-lo pela interface e confirmar que some das listagens; registrar uma sessão de teste
no diário e excluí-la, confirmando que some do diário sem afetar outras sessões do mesmo
filme.

**Acceptance Scenarios**:

1. **Given** um filme no catálogo, **When** o usuário confirma a exclusão desse filme,
   **Then** ele deixa de aparecer nas listagens da coleção.
2. **Given** um filme com múltiplas sessões no diário, **When** o usuário exclui uma sessão
   específica, **Then** apenas essa sessão desaparece — as demais sessões do mesmo filme
   permanecem.
3. **Given** uma ação de exclusão (filme ou sessão), **When** o usuário a aciona, **Then**
   é solicitada uma confirmação antes de efetivar, para evitar exclusões acidentais.

### Edge Cases

- Adicionar o mesmo filme a uma lista onde ele já está presente não deve gerar entrada
  duplicada visível.
- Sincronização manual disparada enquanto outra sincronização automática está em andamento:
  o sistema deve informar o resultado sem gerar dados inconsistentes.
- Mapa de calor sem nenhuma sessão registrada: exibe estado vazio, sem quebrar.
- Falha de rede ao carregar Início, Etiquetas ou Listas: usuário vê um aviso de erro
  distinto do estado "sem dados ainda" (hoje ambos os casos parecem idênticos).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A tela de detalhe de um filme MUST oferecer uma ação para adicionar esse
  filme a uma ou mais listas existentes do usuário.
- **FR-002**: A tela de listas MUST oferecer uma ação para editar o nome, a descrição e a
  cor de destaque de uma lista existente.
- **FR-003**: A tela de detalhe de um filme MUST oferecer ações para adicionar e remover
  itens do Cofre associado a esse filme.
- **FR-004**: A interface MUST oferecer um controle visível para disparar manualmente a
  sincronização com o Letterboxd, com retorno visível de sucesso ou falha.
- **FR-005**: A interface MUST apresentar uma visualização do mapa de calor de atividade
  (sessões por dia ao longo do tempo).
- **FR-006**: A tela de detalhe de um filme MUST oferecer uma ação de exclusão do filme,
  com confirmação prévia do usuário.
- **FR-007**: A visualização do diário MUST oferecer uma ação de exclusão de uma sessão
  específica, com confirmação prévia do usuário, sem afetar outras sessões do mesmo filme.
- **FR-008**: A visualização do fechamento anual (Rewind) MUST exibir o bloco de pessoas
  (elenco/equipe) mais assistidas do ano, já calculado pelo sistema.
- **FR-009**: Falhas de rede ao carregar as telas Início, Etiquetas e Listas MUST exibir um
  aviso de erro visível, distinto do estado "ainda sem dados".
- **FR-010**: O texto de estado vazio da tela "Quero ver" (watchlist) MUST orientar o
  usuário para a ação real disponível na interface para adicionar itens.

### Key Entities

- **Lista**: coleção nomeada e personalizável de filmes, criada pelo usuário, com nome,
  descrição e cor de destaque.
- **Item do Cofre**: registro especial associado a um filme (ex.: nota pessoal detalhada
  ou artefato relacionado), gerenciável pelo usuário.
- **Mapa de calor**: visualização agregada de sessões do diário por dia, ao longo do tempo.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Usuários conseguem adicionar um filme a uma lista e ver o resultado refletido
  imediatamente, em 100% das tentativas em teste.
- **SC-002**: Usuários conseguem editar os metadados de uma lista existente e ver a mudança
  persistida ao reabrir a lista.
- **SC-003**: Usuários conseguem adicionar e remover itens do Cofre de um filme sem sair da
  tela de detalhe.
- **SC-004**: A sincronização manual com o Letterboxd retorna um resultado visível (sucesso
  ou erro) em 100% dos acionamentos.
- **SC-005**: O mapa de calor de atividade é acessível e renderiza corretamente a partir de
  dados existentes, sem necessidade de navegação indireta.
- **SC-006**: Exclusão de filme e de sessão do diário funcionam com confirmação prévia,
  sem afetar dados não relacionados.
- **SC-007**: Zero telas (Início, Etiquetas, Listas) mostram estado vazio quando na verdade
  ocorreu uma falha de rede — o aviso de erro correto aparece em 100% dos casos simulados.

## Assumptions

- O backend para todas as funcionalidades listadas já existe e está funcional (confirmado
  na auditoria de 2026-07-07); esta spec cobre exclusivamente a camada de interface.
- A localização exata de cada novo controle na interface (ex.: onde fica o botão de
  sincronizar, se o mapa de calor vira tela própria ou bloco dentro de Estatísticas) é
  decisão de design a ser resolvida na fase de planejamento, não nesta especificação.
- Bugs de dados que afetam essas mesmas telas (ex.: histograma de notas, nome de pessoas
  normalizado) são tratados na spec 049, não nesta.
