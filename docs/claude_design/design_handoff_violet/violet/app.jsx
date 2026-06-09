/* ─────────────────────────────────────────────────────────────────────────
   Violet · Diário — App (shell, sidebar, roteamento, tweaks)
   ───────────────────────────────────────────────────────────────────────── */

const NAV_TOP = [
  { id: 'write',    label: 'Write',    glyph: 'write',    light: true },
  { id: 'journal',  label: 'Journal',  glyph: 'journal',  light: true },
  { id: 'reflect',  label: 'Reflect',  glyph: 'reflect',  light: true },
  { id: 'insights', label: 'Insights', glyph: 'insights', light: true },
];
const NAV_BOTTOM = [
  { id: 'dreams',     label: 'Dreams',     glyph: 'moon',  color: 'var(--gold)',     count: () => DREAMS.length },
  { id: 'highlights', label: 'Highlights', glyph: 'heart', color: 'var(--garnet)',   count: () => HIGHLIGHTS.length },
  { id: 'tags',       label: 'Tags',       glyph: 'hash',  color: 'var(--sapphire)', count: () => TAGS.length },
  { id: 'people',     label: 'People',     glyph: 'at',    color: 'var(--emerald)',  count: () => PEOPLE.length },
  { id: 'notes',      label: 'Notes',      glyph: 'pin',   color: 'var(--ink-4)',    count: () => NOTES.length },
  { id: 'wisdom',     label: 'Wisdom',     glyph: 'gem',   color: 'var(--violet-c)', count: () => WISDOM.length },
  { id: 'ideas',      label: 'Ideas',      glyph: 'bulb',  color: 'var(--amber)',    count: () => IDEAS.length },
];
const TITLES = {
  write: 'Diário', journal: 'Arquivo', reflect: 'Reflexão', insights: 'Insights',
  dreams: 'Sonhos', highlights: 'Destaques', tags: 'Tags', people: 'Pessoas',
  notes: 'Notas', wisdom: 'Sabedoria', ideas: 'Ideias',
};
const NEAR_WHITE = 'oklch(0.97 0.005 250)';

const PALETTE_MAP = {
  '#3E5FB0': { base: 'oklch(0.55 0.135 250)', deep: 'oklch(0.45 0.135 252)', bright: 'oklch(0.70 0.130 246)', t1: 'oklch(0.55 0.135 250 / 0.10)', t2: 'oklch(0.55 0.135 250 / 0.16)' }, /* safira */
  '#B0863C': { base: 'oklch(0.625 0.105 78)', deep: 'oklch(0.535 0.098 72)', bright: 'oklch(0.74 0.105 80)',  t1: 'oklch(0.625 0.105 78 / 0.12)', t2: 'oklch(0.625 0.105 78 / 0.18)' }, /* ouro */
  '#3E8C6E': { base: 'oklch(0.585 0.105 165)',deep: 'oklch(0.49 0.098 166)', bright: 'oklch(0.72 0.105 166)', t1: 'oklch(0.585 0.105 165 / 0.12)',t2: 'oklch(0.585 0.105 165 / 0.18)' }, /* esmeralda */
  '#A23B43': { base: 'oklch(0.535 0.165 18)', deep: 'oklch(0.46 0.155 16)',  bright: 'oklch(0.68 0.150 20)',  t1: 'oklch(0.535 0.165 18 / 0.12)', t2: 'oklch(0.535 0.165 18 / 0.18)' }, /* granada */
};

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "tema": "Claro",
  "acento": "#3E5FB0",
  "modoEscrita": "Normal",
  "tipografia": "Clássica"
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [view, setView] = React.useState('write');
  const [entryIdx, setEntryIdx] = React.useState(0);   // 0 = entrada mais recente (hoje)
  const [query, setQuery] = React.useState('');
  const scrollRef = React.useRef(null);

  const navigate = React.useCallback((v, param = null) => {
    if (v === 'write' && typeof param === 'string' && param.startsWith('#')) {
      const num = parseInt(param.slice(1), 10);
      const i = ENTRIES.findIndex(e => e.num === num);
      if (i >= 0) setEntryIdx(i);
    }
    setView(v);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, []);

  const openEntry = React.useCallback((num) => {
    const i = ENTRIES.findIndex(e => e.num === num);
    if (i >= 0) setEntryIdx(i);
    setView('write');
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, []);

  const onFootNav = React.useCallback((action) => {
    setEntryIdx(prev => {
      const last = ENTRIES.length - 1;
      if (action === 'prev') return Math.min(last, prev + 1);
      if (action === 'next') return Math.max(0, prev - 1);
      if (action === 'first') return last;
      if (action === 'latest' || action === 'today') return 0;
      return prev;
    });
    if (action === 'list') setView('journal');
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, []);

  // tema
  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', t.tema === 'Escuro' ? 'dark' : 'light');
  }, [t.tema]);

  // acento
  React.useEffect(() => {
    const p = PALETTE_MAP[t.acento] || PALETTE_MAP['#3E5FB0'];
    const r = document.documentElement;
    r.style.setProperty('--accent', p.base);
    r.style.setProperty('--accent-deep', p.deep);
    r.style.setProperty('--accent-bright', p.bright);
    r.style.setProperty('--accent-tint', p.t1);
    r.style.setProperty('--accent-tint-2', p.t2);
  }, [t.acento]);

  // modo + tipografia (classes no shell)
  React.useEffect(() => {
    const el = document.querySelector('.vl-app');
    if (!el) return;
    el.classList.remove('modo-amplo', 'modo-foco');
    if (t.modoEscrita === 'Amplo') el.classList.add('modo-amplo');
    if (t.modoEscrita === 'Foco') el.classList.add('modo-foco');
    el.classList.remove('tipo-tecnica');
    if (t.tipografia === 'Técnica') el.classList.add('tipo-tecnica');
  }, [t.modoEscrita, t.tipografia]);

  const entry = ENTRIES[entryIdx];
  const isToday = entry.date === TODAY;
  const isWrite = view === 'write';

  const renderView = () => {
    switch (view) {
      case 'write':    return <Write entry={entry} isToday={isToday} navigate={navigate} />;
      case 'journal':  return <Journal navigate={navigate} openEntry={openEntry} />;
      case 'reflect':  return <Reflect navigate={navigate} />;
      case 'insights': return <Insights navigate={navigate} />;
      case 'tags':     return <Tags navigate={navigate} />;
      case 'people':   return <People navigate={navigate} />;
      default:         return <Collection id={view} navigate={navigate} />;
    }
  };

  const navItem = (n, group) => (
    <button key={n.id} className={'nav-item' + (view === n.id ? ' active' : '')} onClick={() => navigate(n.id)}>
      <span className="nav-chip">
        {n.glyph === 'dot'
          ? <Icon name="dot" style={{ color: NEAR_WHITE }} />
          : <Icon name={n.glyph} style={{ color: n.light ? NEAR_WHITE : n.color }} />}
      </span>
      <span>{n.label}</span>
      {group === 'bottom' && <span className="nav-count">{n.count()}</span>}
    </button>
  );

  return (
    <div className="vl-app">

      {/* ── Sidebar ── */}
      <aside className="vl-side">
        <div className="side-brand">
          <div className="brand-mark"><img src="violet/violet.png" alt="Violet Evergarden" /></div>
          <div className="brand-text">
            <div className="brand-name">Violet</div>
            <div className="brand-role">Diário</div>
          </div>
        </div>
        <button className="side-write-btn" onClick={() => navigate('write')}>
          <Icon name="write" /> <span>Escrever hoje</span>
        </button>
        <nav className="side-nav">
          {NAV_TOP.map(n => navItem(n, 'top'))}
          <div className="nav-divider" />
          {NAV_BOTTOM.map(n => navItem(n, 'bottom'))}
        </nav>
        <div className="side-foot">
          <a className="back-makima" href="Makima Diário.html"><span className="dot" /> <span>Voltar à Makima</span></a>
          <button className="side-collapse" title="Recolher"><Icon name="chevsL" /></button>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="vl-main">
        <div className="vl-topbar">
          <span className="topbar-title">{TITLES[view] || 'Diário'}</span>
          <div className="topbar-spacer" />
          {view === 'insights'
            ? <><span className="topbar-year">{YEAR}</span><button className="icon-btn"><Icon name="clock" /></button></>
            : !isWrite && (
                <div className="search">
                  <Icon name="search" />
                  <input value={query} placeholder="Buscar nas entradas…" onChange={e => setQuery(e.target.value)} />
                </div>
              )}
          {isWrite && <button className="icon-btn" title="Nova entrada" onClick={() => navigate('write')}><Icon name="plus" /></button>}
        </div>

        <div className="vl-scroll" ref={scrollRef}>
          {renderView()}
        </div>

        {isWrite && <WriteFoot idx={entryIdx} total={ENTRIES.length} onNav={onFootNav} />}
      </main>

      {/* ── Tweaks ── */}
      <TweaksPanel title="Tweaks">
        <TweakSection label="Aparência" />
        <TweakRadio label="Tema" value={t.tema} options={['Claro', 'Escuro']} onChange={v => setTweak('tema', v)} />
        <TweakColor label="Acento da Violet" value={t.acento}
                    options={['#3E5FB0', '#B0863C', '#3E8C6E', '#A23B43']}
                    onChange={v => setTweak('acento', v)} />
        <TweakSection label="Escrita" />
        <TweakRadio label="Modo" value={t.modoEscrita} options={['Normal', 'Amplo', 'Foco']} onChange={v => setTweak('modoEscrita', v)} />
        <TweakRadio label="Tipografia" value={t.tipografia} options={['Clássica', 'Técnica']} onChange={v => setTweak('tipografia', v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
