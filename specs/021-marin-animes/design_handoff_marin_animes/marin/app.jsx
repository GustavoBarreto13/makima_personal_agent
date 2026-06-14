/* ─────────────────────────────────────────────────────────────────────────
   Marin · Animes — App (shell, sidebar, roteamento, tweaks, sync, log)
   ───────────────────────────────────────────────────────────────────────── */

const DENSITY_MAP = { 'Grande': 'large', 'Médio': 'medium', 'Compacto': 'compact' };
const ACCENT_MAP  = { 'Rosa-Magenta': '', 'Sakura': 'sakura', 'Neon': 'neon', 'Gold': 'gold' };

const NAV = [
  { id: 'home',        label: 'Início',        emoji: '📺', icon: 'inicio' },
  { id: 'catalogo',    label: 'Catálogo',      emoji: '🎌', icon: 'catalogo',  count: () => ANIMES.length },
  { id: 'diario',      label: 'Diário',        emoji: '📖', icon: 'diario',    count: () => LOGS.length },
  { id: 'watchlist',   label: 'Quero assistir',emoji: '⭐', icon: 'watchlist', count: () => ANIMES.filter(a => a.status === 'quero_assistir').length },
  { id: 'lancamentos', label: 'Lançamentos',   emoji: '📅', icon: 'calendar',  count: () => SCHEDULE.length },
  { id: 'stats',       label: 'Estatísticas',  emoji: '📊', icon: 'stats' },
];

const TITLES = {
  home: { t: 'Início', e: '📺' }, catalogo: { t: 'Catálogo', e: '🎌' }, diario: { t: 'Diário', e: '📖' },
  watchlist: { t: 'Quero assistir', e: '⭐' }, lancamentos: { t: 'Lançamentos', e: '📅' },
  stats: { t: 'Estatísticas', e: '📊' }, detalhe: { t: 'Anime', e: '🎞️' },
};

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "tema": "Escuro",
  "acento": "Neon",
  "densidade": "Médio",
  "ordenacao": "Atualizado"
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [route, setRoute] = React.useState({ view: 'home', param: null });
  const [query, setQuery] = React.useState('');
  const [modal, setModal] = React.useState({ open: false, animeId: null, ep: null });
  const [addOpen, setAddOpen] = React.useState(false);
  const [syncing, setSyncing] = React.useState(false);
  const [toast, setToast] = React.useState('');
  const [, setVersion] = React.useState(0);
  const scrollRef = React.useRef(null);

  const navigate = React.useCallback((view, param = null) => {
    setRoute({ view, param });
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    if (view !== 'catalogo') setQuery('');
  }, []);

  const openLog = React.useCallback((animeId = null, ep = null) => {
    setModal({ open: true, animeId: typeof animeId === 'string' ? animeId : null, ep: typeof ep === 'number' ? ep : null });
  }, []);

  React.useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(''), 2800);
    return () => clearTimeout(id);
  }, [toast]);

  const addLog = ({ animeId, epStart, epEnd, date, score, fav, note }) => {
    const a = animeById(animeId);
    if (!a) return;
    LOGS.unshift({ id: 'u' + Date.now(), date, animeId, ep_start: epStart, ep_end: epEnd, score: score || null, note: note || null });
    LOGS.sort((x, y) => y.date.localeCompare(x.date));
    a.episodes_watched = Math.max(a.episodes_watched, epEnd);
    if (score) a.score = score;
    if (fav) a.fav = true;
    if (a.status === 'quero_assistir' || a.status === 'pausado' || a.status === 'abandonado') a.status = 'assistindo';
    if (a.episodes_total != null && a.episodes_watched >= a.episodes_total) { a.status = 'completo'; a.next = null; }
    else if (a.next && epEnd >= a.next.number) { a.next = { number: a.episodes_watched + 1, title: '', aired: a.next.aired }; }
    const day = HEATMAP.find(d => d.date === date);
    if (day) day.count += 1;
    const n = epEnd - epStart + 1;
    setToast(a.status === 'completo' ? `${a.title} completo! 🎉` : `Logado! ${n} ${n === 1 ? 'episódio' : 'episódios'} 🎀`);
    setVersion(v => v + 1);
  };

  const onAddAnime = (a) => {
    setAddOpen(false);
    setToast(`${a.title} adicionado! ✨ Quero assistir`);
    setVersion(v => v + 1);
    navigate('detalhe', a.id);
  };

  const doSync = () => {
    if (syncing) return;
    setSyncing(true);
    setTimeout(() => {
      setSyncing(false);
      setToast('Sync concluído ✨ · 0 criados · 3 atualizados');
    }, 2100);
  };

  const renderView = () => {
    switch (route.view) {
      case 'home':        return <Home navigate={navigate} openLog={openLog} />;
      case 'catalogo':    return <Catalog key="all" navigate={navigate} sort={t.ordenacao} query={query} initialFilter="todos" />;
      case 'watchlist':   return <Watchlist navigate={navigate} openLog={openLog} />;
      case 'diario':      return <Diary navigate={navigate} />;
      case 'lancamentos': return <Schedule navigate={navigate} />;
      case 'stats':       return <Stats navigate={navigate} />;
      case 'detalhe':     return <AnimeDetail animeId={route.param} navigate={navigate} openLog={openLog} onToggle={() => setVersion(v => v + 1)} />;
      default:            return <Home navigate={navigate} openLog={openLog} />;
    }
  };

  const activeNav = route.view === 'detalhe' ? 'catalogo' : route.view;
  const title = TITLES[route.view] || TITLES.home;

  return (
    <div className="marin-shell"
         data-theme={t.tema === 'Claro' ? 'light' : 'dark'}
         data-accent={ACCENT_MAP[t.acento] || undefined}
         data-density={DENSITY_MAP[t.densidade] || 'medium'}>

      {/* ── Sidebar ── */}
      <aside className="mr-side">
        <div className="side-brand">
          <div className="brand-mark"><img src="marin/marin-hero.png" alt="Marin Kitagawa" /></div>
          <div className="brand-text">
            <div className="brand-name">Marin</div>
            <div className="brand-role">Animes</div>
          </div>
        </div>
        <button className="side-log-btn" onClick={() => openLog()}>
          <Icon name="plus" /> <span>Logar episódio</span>
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
        <div className="side-sync">
          <button className={'sync-btn' + (syncing ? ' syncing' : '')} onClick={doSync}>
            <Icon name="sync" /> <span>{syncing ? 'Sincronizando…' : 'Sync MAL'}</span>
          </button>
          <a className="back-makima" href="Makima Diário.html"><span className="dot" /> Voltar à Makima</a>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="mr-main">
        <div className="mr-topbar">
          <span className="topbar-title"><span className="tt-emoji">{title.e}</span> {title.t}</span>
          <div className="topbar-spacer" />
          <div className="search">
            <Icon name="search" />
            <input value={query} placeholder="Buscar anime, estúdio ou gênero…"
                   onChange={e => { setQuery(e.target.value); if (e.target.value && route.view !== 'catalogo') navigate('catalogo'); }} />
          </div>
          <button className="topbar-add" onClick={() => setAddOpen(true)} aria-label="Adicionar anime"><Icon name="plus" /></button>
        </div>
        <div className="mr-scroll" ref={scrollRef}>
          {renderView()}
        </div>
      </main>

      {/* ── Próximo episódio ── */}
      <NextBar navigate={navigate} openLog={openLog} />

      {/* ── Modais ── */}
      <LogWatchModal open={modal.open} presetAnimeId={modal.animeId} presetEp={modal.ep}
                     onClose={() => setModal({ open: false, animeId: null, ep: null })}
                     onSave={addLog} />
      <AddAnimeModal open={addOpen} onClose={() => setAddOpen(false)} onAdd={onAddAnime} navigate={navigate} />

      <Toast message={toast} />

      {/* ── Tweaks ── */}
      <TweaksPanel title="Tweaks">
        <TweakSection label="Aparência" />
        <TweakRadio label="Tema" value={t.tema} options={['Escuro', 'Claro']} onChange={v => setTweak('tema', v)} />
        <TweakRadio label="Cor de acento" value={t.acento} options={['Rosa-Magenta', 'Sakura', 'Neon', 'Gold']} onChange={v => setTweak('acento', v)} />
        <TweakSection label="Catálogo" />
        <TweakRadio label="Densidade" value={t.densidade} options={['Grande', 'Médio', 'Compacto']} onChange={v => setTweak('densidade', v)} />
        <TweakSelect label="Ordenação" value={t.ordenacao} options={['Atualizado', 'Adicionado', 'Nota', 'Título', 'Progresso']} onChange={v => setTweak('ordenacao', v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
