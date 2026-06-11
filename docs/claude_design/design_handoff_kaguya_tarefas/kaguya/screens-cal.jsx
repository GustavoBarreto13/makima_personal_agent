/* ─────────────────────────────────────────────────────────────────────────
   Kaguya · Tarefas — Calendar (mês/semana) + Eisenhower (2×2 derivada)
   Recorrentes futuras aparecem como ocorrências virtuais (fantasma).
   ───────────────────────────────────────────────────────────────────────── */

function genGhosts(task, year, month) {
  if (!task.recur || !task.due) return [];
  const out = [];
  const label = task.recur.label || '';
  const inMonth = (d) => d.getFullYear() === year && d.getMonth() === month;
  const WD = { segunda: 1, terça: 2, terca: 2, quarta: 3, quinta: 4, sexta: 5, sábado: 6, sabado: 6, domingo: 0 };
  const mDay = label.match(/dia (\d{1,2})/);
  const mWd = label.match(/toda (\w+)/);
  const mEvery = (task.recur.rule || '').match(/a cada (\d{1,2})/);
  if (mDay) { const d = new Date(year, month, parseInt(mDay[1])); if (inMonth(d) && d2iso(d) !== task.due) out.push(d2iso(d)); }
  else if (mWd && WD[mWd[1]] !== undefined) { const d = new Date(year, month, 1); while (d.getMonth() === month) { if (d.getDay() === WD[mWd[1]] && d2iso(d) !== task.due && d >= iso2d(TODAY)) out.push(d2iso(d)); d.setDate(d.getDate() + 1); } }
  else if (mEvery) { const step = parseInt(mEvery[1]); let d = isoAdd(task.due, step); for (let i = 0; i < 12; i++) { const dd = iso2d(d); if (inMonth(dd)) out.push(d); else if (dd.getMonth() > month || dd.getFullYear() > year) break; d = isoAdd(d, step); } }
  else if (/mensal|todo m[êe]s/.test(label) || /mensal/.test(task.recur.rule || '')) { const day = iso2d(task.due).getDate(); const d = new Date(year, month, day); if (inMonth(d) && d2iso(d) !== task.due) out.push(d2iso(d)); }
  return out;
}

function MonthView({ ref0, onOpen }) {
  const year = ref0.getFullYear(), month = ref0.getMonth();
  const first = new Date(year, month, 1);
  const start = new Date(first); start.setDate(1 - first.getDay());
  const cells = [];
  const cur = new Date(start);
  for (let i = 0; i < 42; i++) { cells.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }

  const ghosts = {};
  TASKS.filter(t => t.recur && !t.done).forEach(t => genGhosts(t, year, month).forEach(iso => { (ghosts[iso] = ghosts[iso] || []).push(t); }));

  return (
    <div className="cal-grid">
      {['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'].map(d => <div key={d} className="cal-dow">{d}</div>)}
      {cells.map((d, i) => {
        const iso = d2iso(d);
        const dim = d.getMonth() !== month;
        const isToday = iso === TODAY;
        const evs = EVENTS.filter(e => e.day === iso);
        const tks = TASKS.filter(t => t.due === iso);
        const gh = ghosts[iso] || [];
        const items = [...evs.map(e => ({ k: 'event', e })), ...tks.map(t => ({ k: 'task', t })), ...gh.map(t => ({ k: 'ghost', t }))];
        return (
          <div key={i} className={'cal-cell' + (dim ? ' dim' : '') + (isToday ? ' today' : '')}>
            <span className="cal-num">{d.getDate()}</span>
            {items.slice(0, 4).map((it, j) => {
              if (it.k === 'event') return <div key={j} className="cal-pill event" title={it.e.title}><span className="cp-tick" style={{ background: 'var(--p-low)' }} />{fmtTime(it.e.start)} {it.e.title}</div>;
              if (it.k === 'ghost') return <div key={j} className="cal-pill task ghost" title={it.t.title + ' (recorrente)'}><Icon name="loop" style={{ width: 9, height: 9 }} />{it.t.title}</div>;
              const t = it.t;
              return <div key={j} className={'cal-pill task' + (t.done ? ' done' : '')} onClick={() => onOpen(t)} title={t.title}><span className="cp-tick" style={{ background: PRIO[t.prio].color || projById(t.project).color }} />{t.title}</div>;
            })}
            {items.length > 4 && <span className="cal-more">+{items.length - 4}</span>}
          </div>
        );
      })}
    </div>
  );
}

function WeekView({ ref0, onOpen }) {
  const start = new Date(ref0); start.setDate(ref0.getDate() - ref0.getDay());
  const days = []; for (let i = 0; i < 7; i++) { const d = new Date(start); d.setDate(start.getDate() + i); days.push(d); }
  const hours = []; for (let h = 7; h <= 22; h++) hours.push(h);
  return (
    <div className="week-grid">
      <div className="week-corner" />
      {days.map((d, i) => <div key={i} className={'week-dayhead' + (d2iso(d) === TODAY ? ' today' : '')}><div className="wd-dow">{DIAS_ABBR[d.getDay()]}</div><div className="wd-num">{d.getDate()}</div></div>)}
      {hours.map(h => (
        <React.Fragment key={h}>
          <div className="week-hourlabel">{String(h).padStart(2, '0')}h</div>
          {days.map((d, i) => {
            const iso = d2iso(d);
            const evs = EVENTS.filter(e => e.day === iso && Math.floor(timeToMin(e.start) / 60) === h);
            const tks = TASKS.filter(t => t.due === iso && t.startAt && Math.floor(timeToMin(t.startAt) / 60) === h);
            return (
              <div key={i} className="week-cell">
                {evs.map(e => <div key={e.id} className="week-ev event" style={{ top: (timeToMin(e.start) % 60) * 0.73, height: Math.max(16, evMin(e) * 0.73 - 2) }} title={e.title}><div className="we-name">{e.title}</div><div className="we-time">{fmtTime(e.start)}</div></div>)}
                {tks.map(t => <div key={t.id} className="week-ev task" style={{ top: (timeToMin(t.startAt) % 60) * 0.73, height: Math.max(16, (t.est || 30) * 0.73 - 2) }} onClick={() => onOpen(t)} title={t.title}><div className="we-name">{t.title}</div></div>)}
              </div>
            );
          })}
        </React.Fragment>
      ))}
    </div>
  );
}

function CalendarScreen({ mode, onOpen }) {
  const [offset, setOffset] = React.useState(0);
  const base = iso2d(TODAY);
  const ref0 = mode === 'week'
    ? (() => { const d = new Date(base); d.setDate(base.getDate() + offset * 7); return d; })()
    : new Date(base.getFullYear(), base.getMonth() + offset, Math.min(base.getDate(), 28));
  const label = mode === 'week'
    ? (() => { const s = new Date(ref0); s.setDate(ref0.getDate() - ref0.getDay()); const e = new Date(s); e.setDate(s.getDate() + 6); return `${s.getDate()} ${MESES_ABBR[s.getMonth()]} – ${e.getDate()} ${MESES_ABBR[e.getMonth()]}`; })()
    : `${MESES_FULL[ref0.getMonth()].replace(/^./, c => c.toUpperCase())} ${ref0.getFullYear()}`;

  return (
    <div className="page wide">
      <div className="page-head">
        <div><div className="page-title">Calendário</div><div className="page-sub">tarefas com data + agenda do Google · recorrentes futuras em fantasma</div></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="sort-btn" onClick={() => setOffset(0)}>Hoje</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button className="sort-btn" style={{ padding: 7 }} onClick={() => setOffset(o => o - 1)}><Icon name="chevL" /></button>
            <span style={{ minWidth: 150, textAlign: 'center', fontWeight: 700, fontFamily: 'var(--sans)', fontSize: 13.5 }}>{label}</span>
            <button className="sort-btn" style={{ padding: 7 }} onClick={() => setOffset(o => o + 1)}><Icon name="chevR" /></button>
          </div>
        </div>
      </div>
      {mode === 'week' ? <WeekView ref0={ref0} onOpen={onOpen} /> : <MonthView ref0={ref0} onOpen={onOpen} />}
    </div>
  );
}

const QUADS = [
  { id: 'q1', name: 'Faça agora', sub: 'Urgente · Importante', mark: 'var(--p-high)', urgent: true, important: true },
  { id: 'q2', name: 'Agende', sub: 'Importante · Não urgente', mark: 'var(--p-med)', urgent: false, important: true },
  { id: 'q3', name: 'Resolva rápido', sub: 'Urgente · Não importante', mark: 'var(--p-low)', urgent: true, important: false },
  { id: 'q4', name: 'Depois', sub: 'Nem urgente · Nem importante', mark: 'var(--ink-4)', urgent: false, important: false },
];

function EisenhowerScreen({ onOpen, onUpdate, onToast }) {
  const [dragId, setDragId] = React.useState(null);
  const [over, setOver] = React.useState(null);
  const bucket = (t) => { const u = !!isUrgent(t), im = !!isImportant(t); return QUADS.find(q => q.urgent === u && q.important === im).id; };
  const tasks = TASKS.filter(t => !t.done);

  const onDrop = (q) => {
    setOver(null);
    const t = TASKS.find(x => x.id === dragId); setDragId(null);
    if (!t) return;
    const patch = {};
    if (q.important && t.prio < 2) patch.prio = 2;
    if (!q.important && t.prio >= 2) patch.prio = 1;
    if (q.urgent && !(t.due && daysBetween(TODAY, t.due) <= 2)) patch.due = isoAdd(TODAY, 1);
    if (!q.urgent && t.due && daysBetween(TODAY, t.due) <= 2) patch.due = isoAdd(TODAY, 5);
    if (Object.keys(patch).length) { onUpdate(t.id, patch); onToast('Movida para “' + q.name + '”'); }
  };

  return (
    <div className="page wide">
      <div className="page-head"><div><div className="page-title">Matriz de Eisenhower</div><div className="page-sub">view derivada de prioridade × urgência · arraste para ajustar</div></div></div>
      <div className="eis-grid">
        {QUADS.map(q => {
          const items = tasks.filter(t => bucket(t) === q.id).sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || (b.prio - a.prio));
          return (
            <div key={q.id} className={'eis-quad eis-' + q.id + (over === q.id ? ' drop-target' : '')}
                 onDragOver={(e) => { e.preventDefault(); setOver(q.id); }}
                 onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(o => o === q.id ? null : o); }}
                 onDrop={(e) => { e.preventDefault(); onDrop(q); }}>
              <div className="eis-quad-head">
                <span className="eq-mark" style={{ background: q.mark }} />
                <div><div className="eq-name">{q.name}</div><div className="eq-sub">{q.sub}</div></div>
                <span className="eq-count">{items.length}</span>
              </div>
              <div className="eis-quad-body">
                {items.length === 0 && <div className="empty" style={{ padding: '24px 0' }}><div className="e-sub">vazio</div></div>}
                {items.map(t => (
                  <div key={t.id} className="kcard" draggable style={{ '--pr-color': PRIO[t.prio].color || 'transparent' }}
                       onDragStart={(e) => { setDragId(t.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', t.id); }}
                       onDragEnd={() => { setDragId(null); setOver(null); }}
                       onClick={() => onOpen(t)}>
                    <div className="kcard-title">{t.title}</div>
                    <div className="kcard-meta">
                      {t.prio > 0 && <PrioFlag level={t.prio} />}
                      {t.due && <DateChip iso={t.due} done={false} />}
                      <span className="tk-est" style={{ marginLeft: 'auto' }}><span className="cp-dot" style={{ display: 'inline-block', width: 7, height: 7, borderRadius: 3, background: projById(t.project).color, marginRight: 4 }} />{projById(t.project).name}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

Object.assign(window, { CalendarScreen, EisenhowerScreen, MonthView, WeekView, genGhosts, QUADS });
