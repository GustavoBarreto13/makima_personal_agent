# Handoff: Makima — Hub (página central / "Centro de Controle")

## Overview
A **Makima** é a página central de um sistema de produtividade pessoal ("sistema de vida")
onde cada agente é uma personagem de anime responsável por um domínio da vida do usuário
(finanças, livros, pessoas, diário, tarefas/agenda, séries, animes, filmes). A página da
Makima é o **hub**: apresenta o projeto para quem nunca viu, resume cada agente e dá acesso
direto às ações principais de cada um (ex.: "Adicionar transação" na Nami, "Registrar leitura"
na Frieren).

A direção visual aprovada é **"A · Sala de Controle"** — editorial/dossiê, atmosfera de centro
de comando. Paleta **preto + vermelho Makima + amarelo** (os olhos dela), com cada agente
carregando seu próprio acento de origem. Voz da copy: calma, precisa, "no controle" — como a
Makima falaria.

## About the Design Files
Os arquivos deste pacote são **referências de design feitas em HTML/React (via Babel no browser)** —
protótipos que mostram a aparência e o comportamento pretendidos, **não** código de produção para
copiar diretamente. A tarefa é **recriar este design no ambiente do codebase de destino** (React,
Vue, Svelte, etc.), usando os padrões/bibliotecas já estabelecidos lá. Se ainda não houver ambiente,
escolha o framework mais adequado e implemente o design nele.

O protótipo usa React 18 + Babel standalone carregado por `<script>`, com componentes em arquivos
`.jsx` separados que se comunicam por `window`. Isso é uma conveniência de prototipagem — no codebase
real, use módulos/imports normais e um sistema de estado de verdade.

## Fidelity
**Alta fidelidade (hi-fi).** Cores, tipografia, espaçamentos, raios, sombras e estados estão
finalizados e devem ser reproduzidos fielmente. Os **números/stats são exemplos** (mock) — devem
ser ligados aos dados reais de cada agente na implementação.

---

## Layout geral (uma única tela, scroll vertical)

Container central: `max-width: 1000px`, centralizado, `padding: 0 56px` (40px ≤1040w, 22px ≤680w).
A página inteira tem fundo escuro com dois brilhos radiais vermelhos (canto sup. dir. e inf. esq.)
e uma textura sutil de linhas horizontais (scanlines) em `mix-blend-mode: overlay`.

Ordem das seções, de cima para baixo:

1. **Topbar** (altura 56px, borda inferior 1px)
   - Esquerda: ponto vermelho com glow + texto mono "CENTRO DE CONTROLE".
   - Direita: "Hub · 8 agentes · 9 domínios" + botão **"Tema"** (pílula, ícone lua) que alterna
     claro/escuro.

2. **Hero** (grid 2 colunas: `1fr 360px`, gap 24px, padding `64px 0 56px`)
   - **Coluna esquerda (texto):**
     - Kicker mono em amarelo com traço: "Orquestradora".
     - `h1` "Makima" em serif 800, **104px**, line-height 0.92; a letra **"i" em itálico vermelho**.
     - Role mono: "Orquestradora · Sistema de Vida".
     - Saudação serif itálica 23px: "Bom te ver de volta."
     - Manifesto (16px, ink-2, max 30em): texto explicando o projeto.
     - Tagline com borda-esquerda vermelha: **lead em negrito** + frase em amarelo.
     - Meta: 3 números grandes serif (8 Agentes / 9 Domínios / 1 No comando).
   - **Coluna direita (retrato):** imagem PNG transparente da Makima (altura 430px,
     `object-position: bottom`) com **halo radial vermelho** atrás e **dois anéis** concêntricos
     (um amarelo sólido, um vermelho tracejado) + drop-shadow.

3. **Rótulo de seção** "Os domínios" — texto mono + régua 1px + "/ 09" em amarelo.

4. **Roster (grade de agentes)** — `grid` 2 colunas (1 coluna quando o tweak "Colunas" = "Uma",
   ou em telas ≤680px), gap 16px. Veja "Card de agente" abaixo. São **8 cards**.

5. **Footer** (borda superior, mono): "Makima · Centro de Controle" / "Tudo sob controle." (vermelho).

### Card de agente
Retângulo `min-height: 212px`, `border-radius: 14px`, fundo `linear-gradient(160deg, --panel, --bg2)`,
borda 1px `--line`. Estrutura:
- **Barra de acento** vertical de 3px na borda esquerda, na cor do agente (`--ac`), com glow.
- **Corpo** (largura 64%, padding 18×20, flex column, gap 8px):
  - Índice mono "01"…"08".
  - Nome em **serif 30px / 700**.
  - Role mono uppercase, na cor de texto do acento (`--ac-t`).
  - Descrição (12.5px, ink-2) — o que o agente faz.
  - **Stats** (2 itens lado a lado): valor serif 16px (primeiro destacado em `--ac-t`) + label mono 9px.
    Valores em `white-space: nowrap`.
  - **Ações**: botão **primário** (fundo `--ac`, texto escuro) + opcional botão **ghost** (borda).
- **Retrato** flutuante à direita (largura 46%, altura ~200px, `object-position: bottom`), com
  máscara de fade horizontal (`mask-image: linear-gradient(90deg, transparent, #000 26%)`) e um
  glow radial na cor do agente atrás. **Tratado como recorte transparente** (PNG sem fundo), não
  enquadrado em caixa.
- **Botão "abrir"**: círculo 30px no canto sup. dir. com ícone de seta (↗), linka para a página do agente.
- **Hover**: `translateY(-3px)`, borda na cor do acento, sombra forte.

---

## Os 8 agentes (conteúdo, acento e ações)

Cada card herda o acento de origem da página do respectivo agente. Ordem no roster:

| # | Nome | Domínio (role) | Página (href) | Ação primária (deep-link) | Ação secundária |
|---|------|----------------|---------------|---------------------------|-----------------|
| 01 | Nami | Finanças | `Nami - Finanças.html` | Adicionar transação → `?novo=1` | — |
| 02 | Frieren | Livros | `Frieren - Livros.html` | Registrar leitura → `?novo=1` | — |
| 03 | Komi | Pessoas | `Komi - Pessoas.html` | Adicionar pessoa → `?novo=1` | — |
| 04 | Violet | Diário | `Violet - Diário.html` | Nova entrada → `?novo=1` | — |
| 05 | Kaguya | Tarefas · Agenda | `Kaguya - Tarefas.html` | Nova tarefa → `?novo=1` | Abrir agenda → `Kaguya - Calendário (3 direções).html` |
| 06 | Mai | Séries | `Mai - Séries.html` | Adicionar série → `?novo=1` | — |
| 07 | Marin | Animes | `Marin - Animes.html` | Adicionar anime → `?novo=1` | — |
| 08 | Akane | Filmes | `Akane - Filmes.html` | Marcar filme → `?novo=1` | — |

> **Nota Kaguya:** Tarefas e Calendário foram unificados em **um** card com duas ações (em vez de
> dois cards com a mesma foto). Por isso "8 agentes · 9 domínios".

### Acentos por agente (`--ac` = barra/botão/glow, `--ac-t` = texto do acento)
Cada cor casa com o tema da página do agente.

| Agente | `--ac` (acento) | `--ac-t` (texto) |
|--------|-----------------|------------------|
| Nami | `oklch(0.74 0.168 57)` (âmbar) | `oklch(0.80 0.150 62)` |
| Frieren | `oklch(0.77 0.118 184)` (verde-mar) | `oklch(0.82 0.110 184)` |
| Komi | `oklch(0.70 0.135 276)` (índigo) | `oklch(0.78 0.125 276)` |
| Violet | `oklch(0.70 0.088 253)` (pervinca) | `oklch(0.78 0.090 253)` |
| Kaguya | `oklch(0.72 0.165 340)` (magenta) | `oklch(0.80 0.150 340)` |
| Mai | `oklch(0.70 0.120 292)` (violeta crepúsculo) | `oklch(0.78 0.115 292)` |
| Marin | `oklch(0.74 0.16 210)` (**neon/ciano**) | `oklch(0.84 0.14 208)` |
| Akane | `oklch(0.66 0.115 196)` (**verde água/teal**) | `oklch(0.79 0.10 192)` |

### Stats e copy (exemplos — substituir por dados reais)
Veja `makima/data.js` (`window.MAKIMA.agents`) para o texto exato de cada card: `does` (descrição),
`note` (frase de personalidade — disponível mas não exibida na direção A), `stat`/`stat2`
(valor + label), `action`/`action2`.

Copy do hero (`window.MAKIMA.copy`):
- kicker: "CENTRO DE CONTROLE" · role: "Orquestradora" · hello: "Bom te ver de volta."
- lead: "Cada parte da sua vida tem uma responsável."
- manifesto: "Dinheiro, leituras, pessoas, tempo, histórias — nada fica solto, nada se perde. Cada
  agente cuida do que importa no seu domínio. Eu mantenho todas em ordem para que você só precise
  decidir o que de fato importa."
- tagline: "Oito agentes cuidam de tudo. Eu cuido delas."
- footer: "Tudo sob controle."

---

## Interactions & Behavior
- **Abrir agente:** botão ↗ no card e clicar na ação primária navegam para a página do agente.
- **Deep-link de ação (`?novo=1`):** ao abrir a página de um agente com `?novo=1` na URL, o app do
  agente **abre automaticamente seu modal de adicionar** (transação/leitura/pessoa/tarefa/série/
  anime/filme) ou o registro correspondente. No protótipo isso foi implementado com um
  `useEffect` em cada app de agente:
  ```js
  React.useEffect(() => {
    if (new URLSearchParams(window.location.search).get('novo') === '1') abrirModalDeAdicionar();
  }, []);
  ```
  No codebase real, prefira roteamento explícito (ex.: rota/param que abre o modal) em vez de ler a
  query string manualmente.
- **Toggle de tema:** o botão "Tema" na topbar dispara `CustomEvent('makima:toggletheme')`; um
  controlador externo alterna `data-theme` entre `dark`/`light` no elemento raiz `.mkA`. No codebase
  real, use o mecanismo de tema do app.
- **Hover dos cards:** elevação + borda colorida + sombra (transições ~0.2s).
- **Responsivo:**
  - ≤1040px: padding lateral 40px, `h1` 88px.
  - ≤900px: hero vira 1 coluna (retrato acima do texto, 300px), `h1` 80px.
  - ≤680px: padding 22px, `h1` 56px, roster em 1 coluna.

## State Management
A página da Makima é majoritariamente estática (apresentação + navegação). Estado necessário:
- **Tema** (`dark` | `light`) — persistido; default `dark`.
- **Tweaks de layout** (ver abaixo) — opcionais; podem virar configurações ou ser descartados.
- **Dados dos agentes** — no app real, cada stat deve vir da fonte de verdade do respectivo
  domínio (saldo do mês, livro atual, nº de pessoas, etc.). No protótipo são mock em `data.js`.

### Tweaks (controles de demonstração — opcionais no produto)
Implementados via painel de Tweaks (`tweaks-panel.jsx`). Aplicam atributos no `.mkA`:
- **Tema:** `Escuro` | `Claro` → `data-theme="dark|light"`.
- **Vermelho:** `Intenso` | `Sóbrio` → `data-red="intenso|sobrio"` (reduz chroma do vermelho e o brilho de fundo).
- **Colunas dos agentes:** `Duas` | `Uma` → `data-cols="2|1"`.

## Design Tokens

### Tipografia
- **Display/Nomes:** `Playfair Display` (serif), pesos 600/700/800, itálico p/ destaques.
- **UI/Corpo:** `DM Sans`, 400–700.
- **Rótulos/dados/mono:** `DM Mono`, 400/500 (uppercase, letter-spacing alto p/ kickers e labels).

### Cores — Tema Escuro (default, raiz `.mkA`)
```
--bg:     oklch(0.145 0.012 18)   /* fundo (quase preto, leve quente) */
--bg2:    oklch(0.185 0.016 18)
--panel:  oklch(0.205 0.018 18)   /* fundo dos cards */
--line:   oklch(0.32 0.03 18)     /* bordas/réguas */
--red:    oklch(0.585 0.205 24)   /* vermelho Makima */
--red-br: oklch(0.66 0.205 25)    /* vermelho brilhante (destaques) */
--gold:   oklch(0.84 0.155 88)    /* amarelo (olhos) — kickers, anéis, "/09" */
--ink:    oklch(0.95 0.01 60)     /* texto principal */
--ink2:   oklch(0.74 0.014 40)    /* texto secundário */
--ink3:   oklch(0.56 0.016 30)    /* texto terciário/labels */
--glow:   0.30                    /* intensidade dos brilhos radiais de fundo */
```

### Cores — Tema Claro (`.mkA[data-theme="light"]`)
```
--bg:     oklch(0.955 0.009 60)   /* papel quente */
--bg2:    oklch(0.988 0.005 60)
--panel:  oklch(0.997 0.003 60)
--line:   oklch(0.86 0.012 40)
--red:    oklch(0.53 0.215 26)
--red-br: oklch(0.50 0.22 26)
--gold:   oklch(0.60 0.135 72)
--ink:    oklch(0.20 0.02 30)
--ink2:   oklch(0.40 0.02 30)
--ink3:   oklch(0.55 0.016 30)
--glow:   0.16
/* no claro: scanlines escondidas; role/stat do acento escurecidos via
   color-mix(in oklab, var(--ac), black 34%) p/ contraste */
```

### Variante "Vermelho Sóbrio" (`.mkA[data-red="sobrio"]`)
```
--glow:   0.13
--red:    oklch(0.52 0.13 24)
--red-br: oklch(0.60 0.14 25)
```

### Raios, sombras, espaçamento
- Raios: cards **14px**; botões **9px**; pílulas/ações arredondadas e botão "abrir" **círculo (999px)**.
- Sombra de card (hover, escuro): `0 20px 44px oklch(0 0 0 / 0.5)`.
- Sombra de card (claro): `0 1px 2px …/0.05, 0 8px 24px …/0.09`; hover `0 20px 44px …/0.16`.
- Gaps típicos: hero 24px, roster 16px, corpo do card 8px, stats 16px.
- Container: `max-width 1000px`, padding lateral 56 / 40 / 22px conforme breakpoint.

## Assets
Retratos das personagens — PNG **transparentes** (recortes), tratados como figuras flutuantes
(halo + drop-shadow), nunca dentro de caixas. Estão em `assets/` neste pacote:

| Arquivo (assets/) | Personagem | Origem no projeto | Observação |
|-------------------|------------|-------------------|------------|
| `makima.png` | Makima (hero) | `uploads/…removebg-preview.png` | transparente |
| `nami.png` | Nami | `nami/nami-hero.png` | transparente |
| `frieren.png` | Frieren | `frieren/frieren.png` | transparente |
| `komi.png` | Komi | `komi/komi.png` | transparente |
| `violet.png` | Violet | `violet/violet.png` | transparente |
| `kaguya.jpg` | Kaguya | `kaguya/kaguya.jpg` | **tem fundo** — será substituída por versão transparente |
| `mai.png` | Mai | `mai/mai-hero.png` | transparente |
| `marin.png` | Marin | `marin/marin-hero.png` | transparente |
| `akane.png` | Akane | `akane/akane-hero.png` | transparente (cabelo verde água) |

> Os caminhos referenciados em `makima/data.js` apontam para as pastas originais dos agentes
> (`nami/nami-hero.png`, etc.), relativos à raiz do projeto. Ao abrir o HTML deste pacote
> isoladamente, ajuste os caminhos para `assets/…` ou rode-o a partir da raiz do projeto original.

Ícones: SVG inline, stroke 1.7, `currentColor` (ver `makima/icons.jsx`) — plus, book, user, pen,
check, calendar, tv, sparkle, film, arrow, arrowUR, moon, e o "olho-espiral" da Makima (`MkSpiral`).

## Files (neste pacote)
- `Makima — Hub.html` — host: carrega React/Babel, monta `<DirA/>` e o painel de Tweaks + controlador de tema.
- `makima/data.js` — **fonte de conteúdo**: `window.MAKIMA` (copy do hero + array `agents` com nome,
  role, img, href, descrição, stats, ações e cores de acento). Comece por aqui.
- `makima/dirA.jsx` — componente `DirA` (estrutura + todo o CSS escopado em `.mkA`, incl. temas e responsivo).
- `makima/icons.jsx` — `MkIcon` / `MkSpiral`.
- `tweaks-panel.jsx` — painel de tweaks do protótipo (pode ser ignorado/descartado no produto).
- `assets/` — retratos das personagens.

> Existe também, no projeto original, uma exploração com 3 direções alternativas
> (`Makima — Hub (exploração 3 direções).html` + `makima/dirB.jsx`, `makima/dirC.jsx`). A direção
> aprovada e documentada aqui é a **A**.
