# Feature Specification: Qualidade de vida no webapp — edição, exportação, filtros, transferências

**Feature Branch**: `043-nami-qol-frontend`

**Created**: 2026-07-06

**Status**: Draft

**Input**: User description: "Qualidade de vida no frontend da Nami: edição de transações (PATCH existe e está ocioso), edição de contas/cartões/assinaturas, exportação CSV das transações, heatmap de gastos por dia, filtro de categorias completo com persistência em localStorage, upload de ícone via wrapper de API padrão, paginação de /transactions, e transferências entre contas (par atômico saída/entrada)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Editar uma transação sem apagar e recriar (Priority: P1)

Registrei um gasto com valor ou categoria errados. Clico em editar na própria linha, o
formulário abre preenchido, corrijo e salvo — sem precisar apagar e recriar (perdendo data
e vínculos).

**Why this priority**: Corrigir lançamentos é a operação mais frequente depois de criar; a
capacidade já existe no backend e a UI não a oferece.

**Independent Test**: Editar valor e categoria de uma transação existente e conferir a
atualização na lista, nos totais do mês e no banco.

**Acceptance Scenarios**:

1. **Given** uma transação na lista, **When** o usuário clica em editar, **Then** o formulário abre pré-preenchido (nome, valor, tipo, categoria, origem, data, notas).
2. **Given** o formulário de edição, **When** o usuário altera valor e salva, **Then** a lista e os totais do mês refletem o novo valor imediatamente.
3. **Given** o formulário de edição, **When** o usuário cancela, **Then** nada muda.

---

### User Story 2 - Editar contas, cartões e assinaturas (Priority: P2)

Posso corrigir nome, cor, limite, dia de vencimento e demais campos de contas, cartões e
assinaturas sem apagar e recriar (o que hoje destruiria o histórico vinculado).

**Why this priority**: Apagar/recriar uma conta ou cartão quebra vínculos com transações;
edição é o caminho seguro e hoje não existe na UI.

**Independent Test**: Renomear uma conta e mudar o limite de um cartão; as telas refletem
e o histórico permanece intacto.

**Acceptance Scenarios**:

1. **Given** uma conta com transações vinculadas, **When** o usuário edita o nome/cor, **Then** as alterações aparecem e o histórico permanece vinculado.
2. **Given** um cartão, **When** o usuário edita limite/dia de vencimento, **Then** a barra de utilização e os próximos vencimentos recalculam.
3. **Given** uma assinatura, **When** o usuário edita valor/próxima cobrança, **Then** a lista e o total mensal atualizam.

---

### User Story 3 - Exportar extrato e filtrar melhor (Priority: P2)

Exporto as transações do mês (respeitando os filtros ativos) como CSV que abre corretamente
no Excel; o filtro de categorias mostra todas as categorias (não só as usadas no mês) e os
filtros/ordenação escolhidos sobrevivem ao recarregar a página.

**Why this priority**: Exportação é a ponte com planilhas (uso real de conferência mensal);
filtros persistidos poupam repetição diária.

**Independent Test**: Aplicar filtro de categoria, exportar, abrir no Excel (acentos OK);
recarregar a página e ver o filtro mantido.

**Acceptance Scenarios**:

1. **Given** transações filtradas por categoria, **When** o usuário clica em exportar, **Then** baixa um CSV apenas com as transações visíveis, com acentuação correta no Excel.
2. **Given** o seletor de categorias, **When** aberto, **Then** lista todas as categorias do sistema, não apenas as presentes no mês.
3. **Given** filtros e ordenação aplicados, **When** o usuário recarrega a página, **Then** os mesmos filtros e ordenação continuam ativos.

---

### User Story 4 - Transferir entre contas (Priority: P2)

Registro uma transferência (ex.: da corrente para a poupança) numa ação só: escolho conta
de origem, conta de destino e valor — o sistema cria o par de movimentos e nenhum dos dois
conta como gasto ou receita nos relatórios.

**Why this priority**: Sem isso, mover dinheiro entre contas exige duas transações manuais
que distorcem os totais de receita/despesa.

**Independent Test**: Transferir R$ 100 entre duas contas; os saldos das duas mudam,
e os totais de receita/despesa do mês não.

**Acceptance Scenarios**:

1. **Given** duas contas cadastradas, **When** o usuário registra uma transferência de R$ 100, **Then** a origem debita e o destino credita R$ 100, de forma atômica (nunca só um lado).
2. **Given** uma transferência registrada, **When** o usuário vê o resumo do mês, **Then** receita e despesa não incluem a transferência.
3. **Given** origem igual ao destino, **When** o usuário tenta confirmar, **Then** recebe validação impedindo a operação.

---

### User Story 5 - Ver o ritmo de gastos por dia e ter lista performática (Priority: P3)

Vejo no Dashboard um heatmap dos gastos por dia do mês (dias mais quentes = mais gasto).
Em meses com muitas transações, a lista carrega rápido e um botão "Carregar mais" traz o
restante.

**Why this priority**: Análise visual complementar e proteção de performance para volume
crescente — menos urgente que os CRUDs.

**Independent Test**: Mês com gastos concentrados em poucos dias mostra o heatmap coerente;
lista com centenas de transações carrega a primeira página rápido.

**Acceptance Scenarios**:

1. **Given** gastos distribuídos no mês, **When** o usuário abre o Dashboard, **Then** vê o heatmap diário com escala de cor proporcional ao gasto.
2. **Given** um mês com mais transações que o tamanho da página, **When** o usuário abre a lista, **Then** vê a primeira página e um controle "Carregar mais" que anexa o restante.

### Edge Cases

- Edição de transação de cartão vs. conta: a origem pode ser trocada entre conta e cartão? Sim — o formulário de edição oferece as mesmas origens da criação, mantendo a exclusividade mútua.
- Exportação com zero transações visíveis: botão desabilitado ou CSV só com cabeçalho (escolher um comportamento e manter).
- CSV precisa abrir com acentos corretos no Excel brasileiro (codificação adequada).
- Transferência envolvendo cartão de crédito: fora do escopo — transferências são só entre contas; pagamento de fatura já cobre conta→cartão (spec 042).
- Persistência de filtros é por dispositivo/navegador (armazenamento local) — não sincroniza entre aparelhos, o que é aceitável.
- Paginação com default alto o suficiente para não alterar o comportamento de quem tem poucos dados.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O usuário MUST poder editar todos os campos de uma transação existente pela lista, com formulário pré-preenchido, refletindo imediatamente em listas e totais.
- **FR-002**: O usuário MUST poder editar contas, cartões e assinaturas (campos cadastrais e visuais) preservando vínculos históricos.
- **FR-003**: O usuário MUST poder exportar as transações visíveis (mês + filtros ativos) como CSV compatível com Excel em português (acentuação correta).
- **FR-004**: O seletor de categoria da lista de transações MUST oferecer todas as categorias do sistema; filtros e ordenação escolhidos MUST persistir entre sessões no mesmo navegador.
- **FR-005**: O upload de ícone MUST usar o mesmo canal padronizado de comunicação com o backend usado pelo restante do app (tratamento de erro e sessão consistentes).
- **FR-006**: A lista de transações MUST ser paginada com tamanho de página generoso e controle "Carregar mais", sem quebrar consumidores existentes.
- **FR-007**: O usuário MUST poder registrar transferência entre duas contas distintas numa única ação, criando o par débito/crédito de forma atômica (tudo-ou-nada), com referência cruzada entre os dois movimentos.
- **FR-008**: Transferências MUST ser excluídas dos totais de receita e despesa em resumos, tendências e orçamentos.
- **FR-009**: O Dashboard MUST exibir um heatmap de gastos por dia do mês com escala de cor proporcional.

### Key Entities

- **Transferência**: par de movimentos vinculados (saída na conta origem + entrada na conta destino) com o mesmo valor e referência cruzada; tipo próprio, fora de receita/despesa.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Corrigir uma transação leva menos de 20 segundos (contra apagar+recriar hoje).
- **SC-002**: O CSV exportado abre no Excel com todas as colunas e acentos corretos em 100% dos casos testados.
- **SC-003**: Após transferência, receita/despesa do mês permanecem idênticas às de antes da operação.
- **SC-004**: Filtros persistem em 100% dos recarregamentos no mesmo navegador.
- **SC-005**: Nenhuma tela existente quebra com a paginação (compatibilidade retroativa verificada).

## Assumptions

- A edição de transação reutiliza o mesmo formulário de criação (modo edição), mantendo consistência visual.
- Ordenação padrão da lista continua por data decrescente; a persistência guarda a última escolha do usuário.
- Transferências não aparecem no orçamento por categoria (não têm categoria de gasto real).
- Independente das demais specs; pode ser entregue em qualquer ordem após a 040.
