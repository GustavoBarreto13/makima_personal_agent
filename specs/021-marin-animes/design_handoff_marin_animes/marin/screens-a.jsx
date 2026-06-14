/* ─────────────────────────────────────────────────────────────────────────
   Marin · Animes — telas A: Início, Catálogo (grade), Detalhe do anime
   ───────────────────────────────────────────────────────────────────────── */

function saudacao() {
  const h = new Date().getHours();
  if (h < 5)  return 'Boa madrugada';
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

/* ════ INÍCIO ════════════════════════════════════════════════════════════ */
function Home({ navigate, openLog }) {
  const wk = sessionsInLast(7);
  const prevWk = HEATMAP.slice(-14, -7).reduce((a, d) => a + d.count, 0);
  const delta = prevWk ? Math.round((wk - prevWk) / prevWk * 100) : (wk > 0 ? 100 : 0);
  const spark = HEATMAP.slice(-21).map(d => d.count);
  const lastLog = LOGS[0];
  const hero = animeById(lastLog.animeId);
  const hp = POSTER[hero.poster] || POSTER.magenta;
  const watching = ANIMES.filter(a => a.status === 'assistindo');
  const recent = LOGS.slice(0, 5);
  const upcoming = SCHEDULE.slice(0, 4);
  const [favorites, setFavorites] = React.useState(() => {
    try { const s = JSON.parse(localStorage.getItem('marin.favorites')); if (Array.isArray(s)) return s.filter(animeById); } catch (e) {}
    return FAVORITES.slice();
  });
  React.useEffect(() => { try { localStorage.setItem('marin.favorites', JSON.stringify(favorites)); } catch (e) {} }, [favorites]);

  return (
    <div className="page">
      {/* ── HERO: continue assistindo ── */}
      <div className="hero">
        <div className="hero-bg" style={{ background: `linear-gradient(125deg, ${hp.a}, ${hp.b})` }} />
        <div className="hero-spark" />
        <div className="hero-inner">
          <div className="hero-eyebrow">✨ Continue assistindo</div>
          <h1 className="hero-title">{hero.title}</h1>
          <p className="hero-line">
            <StatusChip status={hero.status} md />
            <span>Último: <b>Ep {lastLog.ep_end}{hero.episodes_total ? ` / ${hero.episodes_total}` : ''}</b></span>
            <Score value={hero.score} />
          </p>
          <div className="hero-cta">
            <button className="btn btn-primary" onClick={() => openLog(hero.id)}><Icon name="plus" /> Logar episódio</button>
            <button className="btn btn-ghost" onClick={() => navigate('detalhe', hero.id)}><Icon name="tv" /> Ver detalhe</button>
          </div>
        </div>
        <div className="hero-portrait"><div className="halo" /><img src="marin/marin-hero.png" alt="Marin Kitagawa" /></div>
      </div>

      {/* ── STATS ── */}
      <div className="stat-row">
        <div className="stat-card" style={{ '--accent-bar': 'var(--marin)' }}>
          <div className="stat-label"><span className="se">📺</span> Animes acompanhados</div>
          <div className="stat-value">{STATS.animesTracked}<span className="unit">no acervo</span></div>
          <div className="stat-foot"><span className="up">{STATS.watching} assistindo</span> · {STATS.completed} completos</div>
        </div>
        <div className="stat-card" style={{ '--accent-bar': 'var(--cyan)' }}>
          <div className="stat-label"><span className="se">🎌</span> Episódios · 7 dias</div>
          <div className="stat-value">{wk}</div>
          <Spark data={spark} />
          <div className="stat-foot">{delta >= 0 ? <span className="up">↑ {delta}%</span> : <span>↓ {Math.abs(delta)}%</span>} vs. semana anterior</div>
        </div>
        <div className="stat-card" style={{ '--accent-bar': 'var(--star)' }}>
          <div className="stat-label"><span className="se">⭐</span> Nota média</div>
          <div className="stat-value">{STATS.avgScore.toFixed(1)}<span className="unit">/ 10</span></div>
          <div className="stat-foot">{STATS.favCount} com coração 💖</div>
        </div>
      </div>

      {/* ── PERFIL: favoritos + stats do MAL ── */}
      <div className="profile-split">
        <FavoriteAnimes navigate={navigate} favorites={favorites} setFavorites={setFavorites} />
        <div className="mr-sec">
          <div className="mr-sec-head">
            <span className="t">🎌 Minha lista no MAL</span>
            <span className="rule" />
            <span className="lnk" onClick={() => navigate('stats')}>Stats →</span>
          </div>
          <div className="mr-panel"><div className="mp-block"><MalStats /></div></div>
        </div>
      </div>

      {/* ── ASSISTINDO + PAINEL ── */}
      <div className="home-split">
        <div className="home-main">
          <div className="mr-sec">
            <div className="mr-sec-head">
              <span className="t">📺 Assistindo agora</span>
              <span className="rule" />
              <span className="lnk" onClick={() => navigate('catalogo')}>Catálogo →</span>
            </div>
            <div className="watch-grid">
              {watching.map(a => (
                <div key={a.id} className="watch-card" onClick={() => navigate('detalhe', a.id)}>
                  <PosterCard anime={a} badge showScore />
                  <div className="wm">
                    <div className="wm-title">{a.title}</div>
                    <div className="wm-prog"><EpisodeProgress watched={a.episodes_watched} total={a.episodes_total} compact /></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mr-panel">
          <div className="mp-block">
            <div className="mp-head"><span className="t">Atividade recente</span><span className="c">{LOGS.length}</span></div>
            {recent.map(e => { const a = animeById(e.animeId); return (
              <div key={e.id} className="act-row" onClick={() => navigate('detalhe', a.id)}>
                <div className="ar-poster"><PosterCard anime={a} /></div>
                <div className="ar-body">
                  <div className="ar-title">{a.title}</div>
                  <div className="ar-sub"><span>{relDate(e.date)}</span><span>Ep {e.ep_start === e.ep_end ? e.ep_start : `${e.ep_start}–${e.ep_end}`}</span></div>
                </div>
                {e.score && <span className="ar-score"><span className="stars sm" style={{ display: 'inline-flex' }}><StarShape filled /></span>{e.score.toFixed(1)}</span>}
              </div>
            ); })}
          </div>
          <div className="mp-block">
            <div className="mp-head"><span className="t">Próximos episódios</span><span className="c">{SCHEDULE.length}</span></div>
            {upcoming.map(s => { const a = animeById(s.animeId); return (
              <div key={s.animeId} className="up-row" onClick={() => navigate('lancamentos')}>
                <div className="up-date">
                  <div className="ud-d">{new Date(s.aired + 'T00:00:00').getDate()}</div>
                  <div className="ud-m">{MESES_CURTO[new Date(s.aired + 'T00:00:00').getMonth()]}</div>
                </div>
                <div className="up-body">
                  <div className="up-title">{a.title}</div>
                  <div className="up-sub">Ep {s.ep} · {relFuture(s.aired)}</div>
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
          {ANIMES.filter(a => a.status === 'quero_assistir').map(a => (
            <div key={a.id} className="want-card" onClick={() => navigate('detalhe', a.id)}>
              <PosterCard anime={a} />
              <div className="wc-title">{a.title}</div>
              <div className="wc-sub">{a.episodes_total ? `${a.episodes_total} eps` : a.media_type} · {a.studio.split(' · ')[0]}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Bloco de 4 favoritos (editável, persiste em localStorage) ──────────── */
function FavoriteAnimes({ navigate, favorites, setFavorites }) {
  const [editing, setEditing] = React.useState(false);
  const [picking, setPicking] = React.useState(false);
  const favs = favorites.map(animeById).filter(Boolean).slice(0, 4);
  const removeFav = (id) => setFavorites(favorites.filter(x => x !== id));
  const addFav = (id) => { if (!favorites.includes(id) && favorites.length < 4) setFavorites([...favorites, id]); setPicking(false); };

  return (
    <div className="mr-sec">
      <div className="mr-sec-head">
        <span className="t">💖 Favoritos</span>
        <span className="rule" />
        <span className="lnk" onClick={() => setEditing(v => !v)}>{editing ? 'Concluir' : 'Editar'}</span>
      </div>
      <div className="fav-grid">
        {favs.map(a => (
          <div key={a.id} className="fav-slot">
            {editing
              ? <><div className="poster-static"><PosterCard anime={a} badge /></div>
                  <button className="fav-remove" title="Remover" onClick={() => removeFav(a.id)}><Icon name="x" /></button></>
              : <a className="poster-link" onClick={() => navigate('detalhe', a.id)}><PosterCard anime={a} badge showScore /></a>}
          </div>
        ))}
        {editing && favs.length < 4 && (
          <button className="fav-add" onClick={() => setPicking(true)}><Icon name="plus" /><span>Adicionar</span></button>
        )}
      </div>
      {picking && <AnimePicker exclude={favorites} onPick={addFav} onClose={() => setPicking(false)} />}
    </div>
  );
}

/* seletor de favorito — entre todos os animes do acervo */
function AnimePicker({ exclude, onPick, onClose }) {
  const [q, setQ] = React.useState('');
  let pool = ANIMES.filter(a => !exclude.includes(a.id));
  if (q.trim()) { const s = q.toLowerCase(); pool = pool.filter(a => a.title.toLowerCase().includes(s) || a.studio.toLowerCase().includes(s)); }
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  });
  return (
    <div className="modal-scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-label="Escolher favorito">
        <div className="modal-head">
          <span className="modal-title">💖 Escolher favorito</span>
          <button className="modal-x" onClick={onClose}><Icon name="x" /></button>
        </div>
        <div className="modal-body">
          <div className="anime-search" style={{ marginBottom: 14 }}>
            <div className="anime-search-bar">
              <Icon name="search" />
              <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar no seu acervo…" />
            </div>
          </div>
          <div className="fav-pick-grid">
            {pool.map(a => (
              <a key={a.id} className="poster-link" onClick={() => onPick(a.id)} title={a.title}>
                <PosterCard anime={a} showScore />
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
  { id: 'todos',          label: 'Todos' },
  { id: 'assistindo',     label: 'Assistindo' },
  { id: 'completo',       label: 'Completo' },
  { id: 'quero_assistir', label: 'Quero assistir' },
  { id: 'pausado',        label: 'Pausado' },
  { id: 'abandonado',     label: 'Abandonado' },
];

function sortAnimes(list, sort) {
  const arr = [...list];
  if (sort === 'Título') return arr.sort((a, b) => a.title.localeCompare(b.title, 'pt'));
  if (sort === 'Nota') return arr.sort((a, b) => (b.score || 0) - (a.score || 0));
  if (sort === 'Progresso') return arr.sort((a, b) => (b.episodes_watched / (b.episodes_total || 99)) - (a.episodes_watched / (a.episodes_total || 99)));
  if (sort === 'Adicionado') return arr;
  // Atualizado — pela sessão mais recente
  const last = a => { const e = logsFor(a.id)[0]; return e ? e.date : '0'; };
  return arr.sort((a, b) => last(b).localeCompare(last(a)));
}

function Catalog({ navigate, sort, query, initialFilter }) {
  const [filter, setFilter] = React.useState(initialFilter || 'todos');
  let list = ANIMES.filter(a => filter === 'todos' ? true : a.status === filter);
  if (query) {
    const q = query.toLowerCase();
    list = list.filter(a => a.title.toLowerCase().includes(q) || a.studio.toLowerCase().includes(q) || a.genres.some(g => g.toLowerCase().includes(q)));
  }
  list = sortAnimes(list, sort);

  return (
    <div className="page">
      <div className="section-head" style={{ marginTop: 32, marginBottom: 0 }}>
        <h2 className="section-title" style={{ fontSize: 30 }}>Catálogo</h2>
        <span className="section-sub">{ANIMES.length} no acervo · {STATS.completed} completos</span>
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
        <span className="result-count">{list.length} {list.length === 1 ? 'anime' : 'animes'} · por {sort.toLowerCase()}</span>
      </div>

      <div className="poster-grid">
        {list.map(a => (
          <a key={a.id} className="poster-link" onClick={() => navigate('detalhe', a.id)}>
            <PosterCard anime={a} badge showStatus showProgress />
            <div className="poster-meta">
              <div className="pm-title">{a.title}</div>
              <div className="pm-sub">
                <Score value={a.score} />
                <span>·</span>
                <span>{a.episodes_total != null ? `${a.episodes_watched}/${a.episodes_total}` : `${a.episodes_watched}/?`} eps</span>
              </div>
            </div>
          </a>
        ))}
      </div>
      {list.length === 0 && <p className="empty-state">Nada encontrado{query ? ` para "${query}"` : ''}.</p>}
    </div>
  );
}

/* ════ DETALHE DO ANIME ══════════════════════════════════════════════════ */
function AnimeDetail({ animeId, navigate, openLog, onToggle }) {
  const a = animeById(animeId);
  const [, force] = React.useState(0);
  const [epLimit, setEpLimit] = React.useState(12);
  if (!a) return <div className="page"><p style={{ marginTop: 40 }}>Anime não encontrado.</p></div>;

  const p = POSTER[a.poster] || POSTER.magenta;
  const logs = logsFor(a.id);
  const eps = buildEpisodes(a);
  const toggleLike = () => { a.fav = !a.fav; onToggle && onToggle(); force(v => v + 1); };

  return (
    <div className="page">
      <button className="detail-back" onClick={() => navigate('catalogo')}><Icon name="arrowLeft" /> Catálogo</button>

      {/* banner + pôster flutuante */}
      <div className="detail-banner">
        <div className="detail-banner-bg" style={{ background: `linear-gradient(120deg, ${p.a}, ${p.b})` }} />
        <div className="detail-hero">
          <div className="detail-poster-wrap"><PosterCard anime={a} badge /></div>
          <div className="detail-info">
            <div className="detail-genre">{a.genres.join(' · ')}</div>
            <h1 className="detail-title">{a.title}</h1>
            <p className="detail-alt">{a.title_jp} · <b>{a.studio}</b> · {a.season} · {a.media_type}</p>
            <div className="detail-rating-row">
              <Stars value={a.score} lg />
              <span className="score-num" style={{ fontSize: 15 }}>{a.score != null ? a.score.toFixed(1) : '—'} <span style={{ color: 'var(--ink-4)' }}>/ 10</span></span>
              {a.fav && <Heart filled className="heart-ico lg" />}
              <StatusChip status={a.status} md />
            </div>
          </div>
        </div>
      </div>

      <div className="detail-body">
        <div className="detail-actions">
          <button className="btn btn-primary" onClick={() => openLog(a.id)}><Icon name="plus" /> Logar episódio</button>
          <button className={'icon-toggle like' + (a.fav ? ' on' : '')} onClick={toggleLike}>
            <Heart filled={a.fav} /> {a.fav ? 'Favorito' : 'Favoritar'}
          </button>
        </div>

        {/* barra de progresso */}
        <div className="detail-progress-card">
          <div className="dpc-head">
            <span className="t">Progresso</span>
            {a.next && a.next.aired && <span className="ep-next"><span className="pulse" />Próximo: Ep {a.next.number} · {fmtShort(a.next.aired)}</span>}
          </div>
          <EpisodeProgress watched={a.episodes_watched} total={a.episodes_total} next={a.next} />
        </div>

        <div className="detail-grid">
          {/* coluna esquerda: sinopse, episódios, sessões */}
          <div>
            <div className="detail-section-title">Sinopse <span className="st-line" /></div>
            <p className="detail-synopsis">{a.synopsis}</p>

            {a.notes && (
              <div className="notes-block"><span className="nb-tag">caderno da Marin ✨</span>{a.notes}</div>
            )}

            <div className="detail-section-title" style={{ marginTop: 30 }}>Episódios <span style={{ color: 'var(--ink-4)' }}>· {eps.length}</span> <span className="st-line" /></div>
            <div className="ep-list">
              {eps.slice(0, epLimit).map(ep => {
                const isNext = a.next && ep.number === a.next.number && !ep.watched;
                const future = ep.aired && ep.aired > TODAY;
                return (
                  <div key={ep.number} className={'ep-item' + (ep.watched ? ' watched' : '')} onClick={() => openLog(a.id, ep.number)}>
                    <div className="ep-thumb" style={{ background: `linear-gradient(155deg, ${p.a}, ${p.b})` }}>
                      <span className="et-num">{ep.number}</span>
                    </div>
                    <div className="ep-meta">
                      <div className="em-title">Ep {ep.number} · {ep.title}</div>
                      <div className="em-sub">{fmtShort(ep.aired)}{ep.aired ? ` · ${new Date(ep.aired + 'T00:00:00').getFullYear()}` : ''}</div>
                    </div>
                    {ep.watched
                      ? <span className="ep-state seen"><span className="ep-check"><Icon name="check" /></span></span>
                      : isNext
                        ? <span className="ep-state next"><Icon name="play" /> {future ? 'em breve' : 'assistir'}</span>
                        : future
                          ? <span className="ep-state"><Icon name="calendar" /> agendado</span>
                          : <span className="ep-check" />}
                  </div>
                );
              })}
            </div>
            {epLimit < eps.length && (
              <div className="ep-more"><button onClick={() => setEpLimit(l => l + 12)}>Carregar mais ({eps.length - epLimit})</button></div>
            )}
          </div>

          {/* coluna direita: metadados, gêneros, sessões */}
          <div>
            <div className="detail-section-title">Ficha <span className="st-line" /></div>
            <div className="detail-meta-grid">
              <div className="dm-cell"><div className="k">Estúdio</div><div className="v">{a.studio}</div></div>
              <div className="dm-cell"><div className="k">Temporada</div><div className="v">{a.season}</div></div>
              <div className="dm-cell"><div className="k">Formato</div><div className="v">{a.media_type}</div></div>
              <div className="dm-cell"><div className="k">Episódios</div><div className="v">{a.episodes_total == null ? 'em exibição' : a.episodes_total}</div></div>
              <div className="dm-cell"><div className="k">Progresso</div><div className="v">{a.episodes_watched}/{a.episodes_total == null ? '?' : a.episodes_total}</div></div>
              <div className="dm-cell"><div className="k">Sessões</div><div className="v">{logs.length || '—'}</div></div>
            </div>

            <div className="detail-section-title" style={{ marginTop: 26 }}>Gêneros <span className="st-line" /></div>
            <div className="chips">
              {a.genres.map(g => <span key={g} className="tag-chip"><span className="t-hash">#</span>{g}</span>)}
              {a.fav && <span className="tag-chip fav"><Heart filled style={{ width: 12, height: 12 }} /> favorito</span>}
            </div>

            {logs.length > 0 && (
              <>
                <div className="detail-section-title" style={{ marginTop: 26 }}>Histórico de sessões <span className="st-line" /></div>
                <div className="sess-log">
                  {logs.map(e => (
                    <div key={e.id} className="sess-item">
                      <div className="sess-date">{fmtDate(e.date)} · {new Date(e.date + 'T00:00:00').getFullYear()}</div>
                      <div className="sess-row">
                        <span className="sess-eps">Ep {e.ep_start === e.ep_end ? e.ep_start : `${e.ep_start}–${e.ep_end}`}</span>
                        {e.score && <Score value={e.score} />}
                      </div>
                      {e.note && <div className="sess-note">"{e.note}"</div>}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Home, FavoriteAnimes, AnimePicker, Catalog, AnimeDetail, sortAnimes, STATUS_FILTERS, saudacao });
