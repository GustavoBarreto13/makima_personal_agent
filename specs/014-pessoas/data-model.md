# Phase 1 — Data Model: Pessoas (014-pessoas)

Schema novo introduzido por esta fatia: `agents/komi/schema_pg.sql` (4 tabelas). Convenções do repo
(verificadas em `agents/nami/schema_pg.sql`, `agents/frieren/schema_pg.sql`): PK TEXT (UUID) ou
SERIAL, `TIMESTAMPTZ DEFAULT NOW()`, soft delete por flag/coluna, `IF NOT EXISTS`, índices parciais
para registros vivos.

---

## Entidade: `people` (identidade canônica)

A pessoa de verdade. `id` UUID em TEXT (consistente com Nami/Frieren e cross-domain). `normalizado`
= `name` em minúsculo e sem acento (gerado pela camada de aplicação no estilo `_norm`).

| Coluna | Tipo | Regra |
|---|---|---|
| `id` | TEXT PK | UUID (`str(uuid.uuid4())`) |
| `name` | TEXT NOT NULL | nome de exibição |
| `normalizado` | TEXT NOT NULL | minúsculo + sem acento; chave de resolução |
| `relationship` | TEXT | "amigo/amiga", "família", "trabalho"… (livre) |
| `phone` | TEXT | contato |
| `email` | TEXT | contato |
| `instagram` | TEXT | handle (sem normalizar) |
| `telegram` | TEXT | handle |
| `city` | TEXT | cidade |
| `avatar_url` | TEXT | URL; UI cai p/ iniciais se NULL |
| `notes` | TEXT | observações livres |
| `created_at` | TIMESTAMPTZ DEFAULT NOW() | |
| `updated_at` | TIMESTAMPTZ DEFAULT NOW() | atualizado em cada `update_person` |
| `deleted` | BOOLEAN DEFAULT FALSE | soft delete |

**Índices**:
- `CREATE UNIQUE INDEX idx_people_normalizado_vivo ON people (normalizado) WHERE deleted = FALSE;`
  — impede duplicar o mesmo nome entre as vivas (SC-002), mas permite recriar após exclusão.
- `CREATE INDEX idx_people_deleted ON people (deleted);` — filtro padrão das listagens.

**Regras**:
- `delete_person` faz `UPDATE people SET deleted = TRUE` (nunca `DELETE`) — preserva histórico e os
  `person_links` (edge case "excluir pessoa com vínculos").
- Toda busca/grid filtra `WHERE deleted = FALSE`.

## Entidade: `person_aliases` (apelidos)

Nomes alternativos que resolvem para a mesma pessoa. Apaga em cascade junto com a pessoa (FK real,
mesmo banco/tipo).

| Coluna | Tipo | Regra |
|---|---|---|
| `id` | SERIAL PK | |
| `person_id` | TEXT NOT NULL | `REFERENCES people(id) ON DELETE CASCADE` |
| `alias` | TEXT NOT NULL | exibição |
| `normalizado` | TEXT NOT NULL | chave de resolução |

**Índices**:
- `CREATE UNIQUE INDEX idx_alias_normalizado ON person_aliases (normalizado);` — global: um apelido
  aponta para no máximo uma pessoa. Reusar um apelido para outra pessoa → erro claro (edge case).
- `CREATE INDEX idx_alias_person ON person_aliases (person_id);`

## Entidade: `person_dates` (datas importantes)

Aniversário e outras datas; alimenta lembretes futuros (fora desta fatia). Cascade com a pessoa.

| Coluna | Tipo | Regra |
|---|---|---|
| `id` | SERIAL PK | |
| `person_id` | TEXT NOT NULL | `REFERENCES people(id) ON DELETE CASCADE` |
| `label` | TEXT NOT NULL | "aniversário", "casamento"… |
| `date` | DATE NOT NULL | a data; ano pode ser placeholder se recorrente |
| `recurring` | BOOLEAN DEFAULT TRUE | repete todo ano? |

**Índice**: `CREATE INDEX idx_dates_person ON person_dates (person_id);`

## Entidade: `person_links` (vínculo polimórfico N:N)

Liga uma pessoa a qualquer item de qualquer domínio. **Sem FK** para as tabelas de origem (tipos de
id divergentes — ver `research.md` R1). Integridade na camada de aplicação.

| Coluna | Tipo | Regra |
|---|---|---|
| `id` | SERIAL PK | |
| `person_id` | TEXT NOT NULL | `REFERENCES people(id) ON DELETE CASCADE` |
| `entity_type` | TEXT NOT NULL | `CHECK (entity_type IN ('transaction','task','book','journal_bullet'))` |
| `entity_id` | TEXT NOT NULL | id do item; TEXT absorve UUID (Nami/Frieren) e SERIAL int (Kaguya/Journal) |
| `created_at` | TIMESTAMPTZ DEFAULT NOW() | |

**Índices/constraints**:
- `CONSTRAINT uq_person_link UNIQUE (person_id, entity_type, entity_id)` — escrita idempotente
  (`INSERT ... ON CONFLICT (person_id, entity_type, entity_id) DO NOTHING`); citar a mesma pessoa 2×
  no mesmo item não duplica (edge case).
- `CREATE INDEX idx_links_entity ON person_links (entity_type, entity_id);` — para "que pessoas
  estão neste item?".
- `CREATE INDEX idx_links_person ON person_links (person_id);` — para a agregação por pessoa.

**Regras de integridade na aplicação** (não no banco):
- A FK `person_id → people` **é** real (cascade): excluir a pessoa some os links? **Não** — o soft
  delete não dispara cascade (a linha de `people` permanece). Os links ficam (histórico). A pessoa
  some das buscas. *(A cascade só dispara num DELETE físico, que não usamos.)*
- Ao deletar o **item-pai** (uma transação/tarefa/livro/bullet), a tool que deleta o item é
  responsável por remover o `person_links` correspondente (`DELETE FROM person_links WHERE
  entity_type=%s AND entity_id=%s`). Vínculos órfãos remanescentes são **ignorados** pela agregação
  (o JOIN com a tabela de origem simplesmente não retorna linha).

---

## Diagrama de relacionamento

```text
                 people (1) ──cascade──< person_aliases
                   │  │
                   │  └──cascade──< person_dates
                   │
                   └──< person_links >── (polimórfico, sem FK) ──┐
                                                                 ├─ transactions (UUID)  [Nami]
                       entity_type + entity_id (TEXT) ───────────┼─ tasks (SERIAL)       [Kaguya]
                                                                 ├─ books (UUID)         [Frieren]
                                                                 └─ journal_bullets (SERIAL) [Journal]
```

## Mapa de `entity_type` → tabela/origem (para a agregação)

| `entity_type` | Tabela de origem | Tipo do PK | Cast na query |
|---|---|---|---|
| `transaction` | `transactions` (Nami) | TEXT UUID | direto (`= entity_id`) |
| `task` | `tasks` (Kaguya) | SERIAL int | `id = entity_id::int` |
| `book` | `books` (Frieren) | TEXT UUID | direto |
| `journal_bullet` | `journal_bullets` (Journal) | SERIAL int | `id = entity_id::int` |

## Estrutura de retorno de `get_person_summary(person_id)`

```jsonc
{
  "status": "ok",
  "perfil":   { /* people + aliases + person_dates (próximas datas) */ },
  "financas": { "saldo": 0.0, "transacoes": [ /* últimas N ligadas */ ] },
  "tarefas":  { "abertas": [...], "concluidas": [...] },
  "diario":   { "contagem": 0, "trechos": [ /* bullets ligados */ ] },
  "livros":   { "livros": [...] }
}
```
Cada bloco resolve **vazio sem erro** (lista vazia / zero) quando não há vínculo (SC-005).
