/* ─────────────────────────────────────────────────────────────────────────
   Marin · Animes — Logar episódio (modal) + Adicionar anime (busca) +
   barra "Próximo episódio" + Toast. A busca (Jikan mock) é o caminho de
   adição; o log assume um anime do acervo. ⌘↵ loga, Esc fecha.
   ───────────────────────────────────────────────────────────────────────── */

function baseCandidates() {
  const watching = ANIMES.filter(a => a.status === 'assistindo');
  const rest = ANIMES.filter(a => a.status !== 'assistindo').slice(0, 8);
  return [...watching, ...rest];
}

/* ── Resultado de busca (compartilhado) ─────────────────────────────────── */
function SearchResults({ q, searching, results, onAdd }) {
  if (!q.trim()) return null;
  return (
    <div className="anime-search-results">
      {searching && <div className="fs-status">Buscando no MAL / Jikan…</div>}
      {!searching && results.length === 0 && (
        <div className="fs-status">Nada encontrado para “{q.trim()}”. <span className="fs-hint">Tente o título em inglês ou o estúdio.</span></div>
      )}
      {!searching && results.map(r => {
        const have = animeById(r.id);
        return (
          <div key={r.id} className="fs-result" onClick={() => !have && onAdd(r)}>
            <div className="fs-poster"><PosterCard anime={r} /></div>
            <div className="fs-meta">
              <div className="fs-title">{r.title} <span className="fs-year">{r.year}</span></div>
              <div className="fs-sub">{r.studio} · {r.episodes_total} eps · {r.media_type}</div>
              <div className="fs-genre">{r.genres.join(' · ')}</div>
            </div>
            {have ? <span className="fs-have">já na lista</span> : <span className="fs-add"><Icon name="plus" /> Adicionar</span>}
          </div>
        );
      })}
    </div>
  );
}

/* ── Modal: Logar episódio ──────────────────────────────────────────────── */
function LogWatchModal({ open, presetAnimeId, presetEp, onClose, onSave }) {
  const [picks, setPicks] = React.useState(baseCandidates);
  const [animeId, setAnimeId] = React.useState(presetAnimeId || picks[0]?.id);
  const [epStart, setEpStart] = React.useState(1);
  const [epEnd, setEpEnd] = React.useState(1);
  const [date, setDate] = React.useState(TODAY);
  const [score, setScore] = React.useState(0);
  const [fav, setFav] = React.useState(false);
  const [note, setNote] = React.useState('');
  const [searchQ, setSearchQ] = React.useState('');
  const [searching, setSearching] = React.useState(false);
  const [results, setResults] = React.useState([]);

  React.useEffect(() => {
    if (!open) return;
    const base = baseCandidates();
    const initial = presetAnimeId || base[0]?.id;
    const a = animeById(initial);
    const start = presetEp || (a ? a.episodes_watched + 1 : 1);
    setPicks(base); setAnimeId(initial); setEpStart(start); setEpEnd(start);
    setDate(TODAY); setScore(a && a.score ? a.score : 0); setFav(!!(a && a.fav)); setNote('');
    setSearchQ(''); setResults([]); setSearching(false);
  }, [open, presetAnimeId, presetEp]);

  React.useEffect(() => {
    const q = searchQ.trim();
    if (!q) { setResults([]); setSearching(false); return; }
    setSearching(true);
    const id = setTimeout(() => { setResults(searchJikan(q)); setSearching(false); }, 460);
    return () => clearTimeout(id);
  }, [searchQ]);

  const selectAnime = (id) => {
    const a = animeById(id);
    setAnimeId(id);
    const start = a ? a.episodes_watched + 1 : 1;
    setEpStart(start); setEpEnd(start);
    setScore(a && a.score ? a.score : 0); setFav(!!(a && a.fav));
  };
  const addNew = (entry) => {
    const a = addAnimeFromCatalog(entry);
    setPicks(p => p.find(x => x.id === a.id) ? p : [a, ...p]);
    selectAnime(a.id); setSearchQ(''); setResults([]);
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
  const anime = animeById(animeId) || picks[0];

  const doSave = () => {
    const s = Math.max(1, parseInt(epStart) || 1);
    const e = Math.max(s, parseInt(epEnd) || s);
    onSave({ animeId, epStart: s, epEnd: e, date, score: score || null, fav, note: note.trim() });
    onClose();
  };

  return (
    <div className="modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-label="Logar episódio">
        <div className="modal-head">
          <span className="modal-title">🎌 Logar episódio</span>
          <button className="modal-x" onClick={onClose} aria-label="Fechar"><Icon name="x" /></button>
        </div>
        <div className="modal-body">
          {anime && (
            <div className="log-target">
              <div className="lt-poster"><PosterCard anime={anime} /></div>
              <div className="lt-meta">
                <div className="lt-title">{anime.title}</div>
                <div className="lt-sub">vai para o seu diário</div>
              </div>
              <span className="lt-check"><Icon name="check" /></span>
            </div>
          )}

          <details className="pick-fold">
            <summary>Trocar de anime ou adicionar um novo</summary>
            <div className="modal-field" style={{ marginTop: 12 }}>
              <div className="anime-search">
                <div className="anime-search-bar">
                  <Icon name="search" />
                  <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Buscar no MAL: Steins;Gate, Ghibli, 2011…" />
                  {searching && <span className="fs-spin" />}
                </div>
                <SearchResults q={searchQ} searching={searching} results={results} onAdd={addNew} />
              </div>
            </div>
            <div className="animepick">
              {picks.map(a => (
                <div key={a.id} className={'pick' + (a.id === animeId ? ' sel' : '')} onClick={() => selectAnime(a.id)} title={a.title}>
                  <PosterCard anime={a} />
                </div>
              ))}
            </div>
          </details>

          <div className="modal-field">
            <label className="modal-label">Episódios assistidos</label>
            <div className="ep-range">
              <div>
                <input className="num-input" type="number" min="1" value={epStart} onChange={e => setEpStart(e.target.value)} placeholder="do ep" />
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--ink-4)', marginTop: 5, textTransform: 'uppercase', letterSpacing: '0.1em' }}>episódio inicial</div>
              </div>
              <div>
                <input className="num-input" type="number" min={epStart} value={epEnd} onChange={e => setEpEnd(e.target.value)} placeholder="até o ep" />
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--ink-4)', marginTop: 5, textTransform: 'uppercase', letterSpacing: '0.1em' }}>episódio final</div>
              </div>
            </div>
          </div>

          <div className="modal-field">
            <label className="modal-label">Quando você viu?</label>
            <input className="date-input" type="date" value={date} max={TODAY} onChange={e => setDate(e.target.value)} />
          </div>

          <div className="modal-field">
            <label className="modal-label">Sua nota <span className="ml-hint">· escala MAL 0–10</span></label>
            <RateInput value={score} onChange={setScore} />
          </div>

          <div className="modal-field">
            <label className="modal-label">Marcadores</label>
            <div className="toggle-row">
              <button className={'toggle-pill like' + (fav ? ' on' : '')} onClick={() => setFav(v => !v)}>
                <Heart filled={fav} /> Favorito
              </button>
            </div>
          </div>

          <div className="modal-field">
            <label className="modal-label">Notas livres <span className="ml-hint">· opcional</span></label>
            <textarea className="note-input" value={note} onChange={e => setNote(e.target.value)} placeholder="O que você achou? ✨" />
          </div>

          <div className="modal-foot">
            <span className="hint"><kbd>⌘</kbd> <kbd>↵</kbd> para logar</span>
            <div className="grow" />
            <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary" onClick={doSave}><Icon name="check" /> Logar</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Modal: Adicionar anime (busca rápida, topbar +) ────────────────────── */
function AddAnimeModal({ open, onClose, onAdd, navigate }) {
  const [searchQ, setSearchQ] = React.useState('');
  const [searching, setSearching] = React.useState(false);
  const [results, setResults] = React.useState([]);

  React.useEffect(() => {
    if (!open) return;
    setSearchQ(''); setResults([]); setSearching(false);
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  React.useEffect(() => {
    const q = searchQ.trim();
    if (!q) { setResults([]); setSearching(false); return; }
    setSearching(true);
    const id = setTimeout(() => { setResults(searchJikan(q)); setSearching(false); }, 460);
    return () => clearTimeout(id);
  }, [searchQ]);

  if (!open) return null;
  const add = (entry) => { const a = addAnimeFromCatalog(entry); onAdd(a); };

  return (
    <div className="modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-label="Adicionar anime">
        <div className="modal-head">
          <span className="modal-title">✨ Adicionar anime</span>
          <button className="modal-x" onClick={onClose} aria-label="Fechar"><Icon name="x" /></button>
        </div>
        <div className="modal-body">
          <label className="modal-label">Buscar no MAL <span className="ml-hint">· nome, estúdio, gênero ou ano</span></label>
          <div className="anime-search">
            <div className="anime-search-bar">
              <Icon name="search" />
              <input autoFocus value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Ex.: Cowboy Bebop, Ghibli, Mystery…" />
              {searching && <span className="fs-spin" />}
            </div>
            <SearchResults q={searchQ} searching={searching} results={results} onAdd={add} />
          </div>
          {!searchQ.trim() && (
            <p className="fs-status" style={{ marginTop: 10 }}>Digite para buscar na base do MyAnimeList. O anime entra como <b style={{ color: 'var(--st-quero_assistir)', fontStyle: 'normal' }}>Quero assistir</b>. 🎌</p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Barra "próximo episódio" ───────────────────────────────────────────── */
function NextBar({ navigate, openLog }) {
  const [idx, setIdx] = React.useState(0);
  if (!SCHEDULE.length) return null;
  const s = SCHEDULE[idx % SCHEDULE.length];
  const a = animeById(s.animeId);
  if (!a) return null;

  return (
    <div className="footbar">
      <span className="fb-label"><span className="pulse" style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: 'var(--cyan)' }} /> Próximo ep</span>
      <div className="poster" onClick={() => navigate('detalhe', a.id)} style={{ width: 42 }}><PosterCard anime={a} /></div>
      <div className="footbar-info">
        <div className="footbar-title" onClick={() => navigate('detalhe', a.id)}>{a.title}</div>
        <div className="footbar-sub">Ep {s.ep} · {s.title} · {relFuture(s.aired)}</div>
      </div>
      {SCHEDULE.length > 1 && (
        <div className="footbar-switch">
          <button onClick={() => setIdx(i => (i - 1 + SCHEDULE.length) % SCHEDULE.length)} aria-label="Anterior"><Icon name="chevL" /></button>
          <button onClick={() => setIdx(i => (i + 1) % SCHEDULE.length)} aria-label="Próximo"><Icon name="chevR" /></button>
        </div>
      )}
      <div className="footbar-actions">
        <button className="btn btn-primary" onClick={() => openLog(a.id, a.episodes_watched + 1)} style={{ padding: '10px 16px' }}>
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

Object.assign(window, { LogWatchModal, AddAnimeModal, SearchResults, NextBar, Toast });
