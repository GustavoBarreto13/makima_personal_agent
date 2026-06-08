/* ─────────────────────────────────────────────────────────────────────────
   Frieren · Livros — App (shell, sidebar, roteamento, tweaks, registro)
   ───────────────────────────────────────────────────────────────────────── */

const LAYOUT_MAP   = { 'Cinemático': 'cinematico', 'Editorial': 'editorial', 'Galeria': 'galeria' };
const DENSITY_MAP  = { 'Grande': 'grande', 'Médio': 'medio', 'Compacto': 'compacto' };

const NAV = [
  { id: 'home',      view: 'home',     label: 'Início',       icon: 'inicio' },
  { id: 'catalogo',  view: 'catalogo', label: 'Biblioteca',   icon: 'catalogo', count: () => BOOKS.length },
  { id: 'lendo',     view: 'lendo',    label: 'Lendo agora',  icon: 'lendo',    count: () => BOOKS.filter(b => b.status === 'reading').length },
  { id: 'querler',   view: 'querler',  label: 'Quero ler',    icon: 'wishlist', count: () => BOOKS.filter(b => b.status === 'owned').length },
  { id: 'wishlist',  view: 'wishlist', label: 'Wishlist',      icon: 'sparkle',  count: () => BOOKS.filter(b => b.status === 'wishlist').length },
  { id: 'listas',    view: 'listas',   label: 'Estantes',     icon: 'listas',   count: () => SHELVES.length },
  { id: 'atividade', view: 'atividade',label: 'Atividade',    icon: 'atividade' },
  { id: 'resenhas',  view: 'resenhas', label: 'Resenhas',     icon: 'resenhas', count: () => BOOKS.filter(b => b.review).length },
  { id: 'stats',     view: 'stats',    label: 'Estatísticas', icon: 'stats' },
];

const TITLES = {
  home: 'Início', catalogo: 'Biblioteca', lendo: 'Lendo agora',
  querler: 'Quero ler', wishlist: 'Wishlist',
  listas: 'Estantes', estante: 'Estante', atividade: 'Atividade',
  resenhas: 'Resenhas', stats: 'Estatísticas', detalhe: 'Livro',
};

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "tema": "Claro",
  "layoutInicio": "Cinemático",
  "densidade": "Médio",
  "ordenacao": "Recentes"
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [route, setRoute] = React.useState({ view: 'home', param: null });
  const [query, setQuery] = React.useState('');
  const [modal, setModal] = React.useState({ open: false, presetBookId: null });
  const [toast, setToast] = React.useState('');
  const [, setVersion] = React.useState(0);
  const scrollRef = React.useRef(null);

  const navigate = React.useCallback((view, param = null) => {
    setRoute({ view, param });
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    if (view !== 'catalogo' && view !== 'lendo' && view !== 'wishlist' && view !== 'querler') setQuery('');
  }, []);

  const openLog = React.useCallback((presetBookId = null) => {
    setModal({ open: true, presetBookId: typeof presetBookId === 'string' ? presetBookId : null });
  }, []);

  // aplica densidade no shell
  React.useEffect(() => {
    document.querySelector('.fr-app')?.setAttribute('data-density', DENSITY_MAP[t.densidade] || 'medio');
  }, [t.densidade]);

  // aplica tema (claro/escuro)
  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', t.tema === 'Escuro' ? 'dark' : 'light');
  }, [t.tema]);

  // toast auto-some
  React.useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(''), 2600);
    return () => clearTimeout(id);
  }, [toast]);

  const addLog = ({ bookId, page, note, finished, rating }) => {
    const b = bookById(bookId);
    if (!b) return;
    const prev = b.page || 0;
    const delta = Math.max(0, page - prev);
    const today = '2026-06-08';
    ACTIVITY.unshift({
      id: 'u' + Date.now(), date: today, bookId,
      type: finished ? 'finished' : (b.status === 'wishlist' ? 'started' : 'progress'),
      pages: delta, page, note: note || null, rating: rating || null,
    });
    if (b.status === 'wishlist') { b.status = 'reading'; b.started = today; }
    b.page = page;
    if (b.pages) b.progress = Math.min(1, page / b.pages);
    if (finished) { b.status = 'read'; b.progress = 1; b.finished = today; if (rating) b.rating = rating; }
    // reflete páginas de hoje no heatmap
    const td = HEATMAP[HEATMAP.length - 1];
    if (td && td.date === today) td.pages += delta;
    setToast(finished ? 'Livro terminado — que jornada!' : `+${delta} ${delta === 1 ? 'página registrada' : 'páginas registradas'}`);
    setVersion(v => v + 1);
  };

  const layout = LAYOUT_MAP[t.layoutInicio] || 'cinematico';
  const atual = BOOKS.filter(b => b.status === 'reading').sort((a, b) => (b.progress || 0) - (a.progress || 0))[0] || BOOKS[0];

  const renderView = () => {
    switch (route.view) {
      case 'home':      return <Home layout={layout} navigate={navigate} openLog={openLog} atual={atual} />;
      case 'catalogo':  return <Catalog key="cat-all" navigate={navigate} sort={t.ordenacao} query={query} initialFilter="todos" />;
      case 'lendo':     return <Catalog key="cat-reading" navigate={navigate} sort={t.ordenacao} query={query} initialFilter="reading" />;
      case 'querler':   return <ToRead navigate={navigate} openLog={openLog} />;
      case 'wishlist':  return <Wishlist navigate={navigate} openLog={openLog} onToast={setToast} />;
      case 'listas':    return <Lists navigate={navigate} />;
      case 'estante':   return <ShelfView shelfId={route.param} navigate={navigate} />;
      case 'atividade': return <Activity navigate={navigate} />;
      case 'resenhas':  return <Reviews navigate={navigate} />;
      case 'stats':     return <Stats navigate={navigate} />;
      case 'detalhe':   return <BookDetail bookId={route.param} navigate={navigate} openLog={openLog} />;
      default:          return <Home layout={layout} navigate={navigate} openLog={openLog} atual={atual} />;
    }
  };

  const activeNav = ['lendo', 'wishlist', 'querler', 'catalogo'].includes(route.view) ? route.view
    : route.view === 'estante' ? 'listas'
    : route.view === 'detalhe' ? 'catalogo'
    : route.view;

  return (
    <div className="fr-app" data-density={DENSITY_MAP[t.densidade]} data-nowplaying="on">

      {/* ── Sidebar ── */}
      <aside className="fr-side">
        <div className="side-brand">
          <div className="brand-mark"><img src="frieren/frieren.png" alt="Frieren" /></div>
          <div className="brand-text">
            <div className="brand-name">Frieren</div>
            <div className="brand-role">Livros</div>
          </div>
        </div>
        <button className="side-log-btn" onClick={() => openLog()}>
          <Icon name="plus" /> <span>Registrar leitura</span>
        </button>
        <nav className="side-nav">
          <div className="nav-group-label">Biblioteca</div>
          {NAV.slice(0, 4).map(n => (
            <button key={n.id} className={'nav-item' + (activeNav === n.id ? ' active' : '')} onClick={() => navigate(n.view)}>
              <Icon name={n.icon} /> <span>{n.label}</span>
              {n.count && <span className="nav-count">{n.count()}</span>}
            </button>
          ))}
          <div className="nav-group-label">Coleção</div>
          {NAV.slice(4).map(n => (
            <button key={n.id} className={'nav-item' + (activeNav === n.id ? ' active' : '')} onClick={() => navigate(n.view)}>
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
      <main className="fr-main">
        <div className="fr-topbar">
          <span className="topbar-title">{TITLES[route.view] || 'Frieren'}</span>
          <div className="topbar-spacer" />
          <div className="search">
            <Icon name="search" />
            <input value={query} placeholder="Buscar título ou autor…"
                   onChange={e => {
                     setQuery(e.target.value);
                     if (e.target.value && !['catalogo', 'lendo', 'wishlist', 'querler'].includes(route.view)) navigate('catalogo');
                   }} />
          </div>
        </div>
        <div className="fr-scroll" ref={scrollRef}>
          {renderView()}
        </div>
      </main>

      {/* ── Agora lendo ── */}
      <NowBar navigate={navigate} openLog={openLog} />

      {/* ── Modal de registro ── */}
      <LogModal open={modal.open} presetBookId={modal.presetBookId}
                onClose={() => setModal({ open: false, presetBookId: null })}
                onSave={addLog} />

      <Toast message={toast} />

      {/* ── Tweaks ── */}
      <TweaksPanel title="Tweaks">
        <TweakSection label="Aparência" />
        <TweakRadio label="Tema" value={t.tema}
                    options={['Claro', 'Escuro']}
                    onChange={v => setTweak('tema', v)} />
        <TweakSection label="Página inicial" />
        <TweakRadio label="Layout do hero" value={t.layoutInicio}
                    options={['Cinemático', 'Editorial', 'Galeria']}
                    onChange={v => setTweak('layoutInicio', v)} />
        <TweakSection label="Catálogo" />
        <TweakRadio label="Densidade da grade" value={t.densidade}
                    options={['Grande', 'Médio', 'Compacto']}
                    onChange={v => setTweak('densidade', v)} />
        <TweakSelect label="Ordenação" value={t.ordenacao}
                     options={['Recentes', 'Avaliação', 'Título', 'Autor', 'Progresso']}
                     onChange={v => setTweak('ordenacao', v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
