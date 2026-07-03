# Data Model — Tutor de Idiomas na Violet (031)

4 tabelas novas no PostgreSQL compartilhado, prefixo `journal_tutor_*`. **Dono do DDL**:
`agents/kurisu/tutor.py` (`_ensure_tutor_tables()`, idempotente com `CREATE TABLE IF NOT EXISTS`,
chamado na importação do módulo — padrão de `agents/journal/tools.py`). Nível CEFR e sugestão de
próximo foco **não** têm tabela: são derivados na leitura.

Timestamps `TIMESTAMPTZ`; datas locais derivadas com `AT TIME ZONE 'America/Sao_Paulo'` quando
necessário (convenção do repo).

---

## Tabela: `journal_tutor_analyses`

Uma linha por análise pedida. Pertence a um bullet.

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | SERIAL PK | |
| `bullet_id` | INT NOT NULL | FK → `journal_bullets(id)` **ON DELETE CASCADE** |
| `language` | TEXT NOT NULL | ex.: `'en'` (multi-idioma) |
| `original_text` | TEXT NOT NULL | instantâneo do que foi analisado (não muda se o bullet for editado) |
| `corrected_text` | TEXT NOT NULL | correção gramatical mínima — alimenta o toggle |
| `natural_rewrite` | TEXT | reescrita natural/idiomática — só no painel |
| `errors_json` | JSONB NOT NULL DEFAULT '[]' | `[{concept_slug, concept_label, wrong, right, explanation, severity}]` |
| `summary` | TEXT NOT NULL | resumo do aprendizado (voz Kurisu, PT-BR) |
| `score` | INT NOT NULL | 0–100 |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT NOW() | |

Índices: `idx_tutor_analyses_bullet (bullet_id)`, `idx_tutor_analyses_lang_created (language, created_at DESC)`.

**Regra**: a análise mais recente por `bullet_id` é a que serve o toggle (`get_bullet_analysis`).

---

## Tabela: `journal_tutor_events`

Fonte da verdade do progresso — uma linha por (análise × conceito). Base recomputável de `skills`.

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | SERIAL PK | |
| `analysis_id` | INT NOT NULL | FK → `journal_tutor_analyses(id)` **ON DELETE CASCADE** |
| `language` | TEXT NOT NULL | denormalizado p/ query por idioma |
| `concept_slug` | TEXT NOT NULL | slug da lista canônica ou `'outros'` |
| `concept_label` | TEXT NOT NULL | rótulo PT-BR |
| `correct` | BOOLEAN NOT NULL | `true` = usado corretamente · `false` = erro |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT NOW() | herda o momento da análise |

Índice: `idx_tutor_events_series (language, concept_slug, created_at)` — a série temporal por conceito.

---

## Tabela: `journal_tutor_skills`

Cache materializado por conceito (atualizado a cada análise; recomputável dos events).

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | SERIAL PK | |
| `language` | TEXT NOT NULL | |
| `concept_slug` | TEXT NOT NULL | |
| `concept_label` | TEXT NOT NULL | |
| `mastery` | REAL NOT NULL DEFAULT 0 | EMA 0–1 |
| `prev_mastery` | REAL NOT NULL DEFAULT 0 | valor anterior (frase de evolução) |
| `trend` | TEXT NOT NULL DEFAULT 'flat' | `up` \| `down` \| `flat` (só significativo com ≥3 samples) |
| `samples` | INT NOT NULL DEFAULT 0 | total de sinais registrados |
| `correct` | INT NOT NULL DEFAULT 0 | quantos foram corretos |
| `last_seen` | TIMESTAMPTZ | último aparecimento numa análise |
| `updated_at` | TIMESTAMPTZ NOT NULL DEFAULT NOW() | |

Restrição: `UNIQUE (language, concept_slug)`.

**Derivados na leitura** (não persistidos): `mastery_pct = round(mastery*100)`;
`enough_data = samples >= 3` (controla o selo "poucos dados" e a exibição de `trend`).

---

## Tabela: `journal_tutor_guides`

Guia de estudo — no máximo um ativo por idioma.

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | SERIAL PK | |
| `language` | TEXT NOT NULL | |
| `description` | TEXT NOT NULL | texto livre: livro/método/tópico |
| `target_concepts` | JSONB NOT NULL DEFAULT '[]' | lista de `concept_slug` da lista canônica |
| `active` | BOOLEAN NOT NULL DEFAULT TRUE | |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT NOW() | |
| `updated_at` | TIMESTAMPTZ NOT NULL DEFAULT NOW() | |

Índice único parcial: `uq_tutor_guides_active (language) WHERE active` — garante 1 ativo por idioma.
Trocar de guia = desativar o anterior (`active=false`) e inserir/ativar o novo, na mesma transação.

---

## Entidades derivadas (sem tabela)

- **Nível CEFR estimado** (por idioma): `estimate_cefr(recent_scores)` → `{level: 'A1'..'C2',
  preliminary: bool}`. Lê as notas recentes de `journal_tutor_analyses` do idioma.
- **Sugestão de próximo foco** (por idioma): `pick_next_focus(skills, guide_targets)` →
  `{concept_slug, concept_label, reason}` ou `null`. Prioriza alvos do guia ativo com menor
  maestria; senão o conceito de menor maestria com `enough_data`.

## Mapa entidade → tabela (spec → modelo)

| Entidade (spec) | Tabela/Deriv. |
|---|---|
| Análise de escrita | `journal_tutor_analyses` |
| Ocorrência de conceito | `journal_tutor_events` |
| Habilidade por conceito | `journal_tutor_skills` |
| Conceito gramatical | constante `CONCEPTS_EN` em `tutor.py` (+ bucket `outros`) |
| Guia de estudo (foco ativo) | `journal_tutor_guides` |
| Nível estimado / Próximo foco | derivados na leitura |

## Regras de integridade / atualização

- **Análise (transacional)**: inserir 1 `analyses`; para cada conceito do JSON do modelo inserir 1
  `events` (erro→`false`; usado certo→`true`); para cada conceito, `UPSERT` em `skills` recomputando
  `mastery`/`trend`/`samples`/`correct`/`last_seen` a partir dos events daquele `(language, concept_slug)`
  via `tutor_mastery`. Tudo numa transação; falha do Gemini → nada é gravado (FR-010).
- **Exclusão de bullet** → CASCADE remove `analyses` e `events` (FR-011). `skills` daquele conceito
  fica com contagem levemente defasada até a próxima análise; é recomputável dos events (aceitável).
- **`concept_slug` fora da lista canônica** → normalizado para `'outros'` antes de gravar (FR-014).
- **Guia**: ativar um novo desativa o anterior do mesmo idioma (índice parcial garante unicidade).
