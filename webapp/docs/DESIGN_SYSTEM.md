# Design System Makima

> **Referência viva.** Mantida junto com o código em `webapp/frontend/src/design/`.
> Veja o padrão funcionando em **`/design`** (agente fictício "Hayate", treinos) — todos os
> componentes, estados, temas, estilo de arte e celular.
> Status de adoção por página: [`DESIGN_CONFORMANCE.md`](DESIGN_CONFORMANCE.md) (gerado).

## Por quê

Cada um dos 10 shells nasceu com CSS próprio: 7 fontes de título, 8 escalas de raio, 3 esquemas de
tokens, Toast/Tweaks/Modal/Ícones copiados, menu lateral e botão "Voltar à Makima" diferentes,
stats com números errados. O padrão acaba com isso: **uma estrutura, um vocabulário, um conjunto
de componentes**. Cada agente mantém só a **cor de identidade** e o **retrato** (e, se o usuário
quiser, um estilo de arte — que muda o visual, nunca a estrutura).

Origem do visual: Kanban "Vidro" e Calendar Hub da Kaguya, hero da Marin, mapa de calor da
Frieren, estrelas da Akane, captura rápida da Kaguya.

## Princípios

1. **Uma ação primária por contexto.** Ação destrutiva nunca é primária.
2. **Vidro só sobre o fundo ambiente.** Níveis: ambiente → vidro (painéis) → sólido (formulários,
   listas densas, tudo que fica sobre o vidro). Nunca vidro sobre vidro.
3. **Cor de agente é identidade; cor semântica é significado.** Sucesso/alerta/perigo/info não
   mudam com o agente. Cor nunca é o único sinal (status e prioridade têm texto/ícone).
4. **Toda tela trata 4 estados:** carregando (skeleton), vazio (convida à ação), erro (tentar de
   novo) e com dados.
5. **Toda ação com atalho também existe como botão ou comando.** Teclado acelera, nunca é o único
   caminho (no celular não há teclado).
6. **O estilo de arte muda o visual, nunca a estrutura.**
7. **Construído para virar app:** lógica separada da aparência (ver "Portabilidade").

## Estrutura de pastas

```
webapp/frontend/src/design/
├── tokens.json         # FONTE ÚNICA dos tokens (cor por tema, raio, espaço, texto, movimento, z, ...)
├── agents.json         # FONTE ÚNICA dos agentes (cor, rota, retrato, status, estilo de arte)
├── conformance.json    # manifesto de adoção por página (lido pelo audit:design)
├── tokens.css          # GERADO de tokens.json (npm run tokens) — não editar
├── accents.css         # GERADO de agents.json — [data-agent="nami"] { --ds-accent-h … }
├── base.css            # reset ESCOPADO ao .ds-frame, foco visível, .ds-kbd, .ds-sr-only
├── motion.css          # catálogo FECHADO de animações + prefers-reduced-motion
├── art/                # estilos de arte (só custom properties --ds-*): caderno.css
├── core/               # TypeScript PURO (sem React/DOM) — reaproveitável num app nativo
├── headless/           # hooks React sem estilo (web e React Native)
├── ui/                 # componentes web (.ds-*), components.css, extras.css
└── index.ts            # ponto de entrada: import { Button, useCollection, … } from '…/design'
```

**Regra de dependência: `ui → headless → core`**, nunca o contrário. O `core/` não importa
`react`, `window`, `document`, `localStorage` nem `navigator` — armazenamento, relógio e rede entram
por interfaces injetadas (`core/ports.ts`: `Storage`, `Clock`, `Http`, `OfflineQueue`). O `ui/` e o
`headless/` nunca chamam a rede nem importam `*Api` de domínio: a **tela** liga o design à API.

## Tokens (`tokens.json` → `tokens.css`)

Todo token é `--ds-*`; toda classe é `.ds-*` (não colide com os shells legados). Edite o JSON e
rode **`npm run tokens`**. Valores principais:

| Grupo | Tokens |
|---|---|
| Superfícies | `--ds-paper`, `-paper-2`, `-card`, `-card-2`, `-mist` |
| Tinta e linha | `--ds-ink-1` … `-ink-4`, `--ds-line`, `--ds-line-2` |
| Acento (do agente) | `--ds-accent`, `-accent-deep`, `-accent-bright`, `-accent-tint`, `-accent-tint-2`, `--ds-on-accent` |
| Semânticas | `--ds-danger/warn/info/success` (+ `-tint`), `--ds-on-danger`, `--ds-white` |
| Estrelas | `--ds-star`, `--ds-star-deep`, `--ds-star-empty` (dourado **fixo**, independente do agente) |
| Raios | `--ds-r-xs` 7 · `-sm` 10 · `-md` 14 · `-lg` 20 · `-pill` 999 |
| Vidro | `--ds-glass-bg/border/hi/shadow`, `--ds-blur` 18px, `--ds-blur-soft` 10px |
| Fundo | `--ds-ambient` (dois blobs + degradê), `--ds-texture` |
| Espaço | `--ds-space-1…8` (4/8/12/16/22/32/48) |
| Texto | `--ds-text-xs…2xl`, `--ds-text-display` (clamp 30–44) |
| Movimento | `--ds-dur-1…4` (120/180/260/400 ms), `--ds-ease`, `--ds-ease-in`, `--ds-ease-spring` |
| Camadas | `--ds-z-sticky 10 · topbar 20 · drawer 40 · modal 50 · popover 70 · toast 90 · palette 100` |
| Larguras | `--ds-w-prose 680 · content 1120 · wide 1440` |
| Gráficos | `--ds-chart-1…8` (categórica), `--ds-chart-positive/negative` |

Fontes: **Hanken Grotesk 800** (títulos e números, tracking negativo), **DM Sans** (corpo),
**DM Mono** (rótulos, caixa alta). `font-variant-numeric: tabular-nums` em todo número de dado.

**Acento.** O matiz/croma vêm de `agents.json`; o L muda por tema (claro 0.52, escuro 0.72). Os
tokens derivados são declarados em `:root, [data-agent]` para recalcular com o agente.
Uso: `<AgentScope agent="nami">` ou `data-agent="nami"` (o `AppShell` já faz).

**Tema global.** `claro / escuro / sistema` em `localStorage['makima-theme']`, aplicado como
`data-ds-theme` no `<html>` (script inline no `index.html` evita o flash). Hook: `useTheme()`.
**Nenhum shell legado muda** até ser migrado: cada um segue com o próprio `data-theme`.

## Esqueleto de página — `AppShell`

Anatomia **fixa** em todos os agentes:

- **Sidebar (248px):** marca (retrato + nome + subtítulo mono) → **um** CTA primário (com `<kbd>`)
  → navegação em grupos (item ativo = acento suave) → rodapé:
  - **`BackToMakima`** (cartão com retrato da Makima, vai a `/` sem recarregar) +
    **`AgentSwitcher`** (botão ao lado; lista todos os agentes de `agents.json`, marca o atual
    "Aqui", "Em breve" desabilitados; ↑/↓, Esc devolve o foco ao botão);
  - tema (claro/escuro) e preferências.
- **Topbar (vidro leve):** título + subtítulo mono · busca · `Ctrl+K` · "+" contextual.
- **< 900px:** sidebar vira rail de 64px. **< 640px:** gaveta (☰) + barra inferior (3 seções +
  "Mais") + botão flutuante (ação primária). A nav nunca desaparece.
- Layout por **container query** (`ds-frame`): funciona dentro da moldura de celular de `/design`.
- Atalhos (padrão **Windows**; `Ctrl` vira `⌘` só em macOS, via `formatShortcut`): `Ctrl+K`
  paleta · `Ctrl+Enter` salva o formulário · `Ctrl+Z` desfaz · `N` ação primária · `/` busca ·
  `g h/t/e` navegar · `?` preferências · `Esc` fecha. Catálogo em `core/hotkeys.ts`.

Também no esqueleto: **`Hero`** (padrão da Marin: gradiente do tom + véu + pontinhos + retrato com
halo; toda tela "Início" abre com ele, mostrando o contexto mais relevante do agente),
**`PreferencesPanel`** (Aparência · seção do agente · Atalhos — substitui os 9 TweaksPanel),
**`CommandPalette`** (provedores por agente: `useCommandProvider({ commands, search })`).

## Componentes

| Camada | O quê |
|---|---|
| Primitivos | `Button`, `IconButton`, `Chip`, `SegmentedControl`, `StatusChip`, `Tag`, `ProgressBar`, `ProgressRing`, `Avatar`, `Toggle`, `SettingRow`, `Kbd` |
| Avaliação | `Stars` (exibição) e `RateInput` (edição) — **0 a 5, com meia estrela**; `snapHalf` é a única fonte do arredondamento; escalas de origem (MAL 1–10) convertem nas bordas com `toFiveScale/fromFiveScale` |
| Formulário | `Field`, `Input`, `Textarea`, `Select`, `NumberInput`, `MoneyInput`, `TagInput`, `DatePicker` + `MiniCalendar`, `TimePicker`, `PersonPicker` (smart-match da Komi: 0 → cadastrar, 1 → confirmar, 2+ → escolher) |
| Camadas | `Modal` (vira bottom sheet no celular; `dirty` pede confirmação), `Sheet`, `Menu`, `ConfirmHost` + `confirm()` (substitui `window.confirm`; perigo foca "Cancelar") |
| Feedback | `ToastHost` + `toast()` (com **Desfazer**), `Skeleton`, `LoadingState`, `EmptyState`, `ErrorState` |
| Itens | `Img`, `MediaCard`, `ListRow`, `InfoRow`, `Timeline`, `Tabs`, `DetailPage`, `DataTable` (vira cartões no celular) |
| Coleção | `CollectionToolbar`, `CollectionMeta`, `CollectionBody`, `FilterSheet` |
| Stats | `StatsPage`, `KpiGrid`, `DeltaBadge`, `CountUp`, `Heatmap`, `BarSeries`, `Distribution`, `RankList`, `RecordList`, `YearNav` |
| Captura | `QuickCapture` |

Nunca usar `<input type="date|time">`, `alert/confirm/prompt`, emoji como ícone de UI,
`new Date('YYYY-MM-DD')` (UTC) nem `toISOString().slice(0,10)`. O `lint:design` barra tudo isso.

### Ícones — um vocabulário só

`ui/icons.ts` é o registro semântico `nome → componente Lucide` (`lucide-react`, tree-shaken):
o mesmo conceito tem o **mesmo ícone** em qualquer página (`goal`, `habit`, `book`, `trip`…).
`<Icon name size label>` aplica traço (`--ds-icon-stroke` 1.75), cantos e cor (`currentColor`).
Ícone novo? adicione no registro. **Emoji só como conteúdo do usuário** (ex.: ícone escolhido de
uma lista), nunca em navegação, botões ou títulos.

### Coleções: filtros, agrupar e ordenar (modelo da lista da Kaguya)

Toda tela com lista/grade de itens usa o motor `core/collection` via `useCollection`. O domínio só
descreve o **esquema** (`defineCollection`): `search`, `facets` (enum, tags com "tem/não tem",
range de nota, janela de datas, flag, pessoas), `groups` e `sorts`. Mínimo obrigatório: busca +
uma faceta de status/tipo + uma data + ordenação por 2 campos. Estado persistido em
`ds:collection:<scope>` (a busca não é persistida); filtros/ordenação podem ir para a URL
(`syncUrl`) — compartilhável e, no app, deep link. Exemplo completo: `pages/design/demoData.ts`.

### Captura rápida (modelo do quick-add da Kaguya)

`core/capture` é um parser pt-BR plugável; **datas e recorrência reaproveitam o `parseDate`/
`parseRecur` da Kaguya** (paridade coberta por teste). Sintaxe compartilhada:

| Token | Significado |
|---|---|
| `@nome` | contêiner (lista, estante, viagem, conta, local) |
| `+nome` | pessoa (vínculo Komi) |
| `#tag` | etiquetas |
| `!alta/!média/!baixa` | prioridade |
| `hoje`, `amanhã`, `sexta`, `12/09`, `17h` | data e hora |
| `todo dia 5`, `toda sexta`, `a cada 2 dias` | recorrência |
| `★4.5`, `*4.5`, `4.5/5` | nota (com a regra de nota ligada, `N/5` é nota, não data) |
| `R$ 42,90`, `42,90` | valor |
| `45`, `1.299,90` (regra `bareAmount`) | valor como número solto — vale o **último** que sobrar depois de data e parcelas; `R$` explícito tem prioridade |
| `+3500` (regra `income`) | entrada com valor (`income: true`); `+` seguido de número deixa de ser pessoa. Sem a regra, `+Ana`/`+3500` seguem sendo pessoa |
| `10x`, `em 10x` (regra `installments`) | nº de parcelas (2–60). O valor digitado é o **total**; o chip mostra "10x · R$ 120,00 cada". `4x8` continua sendo série (`sets`) |
| `ep 3-5`, `p. 240` | progresso |
| `4x8`, `80kg`, `6km`, `45min` | séries×repetições, carga, distância, duração |

Cada domínio liga as regras que valem (`createCaptureParser({ rules, dateDirection })`); registros
(treino, leitura) usam `dateDirection: 'past'` ("sexta" = a mais recente; habilita "ontem").
`QuickCapture`: destaque ao vivo, chips removíveis, Enter salva (toast com Desfazer),
Shift+Enter abre o formulário completo já preenchido.

### Estatísticas / Rewind (modelo da Frieren, ampliado)

**Uma tela só** (`StatsPage`) cobre "Stats" e "Rewind", com seletor de período que **muda a query
no backend**. Ordem fixa: período → hero de retrospectiva → KPIs com **delta** vs. o mesmo período
do ano anterior → **mapa de calor por mês** (um bloco por mês, 7 linhas dom–sáb, dia 1 alinhado,
12 meses sempre, legenda "menos … mais") → ritmo mensal + distribuição de notas (0.5–5, sem perder
valores) → rankings → recordes e sequências → momentos.

Contrato: `GET /api/<domínio>/stats?year=&month=` → `StatsPayload` (`core/stats.ts`). Regras de
correção (causa dos bugs antigos): datas sempre em `America/Sao_Paulo` (nunca `CURRENT_DATE`,
`date.today()` nem `AT TIME ZONE 'UTC'`); itens apagados fora da conta; métrica "do ano" filtra
pelo ano; sequências em **dias corridos** (a atual vale até ontem); percentuais formatados num
lugar só (`fmtPercent` recebe a **fração**); contagens de itens **distintos**, não sessões.

**Métricas mínimas por domínio** (toda feature nova declara o que acrescenta à `StatsPage`):

| Agente | Métricas |
|---|---|
| Frieren | livros iniciados/terminados/abandonados, páginas, páginas/dia, dias lendo, dias por livro, mais longo, meta anual |
| Akane | filmes distintos, sessões, revistos, horas, décadas, país/idioma, cinema vs casa, watchlist adicionados vs vistos |
| Marin | episódios reais, completos no ano, dropados, temporada de lançamento, estúdios, notas |
| Mai | séries terminadas e dropadas, episódios, maior maratona, redes por episódios |
| Violet | dias, palavras, sequências, horários (fuso local), emoções/intensidade, pessoas/tags top, taxa real de destaque |
| Kaguya | concluídas por semana, no prazo vs atrasadas, por lista/tag, % de hábitos, metas/experimentos, foco |
| Nami | retrospectiva anual: receita/despesa por mês, taxa de poupança, top categorias, patrimônio real |
| Komi | interações por mês, pessoas sem contato há N dias, aniversários, menções cruzadas |
| Yato | viagens, dias viajando, países/cidades, gasto por dia vs orçamento, categorias |

Fonte: `STATS_REQUIRED` em `conformance.json`; uma página "conformant" precisa declarar todas.

#### Débitos conhecidos nas telas de stats atuais (não corrigidos; resolver ao migrar cada tela)

Encontrados na auditoria que originou o padrão:

- **Violet** `Insights.tsx:337`: percentual de destaque multiplicado por 100 duas vezes
  (40% aparece como 4000%); `agents/journal/tools.py:658` horários em UTC (barras 3h erradas) e
  `CURRENT_DATE`/`date.today()` em `:638,:680,:733,:1016`; sequência atual zera se hoje ainda não
  tem entrada (`Insights.tsx:76-86`).
- **Frieren**: "maior sequência" e janelas de 7/14/30 dias contam *dias com leitura*, não dias
  corridos (`Stats.tsx:98-110`, `Home.tsx:127-162`); `abandonado` é mapeado como `read`
  (`FrierenShell.tsx:52`); o histograma de notas perde notas < 3 e as que não são meio-ponto
  (`Stats.tsx:128`); `GET /books/stats` existe e ninguém usa (`books.py:382`).
- **Marin**: "Episódios por mês" conta *sessões* (`tools.py:1728`); "Completos" e `by_status` são
  all-time num tile anual (`:1745`, `:1832`); heatmap parseia `"YYYY-MM-DD"` como UTC → mês errado e
  key duplicada "Dez" (`components/Heatmap.tsx:68`); Stats e Rewind duplicados.
- **Mai**: `date.today()` (`tools.py:776,893`); séries apagadas entram na conta (`:779-886`);
  sem Rewind.
- **Akane**: gêneros, diretores e décadas contam sessões (rewatches inflam,
  `tools.py:1351,1369,1924`); Stats é subconjunto do Rewind.
- ~~**Nami**: "Patrimônio" soma `balance_inicial`; sem visão anual~~ — **corrigido na spec 071** (patrimônio real, retrospectiva
  anual no `StatsPage`).
- **Hub**: livros contados por `updated_at` e `CURRENT_DATE` (`hub.py:237`); "episódios" são
  sessões (`:392`); `date.today()` em `:159,:299`.
- **Sem tela de stats:** Komi, Yato, tarefas da Kaguya (só foco).

## Movimento

Catálogo **fechado** (`motion.css`): `fade` · `fadescale` (popover/menu) · `slideup`
(toast/sheet mobile) · `slideside` (drawer/sheet) · `rise` (entrada de lista, escalonada por
`--ds-i`) · `draw` (barras) · `shimmer` (skeleton) · `checkpop` (concluir/avaliar). Nenhum
componente inventa animação. Só `transform` e `opacity`; saídas mais rápidas que entradas; nada
bloqueia a interação. `prefers-reduced-motion` e o toggle "Reduzir animações" desligam
deslocamentos. Interações **otimistas** (`runOptimistic`): atualiza na hora, reverte com toast de
erro se o servidor falhar.

## Responsividade e acessibilidade

- Breakpoints em token: `sm` < 640 · `md` 640–899 · `lg` 900–1279 · `xl` ≥ 1280
  (`useBreakpoint` na janela; `useContainerBreakpoint` no container).
- Celular: gaveta, barra inferior, FAB, modal → bottom sheet, tabela → cartões, alvos de 44px em
  `pointer: coarse`, hover nunca é o único caminho, `env(safe-area-inset-*)`, `100dvh`.
- **Contraste WCAG AA** (4.5:1 texto, 3:1 gráficos) validado por script para **cada acento ×
  tema** (`npm run audit:design -- --contrast`). Foco visível único (`:focus-visible`, anel do
  acento). Teclado em tudo (roving tabindex em `Tabs`/`SegmentedControl`/menus). Landmarks, `aria-live`
  para toasts e contagem de filtros, `aria-current` na nav, link "Pular para o conteúdo".
  `prefers-contrast: more` tira a transparência do vidro.
- Imagens com proporção reservada (`ds-ratio-poster|still|square`), `loading="lazy"`, fade-in.
- Desempenho: poucos elementos com `backdrop-filter` ao mesmo tempo; itens arrastados e listas
  longas em superfície sólida.

## Direção de arte por página

O padrão define a **estrutura**. Cada página pode ter um **estilo de arte** (arquivo
`art/<estilo>.css`, ativado por `data-ds-art`), que só sobrescreve **custom properties visuais**:
cores de superfície, material (vidro/papel), texturas, fonte de título, raios/bordas/sombras,
ilustrações e ornamentos, curva das animações. **Nunca** layout, ordem dos componentes, navegação,
espaçamento, tamanho de controles, comportamento, ícones ou contraste.

Isso é garantido por teste: o `lint:design` rejeita qualquer propriedade que não seja `--ds-*`
dentro de `art/*.css`, e `ui.test.tsx` compara o DOM do shell com e sem o estilo (idêntico).

**Passo obrigatório ao criar/migrar uma página:** perguntar ao usuário — *"Quer seguir algum estilo
de arte específico para esta página?"* — com as opções: **Padrão Makima (vidro + ambiente)**, até 2
estilos sugeridos pelo domínio (ex.: Yato "caderno de bordo", Akane "cinema noir", Frieren
"grimório", Marin "neon kawaii", Violet "papel de carta") e **Outro**. A resposta vai para o campo
`art` em `agents.json` e em `conformance.json` (e nunca é perguntada de novo).

Estilos existentes: `caderno` (exemplo), `nautica` (**Nami** — "Carta náutica": papel creme + graticula
no claro, marinho profundo no escuro) e `noir` (**Akane** — "Cinema noir": prata com tinta quase preta
no claro, "sala apagada" com vinheta carmim no escuro, cantos secos e linhas finas de película). Direção
de arte por agente: Nami = `nautica`; Akane = `noir`; os demais _ainda não escolhida_ (`null`; `makima`
e `design` usam `default`).

**Armadilhas ao escrever um estilo de arte** (aprendidas no `nautica`):

- Uma custom property **não pode citar a si mesma** no mesmo elemento (ciclo → inválida). Para tingir `paper`,
  capture o valor original sob outro nome no `:root` (`--ds-art-base-paper: var(--ds-paper)`) e parta dele.
- O lint barra cor literal, mas **o contraste de estilos de arte não é auditado**: derive cores por
  `color-mix` de tokens (ou cor relativa `oklch(from var(--ds-info) …)`) e **confira WCAG à mão**, claro e
  escuro, contra `ambient`, `paper`, `card`, `card-2` e `mist` — o primeiro palpite do `nautica` falhava (3.3:1).
- No escuro, `card` precisa continuar **mais claro** que o fundo.

## Portabilidade (virar app)

- `core/` (regras puras) e `headless/` (hooks) servem a web e a um app React Native; só `ui/` seria
  reescrito, com a **mesma API de props**.
- Tokens vivem em JSON (formato de design tokens) → hoje geram CSS; amanhã podem gerar TS/Dart.
- O layout de celular (barra inferior, FAB, bottom sheet, gaveta, cartões) **é** o modelo de
  navegação do app: mesma intuição, mesmas funcionalidades.
- URLs estáveis (`/books/123`, filtros em query string) → deep links; `useHaptics/useGesture` e a
  fila offline (`OfflineQueue`) têm portas reservadas; notificações previstas no manifesto de cada
  agente (fonte já existe no `scheduler/`).
- Caminho: **PWA** (manifest + `theme-color` já prontos) → **Capacitor** (reuso ~95%) → React
  Native só se for preciso (reuso de `core/` + `headless/`). Decisão adiada.

## Governança — como o padrão continua padrão

| Peça | O que faz |
|---|---|
| `npm run tokens` / `tokens:check` | regenera / confere `tokens.css`, `accents.css`, `tokens.generated.ts` |
| `npm run lint:design` | lint estático (cores literais, `type=date`, `alert`, UTC, emoji, z-index, `@keyframes`, pureza do `core/`, camadas, rede, arte sem layout) em `src/design/` e nas páginas `migrating`/`conformant` |
| `npm run audit:design` | tokens em dia + lint + contraste WCAG (agente × tema) + manifesto × código; `-- --report` grava `DESIGN_CONFORMANCE.md`; `-- --contrast` lista todos os pares |
| `npm test` | inclui `audit.test.ts` (repositório em dia **e** casos negativos) e os testes de componente/hooks (jsdom + axe) |
| `src/design/conformance.json` | manifesto por página: `legacy` só no relatório · `migrating` falha o lint · `conformant` falha em **qualquer** item |
| Skill `makima-design-system` | roteiro para criar/migrar telas (pergunta arte → stats/facetas → checklist → auditoria → revisão `impeccable`) |

**Hook opcional do Claude Code** (não ativado): `PostToolUse` em `Edit|Write` sob
`webapp/frontend/src/**` rodando `npm run lint:design` e devolvendo as violações como feedback
imediato. Para ativar, use a skill `update-config`.

## Checklist de tela nova (ou migração)

- [ ] Direção de arte **perguntada ao usuário** e registrada (`art`).
- [ ] `AppShell` (agente em `agents.json`), CTA primário único, nav, `Voltar à Makima` + seletor.
- [ ] Tela Início abre com `Hero`.
- [ ] Tema global (`useTheme`); sem toggle próprio; preferências no `PreferencesPanel`.
- [ ] Ícones só do `design/` (sem arquivo local, sem emoji de UI).
- [ ] Toda lista/grade em `useCollection` (esquema com facetas; busca + status/tipo + data + 2 ordenações).
- [ ] Captura rápida do domínio (se há criação frequente), formulário completo como "Mais detalhes".
- [ ] 4 estados em toda tela; exclusão com `confirm()` + toast "Desfazer".
- [ ] Estatísticas no `StatsPage` com as métricas mínimas do domínio.
- [ ] Detalhe no `DetailPage`; formulários com `Field` e validação inline.
- [ ] Atalhos e paleta (provedor do domínio); nada só por teclado.
- [ ] Celular verificado (drawer, barra inferior, FAB, bottom sheet); alvos ≥ 44px.
- [ ] `conformance.json` atualizado; `npm run audit:design` e `npm test` passando.

## Guia de migração de um shell

1. Registrar/ajustar o agente em `agents.json` e rodar `npm run tokens`.
2. Perguntar a direção de arte; criar `art/<estilo>.css` se houver.
3. Trocar o esqueleto por `AppShell` (nav, CTA, `onGoAgent` com o `navigate` do router).
4. Remover o toggle de tema e o `TweaksPanel`; mover as preferências do domínio para a prop
   `preferences`.
5. Trocar tokens, botões, modais, toasts, estrelas, heatmaps, pickers pelos do `design/`.
6. Listas → `useCollection`; criação → `QuickCapture`; stats → `StatsPage`; detalhe → `DetailPage`.
7. Apagar o CSS e os componentes mortos; marcar `migrating` e, ao concluir, `conformant`.

Ordem sugerida (do menor para o maior): Komi → Yato → Mai (ganha o "Voltar à Makima" que não tinha)
→ Frieren → Akane → Violet → Marin → Nami → Kaguya. O Hub da Makima só adota tokens, tema e
ícones (não tem sidebar).

## Guia de voz

Rótulos em *sentence case*; verbos nos botões ("Salvar livro", não "OK"); erros dizem o que
aconteceu **e** o que fazer; vazios convidam à ação; a personalidade do agente aparece no hero e
nos vazios, nunca em rótulos funcionais.
