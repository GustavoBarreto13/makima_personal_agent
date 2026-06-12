/* ─────────────────────────────────────────────────────────────────────────
   Akane · Filmes — Logar filme (modal rápido) + barra "Próxima sessão"
   A busca é o caminho principal (quase todo filme logado é novo). O seletor
   de filmes já na base fica como atalho secundário. ⌘↵ loga, Esc fecha.
   ───────────────────────────────────────────────────────────────────────── */

function baseCandidates() {
  const watch = FILMS.filter(f => f.status === 'watchlist');
  const recent = FILMS.filter(f => f.status === 'watched').slice(0, 8);
  return [...watch, ...recent];
}

function LogModal({ open, presetFilmId, onClose, onSave }) {
  const [picks, setPicks] = React.useState(baseCandidates);
  const [filmId, setFilmId] = React.useState(presetFilmId || picks[0]?.id);
  const [date, setDate] = React.useState(TODAY);
  const [rating, setRating] = React.useState(0);
  const [liked, setLiked] = React.useState(false);
  const [rewatch, setRewatch] = React.useState(false);
  const [note, setNote] = React.useState('');

  // busca "API" de filmes novos (caminho principal)
  const [searchQ, setSearchQ] = React.useState('');
  const [searching, setSearching] = React.useState(false);
  const [results, setResults] = React.useState([]);

  React.useEffect(() => {
    if (!open) return;
    const base = baseCandidates();
    const initial = presetFilmId || base[0]?.id;
    setPicks(base); setFilmId(initial); setDate(TODAY); setRating(0); setLiked(false); setNote('');
    setSearchQ(''); setResults([]); setSearching(false);
    const f = filmById(initial);
    setRewatch(!!(f && f.status === 'watched'));
  }, [open, presetFilmId]);

  // debounce + latência simulada da API
  React.useEffect(() => {
    const q = searchQ.trim();
    if (!q) { setResults([]); setSearching(false); return; }
    setSearching(true);
    const id = setTimeout(() => { setResults(searchTmdb(q)); setSearching(false); }, 480);
    return () => clearTimeout(id);
  }, [searchQ]);

  const selectFilm = (id) => {
    setFilmId(id);
    const f = filmById(id);
    setRewatch(!!(f && f.status === 'watched'));
  };

  const addNew = (entry) => {
    const f = addFilmFromCatalog(entry);
    setPicks(p => p.find(x => x.id === f.id) ? p : [f, ...p]);
    setFilmId(f.id); setRewatch(false);
    setSearchQ(''); setResults([]);
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
  const film = filmById(filmId) || picks[0];

  const doSave = () => {
    onSave({ filmId, date, rating: rating || null, liked, rewatch, note: note.trim() });
    onClose();
  };

  return (
    <div className="modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-label="Logar filme">
        <div className="modal-head">
          <span className="modal-title">Logar filme</span>
          <button className="modal-x" onClick={onClose} aria-label="Fechar"><Icon name="x" /></button>
        </div>
        <div className="modal-body">

          <label className="modal-label">Qual filme? <span className="ml-hint">· busque pelo nome, diretor ou ano</span></label>
          <div className="film-search primary">
            <div className="film-search-bar">
              <Icon name="search" />
              <input autoFocus value={searchQ} onChange={e => setSearchQ(e.target.value)}
                     placeholder="Ex.: Oldboy, Wong Kar-wai, 1997…" />
              {searching && <span className="fs-spin" />}
            </div>
            {searchQ.trim() && (
              <div className="film-search-results">
                {searching && <div className="fs-status">Buscando na base de filmes…</div>}
                {!searching && results.length === 0 && (
                  <div className="fs-status">Nada encontrado para “{searchQ.trim()}”. <span className="fs-hint">Tente o título original.</span></div>
                )}
                {!searching && results.map(r => (
                  <div key={r.id} className="fs-result" onClick={() => addNew(r)}>
                    <div className="fs-poster"><Poster film={r} /></div>
                    <div className="fs-meta">
                      <div className="fs-title">{r.title} <span className="fs-year">{r.year}</span></div>
                      <div className="fs-sub">{r.director} · {fmtRuntime(r.runtime)} · {r.country}</div>
                      <div className="fs-genre">{r.genre}</div>
                    </div>
                    <span className="fs-add"><Icon name="plus" /> Logar este</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {film && (
            <div className="log-target">
              <div className="lt-poster"><Poster film={film} /></div>
              <div className="lt-meta">
                <div className="lt-title">{film.title} <span>{film.year}</span></div>
                <div className="lt-sub">vai para o seu diário</div>
              </div>
              <span className="lt-check"><Icon name="check" /></span>
            </div>
          )}

          <details className="pick-fold">
            <summary>Ou escolha um que já está na sua base</summary>
            <div className="filmpick">
              {picks.map(f => (
                <div key={f.id} className={'pick' + (f.id === filmId ? ' sel' : '')} onClick={() => selectFilm(f.id)} title={f.title}>
                  <Poster film={f} />
                </div>
              ))}
            </div>
          </details>

          <div className="modal-field" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label className="modal-label">Quando você viu?</label>
              <input className="date-input" type="date" value={date} max={TODAY} onChange={e => setDate(e.target.value)} />
            </div>
            <div>
              <label className="modal-label">Sua nota</label>
              <RateInput value={rating} onChange={setRating} />
            </div>
          </div>

          <div className="modal-field">
            <label className="modal-label">Marcadores</label>
            <div className="toggle-row">
              <button className={'toggle-pill like' + (liked ? ' on' : '')} onClick={() => setLiked(v => !v)}>
                <Heart filled={liked} /> Curtir
              </button>
              <button className={'toggle-pill rw' + (rewatch ? ' on' : '')} onClick={() => setRewatch(v => !v)}>
                <Icon name="rewatch" /> Revisão
              </button>
            </div>
          </div>

          <div className="modal-field">
            <label className="modal-label">Anotação <span style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--ink-4)' }}>· opcional</span></label>
            <textarea className="note-input" value={note} onChange={e => setNote(e.target.value)} placeholder="O que ficou desse filme?" />
          </div>

          <div className="modal-foot">
            <span className="hint"><kbd>⌘</kbd> <kbd>↵</kbd> para logar</span>
            <div className="grow" />
            <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary" onClick={doSave}><Icon name="check" /> Logar filme</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Barra "próxima sessão" (planeje a próxima da watchlist) ─────────────── */
function NextBar({ navigate, openLog }) {
  const want = FILMS.filter(f => f.status === 'watchlist');
  const [idx, setIdx] = React.useState(0);
  if (!want.length) return null;
  const f = want[idx % want.length];

  return (
    <div className="footbar">
      <span className="fb-label">Próxima sessão</span>
      <div className="poster" onClick={() => navigate('detalhe', f.id)} style={{ width: 40 }}><Poster film={f} /></div>
      <div className="footbar-info">
        <div className="footbar-title" onClick={() => navigate('detalhe', f.id)}>{f.title}</div>
        <div className="footbar-sub">{f.director} · {f.year} · {fmtRuntime(f.runtime)}</div>
      </div>
      {want.length > 1 && (
        <div className="footbar-switch">
          <button onClick={() => setIdx(i => (i - 1 + want.length) % want.length)} aria-label="Anterior"><Icon name="chevL" /></button>
          <button onClick={() => setIdx(i => (i + 1) % want.length)} aria-label="Próximo"><Icon name="chevR" /></button>
        </div>
      )}
      <div className="footbar-actions">
        <button className="btn btn-primary" onClick={() => openLog(f.id)} style={{ padding: '9px 16px' }}>
          <Icon name="check" /> Já vi
        </button>
      </div>
    </div>
  );
}

function Toast({ message }) {
  if (!message) return null;
  return <div className="toast"><Icon name="check" /> {message}</div>;
}

Object.assign(window, { LogModal, NextBar, Toast });
