/* ─────────────────────────────────────────────────────────────────────────
   Nami · Finanças — adicionar transação (o coração do app)
   Princípio: rápido e dinâmico. Modal completo (atalho A, valor em foco,
   Enter salva, Esc fecha) + barra inline de lançamento no dashboard.
   ───────────────────────────────────────────────────────────────────────── */

/* normaliza "45,90" / "45.90" / "R$ 45" → número */
function parseAmount(str) {
  if (typeof str === 'number') return str;
  const cleaned = String(str).replace(/[^\d.,]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/* ════ MODAL COMPLETO ════════════════════════════════════════════════════ */
function AddModal({ open, onClose, onSave, defaultSource }) {
  const [type, setType] = React.useState('out');
  const [amount, setAmount] = React.useState('');
  const [catId, setCatId] = React.useState('mercado');
  const [source, setSource] = React.useState(defaultSource || 'nu-card');
  const [date, setDate] = React.useState(TODAY);
  const [merchant, setMerchant] = React.useState('');
  const amtRef = React.useRef(null);

  const cats = CATEGORIES.filter(c => c.kind === type);

  React.useEffect(() => {
    if (!open) return;
    setType('out'); setAmount(''); setCatId('mercado');
    setSource(defaultSource || 'nu-card'); setDate(TODAY); setMerchant('');
    setTimeout(() => amtRef.current?.focus(), 60);
  }, [open]);

  // ao trocar tipo, reseta a categoria pro 1º do tipo
  const switchType = (t) => {
    setType(t);
    const first = CATEGORIES.find(c => c.kind === t);
    setCatId(first.id);
    if (t === 'in' && sourceIsCard(source)) setSource('nubank');
  };

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSave(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!open) return null;

  const val = parseAmount(amount);
  const valid = val > 0;
  const doSave = () => {
    if (!valid) { amtRef.current?.focus(); return; }
    onSave({
      type, catId, amount: val, source, date,
      merchant: merchant.trim() || CAT[catId].name,
    });
    onClose();
  };

  return (
    <div className="modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-label="Adicionar transação">
        {/* tipo */}
        <div className="type-toggle">
          <button className={'out' + (type === 'out' ? ' on' : '')} onClick={() => switchType('out')}>
            <Icon name="minus" /> Despesa
          </button>
          <button className={'in' + (type === 'in' ? ' on' : '')} onClick={() => switchType('in')}>
            <Icon name="plus" /> Receita
          </button>
        </div>

        <div className="modal-body">
          {/* valor */}
          <div className="amt-field">
            <span className="cur">R$</span>
            <input ref={amtRef} className={'amt-input ' + type} inputMode="decimal" type="text"
                   value={amount} placeholder="0,00"
                   size={Math.max(4, amount.length || 4)}
                   onChange={e => setAmount(e.target.value)} />
          </div>

          {/* categoria */}
          <div className="modal-field">
            <label className="modal-label">{type === 'out' ? 'Onde foi?' : 'De onde veio?'}</label>
            <div className="cat-grid">
              {cats.map(c => (
                <div key={c.id} className={'cat-pick' + (c.id === catId ? ' sel' : '')} onClick={() => setCatId(c.id)}>
                  <div className="ci" style={{ background: c.color.replace(')', ' / 0.14)'), color: c.color }}>
                    <Icon name={c.icon} />
                  </div>
                  <span className="cl">{c.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* descrição */}
          <div className="modal-field">
            <label className="modal-label">Descrição <span style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--ink-4)' }}>· opcional</span></label>
            <input className="text-field" value={merchant} onChange={e => setMerchant(e.target.value)}
                   placeholder={type === 'out' ? 'Ex: Mercado, Uber, iFood…' : 'Ex: Salário, Freelance…'} />
          </div>

          {/* conta + data */}
          <div className="modal-field row-2">
            <div className="mini-field">
              <label className="modal-label">{type === 'out' ? 'Pagou com' : 'Caiu em'}</label>
              <select className="select-field" value={source} onChange={e => setSource(e.target.value)}>
                <optgroup label="Contas">
                  {ACCOUNTS.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </optgroup>
                {type === 'out' && (
                  <optgroup label="Cartões">
                    {CARDS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </optgroup>
                )}
              </select>
            </div>
            <div className="mini-field">
              <label className="modal-label">Quando</label>
              <input className="text-field" type="date" value={date} max={TODAY}
                     onChange={e => setDate(e.target.value)} />
            </div>
          </div>

          <div className="modal-foot">
            <span className="hint"><kbd>↵</kbd> salva · <kbd>esc</kbd> fecha</span>
            <div className="grow" />
            <button className="modal-x" onClick={onClose} aria-label="Fechar"><Icon name="x" /></button>
            <button className={'btn ' + (type === 'out' ? 'btn-primary' : 'btn-sea')} onClick={doSave} disabled={!valid}
                    style={{ opacity: valid ? 1 : 0.5 }}>
              <Icon name="check" /> Adicionar {valid ? `R$ ${fmtBRL(val)}` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════ QUICK-ADD INLINE (dashboard) ══════════════════════════════════════ */
function QuickAdd({ onSave, onToast }) {
  const [type, setType] = React.useState('out');
  const [amount, setAmount] = React.useState('');
  const [desc, setDesc] = React.useState('');
  const [catId, setCatId] = React.useState('mercado');
  const amtRef = React.useRef(null);

  // categorias de atalho conforme o tipo
  const quickCats = type === 'out'
    ? ['mercado', 'restaurante', 'transporte', 'lazer', 'compras']
    : ['salario', 'freela', 'investimento', 'reembolso'];

  React.useEffect(() => { setCatId(quickCats[0]); }, [type]);

  const val = parseAmount(amount);
  const valid = val > 0;

  const save = () => {
    if (!valid) { amtRef.current?.focus(); return; }
    onSave({
      type, catId, amount: val,
      source: type === 'out' ? 'nu-card' : 'nubank',
      date: TODAY,
      merchant: desc.trim() || CAT[catId].name,
    });
    setAmount(''); setDesc(''); setCatId(quickCats[0]);
    amtRef.current?.focus();
  };

  return (
    <div className="quick-add">
      <button className={'qa-type ' + type} title="Alternar receita / despesa"
              onClick={() => setType(t => t === 'out' ? 'in' : 'out')}>
        <Icon name={type === 'out' ? 'minus' : 'plus'} />
      </button>
      <span className="qa-cur">R$</span>
      <input ref={amtRef} className="qa-amt" inputMode="decimal" type="text" value={amount}
             placeholder="0,00" onChange={e => setAmount(e.target.value)}
             onKeyDown={e => { if (e.key === 'Enter') save(); }} />
      <input className="qa-desc" value={desc} placeholder={type === 'out' ? 'No que você gastou?' : 'De onde veio?'}
             onChange={e => setDesc(e.target.value)}
             onKeyDown={e => { if (e.key === 'Enter') save(); }} />
      <div className="qa-cats">
        {quickCats.map(id => {
          const c = CAT[id];
          const sel = id === catId;
          return (
            <button key={id} className={'qa-cat' + (sel ? ' sel' : '')} title={c.name}
                    onClick={() => setCatId(id)}
                    style={{ color: c.color, borderColor: sel ? c.color : 'var(--line)', background: sel ? c.color.replace(')', ' / 0.12)') : 'var(--card)' }}>
              <Icon name={c.icon} />
            </button>
          );
        })}
      </div>
      <button className="qa-save" disabled={!valid} onClick={save}>
        <Icon name="check" /> Lançar
      </button>
    </div>
  );
}

/* ════ BARRA DE RESUMO DO MÊS (rodapé) ═══════════════════════════════════ */
function SummBar({ stat, onAdd }) {
  const flowTotal = stat.income + stat.expense || 1;
  return (
    <div className="summbar">
      <div className="summ-item">
        <span className="k">Entrou</span>
        <span className="v pos"><Money v={stat.income} cents={false} /></span>
      </div>
      <div className="summ-item">
        <span className="k">Saiu</span>
        <span className="v neg"><Money v={stat.expense} cents={false} /></span>
      </div>
      <div className="summ-sep" />
      <div className="summ-item">
        <span className="k">Saldo do mês</span>
        <span className={'v ' + (stat.net >= 0 ? 'pos' : 'neg')}>
          <Money v={stat.net} sign={stat.net >= 0 ? 'in' : 'out'} cents={false} />
        </span>
      </div>
      <div className="summ-flow">
        <div className="fl-track">
          <span className="in" style={{ width: (stat.income / flowTotal * 100) + '%' }} />
          <span className="out" style={{ width: (stat.expense / flowTotal * 100) + '%' }} />
        </div>
      </div>
      <div className="summ-actions">
        <button className="btn btn-primary" onClick={onAdd}>
          <Icon name="plus" /> Nova transação
        </button>
      </div>
    </div>
  );
}

/* ════ TOAST ═════════════════════════════════════════════════════════════ */
function Toast({ message }) {
  if (!message) return null;
  return <div className="toast"><Icon name="check" /> {message}</div>;
}

/* campo de ícone: upload de arquivo ou link da web */
function IconField({ value, shape = 'circle', color, onChange }) {
  const fileRef = React.useRef(null);
  const isData = typeof value === 'string' && value.startsWith('data:');
  const onFile = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result);
    reader.readAsDataURL(file);
    e.target.value = '';
  };
  return (
    <div className="icon-field">
      <div className={'icon-prev ' + shape} style={{ background: value ? 'var(--card-2)' : (color || 'var(--card-2)') }}>
        {value
          ? <img src={value} alt="" onError={(e) => { e.target.style.display = 'none'; }} />
          : <Icon name="image" style={{ color: 'oklch(0.99 0.02 70)', opacity: 0.85 }} />}
      </div>
      <div className="icon-ctrls">
        <div className="icon-btns">
          <button type="button" className="icon-up" onClick={() => fileRef.current && fileRef.current.click()}>
            <Icon name="upload" /> Enviar imagem
          </button>
          {value && <button type="button" className="icon-clear" onClick={() => onChange('')}>Remover</button>}
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onFile} />
        </div>
        <input className="text-field" type="url" placeholder="ou cole um link da web…"
               value={isData ? '' : (value || '')} onChange={e => onChange(e.target.value)} />
        {isData && <span className="icon-hint">Imagem enviada do dispositivo</span>}
      </div>
    </div>
  );
}

/* ════ FORM MODAL GENÉRICO (add / editar qualquer entidade) ══════════════ */
function FormModal({ open, title, fields, initial, submitLabel = 'Adicionar', accent = 'primary', onClose, onSave }) {
  const [vals, setVals] = React.useState({});
  const firstRef = React.useRef(null);

  React.useEffect(() => {
    if (!open) return;
    const v = {};
    fields.forEach(f => { v[f.key] = initial?.[f.key] ?? f.default ?? ''; });
    setVals(v);
    setTimeout(() => firstRef.current?.focus(), 60);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Enter' && !e.shiftKey && (e.target.tagName || '').toLowerCase() !== 'textarea') { e.preventDefault(); submit(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!open) return null;
  const set = (k, val) => setVals(s => ({ ...s, [k]: val }));
  const valid = fields.every(f => !f.required || (vals[f.key] !== '' && vals[f.key] != null && (f.type !== 'money' || parseAmount(vals[f.key]) > 0)));

  const submit = () => {
    if (!valid) return;
    const out = { ...vals };
    fields.forEach(f => {
      if (f.type === 'money') out[f.key] = parseAmount(out[f.key]);
      else if (f.type === 'number') out[f.key] = Number(out[f.key]) || 0;
    });
    onSave(out);
    onClose();
  };

  return (
    <div className="modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 440 }} role="dialog" aria-label={title}>
        <div className="form-head">
          <span className="form-title">{title}</span>
          <button className="modal-x" onClick={onClose} aria-label="Fechar"><Icon name="x" /></button>
        </div>
        <div className="modal-body">
          {fields.map((f, i) => (
            <div className="modal-field" key={f.key} style={i === 0 ? { marginTop: 0 } : null}>
              <label className="modal-label">{f.label}</label>
              {f.type === 'select' ? (
                <select className="select-field" ref={i === 0 ? firstRef : null} value={vals[f.key] ?? ''} onChange={e => set(f.key, e.target.value)}>
                  {f.options.map(o => {
                    const v = typeof o === 'object' ? o.value : o;
                    const l = typeof o === 'object' ? o.label : o;
                    return <option key={v} value={v}>{l}</option>;
                  })}
                </select>
              ) : f.type === 'segment' ? (
                <div className="chips">
                  {f.options.map(o => {
                    const v = typeof o === 'object' ? o.value : o;
                    const l = typeof o === 'object' ? o.label : o;
                    return <button key={v} type="button" className={'chip' + (vals[f.key] === v ? ' active' : '')} onClick={() => set(f.key, v)}>{l}</button>;
                  })}
                </div>
              ) : f.type === 'color' ? (
                <div className="swatch-row">
                  {f.options.map(c => (
                    <button key={c} type="button" className={'swatch-pick' + (vals[f.key] === c ? ' sel' : '')}
                            style={{ background: c }} onClick={() => set(f.key, c)} aria-label={c} />
                  ))}
                </div>
              ) : f.type === 'image' ? (
                <IconField value={vals[f.key]} shape={f.shape} color={f.colorKey ? vals[f.colorKey] : null} onChange={v => set(f.key, v)} />
              ) : f.type === 'money' ? (
                <div className="money-field">
                  <span className="mf-cur">R$</span>
                  <input ref={i === 0 ? firstRef : null} className="text-field" inputMode="decimal" type="text"
                         style={{ border: 'none', height: 'auto', padding: 0, background: 'transparent' }}
                         value={vals[f.key] ?? ''} placeholder="0,00" onChange={e => set(f.key, e.target.value)} />
                </div>
              ) : (
                <input ref={i === 0 ? firstRef : null} className="text-field" type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                       value={vals[f.key] ?? ''} placeholder={f.placeholder || ''} max={f.max}
                       onChange={e => set(f.key, e.target.value)} />
              )}
            </div>
          ))}
          <div className="modal-foot">
            <span className="hint"><kbd>↵</kbd> salva · <kbd>esc</kbd> fecha</span>
            <div className="grow" />
            <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button className={'btn ' + (accent === 'sea' ? 'btn-sea' : 'btn-primary')} onClick={submit} disabled={!valid} style={{ opacity: valid ? 1 : 0.5 }}>
              <Icon name="check" /> {submitLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { AddModal, QuickAdd, SummBar, Toast, parseAmount, FormModal });
