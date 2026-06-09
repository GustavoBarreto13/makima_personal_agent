# API Contracts: Nami · Finanças

**Feature**: `002-nami-financas` | **Base prefix**: `/api/finances`

---

## Novos endpoints (não existem hoje)

### GET /api/finances/stats

Query params: `month=YYYY-MM` (padrão: mês corrente)

Response `200`:
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
    { "day": "2026-06-01", "income": 0.0, "expense": 450.00 }
  ],
  "cashflow": [
    { "month": "2026-01", "income": 7200.00, "expense": 5100.00 }
  ]
}
```

---

### GET /api/finances/categories

Sem params. Retorna as 15 categorias fixas (seed).

Response `200`:
```json
[
  { "id": "mercado", "name": "Mercado", "icon": "ShoppingCart",
    "color": "oklch(0.65 0.12 140)", "kind": "out" },
  { "id": "salario", "name": "Salário", "icon": "Banknote",
    "color": "oklch(0.58 0.11 162)", "kind": "in" }
]
```

---

### POST /api/finances/uploads/icon

Request: `multipart/form-data`, campo `file` (imagem: jpeg/png/webp/gif/svg).

Response `201`:
```json
{ "url": "/uploads/icons/550e8400-e29b-41d4-a716-446655440000.png" }
```

Error `400`: `{ "detail": "Tipo de arquivo inválido: apenas imagens são aceitas" }`

---

### GET /api/finances/personal-loans

Response `200`:
```json
{
  "status": "ok",
  "loans": [
    {
      "id": "abc",
      "direction": "lent",
      "person_name": "Ana",
      "total_amount": 500.0,
      "installments": 5,
      "paid_installments": 2,
      "next_due_day": 10,
      "note": "Emergência"
    }
  ]
}
```

### POST /api/finances/personal-loans

Body:
```json
{
  "direction": "lent",
  "person_name": "Ana",
  "total_amount": 500.0,
  "installments": 5,
  "paid_installments": 0,
  "next_due_day": 10,
  "note": ""
}
```

Response `201`: `{ "status": "ok", "id": "..." }`

### DELETE /api/finances/personal-loans/:id

Response `200`: `{ "status": "ok" }`

---

### GET /api/finances/financings

Response `200`:
```json
{
  "status": "ok",
  "financings": [
    {
      "id": "xyz",
      "description": "MacBook Pro",
      "lender": "Nubank",
      "total_amount": 12000.0,
      "installments": 12,
      "paid_installments": 0,
      "next_due_day": 5,
      "interest_rate": "2,1% a.m.",
      "note": null
    }
  ]
}
```

### POST /api/finances/financings

Body:
```json
{
  "description": "MacBook Pro",
  "lender": "Nubank",
  "total_amount": 12000.0,
  "installments": 12,
  "paid_installments": 0,
  "next_due_day": 5,
  "interest_rate": "2,1% a.m.",
  "note": ""
}
```

Response `201`: `{ "status": "ok", "id": "..." }`

### DELETE /api/finances/financings/:id

Response `200`: `{ "status": "ok" }`

---

## Endpoints Existentes — Extensão de Campos

### POST /api/finances/accounts (estender)

Adicionar campos opcionais ao body:
```json
{
  "name": "Nubank",
  "type": "corrente",
  "balance_inicial": 1500.0,
  "color": "oklch(0.56 0.2 300)",
  "short": "NU",
  "icon_url": "/uploads/icons/nubank.png"
}
```

### GET /api/finances/accounts (estender)

Response deve incluir `color`, `short`, `icon_url` nos objetos de conta.

### POST /api/finances/cards (estender)

Adicionar campos ao body:
```json
{
  "name": "Nubank Ultravioleta",
  "account_name": "Nubank",
  "limite": 5000.0,
  "closing_day": 3,
  "due_day": 10,
  "brand": "Mastercard",
  "last4": "4471",
  "grad": "linear-gradient(135deg, #420063 0%, #7B2FBE 100%)"
}
```

### GET /api/finances/cards (estender)

Response deve incluir `brand`, `last4`, `grad`.

### POST /api/finances/subscriptions (estender)

Adicionar campos:
```json
{
  "name": "Netflix",
  "valor": 55.90,
  "ciclo": "mensal",
  "next_billing_day": 15,
  "categoria": "lazer",
  "color": "oklch(0.55 0.25 15)",
  "icon_url": null
}
```

---

## Contratos de Resposta de Erro (padrão existente)

```json
{ "detail": "mensagem descritiva do erro" }    // HTTP 400 (validação)
{ "detail": "Não autenticado: ..." }           // HTTP 401 (sem cookie)
```

Erros de validação Pydantic retornam HTTP 422 com estrutura do FastAPI.
