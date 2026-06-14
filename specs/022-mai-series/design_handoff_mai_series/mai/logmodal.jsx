/* ─────────────────────────────────────────────────────────────────────────
   Mai · Séries — Logar sessão (modal, com TEMPORADA + ep_start/ep_end) +
   Adicionar série (busca TMDB mock) + barra "Próximo episódio" + Toast.
   ⌘↵ loga, Esc fecha.
   ───────────────────────────────────────────────────────────────────────── */

function baseCandidates() {
  const watching = SERIES.filter(a => a.status === 'assistindo');
  const rest = SERIES.filter(a => a.status !== 'assistindo').slice(0, 8);
  return [...watching, ...rest];
}

/* ── Resultado de busca (compartilhado) ─────────────────────────────────── */
function SearchResults({ q, searching, results, onAdd }) {
  if (!q.trim()) return null;
  return (
    <div className="series-search-results">
      {searching && <div className="fs-status">Buscando no TMDB…</div>}
      {!searching && results.length === 0 && (
        <div className="fs-status">Nada encontrado para “{q.trim()}”. <span className="fs-hint">Tente o título em inglês ou a rede.</span></div>
      )}
      {!searching && results.map(r => {
        const have = seriesById(r.id);
        return (
          <div key={r.id} className="fs-result" onClick={() => !have && onAdd(r)}>
            <div className="fs-poster"><PosterCard series={r} /></div>
            <div className="fs-meta">
              <div className="fs-title">{r.title} <span className="fs-year">{r.first_air_year}</span></div>
              <div className="fs-sub">{r.network} · {r.seasons.length} {r.seasons.length === 1 ? 'temp' : 'temps'}</div>
              <div className="fs-genre">{r.genres.join(' · ')}</div>
            </div>
            {have ? <span className="fs-have">já na lista</span> : <span className="fs-add"><Icon name="plus" /> Adicionar</span>}
          </div>
        );
      })}
    </div>
  );
}

/* ── Modal: Logar sessão ────────────────────────────────────────────────── */
function LogWatchModal({ open, presetSeriesId, presetSeason, presetEp, onClose, onSave }) {
  const [picks, setPicks] = React.useState(baseCandidates);
  const [seriesId, setSeriesId] = React.useState(presetSeriesId || picks[0]?.id);
  const [season, setSeason] = React.useState(1);
  const [epStart, setEpStart] = React.useState(1);
  const [epEnd, setEpEnd] = React.useState(1);
  const [date, setDate] = React.useState(TODAY);
  const [score, setScore] = React.useState(0);
  const [fav, setFav] = React.useState(false);
  const [note, setNote] = React.useState('');
  const [searchQ, setSearchQ] = React.useState('');
  const [searching, setSearching] = React.useState(false);
  const [results, setResults] = React.useState([]);

  const applySeries = (a, presetS, presetE) => {
    const s = presetS || (a.next ? a.next.season : a.seasons[a.seasons.length - 1].n);
    const se = a.seasons.find(x => x.n === s) || a.seasons[0];
    const start = presetE || (a.next && a.next.season === s ? a.next.number : se.watched + 1);
    setSeason(s); setEpStart(start); setEpEnd(start);
    setScore(a && a.score ? a.score : 0); setFav(!!(a && a.fav));
  };

  React.useEffect(() => {
    if (!open) return;
    const base = baseCandidates();
    const initial = presetSeriesId || base[0]?.id;
    const a = seriesById(initial);
    setPicks(base); setSeriesId(initial);
    if (a) applySeries(a, presetSeason, presetEp);
    setDate(TODAY); setNote('');
    setSearchQ(''); setResults([]); setSearching(false);
  }, [open, presetSeriesId, presetSeason, presetEp]);

  React.useEffect(() => {
    const q = searchQ.trim();
    if (!q) { setResults([]); setSearching(false); return; }
    setSearching(true);
    const id = setTimeout(() => { setResults(searchTmdb(q)); setSearching(false); }, 440);
    return () => clearTimeout(id);
  }, [searchQ]);

  const selectSeries = (id) => {
    const a = seriesById(id);
    setSeriesId(id);
    if (a) applySeries(a);
  };
  const addNew = (entry) => {
    const a = addSeriesFromCatalog(entry);
    setPicks(p => p.find(x => x.id === a.id) ? p : [a, ...p]);
    selectSeries(a.id); setSearchQ(''); setResults([]);
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
  const series = seriesById(seriesId) || picks[0];

  const doSave = () => {
    const s = Math.max(1, parseInt(epStart) || 1);
    const e = Math.max(s, parseInt(epEnd) || s);
    onSave({ seriesId, season: parseInt(season) || 1, epStart: s, epEnd: e, date, score: score || null, fav, note: note.trim() });
    onClose();
  };

  return (
    <div className="modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-label="Logar sessão">
        <div className="modal-head">
          <span className="modal-title">📺 Logar sessão</span>
          <button className="modal-x" onClick={onClose} aria-label="Fechar"><Icon name="x" /></button>
        </div>
        <div className="modal-body">
          {series && (
            <div className="log-target">
              <div className="lt-poster"><PosterCard series={series} /></div>
              <div className="lt-meta">
                <div className="lt-title">{series.title}</div>
                <div className="lt-sub">vai para o seu diário</div>
              </div>
              <span className="lt-check"><Icon name="check" /></span>
            </div>
          )}

          <details className="pick-fold">
            <summary>Trocar de série ou adicionar uma nova</summary>
            <div className="modal-field" style={{ marginTop: 12 }}>
              <div className="series-search">
                <div className="series-search-bar">
                  <Icon name="search" />
                  <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Buscar no TMDB: The Wire, HBO, 2014…" />
                  {searching && <span className="fs-spin" />}
                </div>
                <SearchResults q={searchQ} searching={searching} results={results} onAdd={addNew} />
              </div>
            </div>
            <div className="seriespick">
              {picks.map(a => (
                <div key={a.id} className={'pick' + (a.id === seriesId ? ' sel' : '')} onClick={() => selectSeries(a.id)} title={a.title}>
                  <PosterCard series={a} />
                </div>
              ))}
            </div>
          </details>

          <div className="modal-field">
            <label className="modal-label">Temporada e episódios</label>
            <div className="ep-range">
              <div>
                <select className="select-input" value={season} onChange={e => {
                  const s = parseInt(e.target.value); setSeason(s);
                  const se = series.seasons.find(x => x.n === s);
                  const start = se ? se.watched + 1 : 1; setEpStart(start); setEpEnd(start);
                }}>
                  {series.seasons.map(se => <option key={se.n} value={se.n}>{se.name ? se.name : `Temporada ${se.n}`}</option>)}
                </select>
                <div className="field-cap">temporada</div>
              </div>
              <div>
                <input className="num-input" type="number" min="1" value={epStart} onChange={e => setEpStart(e.target.value)} placeholder="do ep" />
                <div className="field-cap">ep inicial</div>
              </div>
              <div>
                <input className="num-input" type="number" min={epStart} value={epEnd} onChange={e => setEpEnd(e.target.value)} placeholder="até" />
                <div className="field-cap">ep final</div>
              </div>
            </div>
          </div>

          <div className="modal-field">
            <label className="modal-label">Quando você viu?</label>
            <input className="date-input" type="date" value={date} max={TODAY} onChange={e => setDate(e.target.value)} />
          </div>

          <div className="modal-field">
            <label className="modal-label">Sua nota <span className="ml-hint">· escala 0.5–5.0</span></label>
            <RateInput value={score} onChange={setScore} />
          </div>

          <div className="modal-field">
            <label className="modal-label">Marcadores</label>
            <div className="toggle-row">
              <button className={'toggle-pill like' + (fav ? ' on' : '')} onClick={() => setFav(v => !v)}>
                <Heart filled={fav} /> Favorita
              </button>
            </div>
          </div>

          <div className="modal-field">
            <label className="modal-label">Review <span className="ml-hint">· opcional</span></label>
            <textarea className="note-input" value={note} onChange={e => setNote(e.target.value)} placeholder="Uma cena que vai ficar. 🐰" />
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

/* ── Modal: Adicionar série (busca rápida, topbar +) ────────────────────── */
function AddSeriesModal({ open, onClose, onAdd }) {
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
    const id = setTimeout(() => { setResults(searchTmdb(q)); setSearching(false); }, 440);
    return () => clearTimeout(id);
  }, [searchQ]);

  if (!open) return null;
  const add = (entry) => { const a = addSeriesFromCatalog(entry); onAdd(a); };

  return (
    <div className="modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-label="Adicionar série">
        <div className="modal-head">
          <span className="modal-title">🐰 Adicionar série</span>
          <button className="modal-x" onClick={onClose} aria-label="Fechar"><Icon name="x" /></button>
        </div>
        <div className="modal-body">
          <label className="modal-label">Buscar no TMDB <span className="ml-hint">· nome, rede, gênero ou ano</span></label>
          <div className="series-search">
            <div className="series-search-bar">
              <Icon name="search" />
              <input autoFocus value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Ex.: The Sopranos, HBO, Mystery…" />
              {searching && <span className="fs-spin" />}
            </div>
            <SearchResults q={searchQ} searching={searching} results={results} onAdd={add} />
          </div>
          {!searchQ.trim() && (
            <p className="fs-status" style={{ marginTop: 10 }}>Digite para buscar na base do TMDB. A série entra como <b style={{ color: 'var(--st-quero_assistir)', fontStyle: 'normal' }}>Quero assistir</b>. 🌙</p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Barra "próximo episódio" ───────────────────────────────────────────── */
function NextBar({ navigate, openLog }) {
  const [idx, setIdx] = React.useState(0);
  if (!UPCOMING.length) return null;
  const s = UPCOMING[idx % UPCOMING.length];
  const a = seriesById(s.seriesId);
  if (!a) return null;
  const p = POSTER[a.poster] || POSTER.periwinkle;

  return (
    <div className="footbar">
      <span className="fb-label"><span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: 'var(--warm)' }} /> Próximo ep</span>
      <div className="fb-still" onClick={() => navigate('detalhe', a.id)} style={{ background: `linear-gradient(150deg, ${p.a}, ${p.b})` }}><span className="fbs-ico">📺</span></div>
      <div className="footbar-info">
        <div className="footbar-title" onClick={() => navigate('detalhe', a.id)}>{a.title}</div>
        <div className="footbar-sub">T{s.season}E{s.ep} · {s.title} · {s.aired === TODAY ? 'hoje' : relFuture(s.aired)}</div>
      </div>
      {UPCOMING.length > 1 && (
        <div className="footbar-switch">
          <button onClick={() => setIdx(i => (i - 1 + UPCOMING.length) % UPCOMING.length)} aria-label="Anterior"><Icon name="chevL" /></button>
          <button onClick={() => setIdx(i => (i + 1) % UPCOMING.length)} aria-label="Próximo"><Icon name="chevR" /></button>
        </div>
      )}
      <div className="footbar-actions">
        <button className="btn btn-primary" onClick={() => openLog(a.id, s.season, s.ep)} style={{ padding: '10px 16px' }}>
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

Object.assign(window, { LogWatchModal, AddSeriesModal, SearchResults, NextBar, Toast });
