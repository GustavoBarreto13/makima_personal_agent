# Design System: Makima

## Overview

**Creative North Star: "O Ateliê de Vidro"**

Um painel pessoal onde cada agente é uma "sala" com a sua própria cor de identidade, mas todas
dividem a mesma estrutura, o mesmo vocabulário e os mesmos componentes. A superfície é um fundo
ambiente suave (dois blobs de cor + degradê) com painéis de vidro por cima; tudo que precisa ser
lido ou preenchido fica em superfícies sólidas sobre o vidro.

O que muda de uma página para outra é só o **tom** (cor do agente) e, se o usuário quiser, o
**estilo de arte** (`src/design/art/*.css`, só custom properties `--ds-*`). A estrutura nunca muda.

**Key Characteristics:**
- Uma ação primária por contexto; ação destrutiva nunca é primária.
- Vidro só sobre o fundo ambiente: ambiente → vidro (painéis) → sólido. Nunca vidro sobre vidro.
- Cor de agente é identidade; cor semântica (sucesso/alerta/perigo/info) é significado e não muda com o agente.
- Toda tela trata 4 estados: carregando (skeleton), vazio (convida à ação), erro (tentar de novo), com dados.
- Construído para virar app: lógica em `core/` e `headless/`, aparência em `ui/`.

## Colors

Paleta em OKLCH com matiz rosado neutro nas superfícies (350° no claro, 320° no escuro) e o acento
vindo do agente ativo (`agents.json` → `[data-agent]`). O L do acento muda por tema (claro 0.52, escuro 0.72).

### Primary
- **Acento do agente** (`--ds-accent`): identidade da página; botão primário, item ativo da navegação, foco. Rosa-Makima por padrão (matiz 25).

### Neutral
- **Papel / Cartão / Névoa** (`--ds-paper`, `--ds-card`, `--ds-mist`): fundos em camadas.
- **Tinta 1–4** (`--ds-ink-1…4`): texto, do mais forte ao mais discreto (todos passam contraste AA).
- **Linha** (`--ds-line`, `--ds-line-2`): divisórias e bordas.

### Semantic
- **Perigo / Alerta / Info / Sucesso** (`--ds-danger/warn/info/success` + `-tint`): significado, nunca decoração. Cor nunca é o único sinal.
- **Estrela** (`--ds-star`): dourado **fixo**, independente do agente.

### Named Rules
**The Agent Hue Rule.** O matiz do agente colore a identidade (acento, hero, retrato); nunca o significado de um estado.
**The Token Only Rule.** Nenhuma cor, raio ou fonte literal em tela: sempre `--ds-*`.

## Typography

**Display Font:** Hanken Grotesk 800 (títulos e números, tracking negativo)
**Body Font:** DM Sans
**Label/Mono Font:** DM Mono (rótulos em caixa alta)
**Extras de domínio:** Newsreader / DM Serif Display (serifadas), Courier Prime (roteiro) e Caveat (cursiva) na Violet.

**Character:** grotesca firme nos títulos, corpo neutro e legível, rótulos técnicos em mono.

### Hierarchy
- **Display** (800, `clamp(30px, 3.6vw, 44px)`): título do Hero da tela Início.
- **Title** (`--ds-text-2xl` 28px / `-xl` 20px): títulos de página e seção.
- **Body** (`--ds-text-md` 14px, `-lg` 16px): conteúdo; texto corrido até ~680px (`--ds-w-prose`).
- **Label** (`--ds-text-xs` 11px / `-sm` 12.5px, DM Mono, caixa alta): metadados e rótulos.

### Named Rules
**The Tabular Rule.** `font-variant-numeric: tabular-nums` em todo número de dado.

## Layout

`AppShell` com anatomia fixa: sidebar 248px (marca → um CTA primário → navegação → rodapé com
`BackToMakima`, `AgentSwitcher` e tema) + topbar de vidro leve (título, busca, `Ctrl+K`, "+").
Abaixo de 900px a sidebar vira rail de 64px; abaixo de 640px vira gaveta + barra inferior (3 seções +
"Mais") + botão flutuante. A navegação nunca desaparece. Layout por container query (`ds-frame`).
Espaço em escala 4/8/12/16/22/32/48 (`--ds-space-1…8`); larguras `prose 680 · content 1120 · wide 1440`.
Densidade `comfy`/`compact` por `--ds-row-pad`.

## Elevation & Depth

Híbrido: **vidro** (blur 18px, borda clara, sombra suave) para painéis sobre o fundo ambiente e
**sólido com sombra curta** (`--ds-shadow-sm/md/lg`) para o que fica sobre o vidro. Camadas z fixas
(`sticky 10 · topbar 20 · drawer 40 · modal 50 · popover 70 · toast 90 · palette 100`).

### Named Rules
**The No Glass-On-Glass Rule.** Vidro nunca sobre vidro.

## Shapes

Raios `xs 7 · sm 10 · md 14 · lg 20 · pill 999`. Ícones Lucide com traço 1.75, um conceito = um
ícone em todo o app (`ui/icons.ts`). Emoji só como conteúdo do usuário.

## Components

Vêm sempre de `src/design/` (guia completo: `webapp/docs/DESIGN_SYSTEM.md`): `AppShell`, `Hero`,
`Button`, `Chip`, `Field`/`Input`/`DatePicker`/`TimePicker`, `Modal` (bottom sheet no celular),
`confirm()` + `toast(..., { undo })`, `useCollection` + `CollectionToolbar`, `QuickCapture`,
`StatsPage`, `DetailPage`, `Stars`/`RateInput` (0–5 com meia estrela), `EmptyState`/`ErrorState`/`Skeleton`.
Nunca criar Toast, Modal, TweaksPanel, botão, picker ou ícone locais.
Hora = `TimePicker`: relógio 24 h (minutos de 5 em 5, valor `HH:MM`), pintado só com tokens `--ds-*`; números do mostrador 15px e bolinha 38px. Nunca `<select>` de horários nem outro relógio.

## Do's and Don'ts

### Do:
- **Do** usar tokens `--ds-*` e componentes de `design/` para qualquer UI.
- **Do** tratar os 4 estados (carregando, vazio, erro, dados) em toda tela.
- **Do** oferecer botão/comando equivalente a todo atalho (padrão Windows, `Ctrl`).
- **Do** usar datas no fuso America/Sao_Paulo.
- **Do** perguntar o estilo de arte uma vez por página; o estilo muda o visual, nunca a estrutura.

### Don't:
- **Don't** usar `<input type="date|time">`, `alert/confirm/prompt`, emoji de UI, `new Date('YYYY-MM-DD')` ou `toISOString().slice(0,10)`.
- **Don't** declarar cor, raio ou fonte literal fora de `tokens.json` (edite o JSON e rode `npm run tokens`).
- **Don't** colocar layout dentro de `art/*.css` (só custom properties).
- **Don't** deixar o `design/` chamar a rede ou o `core/` importar React/DOM.
- **Don't** usar o Impeccable para introduzir visual fora deste sistema: em conflito, o Design System vence.
