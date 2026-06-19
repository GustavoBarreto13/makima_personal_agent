/* ─────────────────────────────────────────────────────────────────────────
   Kaguya · Tarefas — Árvore de tarefas (estrutura global de subtarefas)
   Toda subtarefa é uma tarefa normal com `parent`. A árvore permite:
   • aninhar em qualquer profundidade (colapsável, com guias de indentação)
   • arrastar para reordenar / re-parentear (zonas antes / dentro / depois)
   • adicionar inline (Enter = irmã, + = subtarefa) e Tab/Shift+Tab indenta
   • promover uma subtarefa a tarefa independente ("tratar como tarefa")
   • marcar pessoas da Komi e descrição em qualquer nível
   Visual = mesmo vocabulário do app (linhas Linear + chips do Kanban).
   ───────────────────────────────────────────────────────────────────────── */

/* ── Avatares (pessoas da Komi) ─────────────────────────────────────────── */
function Avatar({ id, size = 19 }) {
  const p = personById(id);
  if (!p) return null;
  return (
    <span className="kg-av" title={p.name}
          style={{ width: size, height: size, fontSize: Math.round(size * 0.42), background: avatarColor(p.name) }}>
      {initials(p.name)}
    </span>
  );
}
function AvatarStack({ ids, max = 3, size = 19 }) {
  if (!ids || ids.length === 0) return null;
  const shown = ids.slice(0, max);
  const extra = ids.length - shown.length;
  return (
    <span className="kg-avstack">
      {shown.map(id => <Avatar key={id} id={id} size={size} />)}
      {extra > 0 && <span className="kg-av more" style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}>+{extra}</span>}
    </span>
  );
}

/* ── Seletor de pessoas (popover) ───────────────────────────────────────── */
function AssigneePicker({ value, onChange, onClose, anchor = 'left' }) {
  const [q, setQ] = React.useState('');
  const ref = React.useRef(null);
  React.useEffect(() => { const f = ref.current && ref.current.querySelector('input'); if (f) f.focus(); }, []);
  const has = (id) => value.includes(id);
  const toggle = (id) => onChange(has(id) ? value.filter(x => x !== id) : [...value, id]);
  const list = PEOPLE.filter(p => p.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <>
      <div className="kg-pop-scrim" onMouseDown={(e) => { e.stopPropagation(); onClose(); }} onClick={(e) => e.stopPropagation()} />
      <div className={'kg-pop assignee-pop ' + anchor} ref={ref} onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
        <div className="kg-pop-search"><Icon name="search" /><input value={q} placeholder="Buscar pessoa…" onChange={(e) => setQ(e.target.value)} /></div>
        <div className="kg-pop-list">
          {list.map(p => (
            <div key={p.id} className={'kg-pop-item' + (has(p.id) ? ' on' : '')} onClick={() => toggle(p.id)}>
              <Avatar id={p.id} size={22} />
              <span className="pop-name">{p.name}</span>
              {has(p.id) && <Icon name="check" className="pop-check" />}
            </div>
          ))}
          {list.length === 0 && <div className="kg-pop-empty">ninguém encontrado</div>}
        </div>
      </div>
    </>
  );
}

/* ── Linha da árvore (recursiva) ────────────────────────────────────────── */
function TreeRow({ task, depth, hasKids, collapsed, onToggleCollapse, api,
                  onComplete, onOpen, editingId, setEditingId,
                  dragId, setDragId, drop, setDrop }) {
  const [val, setVal] = React.useState(task.title);
  const [popping, setPopping] = React.useState(false);
  const [pickOpen, setPickOpen] = React.useState(false);
  const inputRef = React.useRef(null);
  const editing = editingId === task.id;
  const pr = PRIO[task.prio];
  const prog = subProgress(task.id);

  React.useEffect(() => { if (editing && inputRef.current) { inputRef.current.focus(); inputRef.current.select(); } }, [editing]);
  React.useEffect(() => { setVal(task.title); }, [task.title]);

  const commit = () => {
    const v = val.trim();
    if (!v) { if (!task.title) api.remove(task); setEditingId(null); return; }
    if (v !== task.title) api.rename(task, v);
    setEditingId(null);
  };
  const onKey = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); api.addSibling(task, setEditingId); }
    else if (e.key === 'Escape') { e.preventDefault(); setVal(task.title); if (!task.title) api.remove(task); setEditingId(null); }
    else if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); const v = val.trim(); if (v && v !== task.title) api.rename(task, v); api.indent(task); }
    else if (e.key === 'Tab' && e.shiftKey) { e.preventDefault(); const v = val.trim(); if (v && v !== task.title) api.rename(task, v); api.outdent(task); }
  };

  const toggle = () => {
    if (task.done) { onComplete(task, false); return; }
    setPopping(true);
    setTimeout(() => onComplete(task, true), 160);
  };

  /* drag & drop: zona pela posição vertical do mouse */
  const computeZone = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const y = (e.clientY - r.top) / r.height;
    if (y < 0.28) return 'before';
    if (y > 0.72) return 'after';
    return 'child';
  };
  const onDragOver = (e) => {
    if (!dragId || dragId === task.id) return;
    e.preventDefault();
    const zone = computeZone(e);
    if (!drop || drop.id !== task.id || drop.zone !== zone) setDrop({ id: task.id, zone });
  };
  const onDrop = (e) => {
    if (!dragId) return;
    e.preventDefault(); e.stopPropagation();
    const zone = computeZone(e);
    api.move(dragId, task.id, zone);
    setDrop(null); setDragId(null);
  };

  const isDrop = drop && drop.id === task.id;

  return (
    <div className={'tree-row' + (task.done ? ' done' : '') + (dragId === task.id ? ' dragging' : '') +
                    (isDrop ? ' drop-' + drop.zone : '')}
         data-prio={task.prio}
         style={{ '--depth': depth, '--pr-color': pr.color || 'transparent', '--pr-tint': pr.tint || 'transparent' }}
         onDragOver={onDragOver} onDrop={onDrop}
         onClick={() => { if (!editing) onOpen(task); }}>

      {/* guias de indentação */}
      <span className="tree-guides" aria-hidden="true">
        {Array.from({ length: depth }).map((_, i) => <i key={i} style={{ left: 13 + i * 22 }} />)}
      </span>

      <span className="tree-indent" style={{ width: depth * 22 }} />

      <span className="tree-grip" title="Arrastar" draggable
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onDragStart={(e) => { setDragId(task.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', task.id); }}
            onDragEnd={() => { setDragId(null); setDrop(null); }}>
        <Icon name="grip" />
      </span>

      {hasKids
        ? <button className={'tree-caret' + (collapsed ? ' collapsed' : '')} onClick={(e) => { e.stopPropagation(); onToggleCollapse(task.id); }}><Icon name="chevDown" /></button>
        : <span className="tree-caret ghost" />}

      <Check done={task.done} popping={popping} onClick={toggle} size={17} />
      <span className="prio-dot" />

      <div className="tk-body">
        <div className="tk-title-row">
          {task.type && task.type !== 'task' && <Icon name={TYPES[task.type].icon} className="tk-type" style={{ color: TYPES[task.type].color }} />}
          {editing
            ? <input ref={inputRef} className="tk-title-input" value={val}
                     onClick={(e) => e.stopPropagation()}
                     onChange={(e) => setVal(e.target.value)} onBlur={commit} onKeyDown={onKey} placeholder="Nova tarefa…" />
            : <span className="tk-title" onClick={(e) => { e.stopPropagation(); setEditingId(task.id); }}>{task.title || <span className="tk-untitled">Sem título</span>}</span>}

          {hasKids && <span className="tree-count" onClick={(e) => { e.stopPropagation(); onToggleCollapse(task.id); }}>{prog.done}/{prog.total}</span>}
          {task.recur && <span className="tk-flagmini" title={task.recur.label}><Icon name="loop" /></span>}
          {task.parent && <span className="tk-flagmini sub" title="Subtarefa">↳</span>}
        </div>
        {task.notes && <span className="tk-subnote">{task.notes}</span>}
      </div>

      <div className="tk-meta">
        <AvatarStack ids={task.assignees} />
        {task.tags.slice(0, 1).map(t => <TagChip key={t} tag={t} />)}
        {task.due && <DateChip iso={task.due} time={task.time} done={task.done} />}
        {(task.prio || 0) > 0 && <PrioFlag level={task.prio} />}
      </div>

      {/* ações ao hover */}
      <div className="tree-actions" onClick={(e) => e.stopPropagation()}>
        <button className="tree-act" title="Marcar pessoa" onClick={() => setPickOpen(o => !o)}><Icon name="users" /></button>
        <button className="tree-act" title="Adicionar subtarefa" onClick={() => api.addChild(task, setEditingId, () => onToggleCollapse(task.id, false))}><Icon name="plus" /></button>
        {task.parent && <button className="tree-act" title="Tornar tarefa independente" onClick={() => api.promote(task)}><Icon name="arrowUpRight" /></button>}
        <button className="tree-act" title="Abrir" onClick={() => onOpen(task)}><Icon name="edit" /></button>
        {pickOpen && <AssigneePicker value={task.assignees || []} onChange={(v) => api.setAssignees(task, v)} onClose={() => setPickOpen(false)} anchor="right" />}
      </div>
    </div>
  );
}

/* ── Árvore ─────────────────────────────────────────────────────────────── */
function TaskTree({ roots, sort = 'manual', api, onComplete, onOpen, editingId, setEditingId, childFilter }) {
  const [collapsed, setCollapsed] = React.useState({});
  const [dragId, setDragId] = React.useState(null);
  const [drop, setDrop] = React.useState(null);
  const sorter = (window.SORTS && window.SORTS[sort] ? window.SORTS[sort].fn : (a, b) => a.pos - b.pos);
  const cf = childFilter || (() => true);

  const onToggleCollapse = (id, next) => setCollapsed(c => ({ ...c, [id]: next === undefined ? !c[id] : next }));

  const renderNode = (t, depth) => {
    const kids = childrenOf(t.id).filter(cf).slice().sort(sorter);
    const hasKids = kids.length > 0;
    const isCol = !!collapsed[t.id];
    return (
      <React.Fragment key={t.id}>
        <TreeRow task={t} depth={depth} hasKids={hasKids} collapsed={isCol} onToggleCollapse={onToggleCollapse}
                 api={api} onComplete={onComplete} onOpen={onOpen}
                 editingId={editingId} setEditingId={setEditingId}
                 dragId={dragId} setDragId={setDragId} drop={drop} setDrop={setDrop} />
        {hasKids && !isCol && kids.map(k => renderNode(k, depth + 1))}
      </React.Fragment>
    );
  };

  return (
    <div className={'tree' + (dragId ? ' dragging-active' : '')} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDrop(null); }}>
      {roots.map(r => renderNode(r, 0))}
    </div>
  );
}

Object.assign(window, { Avatar, AvatarStack, AssigneePicker, TreeRow, TaskTree });
