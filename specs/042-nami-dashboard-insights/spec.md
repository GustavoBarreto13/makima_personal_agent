# Feature Specification: Dashboard completo — health score, tendência e pagamento de fatura

**Feature Branch**: `042-nami-dashboard-insights`

**Created**: 2026-07-06

**Status**: Draft

**Input**: User description: "Expor no webapp da Nami as análises que o backend já calcula e ninguém consome: score de saúde financeira 0-100 com 4 dimensões (GET /health), tendência de gastos com projeção do mês (GET /trend), registro de pagamento de fatura do cartão (POST /cards/{id}/payment). GET /summary não ganha UI (redundante com /stats) — documentar como endpoint do agente."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ver a saúde financeira de relance (Priority: P1)

Como usuário, ao abrir o Dashboard da Nami vejo um card com meu score de saúde financeira
(0–100) e a quebra nas 4 dimensões (poupança, dívidas, orçamento, tendência) — a mesma
análise que hoje só consigo pedindo pelo Telegram.

**Why this priority**: É o indicador-resumo de todo o domínio financeiro; já é calculado
pelo backend e não aparece em lugar nenhum do webapp.

**Independent Test**: Abrir o Dashboard com dados existentes; o score e as 4 dimensões
devem bater com a resposta do agente no Telegram ("como estão minhas finanças?").

**Acceptance Scenarios**:

1. **Given** dados financeiros existentes, **When** o usuário abre o Dashboard, **Then** vê o score 0–100 com indicação visual (gauge/anel/barras) e as 4 dimensões com seus pontos.
2. **Given** o serviço de score indisponível, **When** o usuário abre o Dashboard, **Then** o card mostra estado de erro discreto sem quebrar o resto da tela.
3. **Given** o mesmo instante, **When** o usuário compara o score do webapp com o do Telegram, **Then** os valores são idênticos (mesma fonte de cálculo).

---

### User Story 2 - Tendência de gastos com projeção do mês (Priority: P2)

Vejo no Dashboard a evolução dos meus gastos nos últimos meses como gráfico de área, com a
projeção do mês corrente destacada ("no ritmo atual, você fecha o mês em R$ X").

**Why this priority**: Responde "estou gastando mais que antes?" sem precisar perguntar ao
agente; a consulta com projeção já existe no backend.

**Independent Test**: Com 3+ meses de dados, o gráfico mostra a curva mensal e o valor
projetado do mês atual igual ao informado pelo agente no Telegram.

**Acceptance Scenarios**:

1. **Given** gastos nos últimos 3 meses, **When** o usuário abre o Dashboard, **Then** vê o gráfico de área da evolução mensal com rótulos dos meses.
2. **Given** o mês corrente em andamento, **When** o gráfico é exibido, **Then** a projeção do mês aparece destacada (badge ou traço diferenciado) e distinta dos meses fechados.
3. **Given** menos de 2 meses de histórico, **When** o usuário abre o Dashboard, **Then** o gráfico exibe o que houver sem quebrar (estado mínimo aceitável).

---

### User Story 3 - Registrar pagamento de fatura do cartão (Priority: P2)

Na tela de Cartões, cada cartão tem a ação "Registrar pagamento": informo valor, conta de
origem e data, e a dívida do cartão diminui na hora — sem precisar do Telegram.

**Why this priority**: Fecha o ciclo do cartão no webapp (hoje dá para criar cartão e ver
dívida, mas não pagar a fatura); a operação já existe no backend.

**Independent Test**: Registrar um pagamento parcial e verificar a dívida do cartão
reduzida pelo valor pago, com a transação de pagamento registrada.

**Acceptance Scenarios**:

1. **Given** um cartão com dívida de R$ 500, **When** o usuário registra pagamento de R$ 200 a partir de uma conta, **Then** a dívida exibida passa a R$ 300 e a barra de utilização do limite atualiza.
2. **Given** o modal de pagamento, **When** o usuário confirma, **Then** a lista de cartões e os totais do Dashboard recarregam refletindo o pagamento.
3. **Given** valor inválido (vazio/zero/negativo), **When** o usuário tenta confirmar, **Then** recebe validação clara e nada é registrado.

### Edge Cases

- Score sem dados suficientes (usuário novo): card mostra o score que o backend devolver, com dimensões zeradas — nunca erro.
- Pagamento de fatura maior que a dívida atual: permitido (gera crédito no cartão) — comportamento do backend é mantido; a UI exibe a dívida possivelmente negativa como crédito.
- Projeção no dia 1º do mês (pouquíssimos dados do mês): exibir a projeção do backend como está, sem suavização na UI.
- Todos os cards de análise falham independentemente: uma falha não derruba o Dashboard inteiro.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O Dashboard MUST exibir o score de saúde financeira (0–100) com a quebra nas 4 dimensões, usando a análise já calculada pelo sistema.
- **FR-002**: O Dashboard MUST exibir a evolução mensal de gastos como gráfico de área com a projeção do mês corrente visualmente destacada.
- **FR-003**: A tela de Cartões MUST oferecer a ação "Registrar pagamento" por cartão, coletando valor, conta de origem e data, refletindo a nova dívida imediatamente após a confirmação.
- **FR-004**: Falhas em qualquer card de análise MUST ser isoladas (estado de erro local, demais cards seguem funcionando).
- **FR-005**: Os elementos gráficos MUST seguir o padrão visual existente do projeto (gráficos próprios, sem dependências externas de chart).
- **FR-006**: A consulta de resumo redundante com as estatísticas do webapp MUST ser documentada como uso exclusivo do agente (sem UI), registrando a decisão na documentação da API.

### Key Entities

- **Score de saúde**: nota 0–100 composta por 4 dimensões pontuadas (poupança, dívidas, orçamento, tendência); calculado sob demanda, não persistido.
- **Tendência**: série mensal de gasto total + valor projetado do mês corrente.
- **Pagamento de fatura**: entrada de dinheiro vinculada ao cartão que reduz a dívida (transação de tipo receita associada ao cartão).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Score e dimensões no webapp idênticos aos do Telegram para o mesmo instante (zero divergência).
- **SC-002**: O usuário registra um pagamento de fatura em menos de 30 segundos a partir da tela de Cartões.
- **SC-003**: Dívida do cartão após pagamento bate com a conferência manual no banco (valor anterior − pagamento).
- **SC-004**: Após a entrega, as rotas de health, trend e pagamento de fatura têm consumidor na UI; a decisão sobre a rota de resumo está documentada.

## Assumptions

- Os cálculos existentes do backend (score, projeção) são considerados corretos — a spec só os expõe; ajustes de fórmula estão fora do escopo.
- O card de score usa representação SVG própria seguindo o padrão do repo (sem lib de gráficos).
- Independente da spec 041; pode ser entregue antes ou depois.
