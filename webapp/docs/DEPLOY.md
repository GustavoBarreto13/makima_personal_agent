# Deploy e Operação

## Container Docker

O webapp é distribuído como um único container que inclui tanto o backend Python quanto o build do
frontend React.

**Dockerfile** (`webapp/backend/Dockerfile`) — multi-stage:

```
Stage 1: node:20-alpine (frontend-builder)
  - COPY webapp/frontend/package*.json → npm ci
  - COPY webapp/frontend/ → npm run build → gera /app/frontend/dist/

Stage 2: python:3.12-slim
  - pip install -r requirements.txt
  - COPY . .  (todo o repositório: agents/, coordinator/, webapp/, scripts/, etc.)
  - COPY --from=frontend-builder /app/frontend/dist  webapp/frontend/dist
  - EXPOSE 8080
  - CMD ["uvicorn", "webapp.backend.main:app", "--host", "0.0.0.0", "--port", "8080"]
```

O contexto do build é a **raiz do repositório** (não `webapp/`) porque o backend importa
`agents/`, que está fora do diretório `webapp/`.

## docker-compose

O `docker-compose.yml` na raiz define 4 serviços:

| Serviço | Container | Porta | Papel |
|---|---|---|---|
| `web` | `makima-web` | `8080:8080` | webapp (FastAPI + React) |
| `makima` | `makima-bot` | — | bot Telegram (coordinator) |
| `adminer` | — | `127.0.0.1:8082` | UI de banco (acesso local) |
| `backup` | — | — | pg_dump diário → GCS |

Ambos os serviços `web` e `makima` estão na rede `dokploy-network` (externa) para que o
reverse proxy do Dokploy consiga rotear o tráfego.

## Variáveis de ambiente

Definidas em `webapp/backend/config.py` — essa é a **fonte da verdade**. Configure-as no painel
do Dokploy (ou em `.env` para desenvolvimento local).

| Variável | Obrigatória | Valor padrão (inseguro) | Descrição |
|---|---|---|---|
| `SESSION_SECRET` | ✅ | `dev-secret-change-me` | Chave de assinatura do cookie. Gerar com `python -c "import secrets; print(secrets.token_hex(32))"`. Se estiver no padrão, o app loga um aviso. |
| `ALLOWED_EMAIL` | ✅ | `""` (qualquer um passa) | Único e-mail autorizado. Comparação case-insensitive. |
| `GOOGLE_OAUTH_CLIENT_ID` | ✅ | `""` | Client ID do OAuth no GCP Console. |
| `GOOGLE_OAUTH_CLIENT_SECRET` | ✅ | `""` | Client Secret do OAuth no GCP Console. |
| `OAUTH_REDIRECT_URL` | ✅ | `http://localhost:8080/auth/callback` | URL de callback registrada no GCP. Em produção: `https://<dominio>/auth/callback`. Se começa com `https://`, o cookie `makima_session` terá a flag `Secure`. |
| `DATABASE_URL` | ✅ | `""` | DSN PostgreSQL. Exemplo: `postgresql://user:pass@host:5432/dbname`. O sufixo `+asyncpg` adicionado pelo ADK é removido automaticamente por `agents/db.py`. |

> **GCP_PROJECT_ID e GCP_CREDENTIALS_JSON** são lidas diretamente pelas tools dos agentes
> (`agents/nami/`, `agents/frieren/`, etc.) e pelo script de backup. O `config.py` do webapp
> **não** as exporta — elas precisam estar no ambiente mas não são de responsabilidade do webapp.

## Deploy em produção (Dokploy + Hostinger VPS)

O deploy é feito automaticamente por push na branch `master`:

1. Dokploy detecta o push via webhook GitHub.
2. Faz `docker build` usando `webapp/backend/Dockerfile` com contexto na raiz.
3. Substitui o container `makima-web` rodando (zero-downtime via Traefik).
4. O reverse proxy Traefik roteia `makima.gusstavo42-vps.cloud` → porta 8080 com TLS automático.

## Migrations de banco

Migrations são scripts Python avulsos que devem ser rodados **dentro do container** (o hostname
do PostgreSQL é um nome de serviço Docker Swarm e não é resolvível fora da rede interna):

```bash
# Migração do schema webapp Nami (adiciona colunas visuais e cria personal_loans/financings)
docker exec makima-web sh -c "cd /app && python -m scripts.migrate_nami_webapp"

# Script genérico para qualquer outro script de manutenção
docker exec makima-web sh -c "cd /app && python -m scripts.<nome_do_script>"
```

Se o script não estiver na imagem, copie-o antes:

```bash
docker cp scripts/meu_script.py makima-web:/app/scripts/meu_script.py
docker exec makima-web sh -c "cd /app && python -m scripts.meu_script"
```

## Rodar localmente

### Pré-requisitos

- Python 3.12+ com venv (`python -m venv .venv`)
- Node.js 20+
- Instância PostgreSQL acessível
- Credenciais OAuth configuradas no [GCP Console](https://console.cloud.google.com/) com URI de
  redirecionamento `http://localhost:8080/auth/callback`

### Passo a passo

```bash
# 1. Instalar dependências Python (na raiz do repositório)
source .venv/bin/activate          # Linux/Mac
# .venv\Scripts\activate           # Windows

pip install -r requirements.txt

# 2. Configurar variáveis de ambiente (copie e edite)
cp .env.example .env               # se existir; senão crie o arquivo manualmente

# 3. Iniciar o backend FastAPI
uvicorn webapp.backend.main:app --reload --port 8080

# 4. Em outra aba de terminal — instalar dependências JS e iniciar o frontend
cd webapp/frontend
npm install
npm run dev                        # dev server em http://localhost:5173
```

Abra `http://localhost:5173`. O Vite proxy repassa `/api/*` e `/auth/*` para o backend.

### Problema conhecido: conflito de porta no proxy do Vite

`webapp/frontend/vite.config.ts` está configurado para fazer proxy para `localhost:8000`:

```ts
// vite.config.ts (situação atual — há discrepância)
proxy: {
  '/api': 'http://localhost:8000',
  '/auth': 'http://localhost:8000',
}
```

Porém o backend é instruído a rodar na **porta 8080** em toda a documentação e no Dockerfile.

**Workaround enquanto a inconsistência não for corrigida:** suba o uvicorn na porta 8000:

```bash
uvicorn webapp.backend.main:app --reload --port 8000
```

Ou edite `vite.config.ts` para apontar para `:8080` durante o desenvolvimento local.

### Build de produção local

```bash
cd webapp/frontend
npm run build      # gera webapp/frontend/dist/

# Testar o build servido pelo FastAPI (sem o Vite, igual à produção)
cd ../..           # volta à raiz do repositório
uvicorn webapp.backend.main:app --port 8080
# Abra http://localhost:8080
```

## Checklist de primeiro deploy

- [ ] `SESSION_SECRET` gerado com `secrets.token_hex(32)` (nunca usar o padrão)
- [ ] `ALLOWED_EMAIL` configurado com o e-mail correto
- [ ] URI de redirecionamento `https://<dominio>/auth/callback` cadastrado no GCP OAuth
- [ ] `OAUTH_REDIRECT_URL` com `https://` para ativar a flag `Secure` no cookie
- [ ] `DATABASE_URL` apontando para o PostgreSQL do Swarm
- [ ] Migration `migrate_nami_webapp` executada dentro do container após o primeiro deploy
- [ ] Health check `GET https://<dominio>/api/healthz` retorna `{"status": "ok"}`
