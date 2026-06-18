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
        <div className="kcols">
        {COLUMNS.map(col => {
          const tasks = colTasks(col);
          const colEst = tasks.reduce((s, t) => s + (t.est || 0), 0);
          const segOn = col.isDone ? 0 : Math.round(Math.min(colEst / 240, 1) * 5);
          return (
            <div key={col.id} className={'kcol' + (overCol === col.id ? ' drop-target' : '')}
                 style={{ '--kc-color': col.color }}
                 onDragOver={(e) => { e.preventDefault(); setOverCol(col.id); }}
                 onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOverCol(c => c === col.id ? null : c); }}
                 onDrop={(e) => { e.preventDefault(); onDropCol(col); }}>
              <div className="kcol-head">
                <div className="kc-row1">
                  <span className="kc-num">{tasks.length}</span>
                  <div className="kc-namewrap">
                    <span className="kc-name"><span className="kc-dot" style={{ background: col.color }} />{col.name}</span>
                    <span className="kc-sub">{col.isDone ? 'concluídas' : colEst > 0 ? 'Σ ' + fmtEst(colEst) : 'sem estimativa'}</span>
                  </div>
                  {col.id === 'doing' && <span className={'kc-wip' + (tasks.length > 3 ? ' over' : '')}>WIP {tasks.length}/3</span>}
                </div>
                {!col.isDone && <div className="kcol-cap">{[0, 1, 2, 3, 4].map(i => <i key={i} className={i < segOn ? 'on' : ''} />)}</div>}
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
        {(() => {
          const open = TASKS.filter(t => inScope(t) && !t.done);
          const doing = TASKS.filter(t => inScope(t) && t.col === 'doing' && !t.done);
          const openEst = open.reduce((s, t) => s + (t.est || 0), 0);
          return (
            <div className="ksummary">
              <div className="ks-stat"><span className="ks-v">{open.length}</span><span className="ks-k">tarefas abertas</span></div>
              <div className="ks-sep" />
              <div className="ks-stat"><span className="ks-v">{openEst > 0 ? fmtEst(openEst) : '—'}</span><span className="ks-k">tempo estimado</span></div>
              <div className="ks-sep" />
              <div className="ks-stat"><span className="ks-v">{doing.length}</span><span className="ks-k">em foco agora</span></div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

Object.assign(window, { KanbanScreen });
