# Contrato das tools — agente Komi & integração cross-agent

Camada de lógica única em `agents/komi/tools.py`. Toda função pública retorna o padrão do repo:
`{"status": "ok"|"error", "message": ..., ...}`. Type hints + docstring Google Style obrigatórios.

**Paridade de canais (FR-015 / SC-007)**: as mesmas funções alimentam o agente (Telegram) e o
router `/api/pessoas/*`. A *página visual* de cards é webapp-only; o equivalente Telegram é o resumo
conversacional de `get_person_summary`.

---

## Tools de identidade (Onda 1 · US1)

### `create_person(name, relationship="", phone="", email="", instagram="", telegram="", city="", avatar_url="", notes="") -> dict`
Cria pessoa. Gera UUID, calcula `normalizado`. **Erro** se já existir pessoa viva com o mesmo
`normalizado` (índice único parcial). → `{"status":"ok","id":...}`.

### `update_person(person_id, **campos) -> dict`
Atualiza campos passados; recalcula `normalizado` se `name` mudar; toca `updated_at`.

### `delete_person(person_id) -> dict`
Soft delete (`deleted=TRUE`). Mantém links e cascata de alias/datas só dispara em DELETE físico
(que não usamos) — a pessoa apenas some das buscas.

### `add_alias(person_id, alias) -> dict`
Cria apelido (`normalizado` único global). **Erro claro** se o apelido já pertence a outra pessoa.

### `add_important_date(person_id, label, date, recurring=True) -> dict`
Cria data importante (`date` em `YYYY-MM-DD`).

### `list_people() -> dict`
Lista pessoas vivas com `link_count` (contagem de `person_links`). Para o grid.

### `find_people(query) -> dict`  **(núcleo do smart-match)**
Casa `_norm(query)` em `people.normalizado` **e** `person_aliases.normalizado` (UNION, só vivas).
→ `{"status":"ok","matches":[{"id","name","relationship"}]}`.
Cardinalidade dirige o agente: **0** → oferece criar; **1** → usa direto; **2+** → pergunta qual
antes de qualquer vínculo (FR-007; nunca cria duplicata em silêncio).

### `get_person(person_id) -> dict`
Perfil + aliases + próximas datas (base do resumo conversacional da US1, sem depender de vínculos).

## Helpers transacionais (definidos na Onda 1, consumidos na Onda 2)

### `create_person_on_cursor(cur, ...) -> dict`
Insere pessoa usando o cursor do chamador (não commita).

### `link_person_on_cursor(cur, person_id, entity_type, entity_id) -> dict`
`INSERT INTO person_links (...) VALUES (...) ON CONFLICT (person_id, entity_type, entity_id) DO
NOTHING` no cursor do chamador. **Idempotente**. `entity_id` sempre coagido a `str`.

## Hub de agregação (Onda 3 · US3)

### `get_person_summary(person_id) -> dict`
Junta os vínculos por domínio numa estrutura única (ver `data-model.md`): `perfil`, `financas`
(saldo + últimas transações), `tarefas` (abertas/concluídas), `diario` (contagem + trechos),
`livros`. Uma query por domínio (sem N+1); cada bloco vazio resolve sem erro (SC-005). Ignora
vínculos órfãos (item-pai já deletado).

---

## Integração nas tools dos outros agentes (Onda 2 · US2)

Cada tool de criação ganha um parâmetro **opcional** `person_ids` e grava os links **no mesmo
cursor** do item (tudo-ou-nada; FR-009). A recusa em criar uma pessoa nova **não** bloqueia a
criação do item-pai (FR-010) — o item nasce sem vínculo.

| Agente | Tool | `entity_type` | `entity_id` |
|---|---|---|---|
| Nami | `create_transaction` / `create_transaction_on_cursor` | `transaction` | UUID da transação |
| Kaguya | `create_task` (`tools_tasks.py`) | `task` | `str(task_id)` (SERIAL) |
| Frieren | `add_book` | `book` | UUID do livro |
| Journal | `upsert_bullet` | `journal_bullet` | `str(bullet_id)` (SERIAL) |

**Journal — regra especial (FR-011)**: além do `person_ids` explícito, `upsert_bullet` resolve as
`@menções` do texto via `find_people` e auto-linka **apenas em match único exato**; 0 ou 2+ matches
não criam link (sem erro). A `journal_mentions` denormalizada continua sendo gravada como hoje,
intacta. O link é escrito **na mesma transação** do bullet (exige refator: hoje a função commita
internamente).

---

## Assinatura de `person_ids` na fronteira ADK

O ADK gera o schema da tool a partir das type hints. `person_ids` deve ser uma lista de strings
opcional (`person_ids: list[str] | None = None`). Caso o ADK não aceite bem `list[str]` opcional na
prática (a verificar na implementação), o fallback é receber CSV (`person_ids: str = ""`) e dividir
internamente — decisão tomada na execução conforme o comportamento real do runtime; o contrato de
**negócio** (0+ pessoas vinculadas atomicamente) não muda.
