/* ─────────────────────────────────────────────────────────────────────────
   Frieren · Livros — registrar leitura (modal rápido) + barra "agora lendo"
   Princípio: abrir, registrar, sair. Livro pré-selecionado, página pré-
   preenchida, Enter salva, Esc fecha. Nota e avaliação são opcionais.
   ───────────────────────────────────────────────────────────────────────── */

function LogModal({ open, presetBookId, onClose, onSave }) {
  // candidatos: lendo agora primeiro, depois últimos lidos
  const candidates = React.useMemo(() => {
    const reading = BOOKS.filter(b => b.status === 'reading');
    const recent = BOOKS.filter(b => b.status === 'read').slice(0, 6);
    const wish = BOOKS.filter(b => b.status === 'wishlist').slice(0, 3);
    return [...reading, ...recent, ...wish];
  }, []);

  const [bookId, setBookId] = React.useState(presetBookId || candidates[0]?.id);
  const [page, setPage] = React.useState(0);
  const [note, setNote] = React.useState('');
  const [finished, setFinished] = React.useState(false);
  const [rating, setRating] = React.useState(0);

  const book = bookById(bookId) || candidates[0];

  // (re)inicializa ao abrir
  React.useEffect(() => {
    if (!open) return;
    const initial = presetBookId || candidates[0]?.id;
    setBookId(initial);
    const bk = bookById(initial);
    setPage(bk?.page || 0);
    setNote(''); setFinished(false); setRating(0);
  }, [open, presetBookId]);

  // ao trocar de livro dentro do modal, ajusta a página corrente
  const selectBook = (id) => {
    setBookId(id);
    const bk = bookById(id);
    setPage(bk?.page || 0);
    setFinished(false);
  };

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) doSave();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!open) return null;

  const total = book?.pages || 0;
  const bump = (n) => setPage(p => Math.min(total, Math.max(0, (Number(p) || 0) + n)));
  const doSave = () => {
    onSave({
      bookId, page: Number(page) || 0,
      note: note.trim(), finished,
      rating: finished && rating ? rating : null,
    });
    onClose();
  };

  return (
    <div className="modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-label="Registrar leitura">
        <div className="modal-head">
          <span className="modal-title">Registrar leitura</span>
          <button className="modal-x" onClick={onClose} aria-label="Fechar"><Icon name="x" /></button>
        </div>
        <div className="modal-body">

          {/* livro */}
          <label className="modal-label">Qual livro?</label>
          <div className="bookpick">
            {candidates.map(b => (
              <div key={b.id} className={'pick' + (b.id === bookId ? ' sel' : '')} onClick={() => selectBook(b.id)} title={b.title}>
                <Cover book={b} />
              </div>
            ))}
          </div>

          {/* página */}
          <div className="modal-field">
            <label className="modal-label">Você parou na página…</label>
            <div className="page-input-row">
              <input className="page-input" type="number" min="0" max={total} value={page}
                     onChange={e => setPage(e.target.value)} autoFocus />
              <span className="page-total">de {total}</span>
            </div>
            <div className="quick-add">
              <button onClick={() => bump(10)}>+10</button>
              <button onClick={() => bump(25)}>+25</button>
              <button onClick={() => bump(50)}>+50</button>
              <button onClick={() => setPage(total)}>terminei</button>
              {total > 0 && <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-3)', alignSelf: 'center' }}>{Math.round((Number(page) || 0) / total * 100)}%</span>}
            </div>
          </div>

          {/* nota opcional */}
          <div className="modal-field">
            <label className="modal-label">Uma linha sobre hoje <span style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--ink-4)' }}>· opcional</span></label>
            <textarea className="note-input" value={note} onChange={e => setNote(e.target.value)}
                      placeholder="O que ficou de hoje?" />
          </div>

          {/* terminei + avaliação */}
          <div className="modal-field">
            <label style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', fontSize: 13.5, color: 'var(--ink-2)' }}>
              <input type="checkbox" checked={finished} onChange={e => setFinished(e.target.checked)}
                     style={{ width: 16, height: 16, accentColor: 'var(--teal)' }} />
              Terminei este livro
            </label>
            {finished && (
              <div style={{ marginTop: 14 }}>
                <label className="modal-label">Sua nota</label>
                <div className="rate-pick">
                  {[1,2,3,4,5].map(n => (
                    <button key={n} className={'star-btn' + (n <= rating ? ' on' : '')} onClick={() => setRating(n)}>
                      <StarShape filled />
                    </button>
                  ))}
                  {rating > 0 && <button className="rate-clear" onClick={() => setRating(0)}>limpar</button>}
                </div>
              </div>
            )}
          </div>

          <div className="modal-foot">
            <span className="hint"><kbd>⌘</kbd> <kbd>↵</kbd> para salvar</span>
            <div className="grow" />
            <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary" onClick={doSave}><Icon name="check" /> Salvar</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Barra "agora lendo" ────────────────────────────────────────────────── */
function NowBar({ navigate, openLog }) {
  const reading = BOOKS.filter(b => b.status === 'reading');
  const [idx, setIdx] = React.useState(0);
  const b = reading[idx % reading.length] || reading[0];
  if (!b) return null;

  return (
    <div className="nowbar">
      <div className="nowbar-cover" onClick={() => navigate('detalhe', b.id)} style={{ cursor: 'pointer', width: 44, flexShrink: 0 }}>
        <Cover book={b} />
      </div>
      <div className="nowbar-info">
        <div className="nowbar-title" onClick={() => navigate('detalhe', b.id)} style={{ cursor: 'pointer' }}>{b.title}</div>
        <div className="nowbar-author">{b.author}</div>
      </div>
      <div className="nowbar-prog">
        <span className="pg">{b.page}</span>
        <ProgressBar value={b.progress} />
        <span className="pg">{b.pages}</span>
      </div>
      {reading.length > 1 && (
        <div className="nowbar-switch">
          <button onClick={() => setIdx(i => (i - 1 + reading.length) % reading.length)} aria-label="Anterior"><Icon name="chevL" /></button>
          <button onClick={() => setIdx(i => (i + 1) % reading.length)} aria-label="Próximo"><Icon name="chevR" /></button>
        </div>
      )}
      <div className="nowbar-actions">
        <button className="btn btn-primary" onClick={() => openLog(b.id)} style={{ padding: '9px 16px' }}>
          <Icon name="plus" /> Registrar
        </button>
      </div>
    </div>
  );
}

/* ── Toast ──────────────────────────────────────────────────────────────── */
function Toast({ message }) {
  if (!message) return null;
  return <div className="toast"><Icon name="check" /> {message}</div>;
}

Object.assign(window, { LogModal, NowBar, Toast });
