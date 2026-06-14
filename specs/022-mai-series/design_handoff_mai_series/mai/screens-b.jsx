/* ─────────────────────────────────────────────────────────────────────────
   Mai · Séries — telas B: Diário, Quero Assistir, Próximos Episódios, Stats
   ───────────────────────────────────────────────────────────────────────── */

/* ════ DIÁRIO (cronológico, agrupado por mês) ════════════════════════════ */
function Diary({ navigate }) {
  const groups = [];
  LOGS.forEach(e => {
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
        <span className="section-sub">{LOGS.length} sessões · cada bloco de episódios que você assistiu</span>
      </div>

      {groups.map(g => (
        <div className="diary-month" key={g.key}>
          <div className="diary-month-label">
            <span className="dm-name">{MESES[g.m].charAt(0).toUpperCase() + MESES[g.m].slice(1)} {g.y}</span>
            <span className="dm-count">{g.items.length} {g.items.length === 1 ? 'sessão' : 'sessões'}</span>
          </div>
          {g.items.map(e => {
            const a = seriesById(e.seriesId);
            const dt = new Date(e.date + 'T00:00:00');
            const eps = e.ep_end - e.ep_start + 1;
            return (
              <div className="diary-row" key={e.id} onClick={() => navigate('detalhe', a.id)}>
                <div className="dr-day">
                  <div className="d-num">{dt.getDate()}</div>
                  <div className="d-wd">{DIAS_CURTO[dt.getDay()]}</div>
                </div>
                <div className="dr-poster"><PosterCard series={a} /></div>
                <div className="dr-main">
                  <div className="dr-title">{a.title}</div>
                  <div className="dr-eps">T{e.season}E{e.ep_start === e.ep_end ? e.ep_start : `${e.ep_start}–${e.ep_end}`} · {eps} {eps === 1 ? 'episódio' : 'episódios'}</div>
                  {e.note && <div className="dr-note">"{e.note}"</div>}
                </div>
                <div className="dr-marks">
                  {e.score ? <Score value={e.score} /> : <span className="result-count">—</span>}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/* ════ QUERO ASSISTIR (watchlist) ════════════════════════════════════════ */
function Watchlist({ navigate, openLog }) {
  const want = SERIES.filter(a => a.status === 'quero_assistir');
  const totalEps = want.reduce((a, x) => a + (x.episodes_count || 0), 0);
  return (
    <div className="page">
      <div className="section-head" style={{ marginTop: 32, marginBottom: 0 }}>
        <h2 className="section-title" style={{ fontSize: 30 }}>Quero assistir</h2>
        <span className="section-sub">{want.length} séries · ~{totalEps} episódios na fila</span>
      </div>
      <div className="wl-list">
        {want.map(a => (
          <div key={a.id} className="wl-item">
            <div className="wl-poster" onClick={() => navigate('detalhe', a.id)}><PosterCard series={a} /></div>
            <div className="wl-info">
              <div className="wl-title" onClick={() => navigate('detalhe', a.id)}>{a.title}</div>
              <div className="wl-sub">{a.network} · {a.first_air_year} · {a.seasons.length} {a.seasons.length === 1 ? 'temporada' : 'temporadas'} · {a.episodes_count == null ? '?' : a.episodes_count} eps</div>
              <div className="wl-genres">{a.genres.map(g => <span key={g} className="wl-genre">{g}</span>)}</div>
            </div>
            <div className="wl-right">
              <button className="btn btn-warm" style={{ fontSize: 12.5, padding: '10px 16px' }} onClick={() => openLog(a.id, 1, 1)}>
                <Icon name="play" /> Começar
              </button>
            </div>
          </div>
        ))}
        {want.length === 0 && <p className="empty-state">Fila vazia — adicione séries pelo botão + ou pela busca. 🐰</p>}
      </div>
    </div>
  );
}

/* ════ PRÓXIMOS EPISÓDIOS (timeline por dia) ═════════════════════════════ */
function Upcoming({ navigate }) {
  const groups = [];
  UPCOMING.forEach(s => {
    let g = groups.find(x => x.date === s.aired);
    if (!g) { g = { date: s.aired, items: [] }; groups.push(g); }
    g.items.push(s);
  });

  return (
    <div className="page">
      <div className="section-head" style={{ marginTop: 32 }}>
        <h2 className="section-title" style={{ fontSize: 30 }}>Próximos episódios</h2>
        <span className="section-sub">o que sai das séries que você está assistindo · 14 dias</span>
      </div>

      {groups.map(g => {
        const isToday = g.date === TODAY;
        return (
          <div className="sched-day" key={g.date}>
            <div className="sched-day-label">
              <span className={'sdl-name' + (isToday ? ' today' : '')}>{isToday ? `Hoje, ${fmtShort(g.date)}` : relFuture(g.date)}</span>
              <span className="sdl-rule" />
              <span className="sdl-count">{g.items.length} ep</span>
            </div>
            {g.items.map(s => { const a = seriesById(s.seriesId); const p = POSTER[a.poster] || POSTER.periwinkle; return (
              <div className="sched-card" key={s.seriesId} onClick={() => navigate('detalhe', a.id)}>
                <div className="sched-still" style={{ background: `linear-gradient(150deg, ${p.a}, ${p.b})` }}><span className="ss-ico">📺</span></div>
                <div className="sched-info">
                  <div className="sched-title">{a.title}</div>
                  <div className="sched-ep">T{s.season}E{s.ep} · {s.title}</div>
                  <div className="sched-net">{a.network} · {isToday ? 'hoje' : relFuture(s.aired)}</div>
                </div>
                <span className="sched-badge">novo ep</span>
              </div>
            ); })}
          </div>
        );
      })}
      {UPCOMING.length === 0 && <p className="empty-state">Nenhum episódio agendado. Volte quando estiver acompanhando algo em exibição. 🌙</p>}
    </div>
  );
}

/* ════ ESTATÍSTICAS (o ano em séries) ════════════════════════════════════ */
function Stats({ navigate }) {
  const monthsUpto = new Date(TODAY + 'T00:00:00').getMonth() + 1;
  const monthly = STATS.monthlyEps.slice(0, monthsUpto);
  const maxMonth = Math.max(...monthly, 1);
  const genres = Object.entries(STATS.byGenre).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxGenre = Math.max(...genres.map(g => g[1]), 1);
  const networks = Object.entries(STATS.byNetwork).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 6);
  const maxNet = Math.max(...networks.map(s => s[1]), 1);
  const statusOrder = ['assistindo','concluida','quero_assistir','pausada','abandonada'];
  const maxStatus = Math.max(...statusOrder.map(s => STATS.byStatus[s]), 1);

  return (
    <div className="page">
      <div className="year-switch">
        <button aria-label="Ano anterior" disabled><Icon name="chevL" /></button>
        <span className="yr">2026</span>
        <span className="yr-sub">{STATS.sessions} sessões · {STATS.epsTotal} episódios · {STATS.hours}h em cena</span>
      </div>

      {/* totais */}
      <div className="big-stat-row">
        <div className="big-stat"><div className="n">{STATS.completed}</div><div className="l">séries concluídas</div></div>
        <div className="big-stat"><div className="n">{STATS.epsTotal}</div><div className="l">episódios vistos</div></div>
        <div className="big-stat"><div className="n">{STATS.hours}<span className="u">h</span></div><div className="l">horas de série</div></div>
        <div className="big-stat"><div className="n">{STATS.avgScore.toFixed(1)}</div><div className="l">nota média · / 5</div></div>
      </div>

      {/* episódios por mês */}
      <div className="section">
        <div className="stat-panel">
          <div className="stat-panel-head"><span className="t">Episódios por mês</span><span className="s">o pulso do ano</span></div>
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

      <div className="stats-grid">
        {/* por status */}
        <div className="stat-panel">
          <div className="stat-panel-head"><span className="t">Por status</span></div>
          <div className="status-bars">
            {statusOrder.map(s => (
              <div key={s} className="sb-row">
                <span className="sb-name"><span style={{ width: 8, height: 8, borderRadius: '50%', background: `var(${STATUS_VAR[s]})`, display: 'inline-block' }} />{STATUS_LABEL[s]}</span>
                <span className="sb-track"><i style={{ width: `${(STATS.byStatus[s] / maxStatus) * 100}%`, background: `var(${STATUS_VAR[s]})` }} /></span>
                <span className="sb-n">{STATS.byStatus[s]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* top gêneros */}
        <div className="stat-panel">
          <div className="stat-panel-head"><span className="t">Top gêneros</span></div>
          {genres.map(([name, n]) => (
            <div key={name} className="rank-row">
              <span className="rk-name">{name}</span>
              <span className="rk-track"><i style={{ width: `${(n / maxGenre) * 100}%` }} /></span>
              <span className="rk-n">{n}</span>
            </div>
          ))}
        </div>

        {/* top redes */}
        <div className="stat-panel">
          <div className="stat-panel-head"><span className="t">Top redes</span></div>
          {networks.map(([name, n]) => (
            <div key={name} className="rank-row">
              <span className="rk-name">{name}</span>
              <span className="rk-track warm"><i style={{ width: `${(n / maxNet) * 100}%` }} /></span>
              <span className="rk-n">{n}</span>
            </div>
          ))}
        </div>

        {/* destaque */}
        <div className="stat-panel">
          <div className="stat-panel-head"><span className="t">Destaque do ano</span></div>
          {STATS.fav && (
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <div style={{ width: 84, flexShrink: 0, cursor: 'pointer' }} onClick={() => navigate('detalhe', STATS.fav.id)}>
                <PosterCard series={STATS.fav} badge />
              </div>
              <div>
                <div style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 22, lineHeight: 1.1, letterSpacing: '-0.01em' }}>{STATS.fav.title}</div>
                <div style={{ marginTop: 8 }}><Stars value={STATS.fav.score} /></div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-3)', marginTop: 8 }}>{STATS.fav.network} · {STATS.fav.first_air_year}</div>
                <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 8 }}>Maior maratona: <b style={{ color: 'var(--mai-deep)' }}>{STATS.maxSessions} sessões</b> num dia</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* heatmap */}
      <div className="section">
        <div className="stat-panel-head" style={{ marginBottom: 0 }}><span className="t" style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 19 }}>Heatmap de sessões</span><span className="s">o ano inteiro, dia a dia</span></div>
        <div className="heat-card"><Heatmap data={HEATMAP} /></div>
      </div>
    </div>
  );
}

Object.assign(window, { Diary, Watchlist, Upcoming, Stats });
