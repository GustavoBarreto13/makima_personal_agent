# Design: Expansão da Nami — Controle Financeiro Completo

**Data:** 2026-06-05
**Status:** Aprovado pelo usuário
**Agente:** Nami (`agents/nami/`)

---

## Contexto

A Nami hoje faz bem o básico: registra transações, resume gastos por categoria, projeta o mês e gerencia assinaturas. Porém, o usuário perdeu o controle de cartões de crédito, tem um carro financiado, compras parceladas não registradas e quer usar a Nami como ferramenta ativa de saída da dívida — não apenas como log de gastos.

O objetivo desta expansão é transformar a Nami em uma **consultora financeira pessoal** que:
1. Torna o custo invisível (juros, parcelas, dívida) **visível e concreto**
2. Oferece simulações baseadas em matemática financeira real
3. Conecta ao RAG (Kurisu) para respostas embasadas em material curado pelo usuário

---
B
## Features — Escopo e Ordem de Implementação

### Feature 1 — Controle de Parcelas

**Problema:** Compras parceladas no cartão não são registradas. O usuário não sabe o quanto já está comprometido nos meses futuros.

**Fluxo:**
- Usuário diz: *"comprei notebook R$3.600 em 12x no Cartao Nu"*
- Nami cria um grupo de parcelas: 12 transações com datas mensais futuras, vinculadas por um `installment_group_id`
- Cada parcela individual aparece no resumo do mês correspondente
- Usuário pode perguntar: *"quanto tenho comprometido em agosto?"* → Nami soma todas as parcelas com vencimento naquele mês

**Schema — nova tabela `installment_groups`:**
```sql
CREATE TABLE nami_finance_agent.installment_groups (
  id            STRING NOT NULL,   -- UUID
  name          STRING NOT NULL,   -- "Notebook Dell"
  total_valor   FLOAT64 NOT NULL,  -- 3600.00
  num_parcelas  INT64 NOT NULL,    -- 12
  valor_parcela FLOAT64 NOT NULL,  -- 300.00
  conta         STRING NOT NULL,   -- "Cartao Nu"
  categoria     STRING NOT NULL,
  first_due     DATE NOT NULL,     -- data da 1ª parcela
  notes         STRING,
  created_at    TIMESTAMP NOT NULL,
  deleted       BOOL DEFAULT FALSE
)
```

**Mudança na tabela `transactions`:** adicionar coluna `installment_group_id STRING` (nullable) para vincular parcelas ao grupo pai.

**Tools novas:**
- `create_installment(name, total_valor, num_parcelas, conta, categoria, first_due, notes)` — cria grupo e gera todas as parcelas
- `list_installments(status)` — lista grupos ativos com parcelas pagas/pendentes
- `get_future_commitments(month)` — soma todos os compromissos futuros de um mês (parcelas + assinaturas)
- `cancel_installment_group(id)` — cancela parcelas futuras de um grupo (soft delete)

---

### Feature 2 — Tracker de Cartões de Crédito

**Problema:** O usuário tem dívida em cartão(ões) de crédito, continua usando enquanto a dívida cresce, e não sabe o total exato que deve. Juros de cartão no Brasil chegam a 15-20% ao mês — a dívida dobra em menos de 6 meses se só pagar o mínimo.

**Fluxo de cadastro:**
- Usuário informa: nome, limite, dívida atual, taxa de juros mensal, dia do fechamento, dia do vencimento
- Nami vincula ao `conta` existente (ex: "Cartao Nu") — dívida inicial é lançada como transação **Despesa** na conta do cartão; despesas e receitas futuras nessa conta alimentam o saldo automaticamente

**Alertas comportamentais:**
- Ao registrar despesa em cartão com dívida: *"Você deve R$2.400 nesse cartão. Com essa compra vai pra R$2.550. Pagando só o mínimo de 15%, vai demorar 14 meses e custar R$1.890 em juros."*

**Simulações:**
- *"Qual minha dívida total?"* → soma consolidada de todos os cartões
- *"Como quito mais rápido?"* → Método Avalanche: ataca o cartão de maior juros primeiro
- *"Se separar R$500/mês pra dívida, quando quito?"* → projeção mês a mês com economia de juros

**Schema — nova tabela `credit_cards`:**
```sql
CREATE TABLE nami_finance_agent.credit_cards (
  id              STRING NOT NULL,   -- UUID
  name            STRING NOT NULL,   -- "Nubank"
  conta_key       STRING NOT NULL,   -- "Cartao Nu" (chave em transactions)
  limite          FLOAT64 NOT NULL,
  taxa_juros_mensal FLOAT64 NOT NULL, -- ex: 0.15 para 15%
  closing_day     INT64 NOT NULL,    -- dia do fechamento da fatura
  due_day         INT64 NOT NULL,    -- dia do vencimento
  status          STRING NOT NULL,   -- "ativo" / "cancelado"
  notes           STRING,
  created_at      TIMESTAMP NOT NULL,
  updated_at      TIMESTAMP
)
```

**Tools novas:**
- `register_credit_card(name, conta_key, limite, taxa_juros_mensal, closing_day, due_day, current_debt)` — cadastra cartão; dívida inicial vira transação Despesa na conta do cartão
- `get_card_debt_summary()` — dívida atual de cada cartão + total (calculada via `transactions`)
- `register_card_payment(card_id, valor, data)` — registra pagamento de fatura como transação **Receita** na conta do cartão, reduzindo o saldo calculado
- `simulate_debt_payoff(monthly_payment)` — projeção de quitação com Método Avalanche
- `get_minimum_payment_cost(card_id)` — custo total de pagar só o mínimo

---

### Feature 3 — Tracker de Empréstimos e Financiamentos

**Problema:** O usuário tem carro financiado e possivelmente outros empréstimos (consignado, pessoal, etc.) e quer simular amortizações, calcular custo de quitação antecipada e entender o impacto de pagamentos extras.

**Tipos suportados:** `veiculo`, `consignado`, `pessoal`, `imobiliario`, `outro`

**Sistemas de amortização suportados:**

*PRICE (parcela fixa — mais comum em veículos e crédito pessoal):*
- PMT = PV × [i(1+i)^n] / [(1+i)^n − 1]
- SD_k = PV×(1+i)^k − PMT×[(1+i)^k − 1]/i

*SAC (parcela decrescente — comum em imobiliário):*
- Amortização constante: A = PV / n
- SD_k = PV − k × A
- PMT_k = A + SD_(k−1) × i

*Quitação antecipada:* saldo devedor atual com desconto proporcional dos juros futuros (CDC — direito legal do consumidor).

**Simulações disponíveis:**
- *"Quanto custa quitar agora?"* → saldo devedor com desconto legal
- *"Se amortizar R$500, o que muda?"* → parcelas a menos + economia em juros
- *"Se pagar R$200 a mais por mês, quando termina?"* → nova data de quitação
- *"Vale mais amortizar o carro ou pagar o cartão?"* → `compare_payoff_priority` compara todos os empréstimos e cartões ativos por taxa de juros

**Consignado:** campo `desconto_folha = TRUE` indica que a parcela é debitada automaticamente em folha. A Nami não emite lembrete de pagamento para esses, mas ainda simula amortização e quitação.

**Schema — nova tabela `loans`:**
```sql
CREATE TABLE nami_finance_agent.loans (
  id                  STRING NOT NULL,
  name                STRING NOT NULL,             -- "Carro Onix", "Consignado Itaú"
  tipo                STRING NOT NULL,             -- "veiculo" | "consignado" | "pessoal" | "imobiliario" | "outro"
  sistema_amortizacao STRING NOT NULL,             -- "PRICE" | "SAC"
  valor_original      FLOAT64 NOT NULL,
  taxa_juros_mensal   FLOAT64 NOT NULL,
  num_parcelas_total  INT64 NOT NULL,
  parcelas_pagas      INT64 NOT NULL,
  valor_parcela       FLOAT64 NOT NULL,            -- parcela atual (SAC: valor do próximo mês)
  primeiro_vencimento DATE NOT NULL,
  conta               STRING NOT NULL,
  desconto_folha      BOOL DEFAULT FALSE,          -- TRUE = consignado / débito automático
  status              STRING NOT NULL,             -- "ativo" | "quitado"
  notes               STRING,
  created_at          TIMESTAMP NOT NULL,
  updated_at          TIMESTAMP
)
```

**Tools novas:**
- `register_loan(name, tipo, sistema_amortizacao, valor_original, taxa_juros_mensal, num_parcelas, parcelas_pagas, valor_parcela, primeiro_vencimento, conta, desconto_folha=False)` — cadastra qualquer tipo de empréstimo
- `list_loans(status="ativo")` — lista todos os empréstimos com saldo devedor atual e parcelas restantes
- `get_loan_balance(loan_id)` — saldo devedor atual (PRICE ou SAC), parcelas restantes, valor próxima parcela
- `simulate_early_payoff(loan_id)` — valor para quitar hoje com desconto CDC
- `simulate_amortization(loan_id, extra_value)` — impacto de pagar X a mais agora: parcelas eliminadas + economia em juros
- `simulate_accelerated_payment(loan_id, extra_monthly)` — nova data de quitação pagando X a mais por mês
- `compare_payoff_priority()` — lista cartões + todos os empréstimos ativos por taxa DESC com recomendação de ordem de ataque

---

### Feature 4 — Orçamento por Categoria (Método Envelope)

**Conceito:** Regra 50/30/20 — 50% necessidades, 30% desejos, 20% poupança/investimento. Define limites mensais por categoria antes de gastar.

**Fluxo:**
- Usuário define: *"quero gastar até R$600 em Alimentação e R$300 em Lazer este mês"*
- Ao registrar despesa, Nami mostra: *"Gastou R$420 de R$600 em Alimentação. 30% restante."*
- Ao ultrapassar: *"Você estourou Lazer em R$45. Quer ajustar o orçamento ou revisar os gastos?"*

**Schema — nova tabela `budgets`:**
```sql
CREATE TABLE nami_finance_agent.budgets (
  id          STRING NOT NULL,
  month       STRING NOT NULL,   -- "2026-06" (YYYY-MM)
  categoria   STRING NOT NULL,
  limite      FLOAT64 NOT NULL,
  created_at  TIMESTAMP NOT NULL,
  updated_at  TIMESTAMP,
  UNIQUE (month, categoria)      -- um limite por categoria por mês
)
```

**Tools novas:**
- `set_budget(month, categoria, limite)` — define ou atualiza envelope
- `get_budget_status(month)` — status de todos os envelopes do mês (gasto vs limite)
- `check_category_budget(categoria, valor)` — chamada interna ao registrar despesa (sem expor ao usuário diretamente)

---

### Feature 5 — Score de Saúde Financeira

**Conceito:** Um número de 0-100 que resume a situação financeira do mês. Recompensa progresso conforme a dívida diminui.

**4 dimensões (25 pontos cada):**
1. **Taxa de gasto** — % da receita do mês que virou despesa (< 80% = cheio)
2. **Taxa de poupança** — sobrou alguma coisa? (> 20% = cheio)
3. **Comprometimento futuro** — parcelas + financiamento como % da renda (< 25% = cheio)
4. **Dívida de cartão** — proporção da dívida em relação ao limite total (0% = cheio)

**Saída:** *"Saúde financeira em junho: 58/100. Ponto forte: taxa de gasto controlada (23/25). Ponto fraco: dívida de cartão alta (8/25). Prioridade: pagar cartão antes de novas parcelas."*

**Dependência:** Requer Features 1, 2 e 3 implementadas para cálculo completo.

**Tool nova:**
- `get_financial_health_score(month)` — calcula e retorna score com breakdown das 4 dimensões

---

### Feature 6 — Nami + RAG (Kurisu)

**Problema:** A Nami improvisa conselhos. Com RAG, ela consulta material curado pelo próprio usuário.

**Arquitetura:** Cross-agent — a Nami chama a Kurisu exatamente como a Kaguya chama a Nami hoje (`agents/kaguya/tools.py` → `agents/nami/tools.py`).

**Conteúdo do corpus (pasta `Finanças/` no Obsidian):**
- `minhas-regras.md` — regras e metas pessoais do usuário
- Artigos ingeridos via Obsidian Web Clipper
- Notas sobre estratégias financeiras

**Quando a Nami consulta:**
- Perguntas de "o que devo fazer" (estratégia, não dados)
- Ao dar recomendações, cita a fonte: *"Baseado no princípio X que você salvou..."*
- Quando o usuário menciona uma meta que pode estar documentada

**Dependência:** Fase 3 (setup Vertex AI corpus da Kurisu) deve estar concluída.

**Tool nova (em `agents/nami/tools.py`):**
- `consult_financial_knowledge(query)` — chama Kurisu com contexto financeiro, retorna trechos relevantes

---

### Features 7-9 — Reserva de Emergência, Metas, Relatórios

Escopo menor, implementadas após a dívida estar sob controle.

- **Reserva:** tabela `emergency_fund` + tool `get_emergency_fund_status()` (meses cobertos vs meta)
- **Metas:** tabela `financial_goals` + tools de criação, contribuição e projeção
- **Relatórios:** novas queries BigQuery sobre tabelas existentes (sem schema novo)

---

## Arquitetura — Mudanças no Schema BigQuery

### Tabelas novas

| Tabela | Feature |
|---|---|
| `installment_groups` | Parcelas |
| `credit_cards` | Tracker cartões |
| `loans` | Financiamento |
| `budgets` | Orçamento |
| `emergency_fund` | Reserva (futuro) |
| `financial_goals` | Metas (futuro) |

> **Decisão arquitetural (commit `995ab53`):** `card_debt_entries` foi removida. O saldo do cartão é calculado em tempo real como `SUM(Despesas) − SUM(Receitas)` filtradas pela `conta` do cartão no ciclo de faturamento vigente. Isso elimina duplicação de estado e mantém `transactions` como única fonte da verdade.

### Mudança em tabela existente

| Tabela | Coluna adicionada | Motivo |
|---|---|---|
| `transactions` | `installment_group_id STRING` | Vincular parcela ao grupo pai |

---

## Verificação — Como testar cada feature

| Feature | Como verificar |
|---|---|
| Parcelas | Criar grupo 12x, verificar 12 transações geradas; consultar `get_future_commitments("2026-08")` |
| Cartões | Cadastrar cartão com dívida; registrar despesa e confirmar alerta; simular payoff |
| Empréstimos | Cadastrar veículo (PRICE) e consignado (PRICE, desconto_folha=True); `get_loan_balance` bater com extrato; `simulate_amortization` mostrar economia; `compare_payoff_priority` listar todos por taxa |
| Orçamento | Definir limite, gastar até 90%, confirmar aviso; ultrapassar, confirmar alerta de estouro |
| Score | Score baixo com dívida alta; score sobe após registrar pagamento de cartão |
| RAG | Perguntar estratégia de dívida; confirmar que Nami cita material do corpus |
