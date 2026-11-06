# Makima Personal Agent

Assistente pessoal multicanal (Telegram, WhatsApp e Discord, mais um painel web e um app Android em construção) que entende mensagens em linguagem natural e delega para 11 especialistas: finanças, tarefas e agenda, conhecimento, livros, filmes, animes, séries, pessoas, email, diário e viagens.

Versões e histórico de mudanças: [CHANGELOG.md](CHANGELOG.md) · [Releases](https://github.com/GustavoBarreto13/makima_personal_agent/releases).

---

## Como funciona (em 30 segundos)

```
Telegram / WhatsApp / Discord      Painel web (React)      App Android (Capacitor)
            ↓                              ↓                         ↓
   Hermes Agent (gateway)             API FastAPI  ←──── mesmo login Google, mesmos dados
            ↓ MCP HTTP (bearer token)       ↓
   makima-mcp: um servidor por domínio      └──→ chama direto as funções dos agentes
            ↓
   agents/<nome>/  →  PostgreSQL + APIs externas (TMDB, MAL, Google, Gmail, Vertex AI…)
```

- **Hermes Agent** (Nous Research) é quem conversa com você: lembra do que foi dito, entende áudio e imagem e atende os três canais com a mesma memória.
- **makima-mcp** (`mcp_servers/makima/`) expõe as ferramentas de cada agente ao Hermes — um servidor por domínio, de `/mcp/nami` a `/mcp/yato`, mais `/mcp/calendar` (Google Calendar).
- **Agentes** (`agents/`) concentram **toda** a lógica de negócio: acesso ao banco e às APIs. Nem o Hermes nem o painel web reimplementam nada, só chamam essas funções.
- **Scheduler** (`scheduler/`) roda os jobs agendados: backup do banco, digests da manhã, sincronizações, alertas.
- Tudo grava no mesmo **PostgreSQL**: uma transação lançada no WhatsApp aparece na web e no app, e vice-versa.
- O bot Telegram original (`coordinator/`, Google ADK) continua no repo para rodar localmente e como via de rollback, mas está desligado em produção.

---

## Uso rápido

Mande mensagens como se falasse com uma pessoa. A Makima identifica o domínio sozinha:

| Mensagem | Quem responde | O que acontece |
|---|---|---|
| "gastei 35 no almoço, débito Itaú" | Nami 💰 | Registra a despesa |
| "quanto ainda posso gastar esse mês?" | Nami 💰 | Renda − gastos − parcelas e contas que ainda vão sair |
| "paguei a Netflix, 55 reais" | Kaguya + Nami | Conclui a tarefa e lança a despesa na mesma transação |
| "adiciona tarefa: revisar relatório até sexta" | Kaguya 📋 | Cria a tarefa (listas, tags, recorrência, Meu Dia) |
| "marca dentista amanhã às 15h" | Kaguya 📋 | Cria o compromisso no calendário |
| "o que é machine learning?" | Kurisu 🧠 | Busca nas suas notas (Obsidian) via RAG |
| "li até a página 120" / "ouvi até o capítulo 12" | Frieren 📚 | Registra a leitura na unidade do livro |
| "vi Duna 2, nota 4.5, fui com a Ana" | Akane 🎬 | Registra a sessão no diário de filmes |
| "assisti os eps 1 a 4 de Frieren" | Marin 📺 | Registra no diário de animes (sincroniza com o MyAnimeList) |
| "terminei a temporada 2 de Severance" | Mai 🍿 | Atualiza o progresso da série |
| "falei com a Ana ontem" / "a Bia gosta de orquídeas" | Komi 👤 | Registra o contato / guarda a anotação |
| "meus emails não lidos" | Lucy 📧 | Lista a caixa de entrada (somente leitura) |
| "escreve no diário: dia puxado, mas rendeu" | Violet 📝 | Adiciona ao diário de hoje |
| "monta o roteiro de 3 dias em Paraty" | Yato 🧭 | Roteiro dia a dia + como se locomover sem carro |

Além de responder, ela **avisa por conta própria**: digest de tarefas e emails de manhã, alerta de orçamento, lembretes e a revisão semanal do diário (ver [jobs do scheduler](scheduler/CLAUDE.md)).

---

## Os agentes

Cada agente é um pacote em `agents/<nome>/` com personalidade própria (inspirada num personagem) e um `CLAUDE.md` com tools, regras e armazenamento. **O detalhe vive lá**; aqui fica o mapa.

| Agente | Domínio | O que faz, em uma linha | Tela web |
|---|---|---|---|
| **Makima** (Chainsaw Man) | Coordenação | Só roteia; hoje é a persona do Hermes (`hermes/SOUL.md`) | `/` (Hub) |
| **Nami** (One Piece) | Finanças | Transações, cartões e faturas, parcelas, empréstimos, orçamento, plano do mês, lista de compras | `/nami` |
| **Kaguya** (Kaguya-sama) | Tarefas e agenda | Tarefas/listas/Kanban, Meu Dia, hábitos, metas, foco, calendário integrado ao Google, espaços Trabalho e Pessoal | `/tasks` |
| **Kurisu** (Steins;Gate) | Conhecimento | RAG sobre as notas do Obsidian (Vertex AI), memória unificada, Tutor de Idiomas e Conselho do Dia da Violet | — |
| **Frieren** (Frieren) | Livros | Catálogo, leitura por página/capítulo/volume, estantes, resenhas, mangás sincronizados com o MyAnimeList | `/books` |
| **Akane** (Oshi no Ko) | Filmes | Cinemateca estilo Letterboxd: sessões, notas, listas, favoritos, sync com o Letterboxd | `/movies` |
| **Marin** (My Dress-Up Darling) | Animes | Catálogo e diário de episódios, lançamentos, sync bidirecional com o MyAnimeList | `/animes` |
| **Mai** (Bunny Girl Senpai) | Séries de TV | Catálogo, temporadas/episódios via TMDB, diário com nota | `/series` |
| **Komi** (Komi-san) | Pessoas | Cadastro canônico (três nomes, espaço pessoal/trabalho), aniversários no calendário, Memória cruzando todos os agentes | `/people` |
| **Lucy** (Cyberpunk: Edgerunners) | Email | Lê o Gmail (somente leitura) e manda o digest matinal classificado | — |
| **Violet** (Violet Evergarden) | Diário | Bullet journal, registro emocional (TCC), cartas, Refletir, Insights, Conselho do Dia e revisão semanal. Código em `agents/journal/` | `/journal` |
| **Yato** (Noragami) | Viagens | Roteiro dia a dia, dossiê de mobilidade urbana sem carro, checklist e orçamento (lança na Nami) | `/travel` |

**Integração entre agentes:** a Komi é dona da identidade das pessoas e qualquer agente se liga a ela por um contrato único (`agents/komi/integration.py`) — o passo a passo está no [CLAUDE.md](CLAUDE.md). Kaguya + Nami compartilham a transação de "paguei, conclui e lança".

---

## Interface web

Painel em `makima.gusstavo42-vps.cloud`, com login Google restrito ao e-mail do Gustavo. Compartilha os dados do bot.

| Rota | O que é |
|---|---|
| `/` | **Hub**: resumo de todos os domínios |
| `/nami` | Início ("livre pra gastar"), lançamentos, cartões e faturas, recorrentes, resumo do ano, contas, empréstimos, orçamentos, lista de compras |
| `/tasks` | Meu Dia, listas e visões (lista, quadro, Kanban, Eisenhower), calendário, hábitos, foco, metas, experimentos, revisão semanal, estatísticas |
| `/books` · `/movies` · `/animes` · `/series` | Catálogos de livros, filmes, animes e séries, cada um com diário, listas e estatísticas |
| `/people` | Pessoas, Memória, aniversários, anotações e contatos |
| `/journal` | Diário: escrever, Arquivo, Cartas, Emoções, Refletir, Insights, Conselho do Dia |
| `/travel` | Viagens: roteiro, mobilidade, checklist, orçamento |
| `/design` | Referência viva do Design System |

**Stack:** FastAPI + React 19 + TypeScript + Tailwind, servidos pelo mesmo container. As telas seguem o **Design System Makima** (`webapp/frontend/src/design/`, tokens `--ds-*`); Nami, Kaguya, Frieren, Akane, Marin, Komi e Violet já estão nele — Mai e Yato ainda não (status em [`webapp/docs/DESIGN_CONFORMANCE.md`](webapp/docs/DESIGN_CONFORMANCE.md)).

**PWA e app Android (em andamento):** o site instala como PWA e o app Android (Capacitor, em `webapp/frontend/android/`) mostra o mesmo site com login nativo do Google, notificações push, biometria e links `makima://`. Já roda no celular; faltam as etapas finais (widgets, entrada rápida, chat). Estado atual e roteiro: [`docs/planos/app_android/README.md`](docs/planos/app_android/README.md).

---

## Estrutura do repositório

```
makima_personal_agent/
├── agents/          # um pacote por especialista (nami … yato), cada um com CLAUDE.md próprio
├── mcp_servers/     # makima/ (host MCP multi-domínio) e calendar/ (Google Calendar)
├── hermes/          # persona, config e skills do Hermes Agent — runbook em hermes/CLAUDE.md
├── scheduler/       # jobs agendados (APScheduler) e envio multicanal de notificações
├── webapp/          # backend FastAPI + frontend React/Capacitor — ver webapp/CLAUDE.md e webapp/docs/
├── coordinator/     # bot Telegram original (Google ADK) — legado, só dev local/rollback
├── scripts/         # setup de schemas, OAuth, syncs, migrações e publicação de Releases
├── tests/           # testes de backend (pytest)
├── specs/           # specs por fatia (Spec Kit) — histórico imutável
├── docs/            # referencia/ · planos/ · arquivo/ — ver docs/README.md
├── ROADMAP.md       # fonte única do status das fases e pendências
├── CHANGELOG.md     # histórico de versões
└── CLAUDE.md        # guia de desenvolvimento (árvore completa de arquivos, convenções)
```

---

## Instalação

Pré-requisitos: Python 3.12+, Node 20+ (frontend), PostgreSQL e uma conta Google Cloud (Calendar API, OAuth e Vertex AI). Produção roda em Docker (Dokploy).

```bash
git clone https://github.com/GustavoBarreto13/makima_personal_agent
cd makima_personal_agent
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt  # a lista de dependências vive aqui
touch .env                       # preencha conforme a próxima seção
```

### Variáveis de ambiente

Cada bloco só é necessário para o agente correspondente. A lista oficial do painel web está em [`webapp/docs/DEPLOY.md`](webapp/docs/DEPLOY.md); a do Hermes, em [`hermes/CLAUDE.md`](hermes/CLAUDE.md).

```env
# Base (todos os agentes)
DATABASE_URL=postgresql://user:pass@host:5432/db
GEMINI_API_KEY=                 # Google AI Studio
GCP_PROJECT_ID=
GCP_CREDENTIALS_JSON=           # JSON do service account como string (não é caminho)

# Painel web — login Google
ALLOWED_EMAIL=
SESSION_SECRET=                 # python -c "import secrets; print(secrets.token_hex(32))"
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
OAUTH_REDIRECT_URL=             # https://<domínio>/auth/callback
WEBAPP_PUBLIC_URL=

# App Android (opcional)
GOOGLE_MOBILE_CLIENT_IDS=       # login nativo do Google
FIREBASE_CREDENTIALS_JSON=      # push (FCM); sem ela o canal "push" é só pulado

# Hermes ↔ makima-mcp e notificações
MAKIMA_MCP_TOKEN=               # bearer token do host MCP
HERMES_WEBHOOK_BASE_URL=
WEBHOOK_SECRET=
NOTIFY_DEFAULT_CHANNELS=        # whatsapp,telegram,discord,push
TELEGRAM_BOT_TOKEN=             # hoje pertence ao Hermes
TELEGRAM_ALERT_CHAT_ID=         # alertas de falha do scheduler

# Kaguya — Google Calendar (espelho e Calendar Hub)
GOOGLE_CALENDAR_CLIENT_ID=
GOOGLE_CALENDAR_CLIENT_SECRET=
GOOGLE_CALENDAR_ACCESS_TOKEN=
GOOGLE_CALENDAR_REFRESH_TOKEN=
GOOGLE_CALENDAR_TOKEN_EXPIRY=   # ISO 8601
GOOGLE_CALENDAR_MAIN_CALENDAR_ID=
GCAL_SYNC_ENABLED=true          # "false" desliga só o espelho

# Frieren, Akane, Marin, Mai
GOOGLE_BOOKS_API_KEY=           # opcional: sobe o limite diário
TMDB_API_KEY=                   # v3, usada por filmes e séries
LETTERBOXD_USERNAME=
MAL_CLIENT_ID=                  # MyAnimeList (Marin e mangás da Frieren)
MAL_CLIENT_SECRET=              # tokens ficam no PostgreSQL, nunca aqui

# Kurisu e Violet
VERTEX_RAG_CORPUS=              # projects/<id>/locations/us-central1/ragCorpora/<id>
VIOLET_WEEKLY_REVIEW_HOUR=      # opcional: hora da revisão semanal (padrão: domingo 20:30)

# Lucy
GMAIL_USERNAME=
GMAIL_APP_PASSWORD=             # senha de app (exige 2FA), não a senha normal
```

Há ainda variáveis opcionais de ajuste (`GEMINI_MODEL`, `VIOLET_*`, `KURISU_*`, `KOMI_GEMINI_MODEL`); os padrões estão no código de cada agente.

### Setup inicial

```bash
DATABASE_URL=... python scripts/setup_schemas.py   # cria as tabelas de todos os agentes
python scripts/authorize_calendar.py               # OAuth do Google Calendar (uma vez)
python scripts/authorize_mal.py                    # OAuth do MyAnimeList (uma vez, se for usar)
```

Depois, cadastre suas contas e cartões conversando com a Nami (`"cria uma conta Itaú, tipo corrente"`, `"cadastra meu cartão Nubank, limite 1600, fecha dia 6, vence dia 13"`). Cartão de crédito não é conta: ele rastreia a dívida separadamente.

---

## Rodar localmente

```bash
# Painel web
uvicorn webapp.backend.main:app --reload --port 8080
cd webapp/frontend && npm install && npm run dev      # http://localhost:5173

# Host MCP (o que o Hermes consome)
uvicorn mcp_servers.makima.app:app --port 8090

# Bot Telegram legado, sem precisar do Hermes
python -m coordinator.main
```

Os agentes usam Gemini (`GEMINI_API_KEY`; para Vertex AI, `GOOGLE_GENAI_USE_VERTEXAI=1`).

### Testes

```bash
pytest                                   # backend
cd webapp/frontend && npm test           # frontend (vitest)
cd webapp/frontend && npm run audit:design   # conformidade com o Design System
```

---

## Deploy

VPS Hostinger com Dokploy; o deploy é automático por push na `master`.

- `docker-compose.yml`: `web` (FastAPI + React), `mcp` (host `makima-mcp`), `scheduler` e `adminer`. O serviço `makima` (bot Telegram legado) está comentado.
- `docker-compose.hermes.yml`: o Hermes Agent em app separada no mesmo projeto Dokploy (Telegram, WhatsApp, Discord e dashboard em `hermes.<domínio>`).
- Scripts de migração rodam **dentro** do container (`docker exec makima-web sh -c "cd /app && python -m scripts.<nome>"`), porque o hostname do PostgreSQL só existe na rede interna.
- Detalhes: [`webapp/docs/DEPLOY.md`](webapp/docs/DEPLOY.md), [`scheduler/CLAUDE.md`](scheduler/CLAUDE.md), [`hermes/CLAUDE.md`](hermes/CLAUDE.md).

---

## Versionamento

Uma versão única para o repositório, em SemVer `0.x`. Cada versão é uma tag `vX.Y.Z` na `master`, com notas no [CHANGELOG.md](CHANGELOG.md) e um [Release](https://github.com/GustavoBarreto13/makima_personal_agent/releases) no GitHub. MINOR = funcionalidade, PATCH = correção. O passo a passo para lançar uma versão está no [CLAUDE.md](CLAUDE.md), seção "Versionamento".

---

## Documentação

| Documento | Para quê |
|---|---|
| [ROADMAP.md](ROADMAP.md) | Status de cada fase e pendências (fonte única da verdade) |
| [CLAUDE.md](CLAUDE.md) | Guia de desenvolvimento: convenções, árvore de arquivos, integrações entre agentes |
| [docs/README.md](docs/README.md) | Mapa da documentação (referência · planos · arquivo) |
| [docs/referencia/POSTGRES.md](docs/referencia/POSTGRES.md) | O banco inteiro, tabela por tabela |
| [webapp/docs/](webapp/docs/) | API, arquitetura, deploy, Design System e telas do webapp |
| `agents/<nome>/CLAUDE.md` | Tools, schema e personalidade de cada agente |
| [docs/planos/app_android/](docs/planos/app_android/README.md) | Estudo e roteiro do app Android |
