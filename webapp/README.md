# Makima · Webapp

Painel web da Makima — FastAPI + React num único container, lendo e escrevendo o mesmo PostgreSQL do bot do Telegram.

## O que faz

O webapp é uma interface gráfica sobre os dados que os agentes especialistas da Makima já gerenciam
pelo Telegram. Ele **não roda nenhum modelo de linguagem**: importa as tools dos agentes direto como
funções Python, acessa o mesmo banco PostgreSQL e apresenta tudo numa SPA com tema de personagens.

Domínios disponíveis hoje:

| Domínio | Rota | Personagem | Status |
|---|---|---|---|
| Autenticação (Google OAuth) | `/auth/*` | — | ✅ |
| Finanças | `/nami/*` | Nami | ✅ |
| Livros | `/books/*` | Frieren | ✅ |
| Diário pessoal | `/journal/*` | Violet | ✅ |
| Filmes (cinemateca Akane) | `/movies/*` | Akane | ✅ |
| Animes (catálogo Marin) | `/animes/*` | Marin | ✅ |
| Tarefas/Agenda (Kaguya) | `/tasks/*` | Kaguya | ✅ |
| Séries de TV (Mai) | `/series/*` | Mai | ✅ |
| Pessoas e contatos (Komi) | `/people/*` | Komi | ✅ |
| Hub — Centro de Controle | `/` | Makima | ✅ |
| Painel de chat (Makima/ADK) | — | Makima | não construído |

### Shells vs. páginas legadas

Cada domínio da tabela acima é um **shell**: um mini-app React com sidebar própria, navegação
interna e um arquivo CSS isolado por classe raiz (ex.: `.nami-app`, `.kg-app`) — os estilos de
um domínio não vazam para o outro. Além dos shells, ainda existem **páginas legadas** de
finanças (`/transactions`, `/accounts`, `/cards`, etc.) renderizadas dentro do `Layout` global
com Tailwind; elas continuam roteadas, mas não aparecem na navegação — o shell da Nami é a
interface canônica de finanças.

## Rodar localmente

```bash
# 1. Na raiz do repositório — inicia o backend FastAPI na porta 8000.
#    ATENÇÃO à porta: o proxy do Vite (webapp/frontend/vite.config.ts) repassa
#    /api e /auth para http://localhost:8000 — então, no fluxo de dev com o
#    Vite, o backend PRECISA subir na 8000 (não na 8080).
uvicorn webapp.backend.main:app --reload --port 8000

# 2. Em outra aba, dentro de webapp/frontend/ — inicia o dev server do React na porta 5173
cd webapp/frontend
npm install        # só na primeira vez
npm run dev
```

Abra `http://localhost:5173` no navegador. O Vite faz proxy de `/api` e `/auth` para o backend
na porta **8000**.

> **Sobre 8000 vs 8080:** a porta 8080 é a do **container de produção** (o uvicorn sobe na 8080
> e serve o `dist/` direto, sem Vite). Em dev, ou você sobe o backend na 8000 (como acima), ou
> ajusta o alvo do proxy em `vite.config.ts`. Se subir o backend na 8080 e abrir o `:5173`, as
> chamadas de API falham silenciosamente (proxy apontando para uma porta sem servidor).

## Build de produção

```bash
# Dentro de webapp/frontend/ — gera webapp/frontend/dist/ para ser servido pelo FastAPI
npm run build
```

Em produção o container roda apenas o uvicorn (porta 8080) e ele serve o `dist/` diretamente.
Não é necessário o dev server do Vite.

## Documentação detalhada

| Documento | Conteúdo |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Arquitetura interna, fluxo de dados, autenticação, acoplamento com os agentes |
| [docs/API.md](docs/API.md) | Referência completa de todos os endpoints REST |
| [docs/FRONTEND.md](docs/FRONTEND.md) | Stack, mapa de rotas, shells por personagem, theming, componentes |
| [docs/DEPLOY.md](docs/DEPLOY.md) | Dockerfile, docker-compose, variáveis de ambiente, deploy no Dokploy/VPS |

## Variáveis de ambiente obrigatórias

| Variável | Descrição |
|---|---|
| `SESSION_SECRET` | Chave de assinatura dos cookies (gerar com `secrets.token_hex(32)`) |
| `ALLOWED_EMAIL` | Único e-mail autorizado a entrar (ex.: `gustavobarreto1304@gmail.com`) |
| `GOOGLE_OAUTH_CLIENT_ID` | Client ID do app OAuth no GCP |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Client Secret do app OAuth no GCP |
| `OAUTH_REDIRECT_URL` | URL de callback (dev: `http://localhost:8080/auth/callback`) |
| `DATABASE_URL` | DSN do PostgreSQL compartilhado (ex.: `postgresql://user:pass@host/db`) |

Para detalhes e como configurar no Dokploy, veja [docs/DEPLOY.md](docs/DEPLOY.md).

## Problemas conhecidos

| Problema | Onde está documentado |
|---|---|
| Proxy do Vite aponta para porta **8000**; produção usa **8080** — em dev, subir o backend na 8000 | [Rodar localmente](#rodar-localmente) e [docs/DEPLOY.md § Rodar localmente](docs/DEPLOY.md#rodar-localmente) |
| Docstrings de `finances.py`/`books.py` ainda citam "BigQuery" (storage real é PostgreSQL) | [docs/ARCHITECTURE.md § Camada de dados](docs/ARCHITECTURE.md#camada-de-dados) |
| `webapp/PLAN.md` descreve BigQuery e um `/api/chat` que não existe — é histórico | [docs/ARCHITECTURE.md § Nota sobre PLAN.md](docs/ARCHITECTURE.md#nota-sobre-planmd) |
| Páginas de finanças legadas (`/`, `/transactions`, `/accounts`…) estão roteadas mas não linkadas na sidebar | [docs/FRONTEND.md § Rotas](docs/FRONTEND.md#rotas) |
