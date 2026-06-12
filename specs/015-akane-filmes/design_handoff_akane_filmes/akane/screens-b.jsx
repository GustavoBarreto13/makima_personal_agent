/* ─────────────────────────────────────────────────────────────────────────
   Akane · Filmes — telas B: Diário, Watchlist, Listas, Tags, Rewind
   ───────────────────────────────────────────────────────────────────────── */

/* ════ DIÁRIO (tabela cronológica, estilo Letterboxd) ════════════════════ */
function Diary({ navigate }) {
  // agrupa por mês/ano
  const groups = [];
  DIARY.forEach(e => {
    const dt = new Date(e.date + 'T00:00:00');
    const key = dt.getFullYear() + '-' + dt.getMonth();
    let g = groups.find(x => x.key === key);
    if (!g) { g = { key, m: dt.getMonth(), y: dt.getFullYear(), items: [] }; groups.push(g); }
    g.items.push(e);
  });

  return (
    <div className="page">
      <div className="section-head" style={{ marginTop: 32 }}>
        <h2 className="section-title" style={{ fontSize: 30 }}>Diário</h2>
        <span className="section-sub">{DIARY.length} sessões registradas · bebe da sua lista de filmes</span>
      </div>

      {groups.map(g => (
        <div className="diary-month" key={g.key}>
          <div className="diary-month-label">
            <span className="dm-name">{MESES[g.m].charAt(0).toUpperCase() + MESES[g.m].slice(1)}</span>
            <span className="dm-year">{g.y}</span>
            <span className="dm-count">{g.items.length} {g.items.length === 1 ? 'sessão' : 'sessões'}</span>
          </div>
          {g.items.map(e => {
            const f = filmById(e.filmId);
            const dt = new Date(e.date + 'T00:00:00');
            return (
              <div className="diary-row" key={e.id} onClick={() => navigate('detalhe', f.id)}>
                <div className="dr-day">
                  <div className="d-num">{dt.getDate()}</div>
                  <div className="d-wd">{DIAS_CURTO[dt.getDay()]}</div>
                </div>
                <div className="dr-poster"><Poster film={f} /></div>
                <div className="dr-main">
                  <div className="dr-title">{f.title}<span className="yr">{f.year}</span></div>
                  {e.note && <div className="dr-note">"{e.note}"</div>}
                </div>
                <div className="dr-marks">
                  {e.rating ? <Stars value={e.rating} /> : <span className="mk">—</span>}
                  {e.liked && <span className="mk"><Heart filled className="heart-ico" /></span>}
                  {e.rewatch && <span className="mk rw"><Icon name="rewatch" /></span>}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/* ════ WATCHLIST ═════════════════════════════════════════════════════════ */
function Watchlist({ navigate, openLog }) {
  const want = FILMS.filter(f => f.status === 'watchlist');
  const totalMin = want.reduce((a, f) => a + f.runtime, 0);
  return (
    <div className="page">
      <div className="section-head" style={{ marginTop: 32, marginBottom: 0 }}>
        <h2 className="section-title" style={{ fontSize: 30 }}>Quero ver</h2>
        <span className="section-sub">{want.length} filmes · {fmtRuntime(totalMin)} de cinema esperando</span>
      </div>
      <div className="wl-list">
        {want.map(f => (
          <div key={f.id} className="wl-item">
            <div className="wl-poster" onClick={() => navigate('detalhe', f.id)}><Poster film={f} /></div>
            <div className="wl-info">
              <div className="wl-title" onClick={() => navigate('detalhe', f.id)}>{f.title}</div>
              <div className="wl-sub">{f.director} · {f.year} · {fmtRuntime(f.runtime)} · {f.country}</div>
              <span className="wl-genre">{f.genre}</span>
              {f.notes && <div className="wl-note">"{f.notes}"</div>}
            </div>
            <div className="wl-right">
              <button className="btn btn-primary" style={{ fontSize: 12.5, padding: '9px 16px' }} onClick={() => openLog(f.id)}>
                <Icon name="check" /> Já vi
              </button>
            </div>
          </div>
        ))}
        {want.length === 0 && <p className="empty-state">Watchlist vazia — adicione filmes pelo acervo.</p>}
      </div>
    </div>
  );
}

/* ════ LISTAS (coleções curadas) ═════════════════════════════════════════ */
function Lists({ navigate }) {
  return (
    <div className="page">
      <div className="section-head" style={{ marginTop: 32 }}>
        <h2 className="section-title" style={{ fontSize: 30 }}>Listas</h2>
        <span className="section-sub">coleções que você curou</span>
      </div>
      <div className="list-grid">
        {LISTS.map(l => {
          const films = l.films.map(filmById).filter(Boolean).slice(0, 5);
          return (
            <div key={l.id} className="list-card" onClick={() => navigate('lista', l.id)}>
              <div className="list-spines">{films.map(f => <Poster key={f.id} film={f} mini />)}</div>
              <div className="list-accent-bar" style={{ background: l.accent }} />
              <div className="list-name">{l.name}</div>
              <div className="list-desc">{l.desc}</div>
              <div className="list-count">{l.films.length} filmes</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ListView({ listId, navigate }) {
  const l = LISTS.find(x => x.id === listId);
  if (!l) return <Lists navigate={navigate} />;
  const films = l.films.map(filmById).filter(Boolean);
  return (
    <div className="page">
      <button className="detail-back" onClick={() => navigate('listas')}><Icon name="arrowLeft" /> Listas</button>
      <div style={{ marginTop: 18 }}>
        <div className="list-accent-bar" style={{ background: l.accent, width: 44, height: 4 }} />
        <h1 className="detail-title" style={{ fontSize: 40, marginTop: 8 }}>{l.name}</h1>
        <p className="list-desc" style={{ fontSize: 15, maxWidth: '56ch' }}>{l.desc}</p>
        <div className="list-count">{films.length} filmes</div>
      </div>
      <div className="poster-grid" style={{ marginTop: 28 }}>
        {films.map(f => (
          <a key={f.id} className="poster-link" onClick={() => navigate('detalhe', f.id)}>
            <Poster film={f} badge />
            <div className="poster-meta">
              <div className="pm-title">{f.title}</div>
              <div className="pm-sub">{f.director} · {f.year}</div>
              <div className="pm-row">{f.rating ? <Stars value={f.rating} /> : <span className="result-count" style={{ color: 'var(--rose-deep)' }}>quero ver</span>}</div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

/* ════ TAGS (etiquetas → futura base de pessoas) ═════════════════════════ */
function Tags({ navigate }) {
  const max = Math.max(...TAGS.map(t => t.count), 1);
  return (
    <div className="page">
      <div className="section-head" style={{ marginTop: 32 }}>
        <h2 className="section-title" style={{ fontSize: 30 }}>Etiquetas</h2>
        <span className="section-sub">{TAGS.length} etiquetas · organize por tema, estilo ou pessoa</span>
      </div>
      <div className="people-note" style={{ marginTop: 0, marginBottom: 18 }}>
        <Icon name="user" /> Etiquetas de pessoas (como <b style={{ color: 'var(--rose-deep)', fontStyle: 'normal' }}>Satoshi Kon</b>) vão se conectar à base de pessoas em breve.
      </div>
      <div className="chips" style={{ gap: 10 }}>
        {TAGS.map(t => (
          <a key={t.name} className={'tag-chip' + (t.person ? ' person' : '')} onClick={() => navigate('tag', t.name)} style={{ fontSize: 13.5, padding: '8px 14px' }}>
            {t.person ? <Icon name="user" style={{ width: 14, height: 14, color: 'var(--rose)' }} /> : <span className="t-hash">#</span>}
            {t.name}
            <span className="t-count">{t.count}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

/* ════ REWIND (estatísticas do ano) ══════════════════════════════════════ */
function Highlight({ k, v, s }) {
  return (
    <div className="highlight">
      <span className="hl-k">{k}</span>
      <span className="hl-v">{v}</span>
      {s && <span className="hl-s">{s}</span>}
    </div>
  );
}

function Rewind({ navigate }) {
  const monthsUpto = TODAY ? new Date(TODAY + 'T00:00:00').getMonth() + 1 : 12;
  const monthly = STATS.monthly.slice(0, monthsUpto);
  const maxMonth = Math.max(...monthly, 1);
  const distKeys = []; for (let v = 5; v >= 0.5; v -= 0.5) distKeys.push(v.toFixed(1));
  const maxDist = Math.max(...Object.values(STATS.dist), 1);
  const genres = Object.entries(STATS.byGenre).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxGenre = Math.max(...genres.map(g => g[1]), 1);
  const directors = Object.entries(STATS.byDirector).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 6);
  const maxDir = Math.max(...directors.map(d => d[1]), 1);
  const fav = STATS.fav;

  return (
    <div className="page">
      <div className="rewind-hero">
        <div className="eyebrow">Seu ano em cinema</div>
        <h2>Rewind 2026</h2>
        <p className="sub">{STATS.sessions} sessões · {STATS.filmsWatched} filmes · {Math.round(STATS.totalMinutes / 60)} horas no escuro</p>
      </div>

      {/* totais */}
      <div className="big-stat-row">
        <div className="big-stat"><div className="n">{STATS.filmsWatched}</div><div className="l">filmes vistos</div></div>
        <div className="big-stat"><div className="n">{STATS.sessions}</div><div className="l">sessões no diário</div></div>
        <div className="big-stat"><div className="n">{Math.round(STATS.totalMinutes / 60)}<span style={{ fontSize: 24 }}>h</span></div><div className="l">horas assistidas</div></div>
        <div className="big-stat"><div className="n">{STATS.rewatches}</div><div className="l">revisões</div></div>
      </div>

      {/* sessões por mês */}
      <div className="section">
        <div className="heat-card">
          <div className="heat-head"><span className="heat-title">Sessões por mês</span><span className="section-sub">o pulso do ano</span></div>
          <div className="bars">
            {monthly.map((v, i) => (
              <div key={i} className="bar-col">
                <span className="bar-val">{v}</span>
                <div className={'bar' + (v === 0 ? ' empty' : '')} style={{ height: `${Math.max(2, (v / maxMonth) * 100)}%` }} />
                <span className="bar-lbl">{MESES_CURTO[i]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="section rewind-grid">
        {/* histograma de notas */}
        <div className="heat-card">
          <div className="heat-head"><span className="heat-title">Como você avalia</span><span className="section-sub">0,5 a 5,0</span></div>
          {distKeys.map(k => (
            <div key={k} className="hist-row">
              <span className="hl"><Stars value={Number(k)} /><span className="n">{k}</span></span>
              <span className="hist-bar"><i style={{ width: `${(STATS.dist[k] / maxDist) * 100}%` }} /></span>
              <span className="hist-n">{STATS.dist[k]}</span>
            </div>
          ))}
        </div>

        {/* destaques */}
        <div className="heat-card">
          <div className="heat-head"><span className="heat-title">Destaques do ano</span></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 4 }}>
            {fav && <Highlight k="Filme favorito" v={fav.title} s={`${fav.rating.toFixed(1)}★ · ${fav.director}`} />}
            <Highlight k="Maior maratona" v={`${STATS.maxSessions} filmes`} s="no mesmo dia" />
            <Highlight k="Década mais vista" v={`Anos ${String(STATS.topDecade[0]).slice(2)}`} s={`${STATS.topDecade[1]} filmes desse período`} />
            <Highlight k="Nota média" v={STATS.avgRating.toFixed(2)} s={`${STATS.liked} filmes com coração`} />
          </div>
        </div>

        {/* top gêneros */}
        <div className="heat-card">
          <div className="heat-head"><span className="heat-title">Top gêneros</span></div>
          {genres.map(([name, n]) => (
            <div key={name} className="rank-row">
              <div style={{ flex: '0 0 auto', minWidth: 92 }}>
                <div className="rk-name">{name}</div>
              </div>
              <span className="rk-track"><i style={{ width: `${(n / maxGenre) * 100}%` }} /></span>
              <span className="rk-n">{n}</span>
            </div>
          ))}
        </div>

        {/* top diretores */}
        <div className="heat-card">
          <div className="heat-head"><span className="heat-title">Top diretores</span></div>
          {directors.map(([name, n]) => (
            <div key={name} className="rank-row">
              <span className="rk-av">{name.split(' ').map(w => w[0]).slice(0, 2).join('')}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="rk-name">{name}</div>
                <div className="rk-sub">{n} {n === 1 ? 'filme' : 'filmes'}</div>
              </div>
              <span className="rk-track" style={{ maxWidth: 90 }}><i style={{ width: `${(n / maxDir) * 100}%` }} /></span>
            </div>
          ))}
        </div>
      </div>

      {/* top pessoas — prepara base de pessoas */}
      <div className="section">
        <div className="heat-card">
          <div className="heat-head"><span className="heat-title">Pessoas que marcaram seu ano</span><span className="section-sub">direção + elenco + equipe</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '4px 24px' }}>
            {STATS.topPeople.map(p => (
              <div key={p.name} className="rank-row person">
                <span className="rk-av">{p.name.split(' ').map(w => w[0]).slice(0, 2).join('')}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="rk-name">{p.name}</div>
                  <div className="rk-sub">{p.roles.join(' · ')}</div>
                </div>
                <span className="rk-n">{p.count}</span>
              </div>
            ))}
          </div>
          <div className="people-note"><Icon name="user" /> Em breve, cada pessoa abre um perfil próprio — conectado à base de pessoas do app.</div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Diary, Watchlist, Lists, ListView, Tags, Rewind, Highlight });
