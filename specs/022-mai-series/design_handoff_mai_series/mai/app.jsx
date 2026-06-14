/* ─────────────────────────────────────────────────────────────────────────
   Mai · Séries — App (shell, sidebar, roteamento, tweaks, log de sessão)
   ───────────────────────────────────────────────────────────────────────── */

const DENSITY_MAP = { 'Grande': 'large', 'Médio': 'medium', 'Compacto': 'compact' };
const ACCENT_MAP  = { 'Periwinkle': '', 'Rosa': 'rosa', 'Ouro': 'ouro', 'Noir': 'noir' };

const NAV = [
  { id: 'home',      label: 'Início',        emoji: '📺', icon: 'inicio' },
  { id: 'catalogo',  label: 'Catálogo',      emoji: '🗂', icon: 'catalogo',  count: () => SERIES.length },
  { id: 'diario',    label: 'Diário',        emoji: '📖', icon: 'diario',    count: () => LOGS.length },
  { id: 'watchlist', label: 'Quero assistir',emoji: '🌙', icon: 'watchlist', count: () => SERIES.filter(a => a.status === 'quero_assistir').length },
  { id: 'proximos',  label: 'Próximos eps',  emoji: '📅', icon: 'calendar',  count: () => UPCOMING.length },
  { id: 'stats',     label: 'Estatísticas',  emoji: '📊', icon: 'stats' },
];

const TITLES = {
  home: { t: 'Início', e: '📺' }, catalogo: { t: 'Catálogo', e: '🗂' }, diario: { t: 'Diário', e: '📖' },
  watchlist: { t: 'Quero assistir', e: '🌙' }, proximos: { t: 'Próximos episódios', e: '📅' },
  stats: { t: 'Estatísticas', e: '📊' }, detalhe: { t: 'Série', e: '🎬' },
};

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "tema": "Escuro",
  "acento": "Periwinkle",
  "densidade": "Médio",
  "ordenacao": "Atualizado"
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [route, setRoute] = React.useState({ view: 'home', param: null });
  const [query, setQuery] = React.useState('');
  const [modal, setModal] = React.useState({ open: false, seriesId: null, season: null, ep: null });
  const [addOpen, setAddOpen] = React.useState(false);
  const [toast, setToast] = React.useState('');
  const [, setVersion] = React.useState(0);
  const scrollRef = React.useRef(null);

  const navigate = React.useCallback((view, param = null) => {
    setRoute({ view, param });
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    if (view !== 'catalogo') setQuery('');
  }, []);

  const openLog = React.useCallback((seriesId = null, season = null, ep = null) => {
    setModal({ open: true,
      seriesId: typeof seriesId === 'string' ? seriesId : null,
      season: typeof season === 'number' ? season : null,
      ep: typeof ep === 'number' ? ep : null });
  }, []);

  React.useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(''), 2800);
    return () => clearTimeout(id);
  }, [toast]);

  const addLog = ({ seriesId, season, epStart, epEnd, date, score, fav, note }) => {
    const a = seriesById(seriesId);
    if (!a) return;
    LOGS.unshift({ id: 'u' + Date.now(), date, seriesId, season, ep_start: epStart, ep_end: epEnd, score: score || null, note: note || null });
    LOGS.sort((x, y) => y.date.localeCompare(x.date));
    const se = a.seasons.find(s => s.n === season);
    if (se) { const cap = se.eps == null ? epEnd : Math.min(se.eps, epEnd); se.watched = Math.max(se.watched, cap); }
    if (score) a.score = score;
    if (fav) a.fav = true;
    if (a.status === 'quero_assistir' || a.status === 'pausada' || a.status === 'abandonada') a.status = 'assistindo';
    enrich(a);
    const allDone = a.seasons.every(s => s.eps != null && s.watched >= s.eps);
    if (allDone) a.status = 'concluida';
    const day = HEATMAP.find(d => d.date === date);
    if (day) day.count += 1;
    const n = epEnd - epStart + 1;
    setToast(a.status === 'concluida' ? `${a.title} — concluída ✓` : `Sessão logada · ${n} ${n === 1 ? 'episódio' : 'episódios'} 📺`);
    setVersion(v => v + 1);
  };

  const onAddSeries = (a) => {
    setAddOpen(false);
    setToast(`${a.title} adicionada ao catálogo 📺`);
    setVersion(v => v + 1);
    navigate('detalhe', a.id);
  };

  const renderView = () => {
    switch (route.view) {
      case 'home':      return <Home navigate={navigate} openLog={openLog} />;
      case 'catalogo':  return <Catalog key="all" navigate={navigate} sort={t.ordenacao} query={query} initialFilter="todos" />;
      case 'watchlist': return <Watchlist navigate={navigate} openLog={openLog} />;
      case 'diario':    return <Diary navigate={navigate} />;
      case 'proximos':  return <Upcoming navigate={navigate} />;
      case 'stats':     return <Stats navigate={navigate} />;
      case 'detalhe':   return <SeriesDetail seriesId={route.param} navigate={navigate} openLog={openLog} onToggle={() => setVersion(v => v + 1)} />;
      default:          return <Home navigate={navigate} openLog={openLog} />;
    }
  };

  const activeNav = route.view === 'detalhe' ? 'catalogo' : route.view;
  const title = TITLES[route.view] || TITLES.home;

  return (
    <div className="mai-shell"
         data-theme={t.tema === 'Claro' ? 'light' : 'dark'}
         data-accent={ACCENT_MAP[t.acento] || undefined}
         data-density={DENSITY_MAP[t.densidade] || 'medium'}>

      {/* ── Sidebar ── */}
      <aside className="mai-side">
        <div className="side-brand">
          <div className="brand-mark"><img src="mai/mai-hero.png" alt="Mai Sakurajima" /></div>
          <div className="brand-text">
            <div className="brand-name"><span className="bunny">🐰</span> Mai</div>
            <div className="brand-role">Séries</div>
          </div>
        </div>
        <button className="side-log-btn" onClick={() => openLog()}>
          <Icon name="plus" /> <span>Logar sessão</span>
        </button>
        <nav className="side-nav">
          <div className="nav-group-label">Acervo</div>
          {NAV.slice(0, 4).map(n => (
            <button key={n.id} className={'nav-item' + (activeNav === n.id ? ' active' : '')} onClick={() => navigate(n.id)}>
              <span className="nav-emoji">{n.emoji}</span> <span>{n.label}</span>
              {n.count && <span className="nav-count">{n.count()}</span>}
            </button>
          ))}
          <div className="nav-group-label">Descobrir</div>
          {NAV.slice(4).map(n => (
            <button key={n.id} className={'nav-item' + (activeNav === n.id ? ' active' : '')} onClick={() => navigate(n.id)}>
              <span className="nav-emoji">{n.emoji}</span> <span>{n.label}</span>
              {n.count && <span className="nav-count">{n.count()}</span>}
            </button>
          ))}
        </nav>
        <div className="side-foot">
          <div className="side-quote"><span className="q-mark">“</span>Toda série é uma performance de longo curso.<span className="q-mark">”</span></div>
          <a className="back-makima" href="Makima Diário.html"><span className="dot" /> Voltar à Makima</a>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="mai-main">
        <div className="mai-topbar">
          <span className="topbar-title"><span className="tt-emoji">{title.e}</span> {title.t}</span>
          <div className="topbar-spacer" />
          <div className="search">
            <Icon name="search" />
            <input value={query} placeholder="Buscar série, rede ou gênero…"
                   onChange={e => { setQuery(e.target.value); if (e.target.value && route.view !== 'catalogo') navigate('catalogo'); }} />
          </div>
          <button className="topbar-add" onClick={() => setAddOpen(true)} aria-label="Adicionar série"><Icon name="plus" /></button>
        </div>
        <div className="mai-scroll" ref={scrollRef}>
          {renderView()}
        </div>
      </main>

      {/* ── Próximo episódio ── */}
      <NextBar navigate={navigate} openLog={openLog} />

      {/* ── Modais ── */}
      <LogWatchModal open={modal.open} presetSeriesId={modal.seriesId} presetSeason={modal.season} presetEp={modal.ep}
                     onClose={() => setModal({ open: false, seriesId: null, season: null, ep: null })}
                     onSave={addLog} />
      <AddSeriesModal open={addOpen} onClose={() => setAddOpen(false)} onAdd={onAddSeries} />

      <Toast message={toast} />

      {/* ── Tweaks ── */}
      <TweaksPanel title="Tweaks">
        <TweakSection label="Aparência" />
        <TweakRadio label="Tema" value={t.tema} options={['Escuro', 'Claro']} onChange={v => setTweak('tema', v)} />
        <TweakSelect label="Cor de acento" value={t.acento} options={['Periwinkle', 'Rosa', 'Ouro', 'Noir']} onChange={v => setTweak('acento', v)} />
        <TweakSection label="Catálogo" />
        <TweakRadio label="Densidade" value={t.densidade} options={['Grande', 'Médio', 'Compacto']} onChange={v => setTweak('densidade', v)} />
        <TweakSelect label="Ordenação" value={t.ordenacao} options={['Atualizado', 'Adicionado', 'Nota', 'Título', 'Progresso']} onChange={v => setTweak('ordenacao', v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
