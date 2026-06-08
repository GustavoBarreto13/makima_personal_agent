# Feature Specification: Nami · Finanças — Sub-app de Personagem

**Feature Branch**: `002-nami-financas`

**Created**: 2026-06-08

**Status**: Draft

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Lançar uma transação rapidamente (Priority: P1)

Gustavo tem um gasto na mão e quer registrá-lo em segundos, sem distrações. Ele abre a seção
Nami, digita o valor na barra inline do dashboard (ou pressiona `A` de qualquer tela), escolhe a
categoria com um clique e confirma. O saldo do mês, os gráficos e o resumo no rodapé se
atualizam na hora, sem recarregar a página.

**Why this priority**: É o "star feature" pedido explicitamente no design. A facilidade de
lançar transações é o valor central do sistema de finanças; tudo mais depende de dados corretos
sendo inseridos com frequência.

**Independent Test**: Abrir a seção Nami, usar a barra inline para criar uma despesa de R$ 50
na categoria "Restaurante". Verificar que o saldo do mês diminui R$ 50, a transação aparece
no extrato e o toast de confirmação aparece.

**Acceptance Scenarios**:

1. **Given** Gustavo está no dashboard, **When** digita um valor na barra de lançamento rápido e
   pressiona Enter, **Then** a transação é salva, o saldo atualiza e um toast confirma o lançamento.
2. **Given** Gustavo está em qualquer tela da seção Nami, **When** pressiona a tecla `A`,
   **Then** o modal de nova transação abre com o campo de valor em foco.
3. **Given** o modal está aberto, **When** Gustavo preenche valor, tipo (despesa/receita) e
   categoria e confirma, **Then** a transação é persistida via `/api/finances/transactions`,
   o modal fecha e os totais do mês se atualizam visualmente sem recarregar a página.
4. **Given** Gustavo abre o modal, **When** pressiona Escape ou clica fora, **Then** o modal
   fecha sem salvar nada.
5. **Given** o modo privacidade está ativado, **When** Gustavo olha qualquer valor monetário
   na interface, **Then** os valores aparecem borrados/mascarados; ao desativar, voltam normais.

---

### User Story 2 — Visualizar o dashboard financeiro do mês (Priority: P1)

Gustavo abre a seção Nami e tem uma visão consolidada do mês corrente: saldo (positivo ou
negativo), receitas vs. despesas, fluxo de caixa histórico, distribuição por categoria, contas
com saldo, próximos vencimentos e os últimos lançamentos. Pode navegar para meses anteriores
com as setas da topbar.

**Why this priority**: O dashboard é a tela inicial e o único lugar que agrega tudo num relance.
Sem ele, o usuário não tem contexto para usar as demais abas com propósito.

**Independent Test**: Abrir a seção Nami, verificar que o dashboard exibe: valor líquido do mês,
cards de receita/despesa/saldo/patrimônio, gráfico de fluxo de caixa, donut "para onde foi",
lista de contas, próximos vencimentos e transações recentes. Trocar o mês com as setas e
verificar que todos os números mudam.

**Acceptance Scenarios**:

1. **Given** Gustavo abre a seção Nami, **When** a tela carrega, **Then** vê o hero com a
   imagem da Nami em destaque, o saldo líquido do mês em verde (positivo) ou vermelho (negativo)
   e o subtítulo "mês no azul / no vermelho".
2. **Given** o dashboard está carregado, **When** Gustavo olha os cards de resumo, **Then**
   vê quatro cards: Receitas, Despesas, Saldo do mês e Patrimônio total, cada um com valor e
   indicador visual.
3. **Given** o dashboard está carregado, **When** Gustavo clica na seta de mês anterior, **Then**
   todos os valores e gráficos se atualizam para o mês selecionado sem recarregar a página.
4. **Given** o mês atual tem despesas por categoria, **When** Gustavo olha o painel "Para onde
   foi", **Then** vê um donut com as top categorias e percentuais.
5. **Given** há assinaturas e financiamentos ativos, **When** Gustavo olha "Próximos vencimentos",
   **Then** vê até 4 itens ordenados pelo dia mais próximo, com nome, valor e dias restantes.

---

### User Story 3 — Gerenciar transações (extrato) (Priority: P2)

Gustavo acessa a aba Transações para ver o extrato completo do mês, buscar um lançamento
específico, adicionar novas transações e excluir lançamentos errados. O extrato é filtrável
por mês usando o mesmo seletor da topbar.

**Why this priority**: Gestão de transações é o CRUD fundamental da Nami. Depois de lançar
(P1), o usuário precisa corrigir e auditar.

**Independent Test**: Abrir Transações, verificar lista do mês corrente. Criar uma nova despesa
via botão, confirmar que aparece no topo. Excluir a transação e confirmar que desaparece com
toast de confirmação.

**Acceptance Scenarios**:

1. **Given** Gustavo está na aba Transações, **When** a tela carrega, **Then** vê o extrato do
   mês selecionado, agrupado por data, com data, descrição, categoria, conta/cartão e valor.
2. **Given** a lista de transações está visível, **When** Gustavo passa o mouse sobre um item,
   **Then** aparece um botão de exclusão; ao confirmar, a transação é deletada e o saldo
   do mês se atualiza.
3. **Given** Gustavo digita na busca da topbar, **When** há texto, **Then** é levado à aba
   Transações automaticamente com a lista filtrada pelo termo digitado.
4. **Given** a aba Transações está ativa, **When** Gustavo troca o mês na topbar, **Then**
   o extrato muda para o mês selecionado.

---

### User Story 4 — Gerenciar contas, cartões e assinaturas (Priority: P2)

Gustavo abre as abas Contas, Cartões e Assinaturas para criar, visualizar e remover entidades
financeiras. Em Contas e Assinaturas, pode definir um ícone/logo personalizado (por upload de
imagem ou cola de link da web).

**Why this priority**: CRUD de entidades é necessário para que o extrato faça sentido; sem
contas e cartões cadastrados, os lançamentos não têm fonte. Ícone personalizado é pedido
explícito do design e melhora a identificação visual rápida.

**Independent Test**: Criar uma nova conta bancária, verificar que aparece na lista com iniciais
como fallback de ícone. Adicionar um ícone via link da web, confirmar que o logo aparece em
todos os lugares (lista + dashboard). Criar uma nova assinatura com ícone. Excluir a conta e
confirmar que desaparece.

**Acceptance Scenarios**:

1. **Given** Gustavo está na aba Contas, **When** clica em "Nova conta", **Then** um formulário
   aparece com campos de nome, tipo e saldo inicial; ao confirmar, a conta é criada via
   `POST /api/finances/accounts` e aparece na lista.
2. **Given** Gustavo está criando ou editando uma conta, **When** abre o campo de ícone e cola
   uma URL de imagem, **Then** vê um preview circular do ícone em tempo real; ao salvar, o ícone
   aparece na lista e no dashboard.
3. **Given** Gustavo está criando ou editando uma conta, **When** faz upload de um arquivo de
   imagem, **Then** o arquivo é enviado ao backend, o ícone aparece com preview imediato.
4. **Given** nenhum ícone foi definido para uma conta ou assinatura, **When** o item é exibido,
   **Then** mostra as iniciais sobre fundo colorido (fallback automático).
5. **Given** Gustavo está na aba Cartões, **When** olha cada cartão, **Then** vê dívida atual,
   limite, percentual utilizado e barra de progresso; pode registrar pagamento de fatura.
6. **Given** Gustavo está na aba Assinaturas, **When** clica no botão de excluir de uma
   assinatura, **Then** a assinatura é marcada como cancelada via `DELETE /api/finances/subscriptions/{id}`
   e desaparece da lista ativa.

---

### User Story 5 — Gerenciar orçamentos por categoria (Priority: P2)

Gustavo acessa a aba Orçamentos para definir envelopes mensais por categoria, visualizar o
percentual gasto e identificar categorias acima do limite.

**Why this priority**: Orçamentos são a camada de controle sobre o gasto livre — complementam
o lançamento (P1) com intenção financeira.

**Independent Test**: Definir orçamento de R$ 500 para Lazer no mês corrente. Verificar que
aparece com barra de progresso. Criar uma despesa de R$ 600 em Lazer, verificar que a barra
fica vermelha/acima de 100%.

**Acceptance Scenarios**:

1. **Given** Gustavo está na aba Orçamentos, **When** clica em "Novo orçamento", **Then** pode
   escolher categoria e limite; ao salvar, o envelope aparece com barra de progresso em zero.
2. **Given** há despesas na categoria do orçamento no mês selecionado, **When** Gustavo abre a
   aba Orçamentos, **Then** vê o percentual gasto e o valor restante para cada categoria.
3. **Given** o gasto ultrapassou o limite de uma categoria, **When** Gustavo olha a barra de
   progresso, **Then** ela aparece em vermelho e indica o valor excedido.
4. **Given** Gustavo está na aba Orçamentos, **When** passa o mouse sobre um envelope, **Then**
   aparece opção de excluir; ao confirmar, o envelope é removido.

---

### User Story 6 — Gerenciar empréstimos e financiamentos (Priority: P2)

Gustavo acessa as abas Empréstimos e Financiamentos como duas visões separadas da mesma base
de dados de dívidas, distinguidas pelo `tipo`. Cada aba lista as dívidas com saldo devedor,
parcelas pagas/totais e próximo vencimento. Pode adicionar novas dívidas e excluir existentes.

**Why this priority**: Separação visual (empréstimo informal entre pessoas × financiamento
estruturado PRICE/SAC) é um requisito explícito do design para organização cognitiva.

**Independent Test**: Criar um empréstimo com tipo "pessoal" e verificar que aparece em
"Empréstimos". Criar um financiamento com tipo "imóvel" e verificar que aparece em
"Financiamentos". Excluir cada um.

**Acceptance Scenarios**:

1. **Given** Gustavo acessa "Empréstimos", **When** a tela carrega, **Then** vê apenas os
   registros da tabela `loans` com `tipo` classificado como empréstimo informal (pessoal, outro).
2. **Given** Gustavo acessa "Financiamentos", **When** a tela carrega, **Then** vê apenas os
   registros com `tipo` de financiamento estruturado (imóvel, veículo, consignado).
3. **Given** Gustavo está em qualquer uma das abas, **When** clica em "Novo", **Then** um
   formulário aparece com campos de nome, tipo compatível com aquela aba, valor, parcelas e conta;
   ao salvar, o registro é criado e aparece na lista.
4. **Given** Gustavo passa o mouse sobre um item de dívida, **When** clica na lixeira e confirma,
   **Then** o registro é removido via `DELETE /api/finances/loans/{id}`.

---

### User Story 7 — Tweaks de aparência e privacidade (Priority: P3)

Gustavo acessa o painel de Tweaks da seção Nami para mudar tema (claro/escuro), cor de acento,
densidade do extrato e modo privacidade. As preferências são salvas localmente e persistem entre
sessões.

**Why this priority**: Personalização é camada de qualidade de vida; o produto é totalmente
utilizável sem ela. Depende das telas P2 estarem prontas.

**Independent Test**: Ativar tema escuro → verificar que toda a seção Nami muda. Ativar
privacidade → todos os valores monetários ficam borrados. Recarregar a página → preferências
mantidas.

**Acceptance Scenarios**:

1. **Given** o tema está claro, **When** Gustavo troca para "Escuro" nos Tweaks, **Then** toda
   a seção Nami muda para paleta escura imediatamente.
2. **Given** o modo privacidade está desligado, **When** Gustavo ativa, **Then** todos os valores
   monetários visíveis ficam borrados/mascarados sem recarregar a página.
3. **Given** Gustavo definiu preferências nos Tweaks, **When** recarrega ou navega para outra
   seção e volta, **Then** as preferências estão preservadas (persistência local).
4. **Given** Gustavo está nos Tweaks, **When** troca a cor de acento, **Then** o acento muda em
   toda a interface (botões, destaques, ícones ativos) instantaneamente.

---

### Edge Cases

- O que acontece quando o mês selecionado não tem nenhuma transação? → Cards zerados, gráficos
  vazios com mensagem de estado vazio, sem erro.
- O que acontece se a chamada ao backend falhar ao salvar uma transação? → Modal permanece
  aberto, mensagem de erro inline, nenhum dado inconsistente é mostrado.
- O que acontece se o usuário fizer upload de um arquivo que não é imagem? → Validação no
  frontend rejeita o arquivo antes de enviar; mensagem de erro descritiva.
- O que acontece quando uma conta tem saldo negativo? → Valor exibido em vermelho; não é
  tratado como erro.
- O que acontece quando o limite do cartão está 100% utilizado? → Barra de progresso cheia em
  vermelho; lançamento ainda é permitido (o controle de limite é visual, não restritivo).
- O que acontece ao tentar excluir uma conta que tem transações associadas? → O backend decide
  o comportamento (encerramento de conta preserva o histórico); a UI exibe o feedback retornado.

---

## Requirements *(mandatory)*

### Functional Requirements

**Navegação e shell:**
- **FR-001**: A seção Nami MUST ser acessada como sub-app de personagem dentro do webapp
  existente, espelhando a estrutura da seção Frieren (`FrierenShell` como referência de padrão).
- **FR-002**: A sidebar MUST exibir a imagem da Nami como marca, um botão primário "Nova
  transação" e grupos de navegação: Visão Geral (Dashboard), Dia a Dia (Transações, Contas,
  Cartões), Planejamento (Orçamentos, Assinaturas, Empréstimos, Financiamentos).
- **FR-003**: A topbar MUST exibir o título da tela ativa, um seletor de mês (esquerda/direita)
  nas telas com escopo mensal (Dashboard, Transações, Contas, Cartões, Orçamentos) e um campo
  de busca de transação.
- **FR-004**: O rodapé MUST exibir uma barra de resumo do mês (receitas, despesas, saldo)
  acessível em todas as telas da seção.
- **FR-005**: A seção MUST ter um link "Voltar à Makima" no rodapé da sidebar.
- **FR-006**: Os sub-itens da Nami no menu principal da Makima MUST abrir diretamente na aba
  correspondente (deep-link por hash ou rota).

**Lançamento de transação:**
- **FR-007**: O dashboard MUST exibir uma barra de lançamento rápido inline (valor → categoria
  → Enter) que cria uma despesa via `POST /api/finances/transactions`.
- **FR-008**: O modal de nova transação MUST ser acessível pelo botão "Nova transação" da
  sidebar, pela barra de resumo do rodapé e pelo atalho de teclado `A` em qualquer tela.
- **FR-009**: O modal MUST permitir definir: valor (obrigatório), tipo (despesa/receita), categoria,
  conta/cartão, data e notas. Ao confirmar, MUST chamar `POST /api/finances/transactions`.
- **FR-010**: Após salvar qualquer transação, a interface MUST atualizar visualmente saldo do
  mês, gráficos e totais sem recarregar a página, e exibir um toast de confirmação.

**Dashboard:**
- **FR-011**: O hero MUST exibir a imagem `nami-hero.png` ancorada na base, com destaque visual
  (glow), espelhando o estilo do hero da Frieren.
- **FR-012**: O dashboard MUST exibir quatro cards de resumo: Receitas, Despesas, Saldo do Mês
  e Patrimônio Total, todos alimentados pelo backend.
- **FR-013**: O dashboard MUST exibir um gráfico de fluxo de caixa mensal (barras de entradas e
  saídas por mês) usando os dados de `/api/finances/summary?period=year`.
- **FR-014**: O dashboard MUST exibir um donut "Para onde foi" com as top categorias de despesa
  do mês selecionado e percentuais.
- **FR-015**: O dashboard MUST exibir um preview das contas (nome, tipo, saldo) e dos próximos
  vencimentos (assinaturas + financiamentos, ordenados por proximidade de data).
- **FR-016**: O dashboard MUST exibir os 3 orçamentos mais críticos (maior % gasto) com barras
  de progresso e link "Gerenciar →" para a aba completa.
- **FR-017**: O dashboard MUST exibir as 6 transações mais recentes do mês com link "Ver extrato →".

**CRUD por entidade:**
- **FR-018**: Cada aba de entidade (Transações, Contas, Cartões, Orçamentos, Assinaturas,
  Empréstimos, Financiamentos) MUST ter um botão "Novo" no cabeçalho que abre um formulário
  de criação.
- **FR-019**: Cada item nas listas MUST exibir um botão de exclusão ao hover; a exclusão MUST
  chamar o endpoint DELETE correspondente em `/api/finances/*`.
- **FR-020**: Após qualquer operação de criação ou exclusão, a lista MUST ser atualizada
  visualmente sem recarregar a página, com toast de confirmação.

**Contas e assinaturas — ícone customizado:**
- **FR-021**: O formulário de criação/edição de Conta e de Assinatura MUST incluir um campo de
  ícone com duas opções: upload de arquivo de imagem local ou cola de URL pública.
- **FR-022**: O campo de ícone MUST exibir um preview circular em tempo real ao inserir a URL
  ou selecionar o arquivo.
- **FR-023**: O ícone salvo MUST ser persistido no backend como `icon_url` nas tabelas
  `accounts` e `subscriptions` respectivamente; o backend MUST suportar receber e retornar
  este campo.
- **FR-024**: Quando nenhum ícone estiver definido, MUST ser exibida a sigla/iniciais da entidade
  sobre fundo colorido como fallback automático.

**Empréstimos e Financiamentos:**
- **FR-025**: A aba "Empréstimos" MUST exibir apenas registros da tabela `loans` cujo campo
  `tipo` pertença ao grupo informal: `pessoal`, `outro`.
- **FR-026**: A aba "Financiamentos" MUST exibir apenas registros cujo `tipo` pertença ao grupo
  estruturado: `veiculo`, `consignado`, `imobiliario`.
- **FR-027**: O formulário de criação em cada aba MUST pré-selecionar apenas os `tipo` válidos
  para aquela aba (Empréstimos não mostra `imobiliario`; Financiamentos não mostra `pessoal`).

**Tweaks:**
- **FR-028**: O painel de Tweaks MUST oferecer controles de tema (Claro/Escuro), cor de acento
  (paleta Nami: tangerina, azul-maré, coral, ouro), densidade do extrato (Confortável/Compacto)
  e modo privacidade (esconder valores).
- **FR-029**: Todas as preferências de Tweaks MUST ser persistidas localmente e restauradas ao
  reabrir a seção.

### Key Entities

- **Transação**: registro de gasto ou receita — valor, tipo (despesa/receita), categoria, conta
  ou cartão de origem, data, notas, flag de deleção suave. Persiste em `transactions`.
- **Conta** (+`icon_url`): entidade financeira bancária — nome, tipo (corrente, poupança,
  dinheiro, investimento), saldo inicial, data de início, URL de ícone opcional. Persiste em
  `accounts`.
- **Cartão de crédito**: vinculado a uma conta — nome, limite, taxa de juros, dias de fechamento
  e vencimento. Dívida calculada a partir de transações com `card_id`. Persiste em `credit_cards`.
- **Orçamento**: envelope mensal por categoria — mês (YYYY-MM), categoria, limite. Calculado
  contra transações do mês. Persiste em `budgets`.
- **Assinatura** (+`icon_url`): recorrência — nome, valor, ciclo (mensal/anual), próxima cobrança,
  conta, categoria, URL de ícone opcional. Persiste em `subscriptions`.
- **Empréstimo / Financiamento**: dívida parcelada — distinguidos visualmente por `tipo`;
  mesma tabela `loans`. Campos: nome, tipo, sistema de amortização (PRICE/SAC), valor original,
  taxa de juros mensal, total de parcelas, parcelas pagas, valor da parcela, primeiro vencimento.
- **Parcelamento**: grupo de compra dividida em N transações mensais. Persiste em
  `installment_groups` + N linhas em `transactions`.
- **Sumário mensal**: dado derivado — totais de receitas, despesas, saldo e fluxo de caixa.
  Calculado no backend; não persiste.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Gustavo consegue lançar uma despesa em no máximo 3 interações (campo de valor →
  categoria → confirmação) a partir do momento em que está na seção Nami.
- **SC-002**: Todas as 7 entidades do sistema de finanças (Transações, Contas, Cartões, Orçamentos,
  Assinaturas, Empréstimos, Financiamentos) têm operações de criar e remover funcionando e
  conectadas ao backend.
- **SC-003**: O dashboard exibe saldo do mês, receitas, despesas e patrimônio sem nenhuma
  interação extra após abrir a seção.
- **SC-004**: Ao ativar o modo privacidade, todos os valores monetários na seção ficam obscurecidos
  em menos de 1 segundo, sem recarregar a página.
- **SC-005**: As preferências de aparência (tema, acento, densidade, privacidade) são restauradas
  corretamente ao reabrir a seção, sem necessidade de nova configuração.
- **SC-006**: Os sub-itens da Nami na sidebar principal do webapp (ex.: "Transações", "Cartões")
  levam diretamente à aba correspondente, sem passar pelo dashboard como intermediário.
- **SC-007**: Contas e assinaturas com ícone customizado exibem o logo definido em todos os
  pontos da interface onde o item aparece (listas, dashboard, próximos vencimentos).
- **SC-008**: A aba Empréstimos e a aba Financiamentos mostram conjuntos de registros mutuamente
  exclusivos quando ambas contêm dados de `tipo` distintos.

---

## Assumptions

- O backend `/api/finances/*` existente é reutilizado integralmente. Extensões necessárias:
  adicionar coluna `icon_url` (TEXT, nullable) nas tabelas `accounts` e `subscriptions`, e
  expor o campo nos endpoints GET/POST/PATCH correspondentes.
- A distinção Empréstimos × Financiamentos é **visual apenas** — filtro por `tipo` no frontend.
  Nenhuma nova tabela ou endpoint é criado para essa separação.
- O padrão técnico do sub-app (shell, TweaksPanel, Toast, barra de resumo, atalho de teclado,
  seletor de mês) segue o mesmo modelo já implementado para Frieren
  (`webapp/frontend/src/pages/frieren/`).
- A autenticação por cookie `makima_session` e o cliente `api` de `webapp/frontend/src/lib/api.ts`
  são reutilizados sem modificação.
- Os dados mock do design (`nami/data.js`) servem apenas como referência visual e de estrutura;
  todos os dados reais vêm do PostgreSQL via API.
- Empréstimo pessoa-a-pessoa com campo "direção" (emprestei/peguei) está **fora de escopo**.
  O formulário de Empréstimos usa o modelo existente de `loans` sem novos campos de `dir`/`person`.
- O upload de imagem de ícone assume que o backend irá armazenar a URL pública (seja por
  multipart upload para storage, seja por URL fornecida pelo usuário). A estratégia exata de
  armazenamento de arquivo (local vs GCS) é definida no plano técnico (`/speckit-plan`), não
  aqui.
- Móbile/responsividade não é requisito desta fase — a seção é otimizada para desktop.
