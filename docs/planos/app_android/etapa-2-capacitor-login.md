# Etapa 2 — A casca Android (Capacitor) + novo login

**Dificuldade:** ⭐⭐⭐ · **Tempo:** 2–3 semanas · **Quem faz:** Claude (código) + você (Android Studio, chave de assinatura, testes)

## O que é e por quê
O Capacitor cria um projeto Android de verdade (`webapp/frontend/android/`) que exibe o **mesmo site**
dentro do app, com "portas" para recursos do celular. Aqui nasce o primeiro APK.

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
