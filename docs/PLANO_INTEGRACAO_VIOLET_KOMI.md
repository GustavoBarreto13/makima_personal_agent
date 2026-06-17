# Plano — Integração Violet ↔ Komi (`@menção` no diário aponta para uma pessoa canônica)

> **Status: planejamento.** Este documento descreve a ponte Violet→Komi. Nada foi implementado
> ainda. A implementação só começa quando aprovada explicitamente.

## Contexto

Hoje, `@fulano` no diário da Violet é **texto puro**: `_parse_mentions`
(`agents/journal/tools.py:264`) extrai `@(\w+)` e grava em `journal_mentions(bullet_id, kind, value)`
— uma string denormalizada, sem identidade. A tela `People`
(`webapp/frontend/src/pages/violet/screens/People.tsx`) lista essas strings distintas; clicar num
`@` apenas navega.

A **Komi** (spec `014-pessoas`) introduz a identidade canônica de pessoas: tabelas `people`
(UUID em TEXT, `normalizado`), `person_aliases`, e o vínculo polimórfico `person_links`
(`entity_type` ∈ {transaction, task, book, **journal_bullet**}, `entity_id` TEXT). A própria spec
já prevê esta integração (FR-011 / `specs/014-pessoas/contracts/komi-tools.md`): ao salvar um bullet,
vincular as `@menções` a pessoas reais em `person_links`, mantendo `journal_mentions` intacta.

**Objetivo:** ao escrever `@fulano` no diário, escolher (autocomplete) uma pessoa da Komi e gravar
o vínculo `person_links(entity_type='journal_bullet', entity_id=bullet_id, person_id=UUID)` — para
que a Komi depois agregue "tudo que marquei a fulano".

## Decisões (confirmadas)

1. **Autocomplete ao digitar `@`** — dropdown com pessoas da Komi; escolher vincula o `person_id`.
   Opção "criar nova pessoa" no dropdown quando não existir. Resolve ambiguidade na origem.
2. **Só a camada de integração** — a Komi (spec 014: schema + tools + router `/api/pessoas/*`) é
   construída **separadamente, antes**. Este plano cobre só a ponte Violet→Komi.
3. **Só vincular nos dados** — a tela `People` da Violet e o comportamento de clique no `@`
   **permanecem como estão**; `journal_mentions` continua intacta. O `person_links` é gravado por
   baixo, consumível pela Komi.

## Pré-requisitos (entregues pela Komi 014 — fora deste plano)

Este plano **depende** de já existirem:
- **Banco:** tabelas `people`, `person_aliases`, `person_links` (`agents/komi/schema_pg.sql`).
- **Tools** em `agents/komi/tools.py`:
  - `find_people(query) -> {matches:[{id,name,relationship}]}` — busca para o autocomplete.
  - `create_person(name, ...) -> {id}` — criar pessoa nova pelo dropdown.
  - `link_person_on_cursor(cur, person_id, 'journal_bullet', entity_id)` — INSERT idempotente
    (`ON CONFLICT DO NOTHING`) no cursor do chamador.
- **Router** `/api/pessoas/*` (`webapp/backend/routers/pessoas.py`) expondo no mínimo:
  - `GET /api/pessoas/search?q=` → `find_people` (alimenta o autocomplete);
  - `POST /api/pessoas` → `create_person` (opção "criar nova").

> Se a Komi ainda não estiver pronta na hora de executar, este plano fica bloqueado nesses pontos.

## Mudanças — Backend (lado Violet)

Arquivos: `agents/journal/tools.py`, `webapp/backend/routers/journal.py`.

1. **`upsert_bullet(page_id, position, content, kind='bullet', person_ids=None)`** (`tools.py:674`):
   - Novo parâmetro `person_ids: list[str] | None = None`.
   - **Refator de transação:** hoje a função commita internamente; passar a inserir o bullet,
     reextrair `journal_mentions` (inalterado) **e** gravar os `person_links` na **mesma transação**
     (um único commit ao final) — conforme nota da spec ("hoje a função commita internamente").
   - **Vínculos (replace-set):** se `person_ids` for fornecido (lista, mesmo vazia), ele é
     **autoritativo** para o bullet: `DELETE FROM person_links WHERE entity_type='journal_bullet'
     AND entity_id=%s` e re-inserir a lista via `link_person_on_cursor` (mesmo padrão delete+insert
     já usado para `journal_mentions`). Isso mantém a edição correta (remover um `@` desvincula).
   - **Fallback FR-011 (canal agente/Telegram):** se `person_ids is None` (não enviado), opcionalmente
     resolver cada `@menção` do texto via `find_people` e auto-linkar **só em match único exato**
     (0 ou 2+ → sem link, sem erro). Separa webapp (escolha explícita) de agente (auto).
   - `import` de `find_people` / `link_person_on_cursor` de `agents.komi.tools` (dependência Komi).

2. **`delete_bullet(bullet_id)`**: ao apagar o bullet, também
   `DELETE FROM person_links WHERE entity_type='journal_bullet' AND entity_id=%s` — regra de
   integridade na aplicação (data-model: o item-pai limpa seus vínculos). `journal_mentions` já cai
   por `ON DELETE CASCADE`.

3. **`get_or_create_page(...)`** (`tools.py:292`): em cada bullet do retorno, incluir
   `people: [{id, name}]` (LEFT JOIN `person_links` → `people` com `deleted=FALSE`). Serve para o
   frontend **rehidratar** os vínculos ao editar um bullet (não perder o link ao re-salvar). Não muda
   o visual.

4. **Router `journal.py`**:
   - `UpsertBulletBody` (`routers/journal.py:76`): adicionar `person_ids: Optional[list[str]] = None`.
   - `upsert_bullet_endpoint` (`:170`): repassar `person_ids` à tool.
   - `page_endpoint` (`:143`): nenhuma mudança de assinatura — o novo campo `people` já vem da tool.

## Mudanças — Frontend (lado Violet)

Arquivos: `pages/violet/screens/Write.tsx`, `lib/api.ts`, `pages/violet/types.ts`
(+ novo componente de autocomplete). **`RichText.tsx` e `People.tsx` ficam inalterados** (decisão 3).

1. **`lib/api.ts` (`violetApi`)**:
   - `upsertBullet` (`:190`): adicionar `person_ids?: string[]` ao body.
   - `searchPeople(q: string)` → `GET /api/pessoas/search?q=` (autocomplete).
   - `createPerson(name)` → `POST /api/pessoas` (opção "criar nova").

2. **`types.ts`**: estender `Bullet` com `people?: { id: string; name: string }[]` (rehidratação).

3. **Autocomplete `@` no editor** (`Write.tsx`, nos `<textarea>` de adicionar/editar bullet):
   - Detectar o token `@<fragmento>` na posição do cursor; ao digitar, chamar
     `violetApi.searchPeople(fragmento)` (com debounce) e exibir um dropdown ancorado ao caret
     listando `{nome · relacionamento}` + item final **"Criar '<fragmento>'…"**.
   - Ao escolher: inserir/normalizar o texto para `@Nome` e registrar `person_id` num **map por
     bullet** `{ menção → person_id }` (estado local da tela). "Criar nova" → `createPerson` →
     usa o `id` retornado.
   - Ao salvar (`addBullet` `:68` / `saveBullet` `:76`): enviar `person_ids` = conjunto de
     `person_id` escolhidos para aquele bullet, junto do `upsertBullet`.
   - Ao abrir um bullet para editar: pré-carregar o map a partir de `bullet.people` (rehidratação),
     para que re-salvar não perca vínculos.
   - Reusar um pequeno componente novo (ex.: `components/MentionAutocomplete.tsx`) para o dropdown;
     CSS no `violet.css` com os tokens OKLCH do domínio.

## Regras / edge cases

- **Sem match e usuário não cria:** fica `@nome` como texto puro, **sem** `person_links` (sem erro)
  — consistente com a spec. `journal_mentions` grava a string normalmente.
- **Múltiplas pessoas no bullet** ("@Ana e @Bruno"): `person_ids` carrega as duas → dois
  `person_links` para o mesmo `entity_id`.
- **Idempotência:** `link_person_on_cursor` usa `ON CONFLICT (person_id, entity_type, entity_id) DO
  NOTHING`; a mesma pessoa citada 2× não duplica.
- **Edição que remove um `@`:** o `person_ids` autoritativo (replace-set) remove o vínculo órfão.
- **Pessoa excluída na Komi** (soft delete): o LEFT JOIN com `deleted=FALSE` simplesmente não a
  retorna em `bullet.people`; o link histórico permanece (a Komi ignora órfãos na agregação).

## Verificação (quando a Komi existir)

1. **Backend isolado** (com `agents/komi/schema_pg.sql` aplicado e ≥1 pessoa cadastrada):
   - `upsert_bullet(page_id, pos, "café com @Ana", person_ids=[ana_uuid])` → confere 1 linha em
     `person_links` (`entity_type='journal_bullet'`, `entity_id=str(bullet_id)`) **e** a
     `journal_mentions` da string "Ana" intacta, no **mesmo** commit.
   - Re-salvar o mesmo bullet com `person_ids=[]` → o vínculo é removido (replace-set).
   - `delete_bullet(bullet_id)` → `person_links` daquele bullet sai junto.
   - Rollback: forçar erro no passo do vínculo → **zero** linha nova em `journal_bullets` e em
     `person_links` (atomicidade).
2. **Endpoint:** `GET /api/journal/page?date=...` retorna cada bullet com `people:[{id,name}]`.
3. **Frontend (golden path):** abrir `/journal`, digitar "@an" num bullet → dropdown lista pessoas
   da Komi → escolher "Ana Silva" → salvar → recarregar e confirmar que editar o bullet ainda mostra
   o vínculo (rehidratação) e re-salvar não o perde.
4. **Regressão:** tela `People` da Violet e clique no `@` continuam idênticos; busca/heatmap/coleções
   inalterados (nada depende de `person_links`).
5. `npm run build` em `webapp/frontend/` sem erros de tipo (novos campos tipados).
