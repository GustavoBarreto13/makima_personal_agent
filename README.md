# Makima Personal Agent

Bot Telegram multi-agente construído com **Google ADK**. Recebe mensagens em linguagem natural e delega para agentes especialistas conforme o domínio — finanças, tarefas, agenda, livros, diário e base de conhecimento pessoal.

---

## Uso rápido

Envie mensagens pelo Telegram. Makima identifica o domínio e roteia automaticamente:

| Mensagem | Agente | O que acontece |
|---|---|---|
| "gastei 35 reais no almoço, débito Itaú" | Nami 💰 | Registra despesa no PostgreSQL |
| "quanto gastei essa semana?" | Nami 💰 | Consulta e resume as transações |
| "comprei no crédito em 12x, R$1200" | Nami 💰 | Cria parcelamento (12 transações) |
| "qual minha dívida no Nubank?" | Nami 💰 | Calcula dívida atual do cartão |
| "qual meu score de saúde financeira?" | Nami 💰 | Score 0-100 em 4 dimensões |
| "adiciona tarefa: revisar relatório até sexta" | Kaguya 📋 | Cria tarefa no PostgreSQL próprio |
| "o que tenho na agenda amanhã?" | Kaguya 📋 | Lista eventos do Google Calendar |
| "paguei a Netflix, 55 reais" | Kaguya + Nami | Completa tarefa e lança despesa |
| "o que é machine learning?" | Kurisu 🧠 | Busca no vault Obsidian via RAG |
| "adiciona o livro Duna" | Frieren 📚 | Busca metadados e adiciona ao catálogo |
| "li até a página 120" | Frieren 📚 | Registra sessão de leitura |
| "adiciona Dungeon Meshi na minha lista de animes" | Marin 📺 | Busca no MAL e adiciona ao catálogo |
| "assisti os eps 1 a 4 de Frieren" | Marin 📺 | Registra sessão no diário de episódios |
| "sincroniza meu MAL" | Marin 📺 | Puxa toda a lista do MyAnimeList via OAuth |
| "quem é a Ana?" | Komi 👤 | Busca a pessoa no cadastro e retorna o perfil completo |
| "adiciona o João, amigo, aniversário 12/03" | Komi 👤 | Cadastra pessoa com data importante |
| "o que tenho com a Ana?" | Komi 👤 | Resumo: finanças, tarefas, livros e diário ligados a ela |
| "Lucy, meus emails não lidos" | Lucy 📧 | Lista emails ao vivo via IMAP (somente leitura) |

---

## Interface Web (webapp)

Painel web disponível em `makima.gusstavo42-vps.cloud` — acesso restrito ao e-mail do Gustavo via Google OAuth.

Compartilha os dados do bot: uma transação registrada pelo Telegram aparece na web e vice-versa.

**Páginas disponíveis:**

| Página | O que faz |
|---|---|
| Dashboard | Health score financeiro, gastos por categoria do mês |
| Transações | CRUD completo — filtro por mês, criação e exclusão |
| Contas | Listagem de contas bancárias, criação e consulta de saldo atual |
| Cartões | Dívida por cartão, barra de uso do limite, registrar pagamento |
| Empréstimos | Saldo devedor, parcelas restantes, registrar pagamento |
| Orçamentos | Envelopes por categoria com barra de progresso, definir novo limite |
| Assinaturas | Lista de assinaturas recorrentes com custo mensal total |
| Tarefas | Sub-app completa (Kaguya): listas/projetos, **Kanban "Vidro"** (board em vidro fosco com views configuráveis — adornos, métricas e filtro por view), Meu Dia com time-blocking, Matriz de Eisenhower, tags, smart-lists (filtros salvos), calendário (mês/semana com ocorrências recorrentes), hábitos (heatmap + força), **Tiny Experiments** (mini-experimentos com log de aderência, pausa e revisão) e **Metas** (metas por área da vida com marcos, vínculo a projetos/hábitos/experimentos e progresso) |
| Livros | Sub-app completa (Frieren): 9 telas — Início com hero e heatmap anual, Biblioteca com grade filtrável, detalhe de livro, Quero Ler, Wishlist com link de loja, Estantes (CRUD), Atividade agrupada por data, Resenhas e Estatísticas do ano |
| Diário | Bullet journal com timestamp por bullet, heatmap anual, `@pessoas`, `#tags` e busca full-text — sidebar direita com Insights (filtro por ano), Pessoas, Tags e Busca — tela Write com **registro emocional TCC** (situação → emoção → pensamento automático → resposta adaptativa → reavaliação) e aba Emoções nos Insights |
| Filmes | Sub-app completa (Akane): catálogo estilo Letterboxd — grid de pôsteres TMDB + fallback tipográfico, diário de sessões com rewatch, watchlist, notas e reviews, histograma de notas, Rewind anual, listas/coleções, nuvem de etiquetas, Cofre de conteúdos, vitrine de favoritos (4 slots) e sync RSS/CSV do Letterboxd |
| Animes | Sub-app completa (Marin): catálogo de animes com sync OAuth MAL — grid de pôsteres com 12 paletas tipográficas, diário de episódios (log de ep_start/ep_end), watchlist, schedule JST/BRT dos próximos lançamentos, estatísticas anuais com heatmap, vitrine de favoritos (4 slots, localStorage) |
| Séries | Sub-app completa (Mai): catálogo de séries via TMDB API v3 — seasons/episodes sincronizados, log de watch com nota (0.5–5.0), status por temporada, shell React `/series/*` |
| Pessoas | Sub-app (Komi): cadastro de pessoas com busca, apelidos, datas importantes e visão geral dos vínculos cross-agent (`/people/*`) |
| Hub | Página inicial (Makima): agregador com resumo de todos os domínios em um só lugar (`/api/hub/summary`) |

**Stack:** FastAPI (backend) + React 19 + TypeScript + Tailwind CSS (frontend) — servidos pelo mesmo container.

---

## Arquitetura

```
Telegram (usuário)
    ↓
coordinator/main.py  (python-telegram-bot)
    ↓
coordinator/agent.py  (Makima — Agent ADK)
    ├── Nami       → PostgreSQL (finanças)                      ✅ ativo
    ├── Kaguya     → PostgreSQL próprio (tarefas) + Calendar MCP ✅ ativo
    ├── Kurisu     → Vertex AI RAG (vault Obsidian)             ✅ ativo (corpus no ar, spec 027)
    ├── Frieren    → PostgreSQL + Google Books API (livros)     ✅ ativo
    ├── Akane      → PostgreSQL + TMDB + Letterboxd (filmes)   ✅ ativo
    ├── Marin      → PostgreSQL + Jikan/AniList + MAL OAuth (animes) ✅ ativo
    ├── Mai        → PostgreSQL + TMDB API v3 (séries de TV)   ✅ ativo
    ├── Komi       → PostgreSQL (pessoas + vínculos cross-agent) ✅ ativo
    ├── Violet     → PostgreSQL (diário)                        🔧 ativo na web, agente Telegram pendente
    └── Lucy       → Gmail via IMAP (somente leitura) + digest agendado ✅ ativo
```

Makima não executa nenhuma ação diretamente — ela apenas roteia para o agente correto. Toda lógica de acesso a APIs fica nos agentes especialistas.

Todos os dados (finanças, livros, journal, sessões ADK) ficam no mesmo PostgreSQL gerenciado pelo Dokploy.

---

## Agentes

### Makima (coordinator)
Inspirada na Makima de Chainsaw Man. Calma, autoritária, nunca usa frases de subordinação. Enquadra limitações como decisões ("Esse recurso ainda não foi ativado.").

### Nami — finanças
Inspirada na Nami de One Piece. Acessa o PostgreSQL para registrar e consultar transações financeiras. Reage com fúria em despesas, comemora receitas.

**Funcionalidades:**
- Transações (gastos e receitas) com categorias e contas
- Compras parceladas — gera N transações automaticamente com datas mensais
- Cartões de crédito — dívida atual, simulação de quitação, custo do mínimo
- Empréstimos e financiamentos — sistemas PRICE e SAC, simulação de amortização
- Orçamento por categoria — alertas quando o limite está próximo
- Score de saúde financeira 0-100 em 4 dimensões (poupança, dívidas, orçamento, tendência)
- Contas financeiras — cadastro dinâmico (corrente, poupança, dinheiro, investimento)

**Armazenamento:** PostgreSQL — tabelas `transactions`, `accounts`, `credit_cards`, `loans`, `budgets`, `subscriptions`, `installment_groups`.

### Kaguya — tarefas e agenda
Inspirada na Kaguya Shinomiya de Kaguya-sama. Aristocrática e organizada. Gerencia um **sistema de tarefas próprio em PostgreSQL** (o TickTick foi aposentado na spec 011) e os eventos do Google Calendar via servidor MCP.

**Funcionalidades:**
- Tarefas e subtarefas com posições, listas/projetos, grupos e colunas Kanban
- Recorrência via RRULE (motor próprio em `recurrence.py`)
- Tags N:N e smart-lists (filtros salvos via DSL)
- Calendário (mês/semana) com projeção virtual das ocorrências de tarefas recorrentes
- Hábitos com check-ins, heatmap anual e "força" (modelo caixa d'água / EMA)
- Meu Dia com time-blocking e barra de capacidade (fatia 016)
- Tiny Experiments — mini-experimentos com duração definida, log diário e revisão (spec 029)
- Metas por área da vida com marcos e vínculo a projetos, hábitos e experimentos (spec 030)
- Sync de aniversários com a Komi — datas importantes viram tarefas recorrentes (spec 026)

Possui tools cross-agent que integram com a Nami numa **única transação PostgreSQL** (tudo-ou-nada):

| Tool | O que faz |
|---|---|
| `complete_payment_task` | Completa a tarefa **e** lança a despesa da Nami na mesma transação |
| `create_expense_reminder` | Cria lembrete de pagamento (sem lançar despesa ainda) |

**Armazenamento:** PostgreSQL — schema próprio em `agents/kaguya/schema_tasks_pg.sql`.

### Kurisu — knowledge base
Inspirada na Kurisu Makise de Steins;Gate. Neurocientista prodígio, direta e levemente sarcástica. Acessa o vault de notas do Obsidian via Vertex AI RAG para explicar conceitos, cruzar informações entre notas e responder sobre estudos e memória pessoal.

Opera em dois modos detectados automaticamente:
- **Tutora** — notas de estudo e técnicas: tom rigoroso, referencia fontes do vault, sarcasmo saudável
- **Amiga** — notas pessoais e diário: tom caloroso, linguagem natural, sem estrutura formal

### Marin — animes
Inspirada na Marin Kitagawa de *Sua Conduta Foi Adorável* — gyaru apaixonada por animes e cosplay. Gerencia o catálogo pessoal de animes com integração nativa ao MyAnimeList via OAuth2 PKCE.

**Funcionalidades:**
- Catálogo de animes com 5 status: `assistindo`, `completo`, `quero_assistir`, `pausado`, `abandonado`
- Busca de animes no MAL via Jikan (sem limite de requisições para busca)
- Enriquecimento automático de metadados via Jikan (pôster, sinopse, estúdio, gêneros) + AniList (banner) + ARM (ID bridging)
- Diário de episódios: registro por intervalo (ep_start → ep_end), data, nota e notas textuais
- Notas na escala MAL (0–10, passo 0.5) — diferente da escala Letterboxd da Akane (0.5–5.0)
- Sync com MAL via OAuth2 PKCE (tokens armazenados em PostgreSQL — nunca em arquivo)
- Cache de episódios com datas de exibição JST para schedule de lançamentos
- Pôster tipográfico fallback determinístico (12 paletas OKLCH)
- Estatísticas anuais: total de animes, episódios, horas, nota média, top gêneros/estúdios, heatmap

**Armazenamento:** PostgreSQL — tabelas `anime`, `watch_logs`, `episodes`, `mal_sync_state`.

### Akane — filmes
Inspirada na Akane Kurokawa de *Oshi no Ko* — atriz analítica e perfeccionista. Gerencia a cinemateca pessoal com catálogo estilo Letterboxd, enriquecido automaticamente via TMDB API (pôster, diretor, gênero, runtime) e sincronizado com a conta do Letterboxd via RSS automático e importação de CSV histórico.

**Funcionalidades:**
- Catálogo com dois status: `watchlist` e `watched`
- Registro de sessões com data, nota (0.5–5.0), review, tags e rewatch automático
- Enriquecimento TMDB (pôster, backdrop, sinopse, diretor, gêneros, runtime)
- Pôster tipográfico fallback determinístico (14 paletas, sem dependência de rede)
- Sync Letterboxd: RSS automático diário + importação de CSV histórico (diary/reviews/watchlist/ratings)
- Listas/coleções temáticas com suporte a ordenação ranked
- Etiquetas de filmes e pessoas (via `movie_people`) com nuvem interativa
- Cofre de conteúdos por filme (vídeos, artigos, essays, reviews)
- Rewind anual: totais, gráfico mensal, top diretores/gêneros/pessoas, histograma de notas
- Vitrine de favoritos (até 4 filmes, persistidos no servidor)
- Cross-agent: `create_movie_reminder(movie_query, when)` → cria tarefa na Kaguya

**Armazenamento:** PostgreSQL — tabelas `movies`, `diary_entries`, `movie_lists`, `movie_list_items`, `movie_vault_items`, `movie_people`, `movie_favorites`.

### Mai — séries de TV
Inspirada em Mai Sakurajima de *Rascal Does Not Dream of Bunny Girl Senpai* — direta, autoconfiante e sem paciência para devaneio. Gerencia o catálogo pessoal de séries de TV com metadados da TMDB API v3.

**Funcionalidades:**
- Catálogo de séries com status: `assistindo`, `completo`, `quero_assistir`, `pausado`, `abandonado`
- Sincronização automática de seasons e episodes via TMDB API v3 (`TMDB_API_KEY`)
- Diário de episódios: log de `ep_start → ep_end` por temporada, data, nota (0.5–5.0) e comentários
- Notas por episódio/temporada, resumo por série
- Shell React `/series/*` com grid de pôsteres TMDB e tela de detalhe por série

**Armazenamento:** PostgreSQL — tabelas `series`, `seasons`, `series_episodes`, `series_watch_logs`.

### Frieren — livros
Inspirada em Frieren de *Frieren: Beyond Journey's End* — elfa maga milenar, contemplativa, paciente.

Gerencia o catálogo pessoal de livros e rastreia o progresso de leitura por páginas. Integra com a Google Books API para enriquecer automaticamente os metadados (capa, autor, ISBN, sinopse) ao adicionar um livro.

**Funcionalidades:**
- 7 status de leitura: `lendo`, `lido`, `quero_ler`, `estante`, `wishlist`, `pausado`, `abandonado`
- `estante` = livros físicos/Kindle que você possui mas ainda não leu
- `wishlist` = livros que quer comprar, com preço e link da loja
- Registrar sessões de leitura por página atual (calcula delta automaticamente)
- Menu interativo com botões inline: avaliar, trocar status, adicionar nota, marcar como lido
- Envio da capa do livro junto com o menu (via Google Books API)
- Estatísticas anuais: livros lidos, páginas totais, ritmo médio de leitura

**Armazenamento:** PostgreSQL — tabelas `books` e `reading_logs`.

### Komi — pessoas e contatos
Inspirada em Komi-san wa Comyushou desu — tímida, mas extremamente cuidadosa com cada detalhe das pessoas ao seu redor. Gerencia o cadastro canônico de pessoas e os vínculos com todos os outros domínios do sistema.

**Funcionalidades:**
- Cadastro de pessoas com nome, relacionamento, contatos (telefone, email, Instagram, Telegram), cidade e notas
- Apelidos globais únicos (`alias`) — um apelido pertence a exatamente uma pessoa
- Datas importantes (aniversários, formaturas, casamentos...) com suporte a recorrência anual
- Smart-match (`find_people`): busca por nome ou apelido, insensível a maiúsculas e acentos
- Soft delete — pessoa removida preserva todos os vínculos históricos
- Resumo cross-agent (`get_person_summary`): consolida finanças, tarefas, livros e diário ligados à pessoa
- Integração com outros agentes: `create_transaction`, `create_task`, `add_book` e `upsert_bullet` aceitam `person_ids` e gravam vínculos na mesma transação PostgreSQL (tudo-ou-nada)

**Armazenamento:** PostgreSQL — tabelas `people`, `person_aliases`, `person_dates`, `person_links`.

---

### Violet — diário pessoal (Journal)
Diário bullet journal com extração automática de menções (`@pessoa`, `#tag`) e busca full-text. **Já é totalmente usável via webapp** (`/api/journal/*`, shell `violet/`); como agente Telegram ainda está pendente (existem as tools, falta o `agent.py` e o wiring no coordinator).

**Funcionalidades:**
- Uma página por dia, criada automaticamente
- Bullets numerados por posição (upsert por posição), com timestamp de criação (`created_at`)
- Extração automática de `@pessoa` e `#tag` de cada bullet
- Busca full-text com dicionário português
- Heatmap anual de atividade (quantidade de bullets por dia)
- **Registro emocional TCC** — formulário de Registro de Pensamentos: situação → emoção + intensidade (0–10) → pensamento automático → resposta adaptativa → reavaliação de intensidade; vocabulário de 8 emoções-base predefinidas + emoções custom criadas pelo usuário
- **Aba Emoções nos Insights** — frequência, intensidade média e distribuição mensal das emoções registradas no ano selecionado
- **Filtro de ano nos Insights** — seleciona qualquer ano com entradas no diário

**Armazenamento:** PostgreSQL — tabelas `journal_types`, `journal_pages`, `journal_bullets`, `journal_mentions`, `journal_emotions`, `journal_emotion_logs`.

---

## Estrutura de arquivos

```
makima_personal_agent/
├── coordinator/     # bot Telegram + Makima (Agent ADK) — ver coordinator/CLAUDE.md
├── agents/          # um pacote por especialista (nami, kaguya, kurisu, frieren,
│                    # akane, marin, mai, komi, journal) — cada um com CLAUDE.md próprio
├── mcp_servers/     # servidor MCP do Google Calendar
├── webapp/          # FastAPI + React: 10 routers e 9 shells — ver webapp/CLAUDE.md e webapp/docs/
├── scripts/         # setup de schemas, OAuth (Calendar/MAL), syncs e migrações one-time
├── specs/           # specs por fatia (Spec Kit, 001..030) — artefatos históricos imutáveis
├── docs/            # documentação por tipo: referencia/ · planos/ · arquivo/ — ver docs/README.md
├── ROADMAP.md       # fonte única da verdade: fases, status atual e pendências
└── CLAUDE.md        # guia do repo para desenvolvimento (inclui a árvore de arquivos detalhada)
```

> A árvore detalhada, arquivo a arquivo, vive no [CLAUDE.md](CLAUDE.md) — aqui fica só o mapa de topo, para não manter duas árvores grandes em sincronia.

---

## Comandos Telegram

| Comando | O que faz |
|---|---|
| `/limpar` | Reseta o contexto de todos os domínios (nova conversa do zero) |
| `/limpar financas` | Reseta só o contexto de finanças (Nami) |
| `/limpar livros` | Reseta só o contexto de livros (Frieren) |
| `/limpar tarefas` | Reseta só o contexto de tarefas/agenda (Kaguya) |
| `/limpar knowledge` | Reseta só o contexto de knowledge base (Kurisu) |
| `/limpar filmes` | Reseta só o contexto de filmes (Akane) |
| `/limpar animes` | Reseta só o contexto de animes (Marin) |
| `/limpar series` | Reseta só o contexto de séries de TV (Mai) |
| `/limpar pessoas` | Reseta só o contexto de pessoas e contatos (Komi) |
| `/tokens` | Exibe o total de tokens consumidos por domínio nesta sessão do container |

> O bot avisa automaticamente quando o contexto de um domínio está ficando grande e sugere o `/limpar <dominio>`.
> O contador de `/tokens` reseta ao reiniciar o container.

---

## Pré-requisitos

- Python 3.12+
- PostgreSQL (gerenciado pelo Dokploy no VPS)
- Google Cloud com Calendar API habilitada
- App OAuth 2.0 (tipo Desktop) no Google Cloud Console para o Calendar
- App OAuth 2.0 (tipo Web Application) no Google Cloud Console para a webapp
- Bot Telegram criado via [@BotFather](https://t.me/BotFather)

---

## Instalação local

```bash
# Clonar e criar ambiente virtual
git clone https://github.com/Gusstavo42/makima_personal_agent
cd makima_personal_agent
python -m venv .venv

# Ativar e instalar dependências
.venv\Scripts\activate         # Windows
# source .venv/bin/activate    # Linux/Mac
pip install -r requirements.txt
```

---

## Variáveis de ambiente

Crie um arquivo `.env` na raiz com as variáveis abaixo (ou configure no Dokploy para o VPS):

```env
# Telegram
TELEGRAM_BOT_TOKEN=

# Google AI
GEMINI_API_KEY=

# PostgreSQL — banco compartilhado para todos os agentes e sessões ADK
DATABASE_URL=postgresql://user:pass@host:5432/db

# Google Cloud Storage — backup automático do PostgreSQL
GCP_CREDENTIALS_JSON=     # conteúdo JSON do service account como string (não path)
GCP_PROJECT_ID=
GCS_BACKUP_BUCKET=        # nome do bucket GCS para backups (ex: makima-backups)

# Google Calendar OAuth
GOOGLE_CALENDAR_CLIENT_ID=
GOOGLE_CALENDAR_CLIENT_SECRET=
GOOGLE_CALENDAR_ACCESS_TOKEN=
GOOGLE_CALENDAR_REFRESH_TOKEN=
GOOGLE_CALENDAR_TOKEN_EXPIRY=      # ISO 8601
GOOGLE_CALENDAR_MAIN_CALENDAR_ID=  # geralmente o email Gmail

# Frieren — Google Books API (opcional)
# Sem a chave o limite é ~1.000 req/dia; com ela sobe para 10.000 req/dia
GOOGLE_BOOKS_API_KEY=

# Akane e Mai — TMDB (filmes e séries)
TMDB_API_KEY=                  # API key v3 do TMDB (themoviedb.org → Settings → API), usada por filmes E séries
LETTERBOXD_USERNAME=           # username do Letterboxd (ex: gustavobarreto) para sync do RSS (Akane)

# Marin — MyAnimeList OAuth2
MAL_CLIENT_ID=                 # App ID do MAL (myanimelist.net → Account → API → Create Application)
MAL_CLIENT_SECRET=             # Client Secret do mesmo app MAL
# Tokens MAL são persistidos no PostgreSQL (mal_sync_state) — nunca colocar aqui
# Gerar com: python scripts/authorize_mal.py (interativo, roda uma vez)

# Kurisu — Vertex AI RAG (fase 3)
VERTEX_RAG_CORPUS=             # projects/{PROJECT_ID}/locations/us-central1/ragCorpora/{ID}

# Lucy — Gmail via IMAP (fase 4 / spec 032)
GMAIL_USERNAME=                # endereço Gmail (login IMAP)
GMAIL_APP_PASSWORD=            # senha de app do Gmail (não a senha normal — requer 2FA)
TELEGRAM_ALERT_CHAT_ID=        # chat que recebe o digest matinal e os alertas do scheduler
# GEMINI_MODEL=gemini-2.5-flash  # opcional — modelo usado na classificação do digest

# Webapp (interface web)
ALLOWED_EMAIL=                     # e-mail Google autorizado a logar na webapp
SESSION_SECRET=                    # segredo para assinar cookies (gerar: python -c "import secrets; print(secrets.token_hex(32))")
GOOGLE_OAUTH_CLIENT_ID=            # client ID do app OAuth tipo Web Application
GOOGLE_OAUTH_CLIENT_SECRET=        # client secret do mesmo app
OAUTH_REDIRECT_URL=                # URL de callback (ex: https://makima.seudominio.com/auth/callback)
```

---

## Setup inicial

### 1. Criar tabelas no PostgreSQL

```bash
DATABASE_URL=... python scripts/setup_schemas.py
```

### 2. Cadastrar contas bancárias (Nami)

Antes de registrar transações, cadastre as contas via Telegram:

```
"Nami, cria uma conta chamada Itau, tipo corrente, início 2026-01-01"
```

Depois cadastre os cartões de crédito:

```
"Nami, cadastra meu cartão Nubank, conta Itau, limite 1600, taxa 16.1% ao mês, fechamento dia 6, vencimento dia 13"
```

> Cartões de crédito não são contas — não crie conta do tipo "cartão de crédito". O cartão rastreia a dívida separadamente.

### 3. Autorizar o Google Calendar

1. Google Cloud Console → **APIs → Biblioteca** → habilitar **Google Calendar API**
2. Criar credencial **OAuth 2.0 tipo Desktop app** → baixar JSON → salvar como `scripts/client_secret.json`
3. Executar:

```bash
python scripts/authorize_calendar.py
```

O script abre o browser, solicita permissão e imprime os valores para copiar ao `.env`.

---

## Rodar localmente

```bash
python -m coordinator.main
```

Os agentes usam `gemini-2.5-flash`. A chave é lida de `GEMINI_API_KEY` (Google AI Studio). Para usar Vertex AI, definir `GOOGLE_GENAI_USE_VERTEXAI=1`.

Para rodar a webapp localmente:

```bash
# Backend
uvicorn webapp.backend.main:app --reload --port 8080

# Frontend (em webapp/frontend/)
npm install && npm run dev   # dev server em localhost:5173
```

---

## Deploy (VPS com Dokploy)

- Host: Hostinger com Dokploy
- Dois containers no mesmo Docker Compose: `makima` (bot Telegram) e `web` (FastAPI + React)
- Porta interna `8080` — exposta pelo proxy reverso do Dokploy como HTTPS
- Variáveis configuradas no painel do Dokploy
- Deploy automático via push para o GitHub

---

## Fases de implementação

O histórico completo de fases e o status atual vivem no **[ROADMAP.md](ROADMAP.md)** — fonte única da verdade.

Resumo (jul/2026): fases 001–027, 029, 030, 031 e 032 (Lucy/email, scheduler) entregues; 028 (memória unificada da Kurisu) parcial.

---

## Dependências

```
google-adk               # framework de agentes (Agent, InMemoryRunner, McpToolset)
python-telegram-bot      # bot Telegram
python-dotenv            # carrega variáveis do arquivo .env
requests                 # HTTP para APIs externas
asyncpg                  # driver async PostgreSQL (ADK DatabaseSessionService)
sqlalchemy               # ORM usado internamente pelo ADK
psycopg2-binary          # driver síncrono PostgreSQL (tools dos agentes)
google-cloud-storage     # backup automático para GCS
mcp                      # Model Context Protocol (servidor MCP do Google Calendar)
google-auth              # OAuth do Google Calendar
google-auth-oauthlib     # fluxo OAuth desktop
google-api-python-client # Google Calendar API v3
fastapi                  # backend web
uvicorn[standard]        # servidor ASGI
authlib                  # Google OAuth (OIDC) para a webapp
itsdangerous             # assina cookies de sessão
```
