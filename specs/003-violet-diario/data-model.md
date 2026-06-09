# Data Model: Violet · Diário

**Gerado por**: `/speckit-plan` em 2026-06-09
**Spec de referência**: [spec.md](spec.md) — Key Entities

---

## Diagrama de relações

```
journal_pages (Entry)
  ├── id          PK SERIAL
  ├── type_id     FK → journal_types (default 1 = 'personal')
  ├── date        DATE UNIQUE(type_id, date)
  ├── dream       TEXT NULL          ← NOVO: sonho do dia
  ├── created_at  TIMESTAMPTZ
  └── updated_at  TIMESTAMPTZ
        │
        └── journal_bullets (Bullet) 1:N
              ├── id          PK SERIAL
              ├── page_id     FK → journal_pages ON DELETE CASCADE
              ├── kind        TEXT DEFAULT 'bullet'  ← NOVO: tipo do bullet
              ├── content     TEXT NOT NULL
              ├── position    INT (esparso ×1000)
              ├── created_at  TIMESTAMPTZ
              └── search_vec  TSVECTOR GENERATED (content)
                    │
                    └── journal_mentions (Mention) 1:N
                          ├── id         PK SERIAL
                          ├── bullet_id  FK → journal_bullets ON DELETE CASCADE
                          ├── kind       TEXT CHECK ('person' | 'tag')
                          └── value      TEXT (sem @ ou #)
```

---

## Entidades

### Entry (`journal_pages`)

Representa um dia no diário. Uma entrada por dia (UNIQUE `type_id, date`).

| Campo | Tipo | Regras |
|---|---|---|
| `id` | SERIAL PK | auto |
| `type_id` | INT FK | sempre 1 ('personal') nesta fase |
| `date` | DATE | formato YYYY-MM-DD |
| `dream` | TEXT NULL | **NOVO** — sonho do dia; nulo se não registrado |
| `created_at` | TIMESTAMPTZ | auto |
| `updated_at` | TIMESTAMPTZ | atualizado ao salvar qualquer bullet |

**Campo derivado** (não persistido):
- `num` — número sequencial da entrada, derivado por `ROW_NUMBER() OVER (ORDER BY date)`
  na query. Exemplo: a mais antiga é `#1`, a de hoje é `#132`.

**Validações**:
- `dream` aceita null (entrada sem sonho registrado) ou texto livre de qualquer tamanho.
- Uma entry é "vazia" se `dream IS NULL AND bullet_count = 0` — estado válido (dia registrado
  mas sem conteúdo ainda).

---

### Bullet (`journal_bullets`)

Um item de bullet journal dentro de uma entrada. Pode ser de 6 tipos.

| Campo | Tipo | Regras |
|---|---|---|
| `id` | SERIAL PK | auto |
| `page_id` | INT FK | ON DELETE CASCADE → entry |
| `kind` | TEXT | **NOVO** — CHECK IN ('bullet','highlight','dream','idea','wisdom','note'); DEFAULT 'bullet' |
| `content` | TEXT NOT NULL | pode conter `@NomePessoa` e `#tag-nome` inline |
| `position` | INT | esparso (múltiplos de 1000); inserção no meio = média das adjacentes |
| `created_at` | TIMESTAMPTZ | registra o HH:MM exibido na UI |
| `search_vec` | TSVECTOR | GENERATED ALWAYS AS `to_tsvector('portuguese', content)` |

**Tipos de bullet e seu significado visual:**

| `kind` | Marcador | Cor | Tipografia | Fundo |
|---|---|---|---|---|
| `bullet` | ponto 6px | `--ink-4` | DM Sans 15.5px/300 | nenhum |
| `highlight` | coração ♥ preenchido | `--garnet` | DM Sans 15.5px/300 | gradiente garnet-tint lateral |
| `dream` | lua preenchida | `--gold` | DM Sans 15.5px/300 | nenhum |
| `idea` | lâmpada | `--amber` | DM Sans 15.5px/300 | nenhum |
| `wisdom` | gem preenchida | `--violet-c` | Newsreader itálico 16.5px | nenhum |
| `note` | pin | `--ink-3` | DM Sans 15.5px/300 | nenhum |

**Validações**:
- `content` pode ser string vazia (bullet ainda sendo digitado) — o autosave persiste.
- `kind` deve ser um dos 6 valores; default `'bullet'` para retrocompatibilidade com bullets
  existentes sem `kind` (migrados com `ALTER … DEFAULT 'bullet'`).
- `position` único por `(page_id, position)` — conflito = upsert.

---

### Mention (`journal_mentions`)

Token inline parseado do `content` de um bullet. Gerado automaticamente ao salvar.

| Campo | Tipo | Regras |
|---|---|---|
| `id` | SERIAL PK | auto |
| `bullet_id` | INT FK | ON DELETE CASCADE |
| `kind` | TEXT | CHECK IN ('person', 'tag') |
| `value` | TEXT | sem o @ ou # (ex: "Pedro", "corrida") |

**Parsing**: `@NomePessoa` → `kind='person', value='NomePessoa'`;
`#tag-nome` → `kind='tag', value='tag-nome'`. Regex: `@([\wÀ-ÿ]+)` e `#([\wÀ-ÿ-]+)`.

Ao fazer upsert de um bullet, o agente `DELETE FROM journal_mentions WHERE bullet_id = ?`
e re-insere as menções parseadas do novo `content`.

---

### Collection (derivada, não persistida)

Visão sobre os bullets agrupados por `kind` ou sobre os campos `dream` das entries.

| Coleção | Fonte | Filtro |
|---|---|---|
| `dreams` | `journal_pages` | `dream IS NOT NULL` |
| `highlights` | `journal_bullets` | `kind = 'highlight'` |
| `ideas` | `journal_bullets` | `kind = 'idea'` |
| `wisdom` | `journal_bullets` | `kind = 'wisdom'` |
| `notes` | `journal_bullets` | `kind = 'note'` |
| Tags | `journal_mentions` | `kind = 'tag'` agrupado por `value` |
| People | `journal_mentions` | `kind = 'person'` agrupado por `value` |

Cada item de coleção carrega referência à entry de origem (`date`, `entry_num`).

---

### HeatmapDay (derivado)

Série temporal diária usada para o heatmap anual dos Insights.

| Campo | Tipo | Derivação |
|---|---|---|
| `date` | string `YYYY-MM-DD` | cada dia do ano até hoje |
| `words` | int | soma de `len(content.split())` de todos os bullets do dia + `len(dream.split())` se dream não nulo |

**Thresholds de cor** (5 níveis):
| Nível | Palavras | Variável CSS |
|---|---|---|
| heat-0 | 0 | `--heat-0` = `var(--line-2)` |
| heat-1 | 1–49 | `--heat-1` = `oklch(0.86 0.052 250)` |
| heat-2 | 50–99 | `--heat-2` = `oklch(0.75 0.090 250)` |
| heat-3 | 100–189 | `--heat-3` = `oklch(0.63 0.120 250)` |
| heat-4 | ≥190 | `--heat-4` = `oklch(0.50 0.135 251)` |

Dias futuros não são incluídos no array retornado pelo endpoint.

---

### Stats (derivado, calculado no servidor via `get_stats(year)`)

Agregado anual retornado pelo endpoint `GET /api/journal/stats?year=`.

```typescript
interface Stats {
  entries: number;          // total de entries com pelo menos 1 bullet
  bullets: number;          // total de bullets do ano
  daysWritten: number;      // dias do heatmap com words > 0
  totalWords: number;       // soma de todas as words do heatmap
  perDay: number;           // totalWords / daysWritten (médio por dia escrito)
  highlights: number;       // bullets com kind='highlight'
  tags: number;             // tags distintas (journal_mentions kind='tag')
  mentions: number;         // pessoas distintas (journal_mentions kind='person')
  dreams: number;           // entries com dream não nulo
  highlightRate: number;    // % de entries com pelo menos 1 highlight
  freqPerWeek: number;      // daysWritten / (semanas do ano até hoje)
  longestStreak: number;    // maior sequência de dias consecutivos com escrita (calculado no cliente)
  currentStreak: number;    // sequência atual (calculado no cliente)
  wordsByMonth: number[];   // array 12 — palavras por mês (Jan=0)
  daytime: number[];        // array 12 — buckets bihourly (0h=0 até 22h=11), proporcional a bullets
}
```

`longestStreak` e `currentStreak` são calculados no cliente a partir do `heatmap` — o servidor
retorna os dados brutos do heatmap; os streaks são derivados iterando de trás para frente.

---

### ReflectPrompt (estático, hardcoded no frontend)

4 perguntas predefinidas assinadas por "Violet". Não persistidas no banco.

```typescript
const REFLECT_PROMPTS = [
  { q: 'O que você sentiu hoje que não conseguiu dizer a ninguém?', by: 'Violet' },
  { q: 'Qual pequena coisa de hoje você gostaria de poder reviver?', by: 'Violet' },
  { q: 'Por quem você foi grato hoje — e essa pessoa sabe disso?', by: 'Violet' },
  { q: 'Se o dia de hoje fosse uma carta, para quem você a enviaria?', by: 'Violet' },
]
```

---

### Preferences (localStorage)

Preferências de personalização do usuário, persistidas em `localStorage` com chave `vl-tweaks`.

```typescript
interface VioletPrefs {
  theme: 'light' | 'dark';                          // default: 'light'
  accent: 'sapphire' | 'gold' | 'emerald' | 'garnet'; // default: 'sapphire'
  mode: 'normal' | 'wide' | 'focus';                // default: 'normal'
  typography: 'classic' | 'technical';              // default: 'classic'
}
```

**Paletas de acento:**

| Acento | `--accent` | `--accent-deep` | `--accent-bright` |
|---|---|---|---|
| `sapphire` | `oklch(0.55 0.135 250)` | `oklch(0.45 0.135 252)` | `oklch(0.70 0.130 246)` |
| `gold` | `oklch(0.625 0.105 78)` | `oklch(0.585 0.098 72)` | `oklch(0.70 0.105 78)` |
| `emerald` | `oklch(0.585 0.105 165)` | `oklch(0.52 0.105 165)` | `oklch(0.65 0.105 165)` |
| `garnet` | `oklch(0.535 0.165 18)` | `oklch(0.45 0.165 18)` | `oklch(0.60 0.165 18)` |

---

## DDL — alterações ao schema existente

Executadas via `agents/journal/tools.py::_ensure_tables()` (auto-run na importação).
Todas as operações são **idempotentes** — seguras para re-executar com dados existentes.

```sql
-- Adicionar tipo de bullet (bullets existentes ficam como 'bullet')
ALTER TABLE journal_bullets
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'bullet';

-- Remover CHECK constraint se já existir (para ALTER seguro; recria abaixo)
-- (psycopg2: executar em try/except para ignorar se não existir)

-- Adicionar CHECK constraint para kind
-- Verificar se já existe antes de criar:
-- SELECT 1 FROM information_schema.table_constraints
-- WHERE constraint_name = 'journal_bullets_kind_check'
-- Se não existir:
ALTER TABLE journal_bullets
  ADD CONSTRAINT journal_bullets_kind_check
  CHECK (kind IN ('bullet','highlight','dream','idea','wisdom','note'));

-- Adicionar campo de sonho por entrada (NULL para entries existentes)
ALTER TABLE journal_pages
  ADD COLUMN IF NOT EXISTS dream TEXT;
```

**Nota sobre a constraint CHECK**: `ADD COLUMN IF NOT EXISTS` não adiciona o CHECK.
O `_ensure_tables()` deve verificar a existência da constraint antes de criá-la para ser idempotente.
Alternativa mais simples: usar um trigger ou validar apenas no aplicativo (sem CHECK no banco) —
deixar como decisão do implementador com base no risco tolerado.
