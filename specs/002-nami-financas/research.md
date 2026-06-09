# Research: Nami · Finanças — Fase de Implementação

**Feature**: `002-nami-financas` | **Generated**: 2026-06-09

---

## 1. Loans vs. Financings — Decisão de Modelagem

**Problema**: O backend atual tem uma única tabela `loans` para PRICE/SAC (usada pelo bot Telegram).
O design do webapp é radicalmente diferente: Empréstimos = pessoa-a-pessoa (direction + person_name);
Financiamentos = entidade estruturada (lender, interest_rate, description).

**Decisão**: Criar **duas tabelas novas** no PostgreSQL:
- `personal_loans` — empréstimos pessoa-a-pessoa
- `financings` — financiamentos estruturados

**Rationale**: Não alterar `loans` (em uso pelo bot Telegram). Isolamento completo entre os
domínios; sem discriminadores; sem migração de dados existentes. A constitution §V (Minimal
Footprint) prefere separar domínios genuinamente distintos em vez de engessar uma tabela existente.

**Alternativas rejeitadas**:
- Discriminador em `loans` (`kind = 'personal'|'financing'`): mistura dois modelos incompatíveis
  numa tabela (PRICE/SAC campos ficam NULL para person-to-person, e vice-versa)
- Adaptar `loans` com novas colunas nullable: viola Minimal Footprint — campos nulos em 100% das
  linhas existentes do bot

---

## 2. Upload de Ícone (IconField)

**Decisão**: Armazenar uploads localmente em `webapp/uploads/icons/` e servir via
`StaticFiles` (`/uploads/*` → `webapp/uploads/`). Retornar URL relativa `/uploads/icons/<uuid>.<ext>`.

**Rationale**: É um app pessoal com 1 usuário. GCS adiciona latência de rede e complexidade de
credenciais; armazenamento local é imediato, zero-latency e já coberto pelo volume Docker existente.

**Alternativas rejeitadas**:
- GCS upload direto: correto para multi-tenant mas overkill aqui; add dependência de SDK
- Base64 no banco: blobs grandes no PostgreSQL degradam performance de queries comuns

**Endpoint**: `POST /api/finances/uploads/icon` — recebe `multipart/form-data` com campo `file`,
valida `content_type.startswith('image/')`, salva em `webapp/uploads/icons/<uuid>.<ext>`,
retorna `{"url": "/uploads/icons/<uuid>.<ext>"}`.

**Backend main.py**: adicionar `app.mount("/uploads", StaticFiles(directory=_UPLOADS_DIR), name="uploads")`
após a checagem de `_FRONTEND_DIST`.

---

## 3. Extensões de Backend Necessárias

### 3.1 Migração de colunas — tabelas existentes

Rodar via `scripts/migrate_nami_webapp.py` dentro do container `makima-web`:

```sql
-- accounts
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS color TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS short VARCHAR(2);
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS icon_url TEXT;

-- credit_cards
ALTER TABLE credit_cards ADD COLUMN IF NOT EXISTS brand TEXT;
ALTER TABLE credit_cards ADD COLUMN IF NOT EXISTS last4 VARCHAR(4);
ALTER TABLE credit_cards ADD COLUMN IF NOT EXISTS grad TEXT;

-- subscriptions
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS color TEXT;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS icon_url TEXT;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS next_billing_day INTEGER;
```

### 3.2 Novas tabelas

```sql
CREATE TABLE IF NOT EXISTS personal_loans (
    id               TEXT PRIMARY KEY,
    direction        TEXT NOT NULL,   -- 'lent' | 'borrowed'
    person_name      TEXT NOT NULL,
    total_amount     NUMERIC NOT NULL,
    installments     INTEGER NOT NULL,
    paid_installments INTEGER DEFAULT 0,
    next_due_day     INTEGER,          -- dia do mês (1-28)
    note             TEXT,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    deleted          BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS financings (
    id               TEXT PRIMARY KEY,
    description      TEXT NOT NULL,
    lender           TEXT,
    total_amount     NUMERIC NOT NULL,
    installments     INTEGER NOT NULL,
    paid_installments INTEGER DEFAULT 0,
    next_due_day     INTEGER,          -- dia do mês (1-28)
    interest_rate    TEXT,             -- descritivo, ex: "2,1% a.m."
    note             TEXT,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    deleted          BOOLEAN DEFAULT FALSE
);
```

---

## 4. Endpoint de Stats do Dashboard

**Problema**: `/api/finances/summary` agrupa por período/campo (categoria, conta, tipo).
O dashboard precisa de: `income`, `expense`, `net`, `by_category[]`, `daily_spending[]`, `cashflow[]`
para um mês específico.

**Decisão**: Novo endpoint `GET /api/finances/stats?month=YYYY-MM` que agrega:
- `income`: soma de `tipo='receita'` no mês
- `expense`: soma de `tipo='despesa'` no mês
- `net`: income − expense
- `by_category[]`: `[{categoria, total, pct}]` para despesas, top categorias
- `daily_spending[]`: `[{day, income, expense}]` para cada dia do mês (sparse — só dias com tx)
- `cashflow[]`: `[{month, income, expense}]` para os últimos 12 meses (para o gráfico de barras)
- `patrimônio`: soma dos saldos atuais de todas as contas (`balance_inicial` + transações em conta)

A tool `get_spending_summary` e `get_spending_trend` existentes cobrem sub-partes;
o novo endpoint faz queries SQL diretas para o que falta.

---

## 5. Categorias — Alinhamento com o Design

**Problema**: `CATEGORIES` atual no bot (`Alimentacao`, `Comer Fora`, etc.) não coincide com o
handoff (`mercado`, `restaurante`, etc.).

**Decisão**: As categorias do handoff são usadas **exclusivamente no frontend da webapp**.
O endpoint `GET /api/finances/categories` retorna a lista hardcoded com `id`, `name`, `icon`, `color`, `kind`.
Ao criar transações via webapp, o campo `categoria` recebe o `id` do handoff (ex.: `mercado`).
O bot Telegram continua usando seu `CATEGORIES` — sem conflito (sistemas independentes).

---

## 6. Padrão Estrutural do Frontend (NamiShell)

Mirror exato de `webapp/frontend/src/pages/frieren/FrierenShell.tsx`:

```
webapp/frontend/src/pages/nami/
├── NamiShell.tsx          # shell principal: estado global, sidebar, topbar, SummBar
├── nami.css               # CSS tokens do handoff §2 (custom properties + dark theme)
├── types.ts               # tipos TS: Transaction, Account, Card, etc.
├── namiApi.ts             # wrapper tipado sobre api.ts para /api/finances/*
├── Toast.tsx              # reusar o de frieren/ ou criar idêntico
├── TweaksPanel.tsx        # tema, acento, densidade, privacidade
├── modals/
│   ├── AddModal.tsx       # modal completo de nova transação (atalho A)
│   ├── FormModal.tsx      # modal genérico de CRUD
│   └── IconField.tsx      # upload + URL + preview
├── components/
│   ├── QuickAdd.tsx       # barra de lançamento rápido inline
│   ├── TxRow.tsx          # linha de transação (CatBadge + valor + excluir)
│   ├── DonutChart.tsx     # SVG donut "Para onde foi"
│   ├── CashflowChart.tsx  # barras duplas mensais
│   └── LoanCard.tsx       # card de empréstimo/financiamento com dots
└── screens/
    ├── Dashboard.tsx
    ├── Transactions.tsx
    ├── Accounts.tsx
    ├── Cards.tsx
    ├── Budgets.tsx
    ├── Subscriptions.tsx
    ├── Loans.tsx
    └── Financings.tsx
```

---

## 7. Estratégia de Roteamento — Deep-link por Hash

FrierenShell usa estado interno `{ view, param }`. NamiShell usará o mesmo padrão,
mas adicionalmente sincroniza com `window.location.hash` para suportar deep-links (FR-006).

Ex.: `/nami#cartoes` → ao montar o shell, lê o hash e define `view = 'cards'`.
Ao navegar internamente, atualiza o hash via `history.replaceState(null, '', '#' + view)`.

---

## 8. App.tsx — Roteamento para NamiShell

`webapp/frontend/src/App.tsx` já roteia `/books` → `FrierenShell`. Adicionar:
```tsx
<Route path="/nami/*" element={<NamiShell />} />
```
E na sidebar principal do Layout, adicionar link "Nami" → `/nami`.
