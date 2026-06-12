/* ─────────────────────────────────────────────────────────────────────────
   Akane · Filmes — telas A: Início, Filmes (lista/grade), Detalhe do filme
   ───────────────────────────────────────────────────────────────────────── */

function saudacao() {
  const h = new Date().getHours();
  if (h < 5)  return 'Boa madrugada';
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

const VAULT_META = {
  video:   { label: 'Vídeo',  icon: 'play', bg: 'oklch(0.30 0.13 24)' },
  article: { label: 'Artigo', icon: 'doc',  bg: 'oklch(0.34 0.07 235)' },
  essay:   { label: 'Ensaio', icon: 'quote',bg: 'oklch(0.34 0.075 290)' },
  review:  { label: 'Review', icon: 'star', bg: 'oklch(0.40 0.085 78)' },
};

/* ════ INÍCIO ════════════════════════════════════════════════════════════ */
function Home({ navigate, openLog }) {
  const wk = sessionsInLast(7);
  const prevWk = HEATMAP.slice(-14, -7).reduce((a, d) => a + d.count, 0);
  const delta = prevWk ? Math.round((wk - prevWk) / prevWk * 100) : (wk > 0 ? 100 : 0);
  const spark = HEATMAP.slice(-21).map(d => d.count);
  const hoursYear = Math.round(STATS.totalMinutes / 60);
  const lastEntry = DIARY[0];
  const lastFilm = filmById(lastEntry.filmId);
  const want = FILMS.filter(f => f.status === 'watchlist');
  const [favorites, setFavorites] = React.useState(() => {
    try { const s = JSON.parse(localStorage.getItem('akane.favorites')); if (Array.isArray(s)) return s.filter(filmById); } catch (e) {}
    return FAVORITES.slice();
  });
  React.useEffect(() => { try { localStorage.setItem('akane.favorites', JSON.stringify(favorites)); } catch (e) {} }, [favorites]);

  return (
    <div className="page">
      {/* ── HERO ── */}
      <div className="hero">
        <div className="hero-grain" />
        <div className="hero-inner">
          <div className="hero-copy">
            <div className="hero-eyebrow">Cinemateca de Akane</div>
            <h1 className="hero-greet">{saudacao()}.</h1>
            <p className="hero-now">Última sessão · <b>{lastFilm.title}</b> <em>· {lastEntry.rating.toFixed(1)}★{lastEntry.rewatch ? ' · revisão' : ''}</em></p>
            <p className="hero-quote">"Para interpretar alguém, primeiro é preciso assistir o mundo inteiro com atenção. O cinema é onde eu treino o olhar."</p>
            <div className="hero-cta">
              <button className="btn btn-primary" onClick={() => openLog()}><Icon name="plus" /> Logar filme</button>
              <button className="btn btn-ghost" onClick={() => navigate('diario')}><Icon name="diario" /> Abrir diário</button>
            </div>
          </div>
          <div className="hero-portrait">
            <div className="halo" />
            <img src="akane/akane-hero.png" alt="Akane Kurokawa" />
          </div>
        </div>
      </div>

      {/* ── RESUMOS ── */}
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label"><Icon name="filmes" style={{ width: 12, height: 12 }} /> Filmes · 2026</div>
          <div className="stat-value">{STATS.filmsWatched}<span className="unit">vistos</span></div>
          <div className="stat-foot" style={{ marginTop: 14 }}>Meta de 60 — faltam <b>{Math.max(0, 60 - STATS.filmsWatched)}</b></div>
        </div>
        <div className="stat-card">
          <div className="stat-label"><Icon name="diario" style={{ width: 12, height: 12 }} /> Sessões · 7 dias</div>
          <div className="stat-value">{wk}</div>
          <Spark data={spark} />
          <div className="stat-foot">{delta >= 0 ? <span className="up">↑ {delta}%</span> : <span>↓ {Math.abs(delta)}%</span>} vs. semana anterior</div>
        </div>
      </div>

      {/* ── FAVORITOS + DIÁRIO RECENTE + PAINEL ── */}
      <div className="home-split">
        <div className="home-main">
          <FavoriteFilms navigate={navigate} favorites={favorites} setFavorites={setFavorites} />
          <RecentActivity navigate={navigate} />
        </div>
        <LbPanel navigate={navigate} />
      </div>

      {/* ── WATCHLIST EM DESTAQUE ── */}
      <div className="section">
        <div className="section-head">
          <h2 className="section-title">Esperando na watchlist</h2>
          <span className="section-link" onClick={() => navigate('watchlist')}>Ver tudo →</span>
        </div>
        <div className="row-scroll">
          {want.map(f => (
            <div key={f.id} className="want-card" onClick={() => navigate('detalhe', f.id)}>
              <Poster film={f} badge />
              <div className="wc-title">{f.title}</div>
              <div className="wc-sub">{f.director} · {fmtRuntime(f.runtime)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* blocos Letterboxd: favoritos + atividade recente */
function FavoriteFilms({ navigate, favorites, setFavorites }) {
  const [editing, setEditing] = React.useState(false);
  const [picking, setPicking] = React.useState(false);
  const favs = favorites.map(filmById).filter(Boolean).slice(0, 4);
  const slots = editing ? favs : favs;
  const removeFav = (id) => setFavorites(favorites.filter(x => x !== id));
  const addFav = (id) => { if (!favorites.includes(id) && favorites.length < 4) setFavorites([...favorites, id]); setPicking(false); };

  return (
    <div className="lb-sec">
      <div className="lb-sec-head">
        <span className="t">Filmes favoritos</span>
        <span className="rule" />
        <span className="lb-sec-link" onClick={() => setEditing(v => !v)}>{editing ? 'Concluir' : 'Editar'}</span>
      </div>
      <div className="fav-grid">
        {slots.map(f => (
          <div key={f.id} className="fav-slot">
            {editing
              ? <><div className="poster-static"><Poster film={f} badge /></div>
                  <button className="fav-remove" title="Remover" onClick={() => removeFav(f.id)}><Icon name="x" /></button></>
              : <a className="poster-link" onClick={() => navigate('detalhe', f.id)}><Poster film={f} badge /></a>}
          </div>
        ))}
        {editing && favs.length < 4 && (
          <button className="fav-add" onClick={() => setPicking(true)}><Icon name="plus" /><span>Adicionar</span></button>
        )}
      </div>
      {picking && (
        <FavPicker exclude={favorites} onPick={addFav} onClose={() => setPicking(false)} />
      )}
    </div>
  );
}

/* seletor de favorito — escolha entre os filmes vistos */
function FavPicker({ exclude, onPick, onClose }) {
  const [q, setQ] = React.useState('');
  let pool = FILMS.filter(f => f.status === 'watched' && !exclude.includes(f.id));
  if (q.trim()) { const s = q.toLowerCase(); pool = pool.filter(f => f.title.toLowerCase().includes(s) || f.director.toLowerCase().includes(s)); }
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  });
  return (
    <div className="modal-scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-label="Escolher favorito">
        <div className="modal-head">
          <span className="modal-title">Escolher favorito</span>
          <button className="modal-x" onClick={onClose}><Icon name="x" /></button>
        </div>
        <div className="modal-body">
          <div className="film-search primary" style={{ marginBottom: 16 }}>
            <div className="film-search-bar">
              <Icon name="search" />
              <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar entre os vistos…" />
            </div>
          </div>
          <div className="fav-pick-grid">
            {pool.map(f => (
              <a key={f.id} className="poster-link" onClick={() => onPick(f.id)} title={f.title}>
                <Poster film={f} />
                <div className="poster-meta"><div className="pm-title">{f.title}</div></div>
              </a>
            ))}
            {pool.length === 0 && <p className="empty-state" style={{ gridColumn: '1/-1', padding: '30px 0' }}>Nenhum filme encontrado.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function RecentActivity({ navigate }) {
  const recent = DIARY.slice(0, 4);
  return (
    <div className="lb-sec">
      <div className="lb-sec-head"><span className="t">Diário recente</span><span className="rule" /><span className="lb-sec-link" onClick={() => navigate('diario')}>Tudo →</span></div>
      <div className="fav-grid">
        {recent.map(e => { const f = filmById(e.filmId); return (
          <div key={e.id} className="act-card" onClick={() => navigate('detalhe', f.id)}>
            <Poster film={f} />
            <div className="act-marks">
              {e.rating ? <Stars value={e.rating} /> : <span className="act-none">—</span>}
              {e.liked && <Heart filled className="heart-ico" />}
              {e.rewatch && <Icon name="rewatch" style={{ width: 13, height: 13, color: 'var(--rose)' }} />}
              {e.note && <Icon name="listas" style={{ width: 13, height: 13, color: 'var(--ink-4)' }} />}
            </div>
          </div>
        ); })}
      </div>
    </div>
  );
}

/* painel compacto estilo Letterboxd: Diário + histograma de notas */
function LbPanel({ navigate }) {
  const groups = [];
  for (const e of DIARY) {
    const dt = new Date(e.date + 'T00:00:00');
    const key = dt.getFullYear() + '-' + dt.getMonth();
    let g = groups.find(x => x.key === key);
    if (!g) { g = { key, m: dt.getMonth(), y: dt.getFullYear(), items: [] }; groups.push(g); }
    g.items.push(e);
  }
  let shown = 0; const MAX = 9; const limited = [];
  for (const g of groups) { if (shown >= MAX) break; const items = g.items.slice(0, MAX - shown); shown += items.length; limited.push({ ...g, items }); }

  const rated = DIARY.filter(e => e.rating);
  const dist = []; for (let v = 0.5; v <= 5; v += 0.5) dist.push(STATS.dist[v.toFixed(1)] || 0);
  const maxD = Math.max(...dist, 1);

  return (
    <div className="lb-panel">
      <div className="lb-block">
        <div className="lb-head"><span className="t">Diário</span><span className="c">{DIARY.length}</span></div>
        {limited.map(g => (
          <div className="lb-month" key={g.key}>
            <div className="lb-chip"><div className="m">{MESES_CURTO[g.m]}</div><div className="y">'{String(g.y).slice(2)}</div></div>
            <div className="lb-rows">
              {g.items.map(e => { const f = filmById(e.filmId); return (
                <div className="lb-row" key={e.id} onClick={() => navigate('detalhe', f.id)}>
                  <span className="d">{new Date(e.date + 'T00:00:00').getDate()}</span>
                  <span className="ti">{f.title}</span>
                </div>
              ); })}
            </div>
          </div>
        ))}
      </div>
      <div className="lb-block">
        <div className="lb-head"><span className="t">Notas</span><span className="c">{rated.length}</span></div>
        <div className="lb-hist">
          {dist.map((n, i) => (
            <div key={i} className={'col' + (n >= maxD * 0.7 && n > 0 ? ' hi' : '')}
                 style={{ height: Math.max(2, (n / maxD) * 100) + '%' }}
                 title={((i + 1) / 2).toFixed(1) + '★ · ' + n} />
          ))}
        </div>
        <div className="lb-foot">
          <span className="lb-star"><StarShape filled /></span>
          <span className="lb-star">{[0,1,2,3,4].map(i => <StarShape key={i} filled />)}</span>
        </div>
      </div>
    </div>
  );
}

/* item do feed (Início) */
function FeedItem({ entry, navigate }) {
  const f = filmById(entry.filmId);
  return (
    <div className="feed-item">
      <div className="feed-poster" onClick={() => navigate('detalhe', f.id)}><Poster film={f} /></div>
      <div className="feed-body">
        <div className="feed-line">
          <span className="verb">{entry.rewatch ? 'reviu' : 'assistiu'} </span>
          <b onClick={() => navigate('detalhe', f.id)}>{f.title}</b>
          <span className="verb">· {f.year}</span>
          {entry.rating ? <Stars value={entry.rating} /> : null}
          {entry.liked && <Heart filled className="heart-ico" />}
        </div>
        {entry.note && <div className="feed-note">"{entry.note}"</div>}
        <div className="feed-meta">
          <span>{relDate(entry.date)}</span>
          {entry.rewatch && <span className="feed-tag rw">revisão</span>}
        </div>
      </div>
    </div>
  );
}

/* ════ FILMES (lista / grade) ════════════════════════════════════════════ */
const STATUS_FILTERS = [
  { id: 'todos',     label: 'Todos' },
  { id: 'watched',   label: 'Vistos' },
  { id: 'liked',     label: 'Curtidos' },
  { id: 'watchlist', label: 'Quero ver' },
  { id: 'rated',     label: 'Com nota' },
];

function sortFilms(list, sort) {
  const arr = [...list];
  if (sort === 'Título') return arr.sort((a, b) => a.title.localeCompare(b.title, 'pt'));
  if (sort === 'Diretor') return arr.sort((a, b) => a.director.localeCompare(b.director, 'pt'));
  if (sort === 'Nota') return arr.sort((a, b) => (b.rating || 0) - (a.rating || 0));
  if (sort === 'Ano') return arr.sort((a, b) => b.year - a.year);
  if (sort === 'Duração') return arr.sort((a, b) => b.runtime - a.runtime);
  // Recentes — usa a data mais recente no diário
  const last = f => { const e = diaryFor(f.id)[0]; return e ? e.date : '0'; };
  return arr.sort((a, b) => last(b).localeCompare(last(a)));
}

function Catalog({ navigate, sort, query, initialFilter, tag }) {
  const [filter, setFilter] = React.useState(initialFilter || 'todos');
  let list = FILMS.filter(f => {
    if (tag) return (f.tags || []).includes(tag);
    if (filter === 'watched') return f.status === 'watched';
    if (filter === 'watchlist') return f.status === 'watchlist';
    if (filter === 'liked') return f.liked;
    if (filter === 'rated') return f.rating != null;
    return true;
  });
  if (query) {
    const q = query.toLowerCase();
    list = list.filter(f => f.title.toLowerCase().includes(q) || f.director.toLowerCase().includes(q));
  }
  list = sortFilms(list, sort);

  return (
    <div className="page">
      <div className="section-head" style={{ marginTop: 32, marginBottom: 0 }}>
        <h2 className="section-title" style={{ fontSize: 30 }}>{tag ? <>Etiqueta <span style={{ color: 'var(--rose-deep)' }}>#{tag}</span></> : 'Filmes'}</h2>
        <span className="section-sub">{tag ? `${list.length} ${list.length === 1 ? 'filme' : 'filmes'}` : `${FILMS.length} no acervo · ${STATS.filmsWatched} vistos`}</span>
      </div>
      {!tag && (
        <div className="cat-toolbar">
          <div className="chips">
            {STATUS_FILTERS.map(f => (
              <button key={f.id} className={'chip' + (filter === f.id ? ' active' : '')} onClick={() => setFilter(f.id)}>{f.label}</button>
            ))}
          </div>
          <div className="toolbar-spacer" />
          <span className="result-count">{list.length} {list.length === 1 ? 'filme' : 'filmes'} · por {sort.toLowerCase()}</span>
        </div>
      )}
      {tag && (
        <button className="detail-back" onClick={() => navigate('tags')} style={{ paddingTop: 14 }}><Icon name="arrowLeft" /> Todas as etiquetas</button>
      )}

      <div className="poster-grid">
        {list.map(f => (
          <a key={f.id} className="poster-link" onClick={() => navigate('detalhe', f.id)}>
            <Poster film={f} badge />
            <div className="poster-meta">
              <div className="pm-title">{f.title}</div>
              <div className="pm-sub">{f.director} · {f.year}</div>
              <div className="pm-row">
                {f.rating ? <><Stars value={f.rating} />{f.liked && <Heart filled className="heart-ico" />}</> :
                 f.status === 'watchlist' ? <span className="result-count" style={{ color: 'var(--rose-deep)' }}>quero ver</span> :
                 <span className="result-count">sem nota</span>}
              </div>
            </div>
          </a>
        ))}
      </div>
      {list.length === 0 && <p className="empty-state">Nada encontrado{query ? ` para "${query}"` : ''}.</p>}
    </div>
  );
}

/* ════ DETALHE DO FILME ══════════════════════════════════════════════════ */
function FilmDetail({ filmId, navigate, openLog, onToggle }) {
  const f = filmById(filmId);
  const [, force] = React.useState(0);
  if (!f) return <div className="page"><p style={{ marginTop: 40 }}>Filme não encontrado.</p></div>;

  const logs = diaryFor(f.id);
  const seen = f.status === 'watched';
  const toggleLike = () => { f.liked = !f.liked; onToggle && onToggle(); force(v => v + 1); };
  const toggleWant = () => { f.status = f.status === 'watchlist' ? 'watched' : 'watchlist'; onToggle && onToggle(); force(v => v + 1); };

  return (
    <div className="page">
      <button className="detail-back" onClick={() => navigate('filmes')}><Icon name="arrowLeft" /> Filmes</button>

      <div className="detail-hero">
        {/* coluna esquerda */}
        <div className="detail-poster-wrap">
          <Poster film={f} />
          <div className="detail-actions">
            <button className="btn btn-primary" style={{ justifyContent: 'center' }} onClick={() => openLog(f.id)}>
              <Icon name="plus" /> Logar filme
            </button>
            <div className="action-row">
              <button className={'icon-toggle like' + (f.liked ? ' on' : '')} onClick={toggleLike}>
                <Heart filled={f.liked} /> {f.liked ? 'Curtido' : 'Curtir'}
              </button>
              <button className={'icon-toggle want' + (f.status === 'watchlist' ? ' on' : '')} onClick={toggleWant}>
                <Icon name="watchlist" /> {f.status === 'watchlist' ? 'Na lista' : 'Quero ver'}
              </button>
            </div>
          </div>
        </div>

        {/* coluna direita */}
        <div className="detail-info">
          <div className="detail-genre">{f.genre}</div>
          <h1 className="detail-title">{f.title}</h1>
          <p className="detail-author">{f.year} · dirigido por <b>{f.director}</b> · {fmtRuntime(f.runtime)} · {f.country}</p>

          <div className="detail-rating-row">
            {f.rating ? (
              <><Stars value={f.rating} lg /><span className="rating-num" style={{ fontSize: 14 }}>{f.rating.toFixed(1)}</span></>
            ) : <span className="detail-empty">Ainda sem nota</span>}
            {f.liked && <Heart filled className="heart-ico lg" />}
            {f.ratingSource === 'letterboxd' && <span className="rating-source"><span className="lb" /> via Letterboxd</span>}
            <span className={'status-pill ' + (seen ? 'seen' : 'want')}>{seen ? 'Visto' : 'Quero ver'}</span>
          </div>

          <div className="detail-meta-grid">
            <div className="dm-cell"><div className="k">Direção</div><div className="v" style={{ fontSize: 13 }}>{f.director}</div></div>
            <div className="dm-cell"><div className="k">Ano</div><div className="v">{f.year}</div></div>
            <div className="dm-cell"><div className="k">Duração</div><div className="v" style={{ fontSize: 13 }}>{fmtRuntime(f.runtime)}</div></div>
            <div className="dm-cell"><div className="k">País</div><div className="v" style={{ fontSize: 13 }}>{f.country}</div></div>
            <div className="dm-cell"><div className="k">Sessões</div><div className="v">{logs.length || '—'}</div></div>
          </div>

          {/* sua review */}
          <div className="detail-section-title">Sua review <span className="st-line" /></div>
          {f.review
            ? <p className="detail-review">{f.review}</p>
            : <p className="detail-empty">Você ainda não escreveu sobre este filme. {seen ? 'Registre uma sessão para começar.' : 'Ele te espera na watchlist.'}</p>}

          {/* notas (≠ review) */}
          {f.notes && (
            <>
              <div className="detail-section-title">Anotações <span className="st-line" /></div>
              <div className="notes-block"><span className="nb-tag">caderno</span>{f.notes}</div>
            </>
          )}

          {/* cofre de conteúdos */}
          <div className="detail-section-title">Cofre de conteúdos {f.vault && f.vault.length > 0 && <span style={{ color: 'var(--ink-4)' }}>· {f.vault.length}</span>} <span className="st-line" /></div>
          <div className="vault-grid">
            {(f.vault || []).map((v, i) => {
              const m = VAULT_META[v.type] || VAULT_META.article;
              return (
                <a key={i} className="vault-card" href="#" onClick={e => e.preventDefault()}>
                  <div className="vault-thumb" style={{ background: m.bg }}>
                    <span className="vt-type">{m.label}</span>
                    <Icon name={m.icon} />
                  </div>
                  <div className="vc-title">{v.title}</div>
                  <div className="vc-foot"><Icon name="link" style={{ width: 11, height: 11 }} /> {v.source} <span className="open">abrir →</span></div>
                </a>
              );
            })}
            <button className="vault-add"><Icon name="plus" /> Salvar conteúdo</button>
          </div>

          {/* etiquetas */}
          {f.tags && f.tags.length > 0 && (
            <>
              <div className="detail-section-title">Etiquetas <span className="st-line" /></div>
              <div className="chips">
                {f.tags.map(t => (
                  <a key={t} className={'tag-chip' + (PERSON_TAGS.has(t) ? ' person' : '')} onClick={() => navigate('tag', t)}>
                    {PERSON_TAGS.has(t) ? <Icon name="user" className="t-person" style={{ width: 13, height: 13, color: 'var(--rose)' }} /> : <span className="t-hash">#</span>}
                    {t}
                  </a>
                ))}
              </div>
            </>
          )}

          {/* diário deste filme */}
          {logs.length > 0 && (
            <>
              <div className="detail-section-title">Diário deste filme <span className="st-line" /></div>
              <div className="film-log">
                {logs.map(e => (
                  <div key={e.id} className="fl-item">
                    <div className="fl-date">{fmtDate(e.date)} · {new Date(e.date + 'T00:00:00').getFullYear()}</div>
                    <div className="fl-row">
                      {e.rating ? <Stars value={e.rating} /> : null}
                      {e.liked && <Heart filled className="heart-ico" />}
                      {e.rewatch && <span className="feed-tag rw">revisão</span>}
                    </div>
                    {e.note && <div className="fl-note">"{e.note}"</div>}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Home, LbPanel, FavoriteFilms, FavPicker, RecentActivity, FeedItem, Catalog, FilmDetail, sortFilms, STATUS_FILTERS, saudacao, VAULT_META });
