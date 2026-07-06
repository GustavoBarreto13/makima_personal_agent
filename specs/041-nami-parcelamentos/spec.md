# Feature Specification: Parcelamentos — tela com acompanhamento individual por compra

**Feature Branch**: `041-nami-parcelamentos`

**Created**: 2026-07-06

**Status**: Draft

**Input**: User description: "Tela de Parcelamentos no webapp da Nami com acompanhamento individual por compra (drill-down com a linha do tempo das parcelas), suporte a compras parceladas no cartão de crédito (card_id em create_installment) e detalhamento de parcelamentos dentro de cada cartão com comprometimento mensal da fatura. Endpoints GET/POST/DELETE /installments e GET /commitments/{month} já existem; falta o detalhe por grupo e a UI."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ver e acompanhar cada compra parcelada (Priority: P1)

Como usuário, abro a seção "Parcelamentos" no webapp e vejo todas as minhas compras
parceladas ativas — cada uma com progresso (ex.: 4/10), valor da parcela, quanto ainda
falta pagar e onde foi feita (conta ou cartão). Ao clicar numa compra, vejo a linha do
tempo de todas as parcelas individuais (número, data, valor, paga/pendente), com a parcela
do mês corrente destacada.

**Why this priority**: É o maior gap funcional do webapp — os parcelamentos existem no
backend desde a Fase 1 e não têm NENHUMA tela; hoje só dá para consultá-los pelo Telegram.

**Independent Test**: Criar um parcelamento de teste e navegar até a seção; a lista e o
drill-down devem refletir exatamente as parcelas existentes no banco.

**Acceptance Scenarios**:

1. **Given** um parcelamento de 10x com 4 parcelas no passado, **When** o usuário abre a seção Parcelamentos, **Then** vê a compra com barra de progresso 4/10, valor da parcela e valor restante (6 × parcela).
2. **Given** a lista de parcelamentos, **When** o usuário expande uma compra, **Then** vê as N parcelas com número, data e estado (paga/pendente), com a do mês corrente destacada.
3. **Given** um parcelamento ativo, **When** o usuário cancela as parcelas futuras (com confirmação), **Then** as parcelas já pagas permanecem no histórico e as futuras somem das listas e totais.
4. **Given** nenhum parcelamento cadastrado, **When** o usuário abre a seção, **Then** vê estado vazio com botão para criar a primeira compra parcelada.

---

### User Story 2 - Criar compra parcelada no cartão de crédito (Priority: P1)

Ao registrar uma compra parcelada, escolho se ela foi na conta (débito) ou no cartão de
crédito. Parcelas no cartão entram na dívida do cartão e aparecem na fatura — sem precisar
criar as N transações manualmente.

**Why this priority**: Compra parcelada no cartão é o caso mais comum no Brasil e hoje é
impossível pelo fluxo normal (a criação de parcelamento só aceita conta; a documentação
manda criar transação por transação manualmente).

**Independent Test**: Criar um parcelamento 3x no cartão; verificar que as 3 transações
mensais pertencem ao cartão (e não a uma conta) e que a dívida do cartão aumenta.

**Acceptance Scenarios**:

1. **Given** um cartão cadastrado, **When** o usuário cria um parcelamento 3x escolhendo esse cartão, **Then** são geradas 3 transações mensais consecutivas vinculadas ao cartão (e a nenhuma conta) e a dívida do cartão reflete as parcelas.
2. **Given** o formulário de criação, **When** o usuário escolhe uma conta em vez de cartão, **Then** o comportamento atual é preservado (parcelas vinculadas à conta).
3. **Given** um parcelamento em criação, **When** o usuário não escolhe nem conta nem cartão válido, **Then** recebe erro claro antes de qualquer parcela ser criada (criação é tudo-ou-nada).

---

### User Story 3 - Compromissos futuros e parcelamentos dentro do cartão (Priority: P2)

No topo da seção vejo os compromissos dos próximos meses (parcelas + assinaturas por mês).
Na tela de Cartões, cada cartão mostra seus parcelamentos ativos e o comprometimento mensal
da fatura ("R$ 430/mês em parcelas até out/2026"), com atalho para o drill-down.

**Why this priority**: Dá visão de futuro (quanto da renda já está comprometida) — mas
depende das stories 1 e 2 para ter dados de cartão.

**Independent Test**: Com parcelamentos em dois meses futuros, o card de compromissos
mostra os totais por mês; o cartão usado mostra a seção de parcelamentos ativos.

**Acceptance Scenarios**:

1. **Given** parcelas e assinaturas nos próximos 3 meses, **When** o usuário abre a seção Parcelamentos, **Then** vê um card "Compromissos futuros" com o total por mês (parcelas + assinaturas).
2. **Given** um cartão com 2 parcelamentos ativos, **When** o usuário abre a tela Cartões e expande "Parcelamentos ativos", **Then** vê as 2 compras (nome, X/N, valor da parcela) e o comprometimento mensal somado com o mês em que termina.
3. **Given** a seção de parcelamentos do cartão, **When** o usuário clica numa compra, **Then** navega para a seção Parcelamentos com aquela compra em destaque.

### Edge Cases

- Parcelamento cujo grupo foi cancelado no meio: parcelas pagas continuam contando no histórico; a compra some da lista de ativos.
- Parcela única (1x): tratar como compra normal — a tela deve exibir sem quebrar (1/1).
- Primeira parcela em data futura: progresso 0/N; nada consta como pago.
- Datas de parcela em dia 29/30/31 em meses curtos: as datas mensais consecutivas devem ser válidas (comportamento existente do backend é mantido).
- Estado pago/pendente é derivado da data no fuso do Brasil (depende da spec 040 entregue).
- Exclusão total vs. cancelamento de futuras: ações distintas com confirmações distintas — excluir tudo remove inclusive o histórico.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST expor uma consulta de detalhe de um parcelamento que retorne os dados do grupo e a lista das parcelas individuais (número, data, valor, estado pago/pendente derivado da data local do Brasil).
- **FR-002**: A criação de parcelamento MUST aceitar como origem uma conta OU um cartão de crédito (mutuamente exclusivos), resolvidos dinamicamente contra os cadastros existentes, gerando as N transações mensais vinculadas à origem escolhida de forma tudo-ou-nada.
- **FR-003**: O webapp MUST ter uma seção "Parcelamentos" na navegação da Nami com: lista de compras ativas (progresso X/N, valor da parcela, restante, origem), drill-down por compra com linha do tempo das parcelas, criação, cancelamento de parcelas futuras e exclusão total (ambos com confirmação).
- **FR-004**: A seção MUST exibir os compromissos futuros dos próximos meses (parcelas + assinaturas por mês), reutilizando a consulta de compromissos já existente.
- **FR-005**: A tela de Cartões MUST exibir, por cartão, os parcelamentos ativos daquele cartão com o comprometimento mensal somado e o mês em que termina, com navegação para o drill-down.
- **FR-006**: A parcela do mês corrente MUST ser destacada visualmente no drill-down.
- **FR-007**: A documentação que afirma "criação de parcelamento não aceita cartão" MUST ser removida/atualizada ao entregar.

### Key Entities

- **Grupo de parcelamento**: cabeçalho da compra parcelada (nome, valor total, N parcelas, valor da parcela, origem, primeira data); as parcelas são as N transações mensais vinculadas a ele.
- **Parcela**: transação mensal individual do grupo; estado pago/pendente derivado de data ≤ hoje (fuso Brasil); herda a origem (conta ou cartão) do grupo.
- **Compromisso futuro**: agregado mensal de parcelas pendentes + assinaturas com cobrança no mês.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: O usuário consegue criar uma compra parcelada no cartão em menos de 1 minuto pelo webapp, sem criar transações manualmente.
- **SC-002**: 100% dos parcelamentos existentes aparecem na seção com progresso e drill-down corretos (conferível contra o banco).
- **SC-003**: O comprometimento mensal exibido no cartão bate com a soma das parcelas pendentes daquele cartão no mês (zero divergência).
- **SC-004**: Todas as rotas de parcelamento do backend passam a ter consumidor na UI.

## Assumptions

- Depende da spec 040 entregue (estado pago/pendente usa a data local do Brasil).
- O motor de geração de datas mensais consecutivas existente é mantido — a spec não muda a regra de datas, só adiciona a origem cartão.
- Parcelamentos no cartão participam da dívida do cartão pelo mesmo mecanismo das transações de cartão comuns (fonte única da verdade: transações).
- Edição de um grupo de parcelamento (nome/notas) é secundária e pode ser incluída se trivial; renegociação de parcelas está fora do escopo.
