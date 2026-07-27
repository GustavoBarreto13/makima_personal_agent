# Implementation Plan: Correções de bugs da Akane (backend, sync Letterboxd, webapp)

**Branch**: `master` | **Date**: 2026-07-27 | **Spec**: `specs/049-akane-bugfixes/spec.md`

**Input**: Feature specification from `specs/049-akane-bugfixes/spec.md`

## Summary

Dez bugs independentes na Akane (agente de filmes), já auditados e localizados
(`research.md`): (1) `get_home` quebra com erro de coluna (`d.liked` → `m.liked`); (2)
sparkline de 7 dias conta filmes soft-deletados; (3) Rewind mostra nome normalizado de
pessoas em vez do nome de exibição; (4) paleta de pôster usa `hash()` nativo (não
determinístico entre processos) em vez de `hashlib.md5`; (5) rating do sync RSS do
Letterboxd não é validado/clampado como no import CSV; (6) fallback de data do RSS quebra
por parsear `pubDate` (RFC-822) como se fosse ISO-8601; (7) falha total de fetch do RSS não
dispara alerta, indistinguível de "zero itens novos" legítimo; (8) histograma de notas nunca
mostra notas inteiras por mismatch de chave entre backend (`"1.0"`) e frontend (`'1'`); (9)
"Logar filme" sempre tenta criar o filme, falhando ao reassistir um já catalogado — busca
TMDB não sinaliza que o resultado já existe localmente; (10) data padrão "assistido hoje" usa
UTC (`toISOString()`) em vez da data local (bug de timezone já documentado no CLAUDE.md
raiz). Nenhuma migração de schema, nenhuma dependência nova.

## Technical Context

**Language/Version**: Python 3.11 (backend + scripts), TypeScript/React (frontend) — stack
já em uso.

**Primary Dependencies**: Nenhuma nova — `hashlib` e `email.utils` já são stdlib.

**Storage**: PostgreSQL — nenhuma tabela ou coluna nova; todas as correções reusam colunas
já existentes (`movies.liked`, `movies.deleted`, `movie_people.name`).

**Testing**: Sem suíte automatizada no repo (padrão das specs 024–039) — validação por
`quickstart.md` + `tsc -b --force` + `py_compile`.

**Target Platform**: Webapp (FastAPI + React) + Telegram (get_home é chamado pelos dois) +
job de sync do Letterboxd (`scripts/sync_letterboxd.py`, chamado pelo scheduler).

**Project Type**: Web application (backend + frontend) + script batch, dentro do monorepo
existente.

**Performance Goals**: Sem exigência nova — os fixes são trocas de coluna/alias, um `JOIN`
extra e validações de valor já feitas em outro lugar do código; custo desprezível.

**Constraints**: FR-006 (rewatch) não pode mudar a semântica de erro de `add_movie` para
outros chamadores — a correção entra antes, na busca (`search_movie`), não na criação.

**Scale/Scope**: Usuário único.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Agent Specialization**: Tudo no domínio Akane (filmes); nenhuma mistura com outro
  agente. **PASS**.
- **II. Hybrid Batch + Agentic**: Bugs tocam tanto o fluxo interativo (webapp/Telegram)
  quanto o job agendado de sync (`scheduler` já existente) — nenhuma automação nova
  introduzida, só corrige a que já existe. **PASS**.
- **III. Self-Contained Agents**: Toda lógica em `agents/akane/tools.py` e
  `scripts/sync_letterboxd.py` (+ `scripts/import_letterboxd_csv.py` para reuso da
  validação de rating) — nenhuma dependência de outro pacote de agente. **PASS**.
- **IV. Portuguese-First UX**: Mensagens de erro/alerta já em português — correções
  preservam o idioma existente. **PASS**.
- **V. Minimal Footprint**: Zero dependências novas, zero tabelas/colunas novas — todos os
  10 bugs são correções de lógica sobre dados/colunas já existentes. **PASS**.

Nenhuma violação — sem entradas na tabela de Complexity Tracking.

## Project Structure

### Documentation (this feature)

```
specs/049-akane-bugfixes/
├── spec.md
├── plan.md              # este arquivo
├── research.md          # Fase 0 — R1..R10
├── data-model.md        # Fase 1
├── contracts/
│   └── rest-api.md      # Fase 1
├── quickstart.md         # Fase 1
└── tasks.md              # /speckit-tasks (próximo)
```

### Source Code (arquivos tocados)

```
agents/akane/
├── tools.py               # get_home (d.liked→m.liked, filtro archived no sparkline),
│                           #   get_rewind (p.name em vez de p.normalizado),
│                           #   _poster_palette (hashlib.md5), search_movie (local_id/
│                           #   in_catalog)
└── CLAUDE.md               # nota sobre as correções (se aplicável — seção de bugs conhecidos)

scripts/
├── sync_letterboxd.py      # validação de rating, fallback de pubDate (RFC-822), exceção
│                           #   em falha total de fetch + alerta via scheduler/notify.py
└── import_letterboxd_csv.py  # _parse_rating exposta para reuso por sync_letterboxd.py

webapp/backend/routers/movies.py   # nenhuma mudança de rota — só repassa o dict já maior

webapp/frontend/src/pages/akane/
├── dateUtils.ts             # NOVO — todayLocalISO()
├── screens/HomeScreen.tsx   # chaves do histograma casando com "N.0"
├── screens/RewindScreen.tsx # idem
└── modals/LogModal.tsx      # in_catalog/local_id reais (rewatch); todayLocalISO() em vez
                              #   de toISOString()

ROADMAP.md                    # nova linha fase 049
```
