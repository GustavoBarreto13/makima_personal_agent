# 01 — O que muda no servidor

O app **não** guarda dados próprios: fala com a mesma API FastAPI. Cinco mudanças são necessárias.

## 1. Login mobile (⭐⭐⭐, a mais delicada)

**Problema:** o Google não permite login OAuth dentro de uma WebView, e o login atual depende de cookie
(`makima_session`, `webapp/backend/deps.py::require_user`).

**Solução:**
1. O app usa o login nativo do Google (janela de contas do Android) e recebe um **ID token**.
2. Novo endpoint `POST /auth/mobile` (em `routers/auth.py`) valida o token com o Google e confere
   `ALLOWED_EMAIL`. Se for o Gustavo, devolve um **access token** curto + **refresh token**.
3. `require_user` passa a aceitar **cookie OU `Authorization: Bearer`** (reaproveitando o
   `itsdangerous` que já assina o cookie). O site continua igual.
4. O app guarda os tokens no **Keystore** do Android — nunca em localStorage.
5. Tabela de aparelhos conectados (nome, último uso) com **revogação** individual.

## 2. CORS (⭐)

`webapp/backend/main.py` só libera `http://localhost:5173`. Acrescentar a origem do Capacitor
(`https://localhost`).

## 3. Push (⭐⭐)

- Tabela `push_devices` (token FCM, aparelho, criado_em, último_uso) → documentar em `docs/referencia/POSTGRES.md`.
- `POST /api/devices/push` e `DELETE /api/devices/push/{id}`.
- Novo canal `"push"` em `scheduler/notify_channels.py` (`_KNOWN_CHANNELS`): assim **os 14 jobs** do
  `scheduler/registry.py` ganham push sem alterar a lógica deles. `NOTIFY_DEFAULT_CHANNELS` decide
  se chega por push, WhatsApp ou ambos.
- Envio via `firebase-admin` (Python). Cada notificação carrega: agente (canal Android), título, texto,
  link profundo e botões de ação.

## 4. Endpoints de widget (⭐⭐)

Respostas pequenas e baratas, reaproveitando funções existentes:

| Endpoint | Fonte já existente |
|---|---|
| `GET /api/widgets/today` | Meu Dia da Kaguya |
| `GET /api/widgets/finance` | `agents/nami/tools_plan.py` ("livre pra gastar") |
| `GET /api/widgets/habits` | `agents/kaguya/tools_habits.py` |
| `GET /api/widgets/reading` | Frieren/Marin/Mai (em andamento) |

## 5. Chat com a Makima (⭐⭐⭐)

Hoje só se conversa pelo Hermes (Telegram/WhatsApp/Discord). Verificar se o Hermes expõe API HTTP;
se não, criar rota dedicada como as `notify-*` e um endpoint no webapp que encaminha e devolve a
resposta em streaming.

## 6. Uploads de mídia → bucket privado no GCS (⭐⭐)

**Situação hoje:** ícones (Nami) e avatares (Komi) ficam no disco do container, em `webapp/uploads/icons/`, servidos
por `StaticFiles` em `/uploads` **sem checar login** (`main.py`). Não confirmado se há volume persistente no Dokploy.
Serve para ícone/avatar, **não** para recibo e foto de diário.

**Decisão:** mídia nova vai para um **bucket privado do Google Cloud Storage** (o projeto já usa GCS nos backups).

1. **Bucket separado** (ex.: `makima-media`). **Não reaproveitar `makima-backups`:** ele tem lifecycle que apaga tudo
   com mais de 30 dias. Sem acesso público; só a conta de serviço do backend (`GCP_CREDENTIALS_JSON`) lê e grava.
2. Nova env `GCS_MEDIA_BUCKET` (documentar em `webapp/CLAUDE.md`).
3. **Banco guarda só a chave** do arquivo (`receipts/2026/11/<uuid>.jpg`), nunca a URL. Tabela `media_files`
   (id, chave, tipo, tamanho, agente, `entity_type`/`entity_id` opcionais, criado_em) → documentar em `POSTGRES.md`.
4. `POST /api/media` (router novo `routers/media.py`, `Depends(require_user)`): valida tipo (JPEG/PNG/WebP) e tamanho,
   **comprime/redimensiona** (foto de celular tem vários MB) e grava no bucket. Devolve `{id}`.
5. `GET /api/media/{id}`: confere login (cookie ou bearer) e devolve **URL assinada** de poucos minutos (redirect)
   ou transmite o arquivo. `DELETE /api/media/{id}` remove do bucket e do banco.
6. Ícones/avatares atuais **ficam como estão** (migrar é opcional e posterior). O `/uploads` continua só para eles.
7. No app, a imagem é pedida por `apiUrl('/api/media/…')` com bearer; no PWA, fica em cache de imagens só se for
   dado não sensível (recibo e diário **não** entram no cache offline).
8. Backup: ativar versionamento no bucket; fotos não entram no `pg_dump`.

**Testes:** `tests/test_media.py` com cliente GCS simulado (tipo inválido → 415, grande demais → 413, sem login → 401,
URL assinada só com login).

**Alternativa descartada por ora:** volume Docker persistente (mais simples, mas sem acesso protegido nem espaço elástico).

## Checklist de documentação ao implementar

`webapp/docs/API.md` · `docs/referencia/POSTGRES.md` · árvore do `CLAUDE.md` · `ROADMAP.md`.
