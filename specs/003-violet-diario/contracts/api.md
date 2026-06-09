# API Contracts: Violet · Diário

**Prefixo**: `/api/journal`
**Auth**: todos os endpoints requerem `Depends(require_user)` (cookie `makima_session`)
**Erros**: `{"detail": "mensagem"}` para 400/401/404/422

---

## Endpoints existentes (mantidos, sem breaking change)

### GET /api/journal/page

Busca ou cria a entry do dia. Ganha o campo `dream` e `kind` na resposta.

**Query params**: `date=YYYY-MM-DD` (obrigatório), `type_id=1` (opcional, default 1)

**Response 200**:
```json
{
  "page": {
    "id": 47,
    "type_id": 1,
    "date": "2026-06-09",
    "dream": "Sonhei com uma carta que se escrevia sozinha.",
    "num": 132,
    "created_at": "2026-06-09T08:00:00+00:00",
    "updated_at": "2026-06-09T21:30:00+00:00"
  },
  "bullets": [
    {
      "id": 1001,
      "page_id": 47,
      "kind": "bullet",
      "content": "Acordei antes do alarme.",
      "position": 1000,
      "created_at": "2026-06-09T08:40:00+00:00"
    }
  ]
}
```

**Response 400** (type_id inválido):
```json
{"page": null, "bullets": [], "error": "type_id não encontrado"}
```

> **Mudança**: campo `dream` adicionado em `page`. Campo `kind` adicionado em cada bullet.
> Campo `num` adicionado em `page` (derivado por ROW_NUMBER).

---

### POST /api/journal/bullets

Upsert de um bullet (cria ou atualiza por `page_id + position`). Ganha `kind`.

**Request body**:
```json
{
  "page_id": 47,
  "position": 1000,
  "content": "Acordei antes do alarme.",
  "kind": "bullet"
}
```

`kind` é opcional, default `"bullet"`. Valores válidos: `bullet`, `highlight`, `dream`,
`idea`, `wisdom`, `note`.

**Response 200**:
```json
{
  "status": "ok",
  "bullet": {
    "id": 1001,
    "page_id": 47,
    "kind": "bullet",
    "content": "Acordei antes do alarme.",
    "position": 1000,
    "created_at": "2026-06-09T08:40:00+00:00"
  }
}
```

---

### DELETE /api/journal/bullets/{bullet_id}

Sem mudança de contrato.

**Response 200**: `{"status": "ok"}`
**Response 400**: `{"status": "error", "msg": "bullet não encontrado"}`

---

### GET /api/journal/heatmap

Passa a retornar **palavras escritas** por dia (em vez de contagem de bullets).

**Query params**: `year=2026` (obrigatório)

**Response 200**:
```json
{
  "2026-01-15": 87,
  "2026-01-16": 145,
  "2026-06-08": 312
}
```

Chaves: apenas dias com `words > 0`. Dias futuros não incluídos.

> **Breaking change**: o valor era contagem de bullets; agora é contagem de palavras.
> O cliente existente (Journal.tsx antigo) será removido; o VioletShell usa os novos valores.

---

### GET /api/journal/mentions

Sem mudança de contrato.

**Query params**: `kind=person` ou `kind=tag`

**Response 200**:
```json
[
  {"value": "Pedro", "count": 8},
  {"value": "Ana", "count": 5}
]
```

---

### GET /api/journal/filter

Sem mudança de contrato.

**Query params**: `kind=person&value=Pedro`

**Response 200**:
```json
[
  {
    "date": "2026-06-08",
    "bullets": [
      {"id": 1001, "content": "Almoço com @Pedro.", "kind": "highlight"}
    ]
  }
]
```

> **Mudança**: campo `kind` adicionado em cada bullet da resposta.

---

### GET /api/journal/search

Sem mudança de contrato.

**Query params**: `q=texto`

**Response 200**: mesmo shape do `/filter`.

---

## Endpoints novos

### PUT /api/journal/page/dream

Atualiza o campo `dream` de uma entry existente.

**Request body**:
```json
{
  "page_id": 47,
  "dream": "Sonhei com uma carta que se escrevia sozinha."
}
```

Para limpar o sonho, enviar `"dream": null` ou `"dream": ""` (ambos salvam NULL).

**Response 200**: `{"status": "ok"}`
**Response 400**: `{"status": "error", "msg": "page não encontrada"}`

---

### GET /api/journal/collection/{kind}

Retorna todos os bullets de um tipo específico, ordenados por data decrescente.

**Path param**: `kind` ∈ `{highlight, dream, idea, wisdom, note}`

> Note: `dream` aqui refere-se a bullets com `kind='dream'` (diferente do campo `dream` da page).

**Response 200**:
```json
[
  {
    "id": 1042,
    "kind": "wisdom",
    "content": "Escrever não é guardar o dia. É descobrir o que o dia significou.",
    "created_at": "2026-06-08T21:30:00+00:00",
    "date": "2026-06-08",
    "entry_num": 132
  }
]
```

**Response 400**: `{"status": "error", "msg": "kind inválido"}`

---

### GET /api/journal/dreams

Retorna todas as entries que têm campo `dream` não nulo, ordenadas por data decrescente.

**Response 200**:
```json
[
  {
    "page_id": 47,
    "date": "2026-06-08",
    "entry_num": 132,
    "dream": "Estava numa estação de trem que não terminava nunca."
  }
]
```

---

### GET /api/journal/stats

Retorna estatísticas agregadas do ano.

**Query params**: `year=2026` (obrigatório)

**Response 200**:
```json
{
  "entries": 132,
  "bullets": 348,
  "days_written": 98,
  "total_words": 14720,
  "per_day": 150,
  "highlights": 11,
  "tags": 54,
  "mentions": 96,
  "dreams": 38,
  "highlight_rate": 8,
  "freq_per_week": 3.4,
  "words_by_month": [0, 840, 1200, 1640, 2100, 2800, 1200, 0, 0, 0, 0, 0],
  "daytime": [2, 1, 0, 0, 1, 4, 8, 12, 10, 7, 5, 3]
}
```

`longestStreak` e `currentStreak` são calculados no cliente a partir do heatmap.
`words_by_month`: 12 valores (Jan=0 … Dez=11), apenas meses passados têm dados.
`daytime`: 12 buckets bihourly (0=0h–1h, 1=2h–3h, … 11=22h–23h), contagem de bullets.
