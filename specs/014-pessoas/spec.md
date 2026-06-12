# Feature Specification: Pessoas — identidade canônica de pessoas integrada a todos os agentes

**Feature Branch**: `014-pessoas`

**Created**: 2026-06-11

**Status**: Draft

**Input**: User description: "Quero criar uma seção de pessoas. Ela vai se integrar com todas as
outras seções. Posso citá-las no diário, criar uma task linkada a ela na Kaguya, uma transação
'paguei 10 reais para fulano' na Nami, citar em notas na Frieren, tudo isso. Essa seção também vai
ter uma interface só dela, e nela quero colocar várias infos da pessoa e um resumo de tudo que
marquei ela nos outros agents."

**Decisões fechadas no brainstorm** (ver plano em `~/.claude/plans/quero-criar-uma-se-o-polished-toast.md`):
escopo = agente conversacional **+** camada de dados (hub) **+** seção webapp própria; vínculo
**N:N** via tabela junção polimórfica `person_links`; campos do perfil = básicos + relacionamento +
contatos + datas importantes + avatar; página da pessoa = **Dashboard de cards** (um card por
domínio); resolução de nomes = **smart match + confirmar novo** (sem duplicatas silenciosas).

---

## Escopo da fatia

**Entra na 014** (introduz schema novo — `agents/komi/schema_pg.sql`):

- **Identidade canônica** — tabela `people` (UUID em TEXT, padrão Nami/Frieren) com nome,
  `normalizado` (minúsculo + sem acento), relacionamento, contatos (telefone, email, instagram,
  telegram, cidade), `avatar_url`, notas, soft delete. Apelidos (`person_aliases`) e datas
  importantes (`person_dates`).
- **Vínculo polimórfico N:N** — tabela `person_links` (`person_id`, `entity_type`, `entity_id`)
  ligando uma pessoa a qualquer entidade de qualquer domínio (`transaction`, `task`, `book`,
  `journal_bullet`); `entity_id` em TEXT para absorver UUID (Nami/Frieren) e SERIAL int
  (Kaguya/Journal). Um item cita várias pessoas; uma pessoa liga a tudo.
- **Resolução smart match** — `find_people(query)` casa por `normalizado` em `people` **e**
  `person_aliases`; 0 → oferece criar, 1 → liga, 2+ → o agente pergunta qual.
- **Agente Komi** — novo especialista (ADK) roteado pela Makima: criar/editar pessoa, adicionar
  apelido/data, buscar, e gerar o **resumo** conversacional de uma pessoa via Telegram.
- **Integração cross-agent atômica** — `create_transaction` (Nami), `create_task` (Kaguya),
  notas/`add_book` (Frieren) e `upsert_bullet` (Journal) aceitam `person_ids` e gravam
  `person_links` **no mesmo cursor** (padrão de `complete_payment_task`).
- **Hub de agregação** — `get_person_summary(person_id)` junta os vínculos por domínio (finanças,
  tarefas, diário, livros + perfil) numa estrutura única.
- **Webapp** — seção Pessoas própria: grid de pessoas → **página da pessoa** (Layout Dashboard de
  cards) consumindo `get_person_summary`; modal de criar/editar; router `/api/pessoas/*`.

**Fica para depois**: **merge** de pessoas duplicadas pela UI; migrar a tela "People" da Violet
para apontar à identidade canônica (hoje lê `journal_mentions` cru); lembretes proativos de
aniversário via Telegram (depende da fase de lembretes da Kaguya); grafo de relacionamentos
pessoa↔pessoa; importação de contatos do Google. Sem linha do tempo unificada nesta fatia (o
Dashboard de cards entrega o resumo; timeline é evolução futura).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Identidade canônica + agente Komi (Priority: P1)

Cadastro pessoas de verdade no sistema (não mais só strings). Pelo Telegram peço à Komi
"cadastra a Ana Silva, amiga, aniversário 12/03, instagram @anasilva" e ela vira um registro único.
Depois pergunto "quem é a Ana?" / "me dá os dados da Ana" e recebo o perfil. Apelidos ("Aninha", "ana")
resolvem para a mesma pessoa, sem criar duplicata.

**Why this priority**: é a fundação — sem identidade canônica e resolução de nomes, nenhum outro
agente tem a quem se vincular. Entrega valor sozinha (uma agenda de contatos conversacional) e
destrava as US2 e US3.

**Independent Test**: contra um banco com `agents/komi/schema_pg.sql` aplicado, criar uma pessoa
com apelido e data pelo Telegram; `find_people("aninha")` resolver para "Ana Silva" via alias;
criar uma segunda "Ana Costa" e confirmar que `find_people("ana")` retorna **2 matches** (gatilho
de desambiguação), sem duplicar o registro.

**Acceptance Scenarios**:

1. **Given** a agente Komi, **When** peço "cadastra a Ana Silva, amiga, aniversário 12/03",
   **Then** nasce uma linha em `people` (relationship "amigo/amiga") e uma em `person_dates`
   (label "aniversário", 12/03 recorrente).
2. **Given** já existe "Ana Silva" com apelido "Aninha", **When** chamo `find_people("aninha")`,
   **Then** retorna exatamente essa pessoa (match por `person_aliases`).
3. **Given** existem "Ana Silva" e "Ana Costa", **When** chamo `find_people("ana")`, **Then**
   retorna **2 matches** e o agente pergunta qual antes de qualquer vínculo.
4. **Given** a agente Komi, **When** peço "me dá o resumo da Ana", **Then** recebo o perfil
   (nome, relacionamento, contatos, próximas datas) — mesmo sem nenhum vínculo cross-agent ainda.
5. **Given** uma pessoa cadastrada, **When** a excluo, **Then** ela some das buscas (soft delete:
   `deleted = TRUE`), preservando histórico.

---

### User Story 2 - Vincular pessoas a itens dos outros agentes (Priority: P2)

Falo com os agentes que já uso e cito uma pessoa: para a Nami "paguei 10 reais pro Fulano", para a
Kaguya "criar tarefa: devolver o livro pra Ana", para a Frieren "adicionar Duna, indicado pela
Ana", e no diário escrevo "café com a @ana". Em cada caso a pessoa é resolvida (smart match +
confirmar) e o item fica vinculado a ela — inclusive itens com **mais de uma** pessoa ("jantar
dividido com a Ana e o Bruno").

**Why this priority**: é o coração da proposta — transforma a identidade isolada (US1) em algo que
permeia finanças, tarefas, livros e diário. Depende da US1 (resolução + tabela de vínculos).

**Independent Test**: criar uma transação na Nami passando `person_ids` resolvidos e confirmar a
linha em `person_links` (`entity_type='transaction'`) na **mesma** transação SQL; repetir para
task (Kaguya) e bullet de diário com **duas** pessoas; provocar erro no segundo passo e confirmar
rollback total (nada em `transactions` nem em `person_links`).

**Acceptance Scenarios**:

1. **Given** a Nami, **When** digo "paguei 10 pro Fulano" e confirmo criar o Fulano, **Then**
   nascem a transação **e** o `person_links` correspondente, atomicamente (ou ambos, ou nenhum).
2. **Given** a Kaguya, **When** crio "devolver livro pra Ana" e a Ana já existe, **Then** a tarefa
   nasce vinculada à Ana sem perguntar (match único).
3. **Given** um item dividido, **When** registro "jantar com a Ana e o Bruno", **Then** o item
   recebe **dois** `person_links` (Ana e Bruno).
4. **Given** o diário, **When** escrevo um bullet com "@ana" e existe a pessoa Ana, **Then** o
   bullet ganha um `person_links` (`entity_type='journal_bullet'`) **sem** quebrar a
   `journal_mentions` existente.
5. **Given** um nome não cadastrado, **When** cito "paguei pro Joãozinho" e **recuso** criar,
   **Then** a transação é criada **sem** vínculo (o item não é bloqueado por causa do vínculo).
6. **Given** uma criação cross-agent, **When** o segundo passo (o vínculo) falha, **Then** o
   primeiro (a transação/tarefa) também é desfeito — sem estado parcial.

---

### User Story 3 - Página da pessoa: resumo de tudo num lugar só (Priority: P3)

Abro a seção Pessoas no webapp, vejo um grid com todas as pessoas (avatar/iniciais, relacionamento,
nº de vínculos) e clico em uma. A **página da pessoa** mostra o cabeçalho de perfil (avatar,
relacionamento, aniversário, contatos) e quatro cards lado a lado — **Finanças** (saldo + últimas
transações), **Tarefas** (abertas/concluídas), **Diário** (contagem + trechos das menções) e
**Livros** (livros ligados). Crio e edito pessoas (com apelidos e datas) por um modal.

**Why this priority**: é a interface dedicada pedida e o "resumo de tudo que marquei nos outros
agents". Depende da agregação `get_person_summary`, que só é rica depois dos vínculos da US2.

**Independent Test**: com uma pessoa que tem ≥1 transação, ≥1 tarefa, ≥1 menção de diário e ≥1
livro vinculados, abrir `GET /api/pessoas/{id}` e conferir que os quatro blocos vêm populados;
abrir a página no webapp e ver os quatro cards; criar/editar uma pessoa pelo modal e ver a mudança
persistir.

**Acceptance Scenarios**:

1. **Given** a seção Pessoas, **When** abro o grid, **Then** vejo todas as pessoas não-excluídas
   com avatar (ou iniciais), relacionamento e contagem de vínculos.
2. **Given** uma pessoa com vínculos nos quatro domínios, **When** abro sua página, **Then** vejo o
   cabeçalho de perfil + 4 cards (Finanças, Tarefas, Diário, Livros) com os dados de cada domínio.
3. **Given** uma pessoa **sem** vínculos, **When** abro sua página, **Then** os cards aparecem com
   estado vazio (sem erro), e o cabeçalho/perfil continua completo.
4. **Given** o modal de pessoa, **When** crio/edito nome, contatos, apelidos e datas e salvo,
   **Then** a mudança persiste e reaparece ao reabrir.
5. **Given** o webapp, **When** acesso `/api/pessoas/*` sem sessão válida, **Then** recebo 401/403
   (toda rota protegida por `require_user`, como os demais domínios).

---

### Edge Cases

- **Nome só diferindo em caixa/acento** ("Ana" vs "ana" vs "Aná"): tratados como candidatos da
  **mesma** pessoa via `normalizado`; o índice único em `people(normalizado)` evita duplicar e o
  smart match reusa.
- **Apelido que colide com outra pessoa**: `person_aliases.normalizado` é único globalmente — um
  apelido aponta para no máximo uma pessoa; tentativa de reusar um apelido existente para outra
  pessoa é rejeitada com mensagem clara.
- **Citação a pessoa inexistente + recusa de criar**: o item-pai (transação/tarefa/livro/bullet) é
  criado **sem** vínculo; o vínculo nunca bloqueia a criação do item.
- **`@menção` no diário sem pessoa cadastrada**: a `journal_mentions` (denormalizada) continua
  registrando a string como hoje; nenhum `person_links` é criado até existir a pessoa — sem erro.
- **Mesma pessoa citada duas vezes no mesmo item**: `person_links` tem `UNIQUE (person_id,
  entity_type, entity_id)` — o segundo vínculo é idempotente (`ON CONFLICT DO NOTHING`).
- **Excluir uma pessoa com vínculos**: soft delete em `people`; os `person_links` permanecem
  (histórico), mas a pessoa some das buscas/grid; alias e datas seguem o registro.
- **Excluir o item-pai** (uma transação/tarefa): como `person_links` é **polimórfica** (sem FK no
  banco para as tabelas variadas), a remoção do vínculo correspondente é responsabilidade da
  **camada de aplicação** ao deletar o item; vínculos órfãos são ignorados na agregação.
- **`entity_id` de tipos diferentes** (UUID na Nami/Frieren, int serial na Kaguya/Journal):
  armazenado sempre como TEXT; a agregação faz o cast por domínio ao juntar com a tabela de origem.
- **Resumo de pessoa com domínio vazio**: cada card de `get_person_summary` retorna lista vazia /
  zero, nunca erro.

## Requirements *(mandatory)*

### Functional Requirements

**Identidade e dados (US1)**

- **FR-001**: O sistema MUST persistir pessoas em `people` com `id` (UUID em TEXT), `name`,
  `normalizado` (minúsculo + sem acento), `relationship`, contatos (`phone`, `email`, `instagram`,
  `telegram`, `city`), `avatar_url`, `notes`, `created_at`/`updated_at` (`TIMESTAMPTZ DEFAULT NOW()`)
  e `deleted` (soft delete).
- **FR-002**: O sistema MUST suportar **apelidos** (`person_aliases`) e **datas importantes**
  (`person_dates`, com `label`, `date`, `recurring`) por pessoa, removidos em cascade ao excluir a
  pessoa.
- **FR-003**: O sistema MUST oferecer CRUD de pessoa na camada de lógica (`create_person`,
  `update_person`, `delete_person` por soft delete, `add_alias`, `add_important_date`,
  `list_people`), seguindo o padrão `{"status": "ok"|"error", "message": ...}` e usando
  `agents/db.py`.
- **FR-004**: `find_people(query)` MUST casar **case/acento-insensitive** por `normalizado` tanto em
  `people` quanto em `person_aliases`, retornando a lista de candidatos `{id, name, relationship}`.
- **FR-005**: O nome de pessoa MUST ser único por `normalizado` entre as não-excluídas (índice
  único parcial), e cada apelido único globalmente — para impedir duplicatas silenciosas.

**Agente Komi (US1)**

- **FR-006**: O coordinator (Makima) MUST rotear pedidos sobre pessoas/contatos/relacionamentos a um
  novo `komi_agent` (ADK, `gemini-2.5-flash`), registrado em `sub_agents` e descrito em
  `_MAKIMA_INSTRUCTION`; `coordinator/main.py` MUST reconhecer o domínio "pessoas".
- **FR-007**: A `komi_agent` MUST aplicar **smart match + confirmar**: 0 matches → oferece criar;
  1 → usa direto; 2+ → pergunta qual antes de qualquer vínculo — nunca cria duplicata em silêncio.

**Vínculos cross-agent (US2)**

- **FR-008**: O sistema MUST registrar vínculos pessoa↔item em `person_links` (`person_id`,
  `entity_type` ∈ {`transaction`,`task`,`book`,`journal_bullet`}, `entity_id` em TEXT), numa relação
  **N:N**, com `UNIQUE (person_id, entity_type, entity_id)` e escrita idempotente.
- **FR-009**: As tools de criação `create_transaction` (Nami), `create_task` (Kaguya),
  notas/`add_book` (Frieren) e `upsert_bullet` (Journal) MUST aceitar um parâmetro opcional
  `person_ids` e gravar os `person_links` **no mesmo cursor/transação** do item — tudo-ou-nada
  (padrão de `complete_payment_task`).
- **FR-010**: Um item MUST poder vincular **múltiplas** pessoas; e a recusa em criar uma pessoa nova
  NÃO MUST bloquear a criação do item-pai (item criado sem vínculo).
- **FR-011**: A integração com o diário MUST canonizar `@menções` para `person_links` quando a
  pessoa existir, **sem** remover nem quebrar a `journal_mentions` denormalizada atual.

**Hub e webapp (US3)**

- **FR-012**: `get_person_summary(person_id)` MUST retornar uma estrutura única com: perfil
  (`people` + `person_dates`), Finanças (saldo + últimas transações ligadas), Tarefas
  (abertas/concluídas ligadas), Diário (contagem + trechos dos bullets ligados) e Livros (livros
  ligados) — cada bloco resolvendo vazio sem erro.
- **FR-013**: O backend MUST expor `/api/pessoas/*` (FastAPI, bodies Pydantic, `Depends(require_user)`,
  erros via `_check_result`): listar, criar, obter (via `get_person_summary`), editar, excluir, e
  adicionar apelido/data. Registrado em `webapp/backend/main.py` com prefixo `/api/pessoas`.
- **FR-014**: O frontend MUST adicionar a seção Pessoas no padrão Shell (`pages/komi/`): grid de
  pessoas → **página da pessoa** em layout **Dashboard de cards** (cabeçalho de perfil + 4 cards
  por domínio) + modal de criar/editar (com apelidos e datas), CSS isolado com tokens OKLCH.

**Paridade e convenções**

- **FR-015**: A lógica MUST viver na camada única (`agents/komi/tools.py`); Telegram e router
  `/api/pessoas/*` são fachadas finas. Criar/buscar/editar pessoa e ver o resumo MUST estar
  disponíveis pelos dois canais (a *página* visual de cards é webapp-only; o equivalente Telegram é
  o resumo conversacional de `get_person_summary`).

### Key Entities

- **Pessoa** (`people`): identidade canônica; `id` UUID/TEXT, `normalizado` único entre vivas, soft
  delete.
- **Apelido** (`person_aliases`): nomes alternativos que resolvem para uma pessoa; `normalizado`
  único global; cascade na exclusão da pessoa.
- **Data importante** (`person_dates`): `label`, `date`, `recurring`; cascade; alimenta lembretes
  futuros.
- **Vínculo** (`person_links`): junção polimórfica N:N pessoa↔(transação|tarefa|livro|bullet);
  `entity_id` em TEXT; sem FK de banco para as tabelas variadas (integridade na aplicação).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Criar uma pessoa com apelido e resolvê-la por esse apelido funciona ponta-a-ponta:
  `find_people("aninha")` retorna "Ana Silva" — coberto por **teste automatizado**.
- **SC-002**: Pessoas são **case/acento-insensitive sem duplicar**: tentar cadastrar "Ana" e "aná"
  resulta em **uma** linha viva em `people` (índice único em `normalizado`) — coberto por teste.
- **SC-003**: Vincular pessoa a uma transação é **atômico**: forçar falha no passo do vínculo deixa
  **zero** linhas novas em `transactions` **e** em `person_links` — verificável por teste de
  rollback.
- **SC-004**: Um item pode citar **≥ 2 pessoas**: registrar "jantar com a Ana e o Bruno" cria
  exatamente **2** linhas em `person_links` para o mesmo `entity_id` — coberto por teste.
- **SC-005**: `get_person_summary` de uma pessoa com vínculos nos quatro domínios retorna os quatro
  blocos populados; de uma pessoa sem vínculos, retorna os quatro blocos vazios **sem erro** —
  coberto por teste.
- **SC-006**: A página da pessoa (webapp) renderiza o cabeçalho + 4 cards para 0, 1 e vários
  vínculos por domínio, sem quebrar (estados vazios visíveis).
- **SC-007**: 100% das capacidades de gestão de pessoas (criar/buscar/editar/resumo) executáveis
  pelos **dois canais** (Telegram e webapp), com a lógica numa camada única — auditável por
  checklist de paridade.

## Assumptions

- **Single-user** e fuso `America/Sao_Paulo`, como o restante do projeto; sem multiusuário/ACL além
  do `require_user` já existente no webapp.
- **Schema novo**: esta fatia **introduz** `agents/komi/schema_pg.sql` (4 tabelas) e o registra
  em `scripts/setup_schemas.py`; aplicado via container `makima-web` (hostname do Postgres é serviço
  Docker Swarm, não resolvível no host).
- **`person_links` é polimórfica de propósito** (sem FK de banco para tabelas com tipos de id
  diferentes); a limpeza de vínculos ao excluir o item-pai é responsabilidade da camada de
  aplicação, e a agregação ignora vínculos órfãos.
- **ID em TEXT/UUID** para `people` (consistente com Nami/Frieren e cross-domain); `entity_id` em
  TEXT por absorver tanto UUID quanto SERIAL int.
- A captura de pessoas em linguagem natural usa o modelo já configurado (Gemini `gemini-2.5-flash`)
  — nenhum serviço novo.
- **Avatar** é um campo `avatar_url` (sem upload de arquivo nesta fatia); a UI cai para iniciais
  quando ausente, como já faz a tela People da Violet.
- O agente se chama **Komi** (`komi_agent`, de *Komi-san wa Comyushou desu*), seguindo a convenção
  de personagens de anime dos outros agentes; o pacote vive em `agents/komi/`.
- **Merge de duplicatas**, migração da tela People da Violet, lembretes proativos de aniversário,
  grafo pessoa↔pessoa, timeline unificada e import de contatos do Google ficam **fora** desta fatia.

## Ambiguity Report

| Dimension          | Score | Min  | Status | Notes                                            |
|--------------------|-------|------|--------|--------------------------------------------------|
| Goal Clarity       | 0.90  | 0.75 | ✓      | Identidade canônica + vínculos + resumo, medíveis |
| Boundary Clarity   | 0.90  | 0.70 | ✓      | In/out de escopo explícitos                       |
| Constraint Clarity | 0.80  | 0.65 | ✓      | Schema novo, atomicidade, polimorfismo, single-user |
| Acceptance Criteria| 0.85  | 0.70 | ✓      | 7 SCs pass/fail + cenários por US                 |
| **Ambiguity**      | 0.12  | ≤0.20| ✓      | Decisões-chave fechadas no brainstorm             |

---

*Phase: 014-pessoas*
*Spec created: 2026-06-11*
*Next step: discuss-phase / plan-phase — decisões de implementação (schema final, assinaturas das tools, modal e cards da página da pessoa)*
