/* ─────────────────────────────────────────────────────────────────────────
   Mai · Séries — telas A: Início, Catálogo (grade), Detalhe da série
   (com o SeasonAccordion — componente exclusivo deste shell).
   ───────────────────────────────────────────────────────────────────────── */

/* ════ INÍCIO ════════════════════════════════════════════════════════════ */
function Home({ navigate, openLog }) {
  const wk = sessionsInLast(7);
  const prevWk = HEATMAP.slice(-14, -7).reduce((a, d) => a + d.count, 0);
  const delta = prevWk ? Math.round((wk - prevWk) / prevWk * 100) : (wk > 0 ? 100 : 0);
  const spark = HEATMAP.slice(-21).map(d => d.count);
  const lastLog = LOGS[0];
  const hero = seriesById(lastLog.seriesId);
  const hp = POSTER[hero.poster] || POSTER.periwinkle;
  const watching = SERIES.filter(a => a.status === 'assistindo');
  const recent = LOGS.slice(0, 5);
  const upcoming = UPCOMING.slice(0, 4);
  const queue = SERIES.filter(a => a.status === 'quero_assistir');
  const [favorites, setFavorites] = React.useState(() => {
    try { const s = JSON.parse(localStorage.getItem('mai.favorites')); if (Array.isArray(s)) return s.filter(seriesById); } catch (e) {}
    return SERIES.filter(a => a.fav).map(a => a.id).slice(0, 4);
  });
  React.useEffect(() => { try { localStorage.setItem('mai.favorites', JSON.stringify(favorites)); } catch (e) {} }, [favorites]);

  return (
    <div className="page">
      {/* ── HERO: última série logada ── */}
      <div className="hero">
        <div className="hero-bg" style={{ background: `linear-gradient(125deg, ${hp.a}, ${hp.b})` }} />
        <div className="hero-warmlight" />
        <div className="hero-inner">
          <div className="hero-eyebrow">🐰 Continue assistindo</div>
          <h1 className="hero-title">{hero.title}</h1>
          <p className="hero-line">
            <StatusChip status={hero.status} md />
            <span>{hero.network}</span>
            <span>·</span>
            <span>Última sessão: <b>T{lastLog.season}E{lastLog.ep_end}</b></span>
            <Score value={hero.score} />
          </p>
          <div className="hero-cta">
            <button className="btn btn-primary" onClick={() => openLog(hero.id)}><Icon name="plus" /> Logar sessão</button>
            <button className="btn btn-ghost" onClick={() => navigate('detalhe', hero.id)}><Icon name="tv" /> Ver detalhe</button>
          </div>
        </div>
        <div className="hero-portrait"><div className="halo" /><img src="mai/mai-hero.png" alt="Mai Sakurajima" /></div>
      </div>

      {/* ── STATS ── */}
      <div className="stat-row">
        <div className="stat-card" style={{ '--accent-bar': 'var(--mai)' }}>
          <div className="stat-label"><span className="se">📺</span> Séries acompanhadas</div>
          <div className="stat-value">{STATS.seriesTracked}<span className="unit">no acervo</span></div>
          <div className="stat-foot"><span className="up">{STATS.watching} assistindo</span> · {STATS.completed} concluídas</div>
        </div>
        <div className="stat-card" style={{ '--accent-bar': 'var(--warm)' }}>
          <div className="stat-label"><span className="se">🎬</span> Episódios · 7 dias</div>
          <div className="stat-value">{wk}</div>
          <Spark data={spark} />
          <div className="stat-foot">{delta >= 0 ? <span className="up">↑ {delta}%</span> : <span>↓ {Math.abs(delta)}%</span>} vs. semana anterior</div>
        </div>
        <div className="stat-card" style={{ '--accent-bar': 'var(--star)' }}>
          <div className="stat-label"><span className="se">⭐</span> Nota média</div>
          <div className="stat-value">{STATS.avgScore.toFixed(1)}<span className="unit">/ 5</span></div>
          <div className="stat-foot">{STATS.favCount} com coração</div>
        </div>
      </div>

      {/* ── PERFIL: favoritos + acervo ── */}
      <div className="profile-split">
        <FavoriteSeries navigate={navigate} favorites={favorites} setFavorites={setFavorites} />
        <div className="mai-sec">
          <div className="mai-sec-head">
            <span className="t">🎭 Meu acervo</span>
            <span className="rule" />
            <span className="lnk" onClick={() => navigate('stats')}>Stats →</span>
          </div>
          <div className="mai-panel"><div className="mp-block"><ListStats /></div></div>
        </div>
      </div>

      {/* ── ASSISTINDO AGORA (carrossel) ── */}
      <div className="section">
        <div className="mai-sec-head">
          <span className="t">📺 Assistindo agora</span>
          <span className="rule" />
          <span className="lnk" onClick={() => navigate('catalogo')}>Catálogo →</span>
        </div>
        <div className="row-scroll">
          {watching.map(a => (
            <div key={a.id} className="want-card" onClick={() => navigate('detalhe', a.id)}>
              <PosterCard series={a} badge showScore showProgress />
              <div className="wc-title">{a.title}</div>
              <div className="wc-sub">{posLabel(a)} · {a.episodes_count == null ? '?' : a.episodes_count} eps</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── PRÓXIMOS + ATIVIDADE ── */}
      <div className="home-split">
        <div className="home-main">
          <div className="mai-sec">
            <div className="mai-sec-head">
              <span className="t">🎬 Em andamento</span>
              <span className="rule" />
            </div>
            <div className="watch-grid">
              {watching.map(a => (
                <div key={a.id} className="watch-card" onClick={() => navigate('detalhe', a.id)}>
                  <PosterCard series={a} badge showScore />
                  <div className="wm">
                    <div className="wm-title">{a.title}</div>
                    <div className="wm-prog"><EpisodeProgress series={a} compact /></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mai-panel">
          <div className="mp-block">
            <div className="mp-head"><span className="t">Atividade recente</span><span className="c">{LOGS.length}</span></div>
            {recent.map(e => { const a = seriesById(e.seriesId); return (
              <div key={e.id} className="act-row" onClick={() => navigate('detalhe', a.id)}>
                <div className="ar-poster"><PosterCard series={a} /></div>
                <div className="ar-body">
                  <div className="ar-title">{a.title}</div>
                  <div className="ar-sub"><span>{relDate(e.date)}</span><span>T{e.season}E{e.ep_start === e.ep_end ? e.ep_start : `${e.ep_start}–${e.ep_end}`}</span></div>
                </div>
                {e.score && <span className="ar-score"><span className="stars sm" style={{ display: 'inline-flex' }}><StarShape filled /></span>{e.score.toFixed(1)}</span>}
              </div>
            ); })}
          </div>
          <div className="mp-block">
            <div className="mp-head"><span className="t">Próximos episódios</span><span className="c">{UPCOMING.length}</span></div>
            {upcoming.map(s => { const a = seriesById(s.seriesId); return (
              <div key={s.seriesId} className="up-row" onClick={() => navigate('proximos')}>
                <div className="up-date">
                  <div className="ud-d">{new Date(s.aired + 'T00:00:00').getDate()}</div>
                  <div className="ud-m">{MESES_CURTO[new Date(s.aired + 'T00:00:00').getMonth()]}</div>
                </div>
                <div className="up-body">
                  <div className="up-title">{a.title}</div>
                  <div className="up-sub">T{s.season}E{s.ep} · {relFuture(s.aired)}</div>
                </div>
              </div>
            ); })}
            {upcoming.length === 0 && <p className="detail-empty" style={{ padding: '8px 0' }}>Nada agendado nos próximos dias.</p>}
          </div>
        </div>
      </div>

      {/* ── QUERO ASSISTIR ── */}
      <div className="section">
        <div className="section-head">
          <h2 className="section-title">Esperando na fila</h2>
          <span className="section-link" onClick={() => navigate('watchlist')}>Ver tudo →</span>
        </div>
        <div className="row-scroll">
          {queue.map(a => (
            <div key={a.id} className="want-card" onClick={() => navigate('detalhe', a.id)}>
              <PosterCard series={a} />
              <div className="wc-title">{a.title}</div>
              <div className="wc-sub">{a.network.split(' · ')[0]} · {a.first_air_year}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Bloco de 4 favoritas (editável, persiste em localStorage) ──────────── */
function FavoriteSeries({ navigate, favorites, setFavorites }) {
  const [editing, setEditing] = React.useState(false);
  const [picking, setPicking] = React.useState(false);
  const favs = favorites.map(seriesById).filter(Boolean).slice(0, 4);
  const removeFav = (id) => setFavorites(favorites.filter(x => x !== id));
  const addFav = (id) => { if (!favorites.includes(id) && favorites.length < 4) setFavorites([...favorites, id]); setPicking(false); };

  return (
    <div className="mai-sec">
      <div className="mai-sec-head">
        <span className="t">💗 Favoritas</span>
        <span className="rule" />
        <span className="lnk" onClick={() => setEditing(v => !v)}>{editing ? 'Concluir' : 'Editar'}</span>
      </div>
      <div className="fav-grid">
        {favs.map(a => (
          <div key={a.id} className="fav-slot">
            {editing
              ? <><div className="poster-static"><PosterCard series={a} badge /></div>
                  <button className="fav-remove" title="Remover" onClick={() => removeFav(a.id)}><Icon name="x" /></button></>
              : <a className="poster-link" onClick={() => navigate('detalhe', a.id)}><PosterCard series={a} badge showScore /></a>}
          </div>
        ))}
        {editing && favs.length < 4 && (
          <button className="fav-add" onClick={() => setPicking(true)}><Icon name="plus" /><span>Adicionar</span></button>
        )}
      </div>
      {picking && <SeriesPicker exclude={favorites} onPick={addFav} onClose={() => setPicking(false)} />}
    </div>
  );
}

/* seletor de favorita — entre todas as séries do acervo */
function SeriesPicker({ exclude, onPick, onClose }) {
  const [q, setQ] = React.useState('');
  let pool = SERIES.filter(a => !exclude.includes(a.id));
  if (q.trim()) { const s = q.toLowerCase(); pool = pool.filter(a => a.title.toLowerCase().includes(s) || a.network.toLowerCase().includes(s)); }
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  });
  return (
    <div className="modal-scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-label="Escolher favorita">
        <div className="modal-head">
          <span className="modal-title">💗 Escolher favorita</span>
          <button className="modal-x" onClick={onClose}><Icon name="x" /></button>
        </div>
        <div className="modal-body">
          <div className="series-search" style={{ marginBottom: 14 }}>
            <div className="series-search-bar">
              <Icon name="search" />
              <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar no seu acervo…" />
            </div>
          </div>
          <div className="fav-pick-grid">
            {pool.map(a => (
              <a key={a.id} className="poster-link" onClick={() => onPick(a.id)} title={a.title}>
                <PosterCard series={a} showScore />
                <div className="poster-meta"><div className="pm-title">{a.title}</div></div>
              </a>
            ))}
            {pool.length === 0 && <p className="empty-state" style={{ gridColumn: '1/-1', padding: '30px 0', fontSize: 15 }}>Nada encontrado.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════ CATÁLOGO (grade) ══════════════════════════════════════════════════ */
const STATUS_FILTERS = [
  { id: 'todos',          label: 'Todas' },
  { id: 'assistindo',     label: 'Assistindo' },
  { id: 'concluida',      label: 'Concluída' },
  { id: 'quero_assistir', label: 'Quero assistir' },
  { id: 'pausada',        label: 'Pausada' },
  { id: 'abandonada',     label: 'Abandonada' },
];

function sortSeries(list, sort) {
  const arr = [...list];
  if (sort === 'Título') return arr.sort((a, b) => a.title.localeCompare(b.title, 'pt'));
  if (sort === 'Nota') return arr.sort((a, b) => (b.score || 0) - (a.score || 0));
  if (sort === 'Progresso') return arr.sort((a, b) => (b.episodes_watched / (b.episodes_count || 99)) - (a.episodes_watched / (a.episodes_count || 99)));
  if (sort === 'Adicionado') return arr;
  // Atualizado — pela sessão mais recente
  const last = a => { const e = logsFor(a.id)[0]; return e ? e.date : '0'; };
  return arr.sort((a, b) => last(b).localeCompare(last(a)));
}

function Catalog({ navigate, sort, query, initialFilter }) {
  const [filter, setFilter] = React.useState(initialFilter || 'todos');
  let list = SERIES.filter(a => filter === 'todos' ? true : a.status === filter);
  if (query) {
    const q = query.toLowerCase();
    list = list.filter(a => a.title.toLowerCase().includes(q) || a.network.toLowerCase().includes(q) || a.genres.some(g => g.toLowerCase().includes(q)));
  }
  list = sortSeries(list, sort);

  return (
    <div className="page">
      <div className="section-head" style={{ marginTop: 32, marginBottom: 0 }}>
        <h2 className="section-title" style={{ fontSize: 30 }}>Catálogo</h2>
        <span className="section-sub">{SERIES.length} no acervo · {STATS.completed} concluídas</span>
      </div>
      <div className="cat-toolbar">
        <div className="chips">
          {STATUS_FILTERS.map(f => (
            <button key={f.id} className={'chip' + (filter === f.id ? ' active' : '')} onClick={() => setFilter(f.id)}>
              {f.id !== 'todos' && <span className="ch-dot" style={{ background: `var(${STATUS_VAR[f.id]})` }} />}{f.label}
            </button>
          ))}
        </div>
        <div className="toolbar-spacer" />
        <span className="result-count">{list.length} {list.length === 1 ? 'série' : 'séries'} · por {sort.toLowerCase()}</span>
      </div>

      <div className="poster-grid">
        {list.map(a => (
          <a key={a.id} className="poster-link" onClick={() => navigate('detalhe', a.id)}>
            <PosterCard series={a} badge showStatus showProgress />
            <div className="poster-meta">
              <div className="pm-title">{a.title}</div>
              <div className="pm-sub">
                <Score value={a.score} />
                <span>·</span>
                <span>{a.status === 'quero_assistir' ? `${a.seasons.length} ${a.seasons.length === 1 ? 'temp' : 'temps'}` : `${posLabel(a)} / ${a.episodes_count == null ? '?' : a.episodes_count} eps`}</span>
              </div>
            </div>
          </a>
        ))}
      </div>
      {list.length === 0 && <p className="empty-state">Nada encontrado{query ? ` para "${query}"` : ''}.</p>}
    </div>
  );
}

/* ════ SeasonAccordion — ⭐ exclusivo Mai ════════════════════════════════ */
function SeasonAccordion({ series, openLog }) {
  const initial = series.next ? series.next.season : series.seasons[series.seasons.length - 1].n;
  const [open, setOpen] = React.useState(() => new Set([initial]));
  const toggle = (n) => setOpen(prev => { const s = new Set(prev); s.has(n) ? s.delete(n) : s.add(n); return s; });
  return (
    <div className="season-acc">
      {series.seasons.map(se => (
        <SeasonRow key={se.n} series={series} se={se} isOpen={open.has(se.n)} onToggle={() => toggle(se.n)} openLog={openLog} />
      ))}
    </div>
  );
}

function SeasonRow({ series, se, isOpen, onToggle, openLog }) {
  const [epLimit, setEpLimit] = React.useState(5);
  const total = se.eps == null ? se.watched + 6 : se.eps;
  const done = se.eps != null && se.watched >= se.eps && se.watched > 0;
  const pct = total ? Math.min(100, se.watched / total * 100) : 0;
  // lazy: só constrói a lista de episódios quando a temporada abre pela 1ª vez
  const [loaded, setLoaded] = React.useState(isOpen);
  React.useEffect(() => { if (isOpen) setLoaded(true); }, [isOpen]);
  const eps = loaded ? buildSeasonEpisodes(series, se.n) : [];

  return (
    <div className={'season-row' + (isOpen ? ' open' : '')}>
      <div className="season-head" onClick={onToggle}>
        <span className="season-chev"><Icon name="chevR" /></span>
        <div className="season-headmain">
          <div className="season-name">
            {se.name || `Temporada ${se.n}`}
            {se.name && <span className="sn-tag">T{se.n}</span>}
          </div>
          <div className="season-sub">
            <span>{se.eps == null ? 'em exibição' : `${se.eps} eps`}</span>
            <span>·</span>
            <span>{se.year}</span>
          </div>
        </div>
        <div className="season-prog-compact">
          <span className={'spc-bar' + (done ? ' done' : '')}><i style={{ width: (done ? 100 : pct) + '%' }} /></span>
          {done
            ? <span className="spc-n done"><Icon name="check" /> {se.watched}/{se.eps}</span>
            : <span className="spc-n">{se.watched} / {se.eps == null ? '?' : se.eps}</span>}
        </div>
      </div>
      <div className="season-body">
        <div className="season-body-inner">
          {eps.slice(0, epLimit).map(ep => {
            const isNext = series.next && series.next.season === se.n && series.next.number === ep.number;
            const future = ep.aired && ep.aired > TODAY;
            const p = POSTER[series.poster] || POSTER.periwinkle;
            return (
              <div key={ep.number} className={'epi-line' + (ep.watched ? ' watched' : '') + (isNext ? ' next' : '')}
                   onClick={() => openLog(series.id, se.n, ep.number)}>
                <span className="epi-dot" />
                <div className="epi-still" style={{ background: `linear-gradient(150deg, ${p.a}, ${p.b})` }}>
                  <span className="es-ico">📺</span>
                  <span className="es-num">E{ep.number}</span>
                </div>
                <div className="epi-meta">
                  <div className="em-title">T{se.n}E{ep.number} · {ep.title}</div>
                  <div className="em-sub">{fmtShort(ep.aired)} · {new Date(ep.aired + 'T00:00:00').getFullYear()}</div>
                </div>
                {ep.watched
                  ? <span className="epi-state seen"><span className="epi-check"><Icon name="check" /></span></span>
                  : isNext
                    ? <span className="epi-state next"><Icon name="play" /> {future ? 'em breve' : 'logar'}</span>
                    : future
                      ? <span className="epi-state"><Icon name="calendar" /> agendado</span>
                      : <span className="epi-check" />}
              </div>
            );
          })}
          {epLimit < eps.length && (
            <div className="epi-more"><button onClick={() => setEpLimit(l => l + 8)}>Carregar mais ({eps.length - epLimit})</button></div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ════ DETALHE DA SÉRIE ══════════════════════════════════════════════════ */
function SeriesDetail({ seriesId, navigate, openLog, onToggle }) {
  const a = seriesById(seriesId);
  const [, force] = React.useState(0);
  if (!a) return <div className="page"><p style={{ marginTop: 40 }}>Série não encontrada.</p></div>;

  const p = POSTER[a.poster] || POSTER.periwinkle;
  const logs = logsFor(a.id);
  const done = a.status === 'concluida';
  const nextTitle = a.next ? (buildSeasonEpisodes(a, a.next.season).find(e => e.number === a.next.number) || {}) : null;
  const toggleLike = () => { a.fav = !a.fav; onToggle && onToggle(); force(v => v + 1); };

  return (
    <div className="page">
      <button className="detail-back" onClick={() => navigate('catalogo')}><Icon name="arrowLeft" /> Catálogo</button>

      {/* banner + pôster flutuante */}
      <div className="detail-banner">
        <div className="detail-banner-bg" style={{ background: `linear-gradient(120deg, ${p.a}, ${p.b})` }} />
        <div className="detail-warmlight" />
        <div className="detail-hero">
          <div className="detail-poster-wrap"><PosterCard series={a} badge /></div>
          <div className="detail-info">
            <div className="detail-genre">{a.genres.join(' · ')}</div>
            <h1 className="detail-title">{a.title}</h1>
            <p className="detail-alt">{a.title_original !== a.title ? <>{a.title_original} · </> : null}<b>{a.network}</b> · {a.first_air_year} · {a.seasons.length} {a.seasons.length === 1 ? 'temporada' : 'temporadas'}</p>
            <div className="detail-rating-row">
              <Stars value={a.score} lg />
              <span className="score-num" style={{ fontSize: 15 }}>{a.score != null ? a.score.toFixed(1) : '—'} <span style={{ color: 'var(--ink-4)' }}>/ 5</span></span>
              {a.fav && <Heart filled className="heart-ico lg" />}
              <StatusChip status={a.status} md />
            </div>
          </div>
        </div>
      </div>

      <div className="detail-body">
        <div className="detail-actions">
          <button className="btn btn-primary" onClick={() => openLog(a.id)}><Icon name="plus" /> Logar sessão</button>
          {a.next && <button className="btn btn-warm" onClick={() => openLog(a.id, a.next.season, a.next.number)}><Icon name="play" /> Logar T{a.next.season}E{a.next.number}</button>}
          <button className={'icon-toggle like' + (a.fav ? ' on' : '')} onClick={toggleLike}>
            <Heart filled={a.fav} /> {a.fav ? 'Favorita' : 'Favoritar'}
          </button>
        </div>

        {/* barra de progresso geral */}
        <div className="detail-progress-card">
          <div className="dpc-head">
            <span className="t">Progresso geral</span>
            {a.next && nextTitle && (
              <span className="dpc-next"><span className="pulse" style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: 'var(--warm)' }} />
                Próximo: <b>T{a.next.season}E{a.next.number}</b>{nextTitle.title ? ` · ${nextTitle.title}` : ''}{nextTitle.aired ? ` · ${fmtShort(nextTitle.aired)} ${new Date(nextTitle.aired + 'T00:00:00').getFullYear()}` : ''}</span>
            )}
          </div>
          <EpisodeProgress series={a} />
        </div>

        <div className="detail-grid">
          {/* coluna esquerda: sinopse, notas, temporadas, histórico */}
          <div>
            <div className="detail-section-title">Sinopse <span className="st-line" /></div>
            <p className="detail-synopsis">{a.synopsis}</p>
            {a.notes && (
              <div className="notes-block"><span className="nb-tag">caderno da Mai 🐰</span>{a.notes}</div>
            )}

            <div className="detail-section-title" style={{ marginTop: 30 }}>Temporadas <span style={{ color: 'var(--ink-4)' }}>· {a.seasons.length}</span> <span className="st-line" /></div>
            <SeasonAccordion series={a} openLog={openLog} />

            {logs.length > 0 && (
              <>
                <div className="detail-section-title" style={{ marginTop: 30 }}>Histórico de sessões <span className="st-line" /></div>
                <div className="sess-log">
                  {logs.map(e => (
                    <div key={e.id} className="sess-item">
                      <div className="sess-date">{fmtDate(e.date)} · {new Date(e.date + 'T00:00:00').getFullYear()}</div>
                      <div className="sess-row">
                        <span className="sess-eps">T{e.season}E{e.ep_start === e.ep_end ? e.ep_start : `${e.ep_start}–${e.ep_end}`}</span>
                        {e.score && <Score value={e.score} />}
                      </div>
                      {e.note && <div className="sess-note">"{e.note}"</div>}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* coluna direita: ficha, gêneros */}
          <div>
            <div className="detail-section-title">Ficha <span className="st-line" /></div>
            <div className="detail-meta-grid">
              <div className="dm-cell"><div className="k">Rede</div><div className="v">{a.network}</div></div>
              <div className="dm-cell"><div className="k">Estreia</div><div className="v">{a.first_air_year}</div></div>
              <div className="dm-cell"><div className="k">Temporadas</div><div className="v">{a.seasons.length}</div></div>
              <div className="dm-cell"><div className="k">Episódios</div><div className="v">{a.episodes_count == null ? 'em exibição' : a.episodes_count}</div></div>
              <div className="dm-cell"><div className="k">Progresso</div><div className="v">{done ? 'Concluída' : `${a.episodes_watched}/${a.episodes_count == null ? '?' : a.episodes_count}`}</div></div>
              <div className="dm-cell"><div className="k">Sessões</div><div className="v">{logs.length || '—'}</div></div>
            </div>

            <div className="detail-section-title" style={{ marginTop: 26 }}>Gêneros <span className="st-line" /></div>
            <div className="chips">
              {a.genres.map(g => <span key={g} className="tag-chip"><span className="t-hash">#</span>{g}</span>)}
              {a.fav && <span className="tag-chip fav"><Heart filled style={{ width: 12, height: 12 }} /> favorita</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Home, FavoriteSeries, SeriesPicker, Catalog, SeasonAccordion, SeasonRow, SeriesDetail, sortSeries, STATUS_FILTERS });
