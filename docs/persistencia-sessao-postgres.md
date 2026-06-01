# Plano: Persistência de Sessão com PostgreSQL

## Contexto

Atualmente o Makima usa `InMemoryRunner` do Google ADK — todas as sessões (histórico de conversa e memória de longo prazo) são perdidas quando o container reinicia. O objetivo é substituir o runner por `DatabaseSessionService` apontando para um PostgreSQL externo, adicionado ao `docker-compose.yml` como serviço separado.

---

## Abordagem

O ADK fornece `DatabaseSessionService` para Postgres. A sessão ADK armazena automaticamente o histórico de mensagens e o `state` (dict livre, usado para memória de longo prazo) no banco.

**Stack escolhida:** PostgreSQL como serviço Docker no mesmo Compose + `asyncpg` como driver.

---

## Mudanças necessárias

### 1. `docker-compose.yml`
Adicionar serviço `postgres` e conectar ao `makima` via rede interna:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: makima-postgres
    environment:
      POSTGRES_DB: makima
      POSTGRES_USER: makima
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

  makima:
    ...
    depends_on:
      - postgres
    environment:
      DATABASE_URL: postgresql+asyncpg://makima:${POSTGRES_PASSWORD}@postgres:5432/makima

volumes:
  postgres_data:
```

### 2. `requirements.txt`
Adicionar:
```
asyncpg          # driver async para PostgreSQL (exigido pelo ADK DatabaseSessionService)
sqlalchemy       # ORM usado internamente pelo ADK para criar as tabelas
```

### 3. `coordinator/main.py`
Substituir `InMemoryRunner` por `Runner` com `DatabaseSessionService`:

```python
# Antes
from google.adk.runners import InMemoryRunner
runner = InMemoryRunner(agent=makima, app_name=APP_NAME)

# Depois
from google.adk.runners import Runner
from google.adk.sessions import DatabaseSessionService

DATABASE_URL = os.environ["DATABASE_URL"]
session_service = DatabaseSessionService(db_url=DATABASE_URL)
runner = Runner(agent=makima, app_name=APP_NAME, session_service=session_service)
```

O `DatabaseSessionService` cria as tabelas automaticamente na primeira execução. A lógica de `ensure_session` permanece igual — o `create_session` passa a ser idempotente via banco (já existindo, não duplica).

### 4. `.env` (e Dokploy)
Adicionar:
```
POSTGRES_PASSWORD=<senha-segura>
DATABASE_URL=postgresql+asyncpg://makima:<senha>@postgres:5432/makima
```

---

## Memória de longo prazo

O `state` da sessão ADK é um dict livre persistido no Postgres junto com o histórico. Para que os agentes usem memória de longo prazo, basta instruir o coordinator a gravar fatos no `state` via `ToolContext` quando relevante — isso é uma evolução futura, não parte desta implementação. A infraestrutura já suporta após esta mudança.

---

## Arquivos críticos

| Arquivo | Mudança |
|---|---|
| `docker-compose.yml` | Adicionar serviço `postgres` + volume + `depends_on` |
| `requirements.txt` | Adicionar `asyncpg`, `sqlalchemy` |
| `coordinator/main.py` | Trocar `InMemoryRunner` → `Runner` + `DatabaseSessionService` |
| `.env` | Adicionar `POSTGRES_PASSWORD`, `DATABASE_URL` |

---

## Verificação

1. `docker compose up --build` — checar logs de startup sem erro de conexão
2. Enviar mensagem no Telegram → bot responde normalmente
3. `docker compose restart makima` — enviar nova mensagem → bot ainda lembra contexto da conversa anterior
4. Inspecionar o banco: `docker exec -it makima-postgres psql -U makima -d makima -c "\dt"` — confirmar tabelas criadas pelo ADK
