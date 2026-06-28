# CLAUDE.md — agents/komi

## O que é este agente

**Komi** é o agente especialista em identidade canônica de pessoas. Inspirada em Komi-san wa
Comyushou desu — tímida, mas extremamente cuidadosa com cada detalhe das pessoas ao seu redor.

Responsabilidades:
- Cadastrar, buscar, editar e remover (soft delete) pessoas
- Gerenciar apelidos (aliases globais) e datas importantes (aniversários, formaturas...)
- Agregar vínculos cross-agent: transações (Nami), tarefas (Kaguya), livros (Frieren), diário (Journal)
- Fornecer resumo completo de tudo que envolve uma pessoa (`get_person_summary`)
- Ser chamada como smart-match por outros agentes antes de criar vínculos

Spec: `specs/014-pessoas/`

---

## Arquitetura

```
Telegram (usuário)
    ↓
Makima (coordinator)
    ↓
komi_agent (Agent ADK — singleton)
    └── tools.py   → PostgreSQL (people, person_aliases, person_dates, person_links)
```

**Komi é singleton** — não usa `McpToolset`, não precisa de factory function.
Instância global `komi_agent` em `agent.py`, importada diretamente pelo coordinator.

```python
from agents.komi.agent import komi_agent
```

---

## Schema PostgreSQL

4 tabelas, aplicadas por `scripts/setup_schemas.py` via `agents/komi/schema_pg.sql`.

### `people` — identidade canônica

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | TEXT (UUID) PK | Gerado por `uuid.uuid4()` em Python |
| `name` | TEXT NOT NULL | Nome completo |
| `normalizado` | TEXT NOT NULL | `_norm(name)` — NFD sem acentos + lower |
| `relationship` | TEXT | "amigo/amiga", "família", "trabalho"... |
| `category` | TEXT DEFAULT 'outros' | Categoria canônica: `familia` \| `amigos` \| `trabalho` \| `outros` — dirige filtros e cores no frontend |
| `phone` / `email` / `instagram` / `telegram` | TEXT | Campos de contato |
| `city` | TEXT | Cidade atual |
| `avatar_url` | TEXT | URL da foto de perfil |
| `notes` | TEXT | Observações livres |
| `created_at` | TIMESTAMPTZ | Data de cadastro |
| `updated_at` | TIMESTAMPTZ | Última atualização |
| `deleted` | BOOLEAN DEFAULT FALSE | Soft delete — nunca deleta fisicamente |

**Índice único parcial:** `idx_people_normalizado_vivo ON people (normalizado) WHERE deleted = FALSE`
→ Garante que não há dois registros vivos com o mesmo nome normalizado.
→ Após soft delete, o mesmo nome pode ser recadastrado (novo UUID, nova linha).

### `person_aliases` — apelidos globais únicos

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | SERIAL PK | Autoincrement |
| `person_id` | TEXT FK → people(id) CASCADE DELETE | Dono do apelido |
| `alias` | TEXT NOT NULL | Apelido exato |
| `normalizado` | TEXT NOT NULL | `_norm(alias)` |

**Índice único:** `idx_alias_normalizado ON person_aliases (normalizado)` — apelido é global:
um alias só pode pertencer a uma pessoa no sistema inteiro.

### `person_dates` — datas importantes

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | SERIAL PK | Autoincrement |
| `person_id` | TEXT FK → people(id) CASCADE DELETE | Dono da data |
| `label` | TEXT NOT NULL | "aniversário", "formatura", "casamento"... |
| `date` | DATE NOT NULL | Data em YYYY-MM-DD |
| `recurring` | BOOLEAN DEFAULT TRUE | Se repete todo ano |

### `person_links` — vínculo polimórfico N:N

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | SERIAL PK | Autoincrement |
| `person_id` | TEXT FK → people(id) CASCADE DELETE | Pessoa vinculada |
| `entity_type` | TEXT CHECK IN ('transaction','task','book','journal_bullet','journal_letter') | Tipo da entidade |
| `entity_id` | TEXT NOT NULL | ID da entidade (sempre string — UUIDs e SERIALs ficam como str) |
| `created_at` | TIMESTAMPTZ | Quando o vínculo foi criado |

**Constraint único:** `uq_person_link UNIQUE (person_id, entity_type, entity_id)` — idempotente.

**Por que `entity_id` é TEXT?**
Nami usa UUIDs (TEXT), Kaguya usa SERIAL INT, Journal usa SERIAL INT. Colocar tudo como TEXT
evita migrar o schema se algum domínio mudar o tipo de PK. `link_person_on_cursor` sempre
faz `str(entity_id)` antes de inserir. Ao fazer JOIN, casta com `entity_id::int` quando
necessário (tasks, journal_bullets).

---

## Tools públicas

| Tool | Parâmetros | Descrição |
|---|---|---|
| `create_person(name, ...)` | name obrigatório; `category` (default `"outros"`) e demais opcionais | Cadastra pessoa; falha se nome normalizado já vivo |
| `create_person_on_cursor(cur, name, ...)` | cursor psycopg2 ativo | Versão transacional — sem commit próprio; para uso cross-agent |
| `update_person(person_id, **campos)` | só campos enviados são alterados, inclui `category` | PATCH parcial; recalcula `normalizado` se `name` muda |
| `delete_person(person_id)` | — | Soft delete (`deleted=TRUE`); vínculos preservados |
| `add_alias(person_id, alias)` | — | Apelido único global; erro claro se já pertence a outro |
| `add_important_date(person_id, label, date, recurring)` | date em YYYY-MM-DD | Persiste data importante; retorna `{"status","id","message"}` — o campo `id` é o person_date_id (usado pelo hook de sync) |
| `update_important_date(date_id, *, date?, label?, recurring?)` | date_id: int; keyword args opcionais | UPDATE parcial de um person_date por ID; hook Komi→Kaguya propaga a mudança |
| `delete_important_date(date_id)` | date_id: int | DELETE físico; CASCADE remove o birthday_sync_links; hook Komi→Kaguya soft-deleta a tarefa (scope='series') |
| `list_people()` | — | Retorna pessoas vivas com `link_count` + `category` via LEFT JOIN |
| `find_people(query)` | — | Smart-match: UNION de pessoas + aliases; 0/1/N resultados |
| `get_person(person_id)` | — | Perfil + aliases + dates (sem vínculos cross-agent) |
| `get_person_summary(person_id)` | — | Perfil + financas + tarefas + diario + livros |
| `get_people_overview()` | — | Agregação cross-pessoa para a Home: `{id, name, category, avatar_url, dates[], finance_net, last_interaction}` por pessoa |
| `link_person_on_cursor(cur, person_id, entity_type, entity_id)` | — | INSERT … ON CONFLICT DO NOTHING; chamado por outros agentes na mesma transação |

### `_norm(s)` — normalização canônica

```python
def _norm(s: str) -> str:
    s = s.strip().lower()
    nfd = unicodedata.normalize("NFD", s)
    return "".join(c for c in nfd if unicodedata.category(c) != "Mn")
```

Usada em todos os campos `normalizado` e nas comparações de busca.
`"João"` == `"joao"` == `"JOÃO"` → mesmo `normalizado`.

### `find_people(query)` — smart-match

Estratégia UNION para buscar em nome e alias com um único round-trip:

```sql
SELECT p.id, p.name, p.relationship, p.deleted
FROM people p
WHERE p.deleted = FALSE AND p.normalizado LIKE %(pattern)s
UNION
SELECT p.id, p.name, p.relationship, p.deleted
FROM people p
JOIN person_aliases a ON a.person_id = p.id
WHERE p.deleted = FALSE AND a.normalizado LIKE %(pattern)s
```

`pattern = f"{_norm(query)}%"` — prefixo, portanto `find_people("Ana")` casa `"Ana Lima"`,
`"Ana Costa"` e qualquer alias iniciando com "ana".

### `get_person_summary(person_id)` — hub cross-agent

5 blocos retornados, cada um com sua query independente:

| Bloco | Fonte | Query principal |
|---|---|---|
| `perfil` | `people` + aliases + dates | get_person + contagem de vínculos |
| `financas` | `transactions` via `person_links` | JOIN WHERE entity_type='transaction' |
| `tarefas` | `tasks` via `person_links` | JOIN WHERE entity_type='task' e entity_id::int |
| `diario` | `journal_bullets` + `journal_pages` via `person_links` | JOIN WHERE entity_type='journal_bullet' e entity_id::int |
| `livros` | `books` via `person_links` | JOIN WHERE entity_type='book' |

Bloco vazio = ausência de dados, nunca erro. Cada bloco tem seu próprio `try/except` para
não derrubar o resumo inteiro se uma tabela não existir.

---

## Integração cross-agent (FR-009)

### Como vincular uma pessoa durante a criação de outra entidade

Todos os agentes que aceitam `person_ids` seguem este padrão:

```python
# Dentro da transação (with get_conn() as conn / with conn.cursor() as cur)
if person_ids:
    from agents.komi.tools import link_person_on_cursor  # import lazy — evita ciclo
    for pid in person_ids:
        link_person_on_cursor(cur, pid, "transaction", tx_id)  # ou "task", "book", "journal_bullet"
```

### Agentes modificados

| Agente | Função | entity_type |
|---|---|---|
| Nami | `create_transaction_on_cursor` / `create_transaction` | `"transaction"` |
| Kaguya | `create_task` | `"task"` |
| Frieren | `add_book` | `"book"` |
| Journal | `upsert_bullet` | `"journal_bullet"` (+ auto-link de @menções) |

### Auto-link de @menções no diário (Journal)

Quando `upsert_bullet` é chamado, além de `person_ids` explícitos, o auto-link detecta
`@menções` no conteúdo via `_parse_mentions` e, para cada menção com **exatamente 1 match**
em `find_people`, grava o vínculo automaticamente. Se não houver match ou houver ambiguidade,
ignora silenciosamente (best-effort — nunca falha o bullet).

### Regra de smart-match (FR-007)

Antes de vincular, o agente/usuário deve:
- 0 resultados → oferecer cadastro
- 1 resultado → usar diretamente; confirmar na resposta: "encontrei [Nome]"
- 2+ resultados → perguntar qual antes de vincular

`link_person_on_cursor` não valida smart-match — isso é responsabilidade do chamador (agente/coordinator).

### Atomicidade

`link_person_on_cursor` opera no cursor ativo do chamador. Se o chamador fizer rollback, o
vínculo é descartado junto. Não há transação parcial.

---

## Comportamento da Komi no Telegram

- Sempre começa com `Komi:`
- Tom tímido mas preciso; às vezes hesita antes de falar
- **NUNCA cria duplicata silenciosamente** — sempre verifica smart-match antes
- Confirma sempre a interpretação: "Vou cadastrar Ana Silva como amiga, certo?"
- Soft delete: pede confirmação antes de remover

### Formatação HTML (Telegram)

```
👤 <b>Nome</b> · relacionamento
📱 telefone · 📧 email · 📍 cidade

Resumo (get_person_summary):
💰 Finanças: X transações · saldo R$X,XX
📋 Tarefas: X abertas · X concluídas
📔 Diário: X menções
📚 Livros: X livros

Erros: ❌ descrição do problema
Confirmação: ✅ <b>Nome</b> — descrição
```

---

## Router REST — `/api/people/*`

Exposto em `webapp/backend/routers/pessoas.py`, registrado em `main.py` com prefixo `/api/people`.

| Método | Path | Tool / Ação |
|---|---|---|
| GET | `/api/people/` | `list_people` |
| GET | `/api/people/search?q=...` | `find_people` |
| GET | `/api/people/overview` | `get_people_overview` — agregação cross-pessoa para a Home |
| POST | `/api/people/` | `create_person` |
| GET | `/api/people/{id}` | `get_person` — inclui `id` e `is_synced` por data (fase 026) |
| GET | `/api/people/{id}/summary` | `get_person_summary` |
| PATCH | `/api/people/{id}` | `update_person` |
| DELETE | `/api/people/{id}` | `delete_person` (soft) |
| POST | `/api/people/{id}/aliases` | `add_alias` |
| POST | `/api/people/{id}/dates` | `add_important_date` — retorna `{"status","id","message"}` |
| PATCH | `/api/people/{id}/dates/{date_id}` | `update_important_date` (fase 026) — PATCH parcial; propaga para Kaguya |
| DELETE | `/api/people/{id}/dates/{date_id}` | `delete_important_date` (fase 026) — DELETE físico; CASCADE + hook Kaguya |
| POST | `/api/people/uploads/avatar` | Upload de foto (multipart/form-data) → `{"url": "/uploads/icons/<filename>"}` |

Todas as rotas requerem `Depends(require_user)`.

**Atenção:** `/overview`, `/search` e `/uploads/avatar` devem ser registrados ANTES de `/{person_id}`
no router para não serem capturadas pela rota de parâmetro dinâmico.

---

---

## Sync Komi ↔ Kaguya (fase 026)

Todo `person_date` com `label ILIKE '%anivers%'` é espelhado como tarefa `type=birthday`
na lista "Aniversários" da Kaguya. O sync é bidirecional e best-effort.

### Tabela de ponte

`birthday_sync_links` (em `schema_tasks_pg.sql` da Kaguya):

```sql
person_date_id  INT NOT NULL UNIQUE REFERENCES person_dates(id) ON DELETE CASCADE
task_id         INT NOT NULL UNIQUE REFERENCES tasks(id) ON DELETE CASCADE
komi_label      TEXT  -- cópia do label para diagnóstico
```

1:1 por person_date (não por pessoa — uma pessoa pode ter múltiplos aniversários).

### Módulo de sync

`agents/kaguya/komi_sync.py` — nunca importar no topo de `agents.komi.tools` (ciclo!).
Todas as chamadas são **lazy** e dentro de `try/except`.

| Função | Disparada por | Ação |
|---|---|---|
| `push_person_date(date_id)` | `add_important_date` e `update_important_date` | Cria/atualiza tarefa birthday na Kaguya |
| `remove_person_date(task_id)` | `delete_important_date` | Soft-delete da tarefa (scope='series') |
| `push_birthday(task_id)` | `create_task`/`update_task` type=birthday | Cria/atualiza person_date na Komi |
| `remove_birthday(task_id)` | `delete_task` scope='series' type=birthday | Apaga o person_date correspondente |

### Anti-loop por convergência de valor

Antes de escrever, cada função compara o valor atual no banco com o valor recebido.
Se idênticos → no-op. Isso evita propagação em cascata (A→B→A→B…).

### Feature flag

`KOMI_SYNC_ENABLED=false` desativa todas as propagações sem afetar o CRUD.

### Dedup na agenda

`calendar_provider.py` faz `LEFT JOIN birthday_sync_links WHERE bsl.person_date_id IS NULL`:
aniversários com link são omitidos da listagem da Komi (já aparecem como tarefa Kaguya).

### Migração retroativa

`scripts/migrate_birthday_sync.py` — cria links para aniversários existentes sem link.
Executar de dentro do container: `docker exec makima-web python -m scripts.migrate_birthday_sync`.

---

## O que NÃO fazer aqui

- **Não deletar fisicamente** — sempre soft delete (`deleted=TRUE`); vínculos históricos são preservados.
- **Não vincular sem smart-match** — verificar 0/1/N resultados de `find_people` antes de chamar `link_person_on_cursor`.
- **Não fazer import circular direto** — `agents.komi.tools` não importa de `agents.nami`, `agents.kaguya`, `agents.frieren` ou `agents.journal` no topo do módulo. Imports são lazy (dentro das funções).
- **Não criar duplicata de nome** — o índice único parcial bloqueia no banco; o agente deve checar antes com `find_people`.
- **Não usar markdown** nos templates de resposta — apenas HTML e emojis (Telegram renderiza HTML).
