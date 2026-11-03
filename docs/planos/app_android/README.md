# App Android da Makima

> **Status: planejado, não executado.** Nenhuma linha de código do app existe ainda — esta pasta
> é o estudo e o roteiro. Quando uma etapa for entregue, atualizar o `ROADMAP.md` e mover o que
> estiver concluído para `docs/arquivo/`.

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
