# Feature Specification: Expor na interface as funcionalidades de animes prontas ou prometidas

**Feature Branch**: `054-marin-ui-gaps`

**Created**: 2026-07-07

**Status**: Rascunho — auditoria completa em 2026-07-07, código ainda não implementado

**Input**: User description: "Expor pela interface web da Marin funcionalidades que já têm
suporte no backend mas nenhum acesso pela UI, e trazer para os animes as funcionalidades de
paridade já existentes na Akane (filmes) e Mai (séries): dar nota ao anime pela tela de
detalhe (a rota existe e está órfã, as estrelas são só leitura); editar o Caderno da Marin
(as anotações são exibidas mas não há como escrevê-las); listas/coleções personalizadas com
tela própria e adição pelo detalhe; etiquetas (tags) com tela própria (o tipo já existe no
frontend mas nada lê ou edita); e o Rewind anual (retrospectiva do ano) como a Akane tem.
Inclui limpeza de rota órfã não consumida pelo webapp."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Dar nota ao anime pela tela de detalhe (Priority: P1)

Como usuário, quero definir a minha nota de um anime diretamente na tela de detalhe, tocando
nas estrelas — hoje elas são apenas decorativas e não existe nenhum caminho na interface para
dar nota a um anime.

**Why this priority**: A capacidade já existe de ponta a ponta no backend (rota pronta e
funcional), mas está órfã: nenhuma tela a chama. A nota do anime só é preenchida hoje via
sincronização com o MAL — quem não usa o MAL simplesmente não consegue avaliar seus animes.
É o menor esforço com o maior destravamento.

**Independent Test**: Abrir o detalhe de um anime, tocar nas estrelas para dar nota 8,5,
recarregar a página e confirmar que a nota persiste e aparece no catálogo.

**Acceptance Scenarios**:

1. **Given** a tela de detalhe de um anime sem nota, **When** o usuário toca nas estrelas
   para escolher uma nota, **Then** a nota é salva e exibida imediatamente.
2. **Given** um anime já avaliado, **When** o usuário escolhe uma nova nota, **Then** a nota
   anterior é substituída.
3. **Given** um anime avaliado, **When** o usuário remove a nota (nota zero/limpar),
   **Then** o anime volta a aparecer como não avaliado.
4. **Given** uma nota salva, **When** o catálogo é ordenado por nota, **Then** o anime
   aparece na posição correspondente.

---

### User Story 2 - Escrever no Caderno da Marin (Priority: P1)

Como usuário, quero escrever e editar as anotações pessoais de um anime ("Caderno da Marin")
pela tela de detalhe — hoje a seção só aparece se já houver texto, e não existe nenhum meio
de criar esse texto pela interface.

**Why this priority**: A seção existe na tela e o campo existe no banco, mas é efetivamente
inalcançável: sem endpoint de escrita e sem UI de edição, o Caderno fica vazio para sempre.
Akane e Mai já têm o fluxo equivalente (editar anotações no detalhe).

**Independent Test**: Abrir o detalhe de um anime sem anotações, escrever uma nota, salvar,
recarregar e confirmar que o texto aparece na seção do Caderno.

**Acceptance Scenarios**:

1. **Given** um anime sem anotações, **When** o usuário escreve um texto no Caderno e salva,
   **Then** o texto persiste e a seção passa a exibi-lo.
2. **Given** um anime com anotações, **When** o usuário edita o texto, **Then** a versão nova
   substitui a anterior.
3. **Given** um anime com anotações, **When** o usuário apaga todo o texto e salva, **Then**
   a seção volta ao estado vazio (sem seção exibida).

---

### User Story 3 - Organizar animes em listas personalizadas (Priority: P2)

Como usuário, quero criar listas/coleções de animes (ex.: "Melhores dos anos 2000",
"Para maratonar com amigos"), adicionar animes a elas pela tela de detalhe e navegar pelas
listas em uma tela própria — como já existe para filmes na Akane.

**Why this priority**: É a maior funcionalidade de organização da Akane e não tem equivalente
na Marin; sem listas, a única organização possível é o status de progresso. Depende de
backend novo (não existe hoje), por isso vem depois das duas primeiras histórias.

**Independent Test**: Criar uma lista, adicionar dois animes pelo detalhe, abrir a tela de
listas e confirmar que a lista mostra os dois animes.

**Acceptance Scenarios**:

1. **Given** a tela de listas, **When** o usuário cria uma lista com nome, descrição e cor,
   **Then** a lista aparece na tela de listas.
2. **Given** uma lista existente e um anime no catálogo, **When** o usuário adiciona o anime
   à lista pelo detalhe, **Then** o anime passa a aparecer dentro da lista.
3. **Given** um anime já presente em uma lista, **When** o usuário tenta adicioná-lo de novo,
   **Then** não há duplicata (ou o sistema informa que já está presente).
4. **Given** uma lista com animes, **When** o usuário edita nome/descrição/cor ou remove um
   anime, **Then** as alterações são refletidas ao reabrir a lista.
5. **Given** uma lista, **When** o usuário a exclui, **Then** a lista some sem afetar os
   animes do catálogo.

---

### User Story 4 - Etiquetar animes (tags) (Priority: P2)

Como usuário, quero atribuir etiquetas livres aos animes (ex.: "isekai", "conforto",
"chorei") e navegar por elas em uma tela própria — o modelo já prevê etiquetas no frontend,
mas nada as lê ou edita.

**Why this priority**: Paridade com a Akane (tela de etiquetas) e destrava filtragem
transversal que status e gêneros oficiais não cobrem. Também exige backend novo.

**Independent Test**: Etiquetar dois animes com "conforto", abrir a tela de etiquetas e
confirmar que a etiqueta lista os dois.

**Acceptance Scenarios**:

1. **Given** a tela de detalhe, **When** o usuário adiciona uma etiqueta nova a um anime,
   **Then** a etiqueta fica visível no detalhe e passa a existir na tela de etiquetas.
2. **Given** uma etiqueta existente, **When** o usuário a atribui a outro anime, **Then** a
   tela de etiquetas mostra os dois animes sob a mesma etiqueta.
3. **Given** um anime etiquetado, **When** o usuário remove a etiqueta, **Then** ela some do
   detalhe; se era o último anime com essa etiqueta, a etiqueta some da tela de etiquetas.

---

### User Story 5 - Rewind anual (retrospectiva do ano) (Priority: P3)

Como usuário, quero uma retrospectiva anual dos meus animes — total de episódios e horas,
destaques do ano, estúdios e gêneros mais assistidos, maratonas — no mesmo espírito do Rewind
de filmes da Akane.

**Why this priority**: É a funcionalidade mais "deleite" do conjunto; agrega valor emocional
mas não destrava fluxo diário. Os dados necessários já existem (diário, episódios, notas).

**Independent Test**: Abrir o Rewind de um ano com atividade registrada e confirmar que os
blocos (totais, destaques, estúdios, gêneros) exibem dados coerentes com o diário.

**Acceptance Scenarios**:

1. **Given** um ano com atividade no diário, **When** o usuário abre o Rewind desse ano,
   **Then** vê totais (animes completados, episódios, tempo estimado), melhor avaliado,
   estúdios e gêneros mais frequentes e a maior maratona.
2. **Given** um ano sem atividade, **When** o usuário abre o Rewind, **Then** vê um estado
   vazio amigável (sem erro).
3. **Given** o Rewind aberto, **When** o usuário troca o ano, **Then** os blocos atualizam
   para o ano escolhido.

---

### Edge Cases

- Nota dada localmente em anime vinculado ao MAL: deve seguir a regra de espelhamento da
  spec 053 (propagação best-effort), sem duplicar lógica.
- Caderno com texto longo ou com quebras de linha: preservar formatação simples na exibição.
- Excluir um anime que pertence a listas/etiquetas: os vínculos somem junto, sem itens
  fantasma nas telas de listas/etiquetas.
- Nome de etiqueta com maiúsculas/acentos ("Conforto" vs "conforto"): normalizar para evitar
  duplicatas por caixa.
- Lista vazia recém-criada: exibir estado vazio com orientação de como adicionar animes.
- Rewind de ano com anime completado mas sem sessões no diário (importado pronto): contar de
  forma coerente com as estatísticas existentes (mesma regra da tela de Stats).
- Rota de "assistindo agora" da API que nenhuma tela consome: remover ou documentar como
  endpoint de integração (decisão registrada), evitando superfície morta.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O usuário DEVE poder definir, alterar e remover a nota de um anime pela tela de
  detalhe, usando o componente de estrelas já existente no shell; a nota segue a escala local
  (0–10 em passos de 0,5).
- **FR-002**: O usuário DEVE poder criar, editar e limpar as anotações pessoais de um anime
  (Caderno da Marin) pela tela de detalhe; anotações persistem no catálogo.
- **FR-003**: O sistema DEVE oferecer listas personalizadas de animes: criar, editar
  (nome, descrição, cor), excluir, adicionar/remover animes pelo detalhe e navegar por uma
  tela própria de listas — sem duplicatas dentro de uma lista.
- **FR-004**: O sistema DEVE oferecer etiquetas livres: atribuir/remover no detalhe, navegar
  por tela própria agrupando animes por etiqueta, com normalização de nomes para evitar
  duplicatas por caixa/acentuação.
- **FR-005**: O sistema DEVE oferecer uma retrospectiva anual (Rewind) com, no mínimo:
  totais do ano (animes completados, episódios assistidos, tempo estimado), destaque de
  melhor avaliado, estúdios e gêneros mais assistidos e maior maratona; com seletor de ano e
  estado vazio para anos sem atividade.
- **FR-006**: Excluir um anime DEVE remover seus vínculos com listas e etiquetas.
- **FR-007**: A rota de API de "assistindo agora" não consumida pelo webapp DEVE ser removida
  ou explicitamente documentada como endpoint de integração — sem permanecer como superfície
  morta não documentada.

### Key Entities

- **Anime**: item do catálogo; ganha vínculos com listas e etiquetas, além de nota e
  anotações editáveis pela interface.
- **Lista**: coleção nomeada de animes com descrição e cor de destaque; relação N:N com
  animes, sem duplicatas.
- **Etiqueta (tag)**: rótulo livre normalizado; relação N:N com animes.
- **Rewind**: visão agregada anual derivada do diário, episódios e notas (não armazena dados
  próprios).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: É possível avaliar um anime do zero pela interface em menos de 10 segundos a
  partir da tela de detalhe, sem depender do MAL.
- **SC-002**: 100% das anotações escritas pelo Caderno persistem e reaparecem após recarregar.
- **SC-003**: Um anime adicionado a uma lista aparece nela imediatamente e após recarregar,
  em 100% dos casos testados; nenhuma duplicata é criada.
- **SC-004**: A tela de etiquetas reflete exatamente os vínculos existentes (zero etiquetas
  fantasma após remoções e exclusões de anime).
- **SC-005**: O Rewind de um ano com atividade renderiza todos os blocos com dados coerentes
  com a tela de estatísticas (mesmos totais para o mesmo ano).
- **SC-006**: Nenhuma rota da API da Marin permanece sem consumidor e sem documentação.

## Assumptions

- O modelo segue o padrão já validado na Akane: listas e etiquetas como funcionalidades
  separadas (coleções curadas vs. rótulos livres), telas próprias acessíveis pela navegação
  lateral do shell.
- Favoritos permanecem como estão (armazenamento local do navegador) — fora do escopo desta
  spec, por decisão do usuário na auditoria.
- A nota definida pela interface usa a mesma escala e validação das notas vindas do MAL;
  a propagação ao MAL é responsabilidade da spec 053 (se implementada).
- O tempo estimado do Rewind usa a duração média por episódio disponível nos metadados
  (com fallback razoável quando ausente), no mesmo critério da tela de estatísticas.
- O Rewind é uma tela do shell da Marin (não um export/imagem compartilhável) nesta fase.
