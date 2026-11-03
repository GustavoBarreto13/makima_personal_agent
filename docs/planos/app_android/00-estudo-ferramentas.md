# 00 — Estudo das ferramentas

## Ponto de partida (o que já existe no repo)

| Peça | Situação | Por que importa |
|---|---|---|
| Frontend | React 19 + TypeScript + Vite + Tailwind, ~48 mil linhas, 10 shells | Reescrever custaria meses; o melhor caminho reaproveita |
| Design System | `webapp/frontend/src/design/`, já responsivo (< 640px) | A UI já cabe em tela de celular |
| Portas | `design/core/ports.ts` (`Storage`, `Clock`, `Http`, `OfflineQueue`) — o próprio arquivo diz que "um app (Capacitor/React Native) fornece as dele" | O projeto já foi desenhado para isso |
| Backend | FastAPI, ~480 rotas (`webapp/docs/API.md`), PostgreSQL no VPS | O app usa a **mesma API**; sem banco no celular |
| Login | Google OAuth + cookie `makima_session` (`routers/auth.py`, `deps.py`) | Precisa de um caminho novo para o app |
| PWA | Só o `manifest.webmanifest`, **sem service worker** | Instalável, mas sem offline nem push |
| Avisos | `scheduler/` (14 jobs) → `notify_channels.py` → Hermes → WhatsApp | Basta somar um canal "push" |

## Conceitos

- **Nativo (Kotlin + Jetpack Compose)**: a linguagem oficial do Android. Acesso total, mas código 100% novo.
- **Cross-platform (React Native, Flutter)**: uma base para Android/iOS, mas as telas são refeitas.
- **Híbrido (Capacitor)**: app-casca com o seu site dentro de uma WebView + plugins para o celular.
- **PWA**: o site instalado pelo Chrome. **TWA**: PWA embrulhada num APK (usa o Chrome por baixo).

## Comparação

Dificuldade: ⭐ fácil … ⭐⭐⭐⭐⭐ muito difícil (para quem não sabe mobile, com o Claude ajudando).

| Opção | Linguagem | Reuso do front | Dificuldade | Tempo* | Acesso ao celular |
|---|---|---|---|---|---|
| A. PWA melhorada | TS (a mesma) | 100% | ⭐ | 1–2 sem | Baixo/médio |
| B. TWA (Bubblewrap) | TS + config | 100% | ⭐⭐ | +1 sem | Baixo/médio |
| **C. Capacitor** ✅ | TS + plugins (+ Kotlin pontual) | ~95% | ⭐⭐–⭐⭐⭐ | 4–8 sem (MVP rico) | **Alto** |
| D. React Native/Expo | TS (UI refeita) | ~30% | ⭐⭐⭐⭐ | 4–8 meses | Alto |
| E. Flutter | Dart | ~0% | ⭐⭐⭐⭐ | 6–10 meses | Alto |
| F. Kotlin nativo | Kotlin | ~0% | ⭐⭐⭐⭐⭐ | 8–12+ meses | Total |

\* Para o projeto inteiro (10 agentes).

### A. PWA melhorada
- **Prós:** quase de graça; atualiza sozinha a cada deploy; zero loja.
- **Contras:** sem widgets nem tile; push web limitado; sem biometria; parece "um site".
- **Veredito:** fazer de qualquer jeito (Etapa 1) — o service worker serve também ao Capacitor.

### B. TWA
- **Prós:** vira app na gaveta; pode ir à Play Store; login por cookie continua funcionando.
- **Contras:** herda todos os limites da PWA.
- **Veredito:** degrau intermediário que perde para o Capacitor.

### C. Capacitor — recomendado
- **Prós:** reaproveita 10 shells + Design System + testes Vitest; uma correção vale para web e app;
  plugins oficiais para push, câmera, biometria, haptics, compartilhar; widgets ficam no mesmo
  projeto `android/`; dá para atualizar a UI sem reinstalar.
- **Contras:** WebView é um pouco menos fluida que nativo em listas enormes (mitigável);
  precisa do Android Studio; widgets exigem um pouco de Kotlin; login precisa ser refeito.
- **Dificuldade:** ⭐⭐ (empacotar, push, câmera) · ⭐⭐⭐ (widgets/tile).

### D. React Native / Expo
- **Prós:** sensação 100% nativa; ótimo build em nuvem (EAS).
- **Contras:** todo JSX/CSS (Tailwind, tokens `--ds-*`, arte por página) seria refeito; `@dnd-kit`,
  `react-markdown` e `timepicker-ui` não funcionam igual; duas bases de UI.
- **Quando faria sentido:** se o app virasse produto para outras pessoas ou a WebView travasse numa tela
  específica (dá para migrar tela por tela reaproveitando `design/core/`).

### E/F. Flutter e Kotlin nativo
- **Prós:** desempenho e integração máximos.
- **Contras:** linguagem nova, reescrita total, duas bases para manter. Desproporcional para projeto pessoal.
- **Papel:** Kotlin entra só em widgets, tile e serviço de foco.

## Decisão

PWA melhorada (Etapa 1) → Capacitor (Etapa 2+) → Kotlin pontual (Etapa 5).

## Ferramentas que você vai usar

| Ferramenta | Para quê | Custo | Dif. |
|---|---|---|---|
| Android Studio | Abrir `android/`, emulador, gerar APK, ver logs | Grátis | ⭐⭐ |
| JDK 17 + Android SDK | Compilar (vêm no Android Studio) | Grátis | ⭐ |
| `@capacitor/cli` | `npx cap sync android` copia o site para o app | Grátis | ⭐ |
| Celular com Depuração USB | Testar push, câmera, widgets de verdade | — | ⭐ |
| `chrome://inspect` | DevTools do Chrome dentro do app | Grátis | ⭐ |
| Firebase (FCM) | Entrega de push; `google-services.json` | Grátis | ⭐⭐ |
| `firebase-admin` (Python) | Backend envia push | Grátis | ⭐⭐ |
| `vite-plugin-pwa` | Service worker e cache | Grátis | ⭐ |
| Jetpack Glance | Widgets (Kotlin) | Grátis | ⭐⭐⭐ |
| GitHub Actions (opcional) | APK assinado automático | Grátis | ⭐⭐ |
| Distribuição | Sideload, Firebase App Distribution ou Play (US$ 25 único) | — | ⭐ / ⭐⭐⭐ |

> Play Store: contas pessoais novas exigem teste fechado (~12 testadores por 14 dias) antes de
> produção. Para uso pessoal, **recomendado sideload ou App Distribution**.
