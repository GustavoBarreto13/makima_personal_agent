# UI Contracts: Violet · Diário

**Padrão de referência**: FrierenShell (`webapp/frontend/src/pages/frieren/FrierenShell.tsx`)
**Design de referência**: `docs/claude_design/design_handoff_violet/README.md`

---

## VioletShell (shell raiz)

**Rota**: `/journal/*` (wildcard, bypass do Layout global)
**Arquivo**: `pages/violet/VioletShell.tsx`

**Props**: nenhuma (standalone, lê `violetApi`)

**Estado interno**:
```typescript
interface Route { view: string; param: string | null }
const [route, setRoute] = useState<Route>({ view: 'write', param: null })
const [tweaks, setTweaks] = useState<VioletPrefs>(loadTweaks())  // de localStorage 'vl-tweaks'
const [query, setQuery] = useState('')
```

**Efeitos**:
- Ao montar: `document.querySelector('.vl-app')?.setAttribute('data-theme', tweaks.theme)`
- Ao trocar acento: `setProperty('--accent', ...)` etc. nas 5 variáveis CSS de acento
- Ao trocar modo: classe CSS no `.vl-app` (`modo-foco`, `modo-amplo`, `''`)
- Ao trocar tipografia: classe `.tipo-tecnica` no `.vl-app`

**Views disponíveis** (via `switch (route.view)` em `renderView()`):
| `view` | Componente | Descrição |
|---|---|---|
| `write` | `<Write />` | tela P1 — escrever o dia |
| `journal` | `<Journal />` | tela P2 — arquivo |
| `reflect` | `<Reflect />` | tela P5 |
| `insights` | `<Insights />` | tela P4 |
| `dreams` | `<Collection kind="dreams" />` | tela P3 coleção sonhos (da page) |
| `highlights` | `<Collection kind="highlights" />` | tela P3 bullets highlight |
| `ideas` | `<Collection kind="ideas" />` | tela P3 bullets idea |
| `wisdom` | `<Collection kind="wisdom" />` | tela P3 bullets wisdom |
| `notes` | `<Collection kind="notes" />` | tela P3 bullets note |
| `tags` | `<Tags />` | tela P3 |
| `people` | `<People />` | tela P3 |

**Estrutura JSX** (classe raiz `.vl-app`):
```tsx
<div className="vl-app" data-theme={tweaks.theme} data-mode={tweaks.mode} ...>
  <aside className="vl-side">
    {/* brand: avatar + nome + role */}
    {/* botão "Escrever hoje" */}
    {/* nav grupo 1: write, journal, reflect, insights */}
    {/* .nav-divider */}
    {/* nav grupo 2: dreams, highlights, tags, people, notes, wisdom, ideas — com contadores */}
    {/* rodapé: "Voltar à Makima" + botão collapse */}
  </aside>
  <main className="vl-main">
    <div className="vl-topbar">
      {/* título + search + icon buttons */}
    </div>
    <div className="vl-scroll" ref={scrollRef}>
      {renderView()}
    </div>
    {route.view === 'write' && <WriteFooter ... />}
  </main>
  {showTweaks && <TweaksPanel tweaks={tweaks} onTweaks={setTweaks} onClose={...} />}
</div>
```

---

## Write (tela P1)

**Arquivo**: `pages/violet/screens/Write.tsx`

**Props**:
```typescript
interface WriteProps {
  date: string;          // YYYY-MM-DD da entry ativa
  entryIdx: number;      // índice na lista de entries (0 = hoje)
  navigate: (view: string, param?: string | null) => void;
}
```

**Dados carregados**: `violetApi.page(date)` → `{page, bullets}` ao montar e ao trocar `date`.

**Estado interno**:
- `page: PageData | null` — entry + bullets carregados
- `editing: number | null` — position do bullet em edição
- `savingDream: boolean`

**Áreas da tela**:

1. **Cabeçalho de data** (`.write-header`):
   - Mês+dia: `{month} {day}` em DM Sans 15px/600 `--accent-deep`
   - Dia da semana: `{weekday}` em Newsreader 56px/700 `--w-day`
   - `#num · Hoje` ou `#num · N dias atrás` em DM Sans 13.5px

2. **Prompt de sonho** (`.dream-prompt`):
   - Ícone lua + input/texto Newsreader itálico 17px `--ink-4`
   - Se `page.dream` não nulo: mostra o texto; clicar ativa edição
   - Ao perder foco: `violetApi.setDream(page.id, text)`

3. **Lista de bullets** (`.bullets-list`):
   - Para cada bullet: marcador por `kind` + `<RichText content={bullet.content} />` + timestamp
   - Bullet `highlight`: fundo gradiente lateral garnet-tint
   - Bullet `wisdom`: fonte Newsreader itálico 16.5px
   - Novo bullet placeholder: ponto + "Registrar um momento..." em itálico `--ink-3` opacity 0.4

4. **Chips de tipo** (`.type-chips`): 6 chips (Bullet, Destaque, Ideia, Sabedoria, Nota, Sonho)
   - Clicar: adicionar bullet com `kind` correspondente + foco no campo
   - `kind` do chip "Sonho" adiciona bullet `kind='dream'` (diferente do campo `page.dream`)

---

## WriteFooter (barra de navegação)

**Arquivo**: `pages/violet/screens/WriteFooter.tsx`

**Props**:
```typescript
interface WriteFooterProps {
  entryIdx: number;
  totalEntries: number;
  onNav: (action: 'prev' | 'next' | 'first' | 'latest' | 'today' | 'list') => void;
}
```

**Botões**: `«` (first), `‹` (prev), `Lista`, `●` (today), `›` (next), `»` (latest).
- `«` e `»` desabilitados quando na primeira/última entry.
- `●` tem borda e cor `--accent-deep`.

---

## Journal (tela P2)

**Arquivo**: `pages/violet/screens/Journal.tsx`

**Props**:
```typescript
interface JournalProps {
  query: string;
  navigate: (view: string, param?: string | null) => void;
}
```

**Dados carregados**: list de entries do servidor (paginado por mês ou fetch único ao abrir).

**Renderização**:
- Agrupamento por mês em ordem decrescente
- `max-width: 720px` centralizado
- Cabeçalho de mês: DM Mono uppercase `letter-spacing: 0.14em`
- Cards: dia Newsreader 30px/600, excerpt 2 linhas `-webkit-line-clamp: 2`, pills garnet/gold

**Interação**: clicar em card → `navigate('write', entry.date)`

---

## Collection (telas P3 — Dreams/Highlights/Ideas/Wisdom/Notes)

**Arquivo**: `pages/violet/screens/Collection.tsx`

**Props**:
```typescript
interface CollectionProps {
  kind: 'dreams' | 'highlights' | 'ideas' | 'wisdom' | 'notes';
  navigate: (view: string, param?: string | null) => void;
}
```

**Dados carregados**:
- `kind === 'dreams'` → `violetApi.dreams()`
- outros → `violetApi.collection(kind)`

**Config por kind**:
| kind | Cor accent bar | Tipografia do texto |
|---|---|---|
| `dreams` | `--gold` | Newsreader itálico 18px |
| `highlights` | `--garnet` | DM Sans 15px |
| `ideas` | `--amber` | DM Sans 15px |
| `wisdom` | `--violet-c` | Newsreader itálico 18px |
| `notes` | `--ink-3` | DM Sans 15px |

Grid: `repeat(auto-fill, minmax(280px, 1fr))`, `gap: 16px`.

---

## Tags (tela P3)

**Arquivo**: `pages/violet/screens/Tags.tsx`

**Dados carregados**: `violetApi.mentions('tag')` → array `{value, count}[]`

**Renderização**: nuvem de tags com `font-size = 0.92em + (count / maxCount) * 0.55em`.
Cada tag: `border-radius: 999px`, hover `background: var(--accent-tint)`.
Clicar → `navigate('journal')` com filtro por tag (via `query` state).

---

## People (tela P3)

**Arquivo**: `pages/violet/screens/People.tsx`

**Dados carregados**: `violetApi.mentions('person')` → array `{value, count}[]`

**Renderização**: grid 4 colunas (`minmax(220px, 1fr)`).
Card por pessoa: avatar circular 42px (inicial, fundo `--emerald-tint`), nome 14.5px/600,
contagem DM Mono 10.5px.

---

## Insights (tela P4)

**Arquivo**: `pages/violet/screens/Insights.tsx`

**Dados carregados**: `violetApi.heatmap(year)`, `violetApi.stats(year)`

**Estado interno**:
- `activeTab: string` — default `'diario'`

**Abas**: `diario`, `sonhos`, `destaques`, `tags`, `pessoas`, `sabedoria`, `ideias`

**Aba Diário** — conteúdo:
1. Heatmap anual: `<HeatmapRow />` por semana, 7 linhas
2. Chips de contagem: highlights, tags, mentions, dreams
3. Linhas de stat (5): days written, total words, per day, freq/week, highlight rate
4. `<AreaChart data={stats.wordsByMonth} />` — 12 pontos, curva Catmull-Rom
5. Distribuição por hora: 12 barras com gradiente vertical accent→accent-bright
6. Big numbers (3): entries, total words, per day

---

## Reflect (tela P5)

**Arquivo**: `pages/violet/screens/Reflect.tsx`

**Dados carregados**:
- `violetApi.collection('wisdom')`, `violetApi.collection('highlights')`,
  `violetApi.collection('ideas')`, `violetApi.dreams()` — para "Releia-se"

**Estado interno**:
- `promptIdx: number` — default 0, cicla 0–3 com "Outra pergunta"

**"Releia-se"** — seleção determinística:
```typescript
const seed = getDayOfYear(new Date())  // 1–365
const pickItem = (arr: any[]) => arr.length > 0 ? arr[seed % arr.length] : null
```
Exibe 1 item de cada tipo que tenha conteúdo disponível.

---

## TweaksPanel

**Arquivo**: `pages/violet/TweaksPanel.tsx`

**Props**:
```typescript
interface TweaksPanelProps {
  tweaks: VioletPrefs;
  onTweaks: (t: VioletPrefs) => void;
  onClose: () => void;
}
```

**Controles**: 4 grupos de radio buttons / color swatches:
1. Tema: Claro / Escuro
2. Acento: Safira (swatch) / Ouro / Esmeralda / Granada
3. Modo: Normal / Amplo / Foco
4. Tipografia: Clássica / Técnica

**Persistência**: ao mudar qualquer tweak, `localStorage.setItem('vl-tweaks', JSON.stringify(tweaks))`

---

## Primitivos UI

### Icon

**Arquivo**: `pages/violet/ui/Icon.tsx`

```typescript
interface IconProps {
  name: 'write' | 'journal' | 'reflect' | 'insights' | 'moon' | 'heart' |
        'gem' | 'bulb' | 'hash' | 'at' | 'pin';
  size?: number;  // default 15
  className?: string;
}
```

SVG inline com `strokeWidth: 1.8`, `strokeLinecap: 'round'`, `strokeLinejoin: 'round'`.
`moon`, `heart`, `gem` são preenchidos (`fill: currentColor`, sem stroke).

### RichText

**Arquivo**: `pages/violet/ui/RichText.tsx`

```typescript
interface RichTextProps {
  content: string;
  onMentionClick?: (kind: 'person' | 'tag', value: string) => void;
}
```

Parse: `@Palavra` → `<span class="mention-person" onClick={...}>@Palavra</span>` em emerald/500.
`#tag` → `<span class="mention-tag" onClick={...}>#tag</span>` em accent-deep/500.

### HeatmapRow

**Arquivo**: `pages/violet/ui/HeatmapRow.tsx`

```typescript
interface HeatmapRowProps {
  cells: { date: string; words: number }[];  // 7 células (1 semana)
}
```

Renderiza 7 `<div>` de 9×9px com `background: var(--heat-N)` baseado nos thresholds.

### AreaChart

**Arquivo**: `pages/violet/ui/AreaChart.tsx`

```typescript
interface AreaChartProps {
  data: number[];      // 12 valores (palavras por mês)
  width?: number;
  height?: number;
}
```

SVG puro. Curva Catmull-Rom convertida para Bezier. Gradiente de área accent 22%→2%.
Labels dos meses em DM Mono 9px.
