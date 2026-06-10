---

description: "Task list — Favoritar Bullet pelo Próprio Ícone"
---

# Tasks: Favoritar Bullet pelo Próprio Ícone

**Input**: Design documents from `specs/007-favorite-bullet/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.md, contracts/ui.md, quickstart.md

**Tests**: O projeto não tem suíte automatizada (ver plan.md → Testing). Validação é manual via
`quickstart.md`. Nenhuma task de teste é gerada.

**Organization**: Única user story (P1) — todas as tasks pertencem a US1. Fases: Setup →
Foundational/schema ⚠️ → User Story 1 → Polish.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivo diferente, sem dependência pendente)
- **[Story]**: A qual user story a task pertence (US1)
- Caminhos de arquivo exatos em cada descrição

## Path Conventions

Web app existente (ver plan.md → Project Structure):
- Backend tools: `agents/journal/tools.py`
- Backend router: `webapp/backend/routers/journal.py`
- Frontend: `webapp/frontend/src/lib/api.ts`, `webapp/frontend/src/pages/violet/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirmar contexto; nenhum init de projeto é necessário (repo existente).

- [x] T001 Revisar `agents/journal/tools.py` (padrão `_get_conn`/`_ensure_tables`/`RealDictCursor`) e `webapp/backend/routers/journal.py` (padrão `_check_result` + Pydantic) para alinhar estilo das novas tools/endpoints antes de implementar.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Adicionar a coluna `favorite` em `journal_bullets` e garantir que os retornos
de bullets existentes incluem o campo — bloqueia US1.

**⚠️ CRITICAL**: Nenhuma task de US1 pode começar antes desta fase.

- [x] T002 Em `agents/journal/tools.py::_ensure_tables()`, adicionar logo após o bloco do CHECK de kind (após linha ~153): `ALTER TABLE journal_bullets ADD COLUMN IF NOT EXISTS favorite BOOLEAN NOT NULL DEFAULT FALSE` — conforme DDL em data-model.md. `DEFAULT FALSE` garante retrocompatibilidade; `IF NOT EXISTS` garante idempotência.

- [x] T003 Em `agents/journal/tools.py::get_or_create_page()`, adicionar `favorite` à lista de colunas do SELECT de bullets (linha ~350): `SELECT id, page_id, kind, content, position, created_at, favorite FROM journal_bullets WHERE page_id = %s ORDER BY position ASC` — sem essa mudança o frontend não recebe o estado inicial de favorito. (depende de T002)

- [x] T004 Em `agents/journal/tools.py::upsert_bullet()`, adicionar `favorite` ao RETURNING sem incluí-lo no `DO UPDATE SET` (linha ~693): `RETURNING id, page_id, kind, content, position, created_at, favorite` — o `DO UPDATE SET` não toca em `favorite`, preservando o estado de favorito em qualquer edição de texto ou tipo (FR-005). (depende de T002)

- [ ] T005 Verificar idempotência: rodar `python -c "from agents.journal.tools import _ensure_tables; _ensure_tables(); print('OK')"` (local ou dentro do container `makima-web`) e confirmar coluna `favorite` existe em `journal_bullets` via query em information_schema — sem erro em re-execução. (depende de T002, T003, T004) — ⏳ PENDENTE DB: confirmar no VPS via `makima-web` após deploy.

**Checkpoint**: Schema pronto + bullets retornam `favorite` — US1 pode começar.

---

## Phase 3: User Story 1 — Favoritar bullet pelo próprio marcador (Priority: P1) 🎯 MVP

**Goal**: O usuário clica no marcador (ícone/ponto) de qualquer bullet e ele vira favorito —
marcador garnet imediato (optimistic), persistido entre sessões, preservado em edições.
Endpoint de aggregação por ano também entregue (FR-007).

**Independent Test**: Na tela Escrever de hoje, clicar no marcador de um bullet → vira garnet
em < 200ms; recarregar → continua garnet; editar o texto → favorito preservado; clicar de
novo → volta ao normal; simular offline → marcador reverte. (quickstart Cenários 1 a 7)

### Backend — tools (`agents/journal/tools.py`)

- [x] T006 [US1] Implementar `set_favorite(bullet_id: int, favorite: bool) -> dict` em `agents/journal/tools.py`: `UPDATE journal_bullets SET favorite = %s WHERE id = %s RETURNING favorite`; rowcount 0 → `{"status":"error","message":"bullet não encontrado"}`; sucesso → `{"status":"ok","favorite":bool}`. Padrão: psycopg2/`RealDictCursor`/`conn.commit()`/`finally: conn.close()` — idêntico a `delete_bullet`. Docstring Google Style obrigatória.

- [x] T007 [US1] Implementar `list_favorite_days(year: int) -> list` em `agents/journal/tools.py`: `SELECT DISTINCT jp.date::text FROM journal_bullets b JOIN journal_pages jp ON jp.id = b.page_id WHERE EXTRACT(YEAR FROM jp.date) = %s AND b.favorite = TRUE ORDER BY jp.date ASC`; retorna lista direta `["YYYY-MM-DD", ...]` (sem campo `status` — padrão `list_heatmap`). Lista vazia `[]` se nenhum favorito no ano. Docstring Google Style. (depende de T002)

### Backend — router (`webapp/backend/routers/journal.py`)

- [x] T008 [US1] Em `webapp/backend/routers/journal.py`, importar `set_favorite` e `list_favorite_days` no bloco de imports de tools do journal (linhas ~20-42); adicionar modelo Pydantic `class SetFavoriteBody(BaseModel): favorite: bool`; adicionar endpoint `PATCH /bullets/{bullet_id}/favorite` com `Depends(require_user)` → `set_favorite(bullet_id, body.favorite)` → `_check_result` (404 se erro). (depende de T006)

- [x] T009 [US1] Em `webapp/backend/routers/journal.py`, adicionar endpoint `GET /favorite-days` com `Query(year, description="Ano de referência")` e `Depends(require_user)` → `list_favorite_days(year=year)` retornado direto — **sem** `_check_result` (retorno é lista, sem campo `status`). Padrão: igual a `heatmap_endpoint`. (depende de T007)

### Frontend — paralelos (arquivos distintos, sem dependência entre si)

- [x] T010 [P] [US1] Em `webapp/frontend/src/pages/violet/types.ts`, adicionar `favorite: boolean` à `interface Bullet` (após o campo `created_at`). Bullets antigos recebem `false` pelo `DEFAULT FALSE` do schema — retrocompatibilidade garantida pelo banco.

- [x] T011 [P] [US1] Em `webapp/frontend/src/lib/api.ts`, adicionar ao objeto `violetApi`: `setFavorite: (id: number, favorite: boolean) => api.patch<{status: string; favorite: boolean}>(\`/api/journal/bullets/\${id}/favorite\`, { favorite })` e `favoriteDays: (year: number) => api.get<string[]>(\`/api/journal/favorite-days?year=\${year}\`)`.

- [x] T012 [P] [US1] Em `webapp/frontend/src/pages/violet/violet.css`, adicionar na seção de `.b-mark` (próximo às linhas 338-342): `cursor: pointer` em `.b-mark`; `.b-mark:hover { opacity: 0.75; transition: opacity 0.1s ease; }`; `.b-mark .dot.is-fav { background: var(--garnet); }`; `.b-mark .glyph.is-fav { color: var(--garnet); }` — usa o token `--garnet` já existente (violet.css:42).

### Frontend — Write.tsx (sequencial: mesmo arquivo, lógica interdependente)

- [x] T013 [US1] Em `webapp/frontend/src/pages/violet/screens/Write.tsx`, atualizar `renderMark` (linha ~83) para receber `favorite: boolean` como segundo parâmetro e aplicar classe `is-fav` ao elemento retornado: `<span className={cn('dot', {' is-fav': favorite})} />` para bullet simples e `<span className={cn('glyph', {'is-fav': favorite})}>` para os demais — isso produz o marcador garnet (FR-003). (depende de T010 — interface Bullet precisa ter `favorite`)

- [x] T014 [US1] Em `webapp/frontend/src/pages/violet/screens/Write.tsx`, adicionar função `toggleFavorite(b: Bullet)` com: (1) salvar `const anterior = b.favorite`; (2) optimistic update `setBullets(prev => prev.map(x => x.id === b.id ? {...x, favorite: !b.favorite} : x))` imediato (SC-001: < 200ms); (3) chamar `violetApi.setFavorite(b.id, !b.favorite)`; (4) `.catch(...)` com rollback `setBullets(prev => prev.map(x => x.id === b.id ? {...x, favorite: anterior} : x))` — reverte sem favorito "fantasma" (FR-008). (depende de T010, T011)

- [x] T015 [US1] Em `webapp/frontend/src/pages/violet/screens/Write.tsx`, atualizar o `<div className="b-mark">` (linha ~134) para: (1) chamar `renderMark(b.kind, b.favorite)` (passando o segundo argumento); (2) adicionar `onClick={() => toggleFavorite(b)}` apenas para bullets com `b.id` (não em placeholders de adição, linhas ~161/177); (3) adicionar `title={b.favorite ? 'Desfavoritar' : 'Favoritar'}`, `aria-label={b.favorite ? 'Desfavoritar' : 'Favoritar'}`, `role="button"` (FR-004); (4) `e.stopPropagation()` dentro do onClick por segurança. (depende de T013, T014)

**Checkpoint**: Feature completa — toggle de favorito funcionando com feedback garnet imediato,
persistência entre sessões, rollback em falha. Aggregação por ano disponível via API.

---

## Phase 4: Polish & Cross-Cutting Concerns

**Purpose**: Documentação atualizada, validação E2E, comentários obrigatórios.

- [x] T016 Atualizar `agents/journal/CLAUDE.md`: (1) na seção Schema, adicionar campo `favorite BOOLEAN NOT NULL DEFAULT FALSE` à tabela `journal_bullets`; (2) na tabela de tools, adicionar `set_favorite(bullet_id, favorite)` e `list_favorite_days(year)` com seus contratos de retorno.

- [x] T017 Atualizar `webapp/CLAUDE.md` seção "Endpoints disponíveis" do Journal: adicionar `PATCH /api/journal/bullets/{id}/favorite` (body `{favorite: bool}`, define estado de favorito) e `GET /api/journal/favorite-days?year=N` (lista datas com favorito no ano).

- [ ] T018 Executar validação E2E seguindo `specs/007-favorite-bullet/quickstart.md` Cenários 0 a 7: schema idempotente, toggle favoritar/desfavoritar, persistência, preservação em edição, exclusão, rollback offline, endpoint favorite-days.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Sem dependências — pode começar imediatamente.
- **Foundational (Phase 2)**: Depende de Phase 1 — **bloqueia US1 inteira**.
- **User Story 1 (Phase 3)**: Depende de Phase 2 concluída.
  - Backend tools (T006, T007): sequenciais no mesmo arquivo.
  - Backend router (T008, T009): dependem de T006/T007 respectivamente.
  - Frontend (T010, T011, T012): **paralelos** — arquivos distintos; podem rodar junto com T006–T009.
  - Write.tsx (T013, T014, T015): sequenciais no mesmo arquivo; T013/T014 dependem de T010/T011.
- **Polish (Phase 4)**: Depende de T015 concluído.

### Parallel Opportunities

- **T010, T011, T012** podem rodar em paralelo entre si **e** com T006/T007/T008/T009 — são
  arquivos TypeScript/CSS completamente independentes do Python.
- **T006 e T007** estão no mesmo `tools.py` — não paralelizar (risco de conflito de edição).
- **T008 e T009** estão no mesmo `journal.py` — não paralelizar.
- **T013, T014, T015** estão no mesmo `Write.tsx` — sequenciais; T015 depende de T013 e T014.

```text
# Execução simultânea possível (após Phase 2):
T006 → T008       (backend, sequencial)
T007 → T009       (backend, sequencial)
T010 + T011 + T012  (frontend, em paralelo)
```

---

## Parallel Example: User Story 1

```text
# Após Phase 2 concluída — iniciar em paralelo:
Backend:  T006 → T007 → T008 → T009  (sequencial no mesmo arquivo)
Frontend: T010 / T011 / T012          (paralelo — arquivos distintos)

# Após T010 + T011 concluídos:
Write.tsx: T013 → T014 → T015         (sequencial no mesmo arquivo)
```

---

## Implementation Strategy

### MVP First (única user story)

1. Concluir Phase 1: Setup
2. Concluir Phase 2: Foundational (**CRÍTICO** — bloqueia tudo)
3. Concluir Phase 3: User Story 1 (backend → frontend em paralelo → Write.tsx)
4. **STOP e VALIDAR**: executar quickstart.md Cenários 0 a 7
5. Concluir Phase 4: Polish
6. Commitar tudo na branch `007-favorite-bullet`

### Notas

- **Convenção de comentários global**: todo código novo segue o padrão do Gustavo — comentários
  densos em português explicando o quê e o porquê; docstrings Google Style em toda função
  pública Python; type hints obrigatórios em toda assinatura Python.
- **[P] = arquivo diferente, sem dependência pendente** — não paralelizar tasks no mesmo arquivo.
- A coluna `favorite` é adicionada via `ADD COLUMN IF NOT EXISTS` — idempotente, sem migração
  manual no VPS: aplica no restart do container `makima-web` (`_ensure_tables()` roda na
  importação do módulo).
- `favorite` **nunca** entra no `DO UPDATE SET` do `upsert_bullet` — preserva o estado de
  favorito em qualquer edição de texto ou tipo (FR-005).
- O token `--garnet` já existe em `violet.css:42` — não criar variável nova.
- Rollback no frontend é obrigatório (FR-008): sem rollback, o marcador fica garnet mesmo
  com o banco não tendo salvo o favorito.
