/* ─────────────────────────────────────────────────────────────────────────
   Kaguya · Tarefas — Kanban (board pessoal transversal)
   Drag entre colunas; soltar em "Concluído" completa a tarefa.
   ───────────────────────────────────────────────────────────────────────── */

function KanbanScreen({ onComplete, onOpen, onUpdate, onNew, onToast }) {
  const [projF, setProjF] = React.useState('all');
  const [dragId, setDragId] = React.useState(null);
  const [overCol, setOverCol] = React.useState(null);

  const inScope = (t) => projF === 'all' || t.project === projF;
  const colTasks = (col) => TASKS.filter(t => inScope(t) && t.col === col.id && (col.isDone ? t.done : !t.done))
    .sort((a, b) => col.isDone ? ((b.due || '').localeCompare(a.due || '')) : (a.pos - b.pos));

  const onDragStart = (e, t) => { setDragId(t.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', t.id); };
  const onDropCol = (col) => {
    setOverCol(null);
    const t = TASKS.find(x => x.id === dragId);
    setDragId(null);
    if (!t) return;
    if (col.id === t.col && (col.isDone ? t.done : !t.done)) return;
    if (col.isDone) { onComplete(t, true); onToast('Concluída ✦'); }
    else if (t.done) { onUpdate(t.id, { done: false, col: col.id }); onToast('Reaberta em ' + col.name); }
    else { onUpdate(t.id, { col: col.id }); }
  };

  const projects = PROJECTS.filter(p => TASKS.some(t => t.project === p.id));

  return (
    <div className="page wide">
      <div className="page-head">
        <div><div className="page-title">Kanban</div><div className="page-sub">arraste entre colunas · soltar em Concluído completa</div></div>
      </div>

      <div className="toolbar">
        <div className="chips">
          <span className={'chip' + (projF === 'all' ? ' active' : '')} onClick={() => setProjF('all')}>Todos</span>
          {projects.map(p => <span key={p.id} className={'chip' + (projF === p.id ? ' active' : '')} onClick={() => setProjF(p.id)}><span className="sw" style={{ background: p.color }} />{p.name}</span>)}
        </div>
      </div>

      <div className="board">
        {COLUMNS.map(col => {
          const tasks = colTasks(col);
          return (
            <div key={col.id} className={'kcol' + (overCol === col.id ? ' drop-target' : '')}
                 onDragOver={(e) => { e.preventDefault(); setOverCol(col.id); }}
                 onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOverCol(c => c === col.id ? null : c); }}
                 onDrop={(e) => { e.preventDefault(); onDropCol(col); }}>
              <div className="kcol-head">
                <span className="kc-dot" style={{ background: col.color }} />
                <span className="kc-name">{col.name}</span>
                <span className="kc-count">{tasks.length}</span>
                {col.isDone && <span className="kc-done"><Icon name="check" /></span>}
              </div>
              <div className="kcol-body">
                {tasks.map(t => (
                  <TaskCard key={t.id} task={t} onOpen={onOpen} onDragStart={onDragStart} onDragEnd={() => { setDragId(null); setOverCol(null); }} dragging={dragId === t.id} />
                ))}
                {overCol === col.id && dragId && <div className="kplaceholder" />}
              </div>
              {!col.isDone && <button className="kcol-add" onClick={() => onNew({ col: col.id, project: projF === 'all' ? 'inbox' : projF })}><Icon name="plus" /> Adicionar tarefa</button>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

Object.assign(window, { KanbanScreen });
