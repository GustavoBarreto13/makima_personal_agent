/* ─────────────────────────────────────────────────────────────────────────
   Kaguya · Tarefas — Lista (árvore de tarefas)
   Mostra a hierarquia completa (tarefa → subtarefa → …) com aninhamento,
   arrasto para reordenar/re-parentear, adição inline e agrupamento flexível.
   ───────────────────────────────────────────────────────────────────────── */

const SORTS = {
  manual: { label: 'Manual', fn: (a, b) => a.pos - b.pos },
  smart: { label: 'Inteligente', fn: (a, b) => (b.prio - a.prio) || ((a.due || '9999') < (b.due || '9999') ? -1 : 1) || (a.pos - b.pos) },
  due: { label: 'Vencimento', fn: (a, b) => ((a.due || '9999').localeCompare(b.due || '9999')) || (b.prio - a.prio) },
  prio: { label: 'Prioridade', fn: (a, b) => (b.prio - a.prio) || (a.pos - b.pos) },
};

const GROUP_BYS = {
  project: { label: 'Projeto' },
  prio: { label: 'Prioridade' },
  none: { label: 'Nenhum' },
};

function ListScreen({ scope, onComplete, onOpen, onCreate, treeApi }) {
  const [prioF, setPrioF] = React.useState(0);
  const [showDone, setShowDone] = React.useState(false);
  const [sort, setSort] = React.useState('manual');
  const [groupBy, setGroupBy] = React.useState('project');
  const [collapsedG, setCollapsedG] = React.useState({});
  const [editingId, setEditingId] = React.useState(null);

  const single = scope.type === 'project';
  const toggleG = (g) => setCollapsedG(c => ({ ...c, [g]: !c[g] }));

  /* raízes (tarefas de topo) que passam no escopo + filtros */
  const matchScope = (t) => {
    if (scope.type === 'project' && t.project !== scope.id) return false;
    if (scope.type === 'filter' && !scope.test(t)) return false;
    return true;
  };
  let roots = TASKS.filter(t => !t.parent && matchScope(t) && (showDone || !t.done) && (!prioF || t.prio >= prioF));

  /* contagem de tarefas abertas (inclui subtarefas) no escopo */
  const openTotal = TASKS.filter(t => !t.done && matchScope(t)).length;

  /* monta os grupos */
  const sorter = SORTS[sort].fn;
  let groups;
  const effGroupBy = single ? 'none' : groupBy;
  if (effGroupBy === 'none') {
    groups = [{ id: '_all', name: single ? projById(scope.id).name : 'Todas', color: single ? projById(scope.id).color : 'var(--kg)', roots: roots.slice().sort(sorter), hideHead: true }];
  } else if (effGroupBy === 'prio') {
    groups = [3, 2, 1, 0].map(lvl => ({ id: 'pr' + lvl, name: lvl === 0 ? 'Sem prioridade' : PRIO[lvl].name, color: PRIO[lvl].color || 'var(--ink-4)', roots: roots.filter(t => t.prio === lvl).sort(sorter) })).filter(g => g.roots.length);
  } else {
    const byProj = {};
    roots.forEach(t => { (byProj[t.project] = byProj[t.project] || []).push(t); });
    groups = PROJECTS.filter(p => byProj[p.id]).map(p => ({ id: p.id, name: p.name, color: p.color, roots: byProj[p.id].sort(sorter) }));
  }

  const defProj = single ? scope.id : 'inbox';
  const childFilter = (t) => showDone || !t.done;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {single && <span style={{ display: 'inline-flex', width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', background: projById(scope.id).color.replace(')', ' / 0.16)'), color: projById(scope.id).color }}><Icon name={projById(scope.id).icon} style={{ width: 17, height: 17 }} /></span>}
            {scope.name}
          </div>
          <div className="page-sub">{openTotal} aberta{openTotal === 1 ? '' : 's'}{scope.type === 'filter' ? ' · smart list' : ''} · arraste para aninhar ou reordenar</div>
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
        {!single && (
          <button className="sort-btn" onClick={() => { const ks = Object.keys(GROUP_BYS); setGroupBy(ks[(ks.indexOf(groupBy) + 1) % ks.length]); }}>
            <Icon name="board" /> Agrupar: {GROUP_BYS[groupBy].label}
          </button>
        )}
        <button className="sort-btn" onClick={() => { const ks = Object.keys(SORTS); setSort(ks[(ks.indexOf(sort) + 1) % ks.length]); }}>
          <Icon name="sort" /> {SORTS[sort].label}
        </button>
      </div>

      <div className="task-list">
        {groups.length === 0 && <div className="empty"><Icon name="check" /><div className="e-title">Nada por aqui</div><div className="e-sub">Adicione uma tarefa acima.</div></div>}
        {groups.map(g => {
          const isCol = collapsedG[g.id];
          const openN = g.roots.filter(t => !t.done).length;
          return (
            <div key={g.id} className={'task-group' + (isCol ? ' collapsed' : '')}>
              {!g.hideHead && (
                <div className="task-group-head" onClick={() => toggleG(g.id)}>
                  <Icon name="chevDown" className="tgh-caret" />
                  <span className="tgh-dot" style={{ background: g.color }} />
                  <span className="tgh-name">{g.name}</span>
                  <span className="tgh-count">{openN}</span>
                  <span className="tgh-line" />
                </div>
              )}
              <div className="task-group-body">
                <TaskTree roots={g.roots} sort={sort} api={treeApi} onComplete={onComplete} onOpen={onOpen}
                          editingId={editingId} setEditingId={setEditingId} childFilter={childFilter} />
                <div className="tree-addroot" onClick={() => treeApi.addRoot(g.id !== '_all' && effGroupBy === 'project' ? g.id : defProj, setEditingId)}>
                  <Icon name="plus" /> Adicionar tarefa
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

Object.assign(window, { ListScreen, SORTS, GROUP_BYS });
