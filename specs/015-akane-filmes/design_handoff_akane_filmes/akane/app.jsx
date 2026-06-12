/* ─────────────────────────────────────────────────────────────────────────
   Akane · Filmes — App (shell, sidebar, roteamento, tweaks, registro)
   ───────────────────────────────────────────────────────────────────────── */

const DENSITY_MAP = { 'Grande': 'grande', 'Médio': 'medio', 'Compacto': 'compacto' };
const ACCENT_MAP  = { 'Rosa de palco': '', 'Carmim': 'carmim', 'Âmbar': 'ambar', 'Verde-água': 'teal' };
const POSTYLE_MAP = { 'Tipográfico': 'tipografico', 'Minimal': 'minimal' };

const NAV = [
  { id: 'home',      label: 'Início',    icon: 'inicio' },
  { id: 'filmes',    label: 'Filmes',    icon: 'filmes',    count: () => FILMS.length },
  { id: 'diario',    label: 'Diário',    icon: 'diario',    count: () => DIARY.length },
  { id: 'watchlist', label: 'Quero ver', icon: 'watchlist', count: () => FILMS.filter(f => f.status === 'watchlist').length },
  { id: 'listas',    label: 'Listas',    icon: 'listas',    count: () => LISTS.length },
  { id: 'tags',      label: 'Etiquetas', icon: 'tags',      count: () => TAGS.length },
  { id: 'rewind',    label: 'Rewind',    icon: 'rewind' },
];

const TITLES = {
  home: 'Início', filmes: 'Filmes', diario: 'Diário', watchlist: 'Quero ver',
  listas: 'Listas', lista: 'Lista', tags: 'Etiquetas', tag: 'Etiqueta',
  rewind: 'Rewind 2026', detalhe: 'Filme',
};

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "tema": "Escuro",
  "densidade": "Compacto",
  "acento": "Verde-água",
  "poster": "Tipográfico",
  "ordenacao": "Recentes"
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [route, setRoute] = React.useState({ view: 'home', param: null });
  const [query, setQuery] = React.useState('');
  const [modal, setModal] = React.useState({ open: false, presetFilmId: null });
  const [toast, setToast] = React.useState('');
  const [, setVersion] = React.useState(0);
  const scrollRef = React.useRef(null);

  const navigate = React.useCallback((view, param = null) => {
    setRoute({ view, param });
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    if (view !== 'filmes') setQuery('');
  }, []);

  const openLog = React.useCallback((presetFilmId = null) => {
    setModal({ open: true, presetFilmId: typeof presetFilmId === 'string' ? presetFilmId : null });
  }, []);

  React.useEffect(() => {
    document.querySelector('.ak-app')?.setAttribute('data-density', DENSITY_MAP[t.densidade] || 'medio');
  }, [t.densidade]);
  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', t.tema === 'Claro' ? 'light' : 'dark');
  }, [t.tema]);
  React.useEffect(() => {
    const a = ACCENT_MAP[t.acento] || '';
    if (a) document.documentElement.setAttribute('data-accent', a);
    else document.documentElement.removeAttribute('data-accent');
  }, [t.acento]);
  React.useEffect(() => {
    document.querySelector('.ak-app')?.setAttribute('data-postyle', POSTYLE_MAP[t.poster] || 'tipografico');
  }, [t.poster]);

  React.useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(''), 2600);
    return () => clearTimeout(id);
  }, [toast]);

  const addLog = ({ filmId, date, rating, liked, rewatch, note }) => {
    const f = filmById(filmId);
    if (!f) return;
    DIARY.unshift({ id: 'u' + Date.now(), date, filmId, rating: rating || null, liked: !!liked, rewatch: !!rewatch, note: note || null });
    DIARY.sort((a, b) => b.date.localeCompare(a.date));
    if (f.status === 'watchlist') f.status = 'watched';
    if (rating) { f.rating = rating; if (!f.ratingSource) f.ratingSource = 'own'; }
    if (liked) f.liked = true;
    // reflete no heatmap
    const day = HEATMAP.find(d => d.date === date);
    if (day) day.count += 1;
    setToast(rewatch ? 'Revisão logada no diário' : 'Filme logado no diário');
    setVersion(v => v + 1);
  };

  const renderView = () => {
    switch (route.view) {
      case 'home':      return <Home navigate={navigate} openLog={openLog} />;
      case 'filmes':    return <Catalog key="all" navigate={navigate} sort={t.ordenacao} query={query} initialFilter="todos" />;
      case 'watchlist': return <Watchlist navigate={navigate} openLog={openLog} />;
      case 'diario':    return <Diary navigate={navigate} />;
      case 'listas':    return <Lists navigate={navigate} />;
      case 'lista':     return <ListView listId={route.param} navigate={navigate} />;
      case 'tags':      return <Tags navigate={navigate} />;
      case 'tag':       return <Catalog key={'tag-' + route.param} navigate={navigate} sort={t.ordenacao} query={query} tag={route.param} />;
      case 'rewind':    return <Rewind navigate={navigate} />;
      case 'detalhe':   return <FilmDetail filmId={route.param} navigate={navigate} openLog={openLog} onToggle={() => setVersion(v => v + 1)} />;
      default:          return <Home navigate={navigate} openLog={openLog} />;
    }
  };

  const activeNav = route.view === 'detalhe' ? 'filmes'
    : route.view === 'lista' ? 'listas'
    : route.view === 'tag' ? 'tags'
    : route.view;

  return (
    <div className="ak-app" data-density={DENSITY_MAP[t.densidade]} data-footbar="on">

      {/* ── Sidebar ── */}
      <aside className="ak-side">
        <div className="side-brand">
          <div className="brand-mark"><img src="akane/akane-hero.png" alt="Akane Kurokawa" /></div>
          <div className="brand-text">
            <div className="brand-name">Akane</div>
            <div className="brand-role">Filmes</div>
          </div>
        </div>
        <button className="side-log-btn" onClick={() => openLog()}>
          <Icon name="plus" /> <span>Logar filme</span>
        </button>
        <nav className="side-nav">
          <div className="nav-group-label">Cinemateca</div>
          {NAV.slice(0, 4).map(n => (
            <button key={n.id} className={'nav-item' + (activeNav === n.id ? ' active' : '')} onClick={() => navigate(n.id)}>
              <Icon name={n.icon} /> <span>{n.label}</span>
              {n.count && <span className="nav-count">{n.count()}</span>}
            </button>
          ))}
          <div className="nav-group-label">Coleção</div>
          {NAV.slice(4).map(n => (
            <button key={n.id} className={'nav-item' + (activeNav === n.id ? ' active' : '')} onClick={() => navigate(n.id)}>
              <Icon name={n.icon} /> <span>{n.label}</span>
              {n.count && <span className="nav-count">{n.count()}</span>}
            </button>
          ))}
        </nav>
        <div className="side-foot">
          <a className="back-makima" href="Makima Diário.html"><span className="dot" /> Voltar à Makima</a>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="ak-main">
        <div className="ak-topbar">
          <span className="topbar-title">{TITLES[route.view] || 'Akane'}</span>
          <div className="topbar-spacer" />
          <div className="search">
            <Icon name="search" />
            <input value={query} placeholder="Buscar título ou diretor…"
                   onChange={e => { setQuery(e.target.value); if (e.target.value && route.view !== 'filmes') navigate('filmes'); }} />
          </div>
        </div>
        <div className="ak-scroll" ref={scrollRef}>
          {renderView()}
        </div>
      </main>

      {/* ── Próxima sessão ── */}
      <NextBar navigate={navigate} openLog={openLog} />

      {/* ── Modal de registro ── */}
      <LogModal open={modal.open} presetFilmId={modal.presetFilmId}
                onClose={() => setModal({ open: false, presetFilmId: null })}
                onSave={addLog} />

      <Toast message={toast} />

      {/* ── Tweaks ── */}
      <TweaksPanel title="Tweaks">
        <TweakSection label="Aparência" />
        <TweakRadio label="Tema" value={t.tema} options={['Escuro', 'Claro']} onChange={v => setTweak('tema', v)} />
        <TweakRadio label="Cor de acento" value={t.acento} options={['Rosa de palco', 'Carmim', 'Âmbar', 'Verde-água']} onChange={v => setTweak('acento', v)} />
        <TweakSection label="Grade de filmes" />
        <TweakRadio label="Densidade" value={t.densidade} options={['Grande', 'Médio', 'Compacto']} onChange={v => setTweak('densidade', v)} />
        <TweakRadio label="Estilo do pôster" value={t.poster} options={['Tipográfico', 'Minimal']} onChange={v => setTweak('poster', v)} />
        <TweakSelect label="Ordenação" value={t.ordenacao} options={['Recentes', 'Nota', 'Título', 'Diretor', 'Ano', 'Duração']} onChange={v => setTweak('ordenacao', v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
