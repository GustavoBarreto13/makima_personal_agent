# Quickstart — Verificação do Tutor de Idiomas (031)

Roteiro para provar a feature ponta a ponta. Detalhes de dados/rotas em
[data-model.md](data-model.md) e [contracts/api.md](contracts/api.md).

## Pré-requisitos

- `GEMINI_API_KEY` no ambiente (mesma chave dos agentes).
- `DATABASE_URL` apontando para o PostgreSQL compartilhado.
- Dependências instaladas (`.venv` do makima) incluindo `google-genai`.

## 1. Motor puro (sem banco, sem rede)

```bash
.venv\Scripts\python -m pytest tests/agents/test_kurisu_tutor_mastery.py -q
```
**Esperado**: verde. Cobre — EMA sobe com acertos e cai suave com erros; `trend` `up/down/flat`;
tendência oculta (`None`) com <3 sinais; `estimate_cefr` mapeia faixas de nota → CEFR com selo
`preliminary`; `pick_next_focus` prioriza alvos do guia e depois menor maestria.

## 2. Backend isolado (Gemini + persistência)

Num shell Python dentro do container/venv (as tabelas são criadas na importação de
`agents.kurisu.tutor`):

```python
from agents.kurisu import tutor
# usar um bullet real existente (ver id em journal_bullets); escrever com erros de propósito
r = tutor.analisar_escrita(bullet_id=<ID>, language="en")
assert r["status"] == "ok"
print(r["analysis"]["corrected_text"], r["analysis"]["natural_rewrite"], r["analysis"]["score"])
print(tutor.list_skills("en"))          # skills materializadas
```
**Esperado**: JSON com `corrected_text`, `natural_rewrite`, `errors[]` (com `concept_slug`),
`summary` (PT-BR) e `score`. As 3 tabelas de análise/eventos/skills populadas. Rodar de novo num
bullet que corrige o mesmo conceito e ver `mastery` subir / `trend` virar `up` após ≥3 análises.

Guia:
```python
tutor.set_active_guide(language="en", description="EGiU cap.4", target_concepts=["past-simple"])
print(tutor.get_progress("en")["active_guide"], tutor.get_progress("en")["next_focus"])
```

## 3. API (FastAPI)

```bash
uvicorn webapp.backend.main:app --reload --port 8000
```
Autenticar (cookie `makima_session`) e exercitar:

- `POST /api/journal/bullets/{id}/tutor` `{ "language": "en" }` → 200 com `analysis`.
- `GET /api/journal/bullets/{id}/tutor` → última análise (toggle).
- `GET /api/journal/tutor/progress?language=en` → `level`, `next_focus`, `active_guide`, `skills`.
- `GET /api/journal/tutor/analyses?language=en` → histórico.
- `PUT /api/journal/tutor/guide` / `GET` / `DELETE` → CRUD do guia.
- `GET /api/journal/page?date=YYYY-MM-DD` → bullets já analisados trazem `tutor: {…}`.

**Esperado**: todas exigem sessão (401 sem cookie); falha do Gemini vira **400** com mensagem
PT-BR e **nada** é salvo.

## 4. Frontend (Violet)

```bash
cd webapp/frontend && npm run dev   # localhost:5173 (proxy → :8000)
```
Fluxo:
1. Escrever um bullet em inglês com erros → passar o mouse no bullet → acionar o botão discreto
   de análise → **TutorModal** abre com: texto corrigido, reescrita natural, erros por conceito
   com explicação, resumo (voz Kurisu) e nota.
2. Fechar o modal → o bullet mostra o **toggle** original ↔ corrigido; recarregar a página e
   confirmar que o toggle persiste e o texto salvo do diário continua o **original**.
3. Abrir a tela **Tutor** (sidebar) → ver skills com barra de maestria + glyph de tendência
   (📈/📉/➡️) + selo "poucos dados" (<3), o **nível CEFR** e a **sugestão de próximo foco**.
4. Definir um **guia de estudo** (descrição + conceitos-alvo) → analisar novos bullets → confirmar
   ênfase no foco e destaque dos alvos na tela; remover o guia e ver a volta ao comportamento geral.

## 5. Checagens transversais

- Horários exibidos em **UTC-3** (usar os helpers de data da Violet, nunca `toISOString().slice`).
- Excluir um bullet analisado remove suas análises (sem órfãos).
- Nenhuma rota `/api/*` sem `Depends(require_user)`.
