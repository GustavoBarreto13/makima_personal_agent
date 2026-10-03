# Spec 071 — Nami simples

**Status:** código e testes entregues; falta aplicar a migração no VPS (ver "Rollout").
**Branch:** `feat/071-nami-simples` (a partir de `feat/design-system`, que ainda não está no master).

## Problema

O dono não conseguia usar a Nami: "não é intuitivo, não é fácil de usar". A análise do código mostrou duas causas.

**1. Complexidade.** 11 telas na sidebar, ~18 formulários/modais, ~10 mil linhas de front. Conceitos sobrepostos
(Contas × Contas Fixas; Assinaturas × Contas Fixas na mesma tabela; Parcelamentos em dois lugares), 5 botões de
"adicionar" com comportamentos diferentes, transferência só dentro de Contas, pagar fatura só dentro de Cartões,
Dashboard com 12 painéis (receita/despesa/saldo apareciam 3 vezes).

**2. Números que não batiam**, o que destrói a confiança:

| Sintoma | Causa |
|---|---|
| Transferir entre contas não mudava saldo | os dois lados eram gravados positivos, sem direção; o saldo ignorava `Transferencia` |
| "Entrou" inflado | pagar fatura era gravado como **Receita** no cartão; nada saía da conta bancária |
| Fatura fechada e não paga sumia | a dívida só olhava o ciclo corrente |
| "Gastei X" contava salário | `get_spending_summary`/`trend` somavam todos os tipos |
| "Patrimônio" não mexia | era a soma de `balance_inicial` |
| Conta fixa do dia 31 virava dia 28 para sempre | `min(dia, 28)` ao rolar o vencimento |
| Tela de Orçamentos sempre vazia | o front lia `budgets`; o backend devolve `envelopes` |

## Referências pesquisadas

Simplifi ("Spending Plan": renda − contas − metas = o que sobra), Copilot Money (uma tela limpa, categorização
automática), Monefy (lançar em dois toques), Organizze/Mobills (cartão com fatura por ciclo, parcelado distribuído
nas faturas). Síntese: **um número de topo, um jeito de lançar, cartão pensado como fatura.**

## Decisões (do dono, nesta ordem de conversa)

- Celular e desktop com o mesmo peso.
- A tela inicial responde "quanto ainda posso gastar?".
- Núcleo: Cartões/faturas/parcelas e Contas fixas/assinaturas. Empréstimos, orçamentos e lista de compras vão para "Mais".
- Reconstruir o shell (não só enxugar) e usar o **Design System Makima**, com direção de arte **"Carta náutica"**.

## O que muda

### Regras de negócio

- **Transferência tem sinal**: origem negativa, destino positivo (`tipo='Transferencia'`). Não é receita nem despesa,
  mas o saldo da conta e a dívida do cartão a consideram.
- **Pagar fatura é transferência conta → cartão** (debita a conta vinculada, ou a escolhida, e abate a dívida).
- **Dívida do cartão é acumulada** (despesas − estornos − pagamentos, até hoje). Compra com data futura (parcela) só pesa quando chega.
- **Faturas são derivadas** (sem tabela): a compra cai na fatura pelo dia de fechamento; o vencimento é no mesmo mês se
  `due_day > closing_day`, senão no seguinte; pagamentos abatem da fatura **mais antiga** primeiro.
- **Livre pra gastar** = renda (recebida + que ainda vai entrar) − gasto realizado − parcelas com data futura no mês −
  contas fixas/assinaturas ainda pendentes. Compra no cartão conta no dia da compra; pagar fatura não é gasto.
- **Recorrência `kind='renda'`** (salário): confirmar grava Receita; fora do custo fixo; `auto_lancar` desligado por padrão.
- **Renda** = Receita em conta. Receita em cartão é estorno e não entra como renda.

### Telas (`webapp/frontend/src/pages/nami/`)

Início · Lançamentos · Cartões · Recorrentes · Resumo · (Mais) Contas · Parcelamentos · Empréstimos · Orçamentos · Lista de compras.
Um lançador único: linha rápida (`45 ifood @nubank`, `1200 tv 10x @nubank`, `+3500 salário`, `ontem 30 uber`, `#lazer`)
que salva direto quando entende tudo e abre o formulário completo quando não (`@` ambíguo, `+pessoa`, falta valor). Vincular
pessoa **nunca** salva direto (smart-match da Komi exige confirmar quem é).

## Critérios de sucesso

- Lançar um gasto simples em ≤ 2 interações; parcelado/cartão/entrada/transferência pelo mesmo lugar.
- Saldo da conta e dívida do cartão batem depois de transferir e de pagar fatura.
- Tudo com Desfazer, exceto encerrar cartão/conta (a API não reativa) e cancelar parcelas futuras — a confirmação avisa.
- `npm run audit:design` passa com a Nami `conformant`; testes de lógica pura e de tela (jsdom) cobrindo os fluxos.

## Fora de escopo

Tabela de faturas persistida; importação de extrato; metas/envelopes de poupança na Nami; reajuste de parcelas;
Open Finance. Registro de pagamento de fatura por parcelas parciais "presas" a uma fatura específica (hoje é FIFO).

## Rollout

1. **Migração dos dados antigos** — `scripts/migrate_nami_signed_transfers.py` (dry-run por padrão): negativa a origem das
   transferências antigas e converte "Pagamento fatura" (Receita no cartão) em transferência. Mostra saldo por conta e dívida
   por cartão antes/depois e **aborta** se a conversão mudar a dívida acumulada de algum cartão.
   Conferir o relatório antes do `--apply`: um "pagamento do cartão" já lançado à mão como despesa na conta duplicaria o débito.
2. Rodar a migração **antes** de usar as telas novas (sem ela, transferências/pagamentos antigos ficam com os números errados).
3. Deploy do backend e do front juntos.

> **Verificação que ainda não foi feita:** não há banco local nesta máquina. O SQL novo foi coberto por testes com cursor
> simulado e a lógica de faturas/plano/estatísticas por funções puras, mas **nada rodou contra um Postgres real**.
