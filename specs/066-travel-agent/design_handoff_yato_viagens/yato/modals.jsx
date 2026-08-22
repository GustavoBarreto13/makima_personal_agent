/* ─────────────────────────────────────────────────────────────────────
   Yato · Viagens — modais
   ───────────────────────────────────────────────────────────────────── */
function Modal({ open, title, icon, wide, onClose, children, foot }) {
  React.useEffect(() => {
    if (!open) return;
    const h = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="ovl" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={'modal' + (wide ? ' wide' : '')}>
        <div className="m-head">
          {icon && <Icon name={icon} style={{ width: 18, height: 18, color: 'var(--yato-deep)' }} />}
          <span className="m-title">{title}</span>
          <button className="m-close" onClick={onClose}>✕</button>
        </div>
        <div className="m-body">{children}</div>
        {foot && <div className="m-foot">{foot}</div>}
      </div>
    </div>
  );
}

/* ── nova viagem ─────────────────────────────────────────────────────── */
function NewTripModal({ open, onClose, onSave }) {
  const [f, setF] = React.useState({ city: '', uf: '', start: '', end: '', profile: 'economia', title: '' });
  React.useEffect(() => { if (open) setF({ city: '', uf: '', start: '', end: '', profile: 'economia', title: '' }); }, [open]);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const errs = [];
  if (f.start && f.end && f.end < f.start) errs.push('A volta não pode ser antes da ida.');
  if (f.start && f.end && daysBetween(f.start, f.end) > 60) errs.push('Intervalo maior que 60 dias — quebre em duas viagens.');
  const known = f.city && f.uf && DOSSIERS[f.uf + '/' + f.city];
  const ok = f.city && f.uf && f.start && f.end && errs.length === 0;

  return (
    <Modal open={open} title="Nova viagem" icon="mochila" onClose={onClose}
      foot={<>
        <span className="m-note">UF é obrigatória — tem muita cidade com o mesmo nome nesse país.</span>
        <button className="btn btn-primary" style={{ marginLeft: 'auto' }} disabled={!ok}
                onClick={() => ok && onSave(f)}>Criar viagem</button>
      </>}>
      <div className="row2">
        <div className="field"><label>cidade</label>
          <input className="inp" value={f.city} onChange={e => set('city', e.target.value)} placeholder="Tiradentes" /></div>
        <div className="field"><label>uf</label>
          <select className="sel" value={f.uf} onChange={e => set('uf', e.target.value)}>
            <option value="">—</option>
            {UFS.map(u => <option key={u} value={u}>{u}</option>)}
          </select></div>
      </div>
      <div className="row2">
        <div className="field"><label>ida</label><input className="inp" type="date" value={f.start} onChange={e => set('start', e.target.value)} /></div>
        <div className="field"><label>volta</label><input className="inp" type="date" value={f.end} onChange={e => set('end', e.target.value)} /></div>
      </div>
      <div className="field"><label>perfil</label>
        <div className="seg">
          {['economia', 'equilibrado', 'conforto'].map(p => (
            <button key={p} className={f.profile === p ? 'on' : ''} onClick={() => set('profile', p)}>{p}</button>
          ))}
        </div>
      </div>
      <div className="field"><label>título (opcional)</label>
        <input className="inp" value={f.title} onChange={e => set('title', e.target.value)} placeholder="Barroco a pé" /></div>
      {errs.map(e => <div className="err" key={e}>{e}</div>)}
      {known && (
        <div className="banner" style={{ background: 'var(--verdict-ok-tint)', borderColor: 'var(--verdict-ok)' }}>
          <span className="b-sym" style={{ color: 'var(--verdict-ok)' }}>●</span>
          <span>Já temos dossiê de {known.city}/{known.uf}, checado em {fmtBRfull(known.last)}. Sai na frente.</span>
        </div>
      )}
    </Modal>
  );
}

/* ── novo item de roteiro ────────────────────────────────────────────── */
function NewItemModal({ open, trip, preset, onClose, onSave }) {
  const days = trip ? dayList(trip) : [];
  const [f, setF] = React.useState({ day: '', period: 'manha', time: '', title: '', addr: '', mode: 'a_pe', cost: '' });
  React.useEffect(() => {
    if (open) setF({ day: (preset && preset.day) || days[0] || '', period: (preset && preset.period) || 'manha', time: '', title: '', addr: '', mode: 'a_pe', cost: '' });
  }, [open, preset]);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const ok = f.title.trim() && f.day;
  React.useEffect(() => {
    if (!open) return;
    const h = e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && ok) onSave(f); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, f, ok, onSave]);

  return (
    <Modal open={open} title="Novo item de roteiro" icon="rota" onClose={onClose}
      foot={<>
        <span className="m-note">⌘/Ctrl+Enter salva. Sem horário confirmado, deixa em branco — não invento hora.</span>
        <button className="btn btn-primary" style={{ marginLeft: 'auto' }} disabled={!ok} onClick={() => ok && onSave(f)}>Salvar item</button>
      </>}>
      <div className="row2">
        <div className="field"><label>dia</label>
          <select className="sel" value={f.day} onChange={e => set('day', e.target.value)}>
            {days.map(d => <option key={d} value={d}>{fmtBR(d)} · {DOW[dparse(d).getDay()]}</option>)}
          </select></div>
        <div className="field"><label>horário (opcional)</label>
          <input className="inp" type="time" value={f.time} onChange={e => set('time', e.target.value)} /></div>
      </div>
      <div className="field"><label>período</label>
        <div className="seg">
          {[['manha', 'manhã'], ['tarde', 'tarde'], ['noite', 'noite']].map(([k, l]) => (
            <button key={k} className={f.period === k ? 'on' : ''} onClick={() => set('period', k)}>{l}</button>
          ))}
        </div>
      </div>
      <div className="field"><label>título</label>
        <input className="inp" value={f.title} onChange={e => set('title', e.target.value)} placeholder="Igreja São Francisco de Assis" /></div>
      <div className="field"><label>endereço</label>
        <input className="inp" value={f.addr} onChange={e => set('addr', e.target.value)} placeholder="R. Padre Toledo, 71" /></div>
      <div className="row2">
        <div className="field"><label>como chega</label>
          <div className="mode-pick">
            {Object.keys(MODE_EMOJI).map(m => (
              <button key={m} className={f.mode === m ? 'on' : ''} title={MODE_LABEL[m]} onClick={() => set('mode', m)}>{MODE_EMOJI[m]}</button>
            ))}
          </div></div>
        <div className="field"><label>custo estimado</label>
          <input className="inp" type="number" min="0" value={f.cost} onChange={e => set('cost', e.target.value)} placeholder="0" /></div>
      </div>
    </Modal>
  );
}

/* ── registrar gasto ─────────────────────────────────────────────────── */
function LogExpenseModal({ open, onClose, onSave }) {
  const [f, setF] = React.useState({ cat: 'alimentacao', v: '', desc: '', date: TODAY });
  React.useEffect(() => { if (open) setF({ cat: 'alimentacao', v: '', desc: '', date: TODAY }); }, [open]);
  const set = (k, x) => setF(p => ({ ...p, [k]: x }));
  const ok = Number(f.v) > 0 && f.desc.trim();
  return (
    <Modal open={open} title="Registrar gasto" icon="cifrao" onClose={onClose}
      foot={<>
        <span className="m-note">Lança nas finanças no ato — uma despesa por gasto. Se falhar, nada é salvo dos dois lados.</span>
        <button className="btn btn-primary" style={{ marginLeft: 'auto' }} disabled={!ok} onClick={() => ok && onSave(f)}>Registrar</button>
      </>}>
      <div className="row2">
        <div className="field"><label>categoria</label>
          <select className="sel" value={f.cat} onChange={e => set('cat', e.target.value)}>
            {BUDGET.map(b => <option key={b.cat} value={b.cat}>{b.label}</option>)}
          </select></div>
        <div className="field"><label>valor (R$)</label>
          <input className="inp" type="number" min="0" step="0.01" value={f.v} onChange={e => set('v', e.target.value)} placeholder="0,00" /></div>
      </div>
      <div className="field"><label>descrição</label>
        <input className="inp" value={f.desc} onChange={e => set('desc', e.target.value)} placeholder="Mototáxi até a trilha" /></div>
      <div className="field"><label>data</label>
        <input className="inp" type="date" value={f.date} onChange={e => set('date', e.target.value)} /></div>
    </Modal>
  );
}

/* ── ⭐ wizard do protocolo — um passo por vez ───────────────────────── */
const SOURCES = [
  ['simulacao_in_app', 'simulação in-app'], ['pagina_oficial', 'página oficial'],
  ['google_maps', 'Google Maps'], ['moovit', 'Moovit'],
  ['contato_hospedagem', 'contato com hospedagem'], ['relato_local', 'relato local'], ['outro', 'outro'],
];

function ProtocolWizard({ open, dossier, startKey, onClose, onSave }) {
  const idx0 = Math.max(0, STEPS.findIndex(s => s.key === startKey));
  const [i, setI] = React.useState(idx0);
  const [ev, setEv] = React.useState('');
  const [src, setSrc] = React.useState('simulacao_in_app');
  React.useEffect(() => { if (open) { setI(Math.max(0, STEPS.findIndex(s => s.key === startKey))); setEv(''); setSrc('simulacao_in_app'); } }, [open, startKey]);
  if (!open) return null;

  const step = STEPS[i];
  const cur = dossier && dossier.checks[step.key];
  const go = n => { setI(Math.min(STEPS.length - 1, Math.max(0, n))); setEv(''); };
  const save = v => { onSave(step.key, v, ev, src); if (i < STEPS.length - 1) go(i + 1); else onClose(); };

  return (
    <Modal open={open} wide title={'Protocolo de mobilidade' + (dossier ? ' · ' + dossier.city + '/' + dossier.uf : '')}
      icon="carimbo" onClose={onClose}
      foot={<>
        <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>passo {i + 1} de {STEPS.length}</span>
        <button className="btn btn-sm" onClick={() => save('pendente')}>Pular por ora</button>
        <div className="wiz-nav">
          <button onClick={() => go(i - 1)} disabled={i === 0}><Icon name="chevL" style={{ width: 14, height: 14 }} /></button>
          <button onClick={() => go(i + 1)} disabled={i === STEPS.length - 1}><Icon name="chevR" style={{ width: 14, height: 14 }} /></button>
        </div>
      </>}>
      <div>
        <div className="wiz-step">passo {step.n} de 7</div>
        <div className="dos-title" style={{ marginTop: 4 }}>{step.name}</div>
        {cur && cur.v && cur.v !== 'pendente' && (
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 9 }}>
            <VerdictChip v={cur.v} />
            <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>já registrado {cur.at ? 'em ' + fmtBR(cur.at) : ''}</span>
          </div>
        )}
      </div>
      <div className="wiz-instr"><span className="wi-k">o que fazer, literalmente</span>{step.instr}</div>
      <div className="field"><label>evidência</label>
        <textarea className="inp" rows="3" value={ev} onChange={e => setEv(e.target.value)}
                  placeholder="O que você viu, com número e endereço quando der." /></div>
      <div className="field"><label>fonte</label>
        <select className="sel" value={src} onChange={e => setSrc(e.target.value)}>
          {SOURCES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select></div>
      <div className="wiz-verdicts">
        <button className="wv v-ok" onClick={() => save('confirmado')}><span className="wv-sym">●</span>confirmado</button>
        <button className="wv v-none" onClick={() => save('ausente')}><span className="wv-sym">⊖</span>ausente</button>
        <button className="wv v-unknown" onClick={() => save('inconclusivo')}><span className="wv-sym">◐</span>inconclusivo</button>
      </div>
      <span className="m-note">Registrar dúvida é resultado, não desistência. Inconclusivo vale tanto quanto os outros dois.</span>
    </Modal>
  );
}

Object.assign(window, { Modal, NewTripModal, NewItemModal, LogExpenseModal, ProtocolWizard, SOURCES });
