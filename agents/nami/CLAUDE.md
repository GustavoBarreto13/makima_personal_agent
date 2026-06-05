# CLAUDE.md — agents/nami

## O que é este agente

**Nami** é o agente especialista em finanças pessoais. Inspirada na Nami de One Piece — navegadora e tesoureira obcecada por dinheiro. 🍊💰

Responsabilidades:
- Registrar e consultar transações (gastos e receitas) no BigQuery
- Gerenciar assinaturas recorrentes, compras parceladas e cartões de crédito
- Controlar empréstimos e financiamentos (PRICE e SAC)
- Monitorar orçamento por categoria e calcular score de saúde financeira
- Gerenciar contas financeiras (corrente, poupança, cartão, dinheiro, investimento)

---

## Arquitetura

```
Telegram (usuário)
    ↓
Makima (coordinator)
    ↓
nami_agent (Agent ADK — singleton)
    ├── tools.py              → transações, assinaturas, helpers BigQuery
    ├── tools_accounts.py     → contas financeiras
    ├── tools_installments.py → compras parceladas
    ├── tools_credit_cards.py → cartões de crédito
    ├── tools_loans.py        → empréstimos e financiamentos
    ├── tools_budgets.py      → orçamento por categoria
    └── tools_health.py       → score de saúde financeira
        ↓ (todos)
    BigQuery (dataset nami_finance_agent)
```

**Nami é singleton** — não usa `McpToolset`, não precisa de factory function.
Instância global `nami_agent` em `agent.py`, importada diretamente pelo coordinator.

```python
from agents.nami.agent import nami_agent
```

---

## Banco de dados BigQuery

Dataset: `nami_finance_agent` (schema completo em `agents/nami/schema.sql`)

**Tabelas:**

| Tabela | Propósito |
|---|---|
| `transactions` | Todos os gastos e receitas |
| `subscriptions` | Assinaturas recorrentes |
| `installment_groups` | Grupo de compra parcelada |
| `credit_cards` | Cartões de crédito cadastrados |
| `loans` | Empréstimos e financiamentos |
| `budgets` | Orçamento mensal por categoria |
| `accounts` | Contas financeiras (fonte canônica) |

### Autenticação

Segue o padrão do repositório — ver `coordinator/CLAUDE.md` seção "Autenticação BigQuery".
Função canônica: `_client()` em `agents/nami/tools.py`.

### Resolução de contas (`_resolve_account`)

**Nunca hardcode nomes de conta.** A lista de contas é dinâmica — vive na tabela `accounts`.

```python
# tools.py
_accounts_cache: list[dict] | None = None

def _resolve_account(name: str) -> dict | None:
    """Retorna {"id": ..., "name": ...} ou None se não encontrar."""
```

- Aceita correspondência exata ou por prefixo (case-insensitive, sem acentos)
- Cache em memória — recarrega do BQ na primeira chamada ou após `_invalidate_accounts_cache()`
- Todo INSERT que referencia uma conta deve escrever AMBOS: `conta` (nome display) e `account_id` (FK)

---

## Tools públicas (32 total)

### Contas — `tools_accounts.py`

| Tool | Parâmetros obrigatórios |
|---|---|
| `create_account` | `name, type, data_inicio` — types: `corrente\|poupanca\|cartao_credito\|dinheiro\|investimento` |
| `list_accounts` | `status="ativo"` — ou `"encerrado"`, `"todos"` |
| `get_account_balance` | `account_id` — saldo = balance_inicial + receitas − despesas |

**Setup inicial obrigatório:** contas devem ser criadas antes de qualquer transação, cartão ou empréstimo.

### Transações — `tools.py`

| Tool | Descrição |
|---|---|
| `create_transaction` | Registra gasto ou receita — chama `_resolve_account` internamente |
| `query_expenses` | Consulta lista detalhada com filtros de período/categoria/conta |
| `update_transaction` | Corrige campo(s) de uma transação existente pelo `id` |
| `delete_transaction` | Soft delete — marca `deleted=TRUE` |
| `get_spending_summary` | Agrupa gastos por `categoria`, `conta` ou `tipo` |
| `get_spending_trend` | Evolução mensal + projeção do mês atual |
| `create_subscription` | Cadastra assinatura recorrente (mensal ou anual) |
| `list_subscriptions` | Lista assinaturas ativas com próxima cobrança |
| `update_subscription` | Pausa, cancela ou atualiza valor de assinatura |

### Parcelas — `tools_installments.py`

| Tool | Descrição |
|---|---|
| `create_installment` | Cria grupo + N transações com datas mensais consecutivas |
| `list_installments` | Lista grupos com contagem de parcelas pagas/pendentes |
| `get_future_commitments` | Soma parcelas + assinaturas de um mês futuro (formato `"YYYY-MM"`) |
| `cancel_installment_group` | Soft delete nas parcelas futuras do grupo |

### Cartões de crédito — `tools_credit_cards.py`

| Tool | Descrição |
|---|---|
| `register_credit_card` | Cadastra cartão vinculado a uma conta (`account_name`) |
| `get_card_debt_summary` | Dívida atual de todos os cartões ativos |
| `register_card_payment` | Registra pagamento da fatura (Receita na conta do cartão) |
| `simulate_debt_payoff` | Simula meses para quitar dado um pagamento mensal |
| `get_minimum_payment_cost` | Custo total de pagar apenas o mínimo até quitar |

### Empréstimos — `tools_loans.py`

| Tool | Descrição |
|---|---|
| `register_loan` | Cadastra empréstimo PRICE ou SAC com parcelas_pagas já contadas |
| `list_loans` | Lista empréstimos ativos |
| `get_loan_balance` | Saldo devedor atual pelo sistema de amortização |
| `simulate_early_payoff` | Custo de quitar antecipadamente em N meses |
| `simulate_amortization` | Parcelas eliminadas por amortização extra |
| `simulate_accelerated_payment` | Redução de prazo com parcela maior |
| `compare_payoff_priority` | Ordena dívidas (cartões + empréstimos) por taxa DESC — avalanche |
| `register_loan_payment` | Incrementa `parcelas_pagas` e cria transação Despesa |

### Orçamento — `tools_budgets.py`

| Tool | Descrição |
|---|---|
| `set_budget` | Define limite mensal para uma categoria |
| `get_budget_status` | Resumo de todas as categorias com orçamento no mês |
| `check_category_budget` | Verifica se uma categoria está dentro do limite (retorna % usado) |

### Score de saúde — `tools_health.py`

| Tool | Descrição |
|---|---|
| `get_financial_health_score` | Score 0-100 em 4 dimensões: poupança, dívidas, orçamento, tendência |

---

## Categorias válidas

```
Alimentacao, Comer Fora, Saude, Lazer, Transporte, Moradia, Roupas,
Educacao, Assinaturas, Viagem, Presente, Beleza, Academia, Farmacia,
Supermercado, Eletronicos, Pet, Investimento, Receita, Inbox
```

Default quando não especificada: `Inbox`.
Mapeamento de tipo de empréstimo → categoria em `register_loan_payment`: `veiculo` → `Transporte`, `pessoal` → `Saude`, `imovel` → `Moradia`.

---

## Comportamento da Nami

- Chamar `create_transaction` **imediatamente** ao receber nome, valor e tipo — sem pedir confirmação antes
- Confirmar na resposta: valor, categoria e conta usados
- Guardar o `id` retornado para correções na mesma sessão (`update_transaction`)
- Se for cobrança de assinatura conhecida, perguntar se quer linkar ao `subscription_id`
- Se a conta não existir no sistema, orientar o usuário a cadastrá-la com `create_account` antes

### Análises comuns

| Pedido do usuário | Tool |
|---|---|
| "onde vai mais meu dinheiro?" | `get_spending_summary(group_by="categoria")` |
| "gastos por conta?" | `get_spending_summary(group_by="conta")` |
| "to gastando mais que o mês passado?" | `get_spending_trend(months=2)` |
| "projeção do mês?" | `get_spending_trend(months=1)` |
| "quanto vou gastar em agosto?" | `get_future_commitments("2026-08")` |
| "qual minha dívida no cartão?" | `get_card_debt_summary()` |
| "como estão minhas finanças?" | `get_financial_health_score()` |
| "to dentro do orçamento de lazer?" | `check_category_budget("Lazer")` |

---

## O que NÃO fazer

- **Não hardcode nomes de conta** — a lista é dinâmica. Sempre `_resolve_account(name)` para resolver. Nunca recriar uma lista `ACCOUNTS`.
- **Não usar `conta_key`** — foi removido. Cartões agora usam `account_id` (FK para `accounts.id`).
- **Não criar `card_debt_entries`** — decisão arquitetural (commit `995ab53`): dívida inicial de cartão é uma transação Despesa normal; pagamento de fatura é uma transação Receita. A tabela `transactions` é a única fonte da verdade para saldos de cartão.
- **Não pedir confirmação** antes de `create_transaction` — chamar imediatamente com os dados disponíveis.
- **Não usar markdown** (`*`, `_`, `~`) nas respostas — o Telegram renderiza HTML. Usar apenas tags HTML e emojis.
- **Não criar nova tabela** para um novo tipo de dado sem verificar se cabe em `transactions` com uma categoria específica.

---

## Personalidade e formatação

Sempre começa com `Nami:`. Tom ganancioso e dramático.

- **Despesa**: fique furiosa e reclame ("OUTRO gasto?! Você vai me arruinar!")
- **Receita**: comemore com ganância ("DINHEIRO ENTRANDO! Isso sim eu gosto!")
- Nunca quebra o personagem

### Templates HTML

**Registro de despesa** (`create_transaction` tipo Despesa):
```
💸 <b>Nome da transação</b> — R$XX,XX
   📂 Categoria · 💳 Conta · 📅 DD/MM/AAAA
```

**Registro de receita** (`create_transaction` tipo Receita):
```
💰 <b>Nome da receita</b> — R$XX,XX
   📂 Categoria · 💳 Conta · 📅 DD/MM/AAAA
```

**Lista de transações** (`query_expenses`):
```
📋 <b>Extrato — DD/MM a DD/MM</b>

💸 <b>Nome despesa</b> — R$XX,XX · 📂 Categoria · 📅 DD/MM
💰 <b>Nome receita</b> — R$XX,XX · 📂 Categoria · 📅 DD/MM

<b>Total: R$XX,XX</b> (N transações)
```

**Resumo de gastos** (`get_spending_summary`):
```
📊 <b>Gastos por [Categoria/Conta/Tipo]</b>

🔝 <b>Categoria1</b> · · · R$XXX,XX
   Categoria2 · · · R$XXX,XX

<b>Total: R$X.XXX,XX</b>
```

**Tendência de gastos** (`get_spending_trend`):
```
📈 <b>Tendência de Gastos</b>

2025-03 · · R$XXX,XX
2025-04 · · R$XXX,XX
2025-05 · · R$XXX,XX (em curso)
📌 <b>Projeção do mês: R$X.XXX,XX</b>
```

**Assinaturas** (`list_subscriptions`):
```
🔄 <b>Assinaturas Ativas</b>

🔁 <b>Nome</b> — R$XX,XX/mês · 💳 Conta · 📅 próx. DD/MM
🔁 <b>Nome anual</b> — R$XX,XX/ano · 💳 Conta · 📅 próx. DD/MM

<b>Total mensal: R$XXX,XX</b>
```

**Cadastro de assinatura** (`create_subscription`):
```
✅ <b>Nome</b> cadastrada — R$XX,XX/ciclo · 💳 Conta
```

**Compra parcelada** (`create_installment`):
```
💳 <b>Nome</b> — R$XXX,XX em Nx de R$XX,XX
   📂 Categoria · 💳 Conta · 📅 1ª parcela DD/MM/AAAA
```

**Dívida de cartões** (`get_card_debt_summary`):
```
💳 <b>Resumo de Cartões</b>

🔴 <b>Nubank</b> — R$XXX,XX (limite R$X.XXX,XX · XX% usado)
🟡 <b>Itaú</b> — R$XX,XX (limite R$X.XXX,XX · XX% usado)

<b>Total em cartões: R$X.XXX,XX</b>
```

**Score de saúde** (`get_financial_health_score`):
```
💊 <b>Score de Saúde Financeira: XX/100</b>

💰 Poupança · · · XX pts
💳 Dívidas · · · XX pts
📊 Orçamento · · XX pts
📈 Tendência · · XX pts
```

**Erros**:
```
❌ Houve um problema: descrição do erro
```

---

## Glossário

| Termo | Significado |
|---|---|
| `account_id` | FK UUID para `accounts.id` — identifica a conta de forma estável mesmo que o nome mude |
| `conta` | Campo display denormalizado (nome da conta como string) — mantido para evitar JOINs em queries de leitura |
| `installment_group` | Grupo que agrupa N transações de uma compra parcelada |
| `parcelas_pagas` | Campo em `loans` que rastreia quantas parcelas já foram quitadas |
| PRICE | Sistema de amortização com parcela fixa — amortização cresce ao longo do tempo |
| SAC | Sistema de Amortização Constante — amortização fixa, juros decrescem |
| `deleted` | Campo booleano em `transactions`, `installment_groups` — soft delete, nunca apaga dados |
| `balance_inicial` | Saldo da conta na data de início do rastreamento — base do cálculo de saldo atual |
| `_norm` | Normalização: minúsculas + strip de acentos — usada para comparar strings de conta/categoria |
