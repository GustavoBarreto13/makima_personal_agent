/* ─────────────────────────────────────────────────────────────────────────
   Kaguya · Calendário — motor do grid de horas (semana / dia)
   Ponteiro-baseado: arrastar p/ mover, redimensionar pela borda, arrastar no
   vazio p/ criar. Aceita drop de tarefas da bandeja (HTML5 DnD → time-block).
   Layout em % de 24h (independe da altura da hora → funciona em qualquer zoom).
   ───────────────────────────────────────────────────────────────────────── */

const MINS_DAY = 1440;
const HOURS = Array.from({ length: 24 }, (_, h) => h);

/* layout de pistas p/ eventos sobrepostos num dia */
function layoutDay(evs) {
  const res = {};
  const sorted = [...evs].sort((a, b) => timeToMin(a.start) - timeToMin(b.start) || timeToMin(b.end) - timeToMin(a.end));
  let cluster = [], clusterEnd = -1;
  const flush = () => {
    const lanes = [];
    cluster.forEach(e => {
      let placed = -1;
      for (let i = 0; i < lanes.length; i++) { if (lanes[i] <= timeToMin(e.start)) { placed = i; break; } }
      if (placed < 0) { placed = lanes.length; lanes.push(0); }
      lanes[placed] = timeToMin(e.end);
      res[e.id] = { lane: placed };
    });
    const n = lanes.length;
    cluster.forEach(e => { res[e.id].lanes = n; });
    cluster = []; clusterEnd = -1;
  };
  sorted.forEach(e => {
    const s = timeToMin(e.start);
    if (cluster.length && s >= clusterEnd) flush();
    cluster.push(e); clusterEnd = Math.max(clusterEnd, timeToMin(e.end));
  });
  flush();
  return res;
}

function colMinAt(colEl, clientY) {
  const r = colEl.getBoundingClientRect();
  const scale = r.height / colEl.offsetHeight || 1;
  return ((clientY - r.top) / scale) / colEl.offsetHeight * MINS_DAY;
}

function TimeGrid({ days, events, variant, todayIso, nowMin, onChange, onCreate, onOpen, onContext, calFor, sticky }) {
  const colRefs = React.useRef([]);
  const scrollRef = React.useRef(null);
  const [drag, setDrag] = React.useState(null);    // {id?, mode, day, start, end, dur, grabOff, moved}
  const dragRef = React.useRef(null);
  dragRef.current = drag;

  /* scroll inicial para ~7h */
  React.useLayoutEffect(() => {
    const el = scrollRef.current; if (!el) return;
    const go = () => { if (el.scrollHeight > el.clientHeight) el.scrollTop = el.scrollHeight * (7 / 24); };
    requestAnimationFrame(go);
    const t1 = setTimeout(go, 80); const t2 = setTimeout(go, 240);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  const dayIndexAt = (clientX) => {
    let best = 0, bestD = Infinity;
    colRefs.current.forEach((el, i) => { if (!el) return; const r = el.getBoundingClientRect(); if (clientX >= r.left && clientX < r.right) { best = i; bestD = -1; } else { const d = Math.min(Math.abs(clientX - r.left), Math.abs(clientX - r.right)); if (d < bestD) { bestD = d; best = i; } } });
    return best;
  };

  const endDrag = () => {
    const d = dragRef.current;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    if (!d) { setDrag(null); return; }
    if (d.mode === 'move') {
      if (!d.moved && d.id) { const ev = events.find(e => e.id === d.id); const el = colRefs.current[days.indexOf(d.day)]; onOpen && onOpen(ev, el); }
      else if (d.id) onChange(d.id, { day: d.day, start: minToTime(d.start), end: minToTime(d.start + d.dur) });
    } else if (d.mode === 'resize' && d.id) {
      onChange(d.id, { end: minToTime(d.end) });
    } else if (d.mode === 'create') {
      const a = Math.min(d.start, d.end), b = Math.max(d.start, d.end);
      const start = a, end = Math.max(a + 30, b);
      onCreate({ day: d.day, start: minToTime(start), end: minToTime(end) });
    }
    setDrag(null);
  };
  const onMove = (e) => {
    const d = dragRef.current; if (!d) return;
    const idx = dayIndexAt(e.clientX); const col = colRefs.current[idx]; if (!col) return;
    const m = colMinAt(col, e.clientY);
    if (d.mode === 'move') setDrag({ ...d, day: days[idx], start: Math.max(0, Math.min(MINS_DAY - d.dur, snapMin(m - d.grabOff))), moved: true });
    else if (d.mode === 'resize') setDrag({ ...d, end: Math.max(d.start + 15, snapMin(m)), moved: true });
    else if (d.mode === 'create') setDrag({ ...d, end: snapMin(m), moved: true });
  };
  const onUp = () => endDrag();
  const arm = () => { window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp); };

  const startMove = (e, ev) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const col = colRefs.current[days.indexOf(ev.day)]; if (!col) return;
    const m = colMinAt(col, e.clientY); const s = timeToMin(ev.start);
    setDrag({ id: ev.id, mode: 'move', day: ev.day, start: s, dur: timeToMin(ev.end) - s, grabOff: m - s, moved: false });
    arm();
  };
  const startResize = (e, ev) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    setDrag({ id: ev.id, mode: 'resize', day: ev.day, start: timeToMin(ev.start), end: timeToMin(ev.end), moved: false });
    arm();
  };
  const startCreate = (e, dayIso) => {
    if (e.button !== 0) return;
    const col = colRefs.current[days.indexOf(dayIso)]; if (!col) return;
    const m = snapMin(colMinAt(col, e.clientY));
    setDrag({ mode: 'create', day: dayIso, start: m, end: m + 60, moved: false });
    arm();
  };

  /* drop de tarefa da bandeja */
  const onDropCol = (e, dayIso) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData('application/x-kg-task'); if (!raw) return;
    const t = JSON.parse(raw); const col = colRefs.current[days.indexOf(dayIso)]; if (!col) return;
    const start = snapMin(colMinAt(col, e.clientY));
    onCreate({ day: dayIso, start: minToTime(start), end: minToTime(Math.min(MINS_DAY, start + (t.est || 30))), title: t.title, cal: 'kaguya', kind: 'task', taskId: t.taskId });
  };

  const gridCols = `var(--gutter) repeat(${days.length}, minmax(0, 1fr))`;
  const layouts = days.map(d => layoutDay(events.filter(e => e.day === d)));

  return (
    <div className="cal-scroll" ref={scrollRef}>
      {sticky}
      <div className="cal-grid" style={{ gridTemplateColumns: gridCols, height: 'calc(24 * var(--hh))' }}>
        {/* gutter de horas */}
        <div className="cg-gutter">
          {HOURS.map(h => h === 0 ? null : (
            <span key={h} className="cg-hourlabel" style={{ top: `${(h / 24) * 100}%` }}>{String(h).padStart(2, '0')}:00</span>
          ))}
          {days.includes(todayIso) && <span className="cg-hourlabel" style={{ top: `${(nowMin / MINS_DAY) * 100}%`, color: 'var(--p-high)', fontWeight: 700 }}>{minToTime(nowMin)}</span>}
        </div>

        {/* colunas dos dias */}
        {days.map((dayIso, i) => {
          const isToday = dayIso === todayIso;
          const lay = layouts[i];
          const dayEvents = events.filter(e => e.day === dayIso);
          return (
            <div key={dayIso} ref={el => colRefs.current[i] = el}
                 className={'cg-col' + (isToday ? ' today-col' : '')}
                 style={{ backgroundImage: 'repeating-linear-gradient(to bottom, var(--line-2) 0 1px, transparent 1px calc(var(--hh)))' }}
                 onPointerDown={(e) => { if (e.target === e.currentTarget) startCreate(e, dayIso); }}
                 onDragOver={(e) => e.preventDefault()}
                 onDrop={(e) => onDropCol(e, dayIso)}
                 onContextMenu={(e) => e.preventDefault()}>

              {dayEvents.map(ev => {
                const moving = drag && drag.id === ev.id;
                const s = moving && drag.mode === 'move' ? drag.start : timeToMin(ev.start);
                const en = moving && drag.mode === 'move' ? drag.start + drag.dur : (moving && drag.mode === 'resize' ? drag.end : timeToMin(ev.end));
                const dur = en - s;
                const L = lay[ev.id] || { lane: 0, lanes: 1 };
                const gap = 3;
                const cc = (calFor(ev) || {}).color;
                const tiny = dur <= 30;
                return (
                  <div key={ev.id}
                       className={'cg-event' + (ev.kind === 'task' ? ' task' : '') + (moving ? ' dragging' : '') + (tiny ? ' tiny' : '')}
                       style={{
                         '--cc': ev.color || cc,
                         top: `${(s / MINS_DAY) * 100}%`,
                         height: `calc(${(dur / MINS_DAY) * 100}% - 2px)`,
                         left: `calc(${(L.lane / L.lanes) * 100}% + ${L.lane ? gap : 2}px)`,
                         width: `calc(${(1 / L.lanes) * 100}% - ${gap + 3}px)`,
                       }}
                       onPointerDown={(e) => startMove(e, ev)}
                       onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onContext && onContext(ev, e.clientX, e.clientY); }}>
                    <div className="ce-title">{ev.title}</div>
                    {!tiny && <div className="ce-time">{fmtRange({ start: minToTime(s), end: minToTime(en) })}</div>}
                    {tiny && <div className="ce-time">{fmtTime(minToTime(s))}</div>}
                    {!tiny && ev.loc && <div className="ce-loc">{ev.loc}</div>}
                    <div className="cg-resize" onPointerDown={(e) => startResize(e, ev)} />
                  </div>
                );
              })}

              {/* fantasma de criação */}
              {drag && drag.mode === 'create' && drag.day === dayIso && (() => {
                const a = Math.min(drag.start, drag.end), b = Math.max(drag.start, drag.end);
                return <div className="cg-ghost" style={{ top: `${(a / MINS_DAY) * 100}%`, height: `${((Math.max(b, a + 30) - a) / MINS_DAY) * 100}%` }}>
                  <div className="gh-time">{minToTime(a)}–{minToTime(Math.max(b, a + 30))}</div>
                </div>;
              })()}

              {/* now-line */}
              {isToday && (
                <div className="cg-now" style={{ top: `${(nowMin / MINS_DAY) * 100}%` }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

Object.assign(window, { TimeGrid, layoutDay, MINS_DAY });
