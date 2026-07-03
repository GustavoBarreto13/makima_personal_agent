# API Contract — Tutor de Idiomas na Violet (031)

Endpoints REST adicionados ao router `webapp/backend/routers/journal.py` (prefixo `/api/journal`).
**Todas** as rotas exigem `Depends(require_user)` (FR-012). Padrão de erro: tools retornam
`{"status": "error", "message": ...}` → `_check_result` converte em HTTP 400. Endpoints que
retornam lista/objeto direto (leitura) **não** usam `_check_result`.

Idioma default `en` em todos os parâmetros `language`.

---

## POST `/api/journal/bullets/{id}/tutor`

Analisa a escrita de um bullet (US1). Chama `kurisu.tutor.analisar_escrita(bullet_id, language)`.

**Body**: `{ "language": "en" }`

**200** →
```json
{
  "status": "ok",
  "analysis": {
    "id": 12,
    "bullet_id": 345,
    "language": "en",
    "original_text": "I has two cat.",
    "corrected_text": "I have two cats.",
    "natural_rewrite": "I have two cats.",
    "errors": [
      {"concept_slug": "subject-verb-agreement", "concept_label": "Concordância verbal",
       "wrong": "I has", "right": "I have", "explanation": "…", "severity": "high"}
    ],
    "concepts_used_correctly": ["articles"],
    "summary": "Kurisu: você tropeçou na concordância…",
    "score": 62,
    "created_at": "2026-07-03T14:10:00-03:00"
  },
  "skills_touched": ["subject-verb-agreement", "articles"]
}
```

**400** — bullet inexistente/vazio, texto não parece estar no idioma-alvo, ou falha do provedor de
IA (nada é salvo — FR-010): `{ "detail": "mensagem PT-BR" }`.

---

## GET `/api/journal/bullets/{id}/tutor`

Última análise de um bullet — serve o toggle (US2). Chama `get_bullet_analysis(bullet_id)`.

**200** → `{ "analysis": { …mesmo formato… } }` ou `{ "analysis": null }` se nunca analisado.

---

## GET `/api/journal/tutor/progress?language=en`

Dados da tela de progresso (US3): skills + nível CEFR + próximo foco + guia ativo.
Retorna objeto direto (sem `_check_result`).

**200** →
```json
{
  "language": "en",
  "level": { "cefr": "B1", "preliminary": false },
  "next_focus": { "concept_slug": "past-simple", "concept_label": "Passado simples",
                  "reason": "menor maestria entre os alvos do seu guia" },
  "active_guide": { "id": 3, "description": "English Grammar in Use — cap. 4",
                    "target_concepts": ["past-simple", "present-perfect"] },
  "skills": [
    { "concept_slug": "past-simple", "concept_label": "Passado simples",
      "mastery_pct": 48, "trend": "up", "samples": 5, "correct": 3,
      "enough_data": true, "is_target": true, "last_seen": "2026-07-03T…" },
    { "concept_slug": "articles", "concept_label": "Artigos",
      "mastery_pct": 80, "trend": null, "samples": 2, "correct": 2,
      "enough_data": false, "is_target": false, "last_seen": "…" }
  ]
}
```
Notas: `trend` é `null` quando `enough_data=false` (selo "poucos dados"); `is_target=true` para
conceitos do guia ativo (destaque). `next_focus`/`active_guide` podem ser `null`.

---

## GET `/api/journal/tutor/analyses?language=en&limit=20`

Histórico de análises recentes (US3). Retorna lista direta.

**200** → `[ { "id", "bullet_id", "score", "error_count", "summary", "created_at" }, … ]`
(ordenado por `created_at DESC`, `limit` default 20).

---

## GET `/api/journal/tutor/concepts?language=en`

Lista canônica de conceitos — popula o seletor de conceitos-alvo do guia. Lista direta.

**200** → `[ { "slug": "past-simple", "label": "Passado simples" }, … ]`

---

## GET `/api/journal/tutor/guide?language=en`

Guia de estudo ativo (US4). Retorna objeto direto.

**200** → `{ "guide": { "id", "language", "description", "target_concepts": [...],
"created_at", "updated_at" } }` ou `{ "guide": null }`.

---

## PUT `/api/journal/tutor/guide`

Cria/atualiza o guia ativo (US4, FR-015). Chama `set_active_guide(...)` (desativa o anterior e
ativa o novo na mesma transação).

**Body**: `{ "language": "en", "description": "English Grammar in Use — cap. 4",
"target_concepts": ["past-simple", "present-perfect"] }`

**200** → `{ "status": "ok", "guide": { … } }`
**400** — `description` vazia ou `target_concepts` com slug fora da lista canônica.

---

## DELETE `/api/journal/tutor/guide?language=en`

Remove/desativa o guia ativo (FR-015/FR-018). Não afeta análises já salvas.

**200** → `{ "status": "ok" }`

---

## Alteração no payload de `GET /api/journal/page`

Cada bullet do array `bullets` ganha um campo `tutor` (nullable), composto **no router** via
`kurisu.tutor.get_bullets_tutor_meta(bullet_ids)` — sem alterar `agents/journal/get_or_create_page`
(R8):

```json
{ "id": 345, "kind": "bullet", "content": "…", "position": 1000, "favorite": false,
  "created_at": "…",
  "tutor": { "analysis_id": 12, "has_correction": true, "error_count": 1 } }
```
`tutor` é `null` quando o bullet nunca foi analisado. O frontend usa esse campo para decidir se
mostra o toggle (busca o `corrected_text` sob demanda em `GET /api/journal/bullets/{id}/tutor`).

---

## Camada `violetApi` (frontend, `lib/api.ts`)

| Método | Rota |
|---|---|
| `analyzeTutor(bulletId, language)` | POST `/api/journal/bullets/{id}/tutor` |
| `bulletAnalysis(bulletId)` | GET `/api/journal/bullets/{id}/tutor` |
| `tutorProgress(language)` | GET `/api/journal/tutor/progress` |
| `tutorAnalyses(language, limit?)` | GET `/api/journal/tutor/analyses` |
| `tutorConcepts(language)` | GET `/api/journal/tutor/concepts` |
| `getTutorGuide(language)` | GET `/api/journal/tutor/guide` |
| `saveTutorGuide(body)` | PUT `/api/journal/tutor/guide` |
| `deleteTutorGuide(language)` | DELETE `/api/journal/tutor/guide` |
