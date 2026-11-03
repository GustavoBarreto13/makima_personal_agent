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
- `POST /api/devices` e `DELETE /api/devices/{id}`.
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

## 6. Uploads de mídia (⭐)

Foto de recibo, de livro e de diário: generalizar os uploads que já existem (`FormData` em Komi/Nami).

## Checklist de documentação ao implementar

`webapp/docs/API.md` · `docs/referencia/POSTGRES.md` · árvore do `CLAUDE.md` · `ROADMAP.md`.
