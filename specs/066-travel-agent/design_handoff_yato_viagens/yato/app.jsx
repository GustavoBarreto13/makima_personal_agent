/* ─────────────────────────────────────────────────────────────────────
   Yato · Viagens — shell (sidebar, topbar, rotas, footbar, tweaks)
   ───────────────────────────────────────────────────────────────────── */
const ACCENT_MAP = { 'Azul-cachecol': null, 'Ouro': 'ouro', 'Carmim': 'carmim', 'Musgo': 'musgo' };
const DENSITY_MAP = { 'Grande': 'large', 'Médio': 'medium', 'Compacto': 'compact' };

const NAV = [
  { id: 'home', label: 'Início', icon: 'inicio' },
  { id: 'trips', label: 'Viagens', icon: 'mochila', count: () => TRIPS.length },
  { id: 'trip', label: 'Roteiro', icon: 'rota', count: () => ITINERARY.length },
  { id: 'mobility', label: 'Mobilidade', icon: 'carimbo', count: () => pendingCount(DOSSIERS['MG/Tiradentes']) },
  { id: 'budget', label: 'Orçamento', icon: 'cifrao' },
  { id: 'checklist', label: 'Checklist', icon: 'lista', count: () => CHECKLIST.filter(c => !c.done).length },
];
const TITLES = { home: 'Início', trips: 'Viagens', trip: 'Roteiro', mobility: 'Dossiê de mobilidade', budget: 'Orçamento', checklist: 'Checklist' };

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "tema": "Escuro",
  "acento": "Azul-cachecol",
  "densidade": "Médio",
  "textura": true,
  "ordenacao": "Data de ida"
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [route, setRoute] = React.useState({ view: 'home', param: null });
  const [activeId, setActiveId] = React.useState('t1');
  const [query, setQuery] = React.useState('');
  const [toast, setToast] = React.useState('');
  const [orphans, setOrphans] = React.useState(0);
  const [, bump] = React.useState(0);
  const rerender = () => bump(v => v + 1);
  const scrollRef = React.useRef(null);

  const [newTrip, setNewTrip] = React.useState(false);
  const [newItem, setNewItem] = React.useState(null);
  const [logExp, setLogExp] = React.useState(false);
  const [wizard, setWizard] = React.useState(null);

  const activeTrip = TRIPS.find(x => x.id === activeId) || TRIPS[0];
  const activeDossier = dossierOf(activeTrip);

  const navigate = React.useCallback((view, param = null) => {
    setRoute({ view, param });
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    if (view !== 'trips') setQuery('');
  }, []);

  React.useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(''), 2800); return () => clearTimeout(id); }, [toast]);

  /* ── mutações ── */
  const saveTrip = f => {
    const id = 'n' + Date.now();
    TRIPS.unshift({ id, title: f.title || null, city: f.city, uf: f.uf, start: f.start, end: f.end, profile: f.profile, status: 'planejando', created: TODAY });
    setNewTrip(false); setActiveId(id); navigate('trip', id);
    setToast('Viagem criada — cinco ienes bem gastos.');
  };
  const saveItem = f => {
    ITINERARY.push({ id: 'n' + Date.now(), trip: activeTrip.id, day: f.day, period: f.period, time: f.time || null,
      title: f.title, addr: f.addr || null, mode: f.mode, cost: f.cost === '' ? null : Number(f.cost) });
    setNewItem(null); setToast('Item no roteiro.'); rerender();
  };
  const saveExpense = f => {
    EXPENSES.unshift({ id: 'n' + Date.now(), date: f.date, cat: f.cat, desc: f.desc, v: Number(f.v) });
    const b = BUDGET.find(x => x.cat === f.cat); if (b) b.act += Number(f.v);
    setLogExp(false); setToast('Gasto registrado e espelhado nas finanças.'); rerender();
  };
  const saveCheck = (key, verdict, ev, src) => {
    const d = activeDossier || DOSSIERS['MG/Tiradentes'];
    const srcLabel = (SOURCES.find(s => s[0] === src) || [null, src])[1];
    if (verdict === 'pendente') { setToast('Pulado — fica pendente, não fica errado.'); rerender(); return; }
    d.checks[key] = { v: verdict, src: srcLabel, at: TODAY, ev: ev || 'Registrado sem detalhe de evidência.' };
    setToast('Passo carimbado: ' + verdict + '.'); rerender();
  };
  const toggleChk = id => { const c = CHECKLIST.find(x => x.id === id); if (c) c.done = !c.done; rerender(); };
  const addChk = (group, label) => { CHECKLIST.push({ id: 'n' + Date.now(), group, label, done: false, src: 'manual' }); rerender(); };
  const regenChk = () => {
    const d = activeDossier; if (!d) return;
    let added = 0;
    checksOf(d).forEach(c => {
      if (c.v !== 'pendente' && c.v !== 'inconclusivo') return;
      const label = c.v === 'pendente'
        ? `Checar passo ${c.step.n} · ${c.step.name.toLowerCase()}`
        : `Refazer a checagem de ${c.step.name.toLowerCase()} (ficou inconclusivo)`;
      if (CHECKLIST.some(x => x.label === label)) return;
      CHECKLIST.push({ id: 'r' + c.step.key, group: 'antes de embarcar', label, done: false, src: 'dossie' });
      added++;
    });
    setToast(added ? `${added} ${added === 1 ? 'item novo' : 'itens novos'} do dossiê.` : 'Nada novo — o dossiê já está refletido aqui.');
    rerender();
  };
  const changeDates = (which, value) => {
    if (!value) return;
    activeTrip[which] = value;
    if (activeTrip.end < activeTrip.start) activeTrip.end = activeTrip.start;
    const days = dayList(activeTrip);
    setOrphans(itinOf(activeTrip.id).filter(i => !days.includes(i.day)).length);
    rerender();
  };
  const resolveOrphans = action => {
    const days = dayList(activeTrip);
    const out = itinOf(activeTrip.id).filter(i => !days.includes(i.day));
    if (action === 'mover') { out.forEach(i => { i.day = days[days.length - 1]; }); setToast(`${out.length} itens movidos para o último dia.`); }
    else { out.forEach(i => { const k = ITINERARY.indexOf(i); if (k > -1) ITINERARY.splice(k, 1); }); setToast(`${out.length} itens removidos.`); }
    setOrphans(0); rerender();
  };

  /* ── data-* no shell ── */
  const accent = ACCENT_MAP[t.acento];
  const shellProps = {
    'data-theme': t.tema === 'Claro' ? 'light' : 'dark',
    'data-density': DENSITY_MAP[t.densidade] || 'medium',
    'data-texture': t.textura ? 'on' : 'off',
  };
  if (accent) shellProps['data-accent'] = accent;

  const nextPend = CHECKLIST.find(c => !c.done);
  const cd = daysBetween(TODAY, activeTrip.start);

  const view = () => {
    switch (route.view) {
      case 'trips': return <Trips navigate={(v, p) => { if (v === 'trip' && p) setActiveId(p); navigate(v, p); }} sort={t.ordenacao} query={query} onNewTrip={() => setNewTrip(true)} />;
      case 'trip': return <TripDetail tripId={route.param || activeId} navigate={navigate}
        onAddItem={(day, period) => setNewItem({ day, period })} orphans={orphans}
        onOrphan={resolveOrphans} onDates={changeDates} />;
      case 'mobility': return <Mobility initialKey={activeTrip.uf + '/' + activeTrip.city}
        onCheck={key => setWizard({ key })} onStart={() => setWizard({ key: 'porte_cidade' })} />;
      case 'budget': return <Budget trip={activeTrip} onLog={() => setLogExp(true)} />;
      case 'checklist': return <Checklist onToggle={toggleChk} onAdd={addChk} onRegen={regenChk} />;
      default: return <Home trip={activeTrip} navigate={(v, p) => { if (v === 'trip' && p) setActiveId(p); navigate(v, p); }}
        onNewTrip={() => setNewTrip(true)} onCheck={key => setWizard({ key })} />;
    }
  };

  return (
    <div className="yato-shell" {...shellProps}>
      <div className="yato-tex" />

      {/* ── Sidebar ── */}
      <aside className="yato-side">
        <div className="side-brand">
          <div className="brand-mark"><img src="yato/yato.png" alt="Yato" /></div>
          <div className="brand-text">
            <div className="brand-name">🎒 Yato</div>
            <div className="brand-role">viagens</div>
          </div>
        </div>

        <button className="side-trip" onClick={() => navigate('trip', activeTrip.id)}>
          <div className="st-label">viagem ativa</div>
          <div className="st-city">{activeTrip.city}/{activeTrip.uf}</div>
          <div className="st-dates">{fmtRange(activeTrip.start, activeTrip.end)}</div>
          <div className="st-count">{cd > 0 ? `faltam ${cd} dias` : cd === 0 ? 'é hoje' : 'já rolou'}</div>
        </button>

        <nav className="side-nav">
          {NAV.map(n => (
            <button key={n.id} className={'nav-item' + (route.view === n.id ? ' active' : '')}
                    onClick={() => navigate(n.id, n.id === 'trip' ? activeTrip.id : null)}>
              <Icon name={n.icon} /> <span className="nav-label">{n.label}</span>
              {n.count && <span className="nav-count">{n.count()}</span>}
            </button>
          ))}
        </nav>

        <div className="side-foot">
          <p className="side-quote">"Só saio de casa quando sei como volto."</p>
          <button className="side-new" onClick={() => setNewTrip(true)}><Icon name="plus" /> <span>Nova viagem</span></button>
          <a className="back-makima" href="Makima - Hub.html"><span className="dot" /> Voltar à Makima</a>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="yato-main">
        <div className="yato-topbar">
          <span className="topbar-title">{TITLES[route.view]}</span>
          <div className="search">
            <Icon name="search" />
            <input value={query} placeholder="Buscar viagem, cidade…"
                   onChange={e => { setQuery(e.target.value); if (e.target.value && route.view !== 'trips') navigate('trips'); }} />
          </div>
          <div className="trip-select">
            <select value={activeId} onChange={e => setActiveId(e.target.value)}>
              {TRIPS.map(x => <option key={x.id} value={x.id}>{x.city}/{x.uf}</option>)}
            </select>
            <button className="topbar-prot" onClick={() => navigate('mobility')} title="abrir dossiê de mobilidade">
              <ReadinessMeter dossier={activeDossier} />
              {checkedCount(activeDossier)}/7 checados
            </button>
          </div>
        </div>
        <div className="yato-scroll" ref={scrollRef}>{view()}</div>
      </main>

      {/* ── Footbar ── */}
      <div className="footbar">
        <span className="fb-pend" onClick={() => navigate('checklist')}>
          <span className="fb-box" />
          {nextPend ? <>{nextPend.label} · {activeTrip.city}</> : 'checklist zerado — pode embarcar'}
        </span>
        <span className="fb-right">{itinOf(activeTrip.id).length} itens · {money(budgetTotals().act)} gastos</span>
        <button className="btn btn-sm" style={{ padding: '4px 8px' }} title="preferências"
                onClick={() => window.postMessage({ type: '__activate_edit_mode' }, '*')}>
          <Icon name="gear" style={{ width: 14, height: 14 }} />
        </button>
      </div>

      {/* ── Modais ── */}
      <NewTripModal open={newTrip} onClose={() => setNewTrip(false)} onSave={saveTrip} />
      <NewItemModal open={!!newItem} trip={activeTrip} preset={newItem} onClose={() => setNewItem(null)} onSave={saveItem} />
      <LogExpenseModal open={logExp} onClose={() => setLogExp(false)} onSave={saveExpense} />
      <ProtocolWizard open={!!wizard} dossier={activeDossier || DOSSIERS['MG/Tiradentes']}
                      startKey={wizard && wizard.key} onClose={() => setWizard(null)} onSave={saveCheck} />
      <Toast message={toast} />

      {/* ── Tweaks ── */}
      <TweaksPanel title="Preferências">
        <TweakSection label="Aparência" />
        <TweakRadio label="Tema" value={t.tema} options={['Escuro', 'Claro']} onChange={v => setTweak('tema', v)} />
        <TweakSelect label="Acento" value={t.acento} options={['Azul-cachecol', 'Ouro', 'Carmim', 'Musgo']} onChange={v => setTweak('acento', v)} />
        <TweakToggle label="Textura de mapa" value={t.textura} onChange={v => setTweak('textura', v)} />
        <TweakSection label="Densidade" />
        <TweakRadio label="Densidade" value={t.densidade} options={['Grande', 'Médio', 'Compacto']} onChange={v => setTweak('densidade', v)} />
        <TweakSection label="Viagens" />
        <TweakSelect label="Ordenação" value={t.ordenacao} options={['Data de ida', 'Criada', 'Prontidão', 'Orçamento']} onChange={v => setTweak('ordenacao', v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
