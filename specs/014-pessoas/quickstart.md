# Quickstart — Validação end-to-end: Pessoas (014-pessoas)

Guia de verificação manual + automatizada, organizado pelas ondas e amarrado aos Success Criteria
(SC-001..SC-007) da `spec.md`.

---

## 0. Pré-requisitos

```bash
# Local: venv do makima ativa, DATABASE_URL apontando para um Postgres de teste
export DATABASE_URL="postgresql://postgres:test@localhost:55432/makima_test"
```

## 1. Aplicar o schema novo

No VPS o hostname do Postgres é serviço Docker Swarm (não resolve no host) — rodar **dentro do
container** `makima-web`:

```bash
# VPS
docker exec makima-web sh -c "cd /app && python -m scripts.setup_schemas"
# Local (DATABASE_URL apontando p/ Postgres acessível)
python -m scripts.setup_schemas
```

**Esperado**: as 4 tabelas criadas (`people`, `person_aliases`, `person_dates`, `person_links`),
com o índice único parcial em `people(normalizado) WHERE deleted = FALSE`.

```sql
\dt   -- deve listar as 4 tabelas
\d+ people   -- conferir idx_people_normalizado_vivo (UNIQUE, parcial)
```

## 2. Testes automatizados

```bash
# Onda 1 — identidade
pytest tests/agents/test_komi.py -v
# Onda 2 — vínculos cross-agent
pytest tests/agents/test_komi_links.py -v
```

Cobertura esperada:
- **SC-001** `find_people("aninha")` → "Ana Silva" (via alias).
- **SC-002** cadastrar "Ana" e "aná" → **1** linha viva (índice único `normalizado`).
- **SC-003** forçar falha no passo do vínculo → **0** linhas novas em `transactions` **e**
  `person_links` (rollback total).
- **SC-004** "jantar com a Ana e o Bruno" → exatamente **2** `person_links` p/ o mesmo `entity_id`.
- **SC-005** `get_person_summary` retorna 4 blocos populados (com vínculos) e 4 blocos vazios sem
  erro (sem vínculos).

---

## 3. Onda 1 (US1) — Telegram: identidade + Komi

| Passo | Mensagem ao bot | Esperado |
|---|---|---|
| Criar | "cadastra a Ana Silva, amiga, aniversário 12/03, instagram @anasilva" | 1 linha em `people` (relationship amiga) + 1 em `person_dates` (label "aniversário", recorrente) |
| Apelido | "o apelido da Ana é Aninha" | linha em `person_aliases` |
| Resolver | (interno) `find_people("aninha")` | retorna Ana Silva |
| Resumo | "me dá o resumo da Ana" | perfil (nome, relacionamento, contatos, próximas datas) — mesmo sem vínculos |
| Desambiguação | cadastrar "Ana Costa"; depois "fala da ana" | Komi pergunta **qual Ana** (2 matches) antes de qualquer ação |
| Excluir | "apaga a Ana Costa" | some das buscas (soft delete), histórico preservado |

## 4. Onda 2 (US2) — vínculos cross-agent atômicos

| Passo | Canal/Mensagem | Esperado |
|---|---|---|
| Nami + novo | "paguei 10 reais pro Fulano" → confirmar criar Fulano | transação **e** `person_links` (`transaction`) na mesma transação SQL |
| Kaguya + existente | "criar tarefa: devolver o livro pra Ana" (Ana única) | tarefa nasce vinculada à Ana sem perguntar |
| Item dividido | "jantar com a Ana e o Bruno" | item com **2** `person_links` |
| Diário | bullet "café com a @ana" (Ana existe) | `person_links` (`journal_bullet`) + `journal_mentions` intacta |
| Diário sem pessoa | bullet "@joaozinho" (não cadastrado) | nenhum `person_links`, `journal_mentions` registra a string, sem erro |
| Recusa | "paguei pro Joãozinho" → **recuso** criar | transação criada **sem** vínculo (item não bloqueado) |
| Rollback | forçar erro no vínculo (teste) | nada persiste em `transactions` nem `person_links` |
| Idempotência | citar a mesma pessoa 2× no mesmo item | 1 só `person_links` (ON CONFLICT DO NOTHING) |

## 5. Onda 3 (US3) — webapp: página da pessoa

```bash
# build do frontend
cd webapp/frontend && npm run build
# backend (local)
uvicorn webapp.backend.main:app --reload --port 8080
```

| Passo | Ação | Esperado (SC) |
|---|---|---|
| Auth | `curl /api/pessoas/` **sem** cookie | 401/403 (SC-005 c5) |
| Grid | abrir seção Pessoas | todas as vivas com avatar/iniciais, relationship, nº de vínculos (SC-006) |
| Página cheia | abrir pessoa com vínculo nos 4 domínios | cabeçalho de perfil + 4 cards (Finanças, Tarefas, Diário, Livros) populados |
| Página vazia | abrir pessoa **sem** vínculos | 4 cards em estado vazio, sem erro; perfil completo (SC-006) |
| Modal | criar/editar nome, contatos, apelidos, datas e salvar | persiste e reaparece ao reabrir |
| API direta | `GET /api/pessoas/{id}` (com vínculos) | 4 blocos populados (SC-005) |

## 6. Paridade de canais (SC-007)

Checklist: **criar / buscar / editar / resumo** de pessoa funcionam tanto pelo **Telegram** (Komi)
quanto pelo **webapp** (`/api/pessoas/*`), com a lógica vivendo só em `agents/komi/tools.py`. A
página visual de cards é webapp-only; o equivalente Telegram é o resumo conversacional de
`get_person_summary`.

---

## Definition of Done da fatia

- [ ] `scripts.setup_schemas` cria as 4 tabelas no container `makima-web`.
- [ ] `test_komi.py` e `test_komi_links.py` passam (SC-001..SC-005).
- [ ] Komi roteada pela Makima; domínio "pessoas" reconhecido no `coordinator/main.py`.
- [ ] `person_ids` integrado e atômico em Nami, Kaguya, Frieren e Journal.
- [ ] Seção Pessoas no webapp (grid + página de 4 cards + modal) com acento lavanda em `.km-app`.
- [ ] `agents/komi/CLAUDE.md` documenta tools, schema, smart-match e cross-agent.
- [ ] CLAUDE.md raiz: tabela de agentes atualizada com Komi (Fase de Pessoas).
