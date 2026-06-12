# Phase 0 — Research: Pessoas (014-pessoas)

Decisões técnicas que destravam o `plan.md`. Cada item: **decisão · alternativas · porquê**.
A maioria foi fechada no brainstorm (ver `spec.md`); aqui registramos o "como" verificado contra o
código real do repo.

---

## R1 — Vínculo pessoa↔item: tabela polimórfica única (sem FK)

**Decisão**: uma só tabela `person_links(person_id, entity_type, entity_id)`, onde `entity_type` ∈
{`transaction`, `task`, `book`, `journal_bullet`} e **não há FK** para as tabelas de origem.

**Alternativas consideradas**:
- *4 tabelas-ponte tipadas* (`transaction_people`, `task_people`, …), cada uma com FK real. Mais
  íntegra no banco, mas multiplica DDL, queries e tools por domínio — fere o Princípio V (Minimal
  Footprint) e não escala para futuros domínios (media, email).
- *Coluna `person_ids` array dentro de cada tabela de origem*. Quebra a relação N:N limpa e espalha
  a lógica de pessoas por todos os agentes.

**Porquê a polimórfica vence**: os ids de origem têm **tipos diferentes** — Nami/Frieren usam UUID
em TEXT, Kaguya/Journal usam SERIAL int. Uma FK única é impossível. `entity_id` em **TEXT** absorve
os dois (o cast por domínio acontece só na agregação). A integridade referencial migra para a
camada de aplicação (já é o padrão do repo para cross-domain). Custo aceito: vínculos órfãos
possíveis ao deletar o item-pai → a aplicação remove o link ao deletar, e a agregação ignora órfãos.

## R2 — Atomicidade cross-agent: padrão `*_on_cursor`

**Decisão**: replicar exatamente `agents/kaguya/tools.py::complete_payment_task`. Cada tool de
criação abre `with get_conn() as conn: with conn.cursor() as cur:`, insere o item, e chama
`link_person_on_cursor(cur, person_id, entity_type, entity_id)` para cada pessoa **no mesmo cursor**.
Falha em qualquer passo → `conn.rollback()` explícito → nada persiste. Sucesso → o context manager
de `get_conn()` commita tudo junto na saída.

**Verificado no código**: `agents/nami/tools.py` já expõe `create_transaction_on_cursor(cur, ...)`
(não commita, o chamador controla) — a Onda 2 só acrescenta a chamada ao link logo após o INSERT da
transação, dentro do mesmo `cur`. `agents/db.py::get_conn()` faz commit no sucesso e rollback na
exceção.

**Porquê**: é o padrão atômico já aprovado e testado do repo (SC-003 exige rollback total). Não
inventa transação distribuída nem 2-phase commit — tudo é um único PostgreSQL local.

## R3 — Journal: refator de `upsert_bullet` para link na mesma transação

**Problema descoberto na exploração**: ao contrário de Nami/Kaguya, `agents/journal/tools.py` usa
conexão própria (`_get_conn()`) e **commita internamente** dentro de `upsert_bullet`. Não há um
`_on_cursor` para reaproveitar.

**Decisão**: refatorar `upsert_bullet` para, **na mesma transação** que insere o bullet e
re-sincroniza `journal_mentions`, também gravar `person_links` quando aplicável — antes do
`conn.commit()` único. Não criar uma transação separada (quebraria a atomicidade).

**Regra de auto-link (FR-011)**: depois de extrair as `@menções` (a `journal_mentions` denormalizada
continua intacta), resolver cada menção via `find_people`. Cria `person_links`
(`entity_type='journal_bullet'`, `entity_id=str(bullet_id)`) **apenas quando há match único exato**
por `normalizado`. 0 matches → nenhum link (a string segue só em `journal_mentions`, sem erro). 2+
matches → **não** linka (não há canal conversacional no diário para desambiguar; evita vínculo
errado). Também aceitar `person_ids` explícito (vindo do webapp/agente) que sempre linka.

**Alternativa rejeitada**: auto-criar pessoa a partir de `@menção` desconhecida. Violaria
"smart-match + confirmar" (nunca cria em silêncio) e poluiria a base.

## R4 — Resolução de nomes: `normalizado` + índice único parcial

**Decisão**: coluna `normalizado` (minúsculo + sem acento via `unicodedata.NFD`, padrão do `_norm`
de Frieren) em `people` e `person_aliases`. `find_people(query)` casa `_norm(query)` nas duas
tabelas (UNION) e devolve 0/1/2+ candidatos. Unicidade:
- `people`: índice **único parcial** `UNIQUE (normalizado) WHERE deleted = FALSE` — impede duplicar
  "Ana"/"aná"/"Aná" entre as vivas, mas permite recriar um nome após soft delete.
- `person_aliases`: `UNIQUE (normalizado)` global — um apelido aponta para no máximo uma pessoa.

**Porquê parcial em `people`**: o soft delete mantém a linha; um índice único total impediria
cadastrar de novo um nome que foi excluído. O parcial resolve (SC-002).

**Verificado**: Postgres suporta índice único parcial nativamente; `REGEXP_REPLACE` espelha o
`_norm` Python no lado SQL quando precisar comparar em query (padrão `_norm_sql_col` da Frieren).

## R5 — Komi como agente singleton (sem MCP)

**Decisão**: `komi_agent` é instanciado direto no módulo (singleton), igual Nami/Frieren/Kurisu —
**não** uma factory.

**Porquê**: a factory (`create_kaguya_agent`) só existe porque o `McpToolset` do Calendar instancia
um subprocesso stdio por sessão. A Komi não tem MCP — todas as tools são funções Python locais. Logo
o singleton é suficiente e mais simples (Constraints arquiteturais da constitution).

## R6 — `entity_id` em TEXT e cast por domínio na agregação

**Decisão**: `person_links.entity_id` é TEXT. `get_person_summary` faz um JOIN por `entity_type`
com a tabela de origem, convertendo o tipo na própria query (`entity_id::int` para tasks/bullets do
Journal/Kaguya, comparação direta para os UUID-TEXT de Nami/Frieren). Cada bloco é uma query
independente; bloco sem vínculo retorna lista vazia/zero, nunca erro (SC-005).

**Porquê não normalizar os ids**: mudar os PKs de Kaguya/Journal para UUID seria uma migração
massiva e fora de escopo. TEXT + cast é o ponto de menor atrito.

## R7 — Avatar como URL (sem upload)

**Decisão**: campo `avatar_url` TEXT; a UI cai para iniciais quando vazio (como a tela People da
Violet já faz). Upload de arquivo fica fora da fatia (Assumptions da spec).

---

## Resumo das decisões

| # | Tema | Decisão |
|---|---|---|
| R1 | Modelo de vínculo | `person_links` polimórfica única, sem FK, `entity_id` TEXT |
| R2 | Atomicidade | padrão `*_on_cursor` no mesmo cursor (espelho de `complete_payment_task`) |
| R3 | Journal | refatorar `upsert_bullet` p/ link na mesma transação; auto-link só em match único |
| R4 | Resolução | `normalizado` + índice único parcial (people) e global (aliases) |
| R5 | Agente | singleton sem MCP (padrão Nami/Frieren) |
| R6 | Agregação | `entity_id` TEXT + cast por domínio; bloco vazio sem erro |
| R7 | Avatar | `avatar_url` (sem upload); fallback p/ iniciais |

Nenhuma decisão exige dependência nova nem amendment de constitution.
