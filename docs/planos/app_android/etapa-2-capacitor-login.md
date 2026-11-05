# Etapa 2 — A casca Android (Capacitor) + novo login

**Dificuldade:** ⭐⭐⭐ · **Tempo:** 2–3 semanas · **Quem faz:** Claude (código) + você (Android Studio, chave de assinatura, testes)

## O que é e por quê
O Capacitor cria um projeto Android de verdade (`webapp/frontend/android/`) que exibe o **mesmo site**
dentro do app, com "portas" para recursos do celular. Aqui nasce o primeiro APK.

> **Adiantado:** no backend, tudo da seção B (`/auth/mobile`, refresh rotativo, bearer, aparelhos, CORS) e, no frontend,
> `apiUrl`/`authFetch`/`setAuthTokenProvider` e `deepLink.ts`. **Falta:** seções A, C (versão nativa das portas), D e E — dependem do PC.

## Estado atual (04/nov/2026)

**Validado no celular real:** instala, abre na tela de login, entra com o seletor nativo do Google e
**continua logado depois de fechar e reabrir** (critério principal desta etapa).

### Feito
- **A — casca:** Capacitor 8.6 (`@capacitor/core|cli|android`), `capacitor.config.ts` (`br.com.gustavo.makima`,
  `webDir: dist`), projeto em `webapp/frontend/android/` versionado (a cópia do `dist/` fica ignorada).
- **B — login nativo:** `src/native/` — `tokenSession.ts` (lógica pura: refresh em fila única, porque o servidor
  trata reuso de refresh como roubo e revoga o aparelho; 9 testes) e `nativeAuth.ts` (Keystore via
  `@aparajita/capacitor-secure-storage`, login via `@capgo/capacitor-social-login`, nome do aparelho via
  `@capacitor/device`). `Login.tsx` usa o fluxo nativo só no app; sem sessão guardada o app vai direto ao login.
- Service worker da PWA **desligado dentro do app**; `allowBackup="false"` no Android.
- **Build do app:** `.env.android` (`VITE_API_BASE_URL` + `VITE_GOOGLE_WEB_CLIENT_ID`, nada secreto) e o comando
  `npm run android:sync` (build em modo `android` + `cap sync`).
- **Servidor:** merge na `master` (`07614dd`), `GOOGLE_MOBILE_CLIENT_IDS` no Dokploy e tabelas
  `mobile_devices`/`push_devices` aplicadas no VPS.

### Falta fazer
- **C — portas do Design System:** `design/headless/native.ts` (Storage → `@capacitor/preferences`, Http →
  `CapacitorHttp`); a `OfflineQueue` segue em memória até a Etapa 6.
- **D — parecer app:** biometria ao abrir, botão voltar do Android (fecha modais), cor da barra de status por
  agente, vibração (`@capacitor/haptics`) e **deep links** `makima://…` registrados no `AndroidManifest`
  (o `deepLink.ts` já existe; falta o intent-filter e o ouvinte do plugin `@capacitor/app`).
- **E — APK assinado:** *(você)* criar a keystore de release e guardar em **dois lugares seguros**; depois
  cadastrar o SHA-1 dela na credencial Android do Google Cloud (hoje só está o SHA-1 da chave de **depuração**,
  então um APK assinado com outra chave não consegue logar até isso ser feito).
- **Pequenos acertos:** o app mostra "sem conexão" também quando o servidor responde erro (500) — separar
  "sem internet" de "servidor com problema"; testes do backend de `/auth/mobile` contra banco real (parte da
  suíte é pulada sem banco).
- **Fechamento:** `npm run audit:design`, conferir `chrome://inspect` sem erros nos 10 agentes, testar revogar
  o aparelho em `/api/devices`.

### Não-código (anotado para não esquecer)
| Quando | O que é com você |
|---|---|
| Etapa 2-E | Criar a keystore de release (dois backups) e depois o SHA-1 dela no Google Cloud |
| Etapa 3 | Firebase: adicionar o app Android e baixar o `google-services.json`; decidir `NOTIFY_DEFAULT_CHANNELS` (só push ou push + WhatsApp) |
| Etapa 4 | Criar o bucket privado `makima-media` no GCS e dar permissão à conta de serviço |
| Etapa 5 | Android → Apps → Makima → Bateria → **Sem restrições** |
| Sempre | Testar no celular real e relatar |

### Como atualizar o app (hoje)
O app **embute** o `dist/`. Mudança de **tela** = `npm run android:sync` + ▶ no Android Studio. Mudança só de
**backend** vale na hora, sem reinstalar. Depois da seção E, o dia a dia passa a ser instalar o APK assinado
por cima (mesma chave = atualiza sem perder login). Live update e APK automático ficam para a Etapa 8.

### Armadilhas já encontradas (VPS)
- Deploy **não cria tabelas novas**: rodar no container `makima-web`
  `python -c "from scripts.setup_schemas import apply_schema; apply_schema('webapp/backend/schema_pg.sql')"`.
  Sem isso, o login responde 500 (`relation "mobile_devices" does not exist`).
- O `@capacitor/cli` traz os tipos do Node; por isso saiu o `@ts-expect-error` de `kaguya/legacy.test.ts`.
- 5 testes do front falhavam antes desta etapa e não são do app (`komi/capture`, `KomiShell`, `Kanban`,
  `design/audit` tokens) — vieram com os commits da `master`; tratar à parte.

## Passo a passo

### A. Criar a casca
1. Instalar `@capacitor/core`, `@capacitor/cli`, `@capacitor/android` e rodar `npx cap init` /
   `npx cap add android` em `webapp/frontend/`.
2. `capacitor.config.ts`: nome "Makima", `appId` (ex.: `br.com.gustavo.makima`), pasta `dist`.
3. Fluxo de trabalho: `npm run build` → `npx cap sync android` → abrir no Android Studio → ▶.

### B. Novo login (ver `01-backend-necessario.md`)
1. Botão "Entrar com Google" usa o seletor nativo de contas (plugin social-login).
2. Google devolve um **ID token** ("crachá").
3. App chama `POST /auth/mobile`; o backend valida com o Google e confere `ALLOWED_EMAIL`.
4. Backend devolve access + refresh token; o app guarda no **Keystore**.
5. `lib/api.ts` passa a enviar `Authorization: Bearer …` quando estiver no app (e cookie no site).
6. `deps.py::require_user` aceita cookie **ou** bearer.

### C. Portas do Design System
Implementar as versões nativas de `ports.ts`: `Storage` → `@capacitor/preferences`; `Http` → `CapacitorHttp`;
`OfflineQueue` continua em memória até a Etapa 6. Criar `design/headless/native.ts` ao lado de `web.ts`.

### D. "Parecer app"
- Biometria ao abrir (opção: sempre ou só Violet/Nami).
- Botão *voltar* do Android fecha modais e volta de tela.
- Cor da barra de status por agente; teclado sem cobrir campos (`useKeyboardInset` já existe).
- Vibração leve ao concluir (`@capacitor/haptics`).
- **Deep links:** `makima://kaguya/tarefa/123` abre a tela certa (usado pelas notificações).

### E. CORS e build
- `main.py`: liberar a origem do Capacitor (`https://localhost`).
- Gerar **APK assinado**. *Você:* criar a chave de assinatura (keystore de release) e guardá-la em
  **dois lugares seguros** — sem ela não há como atualizar o app instalado.

## Como saber que deu certo
- Instala o APK, loga uma vez, fecha o app e reabre no dia seguinte **sem pedir login**.
- Todos os 10 agentes abrem e funcionam; `chrome://inspect` sem erros.
- Revogar o aparelho no backend derruba o acesso.
- Testes do backend (pytest) para `/auth/mobile` e bearer em `require_user`.

## Riscos
- Erro no login expõe finanças/diário: tokens curtos, refresh rotativo, revogação por aparelho.
- Google bloqueia OAuth em WebView → por isso o login nativo.
- Perder a chave de assinatura.
