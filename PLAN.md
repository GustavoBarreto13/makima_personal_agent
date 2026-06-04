# Design: Personal Assistant com Google ADK

## Contexto

Os scripts deste repo hoje são pipelines lineares: recebem input, chamam o Gemini uma vez, executam lógica Python, escrevem em Notion/BQ. Funcionam bem para automações batch agendadas, mas não suportam interação conversacional, raciocínio multi-step nem coordenação entre domínios.

Este design introduz o **Google ADK** como camada de agência sobre os scripts existentes — sem reescrever o que funciona, adicionando o que falta.

---

## Princípio central: híbrido batch + agente

Dois modos coexistem:

| Modo | Quando usar | Custo | Implementação |
|---|---|---|---|
| **Batch** | Sync agendado, processamento em volume | ~$0.003/exec | Script Python direto (atual) |
| **Interativo** | Perguntas e ações sob demanda via Telegram | ~$0.002–0.01/query | ADK Agent |

A chave é **não migrar o que já funciona**. O digest diário do Lucy, os syncs de anime/spotify/séries — continuam como estão. O ADK adiciona uma camada de interação em cima.

---

## Arquitetura

```
Telegram (usuário)
    ↓
Coordinator Bot (Python persistente no VPS)
    ├── Nami Agent      → BigQuery (finanças)                        ✅ ativo
    ├── Kaguya Agent    → TickTick via MCP + Google Calendar via MCP ✅ ativo
    ├── Kurisu Agent    → Vertex AI RAG (vault Obsidian via Drive)   🔧 estrutura criada, corpus pendente
    ├── Frieren Agent   → BigQuery + Google Books API (livros)       ✅ ativo
    ├── Lucy Agent      → Gmail API v1                               — fase 4
    └── Media Agent     → Notion (séries + filmes + anime)           — fase 5b

n8n (continua como hub de automações batch)
    ├── Schedule 8h → lucy/main.py (digest diário, não muda)
    ├── Schedule 8h → coordinator /briefing (morning briefing unificado)
    ├── anime_sync, mal_sync, spotify_sync, series_sync, etc. (não mudam)
    └── GitHub Sync webhook (não muda)

BigQuery
    ├── spotify.streaming_history           (já existe)
    ├── nami_finance_agent.*                (Nami — finanças)
    ├── frieren_books_agent.books           (Frieren — catálogo de livros)
    ├── frieren_books_agent.reading_logs    (Frieren — sessões de leitura)
    ├── media.series_history                (espelho futuro — Fase 5b)
    ├── media.movies_history                (espelho futuro — Fase 5b)
    ├── media.anime_history                 (espelho futuro — Fase 5b)
    └── coordinator.action_logs             (futuro — observabilidade)
```

---

## Componentes

### Coordinator (novo)

Bot Telegram autônomo com ADK. Roda como processo persistente no Docker.

**Não usa n8n para mensagens interativas** — registra seu próprio webhook Telegram e responde diretamente. N8n ainda chama o coordinator via HTTP para o briefing matinal.

```python
coordinator = Agent(
    name="coordinator",
    model="gemini-2.0-flash",
    instruction="""
        Você é um assistente pessoal. Delegue para os especialistas:
        - Nami: finanças e transações no Notion
        - Lucy: emails e Gmail
        - Tasks: tarefas no TickTick/Notion
        - Media: séries, filmes e anime
        - Books: livros
        Combine agentes quando necessário. Responda em português. Seja direto.
    """,
    sub_agents=[nami_agent, kaguya_agent, kurisu_agent, frieren_agent]
    # lucy_agent e media_agent adicionados nas fases 4 e 5b
)
```

**Sessão**: uma por `chat_id` do Telegram, `DatabaseSessionService` persistida em PostgreSQL externo (gerenciado pelo Dokploy). O histórico sobrevive a reinícios de container. `DATABASE_URL` com prefixo `postgresql://` é normalizado automaticamente para `postgresql+asyncpg://` (driver async exigido pelo ADK).

**Estrutura de arquivos:**
```
coordinator/
├── main.py          # Telegram bot loop (python-telegram-bot)
├── agent.py         # ADK coordinator + sub_agents
├── Dockerfile
└── CLAUDE.md
```

---

### Padrão de cada agente especialista

> **Nota de arquitetura:** os repositórios `makima_personal_agent` e `n8n-python-scripts`
> são **independentes**. Os agentes ADK vivem **dentro do makima** (em `agents/<dominio>/`),
> e usam o `main.py` batch do `n8n-python-scripts` apenas como **referência** de como falar
> com cada API. Nada é importado de um repo para o outro — IDs/schemas são copiados.

Cada agente (em `agents/<dominio>/`) tem:
- `tools.py` — funções de acesso à API (modeladas a partir do `main.py` de referência)
- `agent.py` — definição ADK usando as tools

O `main.py` original no `n8n-python-scripts` **não muda** — continua sendo chamado pelo n8n para batch.

```
makima_personal_agent/agents/
├── nami/
│   ├── tools.py    # create_transaction, query_expenses, update, delete
│   └── agent.py    # nami_agent = Agent(tools=[...])
└── lucy/
    ├── tools.py    # fetch_emails, label_and_archive, search_emails
    └── agent.py    # lucy_agent = Agent(tools=[...])

n8n-python-scripts/   (apenas referência — não importado)
├── nami_finance_agent/main.py   # batch via n8n
└── lucy_email_agent/main.py     # digest diário via n8n
```

---

### Agentes por domínio

Os nomes dos agentes são inspirados em personagens de anime/mangá. Cada agente é um pacote
independente em `agents/<dominio>/`.

---

**Nami** — Finance Agent ✅ Fase 1 concluída
- Inspiração: Nami de One Piece (tesoureira obcecada por dinheiro)
- Domínio: finanças pessoais
- Tools: `create_transaction`, `query_expenses`, `update_transaction`, `delete_transaction`
- Fonte: BigQuery (tabelas de transações financeiras)
- Localização: `agents/nami/`

**Kaguya Shinomiya** — Tasks + Calendar Agent ✅ Fase 2 concluída
- Inspiração: Kaguya Shinomiya de Kaguya-sama (aristocrática e organizada)
- Domínio: tarefas e agenda
- Tools: tools genéricas do TickTick via MCP + Google Calendar via MCP + tools cross-agent
  (`complete_payment_task`, `create_expense_reminder`)
- Fontes: TickTick API (MCP stdio) + Google Calendar API (MCP stdio)
- Localização: `agents/kaguya/` + `mcp_servers/ticktick/` + `mcp_servers/calendar/`

**Makise Kurisu** — Knowledge Base Agent 🔧 Fase 3 (estrutura criada, corpus pendente)
- Inspiração: Kurisu Makise de Steins;Gate (neurocientista prodígio e direta)
- Domínio: base de conhecimento pessoal (vault Obsidian)
- Tool: `VertexAiRagRetrieval` — busca semântica no vault indexado pelo Vertex AI
- Fonte: Google Drive (vault Obsidian sincronizado) → Vertex AI Agent Builder → RAG corpus
- Localização: `agents/kurisu/`
- Próximo passo: criar corpus no Vertex AI e configurar `VERTEX_RAG_CORPUS` (ver `agents/kurisu/PLAN.md`)

**Lucy** — Email Agent (Fase 4)
- Inspiração: Lucy de Elfen Lied — aparência calma, triagem clínica e implacável de tudo que não merece atenção
- Domínio: email, Gmail (leitura, busca, arquivamento, respostas, rascunhos)
- Personalidade:
  - Começa com `Lucy:`
  - Tom direto e frio: "Três emails não lidos. Dois são irrelevantes."
  - Frieza clínica ao categorizar: "Isso não requer sua atenção."
  - Nunca entusiasmo — apenas precisão
- Tools planejadas:
  - `list_emails(max_results, unread_only, label)` — lista emails da caixa de entrada
  - `search_emails(query, max_results)` — pesquisa com sintaxe Gmail (from:, subject:, is:unread)
  - `get_email_body(message_id)` — corpo completo de um email
  - `mark_as_read(message_id)` — marcar como lido
  - `archive_email(message_id)` — arquivar (sair da INBOX sem deletar)
  - `label_email(message_id, label_name, add)` — adicionar/remover label
  - `send_reply(message_id, body)` — responder thread existente
  - `create_draft(to, subject, body, reply_to_id)` — criar rascunho (não envia)
- Fonte: **Gmail API v1** via `google-api-python-client` (já instalado) — não IMAP
  - Motivo: mais confiável, suporte nativo a labels/threads, client já presente no projeto
- Auth: OAuth2, mesma abordagem do Google Calendar
  - Script `scripts/authorize_gmail.py` (padrão de `authorize_calendar.py`)
  - Credencial OAuth Desktop no mesmo Google Cloud project (`projetos-448301`)
- Env vars necessárias:
  ```
  GMAIL_CLIENT_ID
  GMAIL_CLIENT_SECRET
  GMAIL_ACCESS_TOKEN
  GMAIL_REFRESH_TOKEN
  GMAIL_TOKEN_EXPIRY
  ```
- Tipo de agente: **singleton** (sem MCP, sem subprocess — igual à Nami)
- Referência de implementação: `n8n-python-scripts/lucy_email_agent/main.py`
- Localização: `agents/lucy/`
- Nota: digest batch diário (n8n) continua independente — Lucy é a camada interativa

**Setup (fazer uma vez antes da implementação):**
1. Google Cloud Console → `projetos-448301` → habilitar **Gmail API**
2. Criar credencial OAuth 2.0 tipo Desktop → baixar JSON → `scripts/gmail_client_secret.json`
3. `python scripts/authorize_gmail.py` → copiar vars para `.env` e Dokploy
4. Descomentar import e adicionar `lucy_agent` ao `sub_agents` em `coordinator/agent.py`
5. Atualizar `_MAKIMA_INSTRUCTION` com Lucy na lista de especialistas ativos

**Marin Kitagawa** — Media Agent (anime + filmes + séries) (Fase 5)
- Inspiração: Marin Kitagawa de My Dress-Up Darling — entusiasta incondicional de toda cultura pop
- Domínio: anime, filmes e séries de TV (rastreamento via Notion)
- Decisão de design: agente unificado para os três domínios (`media_agent`) — o coordinator
  já prevê esse slot único; Marin cobre todo o espectro de entretenimento pop
- Personalidade:
  - Começa com `Marin:`
  - Tom entusiástico e expressivo: "AAAH esse anime É DEMAIS!"
  - Zero julgamento sobre escolhas do usuário
  - Referencia outros títulos relacionados quando relevante
  - Usa emojis com frequência
- Tools planejadas:

  **Anime** (fonte: Notion — `NOTION_ANIME_DB_ID`):
  - `get_anime_list(status)` — lista por status: Assistindo / Completo / Planejo Ver / Pausado / Dropado
  - `update_anime_progress(page_id, episode)` — atualizar episódio atual
  - `add_anime(title, status, total_episodes)` — adicionar novo título
  - `get_anime_stats()` — resumo: total por status, episódios assistidos

  **Filmes** (fonte: Notion — `NOTION_MOVIES_DB_ID`):
  - `get_movies_list(status)` — lista por status: Assistido / Quer Ver / Assistindo
  - `add_movie(title, year, status, rating, watched_date)` — adicionar filme
  - `update_movie(page_id, status, rating, watched_date)` — atualizar dados
  - `get_movie_stats()` — filmes vistos, nota média

  **Séries** (fonte: Notion — `NOTION_SERIES_DB_ID`):
  - `get_series_list(status)` — lista por status: Assistindo / Completo / Pausado / etc.
  - `update_series_progress(page_id, season, episode)` — atualizar temporada/episódio
  - `add_series(title, status, total_seasons)` — adicionar série
  - `get_series_stats()` — séries ativas, completas

  **BigQuery mirror** (ao atualizar/finalizar qualquer título):
  - Upsert em `media.anime_history`, `media.movies_history`, `media.series_history`
  - Mesmo padrão de `create_transaction` na Nami (função auxiliar `_upsert_bq()`)

- Tipo de agente: **singleton** (sem MCP)
- Env vars necessárias:
  ```
  NOTION_TOKEN          (já existe)
  NOTION_ANIME_DB_ID
  NOTION_MOVIES_DB_ID
  NOTION_SERIES_DB_ID
  ```
  Descobrir IDs em: `n8n-python-scripts/anime_sync/`, `gustavoboxd/`, `series_sync/`
- Referências de implementação:
  - `n8n-python-scripts/anime_sync/` e `mal_sync/` (anime)
  - `n8n-python-scripts/gustavoboxd/` (filmes)
  - `n8n-python-scripts/series_sync/` (séries)
- Localização: `agents/media/`

**Setup:**
1. Descobrir database IDs do Notion nas referências (ou via Notion API)
2. Adicionar env vars ao `.env` e Dokploy
3. Implementar `agents/media/tools.py` + `agents/media/agent.py`
4. Descomentar import e adicionar `media_agent` ao `sub_agents` em `coordinator/agent.py`

---

**Frieren** — Books Agent ✅ Fase 5a concluída
- Inspiração: Frieren de Frieren: Beyond Journey's End — maga milenar, contemplativa, perspectiva de séculos
- Domínio: livros e leitura pessoal
- Personalidade:
  - Começa com `Frieren:`
  - Tom calmo e contemplativo: "O tempo passa, mas os livros ficam."
  - Perspectiva milenar: "Em cem anos você terá lido muitos livros."
  - Nunca demonstra pressa, nunca julga ritmo de leitura
- Tools implementadas:
  - `search_book(query, publisher)` — busca na Google Books API antes de adicionar
  - `add_book(title, status, google_books_id, author, total_pages)` — adiciona com enriquecimento automático de metadados
  - `log_reading(book_query, current_page, session_notes, log_date)` — registra sessão de leitura; se `book_query` omitido, usa o livro com o log mais recente
  - `get_current_reading()` — livros em leitura com progresso atual
  - `get_reading_list(status)` — catálogo completo, agrupado por status
  - `finish_book(book_query, rating, notes, date_finished, date_started)` — conclui com data e avaliação
  - `update_book_status(book_query, status)` — pausa, retoma, abandona
  - `update_book_pages(book_query, total_pages)` — corrige total de páginas da edição física
  - `get_reading_stats(year)` — estatísticas anuais: livros, páginas, ritmo, avaliação média
  - `get_book_history(book_query)` — histórico cronológico de sessões de leitura
  - `get_book_menu_data(book_query)` — retorna JSON para o coordinator montar menu interativo
- Funções auxiliares (não tools do agente, importadas pelo coordinator):
  - `get_book_by_id(book_id)` — busca por ID exato para callbacks de botões
  - `update_book_by_id(book_id, ...)` — SET dinâmico para callbacks inline

- **Decisão de design — BigQuery em vez de Notion:**
  O plano original era usar Notion. Decidimos BigQuery por:
  1. Persistência robusta de logs imutáveis de sessão por páginas (lida X páginas, de p.X até p.Y)
  2. Queries analíticas rápidas sem rate limit da Notion API
  3. Padrão já estabelecido pela Nami (dataset separado, mesmo service account)
  4. Google Books API como fonte de metadados (capa, autor, ISBN, sinopse) — independente de Notion

- **Banco de dados:** BigQuery, dataset `frieren_books_agent`
  - `books` — catálogo, estado de leitura, metadados, avaliação
  - `reading_logs` — sessões imutáveis (page_start, page_end, pages_read por data)

- **Menu interativo Telegram:** botões inline para gerenciar livro sem digitar (avaliar, trocar status, adicionar nota, marcar como lido). Se cover_url disponível, envia a capa do livro via `send_photo` com o menu na legenda. Callbacks processados em `coordinator/main.py` via `handle_callback`.

- Tipo de agente: **singleton** (sem MCP, igual à Nami)
- Env vars:
  ```
  GCP_PROJECT_ID          (compartilhado com Nami)
  GCP_CREDENTIALS_JSON    (compartilhado com Nami)
  GOOGLE_BOOKS_API_KEY    (opcional — aumenta cota de ~1.000 para 10.000 req/dia)
  ```
- Localização: `agents/frieren/` — documentação detalhada em `agents/frieren/CLAUDE.md`

---

**Misato Katsuragi** — Work Agent (sem fase definida, prioridade média)
- Inspiração: Misato de Evangelion — comandante operacional, decisões sob pressão, pragmática
- Domínio: trabalho e projetos profissionais
- Personalidade:
  - `Misato:`, tom de comando direto: "Situação: 3 PRs abertos, 1 urgente."
  - Usa jargão levemente militar, nunca pânico, foca no que importa agora
- Tools candidatas:
  - GitHub: `list_open_prs()`, `list_issues(repo, state)`, `get_pr_status(pr_id)`
  - Notion (projetos): `get_active_projects()`, `update_project_status()`
- Env vars: `GITHUB_TOKEN`, `NOTION_WORK_DB_ID`
- Decisão a tomar: escopo exato (só GitHub? Notion também? Linear?)
- Localização futura: `agents/misato/`

**Kaori / Bocchi** — Spotify Agent (baixa prioridade)
- Inspiração: Kaori (Shigatsu wa Kimi no Uso) para música emotiva /
  Bocchi (Bocchi the Rock) para música independente — personalidade a definir
- Domínio: música, histórico Spotify, descoberta
- Tools candidatas:
  - `get_current_track()` — música tocando agora (Spotify Web API)
  - `get_listening_history(days)` — histórico de audição (BigQuery `spotify.streaming_history`)
  - `get_top_artists(period)` — artistas mais ouvidos
  - `get_top_tracks(period)` — músicas mais ouvidas
  - `search_track(query)` — busca no Spotify
- Fonte: Spotify Web API + BigQuery (tabela `spotify.streaming_history` já existe)
- Env vars: `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REFRESH_TOKEN`
- Localização futura: `agents/spotify/`

**Games Agent** (baixa prioridade, nome/personagem a definir)
- Domínio: acompanhamento de jogos (backlog, progresso, tempo jogado)
- Fontes candidatas: Notion, IGDB API, HowLongToBeat
- Personalidade e nome: a definir (candidatos: Kirito, Subaru, Rimuru)
- Localização futura: `agents/games/`

---

### BigQuery mirror

Scripts de sync que hoje escrevem só no Notion passam a escrever também no BQ ao final da execução:

```python
# Adição em series_sync/main.py, gustavoboxd/main.py, etc.
update_notion_page(data)
upsert_bigquery(data, table="media.series_history")  # linha nova
```

**Schemas:**

```sql
media.series_history:    title, status, season, episode, date_watched, rating, genre, source
media.movies_history:    title, year, date_watched, rating, genre, director, source
media.anime_history:     title, status, episode, date_watched, rating, source (MAL)
media.books_history:     title, author, status, date_started, date_finished, pages, rating

coordinator.action_logs: timestamp, user_id, message, agent_called, tool_called,
                         status, latency_ms, tokens_used, cost_usd
```

**Por que BQ além do Notion:**
- Joins cross-domain (tempo em séries vs. livros vs. spotify)
- Queries analíticas rápidas sem rate limit da Notion API
- Histórico imutável de consumo
- Custo praticamente zero para volume pessoal

---

### Morning Briefing

Um endpoint no coordinator chamado pelo n8n às 8h que consulta todos os agentes e sintetiza:

```
💰 Finanças: gastou R$340 ontem. Fatura Nu fecha em 8 dias.
✉️ Emails: 3 prioritários, 1 precisa de resposta hoje.
📋 Tarefas: 4 pendentes hoje, 2 atrasadas.
📺 Mídia: faltam 2 episódios pra terminar Severance S2.
📚 Leitura: 47% de O Problema dos Três Corpos.
```

Esse tipo de síntese só é possível com o coordinator — scripts isolados não conseguem fazer isso.

---

### Knowledge (Obsidian)

Camada de acesso à base de conhecimento pessoal do Obsidian. O coordinator consulta o vault quando o usuário faz perguntas sobre anotações, projetos, referências ou estudos.

#### Primário: Vertex AI RAG (Agent Builder + GCS)

**Pipeline completo:**
```
Obsidian vault (local)
    ↓ já sincronizado (Google Drive)
Google Drive (pasta do vault)
    ↓ fonte nativa — sem GCS, sem script intermediário
Vertex AI Agent Builder — Data Store
    ↓ chunking + embeddings + índice vetorial (automático)
Coordinator (ADK) — knowledge_tool
    ↓ busca semântica por consulta
Resposta sintetizada pelo Gemini
```

O vault já está no Google Drive — isso elimina toda a camada de sync. O Vertex AI Agent Builder suporta Google Drive como fonte nativa: você aponta para a pasta do vault, ele indexa os `.md` e reindexes automaticamente quando os arquivos mudam. Zero código de infraestrutura.

**Integração ADK:**
```python
from google.adk.tools import VertexAiRagRetrieval

knowledge_tool = VertexAiRagRetrieval(
    rag_corpus="projects/seu-projeto/locations/us-central1/ragCorpora/xxx",
    similarity_top_k=5,
)

coordinator = Agent(
    ...
    tools=[..., knowledge_tool],
    sub_agents=[nami_agent, lucy_agent, ...]
)
```

**Estimativa de custos (uso pessoal):**

| Componente | Custo |
|---|---|
| GCS storage (vault ~100MB de texto) | ~US$0,00 (free tier 5GB) |
| Vertex AI Search — indexação | ~US$0,00 (índice pequeno) |
| Vertex AI Search — consultas | US$4,00 / 1.000 queries |
| Gemini 1.5 Flash (geração) | ~US$0,075 / 1M tokens input |

**Total estimado**: ~US$1,20–2,00/mês para ~300 perguntas/mês (10/dia). Principal custo: US$4/1.000 queries do Vertex AI Search.

**Casos de uso:**
```
"O que anotei sobre arquitetura de sistemas?"
→ knowledge_tool busca semanticamente no vault → coordinator sintetiza

"Cria uma tarefa baseada no projeto que planejei em [[Projeto ADK]]"
→ knowledge_tool recupera a nota → Tasks agent cria as subtarefas

"Tenho alguma anotação sobre Vertex AI?"
→ knowledge_tool → lista notas relevantes com trechos
```

#### Estrutura ideal das notas para RAG

A busca semântica do Vertex AI enxerga os arquivos de forma "plana" — pastas não importam. O que importa é o conteúdo interno de cada `.md`.

**1. YAML Frontmatter (metadados estruturados)**
O Vertex AI lê as chaves do frontmatter e pode usá-las como filtros. Padrão a adotar:
```yaml
---
title: Nome descritivo da nota
tags: [categoria, subcategoria]
date: YYYY-MM-DD
status: ativo | concluido | referencia
tipo: resumo | projeto | area | recurso
---
```

**2. Headings para chunking inteligente**
O Vertex quebra o texto em chunks baseado em cabeçalhos. Use `##` e `###` para separar seções — o agente consegue isolar só o bloco relevante para a pergunta.
- Evite: bloco contínuo de texto misturando ideias
- Prefira: `## Conceito`, `## Aplicações`, `## Pontos de Ação`

**3. Notas atômicas**
Um arquivo = um assunto. Notas genéricas como `Anotacoes_Gerais.md` confundem o agente. Para perguntas amplas, o modelo cruza arquivos separados automaticamente.

**4. Títulos de arquivo descritivos**
O nome do `.md` tem peso alto na relevância da busca.
- Evite: `Ideia_1.md`, `Aula_3.md`
- Prefira: `Configuracao_Variaveis_Ambiente_n8n.md`, `Design_Sistema_ADK_Personal_Assistant.md`

**5. Links internos (`[[ ]]`) não são navegados**
O agente lê texto literal — não "clica" em links internos. Cada nota precisa ter contexto suficiente para ser entendida sozinha.

---

#### Plano B: ChromaDB (self-hosted, $0)

Se o custo do Vertex AI Search for relevante, ChromaDB no VPS resolve com zero custo adicional:

```python
def search_knowledge(query: str) -> list[dict]:
    """Busca semanticamente na base de conhecimento pessoal (notas Obsidian)."""
    results = chroma_client.query(query_texts=[query], n_results=5)
    return [{"content": doc, "source": meta["source"]} 
            for doc, meta in zip(results["documents"][0], results["metadatas"][0])]
```

Requer:
1. Script local que sincroniza vault → VPS via rsync
2. Job no VPS que gera embeddings (`text-embedding-004`) e upserta no ChromaDB

A API de busca é idêntica — migrar Vertex → ChromaDB é trocar a implementação de `search_knowledge` sem tocar no coordinator.

---

---

### Morning Briefing (Fase 6)

Síntese diária de todos os domínios, acionada pelo comando `/briefing` no Telegram ou
pelo n8n às 8h.

**Como funciona:**
O `coordinator/main.py` detecta o comando `/briefing` e injeta um prompt estruturado no
runner do ADK. O Makima recebe esse prompt como uma mensagem normal, orquestra os
sub-agentes ativos em sequência, e retorna o bloco HTML consolidado.

**Prompt injetado por `main.py`:**
```
Faça o morning briefing completo. Consulte em sequência:
1. Nami: gastos de ontem + projeção de gastos do mês atual
2. Kaguya: tarefas de hoje + tarefas atrasadas
3. Lucy: emails não lidos (se ativa) — resumir em 1-2 linhas
4. Marin: o que estou assistindo agora (se ativa) — próximo episódio de cada título ativo
5. Frieren: progresso do livro atual (se ativa)
Apresente como briefing diário em HTML formatado, seção por seção, conciso.
```

**Trigger via n8n:**
- N8n envia `sendMessage` da Telegram API para o `chat_id` do dono com o texto `/briefing`
- O bot recebe como mensagem normal e o handler de comando dispara
- Não requer endpoint HTTP separado — usa o fluxo Telegram já existente

**Implementação em `coordinator/main.py`:**
```python
# Handler adicional para o comando /briefing
async def briefing_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    briefing_prompt = (
        "Faça o morning briefing completo. Consulte Nami (gastos de ontem + projeção), "
        "Kaguya (tarefas de hoje + atrasadas), Lucy (emails não lidos se ativa), "
        "Marin (o que estou assistindo se ativa), Frieren (livro atual se ativo). "
        "Apresente seção por seção em HTML conciso."
    )
    # Reutiliza a lógica do handle_message substituindo o texto
    await _process_message(update, context, text=briefing_prompt)

application.add_handler(CommandHandler("briefing", briefing_command))
```

**Exemplo de saída esperada:**
```
💰 Finanças (Nami)
Ontem: R$127,50. Projeção do mês: R$2.340,00.

📋 Tarefas (Kaguya)
3 para hoje · 1 atrasada.

📬 Emails (Lucy)
2 não lidos — nenhum prioritário.

📺 Mídia (Marin)
Dandadan EP 8/12 · One Piece EP 1112.

📚 Leitura (Frieren)
O Problema dos Três Corpos — 47% (pág. 234/498).
```

**Dependências:** todos os outros agentes. Implementar por último (Fase 6).

---

## Dependências novas

```
google-adk
fastapi
uvicorn
python-telegram-bot
```

Adicionadas ao `coordinator/Dockerfile`. Os scripts existentes não mudam suas dependências.

---

## Ordem de implementação (revisada)

| Fase | Agente | Domínio | Dependências | Status |
|------|--------|---------|--------------|--------|
| 1 | Nami | Finanças (BigQuery) | — | ✅ |
| 2 | Kaguya | Tarefas + Calendar (MCP) | — | ✅ |
| 3 | Kurisu | Knowledge base (Vertex AI RAG) | Corpus GCP | 🔧 |
| 4 | Lucy | Email (Gmail API v1) | OAuth Gmail, habilitar Gmail API | — |
| 5a | Frieren (`frieren_agent`) | Livros (BigQuery + Google Books API) | GCP_CREDENTIALS_JSON, GCP_PROJECT_ID | ✅ |
| 5b | Marin (`media_agent`) | Anime + Filmes + Séries (Notion) | Notion DB IDs x3 | — |
| 6 | Morning Briefing | `/briefing` command no Telegram | Fases 1–5 | — |
| — | Misato | Trabalho/GitHub | GitHub token | — |
| — | Kaori/Bocchi | Spotify | Spotify API | — |
| — | Games | Jogos | A definir | — |

### Detalhes por fase

**Fase 1 — Nami** ✅
- `agents/nami/tools.py` (BigQuery) + `agents/nami/agent.py`
- Coordinator com Nami como único sub-agente

**Fase 2 — Kaguya** ✅
- MCP servers TickTick + Google Calendar
- Tools cross-agent (`complete_payment_task`, `create_expense_reminder`)

**Fase 3 — Kurisu** 🔧
- Estrutura criada; corpus Vertex AI pendente
- Ver `agents/kurisu/PLAN.md` para checklist de setup GCP

**Fase 4 — Lucy**
- Habilitar Gmail API no projeto `projetos-448301`
- `scripts/authorize_gmail.py` → vars no `.env` e Dokploy
- Implementar `agents/lucy/tools.py` (Gmail API v1, ref.: `n8n-python-scripts/lucy_email_agent/`)
- Adicionar `lucy_agent` ao coordinator
- **Entrega**: queries sobre email via Telegram ("tem algo urgente?", "arquiva os newsletters")

**Fase 5a — Frieren** ✅
- BigQuery dataset `frieren_books_agent` criado com tabelas `books` e `reading_logs`
- Google Books API para enriquecimento automático de metadados (capa, ISBN, páginas, autor)
- Menu interativo com botões inline no Telegram (avaliar, status, nota, marcar como lido)
- `frieren_agent` adicionado ao coordinator como singleton
- **Entregue**: catálogo de livros, log de leitura por páginas, estatísticas anuais, histórico de sessões, menu interativo com capa

**Fase 5b — Media (Marin)**
- Descobrir Notion DB IDs em `n8n-python-scripts/`
- Implementar tools para anime + filmes + séries + upsert BQ
- Adicionar `media_agent` ao coordinator
- **Entrega**: rastrear progresso de anime/filmes/séries via Telegram

**Fase 6 — Morning Briefing**
- Handler `/briefing` em `coordinator/main.py`
- N8n chama `/briefing` via Telegram API às 8h
- **Entrega**: síntese diária de todos os domínios ativos

---

## Verificação por fase

**Fase 1:**
```bash
# Testa Nami direto
python nami_finance_agent/agent.py --query "Gastei 89 no Rappi"
# Testa coordinator HTTP
curl -X POST localhost:8080/chat -d '{"user_id":"test","message":"Gastei 50 no mercado"}'
# Verifica sessão (segunda mensagem referencia a primeira)
curl -X POST localhost:8080/chat -d '{"user_id":"test","message":"na verdade era 45"}'
```

**BQ mirror:**
```sql
SELECT * FROM media.series_history ORDER BY date_watched DESC LIMIT 5
```

**Morning briefing:**
```bash
curl -X POST localhost:8080/briefing -d '{"user_id":"seu_chat_id"}'
```

---

## Decisões em aberto (para evolução futura)

- **Persistência de sessão**: ✅ resolvido — `DatabaseSessionService` com PostgreSQL externo (Dokploy). Sessões sobrevivem a reinícios. `DATABASE_URL` normalizado de `postgresql://` para `postgresql+asyncpg://` automaticamente.
- **Autenticação do endpoint**: coordinator exposto só internamente no Docker network — sem auth por ora.
- **Gemini model**: `gemini-2.0-flash` para todos os agentes. Pode escalar para Gemini Pro no coordinator se precisar de raciocínio mais complexo.
- **Parallel tool calls**: o ADK suporta, mas requer configuração explícita. Considerar para o morning briefing (todos os agentes em paralelo).
