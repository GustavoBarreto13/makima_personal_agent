# Design Guide — Calendar Hub (fatia 019)

**Fonte de fidelidade (alta)**: `design_handoff_kaguya_calendario/` (README + `cal.jsx`,
`cal-engine.jsx`, `cal-views.jsx`, `cal-data.js`, `cal.css`). Recriar no shell `pages/kaguya/`
(substituindo a `CalendarScreen` simples da 013), reusando tokens `--kg*`/`--p-*`/`--ink-*`/sombras de
`.kg-app`. Não copiar o JSX — recriar com os componentes/design system do repo. Cores em **OKLCH**.

---

## Layout raiz (`.calx`)
Coluna vertical: **barra de navegação** (topo, sticky) + **corpo** (grid + coluna de calendários). A
coluna de calendários fica **à direita** em `agora`/`editorial` e **à esquerda** em `helvetico`
(`data-col`). Geometria: `--hh` 52/54/60px por variante, `--gutter: 58px`, `--col-w: 264px`.

## 1. Barra de navegação (`.cal-bar`)
Mês + ano (display 22px/800, capitalize; serif 27px em `editorial`) · rótulo "SEMANA N" (mono 11px
uppercase; ISO pelo **meio da semana**/quinta) · setas ‹ › (30×30) · botão **Hoje** · spacer ·
**segmented Dia/Semana/Mês** (ativo: fundo `--card`, cor `--kg-deep`, `--shadow-sm`).

## 2. Semana / Dia — `TimeGrid` (`cal-engine.jsx`)
- **Cabeçalho de dias** (`.cal-dayhead`, sticky): sigla (mono 10px) + número (display 19px, círculo
  30px). **Hoje**: número com fundo `--kg` e texto branco; sigla `--kg-deep`. Canto: fuso "BRT".
- **Faixa all-day** (`.cal-allday`, sticky): rótulo "todo dia" + pills por dia (`.cad-pill`, fundo
  `color-mix(--cc 20%, --card)`), rola se passar de `max-height 116px`.
- **Grid de 24h** (`.cal-grid` em `.cal-scroll`): altura `24*--hh`; gutter com rótulos mono; linhas de
  hora por `repeating-linear-gradient`. **Hoje**: leve tinta `--kg 4%`. Scroll inicial ~07:00.
- **Linha do agora** (`.cg-now`): topo 2px `--p-high` + bolinha, só na coluna de hoje, em
  `top:(nowMin/1440)*100%`; rótulo de hora atual em vermelho no gutter.
- **Evento timed** (`.cg-event`): `top=(startMin/1440)*100%`, `height=(durMin/1440)*100%-2px`;
  largura/posição por **algoritmo de pistas** para sobreposição. Título (≤2 linhas) + faixa de horário
  (mono 9px) + local. ≤30min → layout `tiny`. **Tarefa** (`kind:'task'`) → **borda tracejada**. Alça
  de resize no rodapé (`.cg-resize`).

## 3. Mês — `MonthGrid`
Linha de nomes de dia (mono, à direita) + 6 semanas × 7 colunas preenchendo a altura. Célula
(`.cmo-cell`): número (círculo 22px; hoje com `--kg`); dias fora do mês (`.dim`) com `--card-2`; nome
do mês abreviado quando muda. **Pills** (`.cmo-pill`): timed = bolinha + hora + título; all-day =
`.filled`; limite **4/célula + "+N mais"**.

## 4. Coluna de calendários (`CalendarsAside` / `.cal-aside`, 264px)
- **Mini-mês** (`.mini`): título + ‹ › próprios; grade 7×6; hoje em `--kg-deep`; dia selecionado fundo
  `--kg`; **semana atual realçada** com faixa `--kg-tint`. Clicar navega o principal.
- **Busca** (`.cal-srch`): "Encontrar com…" (decorativo nesta fatia).
- **Grupos por conta** (`CAL_ACCOUNTS`): "Makima · suíte · bases do app" e "gustavo@gmail.com · Google
  Agenda". Cada calendário (`.cal-item`): **checkbox colorido** (`.ci-box` 17×17, preenchido `--cc`
  quando visível) · nome (tag "padrão" no primário) · **balde** (recolorir → paleta inline
  `.cal-colors`, swatches de `CAL_SWATCHES`) · **olho** (mostrar/ocultar, no hover).
- **"Adicionar conta de calendário"** (`.cal-addacct`, tracejado).
- **Bandeja "Sem horário"** (`.cal-tray`): tarefas da semana sem hora; cada card **arrastável** para o
  grid (time-blocking).

## 5. Interações (pointer events, snap 15min)
Compensação de escala: ler `rect.height/offsetHeight` da coluna.
- **Mover**: pointerdown no corpo → arrasta (coluna = dia, Y = hora, preserva offset); fantasma ao
  vivo; commit no pointerup. Clique sem arrastar = popover.
- **Redimensionar**: pointerdown na alça (`.cg-resize`) → ajusta só o fim (mín 15min).
- **Criar arrastando**: em área vazia → define início/fim (mín 30min) → cria + abre popover; fantasma
  `.cg-ghost` tracejado.
- **Time-blocking**: drag (HTML5) de um card da bandeja → soltar numa coluna cria bloco da base Kaguya
  com a duração estimada no horário do drop.
- **Popover** (`EventPopover`): título, horário/local, calendário de origem, **cor** (paleta + "voltar
  à cor do calendário"), **excluir**. Posicionado ao lado, clamp à viewport.
- **Menu de contexto** (clique-direito, `ContextMenu`): swatches, **duplicar**, "cor do calendário",
  **excluir**.
- **Editabilidade por fonte** (crítico — ver spec): mover/resize/criar/excluir só em **Kaguya**
  (tarefas → endpoints de tarefa) e **Agenda pessoal** (Google → `/calendar/events`). Bases
  cross-agent e integrações são **read-only**: clique **deep-linka** ao domínio (cross-agent) ou abre
  info (integração); sem alça de resize, sem drag.
- **Dica flutuante** (`.cal-hint`): "Arraste no grid para criar · arraste eventos para mover" por ~4,2s.

### Animações
Popover/menu `cpop-in` (140–120ms, `cubic-bezier(.2,.8,.3,1)`): opacity + translateY(-6px) + scale(.98).
Hover de evento `box-shadow .12s`; grip de resize `opacity .12s`.

## 6. Variantes (`data-variant`) + tema
- **`agora`** (Notion, padrão): evento = bloco tonal `color-mix(--cc 22%, --card)` + barra 3px à
  esquerda + texto na cor; coluna à direita; denso.
- **`helvetico`** (Google): evento = bloco **sólido** `--cc`, texto branco, sem barra; coluna à
  esquerda.
- **`editorial`** (Kaguya): evento = **cartão** `--card` com borda-esquerda 4px de cor, texto `--ink`;
  mês em serif; `--hh` maior.
- **Tema** claro/escuro via `data-theme` (escuro suaviza superfícies e dá mais corpo aos eventos).
  Variante + tema vivem no **TweaksPanel** do shell.

## 7. Cores dos calendários
Ver tabela em [`data-model.md`](data-model.md) §3 (Kaguya azul, Nami laranja, Frieren teal, Akane
carmim, Violet violeta, Animes rosa, Futebol verde, Feriados dourado, Google índigo). Recolorir via
`CAL_SWATCHES` (essas 9 + cinza) — afeta toda a base; cor por evento sobrescreve só aquele (eventos
editáveis).

## 8. Client (`kaguyaApi.ts`) e tipos
Novos métodos: `calendarSources()`, `calendarAggregate(start,end,sources)`, `calendarPrefs()`/
`setCalendarPref()`, `calendarCalendars()`, `calendarEvents(start,end)`, `createEvent/updateEvent/
deleteEvent`. Tipos em `types.ts`: `CalAccount`, `Calendar`, `CalEvent` (shape unificado), `CalendarItem`,
`CalendarPref`. Ícones: mapear `chevL/chevR/search/check/plus/clock/trash/copy/loop/home/eye/eyeOff/
paint/link` para o icon set do repo.

## 9. Ressalvas
- `TODAY`/`NOW` derivam de `new Date()` (o protótipo fixa `2026-06-11 11:25`).
- A busca lateral é decorativa nesta fatia (implementar depois).
- "Adicionar conta de calendário" no protótipo cria calendário local; em produção, ligar uma nova
  conta Google é fora do escopo (uma conta) — pode virar "nova integração" no futuro.
