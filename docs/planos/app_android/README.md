# App Android da Makima

> **Status: em execução — retomar na Etapa 2, seções C, D e E.** O app já instala e roda no celular, com
> login nativo do Google funcionando (validado em 04/11/2026). Código e servidor estão na `master`.
> Quando uma etapa for entregue por inteiro, atualizar o `ROADMAP.md` e mover o que estiver concluído para
> `docs/arquivo/`. **Para retomar:** abrir [`etapa-2-capacitor-login.md`](etapa-2-capacitor-login.md), seção
> "Estado atual" (feito / falta fazer / não-código / armadilhas já encontradas).

## Objetivo

Levar **todos** os agentes da Makima (Nami, Kaguya, Kurisu, Frieren, Akane, Marin, Mai, Komi,
Violet, Yato, Lucy) para um **app Android**, ganhando o que só um app oferece: notificações com
botões, widgets, câmera, voz, atalhos, biometria e funcionamento sem internet.

## Decisão em uma linha

**PWA melhorada → Capacitor (casca Android que mostra o webapp atual) → pedaços em Kotlin só
para widgets/tile.** Motivo: o frontend tem ~48 mil linhas de React; o Capacitor reaproveita
~95% delas, e o Design System já tem "portas" (`src/design/core/ports.ts`) prontas para um app.

## Como ler esta pasta (ordem sugerida)

| # | Arquivo | Para quê |
|---|---|---|
| 1 | [`00-estudo-ferramentas.md`](00-estudo-ferramentas.md) | Conceitos, comparação das opções (prós/contras/dificuldade) e por que o Capacitor |
| 2 | [`01-backend-necessario.md`](01-backend-necessario.md) | O que muda no servidor (login, push, widgets) |
| 3 | [`02-funcoes-por-agente.md`](02-funcoes-por-agente.md) | O que cada agente ganha no celular + sugestões de melhoria |
| 4 | `etapa-0` … `etapa-8` | O passo a passo, uma página por etapa, em linguagem simples |
| 5 | [`riscos-e-validacao.md`](riscos-e-validacao.md) | O que pode dar errado e como testar |

## Mapa das etapas

| Etapa | O que entrega | Dificuldade | Tempo |
|---|---|---|---|
| [0 — Preparar](etapa-0-preparar.md) | Ferramentas instaladas, celular pronto, Firebase criado | ⭐ | ½ dia |
| [1 — PWA](etapa-1-pwa.md) | Site instalável, funciona offline (leitura) | ⭐ | 1–2 sem |
| [2 — Casca + login](etapa-2-capacitor-login.md) | APK instalável, login Google nativo, biometria | ⭐⭐⭐ | 2–3 sem |
| [3 — Push](etapa-3-push.md) | Notificações dos 14 jobs, com botões | ⭐⭐ | 1–2 sem |
| [4 — Entrada rápida](etapa-4-entrada-rapida.md) | Atalhos, compartilhar, câmera, voz | ⭐⭐ | 2 sem |
| [5 — Widgets](etapa-5-widgets.md) | Widgets, tile de foco, timer que não morre | ⭐⭐⭐ | 3–4 sem |
| [6 — Offline](etapa-6-offline.md) | Escrever sem internet e sincronizar depois | ⭐⭐⭐ | 2–3 sem |
| [7 — Chat](etapa-7-chat.md) | Conversar com a Makima dentro do app | ⭐⭐⭐ | 2 sem |
| [8 — Extras](etapa-8-extras.md) | Geofence, sono, contatos, notificação do banco | ⭐⭐⭐⭐ | sob demanda |

**MVP útil = etapas 0–3** (~5–7 semanas).

## Quadro de progresso (atualizado em 04/11/2026)

Legenda: ✅ feito e testado · 🟡 parcial (código pronto, falta ligar/testar no aparelho) · ⬜ não começou.

| Etapa | Status | Já feito (código) | Falta fazer |
|---|---|---|---|
| 0 — Preparar | ✅ | Android Studio, depuração USB e projeto Firebase "Makima" prontos | — |
| 1 — PWA | 🟡 | Service worker, ícones, manifesto, aviso de versão, tela "sem conexão", abrir offline, limpeza de cache (dentro do app o service worker fica desligado) | **Você:** instalar no Chrome do celular e testar no modo avião; rodar Lighthouse |
| 2 — Casca + login | 🟡 | **A e B ✅ (testado no celular):** Capacitor + `android/`, login nativo Google, tokens no Keystore com refresh em fila única, `.env.android` + `npm run android:sync`, servidor ligado (`GOOGLE_MOBILE_CLIENT_IDS`, tabelas no VPS). Antes: backend do login, `apiUrl`/bearer, `deepLink.ts` | **C** portas nativas (`native.ts`); **D** biometria, botão voltar, barra de status, haptics, deep links no manifesto; **E** APK assinado (**você:** keystore de release em 2 lugares + SHA-1 dela no Google Cloud); separar "sem internet" de "erro do servidor" |
| 3 — Push | ✅ recebido no celular | Backend (tabela, rotas, canal, conteúdo oculto no bloqueio, `agent`/`link` nos 8 scripts) + app (permissão, 8 canais por agente, registro do token, toque abre a tela) + **Firebase ligado e notificação de teste recebida (05/nov)** | **Você:** decidir `NOTIFY_DEFAULT_CHANNELS` (só push ou push + WhatsApp). **Depois, código:** botões de ação *Concluir · Adiar* (o plugin não desenha botões: exige mensagem só de dados + notificação local) |
| 4 — Entrada rápida | 🟡 | Parser de links compartilhados (`shareTarget.ts`) | **Mídia:** bucket GCS privado + `POST /api/media` (pré-requisito da câmera); atalhos do app, receber "compartilhar", câmera, voz |
| 5 — Widgets | ⬜ | — | Endpoints `/api/widgets/*` (Bloco E, opcional ficou de fora), widgets em Kotlin/Glance, tile de foco, timer em serviço |
| 6 — Offline | 🟡 | Fila de escritas persistente (`offlineQueue.ts`) | Ligar às telas (tarefa, gasto, bullet, hábito), selo "pendente", evento "voltou a internet", modo viagem da Yato |
| 7 — Chat | ⬜ | — | Verificar API do Hermes, rota de streaming, tela de chat |
| 8 — Extras | ⬜ | — | Sob demanda |

### Próximos passos, em ordem

1. **Antes de tudo (servidor):** rodar `setup_schemas.py` dentro do `makima-web` para criar `mobile_devices` e `push_devices`.
   Sem isso, as rotas de aparelho/push dão erro. Não preencher `GOOGLE_MOBILE_CLIENT_IDS` ainda.
2. **Você, no PC:** Etapa 0 (Android Studio, depuração USB, projeto Firebase).
3. **Você, no celular:** testar a PWA da Etapa 1 (instalar + modo avião). Dá para fazer sem Android Studio.
4. **Claude + você:** Etapa 2 (casca Capacitor + login nativo). Aqui sai o primeiro APK.
   Criar o "OAuth client" Android no Google Cloud e preencher `GOOGLE_MOBILE_CLIENT_IDS`.
5. **Claude + você:** Etapa 3 (push real com Firebase) → fecha o **MVP**.
6. Depois: Etapas 4, 6, 5, 7 (nessa ordem sugerida: entrada rápida e offline dão mais valor por esforço).

### Pendências técnicas já conhecidas

- Imagens `/uploads/...` (ícones e avatares) precisam passar por `apiUrl()` dentro do app.
- **Mídia nova (recibo, livro, diário) → bucket privado `makima-media` no GCS**, com `POST /api/media`, chave no banco e URL assinada (desenho em `01-backend-necessario.md` §6). Não usar o bucket de backups (lifecycle de 30 dias). `/uploads` hoje é público, sem login: só serve para ícone/avatar.
- Confirmar se `webapp/uploads` está num volume persistente no Dokploy.
- Reenvio da fila offline pode duplicar se a resposta se perder (o `id` por item já existe para o servidor deduplicar).
- Revisar o login com `/code-review` antes de qualquer deploy.
- Node 18 local precisa de `NODE_OPTIONS=--experimental-global-webcrypto` para buildar o PWA (produção usa Node 20).
- Capacitor 7+ exige Node 20: usar o Node do PC ou fixar Capacitor 6.
- Alterações da branch `feat/app-android-prep` ainda **não foram commitadas** nem mescladas na `master`.

## O que já foi adiantado (só com código, sem Android Studio)

Tudo abaixo está testado (pytest/vitest) e **inerte em produção** até as variáveis serem configuradas.

| Parte | O que existe | Onde | Falta (PC/celular) |
|---|---|---|---|
| **Etapa 1 — PWA** | Service worker (`vite-plugin-pwa`, cache de app + leituras de Kaguya/Yato/hub; diário, finanças e pessoas **não** ficam em cache), ícones 192/512/maskable, aviso "nova versão" e "sem conexão", app que abre offline sem cair no login, cache apagado quando a sessão é recusada | `webapp/frontend/vite.config.ts`, `src/pwa/`, `scripts/gen-pwa-icons.mjs`, `public/pwa-*.png` | Instalar no Chrome do celular e testar no modo avião |
| **Etapa 2 — login (backend)** | `POST /auth/mobile`, refresh rotativo, bearer em `require_user`, aparelhos revogáveis | `webapp/backend/mobile_auth.py`, `routers/auth.py`, `routers/devices.py` | Casca Capacitor, login nativo do Google, Keystore, biometria, APK; criar o "OAuth client" e preencher `GOOGLE_MOBILE_CLIENT_IDS` |
| **Etapa 2 — frontend** | `apiUrl`/`authFetch`/`setAuthTokenProvider` (base da API + bearer), `shareTarget.ts`, `deepLink.ts` | `src/lib/` | Ligar ao plugin nativo |
| **Etapa 3 — push (backend)** | Tabela `push_devices`, `POST /api/devices/push`, canal `"push"` no `send_notification` | `webapp/backend/push_store.py`, `scheduler/notify_channels.py` | Projeto Firebase, `google-services.json`, `FIREBASE_CREDENTIALS_JSON`, plugin de push no app, botões de ação |
| **Etapa 6 — offline (lógica)** | Fila de escritas persistente, ordenada, com erros temporários × definitivos | `src/design/core/offlineQueue.ts` | Ligar às telas (tarefa, gasto, bullet) e ao evento "voltou a internet" |

**Antes de ligar em produção:** rodar `setup_schemas.py` dentro do `makima-web` (cria `mobile_devices` e
`push_devices`); só então configurar `GOOGLE_MOBILE_CLIENT_IDS` e, mais tarde, `FIREBASE_CREDENTIALS_JSON`.

**Limitações conhecidas:** (1) imagens servidas pelo backend (`/uploads/...`) ainda usam caminho relativo — no app
precisam passar por `apiUrl()`; (2) o reenvio da fila offline pode duplicar se a resposta se perder depois do servidor
gravar (o `id` de cada item já está pronto para o servidor deduplicar no futuro); (3) o Node 18 não consegue rodar o
build do PWA sem `NODE_OPTIONS=--experimental-global-webcrypto` (produção usa Node 20 e não precisa).

## Glossário rápido

- **WebView**: navegador embutido dentro de um app. É onde o site da Makima vai rodar.
- **Capacitor**: ferramenta que embrulha um site num app Android e dá acesso a câmera, push etc.
- **PWA**: site "instalável" que guarda cópia das telas para abrir rápido/sem internet.
- **Service worker**: o "ajudante" que a PWA usa para guardar essas cópias.
- **APK**: o arquivo instalável do Android. **Sideload**: instalar o APK direto, sem loja.
- **FCM (Firebase Cloud Messaging)**: serviço gratuito do Google que entrega notificações.
- **Widget**: bloco na tela inicial do celular. **Tile**: botão no painel rápido (Wi-Fi/lanterna).
- **Kotlin / Jetpack Glance**: linguagem e biblioteca oficiais do Android para widgets.
- **Keystore**: o "cofre" do Android para guardar senhas/chaves.
- **Bearer token**: a "chave de acesso" que o app manda em cada pedido à API.
