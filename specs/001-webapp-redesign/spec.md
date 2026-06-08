# Feature Specification: Webapp Redesign — Dark Theme com Personagens

**Feature Branch**: `001-webapp-redesign`

**Created**: 2026-06-08

**Status**: Draft

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Navegar pela sidebar com personagens (Priority: P1)

Gustavo abre o dashboard e encontra uma sidebar com os personagens do Makima (Nami, Frieren, Kaguya, Kurisu etc.), cada um com cor e ícone próprios. Clicando em um personagem, é levado para o domínio correspondente.

**Why this priority**: A sidebar é o ponto de entrada de toda a navegação — nada mais funciona sem ela. É a primeira coisa vista ao abrir o app.

**Independent Test**: Abrir o app, ver a sidebar com personagens listados e cores distintas, clicar em cada item e verificar que a URL muda corretamente para `/`, `/journal`, `/books`.

**Acceptance Scenarios**:

1. **Given** Gustavo está autenticado, **When** abre qualquer página, **Then** a sidebar exibe o logo "Makima", os personagens com cor temática e o item ativo destacado.
2. **Given** a sidebar está visível, **When** Gustavo clica em "Frieren", **Then** navega para `/books` sem recarregar a página.
3. **Given** Gustavo está em `/journal`, **When** olha a sidebar, **Then** o item "Diário" aparece destacado com sua cor temática (roxo-azulado).

---

### User Story 2 — Escrever e navegar no Diário pessoal (Priority: P1)

Gustavo abre `/journal`, vê a data de hoje e os bullets do dia. Escreve um bullet novo, menciona `@Ana` e usa `#trabalho`. O bullet é salvo automaticamente. Na sidebar direita, o heatmap anual mostra a atividade dos últimos 365 dias.

**Why this priority**: O Diário é a página mais usada diariamente e o design novo é radicalmente diferente do anterior — impacta a usabilidade central do app.

**Independent Test**: Abrir `/journal`, digitar um texto com `@pessoa` e `#tag`, pressionar Enter para criar novo bullet, verificar que a menção aparece destacada e que o sidebar de insights atualiza.

**Acceptance Scenarios**:

1. **Given** Gustavo abre `/journal`, **When** a página carrega, **Then** exibe os bullets do dia atual com timestamps e um header com número sequencial da entrada.
2. **Given** Gustavo está editando um bullet, **When** digita `@Ana`, **Then** o texto `@Ana` aparece destacado em violeta dentro do bullet.
3. **Given** Gustavo digita `#trabalho`, **When** o texto é salvo, **Then** o tag `#trabalho` aparece na aba "Tags" da sidebar direita com contagem.
4. **Given** um bullet está vazio e Gustavo pressiona Backspace, **When** a ação é confirmada, **Then** o bullet é removido.
5. **Given** a aba "Insights" está ativa na sidebar direita, **When** a página carrega, **Then** o heatmap anual exibe quadrados coloridos por nível de atividade (0–4+ bullets/dia).
6. **Given** Gustavo clica em `@Ana` na aba "Pessoas", **When** o filtro é aplicado, **Then** a área principal mostra apenas bullets que mencionam `@Ana`.
7. **Given** Gustavo digita 2+ caracteres no campo de busca, **When** os resultados chegam, **Then** a área principal mostra bullets de qualquer data que contenham o texto buscado.

---

### User Story 3 — Ver o Dashboard financeiro redesenhado (Priority: P2)

Gustavo abre `/` e vê três cards: Saúde Financeira (pontuação 0–100 com breakdown), Gastos por Categoria e Compromissos Futuros. O visual usa o sistema de cores OKLch com fundos muito escuros.

**Why this priority**: O Dashboard existente funciona, mas o visual antigo não usa o novo design system — cria inconsistência visual entre páginas.

**Independent Test**: Abrir `/`, verificar que os três cards exibem dados corretos do backend, que o score de saúde muda de cor conforme o valor (verde/amarelo/vermelho), e que os números batem com o que a Nami reportaria.

**Acceptance Scenarios**:

1. **Given** Gustavo abre `/`, **When** a página carrega, **Then** exibe card "Saúde Financeira" com pontuação numérica e indicador visual de cor.
2. **Given** o score é ≥ 70, **When** exibido, **Then** o indicador é verde; entre 40–69 é amarelo; abaixo de 40 é vermelho.
3. **Given** Gustavo abre o Dashboard, **When** os dados financeiros carregam, **Then** os gastos aparecem agrupados por categoria com valores em BRL.

---

### User Story 4 — Gerenciar livros com o novo visual (Priority: P2)

Gustavo abre `/books`, vê os livros organizados por status (Lendo, Lido, Quero Ler etc.). O card de cada livro mostra capa, título, progresso (se "Lendo") ou nota (se "Lido"). Pode buscar livros no Google Books e adicionar à coleção.

**Why this priority**: Books também precisa do novo design para consistência, mas a lógica já existe — é principalmente uma migração visual.

**Independent Test**: Abrir `/books`, ver cards de livros com capa e status, clicar em "Adicionar", buscar um título no modal de busca, selecionar resultado e confirmar.

**Acceptance Scenarios**:

1. **Given** Gustavo tem livros cadastrados, **When** abre `/books`, **Then** vê cards com capa, título, autor e badge de status.
2. **Given** um livro está com status "Lendo", **When** exibido no card, **Then** aparece barra de progresso com X/total páginas.
3. **Given** Gustavo clica em "Adicionar livro", **When** digita um título no modal, **Then** resultados do Google Books aparecem com capa e metadados.
4. **Given** Gustavo seleciona um resultado, **When** confirma, **Then** o livro é adicionado à lista com o status escolhido.

---

### User Story 5 — Design system consistente nas páginas financeiras existentes (Priority: P3)

As páginas de finanças existentes (Transactions, Accounts, Cards, Loans, Budgets, Subscriptions) usam os novos tokens de cor e tipografia do design system, sem quebrar a funcionalidade existente.

**Why this priority**: Funcionalidade já testada. O redesign é incremental — cores e fontes migradas para o novo sistema OKLch.

**Independent Test**: Abrir `/transactions`, verificar que o fundo é escuro (não cinza neutro), que os cards usam as variáveis CSS `--bg-card`, e que não há erros de renderização.

**Acceptance Scenarios**:

1. **Given** Gustavo navega para qualquer página financeira, **When** a página carrega, **Then** o fundo segue a paleta escura do novo design (não o tema cinza anterior).
2. **Given** o design system é carregado, **When** Gustavo compara páginas financeiras com Journal/Books, **Then** fontes, espaçamentos e esquema de cores são consistentes.

---

### Edge Cases

- O que acontece se o heatmap não tem dados para o ano atual? → Exibe grid vazio (todos os quadrados na cor base mais escura).
- O que acontece se um bullet tem mais de 500 caracteres? → O textarea expande verticalmente; sem limite rígido imposto pelo frontend.
- O que acontece se a busca no Google Books retorna 0 resultados? → Exibe mensagem "Nenhum resultado encontrado".
- O que acontece se a sidebar de insights está na aba "Busca" e Gustavo apaga o texto? → A view volta para o modo de edição do dia atual.
- O que acontece em telas menores que 1024px? → A sidebar esquerda colapsa; o layout mantém funcionalidade com scroll horizontal ou coluna única.

---

## Requirements *(mandatory)*

### Functional Requirements

**Design System**
- **FR-001**: O frontend DEVE usar as variáveis CSS OKLch definidas no design (`--bg-app`, `--bg-card`, `--t1`–`--t4`, `--c-makima`, `--c-nami`, etc.) como tokens globais.
- **FR-002**: O sistema DEVE usar as fontes `Playfair Display` (serif display), `DM Sans` (UI) e `DM Mono` (mono) carregadas via Google Fonts.
- **FR-003**: O layout DEVE ter três painéis: sidebar esquerda de navegação (fixa, 56px de largura comprimida ou 222px expandida), área principal (flex-1), sidebar direita contextual (266px, apenas em páginas que a usam).

**Sidebar de Navegação**
- **FR-004**: A sidebar DEVE exibir os personagens disponíveis (Nami, Frieren, Kaguya, Kurisu, Diário) com seus ícones e cores temáticas.
- **FR-005**: O item ativo DEVE ser destacado visualmente com a cor do personagem correspondente ao domínio atual.
- **FR-006**: A sidebar DEVE exibir o logo/avatar "Makima" no topo e um link de logout no rodapé.

**Página Journal**
- **FR-007**: O editor DEVE renderizar bullets como linhas editáveis com ponto indicador centralizado.
- **FR-008**: Menções `@nome` DEVE ser destacadas em cor violeta; tags `#tag` em cor verde dentro do texto.
- **FR-009**: Enter em um bullet DEVE criar novo bullet vazio abaixo; Backspace em bullet vazio DEVE removê-lo e focar o anterior.
- **FR-010**: Alterações nos bullets DEVEM ser salvas automaticamente ao backend (debounce de ~800ms após parar de digitar).
- **FR-011**: A sidebar direita DEVE ter 5 abas: Escrever, Insights (heatmap), Pessoas (@menções), Tags (#tags), Busca.
- **FR-012**: O heatmap DEVE exibir uma grade de 52 semanas × 7 dias, colorida por número de bullets naquele dia (0 = mais escuro, 4+ = mais claro/saturado).
- **FR-013**: Clicar em uma @pessoa ou #tag na sidebar DEVE filtrar a área principal para exibir somente os bullets com aquela menção.
- **FR-014**: A busca textual DEVE iniciar quando o campo tiver ≥ 2 caracteres e exibir bullets de qualquer data que contenham o texto.

**Página Dashboard**
- **FR-015**: O Dashboard DEVE exibir três cards: Saúde Financeira, Gastos por Categoria e Compromissos Futuros.
- **FR-016**: O card de Saúde Financeira DEVE mostrar pontuação 0–100 com cor dinâmica (verde/amarelo/vermelho) e detalhamento por subcritério.

**Página Books**
- **FR-017**: A listagem DEVE ter filtros de status como chips horizontais (Todos, Lendo, Lido, Quero Ler, etc.).
- **FR-018**: Livros com status "Lendo" DEVEM exibir barra de progresso e contador de páginas no card.
- **FR-019**: O modal de adição DEVE ter dois passos: busca no Google Books → formulário de confirmação/edição.

**Páginas Financeiras Existentes**
- **FR-020**: Todas as páginas em `src/pages/` DEVEM usar as variáveis CSS do novo design system (sem hardcode de cores hex antigas).

### Key Entities

- **Bullet**: Entrada de texto numerada por posição dentro de uma página do diário. Atributos: id, page_id, position, content, created_at. Menções extraídas automaticamente.
- **JournalPage**: Página por (type_id, date). Criada sob demanda. Um page por dia por tipo de diário.
- **Heatmap Entry**: Agregação de contagem de bullets por data para visualização anual.
- **Book**: Livro com capa, título, autor, total de páginas, páginas lidas, status, nota (1–5), preço (wishlist).
- **Mention**: Referência `@pessoa` ou `#tag` extraída do conteúdo de um bullet.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Qualquer página do webapp carrega e exibe dados em menos de 2 segundos em conexão local.
- **SC-002**: Um novo bullet digitado no Journal é persistido no banco sem recarregamento de página em menos de 1 segundo após o debounce.
- **SC-003**: O heatmap renderiza corretamente para o ano inteiro (52 × 7 = 364 quadrados) sem erros visuais.
- **SC-004**: A navegação entre as três páginas principais (Dashboard, Journal, Books) não causa erros de console nem recarregamentos de página.
- **SC-005**: O visual das páginas Journal, Dashboard e Books é idêntico ao protótipo em `docs/claude_design/webapp/frontend/` — mesmo layout de três painéis, mesma paleta escura, mesmos componentes.
- **SC-006**: As páginas financeiras existentes (Transactions, Accounts, etc.) continuam funcionando com dados corretos após a migração do design system (sem regressões funcionais).

---

## Assumptions

- O backend (FastAPI) e todos os endpoints `/api/*` já estão implementados e funcionando — nenhuma mudança de backend é necessária para esta spec.
- As dependências de frontend (React 19, Tailwind CSS 3, Vite 6) já estão instaladas em `webapp/frontend/`.
- As fontes Google Fonts (`Playfair Display`, `DM Sans`, `DM Mono`) serão carregadas via `<link>` no `index.html`.
- As páginas financeiras existentes (Transactions, Accounts, Cards, Loans, Budgets, Subscriptions) receberão migração de tokens de cor, mas não redesign completo de layout.
- O tailwind.config.js precisará ser atualizado para expor os tokens OKLch como classes utilitárias.
- O design reference completo está em `docs/claude_design/webapp/frontend/src/` — os arquivos de design são a fonte de verdade para Layout, Journal, Dashboard e Books.
- A página de Login não será redesenhada nesta iteração (está fora do escopo do design em `claude_design`).
