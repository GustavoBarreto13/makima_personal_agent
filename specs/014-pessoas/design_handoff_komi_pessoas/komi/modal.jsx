/* ─────────────────────────────────────────────────────────────────────────
   Komi · Pessoas — modal de criar / editar (foto, contatos, apelidos, datas)
   ───────────────────────────────────────────────────────────────────────── */

const REL_OPTIONS = [
  { cat: 'familia',  label: 'Família' },
  { cat: 'amigos',   label: 'Amigos' },
  { cat: 'trabalho', label: 'Trabalho' },
  { cat: 'outros',   label: 'Outros' },
];

function PersonModal({ person, onClose, onSave, onDelete }) {
  const isNew = !person;
  const seed = person || {
    id: null, name: '', relationship: '', category: 'amigos',
    phone: '', email: '', instagram: '', telegram: '', city: '', avatar: null,
    notes: '', aliases: [], dates: [], links: emptyLinks(),
  };
  const [f, setF] = React.useState(() => JSON.parse(JSON.stringify(seed)));
  const [aliasDraft, setAliasDraft] = React.useState('');
  const [dateDraft, setDateDraft] = React.useState({ label: '', date: '', recurring: true });
  const fileRef = React.useRef(null);

  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }));

  const onPhoto = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => set('avatar', reader.result);
    reader.readAsDataURL(file);
  };

  const addAlias = () => {
    const a = aliasDraft.trim();
    if (!a) return;
    if (!f.aliases.some(x => normalize(x) === normalize(a))) set('aliases', [...f.aliases, a]);
    setAliasDraft('');
  };
  const removeAlias = (i) => set('aliases', f.aliases.filter((_, k) => k !== i));

  const addDate = () => {
    if (!dateDraft.label.trim() || !dateDraft.date.trim()) return;
    // aceita "MM-DD" (recorrente) ou "YYYY-MM-DD"
    set('dates', [...f.dates, { ...dateDraft }]);
    setDateDraft({ label: '', date: '', recurring: true });
  };
  const removeDate = (i) => set('dates', f.dates.filter((_, k) => k !== i));

  const canSave = f.name.trim().length > 0;
  const submit = () => {
    if (!canSave) return;
    const out = { ...f, name: f.name.trim(), relationship: f.relationship.trim() || REL_OPTIONS.find(r => r.cat === f.category).label.toLowerCase() };
    if (!out.id) out.id = 'p-' + normalize(out.name).replace(/[^a-z0-9]+/g, '-') + '-' + Math.random().toString(36).slice(2, 6);
    if (!out.links) out.links = emptyLinks();
    onSave(out, isNew);
  };

  return (
    <div className="modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="form-head">
          <div className="form-title">{isNew ? 'Nova pessoa' : 'Editar pessoa'}</div>
          <button className="modal-x" onClick={onClose}><Icon name="x" /></button>
        </div>

        <div className="modal-body">
          {/* foto */}
          <div className="modal-field">
            <div className="avatar-upload">
              <div className="au-preview">
                <Avatar person={{ name: f.name || '?', avatar: f.avatar }} size={96} />
              </div>
              <div className="au-actions">
                <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onPhoto} />
                <button className="au-btn" onClick={() => fileRef.current && fileRef.current.click()}>
                  <Icon name="camera" />{f.avatar ? 'Trocar foto' : 'Adicionar foto'}
                </button>
                {f.avatar && <button className="au-btn danger" onClick={() => set('avatar', null)}><Icon name="trash" />Remover</button>}
                {!f.avatar && <span className="au-hint">sem foto → usa as iniciais</span>}
              </div>
            </div>
          </div>

          {/* nome */}
          <div className="modal-field">
            <label className="modal-label">Nome</label>
            <input className="text-field title-field" autoFocus placeholder="Nome completo"
                   value={f.name} onChange={(e) => set('name', e.target.value)}
                   onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
          </div>

          {/* relacionamento */}
          <div className="modal-field">
            <label className="modal-label">Relacionamento</label>
            <div className="seg-field" style={{ marginBottom: 10 }}>
              {REL_OPTIONS.map(r => {
                const meta = REL_CATS[r.cat];
                const sel = f.category === r.cat;
                return (
                  <button key={r.cat} className={'seg-opt' + (sel ? ' sel' : '')}
                          style={{ '--so-color': meta.color, '--so-tint': meta.tint }}
                          onClick={() => set('category', r.cat)}>
                    <span className="so-mark" />{r.label}
                  </button>
                );
              })}
            </div>
            <input className="text-field" placeholder="Rótulo (ex.: amiga, irmã, colega de trabalho)"
                   value={f.relationship} onChange={(e) => set('relationship', e.target.value)} />
          </div>

          {/* contatos */}
          <div className="modal-field">
            <label className="modal-label">Contatos</label>
            <div className="row-2">
              <input className="text-field" placeholder="Telefone" value={f.phone} onChange={(e) => set('phone', e.target.value)} />
              <input className="text-field" placeholder="E-mail" value={f.email} onChange={(e) => set('email', e.target.value)} />
            </div>
            <div className="row-2" style={{ marginTop: 12 }}>
              <input className="text-field" placeholder="Instagram (@)" value={f.instagram} onChange={(e) => set('instagram', e.target.value)} />
              <input className="text-field" placeholder="Telegram (@)" value={f.telegram} onChange={(e) => set('telegram', e.target.value)} />
            </div>
            <input className="text-field" style={{ marginTop: 12 }} placeholder="Cidade" value={f.city} onChange={(e) => set('city', e.target.value)} />
          </div>

          {/* apelidos */}
          <div className="modal-field">
            <label className="modal-label">Apelidos — resolvem para esta pessoa</label>
            <div className="edit-list">
              {f.aliases.length > 0 && (
                <div className="edit-chip-row">
                  {f.aliases.map((a, i) => (
                    <span className="edit-chip" key={i}>"{a}"<button onClick={() => removeAlias(i)}><Icon name="x" /></button></span>
                  ))}
                </div>
              )}
              <div className="inline-add">
                <input className="text-field" placeholder="Adicionar apelido (ex.: Aninha)"
                       value={aliasDraft} onChange={(e) => setAliasDraft(e.target.value)}
                       onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAlias(); } }} />
                <button className="mini-add" onClick={addAlias}><Icon name="plus" /></button>
              </div>
            </div>
          </div>

          {/* datas importantes */}
          <div className="modal-field">
            <label className="modal-label">Datas importantes</label>
            <div className="edit-list">
              {f.dates.map((d, i) => (
                <div className="date-edit-row" key={i}>
                  <span className="edit-chip" style={{ flex: 1, justifyContent: 'space-between' }}>
                    <span><b style={{ fontWeight: 600 }}>{d.label}</b> · {fmtDayMonth(d.date)}{d.recurring ? ' · anual' : ''}</span>
                    <button onClick={() => removeDate(i)}><Icon name="x" /></button>
                  </span>
                </div>
              ))}
              <div className="date-edit-row">
                <input className="text-field de-label" placeholder="Rótulo (ex.: Aniversário)"
                       value={dateDraft.label} onChange={(e) => setDateDraft({ ...dateDraft, label: e.target.value })} />
                <input className="text-field de-date" placeholder="MM-DD ou AAAA-MM-DD"
                       value={dateDraft.date} onChange={(e) => setDateDraft({ ...dateDraft, date: e.target.value })} />
                <span className="recurr-toggle" onClick={() => setDateDraft({ ...dateDraft, recurring: !dateDraft.recurring })}>
                  <span className={'recurr-box' + (dateDraft.recurring ? ' on' : '')}>{dateDraft.recurring && <Icon name="check" />}</span>
                  anual
                </span>
                <button className="mini-add" onClick={addDate}><Icon name="plus" /></button>
              </div>
            </div>
          </div>

          {/* notas */}
          <div className="modal-field">
            <label className="modal-label">Notas</label>
            <textarea className="text-field" placeholder="Qualquer coisa que valha lembrar…"
                      value={f.notes} onChange={(e) => set('notes', e.target.value)} />
          </div>

          <div className="modal-foot">
            {!isNew && <button className="danger-link" onClick={() => onDelete(f.id)}>Excluir pessoa</button>}
            <span className="grow" />
            <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary" disabled={!canSave} style={!canSave ? { opacity: 0.45 } : null} onClick={submit}>
              <Icon name="check" />{isNew ? 'Criar pessoa' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { PersonModal });
