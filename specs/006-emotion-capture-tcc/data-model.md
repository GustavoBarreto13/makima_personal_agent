# Data Model — Registro Emocional (TCC)

**Feature**: 006-emotion-capture-tcc | **Date**: 2026-06-10

Duas tabelas novas no PostgreSQL existente, criadas idempotentemente em
`agents/journal/tools.py::_ensure_tables()` (mesmo padrão das tabelas atuais do journal).

---

## Entidades

### `journal_emotions` — vocabulário de emoções

| Campo | Tipo | Regras |
|---|---|---|
| `id` | SERIAL PK | — |
| `name` | TEXT NOT NULL | rótulo da emoção (ex.: "ansiedade") |
| `is_predefined` | BOOLEAN NOT NULL DEFAULT FALSE | TRUE para as 8 base da TCC; FALSE para custom |

- **Unicidade**: índice único em `LOWER(name)` → dedupe case-insensitive (FR-006).
- **Seed**: 8 emoções base com `is_predefined=TRUE`, inserido só se a tabela estiver vazia.

### `journal_emotion_logs` — registro de pensamentos (TCC)

| Campo | Tipo | Regras |
|---|---|---|
| `id` | SERIAL PK | — |
| `page_id` | INT FK → journal_pages(id) ON DELETE CASCADE | dia do registro (FR-007) |
| `emotion_id` | INT FK → journal_emotions(id) | obrigatório (FR-002) |
| `intensity` | SMALLINT NOT NULL | `CHECK (intensity BETWEEN 0 AND 10)` |
| `situation` | TEXT | opcional |
| `automatic_thought` | TEXT | opcional |
| `adaptive_response` | TEXT | opcional |
| `reappraised_intensity` | SMALLINT | nullable; `CHECK (reappraised_intensity BETWEEN 0 AND 10)`; só com `adaptive_response` preenchida (validado na app) |
| `created_at` | TIMESTAMPTZ DEFAULT NOW() | ordenação e distribuição horária/mensal |

- **Índice**: `idx_emotion_logs_page` em `(page_id)` — consulta "logs do dia" (tela Write).
- **CASCADE**: apagar a página apaga os logs (sem órfãos). Apagar uma emoção custom **não** é
  oferecido (evita logs órfãos — edge case da spec); por isso não há ON DELETE em `emotion_id`.

---

## DDL (a inserir em `_ensure_tables()`)

```sql
-- Vocabulário de emoções (predefinidas + custom)
CREATE TABLE IF NOT EXISTS journal_emotions (
    id            SERIAL PRIMARY KEY,
    name          TEXT NOT NULL,
    is_predefined BOOLEAN NOT NULL DEFAULT FALSE
);

-- Dedupe case-insensitive: "frustração" == "Frustração"
CREATE UNIQUE INDEX IF NOT EXISTS idx_emotions_name_lower
    ON journal_emotions (LOWER(name));

-- Seed das 8 emoções base da TCC, só se a tabela estiver vazia
INSERT INTO journal_emotions (name, is_predefined)
SELECT v.name, TRUE
FROM (VALUES ('alegria'),('tristeza'),('raiva'),('medo'),
             ('ansiedade'),('culpa'),('vergonha'),('nojo')) AS v(name)
WHERE NOT EXISTS (SELECT 1 FROM journal_emotions);

-- Registro de pensamentos (TCC)
CREATE TABLE IF NOT EXISTS journal_emotion_logs (
    id                    SERIAL PRIMARY KEY,
    page_id               INT REFERENCES journal_pages(id) ON DELETE CASCADE,
    emotion_id            INT REFERENCES journal_emotions(id),
    intensity             SMALLINT NOT NULL CHECK (intensity BETWEEN 0 AND 10),
    situation             TEXT,
    automatic_thought     TEXT,
    adaptive_response     TEXT,
    reappraised_intensity SMALLINT CHECK (reappraised_intensity BETWEEN 0 AND 10),
    created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_emotion_logs_page
    ON journal_emotion_logs (page_id);
```

---

## Tools (em `agents/journal/tools.py`)

Todas seguem o padrão existente: psycopg2 síncrono, `RealDictCursor`, `created_at` convertido
para string ISO, retorno `{"status": "ok"|"error", ...}` para mutações.

| Tool | Assinatura | Retorno |
|---|---|---|
| `list_emotions` | `() -> list` | `[{id, name, is_predefined}, ...]` (predefinidas primeiro, depois custom por nome) |
| `create_emotion` | `(name: str) -> dict` | `{"status":"ok","emotion":{id,name,is_predefined:false}}`; se já existe (LOWER), retorna a existente |
| `list_emotion_logs` | `(page_id: int) -> list` | `[{id, page_id, emotion_id, emotion_name, intensity, situation, automatic_thought, adaptive_response, reappraised_intensity, created_at}, ...]` por `created_at` ASC |
| `create_emotion_log` | `(page_id, emotion_id, intensity, situation=None, automatic_thought=None, adaptive_response=None, reappraised_intensity=None) -> dict` | `{"status":"ok","log":{...}}` |
| `update_emotion_log` | `(log_id, **campos_opcionais) -> dict` | `{"status":"ok","log":{...}}` ou erro |
| `delete_emotion_log` | `(log_id: int) -> dict` | `{"status":"ok"}` ou `{"status":"error","message":...}` |
| `get_emotion_stats` | `(year: int) -> dict` | ver abaixo |

### `get_emotion_stats(year)` — shape de retorno

```jsonc
{
  "total": 42,                       // registros do ano
  "avg_intensity": 6.3,              // média geral da intensidade inicial
  "top_emotion": "ansiedade",        // emoção mais frequente (null se total=0)
  "by_emotion": [                    // ordenado por count DESC
    {"name": "ansiedade", "count": 18, "avg_intensity": 7.1},
    {"name": "alegria",   "count": 9,  "avg_intensity": 5.0}
  ],
  "by_month": [0,0,5,8,3,0,0,0,0,0,0,0]  // 12 posições (Jan=0 ... Dez=11), contagem de registros
}
```

- `avg_intensity` usa a intensidade inicial (`intensity`), não a reavaliada.
- `by_month` conta registros por mês de `created_at` no ano informado.
- Estado vazio: `total=0`, `top_emotion=null`, listas/arrays vazios ou zerados (US3 cenário 4).

---

## Regras de validação (resumo)

- `intensity` e `reappraised_intensity`: 0–10 (banco + Pydantic).
- `reappraised_intensity` só aceita valor se `adaptive_response` não-vazia (validação no router).
- `create_emotion`: nome obrigatório, normalizado (trim); dedupe por `LOWER(name)`.
- `create_emotion_log`: `emotion_id` deve existir (FK) e `intensity` obrigatória; demais campos
  opcionais (preenchimento progressivo).
