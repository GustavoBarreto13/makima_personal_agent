/* ─────────────────────────────────────────────────────────────────────────
   Kaguya · Tarefas — modais (padrão FormModal schema-driven da Nami)
   TaskModal (criar/editar), ProjectModal, FilterModal.
   ───────────────────────────────────────────────────────────────────────── */

function Scrim({ onClose, children, maxWidth }) {
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={maxWidth ? { maxWidth } : null}>{children}</div>
    </div>
  );
}

const PROJ_SWATCHES = ['oklch(0.62 0.13 250)', 'oklch(0.64 0.15 18)', 'oklch(0.63 0.13 150)', 'oklch(0.60 0.14 292)', 'oklch(0.64 0.12 64)', 'oklch(0.62 0.15 330)', 'oklch(0.60 0.10 196)', 'oklch(0.62 0.02 350)'];
const PROJ_ICONS = ['home', 'users', 'heart', 'grad', 'book', 'brush', 'wallet', 'folder', 'zap', 'inbox'];
const RECUR_OPTS = [
  { key: 'none', label: 'Não repete', recur: null },
  { key: 'daily', label: 'Todo dia', recur: { mode: 'fixed', rule: 'diário', label: 'todo dia' } },
  { key: 'weekly', label: 'Toda semana', recur: { mode: 'fixed', rule: 'semanal', label: 'toda semana' } },
  { key: 'monthly', label: 'Todo mês', recur: { mode: 'fixed', rule: 'mensal', label: 'todo mês' } },
  { key: 'after', label: 'Após concluir', recur: { mode: 'after_completion', rule: 'a cada 3 dias', label: 'a cada 3 dias após concluir' } },
];

/* ── TaskModal ──────────────────────────────────────────────────────────── */
function TaskModal({ task, onSave, onClose, onDelete, api, onOpen }) {
  const isNew = !task.id || task._new;
  const inTree = !isNew && TASKS.some(x => x.id === task.id);
  const [f, setF] = React.useState(() => ({
    title: task.title || '', notes: task.notes || '', project: task.project || 'inbox',
    type: task.type || 'task',
    prio: task.prio || 0, due: task.due || '', time: task.time || '', est: task.est || '',
    tags: [...(task.tags || [])], assignees: [...(task.assignees || [])],
    pendingSubs: [],   // só para tarefa nova (vira filha real ao salvar)
    recur: task.recur || null,
  }));
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const titleRef = React.useRef(null);
  React.useEffect(() => { if (titleRef.current) { titleRef.current.focus(); if (!isNew) titleRef.current.select(); } }, []);

  const toggleTag = (t) => set('tags', f.tags.includes(t) ? f.tags.filter(x => x !== t) : [...f.tags, t]);
  const togglePerson = (id) => set('assignees', f.assignees.includes(id) ? f.assignees.filter(x => x !== id) : [...f.assignees, id]);

  /* subtarefas: filhas reais (existente) ou lista local (nova) */
  const kids = inTree ? childrenOf(task.id).slice().sort((a, b) => a.pos - b.pos) : [];
  const parent = task.parent ? TASKS.find(x => x.id === task.parent) : null;
  const [newSub, setNewSub] = React.useState('');
  const addRealSub = () => {
    if (!newSub.trim() || !api) return;
    const pos = (kids.length ? Math.max(...kids.map(k => k.pos)) : task.pos) + 10;
    api.create(mk({ title: newSub.trim(), parent: task.id, project: f.project, col: task.col || 'todo', pos }));
    setNewSub('');
  };
  const addPendingSub = () => set('pendingSubs', [...f.pendingSubs, { id: 's' + Date.now(), title: '', done: false, prio: 0 }]);
  const patchPending = (i, patch) => set('pendingSubs', f.pendingSubs.map((s, j) => j === i ? { ...s, ...patch } : s));
  const delPending = (i) => set('pendingSubs', f.pendingSubs.filter((_, j) => j !== i));

  const save = () => {
    if (!f.title.trim()) return;
    onSave({
      ...task, _new: undefined, title: f.title.trim(), notes: f.notes, project: f.project, type: f.type,
      prio: f.prio, due: f.due || null, time: f.time || null, est: f.est ? Number(f.est) : null,
      tags: f.tags, assignees: f.assignees, recur: f.recur,
      today: f.due === TODAY ? true : task.today,
      __subs: isNew ? f.pendingSubs : undefined,
    });
  };
  const recurKey = (RECUR_OPTS.find(o => o.recur && f.recur && o.recur.mode === f.recur.mode && o.label && f.recur.label && o.recur.label === f.recur.label) || (f.recur ? null : RECUR_OPTS[0]) || {}).key
    || (f.recur ? (f.recur.mode === 'after_completion' ? 'after' : 'monthly') : 'none');

  return (
    <Scrim onClose={onClose} maxWidth={540}>
      <div className="form-head">
        <span className="form-title">{isNew ? 'Nova tarefa' : 'Editar tarefa'}</span>
        <button className="modal-x" onClick={onClose}><Icon name="x" /></button>
      </div>
      <div className="modal-body">
        {parent && (
          <div className="parent-banner">
            <Icon name="arrowUpRight" style={{ width: 14, height: 14, transform: 'rotate(180deg)' }} />
            <span>Subtarefa de <b onClick={() => onOpen && onOpen(parent)}>{parent.title}</b></span>
            <span className="grow" />
            <button className="pb-promote" onClick={() => { api && api.promote(task); onClose(); }}>Tornar independente</button>
          </div>
        )}

        <input ref={titleRef} className="text-field title-field" placeholder="O que precisa ser feito?"
               value={f.title} onChange={(e) => set('title', e.target.value)}
               onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save(); }} />

        <div className="modal-field">
          <label className="modal-label">Tipo</label>
          <div className="seg-field">
            {Object.keys(TYPES).map(k => (
              <button key={k} className={'seg-opt' + (f.type === k ? ' sel' : '')} onClick={() => set('type', k)}>
                <Icon name={TYPES[k].icon} style={{ width: 14, height: 14 }} /> {TYPES[k].name}
              </button>
            ))}
          </div>
        </div>

        <div className="modal-field">
          <label className="modal-label">Prioridade</label>
          <div className="prio-pick-row">
            {[0, 1, 2, 3].map(lvl => {
              const pr = PRIO[lvl];
              return (
                <button key={lvl} className={'prio-pick' + (f.prio === lvl ? ' sel' : '')}
                        style={{ color: pr.color || 'var(--ink-3)', borderColor: f.prio === lvl ? (pr.color || 'var(--ink-3)') : undefined, background: f.prio === lvl ? (pr.tint || 'var(--card-2)') : undefined }}
                        onClick={() => set('prio', lvl)}>
                  {lvl > 0 ? <Icon name="flag" style={{ width: 12, height: 12 }} /> : <Icon name="minus" style={{ width: 12, height: 12 }} />}
                  {lvl === 0 ? 'Nenhuma' : pr.name}
                </button>
              );
            })}
          </div>
        </div>

        <div className="modal-field row-2">
          <div className="mini-field">
            <label className="modal-label">Projeto</label>
            <select className="select-field" value={f.project} onChange={(e) => set('project', e.target.value)}>
              {PROJECTS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="mini-field">
            <label className="modal-label">Estimativa</label>
            <select className="select-field" value={f.est} onChange={(e) => set('est', e.target.value)}>
              <option value="">—</option>
              {[5, 10, 15, 20, 30, 45, 60, 90, 120].map(m => <option key={m} value={m}>{fmtEst(m)}</option>)}
            </select>
          </div>
        </div>

        <div className="modal-field row-2">
          <div className="mini-field">
            <label className="modal-label">Vencimento</label>
            <input type="date" className="text-field" value={f.due} onChange={(e) => set('due', e.target.value)} />
          </div>
          <div className="mini-field">
            <label className="modal-label">Horário</label>
            <input type="time" className="text-field" value={f.time} onChange={(e) => set('time', e.target.value)} />
          </div>
        </div>

        <div className="modal-field">
          <label className="modal-label">Repetir</label>
          <select className="select-field" value={recurKey} onChange={(e) => set('recur', (RECUR_OPTS.find(o => o.key === e.target.value) || {}).recur)}>
            {RECUR_OPTS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </div>

        <div className="modal-field">
          <label className="modal-label">Pessoas <span className="ml-hint">· da Komi</span></label>
          <div className="people-pick">
            {PEOPLE.map(p => (
              <button key={p.id} className={'person-chip' + (f.assignees.includes(p.id) ? ' on' : '')} onClick={() => togglePerson(p.id)}>
                <Avatar id={p.id} size={20} /> {p.name}
              </button>
            ))}
          </div>
        </div>

        <div className="modal-field">
          <label className="modal-label">Tags</label>
          <div className="chips">
            {TAG_NAMES.map(t => (
              <span key={t} className={'chip' + (f.tags.includes(t) ? ' active' : '')} onClick={() => toggleTag(t)}>
                <span className="sw" style={{ background: TAGS[t].color }} />{t}
              </span>
            ))}
          </div>
        </div>

        <div className="modal-field">
          <label className="modal-label">Subtarefas <span className="ml-hint">· cada uma é uma tarefa</span></label>
          {inTree ? (
            <div className="subtask-list">
              {kids.map(k => (
                <div key={k.id} className="subtask-card">
                  <div className="subtask-row">
                    <Check done={k.done} onClick={() => api.setDone(k, !k.done)} size={16} />
                    <span className={'sub-title' + (k.done ? ' done-text' : '')} onClick={() => onOpen && onOpen(k)}>{k.title || 'Sem título'}</span>
                    {(k.assignees || []).length > 0 && <AvatarStack ids={k.assignees} size={18} />}
                    <button className="sub-prio" title={'Prioridade: ' + PRIO[k.prio || 0].name} style={{ color: PRIO[k.prio || 0].color || 'var(--ink-4)' }}
                            onClick={() => { const tk = TASKS.find(x => x.id === k.id); if (tk) { tk.prio = ((tk.prio || 0) + 1) % 4; api.refresh(); } }}><Icon name="flag" style={{ width: 13, height: 13 }} /></button>
                    <button className="sub-open" title="Abrir" onClick={() => onOpen && onOpen(k)}><Icon name="arrowR" style={{ width: 14, height: 14 }} /></button>
                    <button className="modal-x" style={{ width: 24, height: 24 }} onClick={() => api.remove(k)}><Icon name="x" /></button>
                  </div>
                  {k.notes && <div className="subtask-notes-ro">{k.notes}</div>}
                </div>
              ))}
              <div className="subtask-add-row">
                <Icon name="plus" />
                <input value={newSub} placeholder="Adicionar subtarefa e Enter…" onChange={(e) => setNewSub(e.target.value)}
                       onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addRealSub(); } }} />
              </div>
            </div>
          ) : (
            <div className="subtask-list">
              {f.pendingSubs.map((s, i) => (
                <div key={s.id} className="subtask-card">
                  <div className="subtask-row">
                    <Check done={s.done} onClick={() => patchPending(i, { done: !s.done })} size={16} />
                    <input className={s.done ? 'done-text' : ''} value={s.title} placeholder="Subtarefa…" onChange={(e) => patchPending(i, { title: e.target.value })} />
                    <button className="sub-prio" title={'Prioridade: ' + PRIO[s.prio || 0].name} style={{ color: PRIO[s.prio || 0].color || 'var(--ink-4)' }}
                            onClick={() => patchPending(i, { prio: ((s.prio || 0) + 1) % 4 })}><Icon name="flag" style={{ width: 13, height: 13 }} /></button>
                    <button className="modal-x" style={{ width: 24, height: 24 }} onClick={() => delPending(i)}><Icon name="x" /></button>
                  </div>
                </div>
              ))}
              <div className="subtask-add" onClick={addPendingSub}><Icon name="plus" /> Adicionar subtarefa</div>
            </div>
          )}
        </div>

        <div className="modal-field">
          <label className="modal-label">Notas</label>
          <textarea className="text-field" placeholder="Detalhes, links, contexto…" value={f.notes} onChange={(e) => set('notes', e.target.value)} />
        </div>

        <div className="modal-foot">
          {!isNew && <button className="btn btn-ghost btn-sm" onClick={() => onDelete(task)}><Icon name="trash" /> Excluir</button>}
          <span className="grow" />
          <span className="hint"><kbd>⌘</kbd><kbd>↵</kbd> salvar</span>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={!f.title.trim()} onClick={save}><Icon name="check" /> Salvar</button>
        </div>
      </div>
    </Scrim>
  );
}

/* ── ProjectModal ───────────────────────────────────────────────────────── */
function ProjectModal({ project, onSave, onClose, onDelete }) {
  const isNew = !project.id;
  const [f, setF] = React.useState(() => ({ name: project.name || '', group: project.group || 'pessoal', color: project.color || PROJ_SWATCHES[0], icon: project.icon || 'folder' }));
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const ref = React.useRef(null);
  React.useEffect(() => { if (ref.current) ref.current.focus(); }, []);
  const save = () => { if (!f.name.trim()) return; onSave({ ...project, id: project.id || ('p' + Date.now()), name: f.name.trim(), group: f.group, color: f.color, icon: f.icon }); };

  return (
    <Scrim onClose={onClose} maxWidth={440}>
      <div className="form-head"><span className="form-title">{isNew ? 'Nova lista' : 'Editar lista'}</span><button className="modal-x" onClick={onClose}><Icon name="x" /></button></div>
      <div className="modal-body">
        <input ref={ref} className="text-field title-field" placeholder="Nome da lista" value={f.name}
               onChange={(e) => set('name', e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save(); }} />
        <div className="modal-field">
          <label className="modal-label">Grupo</label>
          <select className="select-field" value={f.group} onChange={(e) => set('group', e.target.value)}>
            {GROUPS.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
        <div className="modal-field">
          <label className="modal-label">Cor</label>
          <div className="swatch-row">
            {PROJ_SWATCHES.map(c => <div key={c} className={'swatch-pick' + (f.color === c ? ' sel' : '')} style={{ background: c }} onClick={() => set('color', c)} />)}
          </div>
        </div>
        <div className="modal-field">
          <label className="modal-label">Ícone</label>
          <div className="icon-pick-row">
            {PROJ_ICONS.map(ic => <div key={ic} className={'icon-pick' + (f.icon === ic ? ' sel' : '')} onClick={() => set('icon', ic)}><Icon name={ic} /></div>)}
          </div>
        </div>
        <div className="modal-foot">
          {!isNew && project.id !== 'inbox' && <button className="btn btn-ghost btn-sm" onClick={() => onDelete(project)}><Icon name="trash" /> Excluir</button>}
          <span className="grow" />
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={!f.name.trim()} onClick={save}><Icon name="check" /> Salvar</button>
        </div>
      </div>
    </Scrim>
  );
}

/* ── FilterModal (smart list) ───────────────────────────────────────────── */
function FilterModal({ onSave, onClose }) {
  const [name, setName] = React.useState('');
  const [prio, setPrio] = React.useState(0);
  const [when, setWhen] = React.useState('any');
  const [tag, setTag] = React.useState('');
  const ref = React.useRef(null);
  React.useEffect(() => { if (ref.current) ref.current.focus(); }, []);

  const save = () => {
    if (!name.trim()) return;
    const test = (t) => {
      if (t.done) return false;
      if (prio && t.prio < prio) return false;
      if (tag && !t.tags.includes(tag)) return false;
      if (when === 'today' && !(t.due && daysBetween(TODAY, t.due) <= 0)) return false;
      if (when === 'week' && !(t.due && daysBetween(TODAY, t.due) >= 0 && daysBetween(TODAY, t.due) <= 7)) return false;
      return true;
    };
    onSave({ id: 'f' + Date.now(), name: name.trim(), icon: 'filter', test });
  };

  return (
    <Scrim onClose={onClose} maxWidth={440}>
      <div className="form-head"><span className="form-title">Nova smart list</span><button className="modal-x" onClick={onClose}><Icon name="x" /></button></div>
      <div className="modal-body">
        <input ref={ref} className="text-field title-field" placeholder="Nome da lista" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save(); }} />
        <div className="modal-field">
          <label className="modal-label">Prioridade mínima</label>
          <div className="prio-pick-row">
            {[0, 1, 2, 3].map(lvl => (
              <button key={lvl} className={'prio-pick' + (prio === lvl ? ' sel' : '')}
                      style={{ color: PRIO[lvl].color || 'var(--ink-3)', borderColor: prio === lvl ? (PRIO[lvl].color || 'var(--ink-3)') : undefined, background: prio === lvl ? (PRIO[lvl].tint || 'var(--card-2)') : undefined }}
                      onClick={() => setPrio(lvl)}>{lvl === 0 ? 'Qualquer' : PRIO[lvl].name}</button>
            ))}
          </div>
        </div>
        <div className="modal-field">
          <label className="modal-label">Quando vence</label>
          <div className="seg-field">
            {[['any', 'Qualquer'], ['today', 'Hoje/vencidas'], ['week', 'Esta semana']].map(([k, l]) => (
              <button key={k} className={'seg-opt' + (when === k ? ' sel' : '')} onClick={() => setWhen(k)}>{l}</button>
            ))}
          </div>
        </div>
        <div className="modal-field">
          <label className="modal-label">Tag (opcional)</label>
          <div className="chips">
            <span className={'chip' + (tag === '' ? ' active' : '')} onClick={() => setTag('')}>nenhuma</span>
            {TAG_NAMES.map(t => <span key={t} className={'chip' + (tag === t ? ' active' : '')} onClick={() => setTag(t)}><span className="sw" style={{ background: TAGS[t].color }} />{t}</span>)}
          </div>
        </div>
        <div className="modal-foot">
          <span className="grow" />
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={!name.trim()} onClick={save}><Icon name="check" /> Salvar lista</button>
        </div>
      </div>
    </Scrim>
  );
}

Object.assign(window, { Scrim, TaskModal, ProjectModal, FilterModal, PROJ_SWATCHES, PROJ_ICONS, RECUR_OPTS });
