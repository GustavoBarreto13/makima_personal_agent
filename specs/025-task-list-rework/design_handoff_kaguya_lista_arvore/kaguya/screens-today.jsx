/* ─────────────────────────────────────────────────────────────────────────
   Kaguya · Tarefas — Hoje / Meu Dia (ritual Sunsama + capacity + time-block)
   Três momentos: revisar ontem → planejar hoje → ver se cabe.
   ───────────────────────────────────────────────────────────────────────── */

const DAY_START = 7, DAY_END = 23;          // janela do dia na timeline
const FREE_WINDOW = (22 - 8) * 60;          // capacidade "livre" base: 8h–22h

function evMin(e) { return timeToMin(e.end) - timeToMin(e.start); }

function CapacityBar({ todayTasks }) {
  const events = EVENTS.filter(e => e.day === TODAY);
  const eventsMin = events.reduce((a, e) => a + evMin(e), 0);
  const tasksMin = todayTasks.reduce((a, t) => a + (t.est || 0), 0);
  const free = Math.max(0, FREE_WINDOW - eventsMin);
  const total = eventsMin + tasksMin;
  const over = Math.max(0, total - FREE_WINDOW);
  const evPct = (eventsMin / FREE_WINDOW) * 100;
  const tkPct = (Math.min(tasksMin, free) / FREE_WINDOW) * 100;
  const ovPct = (over / FREE_WINDOW) * 100;
  return (
    <div className="capacity">
      <div className="cap-head">
        <span className="cap-title">Cabe no seu dia?</span>
        <span className="cap-nums">
          <b>{fmtEst(tasksMin) || '0min'}</b> de tarefas + {fmtEst(eventsMin) || '0min'} de agenda
          {over > 0 ? <span className="over"> · passou {fmtEst(over)}</span> : <span> · livre {fmtEst(Math.max(0, free - tasksMin)) || '0min'}</span>}
        </span>
      </div>
      <div className="cap-track">
        <div className="cap-seg events" style={{ width: evPct + '%' }} />
        <div className="cap-seg tasks" style={{ width: tkPct + '%' }} />
        {ovPct > 0 && <div className="cap-seg tasksover" style={{ width: Math.min(ovPct, 100 - evPct - tkPct) + '%' }} />}
        <div className="cap-marker" style={{ left: '100%' }} title="limite do dia" />
      </div>
      <div className="cap-legend">
        <span><i className="cap-seg events" style={{ display: 'inline-block', width: 10, height: 10 }} /> Agenda</span>
        <span><i style={{ background: 'var(--kg)' }} /> Tarefas</span>
        {over > 0 && <span style={{ color: 'var(--p-high)' }}><i style={{ background: 'var(--p-high)' }} /> Excedeu</span>}
      </div>
    </div>
  );
}

function DayTimeline({ todayTasks, onDropTask, onOpen }) {
  const [dragOver, setDragOver] = React.useState(null);
  const events = EVENTS.filter(e => e.day === TODAY);
  const blocked = todayTasks.filter(t => t.startAt);
  const hours = [];
  for (let h = DAY_START; h <= DAY_END; h++) hours.push(h);
  const slotFor = (h) => {
    const evs = events.filter(e => Math.floor(timeToMin(e.start) / 60) === h);
    const tks = blocked.filter(t => Math.floor(timeToMin(t.startAt) / 60) === h);
    return { evs, tks };
  };
  return (
    <div className="daycol">
      <div className="daycol-head">
        <span className="dc-title">Hoje</span>
        <span className="dc-date">{DIAS_FULL[iso2d(TODAY).getDay()]} · {iso2d(TODAY).getDate()} {MESES_ABBR[iso2d(TODAY).getMonth()]}</span>
      </div>
      <div className="timeline">
        {hours.map(h => {
          const { evs, tks } = slotFor(h);
          return (
            <div key={h} className={'tl-hour' + (dragOver === h ? ' drop-ok' : '')}
                 onDragOver={(e) => { e.preventDefault(); setDragOver(h); }}
                 onDragLeave={() => setDragOver(d => d === h ? null : d)}
                 onDrop={(e) => { e.preventDefault(); setDragOver(null); const id = e.dataTransfer.getData('text/plain'); if (id) onDropTask(id, minToTime(h * 60)); }}>
              <span className="tl-label">{String(h).padStart(2, '0')}:00</span>
              <div className="tl-dropzone" />
              {evs.map(e => (
                <div key={e.id} className="tl-slot event" style={{ top: 2 + (timeToMin(e.start) % 60) * 0.8, height: Math.max(20, evMin(e) * 0.8 - 4) }}>
                  <div className="ts-name">{e.title}</div><div className="ts-time">{fmtTime(e.start)}–{fmtTime(e.end)}</div>
                </div>
              ))}
              {tks.map(t => (
                <div key={t.id} className="tl-slot task" style={{ top: 2 + (timeToMin(t.startAt) % 60) * 0.8, height: Math.max(20, (t.est || 30) * 0.8 - 4) }} onClick={() => onOpen(t)}>
                  <div className="ts-name">{t.title}</div><div className="ts-time">{fmtTime(t.startAt)} · {fmtEst(t.est || 30)}</div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TodayScreen({ onComplete, onOpen, onCreate, onUpdate, onInlineSave, onToggleSub, onToast }) {
  const todayTasks = TASKS.filter(t => t.today && !t.done);
  const overdue = TASKS.filter(t => !t.done && t.due && daysBetween(TODAY, t.due) < 0);
  const suggestions = TASKS.filter(t => !t.done && !t.today && t.due && daysBetween(TODAY, t.due) >= 0 && daysBetween(TODAY, t.due) <= 7);
  const totalEst = todayTasks.reduce((a, t) => a + (t.est || 0), 0);
  const eventsMin = EVENTS.filter(e => e.day === TODAY).reduce((a, e) => a + evMin(e), 0);
  const over = Math.max(0, totalEst + eventsMin - FREE_WINDOW);
  const folga = Math.max(0, FREE_WINDOW - eventsMin - totalEst);

  const onDragStart = (e, id) => { e.dataTransfer.setData('text/plain', id); e.dataTransfer.effectAllowed = 'move'; };
  const dropTask = (id, time) => { onUpdate(id, { startAt: time, time, today: true }); onToast('Tarefa agendada para ' + fmtTime(time)); };

  return (
    <div className="page">
      <div className="day-hero">
        <div className="day-hero-copy">
          <div className="day-hero-eyebrow">Meu Dia · {greet()}</div>
          <div className="day-hero-title">{DIAS_FULL[iso2d(TODAY).getDay()].replace(/^./, c => c.toUpperCase())}, {iso2d(TODAY).getDate()} de {MESES_FULL[iso2d(TODAY).getMonth()]}</div>
          <div className="day-hero-sub">{todayTasks.length > 0 ? <>Seu plano soma <b>{fmtEst(totalEst) || '0min'}</b> com <b>{fmtEst(eventsMin) || '0min'}</b> de agenda.</> : 'Dia em branco — escolha o que importa.'} {overdue.length > 0 ? <>Há <b>{overdue.length} de ontem</b> esperando decisão.</> : 'Nada pendente de ontem.'}</div>
          <div className="day-hero-meta">
            <div className="dhm"><span className="dhm-v">{todayTasks.length}</span><span className="dhm-k">no plano</span></div>
            <div className="dhm-sep" />
            <div className="dhm"><span className="dhm-v">{fmtEst(totalEst) || '0min'}</span><span className="dhm-k">estimado</span></div>
            <div className="dhm-sep" />
            <div className="dhm"><span className={'dhm-v' + (over > 0 ? ' over' : '')}>{over > 0 ? '+' + fmtEst(over) : fmtEst(folga) || '0min'}</span><span className="dhm-k">{over > 0 ? 'acima' : 'de folga'}</span></div>
          </div>
        </div>
        <div className="day-hero-photo"><img src="kaguya/kaguya.jpg" alt="Kaguya" /></div>
      </div>

      <div className="day-grid">
        <div>
          {overdue.length > 0 && (
            <div className="section" style={{ marginTop: 16 }}>
              <div className="review-head">
                <span className="rh-icon"><Icon name="reschedule" /></span>
                <span className="rh-title">Pendências de ontem</span>
                <span className="rh-sub">{overdue.length} esperando decisão</span>
              </div>
              {overdue.map(t => (
                <div key={t.id} className="review-card">
                  <Check done={false} onClick={() => onComplete(t, true)} />
                  <div className="rc-body">
                    <div className="rc-name">{t.title}</div>
                    <div className="rc-meta">venceu {dueLabel(t.due)} · {projById(t.project).name}</div>
                  </div>
                  <div className="review-actions">
                    <button className="rc-act primary" onClick={() => { onUpdate(t.id, { due: TODAY, today: true }); onToast('Trazida para hoje'); }}>Hoje</button>
                    <button className="rc-act" onClick={() => { onUpdate(t.id, { due: isoAdd(TODAY, 1) }); onToast('Reagendada para amanhã'); }}>Amanhã</button>
                    <button className="rc-act" onClick={() => { onUpdate(t.id, { today: false, due: isoAdd(TODAY, 7) }); onToast('Empurrada'); }}>Depois</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="section" style={{ marginTop: overdue.length > 0 ? 24 : 16 }}>
            <QuickAdd defaultProject="inbox" onCreate={(t) => { t.today = true; t.due = t.due || TODAY; onCreate(t); }} placeholder="Adicionar ao dia…  ex: escrever resumo 16h #foco !alta" />
            <div className="section-head" style={{ marginTop: 20 }}><span className="section-title">No plano de hoje</span><span className="section-sub">arraste para um horário →</span></div>
            {todayTasks.length === 0 ? <div className="empty"><Icon name="sun" /><div className="e-title">Dia em branco</div><div className="e-sub">Puxe sugestões abaixo ou adicione algo.</div></div>
              : <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {todayTasks.map(t => (
                  <div key={t.id} className="plan-card" draggable style={{ '--pr-color': PRIO[t.prio].color || 'var(--line)' }}
                       onDragStart={(e) => onDragStart(e, t.id)} onClick={() => onOpen(t)}>
                    <Check done={false} onClick={() => onComplete(t, true)} size={18} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="tk-title" style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>{t.type && t.type !== 'task' && <Icon name={TYPES[t.type].icon} style={{ width: 13, height: 13, color: TYPES[t.type].color, flexShrink: 0 }} />}<span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span></div>
                      <div style={{ display: 'flex', gap: 7, marginTop: 2 }}>{t.startAt && <span className="chip-date today"><Icon name="clock" />{fmtTime(t.startAt)}</span>}<ProjChip id={t.project} /></div>
                    </div>
                    {t.est && <span className="pc-est">{fmtEst(t.est)}</span>}
                  </div>
                ))}
              </div>}

            {suggestions.length > 0 && (
              <>
                <div className="section-head" style={{ marginTop: 24 }}><span className="section-title">Sugestões</span><span className="section-sub">vencem em breve</span></div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {suggestions.slice(0, 5).map(t => (
                    <div key={t.id} className="plan-card" style={{ '--pr-color': PRIO[t.prio].color || 'var(--line)' }} onClick={() => onOpen(t)}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="tk-title" style={{ fontSize: 13 }}>{t.title}</div>
                        <div style={{ display: 'flex', gap: 7, marginTop: 2 }}><DateChip iso={t.due} done={false} /><ProjChip id={t.project} /></div>
                      </div>
                      <button className="rc-act primary" onClick={(e) => { e.stopPropagation(); onUpdate(t.id, { today: true }); onToast('Adicionada ao dia'); }}>+ Puxar</button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: 12 }}>
          <CapacityBar todayTasks={todayTasks} />
          <DayTimeline todayTasks={todayTasks} onDropTask={dropTask} onOpen={onOpen} />
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { TodayScreen, CapacityBar, DayTimeline, evMin });
