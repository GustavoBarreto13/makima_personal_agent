# Handoff: Calendário da Kaguya (Notion Calendar / Google Calendar)

## Overview
Um calendário pessoal completo no estilo **Notion Calendar / Google Calendar**, parte do app **Kaguya · Tarefas** (suíte Makima). Reúne, numa única agenda, as "bases" do produto (Tarefas, Finanças, Livros, Filmes, Diário) e integrações externas (Animes, Futebol, Feriados, Google Agenda) — cada uma como um **calendário conectado** que pode ser ligado/desligado e recolorido. Suporta visões **Dia / Semana / Mês**, arrastar para mover, redimensionar, arrastar no grid vazio para criar, e arrastar tarefas sem horário para fazer *time-blocking*.

## About the Design Files
Os arquivos deste pacote são **referências de design feitas em HTML/CSS + React (via Babel no navegador)** — um protótipo de alta fidelidade que demonstra o visual e o comportamento pretendidos, **não código de produção para copiar diretamente**. A tarefa é **recriar este design no ambiente do seu codebase** (React, Vue, Svelte, SwiftUI, etc.), usando os padrões, a biblioteca de componentes e o sistema de design já existentes lá. Se ainda não houver um ambiente, escolha o framework mais adequado e implemente o design nele. Os valores de cor, tipografia, espaçamento e as regras de interação documentados aqui são a fonte da verdade.

Para rodar a referência: abra **`Calendario-standalone.html`** num servidor estático (ou direto no navegador). Troque `variant` (`agora` | `helvetico` | `editorial`) e `data-theme` (`light` | `dark`) no script de mount ao final do arquivo.

## Fidelity
**Alta fidelidade (hifi).** Cores, tipografia, espaçamento e interações são finais. Recrie a UI fielmente usando as bibliotecas/o design system do seu codebase. O protótipo usa **OKLCH** para todas as cores — converta para o espaço de cor do seu ambiente se necessário (todos os navegadores modernos suportam `oklch()` e `color-mix()` nativamente).

---

## Screens / Views

O calendário é **uma única tela** com três modos de visualização e uma coluna lateral fixa de calendários. Layout raiz (`.calx`): coluna flex vertical ocupando todo o container — **barra de navegação** (topo, fixa) + **corpo** (grid à esquerda/direita + coluna de calendários do outro lado).

### 1. Barra de navegação (`.cal-bar`)
- **Layout:** flex horizontal, `padding: 13px 18px 13px 22px`, `border-bottom: 1px solid var(--line)`, fundo translúcido `var(--topbar-bg)` com `backdrop-filter: blur(12px)`.
- **Componentes (esquerda → direita):**
  - **Mês + ano** (`.cal-month`): `font-family: var(--display)` (Hanken Grotesk), `22px`, `weight 800`, `letter-spacing -0.02em`, `text-transform: capitalize`. Em `editorial`, vira serif (Playfair Display) `27px/700`.
  - **Rótulo da semana** (`.cal-week-lbl`): mono `11px`, uppercase, `letter-spacing 0.08em`, `var(--ink-4)`. Ex.: "SEMANA 24". Calculado pelo número ISO da semana usando o **meio da semana exibida** (quinta-feira) para casar com a numeração do Notion.
  - **Setas ‹ ›** (`.cal-iconbtn`): 30×30, raio 8px, hover `background: var(--card-2)`.
  - **Botão "Hoje"** (`.cal-today`): 32px de altura, `padding 0 14px`, borda `var(--line)`, fundo `var(--card)`.
  - **Spacer** (flex: 1).
  - **Segmented Dia / Semana / Mês** (`.cal-seg`): container `padding 3px`, `gap 2px`, fundo `var(--card-2)`, borda `var(--line)`, raio 10px. Botão ativo (`.on`): fundo `var(--card)`, cor `var(--kg-deep)`, `box-shadow: var(--shadow-sm)`.

### 2. Vista de Semana / Dia (`TimeGrid`)
Visão padrão = **Semana** (domingo→sábado). "Dia" = a mesma engine com 1 coluna.
- **Cabeçalho dos dias** (`.cal-dayhead`, *sticky* no topo do scroll): grid `var(--gutter) repeat(N, 1fr)`. Cada dia: sigla (mono 10px uppercase) + número (`var(--display)` 19px/700, círculo 30px). **Hoje**: número com fundo `var(--kg)` e texto branco; sigla em `var(--kg-deep)`. Canto esquerdo mostra o fuso ("BRT", mono 8.5px).
- **Faixa all-day** (`.cal-allday`, *sticky* abaixo do cabeçalho): rótulo "todo dia" (mono 8.5px) + 1 coluna por dia com *pills* empilhados. `max-height: 116px`, rola se transbordar.
  - **Pill all-day** (`.cad-pill`): `11px/600`, raio 6px, fundo `color-mix(in oklab, var(--cc) 20%, var(--card))`, cor `var(--cc)`, borda `color-mix(in oklab, var(--cc) 30%, transparent)`. `--cc` = cor do calendário do evento (ou cor sobrescrita do evento).
- **Grid de horas** (`.cal-grid`, rolável `.cal-scroll`): altura `calc(24 * var(--hh))`. Gutter de horários à esquerda (`var(--gutter)` = 58px) com rótulos mono 9.5px posicionados em `top: (h/24)*100%`. Cada coluna de dia (`.cg-col`) tem linhas de hora desenhadas via `repeating-linear-gradient(to bottom, var(--line-2) 0 1px, transparent 1px calc(var(--hh)))`. **Hoje**: leve tinta `color-mix(in oklab, var(--kg) 4%, transparent)`. O scroll inicial posiciona ~07:00.
- **Linha do "agora"** (`.cg-now`): borda-topo 2px `var(--p-high)` (vermelho) com bolinha à esquerda; só na coluna de hoje, em `top: (nowMin/1440)*100%`. O rótulo de hora atual aparece em vermelho no gutter.
- **Evento com horário** (`.cg-event`): posição absoluta calculada em **% de 24h** (independe da altura da hora): `top = (startMin/1440)*100%`, `height = (durMin/1440)*100% - 2px`. Largura/posição horizontal via algoritmo de pistas para sobreposição (ver Interações). Conteúdo: título (`600`, até 2 linhas), faixa de horário (mono 9px), e local opcional. Eventos ≤30min usam layout `tiny` (1 linha). Tarefas (`kind:'task'`) têm borda tracejada. Alça de redimensionar no rodapé (`.cg-resize`, 8px).

### 3. Vista de Mês (`MonthGrid`)
- **Layout:** `.cmo-grid` = linha de dias da semana (nomes completos, mono 9.5px, alinhados à direita) + 6 semanas em `grid` de 7 colunas que preenchem a altura.
- **Célula** (`.cmo-cell`): número do dia (mono 11px, círculo 22px; **hoje** com fundo `var(--kg)`). Dias fora do mês (`.dim`) com fundo `var(--card-2)`. Mostra o nome do mês abreviado quando muda de mês.
- **Pill** (`.cmo-pill`): eventos com horário mostram bolinha de cor + hora + título; eventos all-day usam `.filled` (fundo tonal). Limite de 4 por célula + "+N mais".

### 4. Coluna de calendários (`CalendarsAside` / `.cal-aside`)
Largura `var(--col-w)` = 264px. Fica **à direita** em `agora`/`editorial` e **à esquerda** em `helvetico` (atributo `data-col` no `.calx`). Conteúdo rolável:
- **Mini-mês** (`.mini`): título (display 13.5px) + navegação ‹ › própria. Grade 7×6, dias 10.5px mono em círculo; **hoje** em `var(--kg-deep)`; dia selecionado com fundo `var(--kg)`; **a semana atual fica realçada** com uma faixa arredondada `var(--kg-tint)`. Clicar num dia navega o calendário principal.
- **Busca** (`.cal-srch`): campo "Encontrar com…" (decorativo no protótipo).
- **Grupos de conta** (`CAL_ACCOUNTS`): cabeçalho "Makima · suíte · bases do app" e "gustavo@gmail.com · Google Agenda". Cada calendário (`.cal-item`):
  - **Checkbox colorido** (`.ci-box`, 17×17, raio 5px): preenchido com `var(--cc)` quando visível (check branco), vazado quando oculto.
  - **Nome** (13px). Tag "padrão" no calendário primário.
  - **Ícone de balde** (recolorir) → abre paleta inline (`.cal-colors`, swatches 24px de `CAL_SWATCHES`).
  - **Ícone de olho** (mostrar/ocultar). Aparece no hover.
- **"Adicionar conta de calendário"** (`.cal-addacct`): borda tracejada; no protótipo cria um calendário novo com cor livre.
- **Bandeja "Sem horário"** (`.cal-tray`): tarefas da semana sem hora; cada card é **arrastável** para o grid (time-blocking).

---

## Interactions & Behavior
Toda a manipulação de eventos no grid usa **pointer events** com compensação de escala (lê `rect.height / offsetHeight` da coluna), então funciona corretamente mesmo sob zoom de um canvas. Snap de **15 minutos**.

- **Mover evento:** `pointerdown` no corpo do evento → arrasta. A coluna sob o cursor define o novo dia; o Y define o novo horário (preservando o offset de onde se pegou). Fantasma ao vivo; *commit* no `pointerup`. Clique sem arrastar = abre o popover.
- **Redimensionar:** `pointerdown` na alça inferior (`.cg-resize`) → ajusta só o fim (mínimo 15min).
- **Criar arrastando:** `pointerdown` numa área vazia da coluna → arrasta para definir início/fim (mínimo 30min) → cria evento e abre o popover de edição. Mostra fantasma `.cg-ghost` (tracejado, com faixa de horário).
- **Time-blocking:** arrastar um card da bandeja (HTML5 drag-and-drop) e soltar numa coluna cria um evento da base **Kaguya** com a duração estimada da tarefa, no horário do drop.
- **Popover de evento** (`EventPopover`): título editável, horário/local, calendário de origem, botão de **cor** (paleta + "voltar à cor do calendário") e **excluir**. Posicionado ao lado do elemento, com clamp à viewport.
- **Menu de contexto** (clique-direito no evento, `ContextMenu`): linha de swatches para recolorir, **duplicar**, "cor do calendário", **excluir**.
- **Recolorir calendário/base:** balde na lateral → muda a cor de **todos** os eventos daquela base de uma vez.
- **Cor por evento:** sobrescreve só aquele evento (campo `color`); some-se à cor da base.
- **Ligar/desligar calendário:** checkbox ou olho filtra os eventos daquela base do grid e do mês.
- **Navegação:** ‹ › avança dia/semana/mês conforme a visão; "Hoje" volta ao presente; clicar no cabeçalho de um dia (semana) ou numa célula (mês) abre a **vista de Dia** naquela data; mini-mês navega.
- **Dica flutuante** (`.cal-hint`): "Arraste no grid para criar · arraste eventos para mover" aparece por ~4,2s ao entrar e some.

### Animações / transições
- Popover/menu: `cpop-in` (140–120ms, `cubic-bezier(.2,.8,.3,1)`), `opacity` + `translateY(-6px)` + `scale(.98)`.
- Hover de evento: `box-shadow .12s`; alça de resize revela um *grip* (`opacity .12s`).
- Dica: `opacity .2s`.

## State Management
Estado local do componente raiz `CalendarPro`:
- `view`: `'day' | 'week' | 'month'` (padrão `'week'`).
- `refDate`: `Date` de referência (data "ativa").
- `events`: array de eventos (clone de `CAL_EVENTS`). Mutado por mover/redimensionar/criar/duplicar/excluir/recolorir. Shape do evento: `{ id, cal, day:'YYYY-MM-DD', start:'HH:MM', end:'HH:MM', allDay:bool, color:null|oklch, kind:'event'|'task', loc?, taskId? }`.
- `cals`: array de calendários (clone de `CALENDARS`) com `visible` e `color` editáveis.
- `pop`: `{ ev, anchor }` do popover aberto (ou null). Re-render por `key={ev.id}`.
- `ctx`: `{ ev, x, y }` do menu de contexto (ou null).
- `hint`: bool da dica inicial.

Derivações: `visibleIds` (Set de calendários visíveis), `calFor(ev)` (lookup de calendário), `days` (dias da visão), `weekDays(refDate)`, `unscheduledForWeek(weekIsos)` (bandeja). Sem data-fetching no protótipo — os arrays mock imitam o que `/api/calendars/*` e os conectores devolveriam.

## Design Tokens
Todos em **OKLCH**. Os tokens de superfície/tinta/tipo vêm de `.kg-app` (`_shared_styles.css`); o calendário herda e adiciona geometria + paletas próprias (`cal.css`).

**Superfícies — claro:** `--paper: oklch(0.991 0.005 350)` · `--paper-2: 0.974/0.008/350` · `--card: 1/0.001/350` · `--card-2: 0.978/0.007/350` · `--line: 0.905/0.011/348` · `--line-2: 0.944/0.008/348`.
**Tinta — claro:** `--ink: 0.275/0.020/348` · `--ink-2: 0.452` · `--ink-3: 0.595` · `--ink-4: 0.715`.
**Acento Kaguya:** `--kg: oklch(0.56 0.13 252)` · `--kg-deep: 0.47/0.13/254` · `--kg-bright: 0.69/0.12/250` · `--kg-tint: --kg / 0.12` · `--kg-tint-2: --kg / 0.20`.
**Semânticos:** `--p-high: 0.575/0.195/22` (vermelho/agora) · `--p-med: 0.735/0.135/78` (dourado) · `--p-low: 0.585/0.085/250` (ardósia) · `--done: 0.615/0.115/158` (esmeralda).

**Tema escuro do calendário (superfície suavizada, escopo `.kg-app[data-theme='dark'] .calx`):** `--paper: 0.246/0.020/320` · `--paper-2: 0.272/0.022/322` · `--card: 0.298/0.022/322` · `--card-2: 0.264` · `--line: 0.392/0.022/326` · `--line-2: 0.350`. No escuro, eventos do **Ágora** ganham mais corpo e texto claro: `background: color-mix(in oklab, var(--cc) 30%, var(--card))`, `color: color-mix(in oklab, var(--cc) 32%, white)`, borda-esquerda `color-mix(var(--cc) 75%, white)`.

**Cores dos calendários (`CALENDARS[].color`):**
| Calendário | Cor |
|---|---|
| Kaguya · Tarefas | `oklch(0.56 0.13 252)` (azul) |
| Nami · Finanças | `oklch(0.70 0.17 52)` (laranja) |
| Frieren · Livros | `oklch(0.72 0.10 184)` (teal) |
| Akane · Filmes | `oklch(0.60 0.20 18)` (carmim) |
| Violet · Diário | `oklch(0.58 0.16 300)` (violeta) |
| Animes | `oklch(0.64 0.18 350)` (rosa) |
| Palmeiras / Copa | `oklch(0.60 0.15 150)` (verde) |
| Feriados no Brasil | `oklch(0.72 0.135 80)` (dourado) |
| Agenda pessoal (Google) | `oklch(0.58 0.13 250)` (índigo) |

**Paleta de recolorir (`CAL_SWATCHES`):** as 9 cores acima + `oklch(0.62 0.05 280)` (cinza).

**Geometria do calendário (`.calx`):** `--hh` (altura de 1 hora) = 52px (`agora`), 54px (`helvetico`), 60px (`editorial`) · `--gutter: 58px` · `--col-w: 264px`. Snap de tempo: 15min.

**Raios:** `--kg-r-sm: 7px` · `--kg-r-md: 12px` · `--kg-r-lg: 18px`; eventos 6–7px; pills 5–6px.
**Sombras:** `--shadow-sm`, `--shadow-md`, `--shadow-lg` (definidas em `_shared_styles.css`).
**Tipografia:** display `'Hanken Grotesk'`; serif `'Playfair Display'` (só `editorial`); corpo `'DM Sans'`; mono `'DM Mono'` (horários, contadores, rótulos).

### As 3 variantes (`data-variant`)
- **`agora` (Notion, padrão):** evento = bloco tonal claro `color-mix(var(--cc) 22%, var(--card))` + barra de cor 3px à esquerda + texto na cor. Coluna de calendários à direita. Denso.
- **`helvetico` (Google):** evento = bloco **sólido** `var(--cc)` com texto branco, sem barra. Coluna à esquerda.
- **`editorial` (assinatura Kaguya):** evento = **cartão** `var(--card)` com borda-esquerda 4px de cor e texto `var(--ink)`; mês em serif; `--hh` maior (mais ar).

## Assets
Sem imagens. Todos os ícones são **SVG de traço inline** definidos no objeto `ICONS` em `_shared_ui.jsx` (componente `<Icon name="…" />`, `stroke-width 1.8`, `viewBox 0 0 24 24`). Ícones usados pelo calendário incluem: `chevL`, `chevR`, `search`, `check`, `plus`, `clock`, `trash`, `copy`, `loop`, `home`, e os adicionados em `cal-views.jsx` (`eye`, `eyeOff`, `paint`, `link`). As fontes vêm do Google Fonts (Hanken Grotesk, Playfair Display, DM Sans, DM Mono). No seu codebase, substitua os ícones pelo icon set existente.

## Files
Arquivos centrais do calendário (recrie estes):
- **`cal-data.js`** — modelo de dados: contas (`CAL_ACCOUNTS`), calendários (`CALENDARS`: bases + integrações), eventos da semana (`CAL_EVENTS`), paleta (`CAL_SWATCHES`), bandeja (`unscheduledForWeek`) e helpers de tempo do calendário.
- **`cal.css`** — todo o sistema visual do calendário (claro/escuro, 3 variantes, grid, eventos, mini-mês, lista de calendários, popover, menu).
- **`cal-engine.jsx`** — `TimeGrid`: motor do grid de horas (mover/redimensionar/criar por pointer, drop de time-block, layout de pistas para sobreposição, now-line).
- **`cal-views.jsx`** — `MiniMonth`, `CalendarsAside`, `MonthGrid`, `EventPopover`, `ContextMenu`, `TrayCard`.
- **`cal.jsx`** — `CalendarPro`: orquestra views, estado de eventos/calendários, navegação, popover/menu.

Dependências compartilhadas (incluídas como referência — no seu codebase, mapeie para os equivalentes existentes):
- **`_shared_data.js`** — helpers de data (`d2iso`, `iso2d`, `isoAdd`, `timeToMin`, `minToTime`, `fmtTime`, `fmtEst`), constantes (`TODAY`, `NOW_MIN`, `DIAS_ABBR`, `MESES_FULL`…), `PRIO` e `TASKS` (mock).
- **`_shared_ui.jsx`** — componente `Icon` (+ `Check`, chips) e o objeto `ICONS`.
- **`_shared_styles.css`** — tokens de design (`.kg-app`: superfícies, tinta, acento, sombras, fontes) e o tema escuro base.

Demo executável: **`Calendario-standalone.html`** (carrega tudo na ordem certa e monta `<CalendarPro variant="agora" />`).

> Observação: `TODAY` está fixo em `2026-06-11` e `NOW_MIN` em `11:25` para a demo. Numa implementação real, derive de `new Date()`.
