/* ─────────────────────────────────────────────────────────────────────────
   Kaguya · Calendário — CalendarPro
   Orquestra views (dia / semana / mês), estado de eventos e calendários
   (visibilidade + cor), navegação, popover e menu de contexto.
   variant: 'agora' (Notion) · 'helvetico' (Google) · 'editorial' (Kaguya).
   ───────────────────────────────────────────────────────────────────────── */

function weekIsoNum(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
  const ys = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil((((t - ys) / 86400000) + 1) / 7);
}
function weekDays(d) {
  const s = new Date(d); s.setDate(d.getDate() - d.getDay());
  return Array.from({ length: 7 }, (_, i) => { const x = new Date(s); x.setDate(s.getDate() + i); return d2iso(x); });
}

let _newId = 1000;

function CalendarPro({ variant = 'agora', col, view: viewProp = 'week', compact = false }) {
  const colSide = col || (variant === 'helvetico' ? 'left' : 'right');
  const [view, setView] = React.useState(viewProp);
  const [refDate, setRefDate] = React.useState(iso2d(TODAY));
  const [events, setEvents] = React.useState(() => CAL_EVENTS.map(e => ({ ...e })));
  const [cals, setCals] = React.useState(() => CALENDARS.map(c => ({ ...c })));
  const [pop, setPop] = React.useState(null);     // {ev, anchor}
  const [ctx, setCtx] = React.useState(null);     // {ev, x, y}
  const [hint, setHint] = React.useState(true);

  React.useEffect(() => { const id = setTimeout(() => setHint(false), 4200); return () => clearTimeout(id); }, []);

  const calMap = React.useMemo(() => { const m = {}; cals.forEach(c => m[c.id] = c); return m; }, [cals]);
  const calFor = React.useCallback((e) => calMap[e.cal], [calMap]);
  const visibleIds = React.useMemo(() => new Set(cals.filter(c => c.visible).map(c => c.id)), [cals]);

  const days = view === 'week' ? weekDays(refDate) : [d2iso(refDate)];
  const wkIsos = weekDays(refDate);
  const visEvents = events.filter(e => visibleIds.has(e.cal));

  /* ── mutações ── */
  const onChange = (id, patch) => setEvents(es => es.map(e => e.id === id ? { ...e, ...patch } : e));
  const onDelete = (id) => { setEvents(es => es.filter(e => e.id !== id)); setPop(null); setCtx(null); };
  const onDuplicate = (ev) => { const ne = { ...ev, id: 'ce-new-' + (++_newId) }; setEvents(es => [...es, ne]); };
  const onCreate = (partial) => {
    const ne = Object.assign({ id: 'ce-new-' + (++_newId), cal: 'kaguya', title: 'Novo evento', allDay: false, color: null, kind: 'event' }, partial);
    setEvents(es => [...es, ne]);
    setPop({ ev: ne, anchor: { x: window.innerWidth / 2 - 60, y: 150 } });
  };
  const onToggle = (cid) => setCals(cs => cs.map(c => c.id === cid ? { ...c, visible: !c.visible } : c));
  const onRecolor = (cid, color) => setCals(cs => cs.map(c => c.id === cid ? { ...c, color } : c));
  const onAddAccount = () => {
    const used = cals.map(c => c.color);
    const color = CAL_SWATCHES.find(s => !used.includes(s)) || CAL_SWATCHES[0];
    setCals(cs => [...cs, { id: 'new-' + (++_newId), account: 'google', kind: 'integration', name: 'Novo calendário', color, avatar: '+', visible: true }]);
  };

  const gotoToday = () => setRefDate(iso2d(TODAY));
  const nav = (dir) => setRefDate(d => { const x = new Date(d); if (view === 'month') x.setMonth(x.getMonth() + dir); else if (view === 'week') x.setDate(x.getDate() + dir * 7); else x.setDate(x.getDate() + dir); return x; });
  const pickDay = (iso) => { setRefDate(iso2d(iso)); if (view === 'month') setView('day'); };

  /* ── rótulo do topo ── */
  const monthLabel = view === 'month'
    ? `${MESES_FULL[refDate.getMonth()]} ${refDate.getFullYear()}`
    : view === 'week'
      ? `${MESES_FULL[iso2d(days[0]).getMonth()]} ${iso2d(days[0]).getFullYear()}`
      : `${DIAS_FULL[refDate.getDay()]}, ${refDate.getDate()} ${MESES_FULL[refDate.getMonth()]}`;

  /* ── header de dias + faixa all-day (sticky, dentro do scroll) ── */
  const gridCols = `var(--gutter) repeat(${days.length}, minmax(0, 1fr))`;
  const alldayByDay = (iso) => visEvents.filter(e => e.allDay && e.day === iso);
  const stickyTop = (
    <div className="cal-stickytop">
      <div className="cal-dayhead" style={{ gridTemplateColumns: gridCols }}>
        <div className="cdh-corner"><span className="cdh-tz">BRT</span></div>
        {days.map(iso => { const d = iso2d(iso); const isToday = iso === TODAY; return (
          <div key={iso} className={'cdh-day' + (isToday ? ' today' : '')} onClick={() => { setRefDate(d); setView('day'); }}>
            <div className="cdh-dow">{DIAS_ABBR[d.getDay()]}</div>
            <div className="cdh-num">{d.getDate()}</div>
          </div>
        ); })}
      </div>
      <div className="cal-allday" style={{ gridTemplateColumns: gridCols }}>
        <div className="cad-label">todo dia</div>
        {days.map(iso => (
          <div key={iso} className="cad-col">
            {alldayByDay(iso).map(e => { const cc = e.color || (calFor(e) || {}).color; return (
              <div key={e.id} className="cad-pill" style={{ '--cc': cc }}
                   onClick={(ev) => setPop({ ev: e, anchor: ev.currentTarget })}
                   onContextMenu={(ev) => { ev.preventDefault(); setCtx({ ev: e, x: ev.clientX, y: ev.clientY }); }}>{e.title}</div>
            ); })}
          </div>
        ))}
      </div>
    </div>
  );

  const tray = unscheduledForWeek(wkIsos);

  return (
    <div className={'calx'} data-variant={variant} data-col={colSide}>
      {/* barra de navegação */}
      <div className="cal-bar">
        <div className="cal-title">
          <span className="cal-month">{monthLabel}</span>
          {view === 'week' && <span className="cal-week-lbl">Semana {weekIsoNum(iso2d(days[Math.min(4, days.length - 1)]))}</span>}
        </div>
        <div className="cal-nav">
          <button className="cal-iconbtn" onClick={() => nav(-1)}><Icon name="chevL" /></button>
          <button className="cal-iconbtn" onClick={() => nav(1)}><Icon name="chevR" /></button>
        </div>
        <button className="cal-today" onClick={gotoToday}>Hoje</button>
        <span className="cal-spacer" />
        <div className="cal-seg">
          <button className={view === 'day' ? 'on' : ''} onClick={() => setView('day')}>Dia</button>
          <button className={view === 'week' ? 'on' : ''} onClick={() => setView('week')}>Semana</button>
          <button className={view === 'month' ? 'on' : ''} onClick={() => setView('month')}>Mês</button>
        </div>
      </div>

      {/* corpo */}
      <div className="cal-body">
        <div className="cal-stage">
          {view === 'month'
            ? <MonthGrid refDate={refDate} events={visEvents} calFor={calFor} variant={variant}
                         onPickDay={pickDay} onOpen={(e, a) => setPop({ ev: e, anchor: a })} />
            : <TimeGrid days={days} events={visEvents.filter(e => !e.allDay)} variant={variant}
                        todayIso={TODAY} nowMin={NOW_MIN} calFor={calFor} sticky={stickyTop}
                        onChange={onChange} onCreate={onCreate}
                        onOpen={(e, a) => setPop({ ev: e, anchor: a })}
                        onContext={(e, x, y) => setCtx({ ev: e, x, y })} />}
          <div className={'cal-hint' + (hint && view !== 'month' ? ' show' : '')}>Arraste no grid para criar · arraste eventos para mover</div>
        </div>

        <CalendarsAside refDate={refDate} selectedIso={d2iso(refDate)} weekIsos={wkIsos}
                        calendars={cals} tray={tray}
                        onPickDay={pickDay} onToggle={onToggle} onRecolor={onRecolor} onAddAccount={onAddAccount} />
      </div>

      {pop && <EventPopover key={pop.ev.id} ev={events.find(e => e.id === pop.ev.id) || pop.ev} anchor={pop.anchor} calFor={calFor}
                            onClose={() => setPop(null)} onChange={onChange} onDelete={onDelete} />}
      {ctx && <ContextMenu ev={ctx.ev} x={ctx.x} y={ctx.y} calFor={calFor}
                           onClose={() => setCtx(null)} onChange={onChange} onDelete={onDelete} onDuplicate={onDuplicate} />}
    </div>
  );
}

Object.assign(window, { CalendarPro, weekDays, weekIsoNum });
