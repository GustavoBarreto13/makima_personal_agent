/* ─────────────────────────────────────────────────────────────────────────
   Frieren · Livros — telas A: Início, Catálogo, Detalhe
   ───────────────────────────────────────────────────────────────────────── */

function saudacao() {
  const h = new Date().getHours();
  if (h < 5)  return 'Boa noite';
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

/* ════ INÍCIO ════════════════════════════════════════════════════════════ */
function Home({ layout, navigate, openLog, atual }) {
  const [period, setPeriod] = React.useState('30');

  const wk = pagesInLast(7).sum;
  const prevWk = HEATMAP.slice(-14, -7).reduce((a, d) => a + d.pages, 0);
  const delta = prevWk ? Math.round((wk - prevWk) / prevWk * 100) : 0;
  const spark = HEATMAP.slice(-14).map(d => d.pages);

  const days = period === '7' ? 7 : period === '30' ? 30 : HEATMAP.length;
  const effDays = Math.min(days, HEATMAP.length);
  const avg = Math.round(HEATMAP.slice(-effDays).reduce((a, d) => a + d.pages, 0) / effDays);

  const lendo = BOOKS.filter(b => b.status === 'reading');

  return (
    <div className="page">
      {/* ── HERO ── */}
      <div className="hero" data-layout={layout}>
        <div className="hero-grain" />
        <div className="hero-inner">
          <div className="hero-copy">
            <div className="hero-eyebrow">Biblioteca de Frieren</div>
            <h1 className="hero-greet">{saudacao()}.</h1>
            <p className="hero-now">No meio de <em>{atual.title}</em> · pág. {atual.page} de {atual.pages}</p>
            <p className="hero-quote">"A magia é a arte de imaginar o mundo. Os livros também — e a vantagem é que neles a gente nunca esquece."</p>
            <div className="hero-cta">
              <button className="btn btn-primary" onClick={openLog}>
                <Icon name="plus" /> Registrar leitura
              </button>
              <button className="btn btn-ghost" onClick={() => navigate('detalhe', atual.id)}>
                <Icon name="open" /> Continuar {atual.title.length > 18 ? 'leitura' : atual.title}
              </button>
            </div>
          </div>
          <div className="hero-portrait">
            <div className="halo" />
            <img src="frieren/frieren.png" alt="Frieren" />
          </div>
        </div>
      </div>

      {/* ── RESUMOS ── */}
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label"><Icon name="open" style={{ width: 12, height: 12 }} /> Páginas · 7 dias</div>
          <div className="stat-value">{wk}</div>
          <Spark data={spark} />
          <div className="stat-foot">{delta >= 0 ? <span className="up">↑ {delta}%</span> : <span>↓ {Math.abs(delta)}%</span>} vs. semana anterior</div>
        </div>

        <div className="stat-card">
          <div className="stat-label"><Icon name="flame" style={{ width: 12, height: 12 }} /> Sequência</div>
          <div className="stat-value">{STATS.streak}<span className="unit">dias</span></div>
          <div className="stat-foot" style={{ marginTop: 14 }}>Recorde do ano: <b>{STATS.bestStreak} dias</b></div>
        </div>

        <div className="stat-card">
          <div className="stat-label"><Icon name="stats" style={{ width: 12, height: 12 }} /> Lidos · 2026</div>
          <div className="stat-value">{STATS.booksRead}<span className="unit">livros</span></div>
          <div className="stat-foot" style={{ marginTop: 14 }}>Meta de {30} — faltam <b>{30 - STATS.booksRead}</b></div>
        </div>

        <div className="stat-card">
          <div className="stat-label">
            <Icon name="calendar" style={{ width: 12, height: 12 }} /> Média diária
            <select className="period-select" value={period} onChange={e => setPeriod(e.target.value)} style={{ marginLeft: 'auto' }}>
              <option value="7">7 dias</option>
              <option value="30">30 dias</option>
              <option value="365">no ano</option>
            </select>
          </div>
          <div className="stat-value">{avg}<span className="unit">págs/dia</span></div>
          <div className="stat-foot" style={{ marginTop: 14 }}>≈ {Math.round(avg / 0.6)} min de leitura</div>
        </div>
      </div>

      {/* ── HEATMAP ── */}
      <div className="section">
        <div className="heat-card">
          <div className="heat-head">
            <span className="heat-title">Constância de leitura</span>
            <span className="section-sub">páginas por dia · 2026</span>
            <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-3)' }}>
              {STATS.totalPages.toLocaleString('pt-BR')} págs no ano
            </span>
          </div>
          <Heatmap data={HEATMAP} />
        </div>
      </div>

      {/* ── LENDO AGORA ── */}
      <div className="section">
        <div className="section-head">
          <h2 className="section-title">Lendo agora</h2>
          <span className="section-sub">{lendo.length} em progresso</span>
        </div>
        <div className="row-scroll">
          {lendo.map(b => (
            <div key={b.id} className="reading-card" onClick={() => navigate('detalhe', b.id)}>
              <Cover book={b} />
              <div className="rc-body">
                <div className="rc-title">{b.title}</div>
                <div className="rc-author">{b.author}</div>
                <div className="rc-prog-meta">
                  <span>pág. {b.page} de {b.pages}</span>
                  <span>{Math.round(b.progress * 100)}%</span>
                </div>
                <ProgressBar value={b.progress} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── ATIVIDADE RECENTE ── */}
      <div className="section">
        <div className="section-head">
          <h2 className="section-title">Atividade recente</h2>
          <span className="section-link" onClick={() => navigate('atividade')}>Ver diário completo →</span>
        </div>
        <div className="feed">
          {ACTIVITY.slice(0, 4).map(a => <FeedItem key={a.id} a={a} navigate={navigate} />)}
        </div>
      </div>
    </div>
  );
}

/* item do feed (reusado em Início e Atividade) */
function FeedItem({ a, navigate }) {
  const b = bookById(a.bookId);
  const verb = {
    progress: 'leu', finished: 'terminou', started: 'começou', review: 'resenhou',
  }[a.type];
  return (
    <div className="feed-item">
      <div className="feed-cover" onClick={() => navigate('detalhe', b.id)} style={{ cursor: 'pointer' }}>
        <Cover book={b} />
      </div>
      <div className="feed-body">
        <div className="feed-line">
          <span className="verb">{verb} </span>
          <b style={{ cursor: 'pointer' }} onClick={() => navigate('detalhe', b.id)}>{b.title}</b>
          {a.type === 'progress' && <span className="verb"> · {a.pages} páginas</span>}
          {a.type === 'started' && <span className="verb"> · {b.author}</span>}
        </div>
        {a.note && <div className="feed-note">"{a.note}"</div>}
        <div className="feed-meta">
          <span>{relDate(a.date)}</span>
          {a.type === 'finished' && <span className="feed-tag done">terminado</span>}
          {a.type === 'started' && <span className="feed-tag">novo</span>}
          {a.type === 'progress' && <span>até a pág. {a.page}</span>}
          {a.rating && <Stars value={a.rating} />}
        </div>
      </div>
    </div>
  );
}

/* ════ CATÁLOGO ══════════════════════════════════════════════════════════ */
const STATUS_FILTERS = [
  { id: 'todos',    label: 'Todos' },
  { id: 'reading',  label: 'Lendo' },
  { id: 'read',     label: 'Lidos' },
  { id: 'owned',    label: 'Quero ler' },
  { id: 'wishlist', label: 'Wishlist' },
];

function sortBooks(list, sort) {
  const arr = [...list];
  if (sort === 'Título') return arr.sort((a, b) => a.title.localeCompare(b.title, 'pt'));
  if (sort === 'Autor') return arr.sort((a, b) => a.author.localeCompare(b.author, 'pt'));
  if (sort === 'Avaliação') return arr.sort((a, b) => (b.rating || 0) - (a.rating || 0));
  if (sort === 'Progresso') return arr.sort((a, b) => (b.progress || 0) - (a.progress || 0));
  // Recentes
  const key = b => b.finished || b.started || '0';
  return arr.sort((a, b) => (key(b)).localeCompare(key(a)));
}

function Catalog({ navigate, sort, query, initialFilter }) {
  const [filter, setFilter] = React.useState(initialFilter || 'todos');
  let list = BOOKS.filter(b => filter === 'todos' || b.status === filter);
  if (query) {
    const q = query.toLowerCase();
    list = list.filter(b => b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q));
  }
  list = sortBooks(list, sort);

  return (
    <div className="page">
      <div className="section-head" style={{ marginTop: 32, marginBottom: 0 }}>
        <h2 className="section-title" style={{ fontSize: 28 }}>Biblioteca</h2>
        <span className="section-sub">{BOOKS.length} títulos no acervo</span>
      </div>
      <div className="cat-toolbar">
        <div className="chips">
          {STATUS_FILTERS.map(f => (
            <button key={f.id} className={'chip' + (filter === f.id ? ' active' : '')} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="toolbar-spacer" />
        <span className="result-count">{list.length} {list.length === 1 ? 'livro' : 'livros'} · ordenado por {sort.toLowerCase()}</span>
      </div>

      <div className="cover-grid">
        {list.map(b => (
          <a key={b.id} className="cover-link" onClick={() => navigate('detalhe', b.id)}>
            <Cover book={b} badge />
            <div className="cover-meta">
              <div className="cm-title">{b.title}</div>
              <div className="cm-author">{b.author}</div>
              <div className="cm-row">
                {b.rating ? <Stars value={b.rating} /> :
                 b.status === 'reading' ? <span className="result-count" style={{ color: 'var(--teal-deep)' }}>{Math.round(b.progress * 100)}% lido</span> :
                 <span className="result-count">na wishlist</span>}
              </div>
            </div>
          </a>
        ))}
      </div>
      {list.length === 0 && (
        <p style={{ color: 'var(--ink-3)', marginTop: 40, textAlign: 'center' }}>Nada encontrado{query ? ` para "${query}"` : ''}.</p>
      )}
    </div>
  );
}

/* ════ DETALHE ═══════════════════════════════════════════════════════════ */
function BookDetail({ bookId, navigate, openLog }) {
  const b = bookById(bookId);
  if (!b) return <div className="page"><p style={{ marginTop: 40 }}>Livro não encontrado.</p></div>;

  const logs = ACTIVITY.filter(a => a.bookId === b.id);
  const statusLabel = { reading: 'Lendo agora', read: 'Lido', wishlist: 'Quero ler' }[b.status];
  const shelves = SHELVES.filter(s => (b.shelves || []).includes(s.id));

  return (
    <div className="page">
      <button className="detail-back" onClick={() => navigate('catalogo')}>
        <Icon name="arrowLeft" /> Biblioteca
      </button>

      <div className="detail-hero">
        <div className="detail-cover-wrap">
          <Cover book={b} />
          {b.status === 'reading' && (
            <div>
              <div className="rc-prog-meta" style={{ marginBottom: 6 }}>
                <span>pág. {b.page} de {b.pages}</span><span>{Math.round(b.progress * 100)}%</span>
              </div>
              <ProgressBar value={b.progress} />
            </div>
          )}
          <button className="btn btn-primary" style={{ justifyContent: 'center' }} onClick={() => openLog(b.id)}>
            <Icon name="plus" /> Registrar leitura
          </button>
        </div>

        <div className="detail-info">
          <div className="detail-genre">{b.genre}</div>
          <h1 className="detail-title">{b.title}</h1>
          <p className="detail-author">de <b>{b.author}</b> · {b.year}</p>

          <div className="detail-rating-row">
            {b.rating ? (<><Stars value={b.rating} lg /><span className="rating-num" style={{ fontSize: 14 }}>{b.rating.toFixed(1)}</span></>)
                      : <span style={{ color: 'var(--ink-3)', fontStyle: 'italic', fontFamily: 'var(--serif)' }}>Ainda sem nota</span>}
            <span className="chip active" style={{ cursor: 'default',
              background: b.status === 'reading' ? 'var(--teal)' : b.status === 'read' ? 'var(--gold-deep)' : 'var(--card)',
              borderColor: b.status === 'wishlist' ? 'var(--line)' : 'transparent',
              color: b.status === 'wishlist' ? 'var(--ink-2)' : '#fff' }}>{statusLabel}</span>
          </div>

          <div className="detail-meta-grid">
            <div className="dm-cell"><div className="k">Páginas</div><div className="v">{b.pages}</div></div>
            <div className="dm-cell"><div className="k">Publicado</div><div className="v">{b.year}</div></div>
            <div className="dm-cell"><div className="k">Gênero</div><div className="v" style={{ fontSize: 13 }}>{b.genre}</div></div>
            {b.finished && <div className="dm-cell"><div className="k">Terminado</div><div className="v" style={{ fontSize: 13 }}>{fmtDate(b.finished)}</div></div>}
            {b.status === 'reading' && <div className="dm-cell"><div className="k">Progresso</div><div className="v">{Math.round(b.progress * 100)}%</div></div>}
          </div>

          <div className="detail-section-title">Sua resenha</div>
          {b.review
            ? <p className="detail-review">{b.review}</p>
            : <p className="detail-empty-review">Você ainda não escreveu sobre este livro. {b.status === 'wishlist' ? 'Ele te espera na wishlist.' : 'Registre uma leitura para começar.'}</p>}

          {shelves.length > 0 && (
            <>
              <div className="detail-section-title">Nas estantes</div>
              <div className="chips">
                {shelves.map(s => (
                  <button key={s.id} className="chip" onClick={() => navigate('listas')}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.accent, display: 'inline-block', marginRight: 6 }} />
                    {s.name}
                  </button>
                ))}
              </div>
            </>
          )}

          {logs.length > 0 && (
            <>
              <div className="detail-section-title">Diário deste livro</div>
              <div className="feed">
                {logs.map(a => (
                  <div key={a.id} className="feed-item" style={{ paddingLeft: 0 }}>
                    <div className="feed-body" style={{ borderLeft: '2px solid var(--line)', paddingLeft: 16 }}>
                      <div className="feed-line">
                        {a.type === 'finished' ? <b>Terminou o livro</b> :
                         a.type === 'started' ? <b>Começou a ler</b> :
                         <><b>+{a.pages} páginas</b> <span className="verb">— até a pág. {a.page}</span></>}
                      </div>
                      {a.note && <div className="feed-note">"{a.note}"</div>}
                      <div className="feed-meta">
                        <span>{relDate(a.date)}</span>
                        {a.rating && <Stars value={a.rating} />}
                      </div>
                    </div>
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

Object.assign(window, { Home, FeedItem, Catalog, BookDetail, sortBooks, STATUS_FILTERS, saudacao });
