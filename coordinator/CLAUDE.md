# CLAUDE.md — coordinator

## Personalidade da Makima

Inspirada na Makima de Chainsaw Man — calma, autoritária, cordial mas levemente superior.

- Nunca usa frases de subordinação ("posso ajudar?", "claro!", "com prazer!")
- Sempre começa a resposta com `Makima:`
- Enquadra limitações como decisões, não falhas: "Esse recurso ainda não foi ativado."
- Nunca quebra o personagem
- Formata em HTML (não markdown) — Telegram renderiza HTML

---

## Infraestrutura

### VPS
- **Host**: `n8n.gusstavo42-vps.cloud` (Hostinger, Dokploy)
- Container separado no mesmo Docker Compose do n8n
- Porta interna: `8080` (não exposta externamente)

### Variáveis de ambiente (configurar no Dokploy)

```
TELEGRAM_BOT_TOKEN              # token do bot da Makima
GEMINI_API_KEY                  # chave do Google AI Studio (modelo Gemini dos agentes)
NOTION_TOKEN                    # token da integração Notion (uso futuro — media/books)
GCP_CREDENTIALS_JSON            # conteúdo JSON do service account GCP como string (BigQuery + Vertex AI)
GCP_PROJECT_ID                  # projeto GCP (mesmo do BigQuery)
TICKTICK_ACCESS_TOKEN           # token OAuth do TickTick
TICKTICK_CLIENT_ID              # client ID do app TickTick
TICKTICK_CLIENT_SECRET          # client secret do app TickTick
TICKTICK_REFRESH_TOKEN          # refresh token OAuth
TICKTICK_EXPIRES_AT             # ISO 8601 — data de expiração do access token
GOOGLE_CALENDAR_CLIENT_ID       # client ID do app OAuth do Google Calendar
GOOGLE_CALENDAR_CLIENT_SECRET   # client secret do app OAuth
GOOGLE_CALENDAR_ACCESS_TOKEN    # access token OAuth
GOOGLE_CALENDAR_REFRESH_TOKEN   # refresh token OAuth
GOOGLE_CALENDAR_TOKEN_EXPIRY    # ISO 8601 — data de expiração do access token
GOOGLE_CALENDAR_MAIN_CALENDAR_ID # ID do calendário principal (geralmente o email Gmail)
VERTEX_RAG_CORPUS               # ID do corpus Vertex AI RAG (após ativar Kurisu)
GOOGLE_BOOKS_API_KEY            # (opcional) chave da Google Books API — aumenta cota de 1000 para 10.000 req/dia
TMDB_API_KEY                    # API key v3 do TMDB — Akane (filmes), Mai (séries), Marin (thumbnails)
LETTERBOXD_USERNAME             # username público do Letterboxd — sync RSS automático da Akane
GMAIL_USERNAME                   # endereço Gmail — login IMAP da Lucy (agente + digest, spec 032)
GMAIL_APP_PASSWORD               # senha de app do Gmail (IMAP + 2FA) — Lucy
DATABASE_URL                    # connection string do PostgreSQL separado no Dokploy
                                # formato: postgresql://user:pass@host:5432/db
                                # o código adiciona +asyncpg automaticamente
```

---

## Autenticação BigQuery (padrão para todos os agentes)

Todo agente que usa BigQuery deve seguir o padrão da Nami — **sem arquivo de service account montado no container**:

- **Env var**: `GCP_CREDENTIALS_JSON` — conteúdo completo do JSON do service account como string (copiar do GCP Console → IAM → Service Accounts → Chaves → Criar chave JSON → copiar o conteúdo)
- **No código** (`_client()` em `tools.py`): usar `service_account.Credentials.from_service_account_info(json.loads(creds_json))` — nunca `from_service_account_file`
- **Motivo**: `GOOGLE_APPLICATION_CREDENTIALS` aponta para um arquivo que não existe dentro do container Docker/Dokploy. Passar o JSON como string na env var elimina a necessidade de montar volumes ou copiar arquivos.
- **Singleton**: cachear o cliente em `_bq_client: bigquery.Client | None = None` (global) para reutilizar a conexão entre chamadas de tool.

Exemplo canônico: `agents/nami/tools.py` função `_client()`.

---

## Sessão Telegram

`DatabaseSessionService` do ADK — sessões persistidas em PostgreSQL por domínio. O histórico de conversa sobrevive a reinícios do container.

**Banco de dados**: serviço separado criado no Dokploy (Databases → PostgreSQL), **não** embutido no `docker-compose.yml`. Isso garante que os dados persistam mesmo se o serviço Makima for recriado.

**Variável `DATABASE_URL`**: configurada no painel de Environment do Dokploy (não no `.env` do repo). O Dokploy gera a URL com prefixo `postgresql://`; o código normaliza automaticamente para `postgresql+asyncpg://` (driver async exigido pelo ADK).

### Sessões por domínio

Para evitar que o histórico de todas as conversas se acumule em uma única sessão (desperdiçando tokens), o coordinator usa `session_id = "{chat_id}_{domain}"`:

| session_id | Histórico de |
|---|---|
| `<chat_id>_financas` | Conversas com a Nami (finanças) |
| `<chat_id>_livros` | Conversas com a Frieren (livros) |
| `<chat_id>_tarefas` | Conversas com a Kaguya (tarefas + agenda) |
| `<chat_id>_knowledge` | Conversas com a Kurisu (knowledge base) |
| `<chat_id>_filmes` | Conversas com a Akane (filmes, cinemateca) |
| `<chat_id>_animes` | Conversas com a Marin (animes, episódios, MAL sync) |
| `<chat_id>_series` | Conversas com a Mai (séries de TV, episódios, TMDB) |
| `<chat_id>_geral` | Tudo que não se encaixa nos domínios acima |

A função `_classify_domain(text)` em `coordinator/main.py` faz a classificação por palavras-chave, sem custo de LLM. O `user_id` continua sendo o `chat_id` puro — o domínio só altera o `session_id`.

### Comandos de gerenciamento de sessão

| Comando | O que faz |
|---|---|
| `/tokens` | Exibe tokens acumulados por domínio neste processo (reseta no restart) |
| `/limpar` | Deleta todas as sessões do usuário no banco |
| `/limpar <dominio>` | Deleta apenas a sessão do domínio especificado (ex.: `/limpar financas`) |

O aviso de contexto grande (> 80.000 tokens em um domínio) é exibido automaticamente antes da resposta quando o threshold é atingido.

### Rede Docker

O banco roda na `dokploy-network`. O `docker-compose.yml` conecta a Makima a essa rede como externa para que o hostname interno do banco resolva dentro do container:

```yaml
networks:
  dokploy-network:
    external: true
```

Se o hostname interno do banco não resolver (`Temporary failure in name resolution`), verificar se o container do banco está em `dokploy-network`:

```bash
docker inspect <container-do-banco> --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{"\n"}}{{end}}'
```

---

## MCP Server — Google Calendar (`mcp_servers/calendar/server.py`)

Processo filho stdio iniciado pelo ADK via `McpToolset` da Kaguya. Veja `agents/kaguya/CLAUDE.md` para detalhes completos de configuração.

### Tools expostas

| Tool | Descrição |
|---|---|
| `list_calendars` | Lista todos os calendários do usuário |
| `list_events` | Eventos de um período (qualquer calendário) |
| `list_events_today` | Eventos de hoje (exclui calendários bloqueados) |
| `get_event` | Detalhes de um evento específico |
| `create_event` | Cria evento (apenas no calendário principal) |
| `update_event` | Atualiza evento (apenas no calendário principal) |
| `delete_event` | Remove evento (apenas no calendário principal) |
| `find_free_slots` | Encontra horários livres em um intervalo |

### Comportamento importante

- **Leitura**: todos os calendários. **Escrita**: apenas `GOOGLE_CALENDAR_MAIN_CALENDAR_ID`
- Timeout: 30s
- `list_events_today` filtra o calendário **"TickTick"** (sincronizado externamente) via `_BLOCKED_CALENDARS`
- Para bloquear outros calendários externos, adicionar o nome ao conjunto `_BLOCKED_CALENDARS` em `server.py`
- Fuso horário: `America/Sao_Paulo` (UTC-3) — timestamps usam `-03:00`
- `expiry` passado como datetime **naive UTC** ao objeto `Credentials` — google-auth compara internamente com `datetime.utcnow()` (também naive); passar aware datetime causa `TypeError`
- Refresh automático de token OAuth (usa `creds.valid` do google-auth)

### Gerar credenciais OAuth (primeira vez)

1. Google Cloud Console → projeto do BigQuery → APIs e Serviços → Biblioteca → habilitar **Google Calendar API**
2. Criar credencial OAuth 2.0 tipo **Desktop app** → baixar JSON → salvar como `scripts/client_secret.json`
3. Rodar `python scripts/authorize_calendar.py` — abre browser, imprime os valores das env vars
4. Copiar os valores para `.env` e para o Dokploy

---

## Notas técnicas do coordinator

### Telegram parse_mode + sanitização de HTML

As respostas são enviadas com `parse_mode="HTML"`. **Antes** do envio, `_sanitize_telegram_html()` em `main.py` converte as tags que o Telegram **não** suporta (`<ul>`, `<li>`, `<ol>`, `<p>`, `<h1>`…) em bullets de texto (`•`) / quebras de linha, e remove o resto — mantendo as tags válidas (`<b>`, `<i>`, `<u>`, `<s>`, `<code>`, `<pre>`, `<a>`, `<blockquote>`, `<tg-spoiler>`).

Por que existe: o LLM às vezes gera `<ul>/<li>` apesar da instrução. Sem sanitizar, o Telegram rejeita a mensagem inteira (`BadRequest: unsupported start tag "ul"`) e ela **some**; um fallback antigo enviava texto puro, mas aí as tags `<b>` apareciam **cruas** na tela. A sanitização resolve os dois: lista vira bullet, negrito é renderizado. Se mesmo o HTML sanitizado falhar, o fallback (`_strip_all_tags`) envia texto puro — a mensagem nunca se perde.

### sub_agents vs AgentTool

Com `sub_agents`, o sub-agente gera a resposta final — Makima não tem como adicionar texto depois. Com `AgentTool`, Makima fala por último mas o sub-agente não completa ciclos multi-turn (tool calls intermediárias são perdidas). Decisão atual: usar `sub_agents` para garantir que os agentes completem suas queries corretamente.

### Agentes com MCP precisam de factory

Agentes que usam `McpToolset` precisam de uma factory function (`create_X_agent()`) em vez de instância global, porque o `McpToolset` não pode ser reutilizado entre sessões. O coordinator chama a factory em `create_makima()`. Agentes que não usam MCP (Nami, Frieren, Kurisu) são singletons globais.
