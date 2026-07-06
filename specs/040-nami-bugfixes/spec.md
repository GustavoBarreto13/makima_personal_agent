# Feature Specification: Correções de bugs da Nami (timezone, assinaturas, feedback de erro)

**Feature Branch**: `040-nami-reforma`

**Created**: 2026-07-06

**Status**: Código implementado na branch `040-nami-reforma` (commit `fix(nami): timezone SP...`) — pendente: rodar a migração no VPS e validar em produção

**Input**: User description: "Correções de bugs do backend e frontend da Nami (finanças): timezone America/Sao_Paulo em todas as queries e helpers, GROUP BY seguro em get_spending_summary, create_subscription com validação de next_billing e gravação de account_id/card_id, dateUtils.ts da Nami no frontend, saudação do Dashboard sem hardcode, toasts de erro nos catches silenciosos."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Contagem de parcelas correta em qualquer horário (Priority: P1)

Como usuário em UTC-3, quando consulto meus parcelamentos à noite (após as 21h), a contagem
de parcelas pagas vs. pendentes reflete a data do Brasil — não a data UTC do servidor, que
já virou o dia seguinte.

**Why this priority**: Números financeiros errados destroem a confiança em todo o sistema —
uma parcela pendente contada como paga pode fazer o usuário deixar de pagar uma conta.

**Independent Test**: Criar um parcelamento com uma parcela vencendo hoje e consultar a
lista entre 21h e 00h (horário local); a parcela de amanhã deve continuar "pendente".

**Acceptance Scenarios**:

1. **Given** um parcelamento com parcela datada de amanhã (horário do Brasil), **When** o usuário lista os parcelamentos às 22h locais (01h UTC do dia seguinte), **Then** a parcela aparece como pendente, não como paga.
2. **Given** um parcelamento ativo, **When** o usuário cancela as parcelas futuras às 22h locais, **Then** a parcela de hoje (Brasil) não é cancelada junto — apenas as com data posterior a hoje local.
3. **Given** o mês virando (dia 1 às 22h local do dia 30), **When** o usuário consulta resumo de gastos ou tendência, **Then** os totais são atribuídos ao mês local correto.

---

### User Story 2 - Assinatura registrada com pagador real e data válida (Priority: P2)

Ao cadastrar uma assinatura, o sistema aceita qualquer conta ou cartão que eu já tenha
cadastrado (resolvido dinamicamente), rejeita datas de cobrança em formato inválido com
mensagem amigável, e grava a referência real do pagador para que relatórios e automações
futuras saibam de onde sai o dinheiro.

**Why this priority**: Sem o vínculo real com conta/cartão, a automação de cobrança
(spec 048) e o detalhamento por pagador ficam impossíveis; a mensagem de erro atual cita
uma lista fixa de contas que não existe mais.

**Independent Test**: Cadastrar assinatura com conta existente, com cartão existente e com
data inválida — os dois primeiros gravam o vínculo correto; o terceiro retorna erro claro.

**Acceptance Scenarios**:

1. **Given** uma conta "NuConta" cadastrada, **When** o usuário cria uma assinatura pagando com "nu", **Then** a assinatura grava o vínculo com a conta NuConta (e nenhum vínculo de cartão).
2. **Given** um cartão "Cartão Itaú" cadastrado, **When** o usuário cria uma assinatura pagando com "itau" que só resolve como cartão, **Then** a assinatura grava o vínculo com o cartão (e nenhum vínculo de conta).
3. **Given** data de cobrança "2026-13-45", **When** o usuário tenta criar a assinatura, **Then** recebe erro claro pedindo o formato AAAA-MM-DD, sem exceção técnica do banco.
4. **Given** um nome que não resolve para conta nem cartão, **When** o usuário tenta criar a assinatura, **Then** recebe orientação para cadastrar a conta/cartão antes.

---

### User Story 3 - Erros visíveis e saudação personalizada no webapp (Priority: P3)

No webapp, se o carregamento de categorias falhar, vejo um aviso (toast) em vez de telas
silenciosamente vazias; a saudação do dashboard usa o meu nome real da sessão autenticada,
e datas relativas ("hoje", "ontem", "amanhã") são calculadas corretamente perto da
meia-noite.

**Why this priority**: Qualidade de vida e confiança — falhas silenciosas fazem o usuário
achar que não tem dados; o nome fixo no código quebraria para qualquer outro usuário.

**Independent Test**: Derrubar o backend e abrir Dashboard/Transações/Orçamentos — toasts
de erro aparecem; com backend ativo, a saudação mostra o primeiro nome do usuário logado.

**Acceptance Scenarios**:

1. **Given** o endpoint de categorias fora do ar, **When** o usuário abre o Dashboard, Transações, Orçamentos ou o modal de novo lançamento, **Then** um aviso de erro visível aparece (toast ou mensagem no modal).
2. **Given** usuário autenticado com nome "Gustavo Barreto", **When** abre o Dashboard, **Then** vê "bom dia, Gustavo!" (primeiro nome vindo da sessão, não fixo no código).
3. **Given** uma transação datada de ontem, **When** o usuário visualiza a lista às 23h30 locais, **Then** a data relativa exibida é "ontem" (sem off-by-one).

### Edge Cases

- Transação/consulta exatamente à meia-noite local: a data usada é a local (UTC-3), nunca a UTC.
- Assinatura cujo nome de pagador resolve tanto para conta quanto para cartão: a conta tem precedência (regra determinística).
- Usuário sem nome na sessão (`name` vazio): saudação aparece sem nome ("bom dia!"), sem quebrar.
- Bancos já existentes: as colunas novas de assinatura são adicionadas por migração idempotente — re-executar não causa erro nem duplica.
- Assinaturas antigas (criadas antes desta spec) ficam com vínculo de pagador nulo — telas e relatórios devem tolerar nulo.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Toda derivação de "hoje"/"data atual" no domínio financeiro (contagens de parcelas, cancelamento de parcelas futuras, resumos, tendência, ciclo de fatura, orçamento do mês, timestamps de criação) MUST usar o fuso America/Sao_Paulo, nunca a data/hora UTC do servidor.
- **FR-002**: O agrupamento do resumo de gastos MUST aceitar somente os agrupadores válidos (categoria, conta, tipo) resolvidos por um mapa fechado — nunca interpolando texto vindo do usuário na consulta.
- **FR-003**: O cadastro de assinatura MUST validar o formato da data de próxima cobrança (AAAA-MM-DD) antes de gravar, retornando mensagem de erro amigável em caso inválido.
- **FR-004**: O cadastro de assinatura MUST resolver o pagador dinamicamente contra as contas e cartões cadastrados (correspondência exata ou por prefixo, sem acentos), com precedência para contas, e gravar o vínculo real (referência de conta OU de cartão, mutuamente exclusivos — nunca ambos).
- **FR-005**: A estrutura de dados de assinaturas MUST ganhar os campos de vínculo de pagador via migração idempotente, segura para bancos já existentes e para re-execução.
- **FR-006**: O frontend da Nami MUST centralizar os cálculos de data em um utilitário próprio que usa as partes locais do navegador (nunca conversão UTC), incluindo "hoje", mês corrente, parse de datas ISO e diferença em dias.
- **FR-007**: As datas relativas exibidas ("hoje", "ontem", "amanhã") MUST ser corretas em qualquer horário do dia, inclusive próximo à meia-noite local.
- **FR-008**: A saudação do Dashboard MUST exibir o primeiro nome do usuário autenticado obtido da sessão, com fallback silencioso para saudação sem nome.
- **FR-009**: Falhas ao carregar categorias em qualquer tela ou modal da Nami MUST gerar feedback visível ao usuário (toast ou mensagem inline), nunca falha silenciosa.

### Key Entities

- **Assinatura**: serviço recorrente com valor, ciclo (mensal/anual), próxima cobrança e agora um **pagador vinculado** — referência real a uma conta bancária OU a um cartão de crédito (mutuamente exclusivos), além do nome de exibição legado.
- **Parcelamento**: compra dividida em N transações mensais; o estado pago/pendente de cada parcela é derivado da comparação da data da parcela com "hoje" no fuso do Brasil.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Consultas de parcelamentos entre 21h e 00h (horário local) apresentam contagens idênticas às consultas diurnas para os mesmos dados — zero divergência por fuso.
- **SC-002**: 100% das assinaturas criadas após a entrega têm vínculo de pagador (conta ou cartão) gravado.
- **SC-003**: Cadastro de assinatura com data malformada retorna orientação clara em 100% dos casos, sem erro técnico exposto.
- **SC-004**: Nenhuma tela da Nami exibe estado vazio silencioso quando o carregamento de categorias falha — aviso visível em 100% dos casos.
- **SC-005**: A varredura do código do domínio financeiro não encontra nenhum uso remanescente de data UTC do servidor para derivar "hoje" (verificável por busca automatizada).

## Assumptions

- O usuário está sempre em UTC-3 (America/Sao_Paulo) — convenção global do projeto documentada no CLAUDE.md raiz.
- Assinaturas antigas sem vínculo de pagador são aceitáveis (backfill manual opcional, fora do escopo).
- A precedência conta > cartão na resolução do pagador é aceitável porque os nomes reais do usuário não colidem entre contas e cartões na prática.
- Ocorrências do mesmo bug de timezone fora do domínio da Nami (hub, journal, kaguya, mai) são conhecidas e ficam explicitamente fora do escopo desta spec (listadas no plano `docs/planos/PLANO_NAMI_REFORMA_2026H2.md`).
- A migração será executada dentro do container `makima-web` no VPS (hostname do PostgreSQL não resolve fora dele).
