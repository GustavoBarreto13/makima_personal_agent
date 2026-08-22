# Handoff: Yato · Viagens (spec 066 — seção de viagens do app Makima)

## Overview

Seção **Viagens** do app pessoal Makima, curada pela persona **Yato** (*Noragami*). O usuário viaja
sozinho, sem carro, para cidades pequenas e médias do interior do Brasil. O problema não é escolher a
cidade — é **chegar e não conseguir se locomover**.

**Princípio central: a UI não vende destino, ela mostra grau de certeza.** O herói visual é o
**veredito** — o quanto se sabe sobre a mobilidade de uma cidade e quão confiável é o que se sabe.
Nada de foto bonita de pousada.

O componente-assinatura é o **`MobilityDossier`**: um protocolo fixo de 7 passos para descobrir como
se locomover numa cidade, renderizado como coluna vertical de carimbos.

Referência normativa completa: **`design-guide.md`** neste bundle (é o brief original, escrito antes do
protótipo; §§1–12 são a fonte de verdade). Onde este README e o guia divergirem em estética, vale o
protótipo; onde divergirem em **regras de veredito**, vale o guia.

## About the Design Files

Os arquivos deste bundle são **referências de design feitas em HTML/CSS/JSX-no-browser** — protótipos
que mostram aparência e comportamento pretendidos, **não código de produção para copiar**. O JSX roda
via Babel no navegador, os dados são mocks em memória e não há build, tipos, testes ou camada de API.

A tarefa é **recriar estes designs no ambiente já existente do codebase** (aqui: React 19 +
TypeScript + Vite 6, padrão de shells por domínio em `webapp/frontend/src/pages/<domain>/`), usando
seus padrões, seus componentes e seu cliente de API. Se não houvesse ambiente definido, a escolha do
framework ficaria a critério de quem implementa.

Estrutura-alvo esperada no port (do guia, §11):

```
webapp/frontend/src/pages/yato/
├── YatoShell.tsx            # sidebar + topbar + router interno + footbar
├── yatoApi.ts               # client de /api/travel/* sobre lib/api.ts
├── types.ts                 # Trip, ItineraryItem, MobilityDossier, MobilityCheck, BudgetItem…
├── yato.css                 # tokens em .yato-shell + tema claro + 4 acentos + 3 densidades
├── TweaksPanel.tsx
├── screens/    HomeScreen · TripsScreen · TripDetailScreen · MobilityScreen · BudgetScreen · ChecklistScreen
├── components/ MobilityDossier · VerdictChip · TripCard · DayColumn · ItineraryItem ·
│               AppSuggestionCard · ComfortMatrix · BudgetBar · ChecklistRow · ReadinessMeter · Icon
├── modals/     NewTripModal · NewItemModal · LogExpenseModal · ProtocolWizard
└── ui/Toast.tsx
```

Regras de projeto que o port não pode violar (guia §10):

1. Nunca `fetch` direto — sempre via `yatoApi.ts` sobre `lib/api.ts`.
2. CSS escopado em `.yato-shell`, zero vazamento para outros shells.
3. Rota `<Route path="/travel/*" element={<YatoShell />} />` **antes** do catch-all `/*` em `App.tsx`.
4. Sem lógica de domínio no front: matriz ANTT, consolidação de estratégia e validação de datas
   vivem no backend (`agents/yato/`). O front renderiza o que vier.
5. Cores de veredito são fixas e não mudam com `[data-accent]`.
6. `inconclusivo` nunca é vermelho e nunca usa ícone de erro.
7. Veredito nunca é comunicado só por cor — sempre símbolo + rótulo textual.
8. Selo "confirmar in-app" é obrigatório em todo `AppSuggestionCard`.
9. Datas em UTC-3 — usar `todayLocalISO()` de `pages/violet/dateUtils.ts`. Proibido
   `new Date().toISOString().slice(0,10)`.
10. Rotas fixas antes das paramétricas no router FastAPI; `require_user` em todas as `/api/travel/*`.
11. `[data-accent]` sem valor = azul-cachecol (não escrever `data-accent="azul"`).
12. Horário é opcional no roteiro — se `start_time` é `null`, não renderizar horário nenhum.

## Fidelity

**Alta fidelidade (hifi).** Cores, tipografia, espaçamentos, estados e microcopy são finais e devem
ser recriados fielmente com os componentes do codebase. Os únicos itens deliberadamente "de mock":
dados (viagens, dossiês, gastos), a persistência (tudo em memória) e a ausência de rede.

---

## Design Tokens

Todos em OKLCH, escopados em `.yato-shell`. **Escuro é o padrão**; `[data-theme='light']`
sobrescreve. Fonte: `yato/styles.css`.

### Superfícies, tinta, linhas (escuro)

| Token | Valor | Uso |
|---|---|---|
| `--paper` | `oklch(0.14 0.014 250)` | fundo principal |
| `--paper-2` | `oklch(0.18 0.016 250)` | sidebar, topbar |
| `--card` | `oklch(0.21 0.014 250)` | cards, painéis |
| `--card-2` | `oklch(0.25 0.014 250)` | hover, inputs, card interno |
| `--ink` | `oklch(0.94 0.010 90)` | texto principal (levemente quente) |
| `--ink-2` | `oklch(0.74 0.014 90)` | corpo secundário |
| `--ink-3` | `oklch(0.56 0.014 88)` | metadados |
| `--ink-4` | `oklch(0.42 0.012 86)` | rótulos apagados |
| `--line` | `oklch(0.31 0.016 250)` | bordas |
| `--line-2` | `oklch(0.25 0.014 250)` | divisórias internas |
| `--line-dash` | `oklch(0.36 0.018 250)` | tracejado de ticket e de rota |
| `--topbar-bg` | `oklch(0.18 0.016 250 / 0.86)` | topbar translúcida (blur 10px) |
| `--footbar-bg` | `oklch(0.18 0.016 250 / 0.94)` | footbar translúcida |

### Kraft e textura de mapa

`--kraft: oklch(0.34 0.032 68)` · `--kraft-2: oklch(0.40 0.036 68)` ·
`--kraft-ink: oklch(0.90 0.020 80)` · `--map-line: oklch(0.30 0.018 250 / 0.55)` ·
`--grid-line: oklch(0.28 0.014 250 / 0.35)`.

A textura de fundo (`.yato-tex`, `position:absolute; inset:0; pointer-events:none; z-index:0;
opacity:0.5`) tem 5 camadas de `background-image`: malha milimetrada de 24px em dois eixos
(`repeating-linear-gradient` 0deg e 90deg, 1px de linha) + 3 `repeating-radial-gradient` elípticos
simulando curvas de nível (anéis de 1px a cada 78/92/104px, em `--map-line`). No tema claro,
`opacity: 0.7`. Desligável via `[data-texture='off']`.

### ⚠️ Vereditos — FIXOS, independentes do acento

Esta é a regra mais importante do shell.

| Veredito | Token | Escuro | Claro | Símbolo | Rótulo | Leitura |
|---|---|---|---|---|---|---|
| confirmado | `--verdict-ok` | `oklch(0.72 0.15 152)` | `oklch(0.52 0.15 152)` | `●` | CONFIRMADO | verifiquei e existe |
| ausente | `--verdict-none` | `oklch(0.62 0.10 25)` | `oklch(0.50 0.12 25)` | `⊖` | AUSENTE | verifiquei e não existe |
| inconclusivo | `--verdict-unknown` | `oklch(0.78 0.13 78)` | `oklch(0.58 0.14 72)` | `◐` | INCONCLUSIVO | verifiquei e não deu pra saber |
| pendente | `--verdict-pending` | `oklch(0.52 0.012 250)` | `oklch(0.62 0.010 250)` | `○` | PENDENTE | ainda não verifiquei |
| n/a | (usa `--ink-4`) | — | — | `—` | N/A | não se aplica (escala pedonal) |

Cada um tem par `-tint` com alpha `0.16` (`pendente`: `0.14`) para fundo de carimbo.

**Proibido:** pintar `inconclusivo` de vermelho ou dar-lhe ícone de erro; usar a mesma cor para
`ausente` e `inconclusivo`; renderizar `pendente` como se fosse `ausente`; comunicar veredito só pela
cor.

### Acento — 4 variantes via `[data-accent]`

| Variante | `--yato` | `--yato-deep` | `--yato-bright` | hue |
|---|---|---|---|---|
| (default) azul-cachecol | `oklch(0.58 0.14 250)` | `oklch(0.74 0.13 250)` | `oklch(0.82 0.11 250)` | 250 |
| `ouro` | `oklch(0.72 0.13 85)` | `oklch(0.82 0.12 86)` | `oklch(0.88 0.10 86)` | 85 |
| `carmim` | `oklch(0.58 0.18 22)` | `oklch(0.72 0.16 24)` | `oklch(0.80 0.14 24)` | 22 |
| `musgo` | `oklch(0.58 0.10 145)` | `oklch(0.72 0.10 146)` | `oklch(0.80 0.09 146)` | 145 |

`--yato-tint` = acento com alpha 0.16; `--yato-tint-2` = alpha 0.30.

### Perfil e orçamento

`--profile-eco: oklch(0.70 0.13 145)` · `--profile-mid: oklch(0.74 0.12 85)` ·
`--profile-lux: oklch(0.72 0.12 300)`.
`--budget-ok: oklch(0.70 0.12 152)` (até 80%) · `--budget-warn: oklch(0.78 0.13 78)` (80–100%) ·
`--budget-over: oklch(0.64 0.17 22)` (>100%) · `--budget-track: oklch(0.30 0.014 250)`.

### Tema claro `[data-theme='light']` — "caderno aberto na mesa"

`--paper: oklch(0.96 0.010 85)` · `--paper-2: oklch(0.93 0.014 82)` · `--card: oklch(0.99 0.006 85)` ·
`--card-2: oklch(0.95 0.010 84)` · `--ink: oklch(0.24 0.020 250)` (degraus 0.42 / 0.56 / 0.70) ·
`--line: oklch(0.86 0.014 84)` · `--line-2: oklch(0.91 0.010 84)` ·
`--line-dash: oklch(0.78 0.018 84)` · `--kraft: oklch(0.86 0.045 70)` ·
`--kraft-2: oklch(0.90 0.038 70)` · `--kraft-ink: oklch(0.30 0.030 60)` ·
`--map-line: oklch(0.72 0.020 250 / 0.45)` · `--grid-line: oklch(0.80 0.014 250 / 0.40)` ·
`--budget-track: oklch(0.88 0.012 84)`. Vereditos escurecem (tabela acima).

### Tipografia

| Papel | Família | Uso |
|---|---|---|
| Display | **Bitter** 400/500/600/700 | títulos de tela, nome da cidade, hero, carimbos |
| Texto | **Inter** 300–700 | corpo, labels, botões |
| Mono | **JetBrains Mono** 400/500 | datas, horários, valores, coordenadas, códigos |

Google Fonts. Escala em uso: hero `clamp(34px, 4vw, 52px)` /700/`-0.025em`/lh 0.98 · título de tela
19–20px/600 · card 14.5px/600 · corpo 15px (base) e 12.5–13px em painéis · micro 10–11.5px ·
mono 11–12.5px. **Carimbo**: Bitter 700, `letter-spacing: 0.14em`, `text-transform: uppercase`,
9.5px (sm) / 10.5px (md).

### Raios, densidade, sombras

`--r-sm: 4px` · `--r-md: 8px` · `--r-lg: 12px` · `--r-pill: 999px`.
`--gap: 14px` e `--day-col-w: 300px`; `[data-density='compact']` → `9px` / `244px`;
`[data-density='large']` → `20px` / `356px`.
`--shadow-sm: 0 1px 2px oklch(0 0 0 / .45)` · `--shadow-md: 0 3px 10px oklch(0 0 0 / .50)` ·
`--shadow-lg: 0 16px 40px oklch(0 0 0 / .60)` (claro: alphas .10 / .12 / .16).

---

## Layout do Shell

```
┌──────────┬──────────────────────────────────────────────────────┐
│          │  TOPBAR 56px  busca · viagem ativa · progresso 6/7   │
│ SIDEBAR  ├──────────────────────────────────────────────────────┤
│  220px   │  CONTEÚDO (scroll próprio, .page max-width 1180px)   │
│          │                                                      │
│          ├──────────────────────────────────────────────────────┤
│          │  FOOTBAR 44px  próxima pendência · resumo · ⚙        │
└──────────┴──────────────────────────────────────────────────────┘
```

`.yato-shell`: `display:grid; grid-template-columns:220px 1fr; grid-template-rows:1fr 44px;
height:100vh; overflow:hidden`. A sidebar ocupa `grid-row: 1 / 3`.

**Armadilha de layout (bug real corrigido no protótipo):** `1fr` é `minmax(auto,1fr)`, então a
trilha de conteúdo não encolhe abaixo do min-content dos filhos da topbar e o excedente é clipado sem
scroll. Exige `min-width: 0` em `.yato-main`, `.yato-scroll` e `.footbar`, busca encolhível
(`flex: 1 1 190px; max-width: 280px`) e `white-space: nowrap; flex-shrink: 0` no pill de protocolo.

### Sidebar (`.yato-side`, 220px, `--paper-2`, borda direita `--line`)

- **Marca**: avatar circular 38px (imagem do Yato, `object-position: center 6%`, borda
  `--yato-tint-2`, halo `box-shadow: 0 0 0 3px var(--yato-tint)`) + `🎒 Yato` (Bitter 17/700) +
  `viagens` (mono 9.5px, `0.16em`, uppercase, `--yato-deep`).
- **Mini-card kraft da viagem ativa** (`.side-trip`, clicável → Roteiro): rótulo mono "viagem ativa",
  cidade/UF em Bitter 15/600, datas em mono 11px, contagem regressiva em 11.5px/600.
- **Nav**: Início · Viagens · Roteiro · Mobilidade · Orçamento · Checklist. Item: ícone 17px +
  label 13.5px, `padding: 8px 10px`, `--r-sm`; hover `--card-2`; ativo `background: var(--yato-tint);
  color: var(--yato-deep); font-weight: 600`. Contador à direita em mono 10.5px (nº de viagens, itens
  de roteiro, passos pendentes do protocolo, itens de checklist abertos).
- **Rodapé**: frase em Bitter itálico 12.5px — *"Só saio de casa quando sei como volto."* (manter
  exata) — botão primário **"+ Nova viagem"** e link "Voltar à Makima" (dot 6px
  `oklch(0.66 0.145 5)`).

### Topbar (`.yato-topbar`, 56px, sticky, `backdrop-filter: blur(10px)`)

Título da tela (Bitter 16/600, escondido <1040px) · busca pill 32px ("Buscar viagem, cidade…";
foco: borda `--yato` + `box-shadow: 0 0 0 3px var(--yato-tint)`) · à direita, `<select>` de viagem
ativa e o **pill de progresso do protocolo**: `ReadinessMeter` de 7 segmentos (52px de largura) +
`6/7 checados` em mono 11px. Clique → Dossiê.

### Footbar (`.footbar`, 44px)

Esquerda: próxima pendência do checklist (checkbox 12px vazio + label + `· <cidade>`), clicável →
Checklist; texto com `nowrap`/ellipsis. Direita: resumo mono (`10 itens · R$ 1.535 gastos`, escondido
<1040px) e engrenagem que abre o painel de preferências.

---

## Screens / Views

### 1. Início (`home`)

**Propósito:** responder "estou pronto para essa viagem?" em um olhar.

**Layout:** `.page` (max 1180px, `padding: 22px 26px 56px`) → hero → grid de 3 painéis → linha do
tempo do dia 1 → grade de outras viagens.

**Hero** (`.hero`): `border-radius: --r-lg`, borda `--yato-tint-2`, fundo
`linear-gradient(148deg, var(--kraft) 0%, var(--card) 58%)` + `radial-gradient(120% 130% at 86% 24%,
var(--yato-tint-2), transparent 56%)`, com camada `.hero-tex` (malha 22px + 1 conjunto de curvas de
nível em `oklch(0 0 0 / 0.10–0.13)`, `opacity: 0.5`).
`.hero-inner`: `grid-template-columns: minmax(0,1fr) 252px; gap: 22px; min-height: 330px;
padding: 30px 22px 0 34px; align-items: stretch`.

- Coluna esquerda (`.hero-copy`, centrada verticalmente, `gap: 14px`): eyebrow mono
  "caderno de bordo · próxima viagem" (`--kraft-ink`, opacity .8) · **cidade/UF** em Bitter
  `clamp(34px,4vw,52px)`/700, UF em `--yato-deep` peso 400 · linha de meta em mono 12.5px
  (datas · dias · chip de perfil · "faltam N dias" em Bitter 15/600 `--yato-deep`) · citação em Bitter
  itálico 13.5px com barra esquerda 2px `--yato` · CTAs `Abrir dossiê` (primário) e `Ver roteiro`
  (kraft).
- Coluna direita (`.hero-right`, `justify-content: flex-end`): card de prontidão
  (`background: oklch(0.14 0.014 250 / 0.66)`, borda `--line`, blur 8px) com rótulo mono
  "prontidão do protocolo", número Bitter 24/700 (`6/7`), `ReadinessMeter` size `lg` (segmentos 16px)
  e sub "checklist 56% · 1 passo pendente"; abaixo, o **retrato do Yato** (PNG transparente, largura
  100% da coluna, `drop-shadow(0 16px 28px oklch(0 0 0 / .45))`, halo radial atrás em `--yato-tint-2`
  com `blur(3px)`), colado na base do hero (`margin-bottom: -2px`).
- Responsivo: <1000px a coluna direita vira `clamp(160px,22vw,252px)`; <720px o hero vira 1 coluna e a
  coluna direita é escondida.

**3 painéis** (`.tri-grid`, 3 col, `gap: var(--gap)`):
1. *Estratégia de mobilidade* — emoji + estratégia consolidada em Bitter 17/600, `ReadinessMeter`
   clicável com "6/7 checados", resumo do dossiê.
2. *Orçamento* — realizado em Bitter 24/700 + "de R$ 1.750" em mono, barra de progresso 8px, saldo
   (verde/vermelho) e nota do estouro.
3. *Próximas pendências* — até 5 linhas de checklist com checkbox 12px, e "feitos X de Y" no pé.

**Linha do tempo do dia 1**: card com os itens do primeiro dia usando o mesmo `ItineraryItem` do
board (ícone circular do modal + costura tracejada entre itens consecutivos).

**Outras viagens**: `.trips-grid` (`repeat(auto-fill, minmax(340px,1fr))`) de `TripCard`.

**Estado vazio** (sem viagens): card centrado, emoji 🎒 34px, frase em Bitter 16/600 —
*"Nenhuma viagem no horizonte. Cinco ienes e eu te levo pra qualquer lugar."* — e botão
"+ Nova viagem".

### 2. Viagens (`trips`)

Cabeçalho com contagem ("4 de 4") e alternância **grade ⇄ lista**. Filtros de status em chips:
todas · planejando · confirmada · em curso · concluída · cancelada. Ordenação vem do tweak
`ordenacao` (Data de ida · Criada · Prontidão · Orçamento) e é ecoada em mono à direita
("ordenado por data de ida"). Busca da topbar filtra cidade/UF/título.

- **Grade**: `TripCard` (ver componentes).
- **Lista**: tabela com colunas cidade/UF · datas · perfil · prontidão (meter + "n/7") · orçamento ·
  status. Linha clicável, hover `--card-2`.

### 3. Detalhe + Roteiro (`trip`) — a tela mais densa

- Botão "← Viagens".
- **Faixa de itens órfãos** (quando aplicável): `.banner` âmbar com símbolo `◐`,
  *"3 itens ficaram fora das novas datas. Nada foi apagado — decide você."* e ações **Mover** /
  **Remover**. Nunca sumir com item calado.
- Cabeçalho: eyebrow com o título da viagem, cidade/UF em Bitter 34px, **datas editáveis**
  (`<input type="date">` em mono), chip de perfil, chip de status; à direita, resumo do dossiê
  (meter md + "6/7 checados") clicável → Dossiê.
- **4 KPIs** em mono (`.kpi-row`): dias · itens de roteiro (+"5 com horário marcado") · prontidão
  (6/7, "1 passo pendente") · orçamento (realizado / estimado).
- **Board de dias** (`.board`, scroll-x): uma `DayColumn` por dia (`--day-col-w`), cabeçalho com dia
  da semana (capitalizado) + data em mono + custo somado do dia em `--yato-deep`; dentro, três faixas
  fixas **manhã · tarde · noite** separadas por `1px dashed var(--line-dash)`; faixa vazia mostra
  `+ adicionar` (borda tracejada, hover acento).
- **Rodapé**: `ComfortMatrix` do trecho (11h, noturno).

### 4. Dossiê de Mobilidade (`mobility`)

`.dos-layout`: `1fr 320px` (uma coluna abaixo de 1180px). Chips no topo alternam entre três estados
demonstráveis: **Tiradentes/MG** (6/7, passo 7 pendente), **Caraíva/BA** (escala pedonal) e
**Ouro Preto/MG** (sem dossiê → estado vazio).

Coluna direita (`gap: 9px`): painel *Estratégia recomendada* (emoji + Bitter 17/600 + leitura
honesta sobre pendências) · painel *Apps sugeridos* (lista de `AppSuggestionCard` filtrada pela UF +
apps nacionais) · painel *Contatos locais* (nome 13/600, telefone em mono `--yato-deep`, nota 11.5px).

### 5. Orçamento (`budget`)

Três números grandes (`.big3`): estimado · realizado · saldo (Bitter 30/700 em mono tabular; saldo em
`--budget-over` se negativo, com sub "estourou — reveja alimentação"). Botão primário
**"Registrar gasto"**.
Card *por categoria* com uma `BudgetBar` por linha (7 categorias na ordem: transporte ida, transporte
volta, hospedagem, alimentação, mobilidade local, passeios, outros).
Tabela mono de gastos: data · categoria · descrição · valor (alinhado à direita) · selo `→ Nami`
(mono 9.5px, borda `--line`, tooltip "lançada nas finanças no ato do registro").

### 6. Checklist (`checklist`)

Cabeçalho com "5 de 9 feitos" e botão secundário **"Regerar do dossiê"**. Card de progresso com barra
8px e leitura ("56% — os itens do dossiê vêm primeiro, porque são os que te deixam na mão").
Três grupos na ordem: **antes de comprar · antes de embarcar · na chegada**. Dentro de cada grupo, os
itens `do dossiê` vêm antes dos `manual`. Cada grupo termina com campo de adição rápida (Enter ou
botão "Adicionar").

---

## Componentes

### `VerdictChip`
Pill: `padding: 3px 9px` (sm) / `5px 11px` (md), `--r-sm`, borda **1.5px** na cor do veredito, fundo
`-tint`, rótulo em fonte de carimbo, símbolo 11px antes do texto. Variante `md`
`transform: rotate(-1.5deg)` (parece estampado). **Sempre** símbolo + rótulo textual.

### `ReadinessMeter` / `ReadinessLine`
7 segmentos `flex: 1`, `gap: 2px`, `border-radius: 1px`; alturas 6px (sm) / 9px (md) / 16px com
`gap: 4px` (lg). Cada segmento pintado com a cor do veredito do seu passo (pendente usa o `-tint`);
`title` = "nome do passo · veredito". `ReadinessLine` adiciona o texto mono "n/7 checados".

### ⭐ `MobilityDossier`
Não existe nada parecido em nenhum outro shell do app.

- **Cabeçalho** (`--card-2`, borda inferior): kicker mono "dossiê de mobilidade" · cidade/UF em
  Bitter 20/700 · "checado em DD/MM/AAAA" em mono à direita · segunda linha com "cidade pequena ·
  7.500 hab", selo `escala pedonal` quando aplicável, e o meter md + "6/7 checados" (190px, à direita).
- **Tarja de desatualizado** (`stale`, >180 dias): faixa âmbar
  *"dossiê com mais de 6 meses — revalidar antes de viajar"*.
- **Linha de passo** (`.dos-row`): grid `20px minmax(0,1fr) 128px 136px`, `gap: 12px`,
  `padding: 13px 18px`, borda inferior `--line-2`, hover `--card-2`.
  1. símbolo do veredito na cor do veredito;
  2. `N · NOME DO PASSO` em Bitter 12.5/600 uppercase `0.06em` (número em `--ink-4`), abaixo a
     **evidência** em 12.5px `--ink-2` (max 62ch). Se `pendente`, mostra a **instrução operacional**
     em itálico com barra esquerda 2px `--verdict-pending`;
  3. carimbo (`VerdictChip md`);
  4. data + fonte em mono 10.5px alinhados à direita — ou botão `[ Checar → ]` que abre o
     `ProtocolWizard` naquele passo.
- **Escala pedonal**: passos 2–5 colapsados sob um resumo (*"Vila sem circulação de veículos… Não é
  ausência de serviço — é ausência de rua."*) com selo `N/A` neutro e botão "ver os 4 passos" que
  expande as linhas com símbolo `—`.
- **Rodapé** (`--card-2`): "estratégia recomendada" (ou **provisória** se houver pendência) + emoji +
  estratégia em Bitter 15.5/600; abaixo, a leitura do Yato. Com passo pendente, o texto diz
  explicitamente *"Falta 1 passo — então isso aqui ainda não é veredito final"* e **nunca** apresenta
  a estratégia como definitiva.
- **Estado vazio**: "51%" em Bitter 26/700 `--yato-deep`, frase
  *"dos municípios brasileiros não têm nenhum ônibus urbano. Apps de corrida chegam a 26%."*,
  copy *"Ainda não checamos nada dessa cidade. Vamos por partes — sete passos, um por vez."* e botão
  **"Iniciar protocolo"**.

**Os 7 passos** (chaves e instruções literais estão em `yato/data.js` → `STEPS`):
1. `porte_cidade` — Porte da cidade (calibra a expectativa estatística)
2. `uber` — lista oficial **e depois** simulação in-app com endereço real
3. `99` — página oficial + simulação in-app
4. `indrive` — buscar a cidade dentro do app
5. `transporte_publico` — Google Maps / Moovit mostram rotas?
6. `hospedagem_transfer` — perguntar à pousada por WhatsApp
7. `deslocamentos` — medir hospedagem → cada ponto do roteiro

**Regras inegociáveis (FR-009/010/011):** nunca mostrar os 7 passos como formulário único; ausência de
dado renderiza `inconclusivo`, jamais `ausente`; nenhum texto pode afirmar "tem Uber aqui" sem o passo
estar `confirmado`.

### `TripCard` (ticket kraft)
`display: grid; grid-template-columns: 1fr 104px`, fundo `--kraft`, texto `--kraft-ink`, `--r-md`.
Serrilhado de ticket via máscara:

```css
--n: 7px;
mask-image: radial-gradient(circle at left,  transparent var(--n), #000 calc(var(--n) + .5px)),
            radial-gradient(circle at right, transparent var(--n), #000 calc(var(--n) + .5px));
mask-size: 100% 30px; mask-repeat: repeat-y;
mask-composite: intersect; -webkit-mask-composite: source-in;
```

Corpo: cidade em Bitter 19/700 (UF com `opacity: .65`), datas em mono 11.5px, chips de perfil/status/
contagem regressiva (fundo `oklch(1 0 0 / .10)`, borda `oklch(1 0 0 / .22)`). Canhoto separado por
`1.5px dashed var(--line-dash)`: **dias** (Bitter 20/700) e **prontidão** (meter em miniatura +
"n/7"). Viagem `cancelada`: `filter: saturate(0.4)` + tarja diagonal `CANCELADA`
(`rotate(-8deg)`, texto em `--verdict-none`, faixa translúcida com borda em cima e embaixo).
Como elemento mascarado não aceita `box-shadow`, o card não tem sombra — a separação vem do kraft.

### `DayColumn` + `ItineraryItem`
Item: ícone circular 26px do modal de deslocamento na borda esquerda (fundo `--card-2`, borda
`--line`), título 13px/500, **horário em mono 11px `--yato-deep` só se existir**, endereço 11.5px
`--ink-3`, custo em mono à direita. Entre itens consecutivos, a **costura**: linha vertical
`1.5px dashed var(--line-dash)` de `top: 33px` a `bottom: -7px`, atrás do ícone (`z-index: 1` no
ícone). Emojis de modal: 🚶 a pé · 🚌 transporte público · 🚗 app · 🚕 táxi · 🛺 mototáxi ·
🚐 transfer · • outro.

### `AppSuggestionCard`
Ticket kraft menor (mesma técnica de máscara, `--n: 5px`, `mask-size: 100% 22px`): nome em Bitter
14/700 + tipo em mono 9.5px uppercase, abrangência declarada 11.5px, e **selo permanente**
`⚑ cobertura declarada — confirmar in-app` (mono 9.5px, `--verdict-unknown`, separado por
`1px dashed`). O selo é obrigatório **inclusive** para Uber e 99 (FR-015).

### `ComfortMatrix`
Régua de 5 degraus (`grid-template-columns: repeat(5,1fr)`): convencional (~45°) → executivo
(130–140°) → semi-leito (135–145°) → leito (150–160°) → leito-cama (180°). Cada degrau: nome em
Bitter 12/700 uppercase, mini-diagrama de poltrona (base 26×4px + encosto 4×22px com
`transform: rotate(Xdeg)`, `transform-origin: bottom left`; ângulos de desenho 12/26/36/52/78deg),
ângulo e nota em mono 10.5px. Abaixo da recomendada: `opacity: .55`; a recomendada ganha borda e
fundo de acento + rótulo "recomendada"; acima, neutras (`opacity: 1`). Balão de justificativa em
fundo `--yato-tint`. Abaixo, **fila de ROI** numerada: transfer privativo → hospedagem melhor
localizada → passeio privativo → executiva doméstica.

### `BudgetBar`
Grid `150px minmax(0,1fr) 142px`. Trilho 10px `--budget-track`, `--r-pill`. Preenchimento na cor da
faixa (ok/warn/over). Quando `actual > estimated`, um segundo bloco começa em `left: 100%` com
largura `min(14%, excedente)` e hachura `repeating-linear-gradient(45deg, oklch(1 0 0 / .32) 0 3px,
transparent 3px 6px)` — a barra **ultrapassa visivelmente** o trilho. Valores em mono
`R$ 385 / R$ 300`, em `--budget-over` quando estourado.

### `ChecklistRow`
Checkbox quadrado 18px estilo carimbo: marcado = borda `--verdict-ok`, fundo `-tint` e glifo `✕` em
Bitter 700 (tinta, não ✓ genérico). Label 13px (riscado e `--ink-3` quando feito). Chip de origem à
direita: `do dossiê` (borda/texto de acento, tooltip com o passo que o gerou) ou `manual` (neutro).

### `Icon`
SVG inline, `viewBox 0 0 24 24`, `stroke: currentColor`, `stroke-width: 1.6`, `fill: none`, linecap/
linejoin round. Set em uso: inicio, mochila, mapa, rota, carimbo, moeda, cifrao, lista, onibus,
relogio, calendar, check, chevR, chevL, search, gear, plus, x, alerta, pedestre, arrowL.

### `Toast`
Pill fixo (`right: 20px; bottom: 56px`), `padding: 10px 16px`, `--r-pill`, fundo
`linear-gradient(100deg, var(--yato), var(--yato-deep))`, 12.5px/600, entrada `opacity+translateY(6px)`
em 0.2s, auto-dismiss em **2.8s**.

---

## Modais

Shell comum (`.ovl` + `.modal`): overlay `oklch(0.10 0.014 250 / 0.66)` com `blur(3px)`, painel
`max-width: 520px` (`.wide` = 620px), `max-height: 88vh`, `--r-lg`, `--shadow-lg`; cabeçalho com
ícone de acento + título Bitter 17/700 + `✕`; corpo `gap: 14px`; rodapé com nota em 11.5px `--ink-3` e
ação primária à direita. Fecha com **Esc** e por clique no overlay.

### `NewTripModal`
Cidade (texto) + **UF (`<select>` obrigatório**, evita cidades homônimas) · ida/volta (`date`) ·
perfil (3 botões segmentados) · título opcional.
Validação visível: `volta ≥ ida` ("A volta não pode ser antes da ida.") e intervalo ≤ 60 dias
("Intervalo maior que 60 dias — quebre em duas viagens."). Se a cidade+UF já tem dossiê, banner
**positivo** verde: *"Já temos dossiê de Tiradentes/MG, checado em 15/08/2026. Sai na frente."*
Nota do rodapé: *"UF é obrigatória — tem muita cidade com o mesmo nome nesse país."*

### `NewItemModal`
Dia (`<select>` com os dias da viagem, formato `DD/MM · segunda`) · horário **opcional** ·
período (3 botões) · título · endereço · modal de deslocamento (ícones circulares selecionáveis) ·
custo estimado. `⌘/Ctrl+Enter` salva. Nota: *"Sem horário confirmado, deixa em branco — não invento
hora."*

### `LogExpenseModal`
Categoria (as 7) · valor · descrição · data. Aviso **permanente** no rodapé:
*"Lança nas finanças no ato — uma despesa por gasto. Se falhar, nada é salvo dos dois lados."*
(FR-021: falha de lançamento não salva nada em nenhum dos dois lados.)

### ⭐ `ProtocolWizard`
Modal `wide`, **um passo por vez, nunca os 7 de uma vez**. Conteúdo: "passo N de 7" em mono de acento ·
nome do passo em Bitter 20/700 · veredito já registrado (chip + "já registrado em DD/MM") quando
houver · **instrução operacional literal** em bloco kraft com rótulo "o que fazer, literalmente" ·
textarea de evidência ("O que você viu, com número e endereço quando der.") · `<select>` de fonte
(simulação in-app · página oficial · Google Maps · Moovit · contato com hospedagem · relato local ·
outro) · três botões de veredito **com o mesmo peso visual** (`grid-template-columns: repeat(3,1fr)`,
borda 1.5px + fundo tint da própria cor, símbolo acima do rótulo): **Confirmado · Ausente ·
Inconclusivo**. Rodapé: "passo N de 7", botão **"Pular por ora"** e navegação ‹ ›.
Nota fixa: *"Registrar dúvida é resultado, não desistência. Inconclusivo vale tanto quanto os outros
dois."* Salvar avança para o passo seguinte; fechar no meio mantém o dossiê parcial e retomável.

---

## Interactions & Behavior

- **Navegação**: sidebar e links de painel trocam a rota interna; o scroll do conteúdo volta ao topo
  em cada navegação. Clicar em `TripCard`/linha da tabela define a **viagem ativa** e abre o Roteiro.
  O `<select>` da topbar troca a viagem ativa sem navegar. O pill de protocolo e todos os meters
  levam ao Dossiê.
- **Busca** (topbar): digitar com outra tela aberta navega automaticamente para Viagens e filtra por
  cidade/UF/título; a query é limpa ao sair de Viagens.
- **Wizard**: `[ Checar → ]` abre no passo correspondente; salvar grava
  `{verdict, source, evidence, checked_at}` e avança; "Pular por ora" mantém `pendente` e mostra toast
  *"Pulado — fica pendente, não fica errado."*
- **Datas editáveis** no Roteiro: alterar ida/volta recalcula os dias; se `end < start`, `end` é
  puxado para `start`. Itens fora do novo intervalo viram **órfãos** → faixa âmbar com **mover** (vão
  para o último dia) ou **remover**. Nunca apagar em silêncio (FR-005).
- **Checklist**: toggle otimista; adição rápida por Enter ou botão. **"Regerar do dossiê"** cria itens
  para passos `pendente` ("Checar passo N · nome") e `inconclusivo` ("Refazer a checagem de … (ficou
  inconclusivo)"), **sem duplicar** (dedupe por label) e **sem apagar** os manuais; toast informa
  quantos entraram ou "Nada novo — o dossiê já está refletido aqui."
- **Gasto**: registrar soma no `actual` da categoria, insere no topo da tabela e mostra toast
  *"Gasto registrado e espelhado nas finanças."*
- **Transições**: hovers em 0.12–0.15s (background/border/color); toast 0.2s; nenhuma animação
  decorativa. Ticket kraft muda para `--kraft-2` no hover.
- **Responsivo**: <1180px o dossiê vira coluna única · <1040px a topbar esconde o título e a footbar
  o resumo · <1000px a coluna do hero encolhe · <900px a sidebar colapsa para **64px** (só ícones,
  sem labels/contadores/frase) e os grids de 3–4 colunas viram 2 · <720px hero em 1 coluna sem
  retrato, board de dias vira coluna única, linhas do dossiê passam a 2 colunas (carimbo e fonte
  descem para a segunda coluna, alinhados à esquerda).
- **Acessibilidade**: veredito sempre símbolo + rótulo (daltonismo); `title` nos segmentos do meter,
  no chip de origem do checklist e no selo `→ Nami`; foco visível em busca e inputs (borda de acento +
  ring de tint).

## State Management

Estado local do shell no protótipo (no port, o que for servidor vira query/mutation):

| Estado | Tipo | Origem/uso |
|---|---|---|
| `route` | `{view, param}` | roteador interno; no port, `/travel/*` |
| `activeId` | `string` | viagem ativa (sidebar, topbar, orçamento, checklist) |
| `query` | `string` | busca da topbar |
| `orphans` | `number` | itens fora do intervalo após mudança de datas |
| `toast` | `string` | mensagem transitória (2.8s) |
| `newTrip` / `newItem` / `logExp` / `wizard` | `bool` / `{day,period}` / `bool` / `{key}` | modais |
| tweaks | `{tema, acento, densidade, textura, ordenacao}` | `localStorage` `yato-tweaks` → `data-*` no shell |

**Tweaks** (client-only, guia §8): `tema` Escuro/Claro → `data-theme='light'` · `acento`
Azul-cachecol/Ouro/Carmim/Musgo → `data-accent` (sem valor no default) · `densidade`
Grande/Médio/Compacto → `data-density='large|medium|compact'` · `textura` on/off → esconde
`.yato-tex` · `ordenacao` → prop `sort` da tela Viagens.

### Endpoints (guia §9)

| Tela | Endpoints |
|---|---|
| Início | `GET /trips?status=confirmada,em_curso&limit=1` + `/trips/{id}/readiness` + `/trips/{id}/budget` + `/trips/{id}/checklist?done=false&limit=5` |
| Viagens | `GET /trips` (`status`, `sort`, `limit`) |
| Detalhe | `GET /trips/{id}` + `/trips/{id}/itinerary` |
| Dossiê | `GET /dossiers/{uf}/{city}` + `/apps?uf={uf}` + `/dossiers/{uf}/{city}/strategy` |
| Orçamento | `GET /trips/{id}/budget` + `/trips/{id}/expenses` |
| Checklist | `GET /trips/{id}/checklist` |
| Mutações | `POST /trips` · `PATCH /trips/{id}` · `POST /trips/{id}/itinerary` · `PATCH`/`DELETE /itinerary/{item_id}` · `PUT /dossiers/{uf}/{city}/checks/{check_key}` · `POST /trips/{id}/expenses` · `PUT /trips/{id}/budget` · `POST /trips/{id}/checklist` · `PATCH /checklist/{item_id}` · `POST /trips/{id}/checklist/regenerate` |
| Conforto | `GET /comfort?hours={h}&night={bool}&profile={p}` |

Todas sob `/api/travel/*`, com `require_user`. Tipos (`Verdict`, `CheckKey`, `Trip`,
`ItineraryItem`, `MobilityCheck`, `MobilityDossier`, `BudgetItem`) estão no guia §9 e espelhados nos
mocks de `yato/data.js`.

## Assets

- `yato/yato.png` — retrato do Yato (PNG 500×500 com fundo removido), **enviado pelo usuário**. Usado
  no hero (retrato grande) e no avatar da sidebar. Não é gerado; deve ser copiado para os assets do
  app.
- Fontes: Bitter, Inter, JetBrains Mono (Google Fonts).
- Emojis usados com parcimônia: 🎒 (assinatura), 🚌 🛺 🚶 🚗 🚕 🚐 (modais de deslocamento),
  ⚑ (selo de cobertura declarada).
- Ícones: SVG inline no próprio código (nenhuma dependência de icon set).
- Entradas a acrescentar no app: `Layout.tsx` → item `Yato / Viagens / /travel` com
  `color: var(--c-yato)`; `index.css` → `--c-yato: #4a6fa5` e `--c-yato-dim: #17202f`.

## Copy & voz

Yato falando: direta, orgulhosa, obcecada por economia ("cinco ienes!"), com humor, mas
**rigorosamente honesta sobre o que não sabe**. Textos que devem ser preservados literalmente:
a frase da sidebar, o estado vazio de viagens, o estado vazio do dossiê, o selo dos apps, o aviso do
`LogExpenseModal` e a nota do wizard sobre o inconclusivo.

## Files

Neste bundle:

| Arquivo | Conteúdo |
|---|---|
| `Yato - Viagens.html` | entrada: fontes, React 18 + Babel, ordem de carregamento dos scripts |
| `yato/styles.css` | todos os tokens em `.yato-shell`, tema claro, 4 acentos, 3 densidades, shell, hero, dossiê, board, orçamento, checklist, modais, responsivo |
| `yato/data.js` | mocks (TRIPS, ITINERARY, STEPS, DOSSIERS, APPS, CONTACTS, BUDGET, EXPENSES, CHECKLIST, COMFORT) e helpers de data/dinheiro |
| `yato/ui.jsx` | Icon, VERDICT, VerdictChip, ReadinessMeter/Line, TripCard, AppSuggestionCard, BudgetBar, ChecklistRow, ComfortMatrix, Toast |
| `yato/dossier.jsx` | ⭐ MobilityDossier + DossierRow |
| `yato/screens-a.jsx` | Home, Trips, TripDetail, DayColumn |
| `yato/screens-b.jsx` | Mobility, Budget, Checklist |
| `yato/modals.jsx` | Modal, NewTripModal, NewItemModal, LogExpenseModal, ProtocolWizard |
| `yato/app.jsx` | shell: sidebar, topbar, footbar, rotas, mutações, tweaks |
| `yato/yato.png` | retrato do Yato |
| `tweaks-panel.jsx` | painel de preferências usado pelo protótipo (descartável no port — usar o `TweaksPanel.tsx` do app) |
| `design-guide.md` | brief original (fonte de verdade de regras e contratos) |

Notas de implementação do protótipo que **não** devem ser portadas: `Object.assign(window, {...})` no
fim de cada arquivo JSX (necessário porque cada script Babel tem escopo próprio), mutação direta dos
arrays de mock + `bump()` para re-render, e a data fixa `TODAY = '2026-08-20'` (no app, usar
`todayLocalISO()`).
