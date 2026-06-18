/* ─────────────────────────────────────────────────────────────────────────
   Kaguya · Tarefas — componentes
   TaskRow (coração), TaskCard (Kanban), QuickAdd (parser inline),
   CommandPalette (⌘K) e Toast.
   ───────────────────────────────────────────────────────────────────────── */

const ANIM_ON = () => document.querySelector('.kg-app')?.getAttribute('data-anim') !== 'off';

function taskFromParse(p) {
  return mk({
    title: p.title || 'Nova tarefa', project: p.project || 'inbox', prio: p.prio || 0,
    due: p.due, time: p.time, tags: p.tags || [], recur: p.recur || null,
    today: p.due === TODAY, col: p.due === TODAY ? 'week' : 'todo',
  });
}

/* ── Linha de tarefa ────────────────────────────────────────────────────── */
function TaskRow({ task, showProject = true, onComplete, onOpen, onInlineSave, onToggleSub, selected, defaultSubOpen = false }) {
  const [popping, setPopping] = React.useState(false);
  const [completing, setCompleting] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [val, setVal] = React.useState(task.title);
  const [subOpen, setSubOpen] = React.useState(defaultSubOpen && (task.subtasks || []).length > 0);
  const inputRef = React.useRef(null);

  React.useEffect(() => { if (editing && inputRef.current) { inputRef.current.focus(); inputRef.current.select(); } }, [editing]);

  const toggle = () => {
    if (task.done) { onComplete(task, false); return; }
    setPopping(true);
    if (!ANIM_ON()) { onComplete(task, true); return; }
    setTimeout(() => setCompleting(true), 170);
    setTimeout(() => onComplete(task, true), 170 + 260);
  };
  const saveTitle = () => { setEditing(false); if (val.trim() && val !== task.title) onInlineSave && onInlineSave(task, val.trim()); else setVal(task.title); };

  const subs = task.subtasks || [];
  const subDone = subs.filter(s => s.done).length;
  const pr = PRIO[task.prio];

  return (
    <>
      <div className={'task-row' + (completing ? ' completing' : '') + (task.done ? ' done' : '') + (selected ? ' selected' : '')}
           data-prio={task.prio}
           style={{ '--pr-color': pr.color || 'transparent', '--pr-tint': pr.tint || 'transparent' }}
           onClick={() => !editing && onOpen && onOpen(task)}>
        <Check done={task.done} popping={popping} onClick={toggle} />
        <span className="prio-dot" />
        <div className="tk-body">
          <div className="tk-title-row">
            {task.type && task.type !== 'task' && <Icon name={TYPES[task.type].icon} className="tk-type" style={{ color: TYPES[task.type].color }} />}
            {editing
              ? <input ref={inputRef} className="tk-title-input" value={val}
                       onClick={(e) => e.stopPropagation()}
                       onChange={(e) => setVal(e.target.value)}
                       onBlur={saveTitle}
                       onKeyDown={(e) => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') { setVal(task.title); setEditing(false); } }} />
              : <span className="tk-title" onClick={(e) => { e.stopPropagation(); setEditing(true); }}>{task.title}</span>}
            {subs.length > 0 && (
              <span className={'tk-sub-toggle' + (subOpen ? ' open' : '')} onClick={(e) => { e.stopPropagation(); setSubOpen(o => !o); }}>
                <Icon name="chevR" />{subDone}/{subs.length}
              </span>
            )}
            {task.recur && <span className="tk-sub-toggle" title={task.recur.label}><Icon name="loop" /></span>}
          </div>
        </div>
        <div className="tk-meta">
          {task.tags.slice(0, 2).map(t => <TagChip key={t} tag={t} />)}
          {showProject && <ProjChip id={task.project} />}
          {task.due && <DateChip iso={task.due} time={task.time} done={task.done} />}
          {task.est && <span className="tk-est">{fmtEst(task.est)}</span>}
        </div>
      </div>
      {subOpen && subs.map(s => (
        <div key={s.id} className="task-row sub" data-prio={s.prio || 0}
             style={{ '--pr-color': PRIO[s.prio || 0].color || 'transparent', '--pr-tint': PRIO[s.prio || 0].tint || 'transparent' }}
             onClick={(e) => { e.stopPropagation(); onOpen && onOpen(task); }}>
          <Check done={s.done} onClick={() => onToggleSub && onToggleSub(task, s.id)} size={16} />
          <span className="prio-dot" />
          <div className="tk-body">
            <span className="tk-title" style={s.done ? { color: 'var(--ink-4)', textDecoration: 'line-through' } : null}>{s.title}</span>
            {s.notes && <span className="tk-subnote">{s.notes}</span>}
          </div>
          <div className="tk-meta">{(s.prio || 0) > 0 && <PrioFlag level={s.prio} />}</div>
        </div>
      ))}
    </>
  );
}

/* ── Card do Kanban (direção "Vidro") ───────────────────────────────────── */
function ProgressRing({ pct, size = 30, sw = 3, color = 'var(--done)' }) {
  const r = (size - sw) / 2, c = 2 * Math.PI * r, dash = pct * c;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line-2)" strokeWidth={sw} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={sw}
              strokeDasharray={`${dash} ${c - dash}`} strokeLinecap="round" />
    </svg>
  );
}
function TaskCard({ task, onOpen, onDragStart, onDragEnd, dragging }) {
  const pr = PRIO[task.prio];
  const subs = task.subtasks || [];
  const sd = subs.filter(s => s.done).length;
  const p = projById(task.project);
  return (
    <div className={'kcard' + (dragging ? ' dragging' : '') + (task.done ? ' done' : '')} draggable
         style={{ '--pr-color': pr.color || 'transparent' }}
         onDragStart={(e) => onDragStart(e, task)} onDragEnd={onDragEnd}
         onClick={() => onOpen && onOpen(task)}>
      <div className="kcard-body">
        <div className="kcard-title">{task.title}</div>
        <div className="kcard-meta">
          {task.due && <DateChip iso={task.due} time={task.time} done={task.done} />}
          {task.est && !task.done && <span className="kcard-est">{fmtEst(task.est)}</span>}
          <span className="kcard-proj"><i style={{ background: p.color }} /><span>{p.name}</span></span>
        </div>
      </div>
      {task.done
        ? <span className="kcard-done"><Icon name="check" /></span>
        : subs.length > 0
          ? <div className="kcard-ring"><ProgressRing pct={sd / subs.length} /><span className="kr-lbl">{sd}/{subs.length}</span></div>
          : null}
    </div>
  );
}

/* ── Quick-add com parser inline ────────────────────────────────────────── */
function QuickAdd({ defaultProject = 'inbox', onCreate, placeholder = 'Adicionar tarefa…  ex: revisar pipeline sexta 14h #foco !alta', autoFocus }) {
  const [text, setText] = React.useState('');
  const inputRef = React.useRef(null);
  const mirrorRef = React.useRef(null);
  const parsed = React.useMemo(() => text ? parseTask(text) : null, [text]);

  React.useEffect(() => { if (autoFocus && inputRef.current) inputRef.current.focus(); }, [autoFocus]);
  const sync = () => { if (mirrorRef.current && inputRef.current) mirrorRef.current.scrollLeft = inputRef.current.scrollLeft; };

  const submit = () => {
    if (!parsed || !parsed.title) return;
    const t = taskFromParse(parsed);
    if (t.project === 'inbox' && defaultProject !== 'inbox') t.project = defaultProject;
    onCreate(t);
    setText('');
  };

  return (
    <div className="quick-add">
      <span className="qa-check" />
      <div className="qa-wrap">
        {text
          ? <ParseMirror segments={parsed.segments} />
          : null}
        <input ref={inputRef} className="qa-input" value={text} placeholder={placeholder}
               style={text ? null : { color: 'var(--ink)' }}
               onChange={(e) => { setText(e.target.value); requestAnimationFrame(sync); }}
               onScroll={sync}
               onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }} />
      </div>
      {parsed && (parsed.due || parsed.prio > 0 || parsed.project !== 'inbox') && (
        <div className="qa-preview">
          {parsed.project !== 'inbox' && <ProjChip id={parsed.project} />}
          {parsed.due && <DateChip iso={parsed.due} time={parsed.time} />}
          {parsed.prio > 0 && <PrioFlag level={parsed.prio} />}
        </div>
      )}
      <button className="qa-save" disabled={!parsed || !parsed.title} onClick={submit}>
        <Icon name="plus" /> Adicionar <kbd>↵</kbd>
      </button>
    </div>
  );
}

/* ── Command Palette (⌘K) ───────────────────────────────────────────────── */
const NAV_COMMANDS = [
  { view: 'today', label: 'Ir para Meu Dia', icon: 'sun' },
  { view: 'list', label: 'Ir para Lista', icon: 'list' },
  { view: 'board', label: 'Ir para Kanban', icon: 'board' },
  { view: 'calendar', label: 'Ir para Calendário', icon: 'calendar' },
  { view: 'eisenhower', label: 'Ir para Matriz de Eisenhower', icon: 'grid2x2' },
  { view: 'habits', label: 'Ir para Hábitos', icon: 'loop' },
];

function CommandPalette({ open, onClose, onNavigate, onCreateTask, onOpenTask }) {
  const [text, setText] = React.useState('');
  const [active, setActive] = React.useState(0);
  const inputRef = React.useRef(null);
  const mirrorRef = React.useRef(null);
  const listRef = React.useRef(null);
  const parsed = React.useMemo(() => text ? parseTask(text) : null, [text]);

  React.useEffect(() => { if (open) { setText(''); setActive(0); setTimeout(() => inputRef.current && inputRef.current.focus(), 30); } }, [open]);

  const items = React.useMemo(() => {
    const out = [];
    const q = text.trim().toLowerCase();
    if (q) {
      out.push({ kind: 'create', label: parsed.title || text });
      const taskHits = TASKS.filter(t => !t.done && t.title.toLowerCase().includes(q)).slice(0, 5);
      taskHits.forEach(t => out.push({ kind: 'task', task: t }));
      PROJECTS.filter(p => p.name.toLowerCase().includes(q)).slice(0, 3).forEach(p => out.push({ kind: 'project', proj: p }));
      NAV_COMMANDS.filter(c => c.label.toLowerCase().includes(q)).forEach(c => out.push({ kind: 'nav', cmd: c }));
    } else {
      NAV_COMMANDS.forEach(c => out.push({ kind: 'nav', cmd: c }));
    }
    return out;
  }, [text, parsed]);

  React.useEffect(() => { setActive(0); }, [text]);

  const exec = (it) => {
    if (!it) return;
    if (it.kind === 'create') { onCreateTask(taskFromParse(parsed)); }
    else if (it.kind === 'task') { onOpenTask(it.task); }
    else if (it.kind === 'project') { onNavigate('list', it.proj.id); }
    else if (it.kind === 'nav') { onNavigate(it.cmd.view); }
    onClose();
  };

  const sync = () => { if (mirrorRef.current && inputRef.current) mirrorRef.current.scrollLeft = inputRef.current.scrollLeft; };

  if (!open) return null;
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(items.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); exec(items[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  let idx = -1;
  return (
    <div className="cmdk-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cmdk">
        <div className="cmdk-input-wrap">
          <Icon name="search" />
          <div className="cmdk-field-wrap">
            {text ? <div className="cmdk-mirror" ref={mirrorRef} aria-hidden="true">{parsed.segments.map((s, i) => s.cls ? <span key={i} className={s.cls}>{s.text}</span> : <span key={i}>{s.text}</span>)}</div> : null}
            <input ref={inputRef} className={'cmdk-input' + (text ? '' : ' plain')} value={text}
                   placeholder="Criar, buscar ou navegar…  ex: ligar pro dentista amanhã !alta"
                   onChange={(e) => { setText(e.target.value); requestAnimationFrame(sync); }}
                   onScroll={sync} onKeyDown={onKey} />
          </div>
          <span className="cmdk-esc">esc</span>
        </div>
        <div className="cmdk-results" ref={listRef}>
          {text && (
            <>
              <div className="cmdk-group-label">Criar</div>
              {(() => { idx++; const a = idx === active; return (
                <div className={'cmdk-create' + (a ? ' active' : '')} onMouseEnter={() => setActive(idx)} onClick={() => exec(items[idx])}>
                  <span className="cc-plus"><Icon name="plus" /></span>
                  <div className="ci-body">
                    <div className="ci-title">Criar “{parsed.title || text}”</div>
                    <div className="ci-sub">{[parsed.project !== 'inbox' ? projById(parsed.project).name : 'Inbox', parsed.due && dueLabel(parsed.due), parsed.prio > 0 && PRIO[parsed.prio].name].filter(Boolean).join(' · ')}</div>
                  </div>
                  <span className="ci-kbd">↵</span>
                </div>
              ); })()}
            </>
          )}
          {items.some(i => i.kind === 'task') && <div className="cmdk-group-label">Tarefas</div>}
          {items.map((it) => {
            if (it.kind !== 'task') return null;
            idx++; const a = idx === active; const myIdx = idx;
            return (
              <div key={'t' + it.task.id} className={'cmdk-item' + (a ? ' active' : '')} onMouseEnter={() => setActive(myIdx)} onClick={() => exec(it)}>
                <span className="ci-icon" style={{ background: projById(it.task.project).color.replace(')', ' / 0.16)'), color: projById(it.task.project).color }}><Icon name={projById(it.task.project).icon} /></span>
                <div className="ci-body"><div className="ci-title">{it.task.title}</div><div className="ci-sub">{projById(it.task.project).name}{it.task.due ? ' · ' + dueLabel(it.task.due) : ''}</div></div>
              </div>
            );
          })}
          {items.some(i => i.kind === 'project') && <div className="cmdk-group-label">Projetos</div>}
          {items.map((it) => {
            if (it.kind !== 'project') return null;
            idx++; const a = idx === active; const myIdx = idx;
            return (
              <div key={'p' + it.proj.id} className={'cmdk-item' + (a ? ' active' : '')} onMouseEnter={() => setActive(myIdx)} onClick={() => exec(it)}>
                <span className="ci-icon" style={{ background: it.proj.color.replace(')', ' / 0.16)'), color: it.proj.color }}><Icon name={it.proj.icon} /></span>
                <div className="ci-body"><div className="ci-title">{it.proj.name}</div><div className="ci-sub">{openCount(it.proj.id)} abertas</div></div>
              </div>
            );
          })}
          {items.some(i => i.kind === 'nav') && <div className="cmdk-group-label">Navegar</div>}
          {items.map((it) => {
            if (it.kind !== 'nav') return null;
            idx++; const a = idx === active; const myIdx = idx;
            return (
              <div key={'n' + it.cmd.view} className={'cmdk-item' + (a ? ' active' : '')} onMouseEnter={() => setActive(myIdx)} onClick={() => exec(it)}>
                <Icon name={it.cmd.icon} />
                <div className="ci-body"><div className="ci-title">{it.cmd.label}</div></div>
              </div>
            );
          })}
        </div>
        <div className="cmdk-foot">
          <span className="cf-hint"><kbd>↑</kbd><kbd>↓</kbd> navegar</span>
          <span className="cf-hint"><kbd>↵</kbd> selecionar</span>
          <span className="cf-hint"><kbd>esc</kbd> fechar</span>
        </div>
      </div>
    </div>
  );
}

/* ── Toast ──────────────────────────────────────────────────────────────── */
function Toast({ message, action, onAction }) {
  if (!message) return null;
  return (
    <div className="toast">
      <Icon name="check" /><span>{message}</span>
      {action && <span className="toast-action" onClick={onAction}>{action}</span>}
    </div>
  );
}

Object.assign(window, { TaskRow, TaskCard, QuickAdd, CommandPalette, Toast, taskFromParse, NAV_COMMANDS, ANIM_ON });
