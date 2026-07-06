# Feature Specification: Contas Fixas — separadas de Assinaturas, com confirmação de valor

**Feature Branch**: `044-nami-contas-fixas`

**Created**: 2026-07-06

**Status**: Draft

**Input**: User description: "Seção de Contas Fixas a pagar (luz, água, aluguel, internet, escola) separada de Assinaturas na UI e no Telegram. Decisão de design: mesma tabela subscriptions com campo kind (assinatura|conta_fixa) e auto_lancar — a mecânica de recorrência é idêntica; o que muda é o comportamento: conta fixa tem valor geralmente variável e exige confirmação do valor real ao pagar. Ação 'Marcar como paga' cria a transação vinculada e rola a próxima cobrança."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Cadastrar e acompanhar contas fixas do mês (Priority: P1)

Cadastro minhas contas fixas (luz, água, aluguel, internet, escola) com valor esperado e
dia de vencimento. Numa seção própria — separada de Assinaturas — vejo o status de cada uma
no mês: **paga**, **pendente** ou **atrasada**.

**Why this priority**: É a espinha do controle mensal doméstico; hoje contas fixas se
misturam com assinaturas ou ficam de fora do sistema.

**Independent Test**: Cadastrar "Luz — R$ 250 — vence dia 10" e verificar a linha na seção
com status pendente antes do dia 10 e atrasada depois (sem pagamento).

**Acceptance Scenarios**:

1. **Given** a seção Contas Fixas, **When** o usuário cadastra "Luz, ~R$ 250, vence dia 10", **Then** a conta aparece com valor esperado, dia de vencimento e status do mês.
2. **Given** uma conta com vencimento dia 10 ainda não paga, **When** hoje é dia 5, **Then** o status é "pendente"; **When** hoje é dia 15, **Then** o status é "atrasada".
3. **Given** contas fixas e assinaturas cadastradas, **When** o usuário abre Assinaturas, **Then** vê apenas assinaturas; **When** abre Contas Fixas, **Then** vê apenas contas fixas.
4. **Given** o Telegram, **When** o usuário diz "cadastra a conta de luz, uns 250, vence dia 10", **Then** o agente cadastra como conta fixa (não como assinatura).

---

### User Story 2 - Marcar como paga confirmando o valor real (Priority: P1)

No mês, a conta de luz veio R$ 287,45 (não os R$ 250 esperados). Clico em "Marcar como
paga", o valor esperado vem pré-preenchido, corrijo para o valor real, escolho a data se
necessário e confirmo — a despesa é lançada vinculada à conta fixa e a próxima cobrança
rola para o mês seguinte.

**Why this priority**: É o diferencial de conta fixa vs. assinatura — o valor varia todo
mês e o registro precisa do valor real; sem isso a seção seria só uma lista estática.

**Independent Test**: Marcar uma conta como paga com valor editado; conferir a despesa
criada com o valor real, o vínculo com a conta fixa e o vencimento rolado.

**Acceptance Scenarios**:

1. **Given** uma conta fixa pendente de R$ 250 esperados, **When** o usuário marca como paga informando R$ 287,45, **Then** uma despesa de R$ 287,45 é criada vinculada à conta fixa, no pagador (conta/cartão) cadastrado.
2. **Given** a confirmação do pagamento, **When** concluída, **Then** a próxima cobrança rola para o ciclo seguinte e o status do mês vira "paga".
3. **Given** a confirmação, **When** o lançamento da despesa ou a rolagem falham, **Then** nada é persistido pela metade (operação tudo-ou-nada) e o usuário vê o erro.

---

### User Story 3 - Custo fixo de vida visível no Dashboard (Priority: P2)

No Dashboard vejo o meu "custo fixo mensal" (contas fixas + assinaturas somadas) e um aviso
de pendências ("2 contas a confirmar"), com atalho para a seção.

**Why this priority**: Responde "quanto custa minha vida por mês?" de relance e puxa o
usuário para confirmar pendências — mas depende da seção existir (stories 1 e 2).

**Independent Test**: Com 3 contas fixas e 2 assinaturas ativas, o card mostra a soma
correta e o contador de pendências do mês.

**Acceptance Scenarios**:

1. **Given** contas fixas e assinaturas ativas, **When** o usuário abre o Dashboard, **Then** vê o custo fixo mensal total (soma dos dois grupos, com anuais proporcionalizadas).
2. **Given** 2 contas não confirmadas no mês, **When** o Dashboard carrega, **Then** exibe "2 contas a confirmar" com link para a seção Contas Fixas.

### Edge Cases

- Conta fixa de valor realmente fixo (ex.: aluguel): o usuário pode marcar "lançar automaticamente" — o job agendado (spec 048) lança sem confirmação; o padrão de conta fixa é confirmação manual.
- Conta paga adiantada (antes do vencimento): permitido — status "paga" e rolagem normal.
- Conta pulada num mês (ex.: não houve fatura): permitir rolar sem lançar (ação secundária "pular este mês").
- Mudança de kind (assinatura ↔ conta fixa) após criada: permitido via edição; histórico de transações não muda.
- Assinaturas existentes continuam com comportamento atual (kind padrão "assinatura", lançamento automático quando o job da spec 048 existir).
- Mês com ciclo anual: conta fixa anual (ex.: IPTU à vista) aparece como pendente apenas no mês da cobrança.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST distinguir recorrências entre "assinatura" e "conta fixa" mantendo uma única estrutura de recorrência (mesmos dados: valor esperado, ciclo, próxima cobrança, pagador, categoria).
- **FR-002**: Cada recorrência MUST ter um indicador de lançamento automático (padrão: ligado para assinaturas, desligado para contas fixas).
- **FR-003**: O webapp MUST ter uma seção "Contas Fixas" separada de "Assinaturas", cada uma exibindo apenas o seu tipo.
- **FR-004**: A seção Contas Fixas MUST derivar e exibir o status do mês por conta: paga (transação vinculada no ciclo), pendente (sem pagamento, antes do vencimento) ou atrasada (sem pagamento, após o vencimento) — datas no fuso do Brasil.
- **FR-005**: A ação "Marcar como paga" MUST pré-preencher o valor esperado, aceitar valor e data editados, criar a despesa vinculada à recorrência no pagador cadastrado e rolar a próxima cobrança — tudo numa operação atômica.
- **FR-006**: O agente no Telegram MUST classificar corretamente pedidos de cadastro (contas domésticas → conta fixa; serviços digitais/recorrentes de valor fixo → assinatura) e oferecer as mesmas operações (cadastrar, listar, marcar como paga).
- **FR-007**: O Dashboard MUST exibir o custo fixo mensal total (contas fixas + assinaturas, anuais proporcionalizadas) e o número de contas a confirmar no mês, com navegação para a seção.
- **FR-008**: A evolução da estrutura de dados MUST ser feita por migração idempotente, preservando as assinaturas existentes com comportamento inalterado.

### Key Entities

- **Recorrência** (estrutura única): compromisso que se repete — com tipo (assinatura | conta fixa), valor esperado, ciclo, próxima cobrança, dia de vencimento, pagador vinculado, indicador de lançamento automático e status.
- **Pagamento de conta fixa**: despesa criada na confirmação, com o valor real informado, vinculada à recorrência (permite histórico "quanto veio a luz nos últimos meses").

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Marcar uma conta como paga (com correção de valor) leva menos de 15 segundos.
- **SC-002**: Zero contas fixas aparecendo na tela de Assinaturas e vice-versa.
- **SC-003**: 100% dos pagamentos confirmados geram exatamente uma despesa vinculada e uma rolagem de vencimento (nunca só um dos dois).
- **SC-004**: O custo fixo mensal exibido bate com a soma manual dos itens ativos (zero divergência).
- **SC-005**: Pelo Telegram, "cadastra conta de luz" resulta em conta fixa em 100% dos testes de roteamento.

## Assumptions

- Estender a estrutura de assinaturas (em vez de criar uma segunda estrutura de recorrência) é a decisão de design aprovada — evita duplicar tools, telas e o job agendado.
- O histórico de valores reais por conta fixa (ex.: gráfico da luz mês a mês) é consultável via transações vinculadas; visualização dedicada é desejável mas não obrigatória nesta entrega.
- O aviso/lançamento automático agendado é da spec 048 (que depende desta); aqui o fluxo é manual pela UI/Telegram.
- Depende da spec 040 (vínculo de pagador em recorrências e datas no fuso local).
