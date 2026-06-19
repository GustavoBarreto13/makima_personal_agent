/* ─────────────────────────────────────────────────────────────────────────
   Kaguya · Calendário — views auxiliares
   MiniMonth (navegação) · CalendarsAside (bases + integrações, toggle+cor) ·
   MonthGrid · EventPopover · ContextMenu · ColorMenu · TrayCard
   ───────────────────────────────────────────────────────────────────────── */

/* ícones extra para o calendário */
Object.assign(ICONS, {
  eye:    'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  eyeOff: 'M3 3l18 18M10.6 10.6a3 3 0 0 0 4.2 4.2M9.4 5.2A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3 3.8M6.1 6.1A17 17 0 0 0 2 12s3.5 7 10 7a10 10 0 0 0 3-.5',
  copy:   'M9 9h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1z M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1',
  link:   'M9 15l6-6M10 6l1-1a3.5 3.5 0 0 1 5 5l-1 1M14 18l-1 1a3.5 3.5 0 0 1-5-5l1-1',
  paint:  'M12 3a9 9 0 0 0 0 18c1.1 0 1.5-.9 1-1.6-.6-.8-.2-1.9.8-1.9H17a4 4 0 0 0 4-4c0-5-4-9-9-9z M7.5 11.5h.01M11 8h.01M15 9.5h.01',
});

/* ── Mini-mês ───────────────────────────────────────────────────────────── */
function MiniMonth({ refDate, selectedIso, weekIsos, onPick }) {
  const [off, setOff] = React.useState(0);
  React.useEffect(() => { setOff(0); }, [refDate.getFullYear(), refDate.getMonth()]);
  const view = new Date(refDate.getFullYear(), refDate.getMonth() + off, 1);
  const year = view.getFullYear(), month = view.getMonth();
  const first = new Date(year, month, 1);
  const start = new Date(first); start.setDate(1 - first.getDay());
  const cells = []; const cur = new Date(start);
  for (let i = 0; i < 42; i++) { cells.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }
  const wk = new Set(weekIsos);
  return (
    <div className="mini">
      <div className="mini-head">
        <span className="mini-title">{MESES_FULL[month]} {year}</span>
        <span className="mini-nav">
          <button onClick={() => setOff(o => o - 1)}><Icon name="chevL" /></button>
          <button onClick={() => setOff(o => o + 1)}><Icon name="chevR" /></button>
        </span>
      </div>
      <div className="mini-grid">
        {['d', 's', 't', 'q', 'q', 's', 's'].map((d, i) => <div key={i} className="mini-dow">{d}</div>)}
        {cells.map((d, i) => {
          const iso = d2iso(d);
          const inWeek = wk.has(iso);
          const wkArr = [...wk].sort();
          return (
            <div key={i}
                 className={'mini-day' + (d.getMonth() !== month ? ' dim' : '') + (iso === TODAY ? ' today' : '') + (iso === selectedIso ? ' sel' : '') + (inWeek ? ' in-week' : '') + (iso === wkArr[0] ? ' wk-start' : '') + (iso === wkArr[wkArr.length - 1] ? ' wk-end' : '')}
                 onClick={() => onPick(iso)}>{d.getDate()}</div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Card da bandeja de time-blocking ───────────────────────────────────── */
function TrayCard({ item }) {
  const cc = calById('kaguya').color;
  return (
    <div className="cal-tray-card" draggable
         style={{ '--cc': PRIO[item.prio] && PRIO[item.prio].color || cc }}
         onDragStart={(e) => { e.dataTransfer.setData('application/x-kg-task', JSON.stringify(item)); e.dataTransfer.effectAllowed = 'copy'; e.currentTarget.classList.add('dragging'); }}
         onDragEnd={(e) => e.currentTarget.classList.remove('dragging')}>
      <span className="tc-bar" />
      <span className="tc-name">{item.title}</span>
      <span className="tc-est">{fmtEst(item.est)}</span>
    </div>
  );
}

/* ── Barra lateral de calendários ───────────────────────────────────────── */
function CalendarsAside({ refDate, selectedIso, weekIsos, calendars, onPickDay, onToggle, onRecolor, tray, onAddAccount }) {
  const [colorFor, setColorFor] = React.useState(null);
  const groups = CAL_ACCOUNTS.map(a => ({ acct: a, cals: calendars.filter(c => c.account === a.id) }));
  return (
    <aside className="cal-aside">
      <div className="cal-aside-scroll">
        <MiniMonth refDate={refDate} selectedIso={selectedIso} weekIsos={weekIsos} onPick={onPickDay} />

        <div className="cal-srch" style={{ marginTop: 18 }}>
          <Icon name="search" /><input placeholder="Encontrar com…" />
        </div>

        {groups.map(({ acct, cals }) => (
          <div key={acct.id} className="cal-aside-sec">
            <div className="cal-aside-head">
              <span className="cal-acct"><b>{acct.name}</b> · {acct.sub}</span>
              <span className="cal-aside-line" />
            </div>
            {cals.map(c => (
              <div key={c.id} className={'cal-item' + (c.visible ? '' : ' off')} style={{ '--cc': c.color }}>
                <span className="ci-box" onClick={() => onToggle(c.id)}><Icon name="check" /></span>
                <span className="ci-name" onClick={() => onToggle(c.id)}>{c.name}</span>
                {c.primary && <span className="ci-tag">padrão</span>}
                <span className="ci-eye" title="cor" onClick={() => setColorFor(colorFor === c.id ? null : c.id)}><Icon name="paint" /></span>
                <span className="ci-eye" title={c.visible ? 'ocultar' : 'mostrar'} onClick={() => onToggle(c.id)}><Icon name={c.visible ? 'eye' : 'eyeOff'} /></span>
                {colorFor === c.id && (
                  <div className="cal-colors" style={{ flexBasis: '100%', paddingLeft: 27 }}>
                    {CAL_SWATCHES.map(s => (
                      <span key={s} className={'cal-sw' + (s === c.color ? ' sel' : '')} style={{ background: s }} onClick={() => { onRecolor(c.id, s); setColorFor(null); }} />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}

        <button className="cal-addacct" onClick={onAddAccount}><Icon name="plus" /> Adicionar conta de calendário</button>

        {tray.length > 0 && (
          <div className="cal-tray">
            <div className="cal-aside-head"><span className="cal-acct"><b>Sem horário</b> · arraste p/ agendar</span><span className="cal-aside-line" /></div>
            {tray.map(it => <TrayCard key={it.id} item={it} />)}
          </div>
        )}
      </div>
    </aside>
  );
}

/* ── Vista de mês ───────────────────────────────────────────────────────── */
function MonthGrid({ refDate, events, calFor, onPickDay, onOpen, variant }) {
  const year = refDate.getFullYear(), month = refDate.getMonth();
  const first = new Date(year, month, 1);
  const start = new Date(first); start.setDate(1 - first.getDay());
  const weeks = [];
  const cur = new Date(start);
  for (let w = 0; w < 6; w++) { const row = []; for (let i = 0; i < 7; i++) { row.push(new Date(cur)); cur.setDate(cur.getDate() + 1); } weeks.push(row); }
  const byDay = {};
  events.forEach(e => { (byDay[e.day] = byDay[e.day] || []).push(e); });
  Object.values(byDay).forEach(arr => arr.sort((a, b) => (a.allDay ? 0 : 1) - (b.allDay ? 0 : 1) || (timeToMin(a.start) || 0) - (timeToMin(b.start) || 0)));

  return (
    <div className="cmo-grid">
      <div className="cmo-dow-row">
        {['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'].map(d => <div key={d} className="cmo-dow">{d}</div>)}
      </div>
      <div className="cmo-weeks" style={{ gridTemplateRows: `repeat(${weeks.length}, 1fr)` }}>
        {weeks.map((row, wi) => (
          <div key={wi} className="cmo-week">
            {row.map((d, di) => {
              const iso = d2iso(d);
              const items = byDay[iso] || [];
              return (
                <div key={di} className={'cmo-cell' + (d.getMonth() !== month ? ' dim' : '') + (iso === TODAY ? ' today' : '')} onClick={() => onPickDay(iso)}>
                  <div className="cmo-numrow">
                    {di === 0 || d.getDate() === 1 ? <span className="cmo-mname" style={{ marginRight: 'auto', fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--ink-4)', textTransform: 'uppercase' }}>{MESES_ABBR[d.getMonth()]}</span> : null}
                    <span className="cmo-num">{d.getDate()}</span>
                  </div>
                  {items.slice(0, 4).map(e => {
                    const cc = e.color || (calFor(e) || {}).color;
                    return (
                      <div key={e.id} className={'cmo-pill' + (e.allDay ? ' filled' : '')} style={{ '--cc': cc }}
                           onClick={(ev) => { ev.stopPropagation(); onOpen(e, ev.currentTarget); }}>
                        <span className="cp-dot" />{!e.allDay && <span style={{ fontFamily: 'var(--mono)', fontSize: 9, opacity: .8 }}>{fmtTime(e.start)}</span>} {e.title}
                      </div>
                    );
                  })}
                  {items.length > 4 && <span className="cmo-more">+{items.length - 4} mais</span>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Popover de evento ──────────────────────────────────────────────────── */
function anchorStyle(anchor, w = 300, h = 240) {
  const r = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y };
  let left = r.right + 10; if (left + w > window.innerWidth - 12) left = Math.max(12, r.left - w - 10);
  if (left < 12) left = 12;
  let top = r.top; if (top + h > window.innerHeight - 12) top = Math.max(12, window.innerHeight - h - 12);
  return { left, top };
}

function EventPopover({ ev, anchor, calFor, onClose, onChange, onDelete }) {
  const [colorOpen, setColorOpen] = React.useState(false);
  const cal = calFor(ev) || {};
  const cc = ev.color || cal.color;
  const pos = anchorStyle(anchor);
  return (
    <>
      <div className="cal-pop-scrim" onMouseDown={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div className="cal-pop" style={{ ...pos, '--cc': cc }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="cal-pop-bar" />
        <div className="cal-pop-body">
          <div className="cpop-title-row">
            <span className="cpop-swatch" onClick={() => setColorOpen(o => !o)} />
            <input className="cpop-title" defaultValue={ev.title} onBlur={(e) => onChange(ev.id, { title: e.target.value })} />
          </div>
          {colorOpen && (
            <div className="cal-colors">
              {CAL_SWATCHES.map(s => <span key={s} className={'cal-sw' + (s === cc ? ' sel' : '')} style={{ background: s }} onClick={() => { onChange(ev.id, { color: s }); setColorOpen(false); }} />)}
              {ev.color && <span className="cal-sw" title="usar cor do calendário" style={{ background: 'var(--card-2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => { onChange(ev.id, { color: null }); setColorOpen(false); }}><Icon name="loop" style={{ width: 13, height: 13, color: 'var(--ink-3)' }} /></span>}
            </div>
          )}
          <div className="cpop-meta">
            <Icon name="clock" style={{ width: 13, height: 13 }} />
            {ev.allDay ? 'O dia todo' : fmtRange(ev)}
            {ev.loc ? <><span>·</span><Icon name="home" style={{ width: 13, height: 13 }} />{ev.loc}</> : null}
          </div>
          <div className="cpop-cal"><span className="pc-dot" />{cal.name}</div>
          <div className="cpop-actions">
            <button className="cpop-btn" onClick={() => setColorOpen(o => !o)}><Icon name="paint" /> Cor</button>
            <button className="cpop-btn danger" onClick={() => { onDelete(ev.id); onClose(); }}><Icon name="trash" /> Excluir</button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ── Menu de contexto (clique-direito) ──────────────────────────────────── */
function ContextMenu({ ev, x, y, calFor, onClose, onChange, onDelete, onDuplicate }) {
  const cc = ev.color || (calFor(ev) || {}).color;
  const left = Math.min(x, window.innerWidth - 200);
  const top = Math.min(y, window.innerHeight - 230);
  return (
    <>
      <div className="cal-pop-scrim" onMouseDown={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div className="cal-ctx" style={{ left, top }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="cal-ctx-row">
          {CAL_SWATCHES.slice(0, 8).map(s => <span key={s} className={'cal-sw' + (s === cc ? ' sel' : '')} style={{ background: s }} onClick={() => { onChange(ev.id, { color: s }); onClose(); }} />)}
        </div>
        <div className="cal-ctx-sep" />
        <button className="cal-ctx-item" onClick={() => { onDuplicate(ev); onClose(); }}><Icon name="copy" /> Duplicar</button>
        <button className="cal-ctx-item" onClick={() => { onChange(ev.id, { color: null }); onClose(); }}><Icon name="loop" /> Cor do calendário</button>
        <button className="cal-ctx-item danger" onClick={() => { onDelete(ev.id); onClose(); }}><Icon name="trash" /> Excluir</button>
      </div>
    </>
  );
}

Object.assign(window, { MiniMonth, TrayCard, CalendarsAside, MonthGrid, EventPopover, ContextMenu, anchorStyle });
