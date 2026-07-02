# Design: Makima — Personal Assistant com Google ADK

> ⚠️ **Documento histórico (congelado em ~jun/2026).** Ótimo para entender o *porquê* das decisões de arquitetura (batch vs agente, PostgreSQL único, ADK), mas o roadmap e os status daqui **não refletem mais o estado atual** — as fases 015–030 (Akane, Marin, Mai, Komi, Hub, Kanban, Kurisu ativa, Experiments, Metas) foram entregues depois. A fonte da verdade atual é a tabela "Fases de implementação" do `CLAUDE.md` e do `README.md`.

> **Legenda de status:** ✅ ativo · 🔧 estrutura pronta, pendência aberta · ⏳ planejado (spec/design feito, sem código) · 🗄️ legado (substituído, mantido só por histórico)

## Contexto

Os scripts batch deste ecossistema (no repo separado `n8n-python-scripts`) são pipelines lineares: recebem input, chamam o Gemini uma vez, executam lógica Python, escrevem em algum destino. Funcionam bem para automações agendadas, mas não suportam interação conversacional, raciocínio multi-step nem coordenação entre domínios.

Este design introduz o **Google ADK** como camada de agência: um coordenador (**Makima**) que recebe mensagens no Telegram e delega para agentes especialistas, cada um dono de um domínio. Sobre o mesmo banco de dados, um **webapp** (FastAPI + React) oferece uma interface visual — as duas faces (Telegram e web) leem e escrevem os mesmos dados.

> **Nota histórica:** o design original previa BigQuery como armazenamento e TickTick como motor de tarefas. Ambos foram substituídos por **PostgreSQL** (banco único compartilhado). As menções a BigQuery/TickTick neste documento aparecem apenas marcadas como 🗄️ legado.

---

## Princípio central: híbrido batch + agente

Dois modos coexistem:

| Modo | Quando usar | Implementação |
|---|---|---|
| **Batch** | Sync agendado, processamento em volume | Scripts Python no `n8n-python-scripts` (não mudam) |
| **Interativo** | Perguntas e ações sob demanda via Telegram | Makima + agentes ADK (este repo) |
| **Visual** | Navegar/editar dados numa tela | Webapp FastAPI + React (este repo) |

A chave é **não migrar o que já funciona**. Os syncs de anime/spotify/séries continuam como batch no n8n. O ADK adiciona a camada de interação; o webapp adiciona a camada visual. Ambos sobre o mesmo PostgreSQL.

---

## Arquitetura

```
Telegram (usuário)                          Navegador (usuário)
    ↓                                            ↓
coordinator/main.py                         webapp/backend (FastAPI)
(python-telegram-bot, sessões/domínio)      (auth Google OIDC + routers /api/*)
    ↓                                            ↓
coordinator/agent.py = Makima (ADK)         importa as MESMAS tools dos agentes
modelo: gemini-2.5-flash                     (sem ADK/LLM no webapp)
    ├── nami_agent     → finanças            ✅  ┐
    ├── kaguya_agent   → tarefas + agenda    ✅  │
    ├── kurisu_agent   → knowledge (RAG)     🔧  │  todos leem/escrevem o
    ├── frieren_agent  → livros              ✅  │  mesmo PostgreSQL via
    ├── (journal_agent)→ diário (Violet)     🔧  │  agents/db.py
    ├── (lucy_agent)   → email (Gmail)       ⏳  │
    └── (media_agent)  → mídia               ⏳  ┘
                                              │
                          ┌───────────────────┴───────────────────┐
                          ▼                                        ▼
                  PostgreSQL (banco único)                  Vertex AI RAG
                    ├── schema Nami (finanças)              (Kurisu — vault Obsidian)
                    ├── schema Kaguya (tarefas)             corpus pendente
                    ├── schema Frieren (livros)
                    ├── schema Journal (diário)
                    └── sessões ADK (DatabaseSessionService)

mcp_servers/calendar/server.py  → Google Calendar (stdio, usado pela Kaguya)
n8n (hub batch externo)         → syncs de anime/spotify/séries, etc. (não mudam)
```

**Makima não tem tools próprias** — ela só delega. Toda lógica de acesso a APIs/banco fica nas tools dos agentes em `agents/`.

---

## Componentes

### Coordinator — Makima ✅

Bot Telegram autônomo com ADK. Roda como processo persistente no Docker (`coordinator/main.py`).

- **Nome/persona:** `name="makima"`, sempre responde começando com `Makima:`. Tom calmo, preciso, levemente superior. Formatação HTML (Telegram), nunca markdown.
- **Modelo:** `gemini-2.5-flash` (todos os agentes).
- **Sub-agentes ativos:** `nami_agent`, `kaguya_agent` (via factory `create_kaguya_agent()`), `kurisu_agent`, `frieren_agent`. Comentados (ainda não existem): `lucy_agent`, `media_agent`.
- **Sessão:** uma por `chat_id` **e domínio** — `session_id = f"{chat_id}_{domain}"` (domínios: financas, livros, tarefas, knowledge, geral). `DatabaseSessionService` persistido em PostgreSQL — histórico sobrevive a reinícios. `DATABASE_URL` com prefixo `postgresql://` é normalizado para `postgresql+asyncpg://` (driver async exigido pelo ADK).
- **Classificação de domínio:** `_classify_domain(text)` por keyword — sem custo de LLM.
- **Comandos:** `/tokens` (uso por domínio), `/limpar [domínio]` (zera sessão), `/criar_conta`, `/criar_cartao` (wizards que chamam tools da Nami direto).
- **Menu interativo de livros:** botões inline (callbacks `fm_*`) e capa via `send_photo`, processados em `coordinator/main.py`.
- **Aviso de tokens:** ≥80K tokens num domínio dispara aviso antes da resposta.

Detalhes de infraestrutura, env vars e MCP: `coordinator/CLAUDE.md`.

```
coordinator/
├── main.py          # Telegram bot loop + sessões + comandos + menu inline
├── agent.py         # Makima (Agent ADK) + sub_agents
├── Dockerfile
└── CLAUDE.md
```

---

### Acessor PostgreSQL unificado — `agents/db.py` ✅

Todos os agentes que usam banco (Nami, Kaguya, Frieren, Journal) falam com o PostgreSQL pelo mesmo módulo, evitando código de conexão duplicado.

- `_get_dsn()` — normaliza `DATABASE_URL` removendo variantes de driver (`+asyncpg`, `+pg8000`, `+aiopg`) para uso com `psycopg2` síncrono.
- `get_conn()` — context manager com commit/rollback automático.
- `run_select(sql, params) -> list[dict]` — query de leitura, já normaliza `NUMERIC → float`.
- `run_dml(sql, params) -> int` — insert/update/delete, retorna rowcount.

É o que torna o cross-agent atômico possível (Kaguya completa tarefa + lança despesa da Nami numa só transação).

---

### Webapp — `webapp/` ✅

Painel web (SPA) sobre o **mesmo PostgreSQL** que o bot usa. **Duas faces do mesmo dado:** o que você edita na web aparece no Telegram e vice-versa, porque o webapp **importa as tools dos agentes diretamente como funções** (sem ADK, sem LLM).

- **Backend:** Python 3.12 + FastAPI + uvicorn. Auth Google OIDC (Authlib + cookie assinado com `itsdangerous`). Um router por domínio:
  - `auth.py` — `/auth/login`, `/auth/callback`, `/auth/logout`, `/auth/me`
  - `finances.py` — `/api/finances/*` (tools da Nami)
  - `books.py` — `/api/books/*` (tools da Frieren)
  - `journal.py` — `/api/journal/*` (tools do Journal/Violet)
  - `tasks.py` — `/api/tasks/*` (tools da Kaguya: tarefas, projetos, tags, filtros, calendário, hábitos)
- **Frontend:** React 19 + TypeScript + Tailwind + Vite, servido como estático pelo FastAPI em produção. Um "shell" por domínio: `pages/nami/`, `pages/frieren/`, `pages/violet/`, `pages/kaguya/`.

Detalhes: `webapp/CLAUDE.md`, `webapp/README.md`, `webapp/PLAN.md`.

---

### Padrão de cada agente especialista

> **Nota de arquitetura:** `makima_personal_agent` e `n8n-python-scripts` são **independentes**. Os agentes ADK vivem **dentro do makima** (em `agents/<dominio>/`) e usam os scripts batch do `n8n-python-scripts` apenas como **referência** de como falar com cada API. Nada é importado entre repos — IDs/schemas são copiados.

Cada agente (em `agents/<dominio>/`) tem tipicamente:
- `tools.py` (+ `tools_*.py` quando a lógica é grande) — funções de acesso a banco/API via `agents/db.py`
- `agent.py` — definição ADK usando as tools
- `schema_pg.sql` — schema PostgreSQL do domínio
- `CLAUDE.md` — tools, schema, personalidade

---

## Agentes por domínio

Nomes inspirados em personagens de anime/mangá.

---

**Nami** — Finanças ✅
- Inspiração: Nami de One Piece (tesoureira obcecada por dinheiro). Começa com `Nami:`, dramática, reclama de gastos e celebra receitas.
- Domínio: finanças pessoais.
- **Fonte: PostgreSQL** (`agents/nami/schema_pg.sql`). 🗄️ `schema.sql` (BigQuery) é legado.
- Famílias de tools (~32 no total):
  - Transações: `create_transaction`, `query_expenses`, `update_transaction`, `delete_transaction`, `get_spending_summary`, `get_spending_trend`
  - Assinaturas: `create_subscription`, `list_subscriptions`, `update_subscription`
  - Contas: `create_account`, `list_accounts`, `get_account_balance`
  - Parcelas: `create_installment`, `list_installments`, `get_future_commitments`
  - Cartões: `register_credit_card`, `get_card_debt_summary`, `register_card_payment`, `simulate_debt_payoff`
  - Empréstimos: `register_loan`, `list_loans`, `get_loan_balance`, `compare_payoff_priority`
  - Orçamentos: `set_budget`, `get_budget_status`, `check_category_budget`
  - Saúde financeira: `get_financial_health_score`
- Tipo: singleton. Tools divididas em `tools.py`, `tools_accounts.py`, `tools_credit_cards.py`, `tools_installments.py`, `tools_loans.py`, `tools_budgets.py`, `tools_health.py`.
- Localização: `agents/nami/` — detalhes em `agents/nami/CLAUDE.md`.

---

**Kaguya Shinomiya** — Tarefas + Agenda ✅
- Inspiração: Kaguya-sama (aristocrática e organizada). Começa com `Kaguya:`, levemente condescendente.
- Domínio: tarefas, subtarefas, projetos/listas, colunas Kanban, recorrência, tags, smart-lists, hábitos, e Google Calendar.
- **Fonte: PostgreSQL próprio** (`agents/kaguya/schema_tasks_pg.sql`). 🗄️ TickTick foi **aposentado** (spec 011); `mcp_servers/ticktick/` está vazio.
- Camada de lógica dividida:
  - `tools_tasks.py` — CRUD de tarefas/subtarefas + posições
  - `tools_projects.py` — listas, grupos, colunas (Kanban)
  - `tools_tags.py` — tags N:N (fatia 013)
  - `tools_filters.py` — smart-lists via DSL (fatia 013)
  - `tools_calendar.py` — consultas por intervalo + projeção virtual de ocorrências recorrentes (fatia 013)
  - `tools_habits.py` — hábitos + check-ins (fatia 014)
  - `recurrence.py` — motor puro de recorrência (RRULE, fatia 012)
  - `habit_strength.py` — cálculo puro da "força" do hábito (modelo "caixa d'água"/EMA)
  - `tools.py` — fachada que re-exporta tudo + **cross-agent atômico com a Nami**
- **Cross-agent atômico:** `complete_payment_task` (completa a tarefa **e** lança a despesa da Nami na mesma transação PostgreSQL) e `create_expense_reminder`.
- **Calendar:** via `mcp_servers/calendar/server.py` (MCP stdio). Lê todos os calendários, escreve só no principal. Por isso Kaguya é uma **factory** (`create_kaguya_agent()`) — o `McpToolset` não pode ser compartilhado entre instâncias.
- Localização: `agents/kaguya/` — detalhes em `agents/kaguya/CLAUDE.md`.

---

**Makise Kurisu** — Knowledge Base 🔧
- Inspiração: Kurisu de Steins;Gate (neurocientista direta). Modos Tutora (`Kurisu:`) e Amiga.
- Domínio: base de conhecimento pessoal (vault Obsidian).
- **Fonte: Vertex AI RAG** — tool única `buscar_no_vault` (wrapper de `VertexAiRagRetrieval`, `similarity_top_k=5`). Não usa PostgreSQL.
- **Pendência:** o corpus precisa ser criado no Vertex AI e `VERTEX_RAG_CORPUS` configurado. O agente já está importado e funcional; falta indexar o vault (ver "Knowledge" abaixo e `agents/kurisu/CLAUDE.md`).
- Localização: `agents/kurisu/`.

---

**Frieren** — Livros ✅
- Inspiração: Frieren: Beyond Journey's End (maga milenar, contemplativa). Começa com `Frieren:`.
- Domínio: livros e leitura.
- **Fonte: PostgreSQL** (`agents/frieren/schema_pg.sql`: `books`, `reading_logs`) + **Google Books API** (metadados: capa, ISBN, páginas, autor). 🗄️ `schema.sql` (BigQuery) é legado.
- Tools (12): `search_book`, `add_book`, `log_reading`, `get_current_reading`, `get_reading_list`, `finish_book`, `update_book_status`, `update_book_pages`, `delete_book`, `delete_reading_log`, `get_reading_stats`, `get_book_history`, `get_book_menu_data` (JSON para o menu inline).
- **Menu interativo Telegram:** botões inline (avaliar, status, nota, marcar como lido) + capa via `send_photo`.
- Tipo: singleton. Localização: `agents/frieren/` — detalhes em `agents/frieren/CLAUDE.md`.

---

**Violet** — Diário (Journal) 🔧
- Domínio: diário em bullets, com tipos de bullet, menções `@pessoa`/`#tag`, emoções (modelo TCC), heatmap, favoritos, busca full-text.
- **Fonte: PostgreSQL** — tabelas `journal_types`, `journal_pages` (única por data), `journal_bullets` (com `TSVECTOR` gerado para busca), `journal_mentions`, `journal_emotions`, `journal_emotion_logs`.
- Tools (14): páginas/bullets (`get_or_create_page`, `upsert_bullet`, `delete_bullet`, `list_heatmap`, `list_favorite_days`), menções (`list_mentions`, `get_bullets_by_mention`), busca (`search_bullets`), emoções (`list_emotions`, `create_emotion`, `list_emotion_logs`, `create_emotion_log`, `update_emotion_log`, `delete_emotion_log`, `get_emotion_stats`).
- **Status:** já é **totalmente usável via webapp** (`/api/journal/*`, shell `pages/violet/`). Como **agente Telegram, ainda não está ligado:** existe `tools.py`, mas falta `agent.py` e o wiring no `coordinator/agent.py`.
- Localização: `agents/journal/` — `agents/journal/CLAUDE.md`.

---

**Akane Kurokawa** — Filmes ⏳ (spec 015, sem código)
- Inspiração: Akane de Oshi no Ko. Substitui o antigo "media_agent / Marin".
- Domínio: filmes, experiência tipo **Letterboxd** — catálogo (metadados TMDB), diário de sessões (com rewatches), watchlist, notas/avaliações, listas, tags, vault de conteúdos, rewind anual, estatísticas.
- **Fonte planejada: PostgreSQL** (7 tabelas, `agents/akane/schema_pg.sql`) + **TMDB** (metadados/poster) + **Letterboxd** (sync RSS + import CSV).
- Estratégia **webapp-first**: primeiro a seção `pages/akane/` + router `webapp/backend/routers/movies.py`, depois o agente ADK no Telegram. Design handoff completo em `specs/015-akane-filmes/`.
- Localização futura: `agents/akane/` + `webapp/.../akane/` + `scripts/sync_letterboxd.py` / `import_letterboxd_csv.py`.

---

**Komi** — Pessoas (identidade canônica) ⏳ (spec 014, sem código)
- Domínio: **identidade canônica de pessoas** que amarra todos os agentes. Hoje "pessoas" são strings soltas (descrições de transações na Nami, `@menções` no diário, autores na Frieren). A spec introduz uma tabela `people` (+ `person_aliases`, `person_dates`) e uma tabela polimórfica `person_links` (person_id × entity_type × entity_id) ligando uma pessoa a transações, tarefas, livros, bullets de diário e filmes.
- Três ondas: (1) schema + agente Komi (CRUD + smart-match `find_people`); (2) integração — `create_transaction`/`create_task`/`add_book`/`upsert_bullet` aceitam `person_ids[]` e gravam os `person_links` na mesma transação; (3) seção webapp (grid de pessoas → dashboard por pessoa).
- Localização futura: `agents/komi/` + `webapp/backend/routers/pessoas.py`. Spec/plan em `specs/014-pessoas/`.

---

**Lucy** — Email ⏳ (planejado, sem código)
- Inspiração: Lucy de Elfen Lied — triagem clínica e implacável. Começa com `Lucy:`, tom frio e direto.
- Domínio: Gmail (listar, buscar, ler, marcar como lido, arquivar, label, responder, rascunho).
- **Fonte planejada: Gmail API v1** via `google-api-python-client` (não IMAP) — OAuth2 igual ao Calendar; script `scripts/authorize_gmail.py`.
- Referência de implementação: `n8n-python-scripts/lucy_email_agent/main.py` (digest batch diário continua independente).
- Localização futura: `agents/lucy/`. Não existe ainda — só o import comentado no coordinator.

---

**Futuros de baixa prioridade**
- **Misato** (Evangelion) — trabalho/projetos: GitHub (PRs, issues) + projetos. Escopo a definir. `agents/misato/`.
- **Spotify** (Kaori/Bocchi, nome a definir) — música: track atual + histórico de audição + top artistas/faixas. Fonte: Spotify Web API + histórico já existente em batch. `agents/spotify/`.
- **Games** — backlog/progresso de jogos. Fontes candidatas (IGDB, HowLongToBeat) e personagem a definir. `agents/games/`.
- **Mídia (séries + anime)** — o slot de mídia além de filmes; séries/anime hoje vivem só nos syncs batch do n8n.

---

## Knowledge (Obsidian) — Vertex AI RAG 🔧

Camada de acesso à base de conhecimento pessoal do Obsidian, usada pelo Kurisu.

**Pipeline:**
```
Obsidian vault (local) → Google Drive (já sincronizado)
    → Vertex AI Agent Builder (Data Store: chunking + embeddings + índice)
    → Kurisu (VertexAiRagRetrieval) → resposta sintetizada pelo Gemini
```

O vault já está no Google Drive, o que elimina a camada de sync — o Vertex AI suporta Drive como fonte nativa e reindexa quando os arquivos mudam.

**Integração ADK** (já no código do Kurisu):
```python
from google.adk.tools import VertexAiRagRetrieval

knowledge_tool = VertexAiRagRetrieval(
    rag_corpus="projects/<projeto>/locations/us-central1/ragCorpora/<id>",
    similarity_top_k=5,
)
```

**Pendência (🔧):** criar o Data Store no Vertex AI Agent Builder e setar `VERTEX_RAG_CORPUS`. Checklist em `agents/kurisu/CLAUDE.md`.

**Estrutura ideal das notas para RAG** (a busca enxerga os arquivos "planos" — pastas não importam):
1. **YAML frontmatter** com `title`, `tags`, `date`, `status`, `tipo` — vira filtro.
2. **Headings (`##`/`###`)** para chunking inteligente — separe seções (`## Conceito`, `## Aplicações`).
3. **Notas atômicas** — um arquivo = um assunto.
4. **Títulos de arquivo descritivos** — pesam alto na relevância.
5. **Links `[[ ]]` não são navegados** — cada nota precisa fazer sentido sozinha.

**Plano B (🗄️ se o custo do Vertex incomodar):** ChromaDB self-hosted no VPS. A API de busca seria idêntica — trocar a implementação de `search_knowledge` sem tocar no coordinator.

---

## Morning Briefing ⏳ (fase futura)

Síntese diária de todos os domínios, acionada pelo comando `/briefing` no Telegram (ou pelo n8n às 8h, que envia `/briefing` via Telegram API).

O `coordinator/main.py` detecta o comando e injeta um prompt estruturado no runner do ADK; Makima orquestra os sub-agentes ativos em sequência e devolve um bloco HTML consolidado:

```
Faça o morning briefing. Consulte em sequência:
1. Nami:   gastos de ontem + projeção do mês
2. Kaguya: tarefas de hoje + atrasadas
3. Violet: registro do dia (quando ativa)
4. Frieren: progresso do livro atual
5. Akane:  o que assistiu/quer assistir (quando ativa)
Apresente seção por seção em HTML conciso.
```

**Dependências:** todos os outros agentes ativos. Implementar por último.

---

## Dependências

```
google-adk               # Agent, InMemoryRunner, McpToolset, VertexAiRagRetrieval
python-telegram-bot      # bot Telegram
psycopg2-binary          # driver PostgreSQL síncrono (Nami, Kaguya, Frieren, Journal)
google-cloud-storage     # backup automático do PostgreSQL para GCS
requests                 # HTTP às APIs externas (Google Books, etc.)
mcp[cli]                 # FastMCP — servidor MCP do Google Calendar
google-auth / -oauthlib  # OAuth do Google Calendar (e futuramente Gmail)
google-api-python-client # cliente Google Calendar API v3
fastapi / uvicorn        # webapp backend
authlib / itsdangerous   # auth Google OIDC + cookie assinado (webapp)
```

---

## Roadmap / Ordem de implementação

| Fase | Item | Domínio | Status |
|------|------|---------|--------|
| 1 | **Nami** | Finanças (PostgreSQL) | ✅ |
| 2 | **Kaguya** | Tarefas + Calendar (motor próprio PostgreSQL + MCP) | ✅ |
| 2.x | Kaguya — fatia 012 (recorrência), 013 (tags/smart-lists/calendário), 014 (hábitos) | Tarefas | ✅ |
| 3 | **Kurisu** | Knowledge base (Vertex AI RAG) | 🔧 corpus pendente |
| 5a | **Frieren** | Livros (PostgreSQL + Google Books) | ✅ |
| — | **Webapp** | Painel FastAPI + React (finanças, livros, diário, tarefas) | ✅ |
| — | **Violet/Journal** | Diário — web pronto; **falta ligar no Telegram** (`agent.py` + wiring) | 🔧 |
| 016 | Kaguya — Meu Dia + time-blocking (estilo Sunsama) | Tarefas | ⏳ |
| 017 | Kaguya — Matriz de Eisenhower (view derivada) | Tarefas | ⏳ |
| 018 | Kaguya — Command Palette ⌘K + atalhos + recorrência no quick-add | Tarefas | ⏳ |
| 019 | Kaguya — Calendar Hub (Day/Week/Month, 2-way Google sync) | Tarefas | ⏳ |
| 014 | **Komi** — Pessoas (identidade canônica cross-agent) | Pessoas | ⏳ spec |
| 015 | **Akane** — Filmes (Letterboxd-style, webapp-first) | Filmes | ⏳ spec |
| 4 | **Lucy** — Email (Gmail API v1) | Email | ⏳ |
| 6 | **Morning Briefing** (`/briefing`) | Cross-domínio | ⏳ |
| — | Misato (trabalho), Spotify, Games, séries/anime | Vários | ⏳ backlog |

### Próximos passos concretos
1. **Kurisu:** criar Data Store no Vertex AI e setar `VERTEX_RAG_CORPUS`.
2. **Violet:** escrever `agents/journal/agent.py` e adicionar ao `sub_agents` do coordinator.
3. **Tarefas:** implementar as fatias 016 → 017 → 018 → 019 (specs prontas em `specs/`).
4. **Novos domínios:** Komi (014) e Akane (015) — começar pela parte webapp + schema.

---

## Verificação

**Nami / Kaguya / Frieren (Telegram):** enviar mensagens no bot que acionem cada domínio e conferir a resposta + persistência no PostgreSQL.

```bash
# Conferir dados direto no banco (de dentro do container makima-web — ver CLAUDE.md):
docker exec makima-web sh -c "cd /app && python -c \"from agents.db import run_select; print(run_select('SELECT count(*) FROM ...', ()))\""
```

**Sessão por domínio:** segunda mensagem no mesmo domínio deve referenciar a primeira; `/limpar <domínio>` zera só aquele domínio.

**Webapp:** logar via Google OIDC e conferir que uma edição na web (ex.: concluir tarefa) aparece no Telegram e vice-versa.

**Cross-agent atômico (Kaguya + Nami):** `complete_payment_task` deve completar a tarefa **e** lançar a despesa — ou nada, em caso de falha (tudo-ou-nada).

---

## Decisões em aberto / resolvidas

- **Persistência de sessão:** ✅ resolvido — `DatabaseSessionService` em PostgreSQL. Sessões sobrevivem a reinícios. `DATABASE_URL` normalizado de `postgresql://` para `postgresql+asyncpg://`.
- **Armazenamento:** ✅ resolvido — PostgreSQL único compartilhado via `agents/db.py` (BigQuery aposentado).
- **Motor de tarefas:** ✅ resolvido — próprio em PostgreSQL (TickTick aposentado, spec 011).
- **Modelo:** `gemini-2.5-flash` para todos os agentes. Pode escalar o coordinator para um modelo Pro se precisar de raciocínio mais complexo.
- **Autenticação do coordinator:** exposto só na rede interna do Docker — sem auth própria. O webapp tem auth Google OIDC.
- **Parallel tool calls:** o ADK suporta, mas requer configuração explícita — considerar para o morning briefing (consultar agentes em paralelo).
