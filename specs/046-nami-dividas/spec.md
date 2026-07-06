# Feature Specification: Unificação de dívidas — financiamentos, empréstimos e simuladores

**Feature Branch**: `046-nami-dividas`

**Created**: 2026-07-06

**Status**: Draft

**Input**: User description: "Unificar os dois sistemas de dívidas paralelos: a tabela loans do agente (PRICE/SAC + 6 simuladores, só Telegram) e as tabelas personal_loans/financings criadas só para o webapp (o Telegram não as enxerga). Decisão aprovada: migrar financings → loans (loans é estritamente mais capaz); personal_loans (pessoa-a-pessoa) permanece separada mas ganha tools na Nami. Tela Financiamentos passa a usar loans com simuladores; registrar parcela paga pela UI."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Um único lugar para financiamentos, nos dois canais (Priority: P1)

Meus financiamentos aparecem iguais no webapp e no Telegram. O que cadastro num canal
existe no outro — os financiamentos antigos do webapp são migrados para o sistema completo
(com taxa numérica e sistema de amortização) sem perda de dados.

**Why this priority**: Hoje são dois mundos: o agente não vê os financiamentos do webapp e
o webapp não vê os empréstimos do agente — dados financeiros divididos são dados errados.

**Independent Test**: Após a migração, cada financiamento antigo do webapp aparece no
Telegram ("meus empréstimos") com os mesmos números; um cadastro novo pelo Telegram aparece
no webapp.

**Acceptance Scenarios**:

1. **Given** financiamentos cadastrados no webapp antigo, **When** a migração roda, **Then** todos aparecem no sistema unificado com valor, parcelas pagas/totais e taxa preservados (taxa em texto convertida para número quando interpretável).
2. **Given** uma taxa em texto não interpretável, **When** a migração roda, **Then** o financiamento migra com taxa zerada e uma nota pedindo revisão — nada é descartado.
3. **Given** a migração executada duas vezes, **When** a segunda execução roda, **Then** nada duplica (idempotente).
4. **Given** um financiamento cadastrado pelo Telegram, **When** o usuário abre a tela Financiamentos, **Then** ele aparece com saldo devedor calculado.

---

### User Story 2 - Simular quitação e amortização pelo webapp (Priority: P2)

Na tela de Financiamentos, uso os simuladores que hoje só existem no Telegram: quanto tempo
para quitar pagando R$ X/mês, quanto economizo amortizando R$ Y, o que muda pagando parcela
maior, e qual dívida atacar primeiro (método avalanche, incluindo cartões).

**Why this priority**: Os 6 simuladores são a parte mais valiosa do domínio de dívidas e
estão invisíveis para quem usa o webapp.

**Independent Test**: Rodar a mesma simulação no webapp e no Telegram — resultados
idênticos (mesmo motor de cálculo).

**Acceptance Scenarios**:

1. **Given** um financiamento ativo, **When** o usuário simula quitação antecipada em N meses, **Then** vê o custo e a economia calculados — idênticos ao resultado do Telegram.
2. **Given** um financiamento ativo, **When** o usuário simula amortização extra de R$ Y, **Then** vê quantas parcelas são eliminadas.
3. **Given** cartões com dívida e financiamentos ativos, **When** o usuário abre "prioridade de quitação", **Then** vê as dívidas ordenadas da maior para a menor taxa (avalanche).

---

### User Story 3 - Registrar parcela paga e acompanhar saldo devedor (Priority: P2)

Todo mês registro a parcela paga do financiamento pela própria tela: o contador avança, o
saldo devedor recalcula e a despesa é lançada.

**Why this priority**: Fecha o ciclo de acompanhamento no webapp; a operação já existe no
agente.

**Independent Test**: Registrar uma parcela e conferir contador +1, saldo menor e despesa
criada.

**Acceptance Scenarios**:

1. **Given** um financiamento com 10/48 parcelas pagas, **When** o usuário registra a parcela do mês, **Then** passa a 11/48, o saldo devedor recalcula e uma despesa é lançada na categoria correspondente.
2. **Given** o registro concluído, **When** o usuário desfaz? — não há desfazer; a correção é editar/excluir a despesa e ajustar o contador (edição já coberta pelo sistema).

---

### User Story 4 - Empréstimos pessoa-a-pessoa também no Telegram (Priority: P3)

Os empréstimos que fiz/peguei com pessoas (hoje só no webapp) passam a ser gerenciáveis
pelo Telegram: "quanto o Fulano ainda me deve?", "registra que ele pagou uma parcela".

**Why this priority**: Completa a unificação de canais; menos crítico porque o webapp já
cobre o fluxo.

**Independent Test**: Perguntar ao agente pelos empréstimos p2p e registrar um pagamento;
o webapp reflete.

**Acceptance Scenarios**:

1. **Given** empréstimos p2p cadastrados no webapp, **When** o usuário pergunta ao agente "quem me deve?", **Then** vê a lista com direção (emprestei/peguei) e saldo restante.
2. **Given** um empréstimo p2p, **When** o usuário registra pelo Telegram que uma parcela foi paga, **Then** o progresso atualiza no webapp.

### Edge Cases

- Financiamento antigo sem lender/descrição completa: migra com os campos disponíveis; nome composto do que houver.
- Após a migração validada: o sistema antigo fica somente leitura e as rotas antigas são desativadas — qualquer consumidor remanescente é atualizado antes.
- Simulação com taxa zero (migrada com nota "revisar"): simuladores exibem aviso de taxa não confirmada em vez de resultados enganosos.
- Empréstimo p2p sem parcelas definidas (pagamento livre): parcelas = 1 e quitação única, comportamento atual preservado.
- Registro de parcela além do total (ex.: 49/48): bloqueado com mensagem clara.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Todos os financiamentos do sistema antigo do webapp MUST ser migrados para o sistema unificado de empréstimos/financiamentos por processo idempotente e sem perda de dados (taxa textual interpretada quando possível; caso contrário, marcada para revisão).
- **FR-002**: Financiamentos e empréstimos bancários MUST ser visíveis e gerenciáveis nos dois canais (webapp e Telegram) a partir da mesma fonte de dados.
- **FR-003**: A tela de Financiamentos MUST exibir saldo devedor calculado, progresso de parcelas e oferecer os simuladores existentes (quitação antecipada, amortização extra, parcela acelerada, prioridade de quitação incluindo cartões) com os mesmos resultados do agente.
- **FR-004**: O usuário MUST poder registrar parcela paga pela tela, avançando o contador e lançando a despesa correspondente numa única operação.
- **FR-005**: Empréstimos pessoa-a-pessoa MUST permanecer como domínio próprio (direção, pessoa, sem juros) e ganhar operações completas no Telegram (listar, cadastrar, registrar pagamento, atualizar, remover) sobre a mesma fonte do webapp.
- **FR-006**: As operações do webapp para empréstimos p2p MUST passar pela mesma camada de lógica usada pelo Telegram (fim do acesso direto a dados no canal web).
- **FR-007**: Após validação da migração, as rotas do sistema antigo de financiamentos MUST ser desativadas e a documentação da API atualizada.

### Key Entities

- **Empréstimo/Financiamento (unificado)**: dívida bancária com sistema de amortização (PRICE/SAC), taxa numérica mensal, parcelas totais/pagas, valor de parcela e saldo devedor calculado.
- **Empréstimo pessoa-a-pessoa**: acordo informal com direção (emprestei/peguei), pessoa, valor total, parcelas e progresso — sem juros.
- **Simulação**: cálculo derivado sob demanda (não persistido) sobre uma dívida: quitação, amortização, aceleração, priorização.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% dos financiamentos antigos migrados (contagem origem = destino) com zero perda de dados.
- **SC-002**: Simulações no webapp idênticas às do Telegram para os mesmos parâmetros (zero divergência).
- **SC-003**: Cadastro em um canal visível no outro em 100% dos casos após a entrega.
- **SC-004**: Zero acesso direto a dados de dívidas fora da camada de lógica compartilhada (verificável por revisão de código).

## Assumptions

- A decisão migrar-financings-para-loans foi aprovada pelo usuário em 2026-07-06 (alternativas descartadas: manter duplicação; espremer p2p em loans).
- A migração roda no ambiente de produção dentro do container da aplicação (restrição de rede do banco), após ensaio em dump local.
- `financings` permanece intacta como backup até a validação; a remoção física da tabela é decisão posterior (fora do escopo).
- Spec mais arriscada do lote — planejada por último entre as grandes (após 040–043 em uso).
