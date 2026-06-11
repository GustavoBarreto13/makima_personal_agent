/* ─────────────────────────────────────────────────────────────────────────
   Kaguya · Tarefas — shell (sidebar do domínio, roteamento por estado,
   mutações sobre TASKS, recorrência, command palette, tweaks).
   Navegação interna por estado local — sem React Router (padrão dos shells).
   ───────────────────────────────────────────────────────────────────────── */

const PALETTE_MAP = {
  '#3B82C4': { base: 'oklch(0.56 0.13 252)', deep: 'oklch(0.47 0.13 254)', bright: 'oklch(0.69 0.12 250)' },   /* azul (padrão) */
  '#EC4899': { base: 'oklch(0.71 0.18 350)', deep: 'oklch(0.60 0.17 348)', bright: 'oklch(0.80 0.145 352)' },  /* rosa Kaguya */
  '#8B5CF6': { base: 'oklch(0.62 0.17 300)', deep: 'oklch(0.52 0.16 300)', bright: 'oklch(0.74 0.15 302)' },  /* violeta */
  '#C9A227': { base: 'oklch(0.72 0.13 82)', deep: 'oklch(0.62 0.12 80)', bright: 'oklch(0.82 0.12 86)' },     /* dourado */
};

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "tema": "Claro",
  "densidade": "Compacta",
  "acento": "#3B82C4",
  "marca": "bar",
  "animacoes": true
}/*EDITMODE-END*/;

const VIEWS_FIXED = [
  { view: 'today', label: 'Meu Dia', icon: 'sun' },
  { view: 'board', label: 'Kanban', icon: 'board' },
  { view: 'calendar', label: 'Calendário', icon: 'calendar' },
  { view: 'eisenhower', label: 'Eisenhower', icon: 'grid2x2' },
];

const WD_MAP = { segunda: 1, terça: 2, terca: 2, quarta: 3, quinta: 4, sexta: 5, sábado: 6, sabado: 6, domingo: 0 };
function nextOccurrence(t) {
  const mode = t.recur.mode, rule = t.recur.rule || '', label = t.recur.label || '';
  if (mode === 'after_completion') { const m = rule.match(/a cada (\d+)/); return isoAdd(TODAY, m ? +m[1] : 1); }
  const mDay = label.match(/dia (\d+)/);
  if (mDay) { const day = +mDay[1]; const b = iso2d(TODAY); let d = new Date(b.getFullYear(), b.getMonth(), day); if (d <= b) d = new Date(b.getFullYear(), b.getMonth() + 1, day); return d2iso(d); }
  const mWd = label.match(/toda (\w+)/);
  if (mWd && WD_MAP[mWd[1]] !== undefined) return nextWeekday(WD_MAP[mWd[1]]);
  if (/mensal|todo m[êe]s/.test(label) || /mensal/.test(rule)) { const day = t.due ? iso2d(t.due).getDate() : 1; const b = iso2d(TODAY); return d2iso(new Date(b.getFullYear(), b.getMonth() + 1, day)); }
  if (/di[áa]rio/.test(rule) || label === 'todo dia') return isoAdd(TODAY, 1);
  return isoAdd(t.due || TODAY, 7);
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [route, setRoute] = React.useState({ view: 'today', param: null });
  const [calMode, setCalMode] = React.useState('month');
  const [modal, setModal] = React.useState(null);        // {kind, data}
  const [cmdkOpen, setCmdkOpen] = React.useState(false);
  const [toast, setToast] = React.useState('');
  const [userFilters, setUserFilters] = React.useState([]);
  const [, setVersion] = React.useState(0);
  const scrollRef = React.useRef(null);
  const refresh = React.useCallback(() => setVersion(v => v + 1), []);

  const allFilters = [...FILTERS, ...userFilters];

  const navigate = React.useCallback((view, param = null) => {
    setRoute({ view, param });
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, []);

  /* ── efeitos de tweaks (escopados em .kg-app) ── */
  React.useEffect(() => {
    const el = document.querySelector('.kg-app'); if (!el) return;
    el.setAttribute('data-theme', t.tema === 'Escuro' ? 'dark' : 'light');
    el.setAttribute('data-density', t.densidade === 'Confortável' ? 'confortavel' : 'compacta');
    el.setAttribute('data-pmark', t.marca);
    el.setAttribute('data-anim', t.animacoes ? 'on' : 'off');
    const p = PALETTE_MAP[t.acento] || PALETTE_MAP['#3B82C4'];
    el.style.setProperty('--kg', p.base);
    el.style.setProperty('--kg-deep', p.deep);
    el.style.setProperty('--kg-bright', p.bright);
    el.style.setProperty('--kg-tint', p.base.replace(')', ' / 0.12)'));
    el.style.setProperty('--kg-tint-2', p.base.replace(')', ' / 0.20)'));
  }, [t.tema, t.densidade, t.marca, t.animacoes, t.acento]);

  /* ── toast auto-some ── */
  React.useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(''), 2600); return () => clearTimeout(id); }, [toast]);

  /* ── ⌘K abre o palette ── */
  React.useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); setCmdkOpen(o => !o); return; }
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (modal || cmdkOpen) return;
      if (e.key === 'c') { e.preventDefault(); setModal({ kind: 'task', data: { _new: true, project: route.param && route.view === 'project' ? route.param : 'inbox' } }); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modal, cmdkOpen, route]);

  /* ── mutações ── */
  const onUpdate = (id, patch) => { const tk = TASKS.find(x => x.id === id); if (tk) { Object.assign(tk, patch); refresh(); } };
  const onInlineSave = (task, title) => onUpdate(task.id, { title });
  const onToggleSub = (task, subId) => { const tk = TASKS.find(x => x.id === task.id); if (!tk) return; const s = tk.subtasks.find(x => x.id === subId); if (s) s.done = !s.done; refresh(); };

  const onComplete = (task, done) => {
    const tk = TASKS.find(x => x.id === task.id); if (!tk) return;
    if (done && tk.recur) {
      const nd = nextOccurrence(tk);
      const { id, pos, ...rest } = tk;
      const next = mk(Object.assign({}, rest, { done: false, today: false, startAt: null, due: nd, col: 'todo', subtasks: (tk.subtasks || []).map(s => ({ ...s, done: false })) }));
      TASKS.push(next);
      tk.done = true; tk.col = 'done'; tk.recur = null;
      setToast('Concluída · próxima ' + dueLabel(nd));
    } else {
      tk.done = done;
      if (done) tk.col = 'done';
      else if (tk.col === 'done') tk.col = 'todo';
    }
    refresh();
  };

  const onCreate = (taskObj) => { TASKS.push(taskObj); setToast('Tarefa criada'); refresh(); };
  const onNew = (partial) => setModal({ kind: 'task', data: { _new: true, ...partial } });
  const openTask = (task) => setModal({ kind: 'task', data: task });

  const saveTask = (data) => {
    const existing = TASKS.find(x => x.id === data.id);
    if (existing) { Object.assign(existing, data); setToast('Tarefa atualizada'); }
    else { TASKS.push(mk(data)); setToast('Tarefa criada'); }
    setModal(null); refresh();
  };
  const deleteTask = (task) => { const i = TASKS.findIndex(x => x.id === task.id); if (i >= 0) TASKS.splice(i, 1); setModal(null); setToast('Tarefa excluída'); refresh(); };

  const saveProject = (proj) => {
    const existing = PROJECTS.find(p => p.id === proj.id);
    if (existing) Object.assign(existing, proj); else PROJECTS.push(proj);
    setModal(null); setToast('Lista salva'); refresh();
  };
  const deleteProject = (proj) => { const i = PROJECTS.findIndex(p => p.id === proj.id); if (i >= 0) { TASKS.forEach(tk => { if (tk.project === proj.id) tk.project = 'inbox'; }); PROJECTS.splice(i, 1); } setModal(null); setToast('Lista excluída · tarefas para o Inbox'); if (route.param === proj.id) navigate('today'); refresh(); };

  const onCheckin = (h, v) => { const hb = HABITS.find(x => x.id === h.id); if (!hb) return; if (v > 0) hb.log[TODAY] = v; else delete hb.log[TODAY]; refresh(); };

  /* ── título da topbar ── */
  const titleFor = () => {
    if (route.view === 'project') { const p = projById(route.param); return { name: p.name, dot: p.color, sub: `${openCount(p.id)} abertas` }; }
    if (route.view === 'filter') { const f = allFilters.find(x => x.id === route.param); return { name: f ? f.name : 'Lista', dot: 'var(--kg)', sub: 'smart list' }; }
    const v = VIEWS_FIXED.find(x => x.view === route.view) || { label: route.view === 'habits' ? 'Hábitos' : 'Kaguya' };
    return { name: v.label, dot: 'var(--kg)', sub: null };
  };
  const tt = titleFor();

  const renderView = () => {
    const shared = { onComplete, onOpen: openTask, onCreate, onUpdate, onInlineSave, onToggleSub, onToast: setToast };
    switch (route.view) {
      case 'today': return <TodayScreen {...shared} />;
      case 'board': return <KanbanScreen onComplete={onComplete} onOpen={openTask} onUpdate={onUpdate} onNew={onNew} onToast={setToast} />;
      case 'calendar': return <CalendarScreen mode={calMode} onOpen={openTask} />;
      case 'eisenhower': return <EisenhowerScreen onOpen={openTask} onUpdate={onUpdate} onToast={setToast} />;
      case 'habits': return <HabitsScreen onCheckin={onCheckin} onToast={setToast} />;
      case 'project': return <ListScreen scope={{ type: 'project', id: route.param, name: projById(route.param).name }} {...shared} />;
      case 'filter': { const f = allFilters.find(x => x.id === route.param); return <ListScreen scope={{ type: 'filter', id: route.param, name: f ? f.name : 'Lista', test: f ? f.test : (() => true) }} {...shared} />; }
      default: return <TodayScreen {...shared} />;
    }
  };

  const navActive = (view, param) => route.view === view && (param === undefined || route.param === param);

  return (
    <div className="kg-app">
      {/* ── Sidebar ── */}
      <aside className="kg-side">
        <div className="side-brand">
          <div className="brand-mark"><img src="kaguya/kaguya.jpg" alt="Kaguya" /></div>
          <div className="brand-text"><div className="brand-name">Kaguya</div><div className="brand-role">Tarefas</div></div>
        </div>
        <button className="side-add" onClick={() => onNew({ project: 'inbox' })}>
          <Icon name="plus" /> <span className="grow">Nova tarefa</span> <kbd>C</kbd>
        </button>

        <nav className="side-nav">
          <div className="nav-group-label"><span>Views</span></div>
          {VIEWS_FIXED.map(v => (
            <button key={v.view} className={'nav-item' + (navActive(v.view) ? ' active' : '')} onClick={() => navigate(v.view)}>
              <Icon name={v.icon} /> <span className="nav-label">{v.label}</span>
            </button>
          ))}

          <div className="nav-group-label"><span>Smart lists</span><span className="add-mini" onClick={() => setModal({ kind: 'filter' })}><Icon name="plus" /></span></div>
          {allFilters.map(f => {
            const n = TASKS.filter(x => !x.done && f.test(x)).length;
            return (
              <button key={f.id} className={'nav-item' + (navActive('filter', f.id) ? ' active' : '')} onClick={() => navigate('filter', f.id)}>
                <Icon name={f.icon} /> <span className="nav-label">{f.name}</span> <span className="nav-count">{n}</span>
              </button>
            );
          })}

          <div className="nav-group-label"><span>Listas</span><span className="add-mini" onClick={() => setModal({ kind: 'project', data: {} })}><Icon name="plus" /></span></div>
          {PROJECTS.filter(p => !p.group).map(p => (
            <button key={p.id} className={'nav-item' + (navActive('project', p.id) ? ' active' : '')} onClick={() => navigate('project', p.id)}>
              <span className="nav-dot" style={{ background: p.color }} /> <span className="nav-label">{p.name}</span> <span className="nav-count">{openCount(p.id)}</span>
            </button>
          ))}
          {GROUPS.map(g => (
            <div key={g.id}>
              <div className="nav-group-label" style={{ paddingTop: 8, fontSize: 8.5 }}><span>{g.name}</span></div>
              {PROJECTS.filter(p => p.group === g.id).map(p => (
                <button key={p.id} className={'nav-item' + (navActive('project', p.id) ? ' active' : '')} onClick={() => navigate('project', p.id)}>
                  <span className="nav-dot" style={{ background: p.color }} /> <span className="nav-label">{p.name}</span> <span className="nav-count">{openCount(p.id)}</span>
                </button>
              ))}
            </div>
          ))}

          <div className="side-divider" />
          <button className={'nav-item' + (navActive('habits') ? ' active' : '')} onClick={() => navigate('habits')}>
            <Icon name="loop" /> <span className="nav-label">Hábitos</span>
          </button>
        </nav>

        <div className="side-foot"><a className="back-makima" href="Makima Diário.html"><span className="dot" /> <span>Voltar à Makima</span></a></div>
      </aside>

      {/* ── Main ── */}
      <main className="kg-main">
        <div className="kg-topbar">
          <span className="topbar-title"><span className="t-dot" style={{ background: tt.dot }} />{tt.name}{tt.sub && <span className="topbar-sub">{tt.sub}</span>}</span>
          <span className="topbar-spacer" />
          {route.view === 'calendar' && (
            <div className="topbar-seg">
              <button className={calMode === 'month' ? 'on' : ''} onClick={() => setCalMode('month')}><Icon name="grid2x2" /> Mês</button>
              <button className={calMode === 'week' ? 'on' : ''} onClick={() => setCalMode('week')}><Icon name="calendar" /> Semana</button>
            </div>
          )}
          <button className="cmdk-btn" onClick={() => setCmdkOpen(true)}><Icon name="search" /> Buscar ou criar <kbd>⌘K</kbd></button>
        </div>

        <div className="kg-scroll" ref={scrollRef}>{renderView()}</div>
      </main>

      {/* ── Modais ── */}
      {modal && modal.kind === 'task' && <TaskModal task={modal.data} onSave={saveTask} onClose={() => setModal(null)} onDelete={deleteTask} />}
      {modal && modal.kind === 'project' && <ProjectModal project={modal.data} onSave={saveProject} onClose={() => setModal(null)} onDelete={deleteProject} />}
      {modal && modal.kind === 'filter' && <FilterModal onSave={(f) => { setUserFilters(u => [...u, f]); setModal(null); setToast('Smart list criada'); navigate('filter', f.id); }} onClose={() => setModal(null)} />}

      <CommandPalette open={cmdkOpen} onClose={() => setCmdkOpen(false)} onNavigate={(v, p) => navigate(v === 'list' ? 'project' : v, p)} onCreateTask={onCreate} onOpenTask={openTask} />

      <Toast message={toast} />

      {/* ── Tweaks ── */}
      <TweaksPanel title="Tweaks">
        <TweakSection label="Aparência" />
        <TweakRadio label="Tema" value={t.tema} options={['Claro', 'Escuro']} onChange={v => setTweak('tema', v)} />
        <TweakColor label="Acento" value={t.acento} options={['#3B82C4', '#EC4899', '#8B5CF6', '#C9A227']} onChange={v => setTweak('acento', v)} />
        <TweakSection label="Lista" />
        <TweakRadio label="Densidade" value={t.densidade} options={['Compacta', 'Confortável']} onChange={v => setTweak('densidade', v)} />
        <TweakRadio label="Marca de prioridade" value={t.marca} options={[{ value: 'bar', label: 'Traço' }, { value: 'dot', label: 'Ponto' }, { value: 'fill', label: 'Fundo' }]} onChange={v => setTweak('marca', v)} />
        <TweakSection label="Movimento" />
        <TweakToggle label="Animações" value={t.animacoes} onChange={v => setTweak('animacoes', v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
