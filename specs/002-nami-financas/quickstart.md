# Quickstart — Validação End-to-End: Nami · Finanças

**Feature**: `002-nami-financas` | **Tipo**: guia de validação (não é implementação)

Cada cenário mapeia para uma User Story do `spec.md`. Execute na ordem — cada bloco
pressupõe que o anterior passou.

---

## Pré-requisitos

### 1. Migração aplicada

```bash
# Local (o hostname do PostgreSQL resolve em localhost)
python -m scripts.migrate_nami_webapp

# VPS / container (o hostname só resolve dentro do container)
docker cp scripts/migrate_nami_webapp.py makima-web:/app/scripts/migrate_nami_webapp.py
docker exec makima-web sh -c "cd /app && python -m scripts.migrate_nami_webapp"
```

As queries usam `IF NOT EXISTS` — idempotentes (rodar duas vezes não quebra).  
Esquema detalhado: `specs/002-nami-financas/data-model.md`.

### 2. Backend e frontend rodando

```bash
# Backend (raiz do repo)
uvicorn webapp.backend.main:app --reload --port 8080

# Frontend (em webapp/frontend/)
npm install && npm run dev        # dev server em localhost:5173
```

### 3. Autenticado

Acessar `http://localhost:5173`, fazer login Google com o email em `ALLOWED_EMAIL`, confirmar
cookie `makima_session` presente (DevTools → Application → Cookies).

---

## Cenário 1 — Lançamento rápido (US1 · P1) 🎯 MVP

**Valida**: Quick-Add inline, AddModal, atalho `A`, reatividade, toast.

1. Abrir `http://localhost:5173/nami` → Dashboard carrega sem erros de console.
2. Na barra de lançamento rápido inline: digitar `50`, clicar no chip **Restaurante**, pressionar Enter.
3. **Esperado**: toast pill "Lançado ✓" por ~2600 ms; saldo do mês nos cards diminui R$ 50;
   transação surge em "Transações recentes" — **sem reload** da página; campos da Quick-Add
   resetam e foco volta ao campo de valor.
4. Pressionar `A` fora de um campo de texto → AddModal abre com foco no campo de valor.
5. Pressionar Esc → modal fecha sem salvar nada.
6. Abrir AddModal, preencher valor + tipo "Receita" + categoria "Salário" + conta → confirmar →
   modal fecha, saldo e totais atualizam.

**Contrato exercido**: `POST /api/finances/transactions` (existente).

---

## Cenário 2 — Dashboard do mês (US2 · P1) 🎯 MVP

**Valida**: hero, 4 stat cards, fluxo de caixa, donut, previews, seletor de mês.

1. No Dashboard, confirmar visualmente:
   - Hero: `nami-hero.png` ancorado na base com glow + saudação contextual (Bom dia/Boa tarde/Boa noite)
   - Saldo do mês em Bricolage 62px — verde se positivo, coral se negativo
   - 4 stat cards: Receitas (total + contagem), Despesas (total + sparkline + variação vs. mês anterior),
     Saldo do mês (total + taxa de economia), Patrimônio (soma das contas + disponível líquido)
   - Fluxo de caixa: barras duplas verde/coral por mês, mês atual destacado
   - Donut "Para onde foi": SVG + legenda % por categoria
   - Preview Contas + "Próximos vencimentos" (assinaturas, financiamentos, empréstimos por dias restantes)
   - Top-3 orçamentos (barras de progresso) + 6 transações recentes
2. Clicar na seta de mês anterior → **todos** os números, gráficos e listas atualizam para o mês
   escolhido sem recarregar a página.
3. Selecionar um mês sem transações → cards mostram zero; gráficos exibem estado vazio com mensagem
   descritiva — sem NaN e sem erros de console.

**Contratos exercidos**: `GET /api/finances/stats?month=YYYY-MM` + `GET /api/finances/categories`
(ambos novos — ver `contracts/api.md`).

---

## Cenário 3 — Extrato de transações (US3 · P2)

**Valida**: lista agrupada por dia, filtros, busca, excluir.

1. Ir para **Transações**: lista do mês corrente agrupada por data (mais recente primeiro), cada
   grupo com saldo líquido do dia.
2. Passar o mouse sobre uma TxRow → botão lixeira aparece; excluir → toast + saldo do dia recalculado.
3. Usar busca na topbar (2+ chars) → lista filtra em tempo real por nome/categoria.
4. Clicar no chip "Despesas" → só transações `out`; clicar num chip de categoria (ex.: "Lazer") →
   só aquela categoria.
5. Trocar mês na topbar → extrato recarrega para o mês selecionado.

**Contrato exercido**: `GET /api/finances/transactions` + `DELETE /api/finances/transactions/:id`
(existentes).

---

## Cenário 4a — Contas (US4 · P2)

**Valida**: card com barra de acento, IconField (upload + URL + fallback sigla), criação e exclusão.

1. Ir para **Contas** → "Nova conta": nome "Nubank", tipo Corrente, saldo 1500, sigla "NU",
   cor roxa (swatch OKLch), sem ícone → salvar.
2. **Esperado**: card com barra de acento roxa 4px lateral, sigla "NU" em círculo sobre fundo roxo,
   saldo em Bricolage, entradas/saídas do mês no rodapé.
3. Editar a conta (ou criar nova): no IconField, colar URL de uma imagem → preview circular aparece
   em tempo real; salvar → logo substitui a sigla.
4. Editar a conta: no IconField, fazer upload de arquivo (imagem local) → preview Data URL; salvar →
   backend recebe arquivo, retorna `icon_url`; logo aparece no card e no dashboard.
5. Hover no card → botão lixeira; excluir → conta removida da lista.

**Contratos exercidos**: `POST /api/finances/uploads/icon` (novo) + `POST /api/finances/accounts`
com campos `color`/`short`/`icon_url` (estendido).

---

## Cenário 4b — Cartões de crédito (US5 · P2)

**Valida**: plástico com gradiente, bandeira, fatura, barra de uso do limite.

1. Ir para **Cartões** → "Novo cartão": nome "Nubank Ultravioleta", bandeira "Mastercard",
   final "4471", limite 5000, fechamento dia 3, vencimento dia 10, gradiente roxo → salvar.
2. **Esperado**: plástico (aspect-ratio 1.586) com gradiente roxo, número `•••• •••• •••• 4471`,
   chip EMV SVG, ícone Mastercard, fatura calculada com base nas transações, barra de uso do limite
   (laranja < 80%, coral ≥ 80%), datas fecha/vence/disponível, últimos 4 lançamentos.
3. Hover no plástico → botão excluir com fundo semi-transparente; confirmar → cartão removido.

**Contrato exercido**: `POST /api/finances/cards` com `brand`/`last4`/`grad` (estendido).

---

## Cenário 4c — Assinaturas (US6 · P2)

**Valida**: stat cards de totais, logo, dia de cobrança, IconField.

1. Ir para **Assinaturas** → 3 stat cards (total/mês, total/ano, próxima cobrança).
2. "Nova assinatura": "Netflix", R$ 55,90/mês, dia 15, categoria "Lazer", cor vermelha → salvar.
3. **Esperado**: item na lista ordenado por dias restantes para o dia 15, cor vermelha como accent,
   stat cards atualizados.
4. Editar → colar URL do logo → preview circular; salvar → logo aparece na lista e no dashboard
   em "Próximos vencimentos".
5. Hover → excluir.

**Contrato exercido**: `POST /api/finances/subscriptions` com `color`/`icon_url`/`next_billing_day`
(estendido).

---

## Cenário 5 — Orçamentos (US7 · P2)

**Valida**: envelopes mensais, barra de progresso, cores de alerta, filtro de categorias disponíveis.

1. Ir para **Orçamentos** → resumo gasto/orçado total + budget rows.
2. "Novo orçamento": categoria "Lazer", limite R$ 500 → salvar; barra parte de zero.
3. Lançar despesa de R$ 600 em Lazer (qualquer tela) → barra fica coral; rodapé mostra "Passou R$ 100".
4. Criar outro orçamento → o select de categoria **não** lista "Lazer" (já tem orçamento no mês).
5. Hover num envelope → excluir.

**Contrato exercido**: `GET/POST/DELETE /api/finances/budgets` (existentes).

---

## Cenário 6 — Empréstimos pessoa-a-pessoa (US8 · P2)

**Valida**: `personal_loans`, stat cards A receber/A pagar, LoanCard, dots, direction.

1. Ir para **Empréstimos** → 2 stat cards: "A receber" (verde) / "A pagar" (coral).
2. "Novo empréstimo": segment **Emprestei**, pessoa "Ana", total R$ 500, 5 parcelas, 0 pagas,
   dia 10, observação "Emergência" → salvar.
3. **Esperado**: LoanCard com badge "emprestou" (verde), nome "Ana", valor restante R$ 500 em
   destaque, barra de progresso em zero, 5 dots vazios (○○○○○), rodapé "0/5 parcelas · próximo
   dia 10", observação em itálico. Stat card "A receber" atualizado.
4. "Novo empréstimo": segment **Peguei emprestado**, pessoa "Carlos", total R$ 200, 1 parcela
   → salvar. Stat card "A pagar" atualizado; LoanCard com badge "você deve" (coral).
5. Hover → excluir empréstimo.

**Contrato exercido**: `GET/POST/DELETE /api/finances/personal-loans` (novos).

---

## Cenário 7 — Financiamentos (US9 · P2)

**Valida**: `financings`, separação total da aba Empréstimos.

1. Ir para **Financiamentos** → 2 stat cards: "Saldo devedor" / "Parcelas/mês".
2. "Novo financiamento": "MacBook Pro", credor "Nubank", R$ 12.000, 12 parcelas, 0 pagas,
   dia 5, taxa "2,1% a.m.", observação vazia → salvar.
3. **Esperado**: card com badge "financiamento" (coral), descrição "MacBook Pro", credor "Nubank",
   saldo devedor R$ 12.000, taxa "2,1% a.m.", 12 dots vazios, stat cards atualizados.
4. **Confirmar separação**: ir para aba **Empréstimos** → o financiamento **não** aparece lá.
5. Voltar para **Financiamentos** → hover → excluir.

**Contrato exercido**: `GET/POST/DELETE /api/finances/financings` (novos).

---

## Cenário 8 — Tweaks: aparência e privacidade (US10 · P3)

**Valida**: tema claro/escuro, cor de acento, densidade, modo privacidade, persistência.

1. Abrir TweaksPanel → ativar tema **Escuro** → verificar que `--paper` vira `#1A1E2A` e
   paleta inteira muda conforme `[data-theme='dark']` do handoff.
2. Trocar cor de acento para **azul-maré** → botões, item ativo na sidebar, destaques e barras
   de progresso mudam instantaneamente.
3. Ativar **modo privacidade** → valores em `.amount` e `.priv` ficam com `blur(7px)`. Passar
   o mouse sobre um valor → blur removido temporariamente.
4. Recarregar a página → tema escuro + azul-maré + privacidade mantidos (localStorage).
5. Alterar densidade (Confortável ↔ Compacto) → altura das TxRows muda visivelmente.

---

## Gate de Fidelidade Visual

Conferir contra o handoff §2 (`docs/claude_design/design_handoff_nami_financas/README.md`):

- [ ] Tipografia: Bricolage Grotesque (display/hero), DM Sans (texto corrente), DM Mono (números tabulares)
- [ ] Paleta clara E escura: tokens `--tang`, `--blue-sea`, `--coral`, `--paper`, etc. conferem com §2
- [ ] `--in` verde / `--out` coral em valores de receita/despesa
- [ ] Valores BRL via `Intl.NumberFormat('pt-BR')`: `R$ 1.234,56` e compacto `1,2k`
- [ ] `tabular-nums` em todos os campos de valor (sem salto no layout ao atualizar)
- [ ] Deep-link: abrir `http://localhost:5173/nami#cartoes` → shell monta já na tela de Cartões
- [ ] Responsividade (handoff §9): < 880px sidebar colapsa; < 900px grids em 1 coluna; < 760px portrait escondido

---

## Regressão — bot Telegram intacto

Após a migração, confirmar que o bot continua operando normalmente:

1. Enviar uma mensagem de despesa ao bot no Telegram → processada com sucesso.
2. Verificar via `psql`: `SELECT COUNT(*) FROM loans;` — número de linhas **não** alterado pela migração.
3. A tabela `personal_loans` existe; a tabela `loans` mantém estrutura e dados originais.

```sql
-- Checar via psql (ou docker exec):
\d loans          -- não deve ter colunas novas (personal/financings não tocam aqui)
\d personal_loans -- deve existir com direction, person_name, etc.
\d financings     -- deve existir com description, lender, interest_rate, etc.
SELECT column_name FROM information_schema.columns WHERE table_name = 'accounts' AND column_name IN ('color', 'short', 'icon_url');
SELECT column_name FROM information_schema.columns WHERE table_name = 'credit_cards' AND column_name IN ('brand', 'last4', 'grad');
SELECT column_name FROM information_schema.columns WHERE table_name = 'subscriptions' AND column_name IN ('color', 'icon_url', 'next_billing_day');
```
