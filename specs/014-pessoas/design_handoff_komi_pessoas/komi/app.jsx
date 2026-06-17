/* ─────────────────────────────────────────────────────────────────────────
   Komi · Pessoas — App (shell, sidebar, roteamento, persistência, tweaks)
   ───────────────────────────────────────────────────────────────────────── */

const KM_PALETTES = {
  '#5A4FCF': { base: 'oklch(0.505 0.135 277)', deep: 'oklch(0.420 0.130 278)', bright: 'oklch(0.640 0.130 275)', t1: 'oklch(0.505 0.135 277 / 0.11)', t2: 'oklch(0.505 0.135 277 / 0.19)' }, /* índigo */
  '#A23B43': { base: 'oklch(0.535 0.165 19)',  deep: 'oklch(0.455 0.155 17)',  bright: 'oklch(0.670 0.150 22)',  t1: 'oklch(0.535 0.165 19 / 0.12)',  t2: 'oklch(0.535 0.165 19 / 0.19)' }, /* granada */
  '#3E7FB0': { base: 'oklch(0.555 0.110 248)', deep: 'oklch(0.465 0.110 250)', bright: 'oklch(0.685 0.105 246)', t1: 'oklch(0.555 0.110 248 / 0.12)', t2: 'oklch(0.555 0.110 248 / 0.19)' }, /* azul */
  '#3E8C6E': { base: 'oklch(0.560 0.105 165)', deep: 'oklch(0.470 0.098 166)', bright: 'oklch(0.700 0.105 166)', t1: 'oklch(0.560 0.105 165 / 0.12)', t2: 'oklch(0.560 0.105 165 / 0.19)' }, /* esmeralda */
};

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "tema": "Claro",
  "acento": "#5A4FCF",
  "nomes": "Serifa"
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [people, setPeople] = React.useState(() => loadPeople());
  const [view, setView] = React.useState('home');        // home | grid | person | dates
  const [currentId, setCurrentId] = React.useState(null);
  const [query, setQuery] = React.useState('');
  const [filter, setFilter] = React.useState('todos');
  const [modal, setModal] = React.useState(null);         // null | {id} | 'new'
  const scrollRef = React.useRef(null);

  // persistência
  React.useEffect(() => { savePeople(people); }, [people]);

  // tema
  React.useEffect(() => {
    document.querySelector('.km-app').setAttribute('data-theme', t.tema === 'Escuro' ? 'dark' : 'light');
  }, [t.tema]);

  // acento
  React.useEffect(() => {
    const p = KM_PALETTES[t.acento] || KM_PALETTES['#5A4FCF'];
    const r = document.querySelector('.km-app');
    r.style.setProperty('--km', p.base);
    r.style.setProperty('--km-deep', p.deep);
    r.style.setProperty('--km-bright', p.bright);
    r.style.setProperty('--km-tint', p.t1);
    r.style.setProperty('--km-tint-2', p.t2);
  }, [t.acento]);

  // tipografia dos nomes
  React.useEffect(() => {
    const r = document.querySelector('.km-app');
    r.style.setProperty('--serif', t.nomes === 'Sem serifa'
      ? "'Hanken Grotesk', 'DM Sans', system-ui, sans-serif"
      : "'Playfair Display', Georgia, serif");
  }, [t.nomes]);

  // atalho: N abre nova pessoa
  React.useEffect(() => {
    const onKey = (e) => {
      if (modal) return;
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); setModal('new'); }
      if (e.key === 'Escape' && view === 'person') goGrid();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modal, view]);

  const goGrid = () => { setView('grid'); setCurrentId(null); if (scrollRef.current) scrollRef.current.scrollTop = 0; };
  const goView = (v) => { setView(v); setCurrentId(null); if (scrollRef.current) scrollRef.current.scrollTop = 0; };
  const openPerson = (id) => { setCurrentId(id); setView('person'); if (scrollRef.current) scrollRef.current.scrollTop = 0; };

  const savePerson = (p, isNew) => {
    setPeople(prev => isNew ? [...prev, p] : prev.map(x => x.id === p.id ? p : x));
    setModal(null);
    if (isNew) openPerson(p.id);
  };
  const deletePerson = (id) => {
    setPeople(prev => prev.filter(x => x.id !== id));
    setModal(null);
    goGrid();
  };
  const resetDemo = () => {
    if (confirm('Restaurar os dados de exemplo? Suas alterações locais serão perdidas.')) {
      const fresh = SEED.map(p => JSON.parse(JSON.stringify(p)));
      setPeople(fresh); goGrid();
    }
  };

  const current = people.find(p => p.id === currentId);
  const upcomingCount = people.reduce((n, p) => n + (p.dates || []).filter(d => daysUntil(d.date, d.recurring) >= 0 && daysUntil(d.date, d.recurring) <= 60).length, 0);

  const catCounts = React.useMemo(() => {
    const m = {};
    people.forEach(p => { m[p.category] = (m[p.category] || 0) + 1; });
    return m;
  }, [people]);

  return (
    <div className="km-app">
      {/* ── Sidebar ── */}
      <aside className="km-side">
        <div className="side-brand">
          <div className="brand-mark"><img src="komi/komi.png" alt="Komi" /></div>
          <div className="brand-text">
            <div className="brand-name">Komi</div>
            <div className="brand-role">Pessoas</div>
          </div>
        </div>
        <button className="side-add" onClick={() => setModal('new')}>
          <Icon name="plus" /><span className="grow">Nova pessoa</span><kbd>N</kbd>
        </button>
        <nav className="side-nav">
          <div className="nav-group-label">Diretório</div>
          <button className={'nav-item' + (view === 'home' ? ' active' : '')} onClick={() => goView('home')}>
            <Icon name="sparkles" /><span className="nav-label">Início</span>
          </button>
          <button className={'nav-item' + (view === 'grid' ? ' active' : '')} onClick={goGrid}>
            <Icon name="users" /><span className="nav-label">Todas as pessoas</span><span className="nav-count">{people.length}</span>
          </button>
          <button className={'nav-item' + (view === 'dates' ? ' active' : '')} onClick={() => { setView('dates'); if (scrollRef.current) scrollRef.current.scrollTop = 0; }}>
            <Icon name="cake" /><span className="nav-label">Próximas datas</span><span className="nav-count">{upcomingCount}</span>
          </button>

          <div className="nav-group-label">Relacionamentos</div>
          {Object.entries(REL_CATS).map(([key, meta]) => (
            <button key={key} className={'nav-item' + (view === 'grid' && filter === key ? ' active' : '')}
                    onClick={() => { setFilter(key); goGrid(); }}>
              <span className="nav-dot" style={{ background: meta.color }} />
              <span className="nav-label">{meta.label}</span>
              <span className="nav-count">{catCounts[key] || 0}</span>
            </button>
          ))}
        </nav>
        <div className="side-foot">
          <a className="back-makima" href="Makima Diário.html"><span className="dot" /><span>Voltar à Makima</span></a>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="km-main">
        <div className="km-topbar">
          {view === 'person' ? (
            <button className="topbar-back" onClick={goGrid}><Icon name="chevL" />Diretório</button>
          ) : (
            <span className="topbar-title"><span className="t-dot" />{view === 'dates' ? 'Próximas datas' : view === 'home' ? 'Início' : 'Pessoas'}</span>
          )}
          <span className="topbar-spacer" />
          {view === 'grid' && (
            <div className="km-search">
              <Icon name="search" />
              <input value={query} placeholder="Buscar pessoa, apelido, cidade…" onChange={(e) => setQuery(e.target.value)} />
            </div>
          )}
          {view === 'person' && current && (
            <button className="btn btn-ghost btn-sm" onClick={() => setModal({ id: current.id })}><Icon name="edit" />Editar</button>
          )}
          <button className="btn btn-primary btn-sm" onClick={() => setModal('new')}><Icon name="plus" />Nova</button>
        </div>

        <div className="km-scroll" ref={scrollRef}>
          {view === 'home' && (
            <Home people={people} onOpen={openPerson} onNew={() => setModal('new')} goView={goView} setFilter={setFilter} />
          )}
          {view === 'grid' && (
            <PeopleGrid people={people} query={query} filter={filter} setFilter={setFilter}
                        onOpen={openPerson} onNew={() => setModal('new')} />
          )}
          {view === 'dates' && <UpcomingDates people={people} onOpen={openPerson} />}
          {view === 'person' && current && <PersonPage p={current} onEdit={(id) => setModal({ id })} />}
          {view === 'person' && !current && (
            <div className="empty-state">
              <div className="es-icon"><Icon name="user" /></div>
              <div className="es-title">Pessoa não encontrada</div>
              <button className="btn btn-ghost btn-sm" style={{ marginTop: 14 }} onClick={goGrid}>Voltar ao diretório</button>
            </div>
          )}
        </div>
      </main>

      {/* ── Modal ── */}
      {modal && (
        <PersonModal
          person={modal === 'new' ? null : people.find(p => p.id === modal.id)}
          onClose={() => setModal(null)}
          onSave={savePerson}
          onDelete={deletePerson}
        />
      )}

      {/* ── Tweaks ── */}
      <TweaksPanel title="Tweaks">
        <TweakSection label="Aparência" />
        <TweakRadio label="Tema" value={t.tema} options={['Claro', 'Escuro']} onChange={v => setTweak('tema', v)} />
        <TweakColor label="Acento da Komi" value={t.acento}
                    options={['#5A4FCF', '#A23B43', '#3E7FB0', '#3E8C6E']}
                    onChange={v => setTweak('acento', v)} />
        <TweakSection label="Tipografia" />
        <TweakRadio label="Nomes" value={t.nomes} options={['Serifa', 'Sem serifa']} onChange={v => setTweak('nomes', v)} />
        <TweakSection label="Dados" />
        <TweakButton label="Restaurar exemplo" secondary onClick={resetDemo} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
