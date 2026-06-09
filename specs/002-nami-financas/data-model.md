# Data Model: Nami · Finanças

**Feature**: `002-nami-financas` | **Generated**: 2026-06-09

---

## Entidades Existentes — Extensões Necessárias

### accounts (estender)

| Campo | Tipo | Status |
|---|---|---|
| id | TEXT PK | existente |
| name | TEXT NOT NULL | existente |
| institution | TEXT | existente |
| type | TEXT | existente (`'corrente'|'poupanca'|'dinheiro'|'investimento'`) |
| balance_inicial | NUMERIC DEFAULT 0 | existente |
| data_inicio | DATE | existente |
| status | TEXT DEFAULT 'ativa' | existente |
| notes | TEXT | existente |
| **color** | **TEXT** | **NOVO** — oklch/hex para barra de acento |
| **short** | **VARCHAR(2)** | **NOVO** — sigla 2 letras (fallback de ícone) |
| **icon_url** | **TEXT** | **NOVO** — URL do logo personalizado |
| created_at, updated_at | TIMESTAMPTZ | existente |

### credit_cards (estender)

| Campo | Tipo | Status |
|---|---|---|
| id | TEXT PK | existente |
| name | TEXT NOT NULL | existente |
| account_id | TEXT FK accounts | existente |
| limite | NUMERIC | existente |
| taxa_juros_mensal | NUMERIC | existente |
| closing_day | INTEGER | existente |
| due_day | INTEGER | existente |
| status | TEXT DEFAULT 'ativo' | existente |
| **brand** | **TEXT** | **NOVO** — `'Mastercard'|'Visa'|'Elo'|'American Express'` |
| **last4** | **VARCHAR(4)** | **NOVO** — 4 últimos dígitos |
| **grad** | **TEXT** | **NOVO** — CSS gradient string para o plástico |
| notes | TEXT | existente |
| created_at, updated_at | TIMESTAMPTZ | existente |

### subscriptions (estender)

| Campo | Tipo | Status |
|---|---|---|
| id | TEXT PK | existente |
| name | TEXT NOT NULL | existente |
| valor | NUMERIC NOT NULL | existente |
| ciclo | TEXT NOT NULL | existente (`'mensal'|'anual'`) |
| next_billing | DATE | existente — manter para compatibilidade com o bot |
| conta | TEXT | existente |
| categoria | TEXT | existente |
| status | TEXT DEFAULT 'ativa' | existente |
| **color** | **TEXT** | **NOVO** — cor de acento do logo |
| **icon_url** | **TEXT** | **NOVO** — URL do logo personalizado |
| **next_billing_day** | **INTEGER** | **NOVO** — dia do mês (1–28) |
| notes, created_at, updated_at, deleted | existente |

---

## Novas Entidades

### personal_loans (NOVA)

| Campo | Tipo | Descrição |
|---|---|---|
| id | TEXT PK | UUID gerado no backend |
| direction | TEXT NOT NULL | `'lent'` (emprestei) ou `'borrowed'` (peguei) |
| person_name | TEXT NOT NULL | Nome da pessoa |
| total_amount | NUMERIC NOT NULL | Valor total em R$ |
| installments | INTEGER NOT NULL | Número total de parcelas |
| paid_installments | INTEGER DEFAULT 0 | Parcelas pagas |
| next_due_day | INTEGER | Dia do mês do próximo vencimento (1–28) |
| note | TEXT | Observação livre |
| created_at | TIMESTAMPTZ DEFAULT NOW() | |
| deleted | BOOLEAN DEFAULT FALSE | Soft delete |

**Derivado no front**: `remaining = total_amount * (1 - paid_installments/installments)`

### financings (NOVA)

| Campo | Tipo | Descrição |
|---|---|---|
| id | TEXT PK | UUID gerado no backend |
| description | TEXT NOT NULL | Descrição do bem (ex.: "MacBook Pro") |
| lender | TEXT | Credor/banco (ex.: "Nubank") |
| total_amount | NUMERIC NOT NULL | Valor total financiado |
| installments | INTEGER NOT NULL | Número total de parcelas |
| paid_installments | INTEGER DEFAULT 0 | Parcelas pagas |
| next_due_day | INTEGER | Dia do mês do próximo vencimento (1–28) |
| interest_rate | TEXT | Taxa descritiva (ex.: "2,1% a.m.") |
| note | TEXT | Observação livre |
| created_at | TIMESTAMPTZ DEFAULT NOW() | |
| deleted | BOOLEAN DEFAULT FALSE | Soft delete |

**Derivado no front**: `remaining_balance = total_amount * (1 - paid_installments/installments)`

---

## Entidade Derivada — Stats do Dashboard

Calculada no backend, não persiste:

```json
{
  "month": "2026-06",
  "income": 8500.00,
  "expense": 6320.00,
  "net": 2180.00,
  "income_count": 3,
  "expense_count": 47,
  "prev_month_expense": 5900.00,
  "savings_rate": 0.2565,
  "patrimônio": 42800.00,
  "patrimônio_liquido": 38200.00,
  "by_category": [
    { "categoria": "mercado", "total": 1200.00, "pct": 18.9 }
  ],
  "daily_spending": [
    { "day": "2026-06-01", "income": 0, "expense": 450.00 }
  ],
  "cashflow": [
    { "month": "2026-01", "income": 7200.00, "expense": 5100.00 }
  ]
}
```

---

## Entidade Categorias (seed hardcoded)

```json
[
  {"id": "mercado",      "name": "Mercado",       "icon": "ShoppingCart", "color": "oklch(0.65 0.12 140)", "kind": "out"},
  {"id": "restaurante",  "name": "Restaurante",   "icon": "UtensilsCrossed","color": "oklch(0.70 0.14 28)", "kind": "out"},
  {"id": "transporte",   "name": "Transporte",    "icon": "Car",           "color": "oklch(0.60 0.10 240)","kind": "out"},
  {"id": "casa",         "name": "Casa",          "icon": "Home",          "color": "oklch(0.65 0.08 60)", "kind": "out"},
  {"id": "saude",        "name": "Saúde",         "icon": "HeartPulse",    "color": "oklch(0.58 0.14 15)", "kind": "out"},
  {"id": "lazer",        "name": "Lazer",         "icon": "Gamepad2",      "color": "oklch(0.62 0.16 300)","kind": "out"},
  {"id": "compras",      "name": "Compras",       "icon": "ShoppingBag",   "color": "oklch(0.68 0.12 50)", "kind": "out"},
  {"id": "educacao",     "name": "Educação",      "icon": "BookOpen",      "color": "oklch(0.60 0.11 200)","kind": "out"},
  {"id": "viagem",       "name": "Viagem",        "icon": "Plane",         "color": "oklch(0.64 0.14 230)","kind": "out"},
  {"id": "assinaturas",  "name": "Assinaturas",   "icon": "RefreshCw",     "color": "oklch(0.58 0.10 280)","kind": "out"},
  {"id": "outros",       "name": "Outros",        "icon": "MoreHorizontal","color": "oklch(0.60 0.05 60)", "kind": "out"},
  {"id": "salario",      "name": "Salário",       "icon": "Banknote",      "color": "oklch(0.58 0.11 162)","kind": "in"},
  {"id": "freela",       "name": "Freela",        "icon": "Laptop",        "color": "oklch(0.65 0.13 162)","kind": "in"},
  {"id": "investimento", "name": "Investimento",  "icon": "TrendingUp",    "color": "oklch(0.74 0.13 78)", "kind": "in"},
  {"id": "reembolso",    "name": "Reembolso",     "icon": "RotateCcw",     "color": "oklch(0.62 0.09 162)","kind": "in"}
]
```

---

## Script de Migração

`scripts/migrate_nami_webapp.py` — a ser criado. Executar via:
```bash
docker exec makima-web sh -c "cd /app && python -m scripts.migrate_nami_webapp"
```

Conteúdo: ALTERs para `accounts`/`credit_cards`/`subscriptions` + CREATEs para `personal_loans`/`financings`.
