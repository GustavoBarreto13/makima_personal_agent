# Feature Specification: Nami · Finanças — Sub-app de Personagem

**Feature Branch**: `002-nami-financas`

**Created**: 2026-06-08

**Updated**: 2026-06-09 — reescrita para fidelidade total ao design handoff
(`docs/claude_design/design_handoff_nami_financas/README.md`)

**Status**: Draft

**Fonte de verdade de design**: `docs/claude_design/design_handoff_nami_financas/README.md`
(protótipo React: `nami/styles.css`, `nami/app.jsx`, `nami/screens-*.jsx`, `nami/addmodal.jsx`)

---

## User Scenarios & Testing *(mandatory)*

<!--
  Cada história é uma fatia verticalmente independente e testável.
  P1 = bloqueante para tudo mais; P2 = funcionalidades completas após P1;
  P3 = qualidade de vida / personalização.
-->

### User Story 1 — Lançar uma transação rápida (Priority: P1)

Gustavo tem um gasto na mão e quer registrá-lo em segundos. Do dashboard, ele digita o
valor na barra de lançamento rápido inline, escolhe a categoria com um clique num chip e
pressiona Enter. De qualquer tela, pressiona `A` e o modal completo abre com o cursor no
campo de valor. Depois de confirmar, o saldo do mês, os gráficos e a barra de resumo do
rodapé se atualizam na hora, sem recarregar a página; um toast breve confirma o lançamento.

**Why this priority**: É o "star feature" do design — todo o resto (gráficos, orçamentos,
extrato) só tem valor se os dados forem inseridos com frequência e facilidade. A barra
de lançamento rápido inline e o atalho de teclado são exigências explícitas do handoff.

**Independent Test**: Abrir a seção Nami no Dashboard. Usar a barra inline para lançar
uma despesa de R$ 50 em "Restaurante". Verificar toast, saldo do mês diminuindo R$ 50
e a transação aparecendo em "Transações recentes" sem recarregar. Depois pressionar `A`
e confirmar que o modal abre com valor em foco.

**Acceptance Scenarios**:

1. **Given** Gustavo está no Dashboard, **When** digita `50` no campo de valor da Quick-Add,
   seleciona o chip "Restaurante" e pressiona Enter (ou clica "Lançar"), **Then** a transação
   é criada via `POST /api/finances/transactions`, o saldo do mês na barra de resumo e nos
   cards diminui R$ 50, e um toast pill "Lançado ✓" aparece por 2600 ms.
2. **Given** Gustavo está em qualquer tela da seção Nami (fora de um campo de texto),
   **When** pressiona a tecla `A` ou `+`, **Then** o AddModal abre com o campo de valor
   em foco automático.
3. **Given** o AddModal está aberto, **When** Gustavo define valor, tipo (despesa/receita),
   categoria, conta/cartão e clica em "Adicionar" (ou pressiona Enter), **Then** a transação
   é persistida via `POST /api/finances/transactions`, o modal fecha e os totais se atualizam.
4. **Given** o AddModal está aberto, **When** Gustavo pressiona Esc ou clica fora do modal,
   **Then** o modal fecha sem salvar nada.
5. **Given** Gustavo usa a Quick-Add inline, **When** alterna o botão de tipo (despesa ↔
   receita), **Then** os chips de categoria mudam para o conjunto correto (5 despesa /
   4 receita) e a cor do botão muda de coral para verde.
6. **Given** uma transação é salva com sucesso, **When** a resposta do backend chega,
   **Then** os campos da Quick-Add resetam e o foco retorna ao campo de valor.

---

### User Story 2 — Ver o dashboard financeiro do mês (Priority: P1)

Gustavo abre a seção Nami e tem uma visão consolidada do mês corrente: hero com a imagem
da Nami e o saldo do mês em destaque, quatro cards de resumo, gráfico de fluxo de caixa
histórico, donut "Para onde foi", preview de contas, próximos vencimentos, top-3 orçamentos
e as 6 últimas transações. Navega para meses anteriores com as setas da topbar e todos os
números se atualizam.

**Why this priority**: O dashboard é a tela inicial — sem ele não há contexto para usar
as demais abas. O hero com a imagem da Nami e o número hero de saldo são a identidade
visual central do produto.

**Independent Test**: Abrir a seção Nami. Verificar que o dashboard carrega com: hero
(imagem `nami-hero.png` ancorada na base com glow, saudação "Bom dia / Boa tarde",
número do saldo do mês em Bricolage 62px verde ou coral), 4 cards, fluxo de caixa em
barras duplas, donut com categorias, lista de contas, "Próximos vencimentos", top-3
orçamentos e 6 transações recentes. Clicar na seta de mês anterior e verificar que todos
os números mudam.

**Acceptance Scenarios**:

1. **Given** Gustavo abre a seção Nami, **When** a tela carrega, **Then** o hero exibe
   a imagem `nami-hero.png` ancorada na base com `drop-shadow` e glow radial, a saudação
   contextual (Bom dia/Boa tarde/Boa noite), o saldo líquido do mês em fonte 62px, verde
   se positivo e coral se negativo, e os dois CTAs "Nova transação" e "Ver extrato".
2. **Given** o dashboard está carregado, **When** Gustavo olha os cards de resumo,
   **Then** vê exatamente 4 cards: (a) Receitas — total + contagem de lançamentos;
   (b) Despesas — total + sparkline de barras + variação em % vs. mês anterior;
   (c) Saldo do mês — total + barra de taxa de economia; (d) Patrimônio — soma de todas
   as contas + disponível líquido.
3. **Given** o dashboard está carregado, **When** Gustavo olha o painel "Fluxo de caixa",
   **Then** vê barras duplas verticais (verde = entradas, coral = saídas) por mês, com o
   mês atual visualmente destacado.
4. **Given** o mês tem despesas por categoria, **When** Gustavo olha o painel "Para onde
   foi", **Then** vê um donut SVG com as top categorias de despesa e, na legenda ao lado,
   o nome da categoria, a % e o valor absoluto.
5. **Given** há contas cadastradas, **When** Gustavo olha o painel "Contas",
   **Then** vê lista com logo/sigla, nome, tipo e saldo de cada conta.
6. **Given** há assinaturas, financiamentos e empréstimos ativos, **When** Gustavo olha
   "Próximos vencimentos", **Then** vê os itens ordenados por dias restantes, com nome,
   valor e contagem de dias até o próximo vencimento.
7. **Given** há orçamentos no mês, **When** Gustavo olha "Orçamentos", **Then** vê os
   3 com maior % de gasto, com barra de progresso e link "Gerenciar →".
8. **Given** há transações no mês, **When** Gustavo olha "Transações recentes", **Then**
   vê as 6 mais recentes no formato TxRow com link "Ver extrato →".
9. **Given** o dashboard está carregado, **When** Gustavo clica na seta de mês anterior
   na topbar, **Then** todos os valores, gráficos e listas se atualizam para o mês
   selecionado sem recarregar a página.
10. **Given** o mês selecionado não tem nenhuma transação, **When** o dashboard carrega,
    **Then** todos os cards mostram zero, gráficos exibem estado vazio com mensagem
    descritiva, sem erros de JavaScript.

---

### User Story 3 — Gerenciar transações (extrato) (Priority: P2)

Gustavo acessa a aba Transações para ver o extrato completo do mês agrupado por dia,
buscar um lançamento específico, filtrar por tipo ou categoria, adicionar transações e
excluir lançamentos errados.

**Why this priority**: CRUD de transações é o núcleo funcional da Nami. Depois do
lançamento rápido (P1), o usuário precisa auditar e corrigir o extrato.

**Independent Test**: Abrir Transações. Verificar lista agrupada por data do mês corrente,
com saldo líquido do dia em cada grupo. Criar despesa via botão "Adicionar"; confirmar
que aparece no topo do grupo do dia. Excluir a transação no hover; confirmar que
desaparece com toast e saldo do dia recalculado.

**Acceptance Scenarios**:

1. **Given** Gustavo está na aba Transações, **When** a tela carrega, **Then** vê as
   transações do mês selecionado agrupadas por data (mais recente primeiro), com cada
   grupo exibindo a data relativa (ex.: "Hoje", "Ontem", ou "Sex, 6 jun") e o saldo
   líquido do dia (entradas − saídas).
2. **Given** a lista está visível, **When** Gustavo passa o mouse sobre uma TxRow,
   **Then** o fundo da linha muda para `--card-2` e aparece o botão de excluir (ícone
   de lixeira); ao clicar e confirmar, a transação é deletada via
   `DELETE /api/finances/transactions/:id`, o saldo do dia e do mês se atualizam e um
   toast confirma.
3. **Given** Gustavo usa o campo de busca na topbar, **When** digita 2+ caracteres,
   **Then** é navegado automaticamente para a aba Transações e a lista filtra em tempo
   real por nome do estabelecimento e nome da categoria.
4. **Given** os chips de filtro estão visíveis, **When** Gustavo clica em "Despesas",
   **Then** apenas transações do tipo `out` aparecem; ao clicar num chip de categoria
   (ex.: "Lazer"), apenas transações daquela categoria são exibidas.
5. **Given** Gustavo troca o mês na topbar, **When** a seleção muda, **Then** o extrato
   recarrega com as transações do novo mês selecionado.

---

### User Story 4 — Gerenciar contas (Priority: P2)

Gustavo acessa a aba Contas para criar, visualizar e remover contas bancárias. Cada conta
tem uma cor de acento visual, uma sigla de 2 letras (fallback de ícone) ou um logo
personalizado (via upload ou URL). O painel mostra a composição do patrimônio total.

**Why this priority**: Sem contas cadastradas, os lançamentos não têm origem e o saldo
do patrimônio não faz sentido.

**Independent Test**: Criar uma conta "Nubank" tipo Corrente com cor roxa e sigla "NU".
Verificar que aparece em card com barra de acento roxa e sigla como logo. Colar URL de
ícone, confirmar preview circular. Salvar; confirmar que o ícone aparece no card e no
dashboard. Excluir a conta.

**Acceptance Scenarios**:

1. **Given** Gustavo está na aba Contas, **When** a tela carrega, **Then** vê cards em
   grid `repeat(auto-fill, minmax(280px, 1fr))` com: barra de acento lateral (4px, cor
   da conta), logo circular (sigla fallback ou `<img>` 40px), nome, tipo, saldo em
   Bricolage 28px e entradas/saídas do mês no rodapé.
2. **Given** Gustavo clica em "Nova conta", **When** o FormModal abre, **Then** vê
   campos: nome (text), tipo (select: Conta corrente / Poupança / Investimentos /
   Dinheiro), saldo atual (money), sigla 2 chars (text), cor (7 swatches oklch
   clicáveis), ícone (IconField).
3. **Given** Gustavo cola uma URL no IconField, **When** a URL é inserida, **Then**
   um preview circular do ícone aparece em tempo real; ao salvar, o logo substitui
   a sigla em todos os locais onde a conta aparece (lista, dashboard, seletor de conta).
4. **Given** Gustavo faz upload de um arquivo de imagem no IconField, **When** o
   arquivo é carregado, **Then** é exibido imediatamente como preview (Data URL via
   FileReader); ao salvar, o backend recebe o arquivo ou a URL e retorna `icon_url`.
5. **Given** nenhum ícone foi definido, **When** a conta é exibida, **Then** a sigla
   de 2 letras aparece sobre fundo colorido (cor da conta) como fallback.
6. **Given** Gustavo passa o mouse sobre um card de conta, **When** o hover é detectado,
   **Then** aparece botão de excluir (lixeira) em posição `absolute top-right`; ao
   confirmar, a conta é removida via `DELETE /api/finances/accounts/:id`.
7. **Given** há múltiplas contas, **When** Gustavo olha o painel de composição do
   patrimônio, **Then** vê uma barra horizontal segmentada com a proporção de cada
   conta e legenda com nome, tipo e saldo.

---

### User Story 5 — Gerenciar cartões de crédito (Priority: P2)

Gustavo acessa a aba Cartões para ver seus cartões de crédito no formato de plástico físico,
com fatura atual, barra de uso do limite e os últimos lançamentos. Pode criar novos cartões
e excluir existentes.

**Why this priority**: Cartões são a principal fonte de pagamento; sem eles, os lançamentos
de despesa ficam sem origem e a fatura mensal não é calculada.

**Independent Test**: Criar um cartão Nubank Mastercard, últimos 4 dígitos 4471, limite
R$ 5000, fechamento dia 3, vencimento dia 10, gradiente roxo. Verificar que o plástico
exibe número mascarado, chip EMV, bandeira Mastercard, fatura calculada com base nas
transações do mês, barra de uso e datas de fechamento/vencimento.

**Acceptance Scenarios**:

1. **Given** Gustavo está na aba Cartões, **When** a tela carrega, **Then** vê cards em
   grid `repeat(auto-fill, minmax(340px, 1fr))` onde cada card exibe: plástico
   (aspect-ratio 1.586, border-radius 18px, gradiente configurável, chip EMV SVG, número
   `•••• •••• •••• 4471`, nome do titular, bandeira), fatura atual, botão "Pagar fatura",
   barra de uso do limite (laranja se < 80%, coral se ≥ 80%), datas fecha/vence/disponível
   e os últimos 4 lançamentos do mês.
2. **Given** Gustavo clica em "Novo cartão", **When** o FormModal abre, **Then** vê
   campos: nome (text), bandeira (select: Mastercard / Visa / Elo / American Express),
   final 4 dígitos (text 4 chars), limite (money), dia de fechamento (number 1–28),
   dia de vencimento (number 1–28), cor/gradiente (swatches de gradiente CSS).
3. **Given** o uso do limite for ≥ 80% da fatura, **When** a barra de uso é renderizada,
   **Then** ela aparece em cor coral (`--out`) sinalizando alerta.
4. **Given** Gustavo passa o mouse sobre um plástico, **When** o hover é detectado,
   **Then** aparece botão de excluir sobre o plástico (fundo semi-transparente branco);
   ao confirmar, o cartão é removido via `DELETE /api/finances/cards/:id`.

---

### User Story 6 — Gerenciar assinaturas recorrentes (Priority: P2)

Gustavo acessa a aba Assinaturas para ver e gerenciar serviços recorrentes com logo
personalizado, valor e próxima data de cobrança. Três cards de resumo mostram total mensal,
total anual e próxima cobrança.

**Why this priority**: Assinaturas são despesas recorrentes fixas — sem elas o controle
financeiro fica incompleto e o painel de "Próximos vencimentos" do dashboard não alimenta.

**Independent Test**: Criar assinatura "Netflix" R$ 55,90/mês, dia 15, categoria
"Lazer", cor vermelha. Verificar que aparece na lista ordenada por dias restantes para
o dia 15, com stat cards atualizados. Colar URL do logo e confirmar preview.

**Acceptance Scenarios**:

1. **Given** Gustavo está na aba Assinaturas, **When** a tela carrega, **Then** vê 3 stat
   cards (total por mês, total por ano, próxima cobrança com nome do serviço e dias
   restantes) e uma lista de assinaturas ordenada por proximidade do dia de cobrança.
2. **Given** a lista de assinaturas está visível, **When** Gustavo olha cada item,
   **Then** vê: logo colorido OU `<img>` custom 42×42 arredondado, nome + categoria,
   dia de cobrança + dias restantes e valor/mês.
3. **Given** Gustavo clica em "Nova assinatura", **When** o FormModal abre, **Then**
   vê campos: serviço (text), valor (money), dia de cobrança (number 1–28), ciclo
   (mensal/anual), categoria (select), cor (swatches), ícone (IconField).
4. **Given** Gustavo define um ícone via IconField (upload ou URL), **When** salva,
   **Then** o logo aparece na lista de assinaturas e no painel "Próximos vencimentos"
   do dashboard.
5. **Given** Gustavo passa o mouse sobre uma assinatura, **When** o hover é detectado,
   **Then** aparece botão de excluir; ao confirmar, a assinatura é removida via
   `DELETE /api/finances/subscriptions/:id`.

---

### User Story 7 — Gerenciar orçamentos por categoria (Priority: P2)

Gustavo acessa a aba Orçamentos para definir envelopes mensais por categoria, ver o
percentual gasto e identificar quais categorias ultrapassaram o limite.

**Why this priority**: Orçamentos traduzem intenção financeira em controle concreto —
complementam o lançamento livre (P1) com disciplina.

**Independent Test**: Definir orçamento de R$ 500 para "Lazer" no mês corrente. Verificar
barra de progresso partindo de zero. Lançar despesa de R$ 600 em Lazer. Verificar que a
barra fica coral e a legenda indica "Passou R$ 100".

**Acceptance Scenarios**:

1. **Given** Gustavo está na aba Orçamentos, **When** a tela carrega, **Then** vê um
   painel de resumo com total gasto vs. total orçado e uma barra geral de progresso, mais
   a lista de envelopes por categoria.
2. **Given** há envelopes cadastrados, **When** Gustavo olha cada budget row, **Then**
   vê: ícone + nome da categoria, valor gasto / limite, %, barra de progresso (cor da
   categoria até 85%, ouro entre 85–99%, coral se ultrapassou) e rodapé "X% usado ·
   restam R$..." ou "Passou R$ Y".
3. **Given** Gustavo clica em "Novo orçamento", **When** o FormModal abre, **Then**
   o select de categoria exibe apenas categorias que ainda não têm orçamento no mês
   corrente.
4. **Given** o gasto ultrapassou o limite de uma categoria, **When** Gustavo olha a
   barra de progresso, **Then** ela aparece em coral (`--out`) e o rodapé indica o
   valor excedido.
5. **Given** Gustavo passa o mouse sobre um envelope, **When** o hover é detectado,
   **Then** aparece botão de excluir; ao confirmar, o orçamento é removido via
   `DELETE /api/finances/budgets/:month/:categoria`.

---

### User Story 8 — Gerenciar empréstimos entre pessoas (Priority: P2)

Gustavo acessa a aba Empréstimos para controlar dívidas informais entre pessoas: o que
ele emprestou (a receber) e o que pegou emprestado (a pagar). Cada card mostra a pessoa,
valor restante, barra de progresso e dots visuais de parcelas.

**Why this priority**: O design modela empréstimos como dívidas pessoa-a-pessoa — separados
dos financiamentos estruturados — com campos específicos (`direction`, `person_name`)
ausentes do backend atual. Esta User Story define o comportamento esperado fiel ao
design handoff; extensão de backend detalhada nas Assumptions.

**Independent Test**: Criar empréstimo "Emprestei R$ 500 para Ana, 5 parcelas, nenhuma
paga, dia 10". Verificar card com badge "emprestou", nome "Ana", dots (○○○○○), barra
de progresso em zero e stat card "A receber" atualizado. Criar empréstimo "Peguei
emprestado R$ 200 de Carlos". Verificar card com badge "você deve" e stat card "A pagar"
atualizado. Os dois aparecem na mesma lista.

**Acceptance Scenarios**:

1. **Given** Gustavo está na aba Empréstimos, **When** a tela carrega, **Then** vê 2
   stat cards: "A receber" (verde, soma dos empréstimos `direction='lent'`) e "A pagar"
   (coral, soma dos `direction='borrowed'`), mais o grid de LoanCards.
2. **Given** há LoanCards, **When** Gustavo olha cada card, **Then** vê: badge
   "emprestou" (fundo verde) ou "você deve" (fundo coral); nome da pessoa + valor
   restante em destaque; total + valor da parcela; barra de progresso (pago vs. total);
   dots de parcelas (✓ verde para pagas, número para pendentes); rodapé com
   "X/Y parcelas · próximo dia DD/MM" e observação em itálico (se preenchida).
3. **Given** Gustavo clica em "Novo empréstimo", **When** o FormModal abre, **Then**
   vê campos: direção (segment "Emprestei" / "Peguei emprestado"), pessoa (text),
   total (money), parcelas (number), parcelas já pagas (number), dia de vencimento
   (number 1–28), observação (text opcional).
4. **Given** Gustavo passa o mouse sobre um LoanCard, **When** o hover é detectado,
   **Then** aparece botão de excluir; ao confirmar, o empréstimo é removido via
   `DELETE /api/finances/loans/:id`.

---

### User Story 9 — Gerenciar financiamentos (Priority: P2)

Gustavo acessa a aba Financiamentos para controlar dívidas estruturadas com instituições
financeiras (banco, financeira, consórcio). Cada card exibe descrição, credor, saldo
devedor, taxa de juros, barra de progresso e dots de parcelas — entidade completamente
separada dos Empréstimos.

**Why this priority**: O design trata Financiamentos como entidade própria — não um
filtro de `tipo` sobre a mesma tabela de Empréstimos — com campos específicos (`lender`,
`interest_rate`, `description`) e visualização distinta. Separação visual e semântica é
requisito explícito do handoff §6.8.

**Independent Test**: Criar financiamento "MacBook Pro, Nubank, R$ 12.000, 12 parcelas,
0 pagas, dia 5, taxa 2,1% a.m.". Verificar card com badge "financiamento" (coral), saldo
devedor R$ 12.000, taxa "2,1% a.m.", dots (12 vazios), stat card "Saldo devedor" atualizado.
Verificar que a aba Empréstimos não exibe este item.

**Acceptance Scenarios**:

1. **Given** Gustavo está na aba Financiamentos, **When** a tela carrega, **Then** vê
   2 stat cards: "Saldo devedor" (coral, soma total) e "Parcelas/mês" (total de parcelas
   ativas), mais o grid de cards de financiamento.
2. **Given** há cards de financiamento, **When** Gustavo olha cada card, **Then** vê:
   badge "financiamento" (coral); descrição do bem + credor; saldo devedor em destaque;
   taxa de juros descritiva (ex.: "2,1% a.m."); barra de progresso; dots de parcelas;
   rodapé "X/Y parcelas · próximo dia DD/MM".
3. **Given** Gustavo clica em "Novo financiamento", **When** o FormModal abre, **Then**
   vê campos: descrição (text), credor/banco (text), valor financiado (money), parcelas
   totais (number), parcelas já pagas (number), dia de vencimento (number 1–28), taxa
   de juros (text descritivo, ex.: "2,1% a.m."), observação (text opcional).
4. **Given** Gustavo passa o mouse sobre um card, **When** o hover é detectado,
   **Then** aparece botão de excluir; ao confirmar, o financiamento é removido via
   `DELETE /api/finances/financings/:id`.
5. **Given** a aba Empréstimos e a aba Financiamentos existem com dados em ambas,
   **When** Gustavo alterna entre elas, **Then** cada aba exibe exclusivamente os
   registros do seu tipo — sem sobreposição.

---

### User Story 10 — Personalização de aparência e modo privacidade (Priority: P3)

Gustavo acessa o painel de Tweaks da seção Nami para ajustar o tema (claro/escuro), a
cor de acento, a densidade do extrato e ativar o modo privacidade. As preferências são
salvas localmente e restauradas automaticamente na próxima sessão.

**Why this priority**: Personalização é camada de qualidade de vida; o produto é
totalmente funcional sem ela. Depende das telas P2 estarem completas para ter contexto
visual suficiente.

**Independent Test**: Ativar tema escuro → verificar que a paleta muda para as vars
`[data-theme='dark']` do handoff. Ativar privacidade → todos os valores `.amount`/`.priv`
ficam com `blur(7px)`. Recarregar a página → preferências mantidas. Mudar a cor de
acento para azul-maré → botões, ativo sidebar e destaques mudam instantaneamente.

**Acceptance Scenarios**:

1. **Given** o tema está claro, **When** Gustavo troca para "Escuro" nos Tweaks,
   **Then** toda a seção Nami muda para a paleta `[data-theme='dark']` do handoff
   imediatamente: `--paper` vira `#1A1E2A`, `--tang` vira `#E08840`, etc.
2. **Given** o modo privacidade está desligado, **When** Gustavo ativa, **Then** todos
   os elementos com classe `.amount` ou `.priv` recebem `filter: blur(7px)`; ao passar
   o mouse sobre um valor, o blur é temporariamente removido.
3. **Given** Gustavo definiu tema escuro e cor de acento azul-maré, **When** recarrega
   ou retorna à seção Nami, **Then** as preferências são restauradas sem nova configuração
   (persistência via localStorage).
4. **Given** Gustavo troca a cor de acento (tangerina/azul-maré/coral/ouro), **When**
   seleciona uma opção, **Then** as CSS vars `--tang*` mudam em toda a interface
   instantaneamente — botões, item ativo na sidebar, destaques, barras de progresso.
5. **Given** Gustavo altera a densidade do extrato (Confortável/Compacto), **When**
   salva a preferência, **Then** a altura das TxRows e o espaçamento interno das listas
   de transações muda de forma perceptível.

---

### Edge Cases

- **Mês sem transações**: cards mostram zero, gráficos exibem estado vazio com mensagem
  descritiva ("Nenhuma transação neste mês"), sem erros de JavaScript nem NaN visível.
- **Falha de rede ao salvar transação**: o modal permanece aberto, exibe uma mensagem
  de erro inline (não um alert nativo), e nenhum dado inconsistente é mostrado na UI.
- **Upload de arquivo não-imagem no IconField**: validação no frontend rejeita o arquivo
  antes de enviar (verificar `file.type.startsWith('image/')`), exibindo mensagem descritiva.
- **URL de ícone inválida ou quebrada**: o `<img>` exibe o fallback de sigla via `onError`.
- **Conta com saldo negativo**: valor exibido em coral — não é tratado como erro.
- **Fatura do cartão ≥ 100% do limite**: barra coral cheia; lançamento ainda é permitido
  (controle é visual, não restritivo).
- **Tentar excluir conta com transações**: o backend decide o comportamento (encerramento
  preserva histórico); a UI exibe o feedback retornado pelo endpoint.
- **Orçamento excedido**: barra coral, valor negativo no rodapé mostrado em coral — não
  bloqueia novos lançamentos.
- **Empréstimo com 0 parcelas pagas**: todos os dots aparecem como números; barra em zero.
- **Financiamento já quitado (parcelas pagas = total)**: barra completa verde, badge
  muda para "quitado" (estado visual a definir no plano).

---

## Requirements *(mandatory)*

### Functional Requirements

#### Navegação e Shell

- **FR-001**: A seção Nami MUST ser implementada como sub-app de personagem dentro do
  webapp existente, espelhando a estrutura de `webapp/frontend/src/pages/frieren/`
  (`FrierenShell` como referência de padrão estrutural).
- **FR-002**: A sidebar MUST ter `width: 250px` com `background: var(--paper-2)` e
  `border-right: 1px solid var(--line)` e exibir: brand mark circular (42px, imagem
  `nami.jpg`) + nome "Nami" em Bricolage Grotesque 19px 700 + role "Finanças" em DM Mono
  9.5px uppercase tangerina; botão "Nova transação" full-width tangerina com atalho `A`
  à direita; três grupos de navegação com label DM Mono 9px uppercase `--ink-4`:
  **Visão geral** (Dashboard), **Dia a dia** (Transações, Contas, Cartões),
  **Planejamento** (Orçamentos, Assinaturas, Empréstimos, Financiamentos); badges de
  valor à direita de Contas (patrimônio total compacto), Cartões (fatura total do mês
  compacta) e Assinaturas (total mensal compacto) em DM Mono 10.5px; e um link "Voltar
  à Makima" no rodapé com bolinha colorida.
- **FR-003**: O item ativo na sidebar MUST ter `background: var(--tang-tint)`,
  `color: var(--tang-deep)` e `font-weight: 600`.
- **FR-004**: A topbar MUST ter `height: 56px`, `backdrop-filter: blur(12px)`,
  `background: var(--topbar-bg)` e exibir: título da tela ativa em Bricolage Grotesque
  18px 600; seletor de mês (chevrons ‹ › + label "Junho 2026" com min-width 104px)
  apenas nas telas Dashboard, Transações, Contas, Cartões e Orçamentos; campo de busca
  pill 190px min-width.
- **FR-005**: A barra de resumo do mês (SummBar) MUST ser visível em todas as telas,
  fixa na base do layout com `height: 64px`, `backdrop-filter: blur(16px)`, exibindo:
  "Entrou" (verde), "Saiu" (coral), divisor, "Saldo do mês", barra de fluxo proporcional
  e botão "+ Nova transação".
- **FR-006**: A seção MUST suportar deep-link por hash (ex.: `/nami#transacoes`,
  `/nami#cartoes`) para que links externos abram diretamente na aba correta.
- **FR-007**: Os sub-itens de navegação da Nami na sidebar principal do Makima Web App
  MUST abrir diretamente na aba correspondente via deep-link, sem passar pelo dashboard
  como intermediário.

#### Lançamento de Transação

- **FR-008**: O dashboard MUST exibir uma Quick-Add bar inline abaixo do hero, com:
  botão toggle tipo (alterna despesa ↔ receita, muda cor e ícone), campo de valor com
  prefixo "R$", campo de descrição separado por divisor vertical, chips de categoria
  rápida (5 despesa / 4 receita, clicáveis com cor), botão "Lançar" habilitado apenas
  com valor > 0. `Enter` em qualquer campo salva; após salvar os campos resetam e o
  foco retorna ao valor. A mesma Quick-Add MUST aparecer no topo da aba Transações.
- **FR-009**: O AddModal MUST ser acessível pelo: botão "Nova transação" da sidebar;
  botão "+ Nova transação" da SummBar; atalho global `A` ou `+` (enquanto o foco não
  está em um campo de texto). Ao abrir, o foco MUST ir automaticamente para o campo
  de valor (56px Bricolage, cor por tipo).
- **FR-010**: O AddModal MUST oferecer: toggle despesa/receita (2 abas coral/verde no
  topo); valor central; grid de categorias 4×N (ícone + nome, seleção visual); campos
  de descrição (opcional), conta/cartão (select), data; botões "Cancelar" (ghost) e
  "Adicionar" (tangerina), desabilitados se inválido; `Enter` salva, `Esc` fecha;
  fecho ao clicar no scrim (fora do modal).
- **FR-011**: Após salvar qualquer transação (via Quick-Add ou AddModal), a interface
  MUST atualizar saldo do mês, os 4 cards de resumo, o gráfico de fluxo de caixa, o
  donut "Para onde foi", as transações recentes do dashboard e a SummBar sem recarregar
  a página, e MUST exibir um toast pill de confirmação por 2600 ms.

#### Dashboard

- **FR-012**: O hero card MUST ter `border-radius: 18px`, `min-height: 312px`,
  `padding: 32px 40px 0`, fundo com gradiente radial tangerina + azul-maré sobre
  `var(--mist)`, layout de 2 colunas: cópia à esquerda (eyebrow DM Mono 10.5px
  uppercase → saudação → saldo do mês em `clamp(42px, 5.5vw, 62px)` Bricolage bold,
  verde se positivo e coral se negativo → subtítulo entrada/saída → 2 CTAs) e portrait
  à direita (`nami-hero.png`, max-width 300px, `align-self: flex-end`, `drop-shadow`,
  glow radial).
- **FR-013**: O card "Despesas" MUST exibir uma sparkline de barras verticais com os
  últimos N meses e a variação percentual vs. o mês anterior (verde se menor, coral se
  maior).
- **FR-014**: O gráfico "Fluxo de caixa" MUST renderizar barras duplas verticais (verde
  entradas, coral saídas) por mês, com o mês atualmente selecionado visualmente destacado.
- **FR-015**: O donut "Para onde foi" MUST ser um SVG gerado no front-end com os dados
  da API, exibindo as top categorias de despesa do mês e uma legenda com %, nome e
  valor absoluto.
- **FR-016**: O painel "Próximos vencimentos" MUST exibir até 4 itens ordenados por
  dias restantes, combinando assinaturas + empréstimos + financiamentos ativos, com
  nome, valor e badge de dias restantes.

#### Componentes Visuais Compartilhados

- **FR-017**: Cada TxRow MUST seguir o layout:
  `[CatBadge 38×38] [nome 13.5px bold] [categoria · fonte pill 11.5px]   [± valor 14.5px bold tabular]  [🗑 hover]`.
  CatBadge: ícone sobre fundo com `opacity 14%` da cor da categoria. Hover na linha:
  `background: var(--card-2)`.
- **FR-018**: O FormModal MUST seguir: `align-items: flex-start`, `padding-top: 8vh`,
  `max-width: 440–480px`; header com título Bricolage 20px 700 + botão X; scrim com
  `backdrop-filter: blur`; `onMouseDown` fora fecha; `Enter` salva, `Esc` fecha; foco
  automático no primeiro campo ao abrir.
- **FR-019**: O FormModal MUST suportar os tipos de campo: `text`, `url`, `number`,
  `date`, `money` (container "R$" + input sem spinner), `select`, `segment` (chips
  radio visuais), `color` (swatches 34×34px, border-radius 9px), `image` (IconField).
- **FR-020**: O **IconField** MUST exibir um preview 56×56 (circular para contas e
  assinaturas, `border-radius 13px` para outros); botão "Enviar imagem" que abre um
  `<input type="file" accept="image/*">` oculto e lê o arquivo via `FileReader` como
  Data URL; campo de URL aceita qualquer URL de imagem ou Data URL; botão "Remover"
  aparece se há imagem definida; ao salvar, o backend recebe o arquivo ou a URL e
  persiste `icon_url`.
- **FR-021**: O Toast MUST ser exibido em `fixed bottom 88px center`, com fundo
  `var(--ink)`, texto `var(--paper)`, ícone check tangerina, border-radius 999px (pill),
  desaparecendo após 2600 ms com animação de subida 14px + fade-in.

#### CRUD por Entidade

- **FR-022**: Cada aba de entidade (Transações, Contas, Cartões, Orçamentos, Assinaturas,
  Empréstimos, Financiamentos) MUST ter um botão "Novo"/"Adicionar" no cabeçalho que
  abre o FormModal de criação.
- **FR-023**: Todo botão de exclusão MUST ser invisível em estado normal e aparecer
  apenas no hover do item; ao confirmar, MUST chamar o endpoint `DELETE` correspondente
  em `/api/finances/*`.
- **FR-024**: Após qualquer operação de criação ou exclusão, a lista MUST ser atualizada
  visualmente sem recarregar a página, exibindo o toast de confirmação.

#### Empréstimos (pessoa-a-pessoa)

- **FR-025**: A aba Empréstimos MUST exibir APENAS registros do tipo "empréstimo
  pessoa-a-pessoa", com campo obrigatório `direction` (`lent` | `borrowed`) e campo
  obrigatório `person_name`.
- **FR-026**: Os dots de parcelas MUST ser renderizados como: `✓` (verde) para parcelas
  pagas e número ordinal (cinza, pendente) para parcelas a pagar.
- **FR-027**: O stat card "A receber" MUST somar apenas registros com `direction='lent'`;
  o stat card "A pagar" MUST somar apenas registros com `direction='borrowed'`.

#### Financiamentos (entidade separada)

- **FR-028**: A aba Financiamentos MUST exibir APENAS registros da entidade
  `financings` (tabela separada ou discriminador explícito — decisão do plano técnico),
  que NUNCA aparecem na aba Empréstimos.
- **FR-029**: Cada card de financiamento MUST exibir: descrição, credor/banco, saldo
  devedor calculado, taxa de juros descritiva, barra de progresso, dots de parcelas e
  próximo vencimento.

#### Fidelidade Visual (Design Tokens — handoff §2)

- **FR-030**: O sistema de design MUST implementar os tokens CSS do handoff usando
  CSS custom properties:
  - Tipografia: `--display` Bricolage Grotesque; `--sans` DM Sans; `--mono` DM Mono.
  - Paleta clara: `--paper`, `--paper-2`, `--card`, `--card-2`, `--mist`, `--ink`
    (a `--ink-4`), `--line`, `--line-2`, `--tang`, `--tang-deep`, `--tang-bright`,
    `--tang-tint`, `--tang-tint-2`, `--sea`, `--sea-deep`, `--sea-tint`, `--gold`,
    `--gold-tint`, `--in`, `--in-tint`, `--out`, `--out-tint`.
  - Paleta escura: sobrescrita via `[data-theme='dark']`.
  - Border radius: `--r-sm: 8px`, `--r-md: 12px`, `--r-lg: 18px`.
  - Sombras: `--shadow-sm`, `--shadow-md`, `--shadow-lg` (ver handoff §2).
- **FR-031**: Valores monetários em listas e cards MUST usar
  `font-variant-numeric: tabular-nums` para alinhamento de colunas.
- **FR-032**: Formatação de moeda MUST usar `Intl.NumberFormat('pt-BR',
  { minimumFractionDigits: 2 })` para valores completos e o formato compacto `1,2k`
  para valores ≥ 1000 em badges e espaços reduzidos.

#### Tweaks e Privacidade

- **FR-033**: O modo escuro MUST ser implementado via `data-theme="dark"` no elemento
  raiz da seção Nami, sobrescrevendo os tokens CSS sem alterar a estrutura HTML.
- **FR-034**: O modo privacidade MUST ser implementado via `data-privacy="on"` na raiz:
  todos os elementos com classe `.amount` ou `.priv` recebem `filter: blur(7px)`;
  hover neles remove o blur temporariamente (`filter: none`).
- **FR-035**: A troca de cor de acento MUST alterar dinamicamente as CSS vars `--tang`,
  `--tang-deep`, `--tang-bright`, `--tang-tint`, `--tang-tint-2` nas 4 opções do
  handoff: Tangerina (`#EF8B3D`), Azul-maré (`#3B82C4`), Coral (`#E0524A`),
  Ouro (`#C9A227`).
- **FR-036**: Todas as preferências de Tweaks (tema, acento, densidade, privacidade)
  MUST ser persistidas em `localStorage` com chave prefixada (ex.: `nami:theme`) e
  restauradas ao montar o componente shell.

#### Responsividade

- **FR-037**: Em viewports `< 880px`, a sidebar MUST colapsar para `width: 66px`
  exibindo apenas ícones (sem textos).
- **FR-038**: Em viewports `< 900px`, grids de 2 colunas (fluxo/donut, contas/
  vencimentos) MUST virar 1 coluna.
- **FR-039**: Em viewports `< 760px`, o portrait `nami-hero.png` MUST ser ocultado
  no hero card.

---

### Key Entities *(alinhadas ao design handoff §3)*

- **Transaction**: registro de gasto ou receita — `id`, `user_id`, `type`
  (`'in'`|`'out'`), `amount: decimal(12,2)`, `category_id`, `merchant` (descrição),
  `source_id`, `source_type` (`'account'`|`'card'`), `date`, `created_at`. Persiste
  em `transactions`.

- **Account** *(requer extensão de backend)*: conta financeira — `id`, `user_id`,
  `name`, `kind` (Conta corrente | Poupança | Investimentos | Dinheiro),
  `balance: decimal(12,2)`, `color: string` (oklch/hex — **novo**),
  `short: string(2)` (sigla — **novo**), `img_url: string?` (URL do ícone — **novo**).
  Persiste em `accounts`.

- **Card** *(requer extensão de backend)*: cartão de crédito — `id`, `user_id`, `name`,
  `brand: enum` (Mastercard | Visa | Elo | American Express — **novo**),
  `last4: string(4)` (**novo**), `limit: decimal(12,2)`, `close_day: int(1-28)`,
  `due_day: int(1-28)`, `grad: string` (CSS gradient — **novo**). Persiste em
  `credit_cards`.

- **Category**: entidade fixa (seed) — `id` (slug), `name`, `icon`, `color` (oklch),
  `kind` (`'in'`|`'out'`). Despesas: `mercado`, `restaurante`, `transporte`, `casa`,
  `saude`, `lazer`, `compras`, `educacao`, `viagem`, `assinaturas`, `outros`. Receitas:
  `salario`, `freela`, `investimento`, `reembolso`.

- **Budget**: envelope mensal — `id`, `user_id`, `category_id`, `limit_amount:
  decimal(12,2)`, `month: date` (primeiro dia do mês, ex.: `2026-06-01`). Persiste em
  `budgets`.

- **Subscription** *(requer extensão de backend)*: recorrência — `id`, `user_id`,
  `name`, `amount: decimal(12,2)`, `cycle` (mensal | anual),
  `next_billing_day: int(1-28)` (**novo — substitui ou complementa `next_billing DATE`**),
  `category_id`, `color: string` (**novo**), `img_url: string?` (**novo**).
  Persiste em `subscriptions`.

- **Loan** *(requer extensão ou nova tabela de backend)*: empréstimo pessoa-a-pessoa —
  `id`, `user_id`, `direction: enum` (`'lent'`|`'borrowed'` — **novo**),
  `person_name: string` (**novo**), `total_amount: decimal(12,2)`, `installments: int`,
  `paid_installments: int`, `next_due_day: int(1-28)`, `note: string?`. Completamente
  distinto do modelo atual `loans` (PRICE/SAC).

- **Financing** *(nova entidade — backend inexistente)*: financiamento estruturado —
  `id`, `user_id`, `description: string`, `lender: string?`, `total_amount:
  decimal(12,2)`, `installments: int`, `paid_installments: int`,
  `next_due_day: int(1-28)`, `interest_rate: string?` (descritivo, ex.: "2,1% a.m."),
  `note: string?`. Nova tabela `financings` ou mecanismo equivalente — decisão do plano.

- **Sumário mensal** (derivado): `income`, `expense`, `net`, `by_category[]`,
  `daily_spending[]`, `cashflow[]`. Calculado pelo backend; não persiste.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Gustavo consegue lançar uma despesa em no máximo 3 interações (campo de
  valor → chip de categoria → Enter/Lançar) a partir do momento em que está em qualquer
  tela da seção Nami.
- **SC-002**: Todas as 9 entidades do sistema de finanças (Transações, Contas, Cartões,
  Orçamentos, Assinaturas, Empréstimos, Financiamentos + operações de Upload de ícone
  e Busca) têm as operações de criar e remover funcionando e conectadas ao backend.
- **SC-003**: O dashboard exibe saldo do mês, receitas, despesas e patrimônio corretamente
  sem nenhuma interação extra após abrir a seção.
- **SC-004**: Ao ativar o modo privacidade, todos os valores monetários da seção ficam
  obscurecidos em menos de 1 segundo (sem recarregar a página).
- **SC-005**: As preferências de aparência (tema, acento, densidade, privacidade) são
  restauradas corretamente ao reabrir a seção, sem nova configuração.
- **SC-006**: Os sub-itens de navegação da Nami na sidebar principal do Makima Web App
  (ex.: "Transações", "Cartões") levam diretamente à aba correta via deep-link.
- **SC-007**: Contas e assinaturas com ícone customizado exibem o logo em todos os
  pontos da interface onde o item aparece (listas, dashboard, "Próximos vencimentos",
  seletor de conta/cartão no modal).
- **SC-008**: A aba Empréstimos e a aba Financiamentos exibem conjuntos de registros
  completamente mutuamente exclusivos — um item criado em uma aba nunca aparece na outra.
- **SC-009**: Os tokens de design (fontes, paleta oklch, radius, sombras) do handoff §2
  são aplicados fielmente, verificável inspecionando os CSS custom properties no elemento
  raiz da seção.
- **SC-010**: O tema escuro (`data-theme="dark"`) muda visualmente pelo menos os tokens
  `--paper`, `--card`, `--tang` e `--in`/`--out` para os valores especificados no
  handoff §2, verificável no inspetor de CSS.

---

## Assumptions

- **Padrão estrutural**: a seção Nami segue a mesma arquitetura do sub-app Frieren
  (`webapp/frontend/src/pages/frieren/`): shell próprio, TweaksPanel, Toast, sistema
  de CSS tokens. A autenticação por cookie `makima_session` e o cliente `api` de
  `webapp/frontend/src/lib/api.ts` são reutilizados sem modificação.

- **Backend existente como base**: o backend `/api/finances/*` é o ponto de partida,
  mas o design exige as seguintes **extensões** (a serem detalhadas no `/speckit-plan`):
  - `accounts`: adicionar colunas `color TEXT`, `short VARCHAR(2)`, `icon_url TEXT`.
  - `credit_cards`: adicionar colunas `brand TEXT`, `last4 VARCHAR(4)`, `grad TEXT`.
  - `subscriptions`: adicionar colunas `color TEXT`, `icon_url TEXT`; rever
    `next_billing DATE` → `next_billing_day INTEGER` ou manter ambos.
  - **`loans`**: o modelo atual (PRICE/SAC, `sistema_amortizacao`, `taxa_juros_mensal`,
    `valor_parcela`) é incompatível com o modelo pessoa-a-pessoa do design (`direction`,
    `person_name`). A decisão de como migrar/separar (nova tabela `personal_loans` vs.
    discriminador vs. adaptar `loans`) é do plano técnico (`/speckit-plan`).
  - **`financings`**: entidade completamente nova — nova tabela `financings` e endpoints
    `GET/POST/DELETE /api/finances/financings*` devem ser criados.
  - **Upload de ícone**: endpoint `POST /api/finances/uploads/icon` (multipart/form-data
    → retorna `{ url }`) ou equivalente (GCS direct upload, etc.) — estratégia exata
    definida no plano.
  - **Endpoint de stats**: `GET /api/finances/stats?month=YYYY-MM` deve retornar
    `income`, `expense`, `net`, `by_category[]`, `daily_spending[]`, `cashflow[]` para
    alimentar os gráficos. Verificar se o endpoint atual `/api/finances/summary` cobre
    todos esses campos.

- **Categorias como seed fixo**: as 15 categorias definidas no handoff são fixas (seed
  no banco) — não customizáveis por usuário nesta fase.

- **Empréstimo pessoa-a-pessoa sem amortização PRICE/SAC**: a entidade `Loan` desta
  spec não implementa cálculo de saldo devedor por amortização — apenas controle visual
  de parcelas pagas vs. total. Se necessário no futuro, é uma extensão separada.

- **Financiamento sem cálculo automático de saldo devedor**: `interest_rate` é um
  campo descritivo (texto livre, ex.: "2,1% a.m.") — o saldo devedor é calculado como
  `total_amount * (1 - paid_installments / installments)` de forma simplificada.
  Cálculo exato (PRICE/SAC) é fora de escopo desta fase.

- **Privacidade é puramente front-end**: dados são sempre transmitidos em claro —
  o blur é visual para evitar olhares; não há mascaramento de dados no backend.

- **Responsividade com foco em desktop**: os breakpoints do handoff §9 são implementados,
  mas o desenvolvimento e teste primário é em desktop (≥ 1280px).

- **Dados mock do design (`nami/data.js`)**: servem apenas como referência visual e
  de estrutura. Todos os dados reais vêm do PostgreSQL via API.

- **Upload local de arquivo (IconField)**: o arquivo é lido via `FileReader` no frontend
  e enviado ao backend como multipart — o backend armazena e retorna uma URL pública.
  O mecanismo de storage (disco local, GCS, etc.) é decidido no plano técnico.

- **Parcelamentos (`installment_groups`)**: a entidade de parcelamento de compras existe
  no backend mas está **fora de escopo visual desta spec** — não há tela dedicada no
  design handoff.
