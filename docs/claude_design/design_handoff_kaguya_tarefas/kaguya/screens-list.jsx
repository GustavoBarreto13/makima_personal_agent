/* ─────────────────────────────────────────────────────────────────────────
   Kaguya · Tarefas — Lista (estilo Linear)
   Linhas densas, agrupamento por projeto colapsável, filtros e ordenação.
   ───────────────────────────────────────────────────────────────────────── */

const SORTS = {
  smart: { label: 'Inteligente', fn: (a, b) => (b.prio - a.prio) || ((a.due || '9999') < (b.due || '9999') ? -1 : 1) || (a.pos - b.pos) },
  due: { label: 'Vencimento', fn: (a, b) => ((a.due || '9999').localeCompare(b.due || '9999')) || (b.prio - a.prio) },
  prio: { label: 'Prioridade', fn: (a, b) => (b.prio - a.prio) || (a.pos - b.pos) },
  manual: { label: 'Manual', fn: (a, b) => a.pos - b.pos },
};

function ListScreen({ scope, onComplete, onOpen, onCreate, onInlineSave, onToggleSub, onToast }) {
  const [prioF, setPrioF] = React.useState(0);
  const [showDone, setShowDone] = React.useState(false);
  const [sort, setSort] = React.useState('smart');
  const [collapsed, setCollapsed] = React.useState({});
  const [, force] = React.useState(0);

  const toggleCol = (g) => setCollapsed(c => ({ ...c, [g]: !c[g] }));

  let list = TASKS.filter(t => {
    if (!showDone && t.done) return false;
    if (scope.type === 'project' && t.project !== scope.id) return false;
    if (scope.type === 'filter' && !scope.test(t) && !(showDone && t.done)) return false;
    if (scope.type === 'filter' && t.done && !showDone) return false;
    if (prioF && t.prio < prioF) return false;
    return true;
  });

  const sorter = SORTS[sort].fn;
  const single = scope.type === 'project';
  const open = list.filter(t => !t.done).length;

  // agrupa por projeto (exceto quando é um projeto único)
  let groups;
  if (single) {
    groups = [{ id: scope.id, name: projById(scope.id).name, color: projById(scope.id).color, tasks: list.slice().sort(sorter) }];
  } else {
    const byProj = {};
    list.forEach(t => { (byProj[t.project] = byProj[t.project] || []).push(t); });
    groups = PROJECTS.filter(p => byProj[p.id]).map(p => ({ id: p.id, name: p.name, color: p.color, tasks: byProj[p.id].sort(sorter) }));
  }

  const defProj = single ? scope.id : 'inbox';

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {single && <span style={{ display: 'inline-flex', width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', background: projById(scope.id).color.replace(')', ' / 0.16)'), color: projById(scope.id).color }}><Icon name={projById(scope.id).icon} style={{ width: 17, height: 17 }} /></span>}
            {scope.name}
          </div>
          <div className="page-sub">{open} aberta{open === 1 ? '' : 's'}{scope.type === 'filter' ? ' · smart list' : ''}</div>
        </div>
      </div>

      <QuickAdd defaultProject={defProj} onCreate={onCreate} />

      <div className="toolbar" style={{ marginTop: 16 }}>
        <div className="chips">
          <span className={'chip' + (prioF === 0 ? ' active' : '')} onClick={() => setPrioF(0)}>Tudo</span>
          {[3, 2, 1].map(lvl => (
            <span key={lvl} className={'chip' + (prioF === lvl ? ' active' : '')} onClick={() => setPrioF(lvl)}>
              <span className="sw" style={{ background: PRIO[lvl].color }} />{PRIO[lvl].name}+
            </span>
          ))}
        </div>
        <span className="toolbar-spacer" />
        <span className={'chip' + (showDone ? ' active' : '')} onClick={() => setShowDone(s => !s)}><Icon name="check" style={{ width: 13, height: 13 }} /> Concluídas</span>
        <button className="sort-btn" onClick={() => { const ks = Object.keys(SORTS); setSort(ks[(ks.indexOf(sort) + 1) % ks.length]); }}>
          <Icon name="sort" /> {SORTS[sort].label}
        </button>
      </div>

      <div className="task-list">
        {groups.length === 0 && <div className="empty"><Icon name="check" /><div className="e-title">Nada por aqui</div><div className="e-sub">Adicione uma tarefa acima.</div></div>}
        {groups.map(g => {
          const isCol = collapsed[g.id];
          const openN = g.tasks.filter(t => !t.done).length;
          return (
            <div key={g.id} className={'task-group' + (isCol ? ' collapsed' : '')}>
              {!single && (
                <div className="task-group-head" onClick={() => toggleCol(g.id)}>
                  <Icon name="chevDown" className="tgh-caret" />
                  <span className="tgh-dot" style={{ background: g.color }} />
                  <span className="tgh-name">{g.name}</span>
                  <span className="tgh-count">{openN}</span>
                  <span className="tgh-line" />
                </div>
              )}
              <div className="task-group-body">
                {g.tasks.map(t => (
                  <TaskRow key={t.id} task={t} showProject={false} defaultSubOpen
                           onComplete={onComplete} onOpen={onOpen} onInlineSave={onInlineSave} onToggleSub={onToggleSub} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

Object.assign(window, { ListScreen, SORTS });
