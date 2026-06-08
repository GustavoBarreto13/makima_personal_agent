/* ─────────────────────────────────────────────────────────────────────────
   Frieren · Livros — telas B: Listas, Atividade, Resenhas, Estatísticas
   ───────────────────────────────────────────────────────────────────────── */

/* ════ LISTAS / ESTANTES ═════════════════════════════════════════════════ */
function Lists({ navigate }) {
  return (
    <div className="page">
      <div className="section-head" style={{ marginTop: 32 }}>
        <h2 className="section-title" style={{ fontSize: 28 }}>Estantes</h2>
        <span className="section-sub">coleções que você organizou</span>
      </div>
      <div className="shelf-grid">
        {SHELVES.map(s => {
          const books = BOOKS.filter(b => (b.shelves || []).includes(s.id)).slice(0, 5);
          const total = BOOKS.filter(b => (b.shelves || []).includes(s.id)).length;
          return (
            <div key={s.id} className="shelf-card" onClick={() => navigate('estante', s.id)}>
              <div className="shelf-spines">
                {books.map((b, i) => <Cover key={b.id} book={b} />)}
              </div>
              <div className="shelf-accent-bar" style={{ background: s.accent }} />
              <div className="shelf-name">{s.name}</div>
              <div className="shelf-desc">{s.desc}</div>
              <div className="shelf-count">{total} {total === 1 ? 'livro' : 'livros'}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* uma estante aberta */
function ShelfView({ shelfId, navigate }) {
  const s = SHELVES.find(x => x.id === shelfId);
  const books = BOOKS.filter(b => (b.shelves || []).includes(shelfId));
  if (!s) return <Lists navigate={navigate} />;
  return (
    <div className="page">
      <button className="detail-back" onClick={() => navigate('listas')}><Icon name="arrowLeft" /> Estantes</button>
      <div style={{ marginTop: 18 }}>
        <div className="shelf-accent-bar" style={{ background: s.accent, width: 40, height: 4 }} />
        <h1 className="detail-title" style={{ fontSize: 38, marginTop: 8 }}>{s.name}</h1>
        <p className="shelf-desc" style={{ fontSize: 15, maxWidth: '54ch' }}>{s.desc}</p>
        <div className="shelf-count">{books.length} {books.length === 1 ? 'livro' : 'livros'}</div>
      </div>
      <div className="cover-grid" style={{ marginTop: 28 }}>
        {books.map(b => (
          <a key={b.id} className="cover-link" onClick={() => navigate('detalhe', b.id)}>
            <Cover book={b} badge />
            <div className="cover-meta">
              <div className="cm-title">{b.title}</div>
              <div className="cm-author">{b.author}</div>
              <div className="cm-row">{b.rating ? <Stars value={b.rating} /> : <span className="result-count">{b.status === 'reading' ? Math.round(b.progress*100)+'% lido' : 'na wishlist'}</span>}</div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

/* ════ ATIVIDADE (diário de leitura) ═════════════════════════════════════ */
function Activity({ navigate }) {
  // agrupa por data
  const groups = [];
  ACTIVITY.forEach(a => {
    const last = groups[groups.length - 1];
    if (last && last.date === a.date) last.items.push(a);
    else groups.push({ date: a.date, items: [a] });
  });
  return (
    <div className="page">
      <div className="section-head" style={{ marginTop: 32 }}>
        <h2 className="section-title" style={{ fontSize: 28 }}>Diário de leitura</h2>
        <span className="section-sub">cada página conta</span>
      </div>
      {groups.map(g => (
        <div key={g.date}>
          <div className="day-label">{relDate(g.date)} · {fmtDate(g.date)}</div>
          <div className="feed">
            {g.items.map(a => <FeedItem key={a.id} a={a} navigate={navigate} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ════ RESENHAS ══════════════════════════════════════════════════════════ */
function Reviews({ navigate }) {
  const reviewed = BOOKS.filter(b => b.review).sort((a, b) => (b.finished || '').localeCompare(a.finished || ''));
  return (
    <div className="page">
      <div className="section-head" style={{ marginTop: 32 }}>
        <h2 className="section-title" style={{ fontSize: 28 }}>Resenhas</h2>
        <span className="section-sub">{reviewed.length} livros com notas suas</span>
      </div>
      <div className="review-grid">
        {reviewed.map(b => (
          <div key={b.id} className="review-card" onClick={() => navigate('detalhe', b.id)}>
            <Cover book={b} />
            <div className="review-body">
              <div className="review-title">{b.title}</div>
              <div className="cm-row" style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Stars value={b.rating} />
                <span className="rating-num">{b.rating.toFixed(1)}</span>
              </div>
              <p className="review-text">"{b.review}"</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ════ ESTATÍSTICAS (ano em revista) ═════════════════════════════════════ */
function Stats({ navigate }) {
  const monthNames = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const upto = 6; // jan–jun
  const monthly = STATS.monthly.slice(0, upto);
  const maxMonth = Math.max(...monthly, 1);
  const distKeys = ['5','4.5','4','3.5','3'];
  const maxDist = Math.max(...Object.values(STATS.dist), 1);
  const genreEntries = Object.entries(STATS.byGenre).sort((a, b) => b[1] - a[1]);

  return (
    <div className="page">
      <div className="stats-hero">
        <div className="eyebrow">Seu ano em leitura</div>
        <h2>2026, até aqui</h2>
      </div>

      <div className="big-stat-row">
        <div className="big-stat"><div className="n">{STATS.booksRead}</div><div className="l">livros terminados</div></div>
        <div className="big-stat"><div className="n">{STATS.totalPages.toLocaleString('pt-BR')}</div><div className="l">páginas percorridas</div></div>
        <div className="big-stat"><div className="n">{STATS.avgRating.toFixed(1)}</div><div className="l">nota média</div></div>
      </div>

      {/* páginas por mês */}
      <div className="section">
        <div className="heat-card">
          <div className="heat-head"><span className="heat-title">Páginas por mês</span></div>
          <div className="bars">
            {monthly.map((v, i) => (
              <div key={i} className="bar-col">
                <span className="bar-val">{(v / 1000).toFixed(1)}k</span>
                <div className="bar" style={{ height: `${(v / maxMonth) * 100}%` }} />
                <span className="bar-lbl">{monthNames[i]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="section" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        {/* distribuição de notas */}
        <div className="heat-card">
          <div className="heat-head"><span className="heat-title">Como você avalia</span></div>
          {distKeys.map(k => (
            <div key={k} className="dist-row">
              <span className="dl"><Stars value={Number(k)} /></span>
              <span className="dist-bar"><i style={{ width: `${(STATS.dist[k] / maxDist) * 100}%` }} /></span>
              <span className="dist-n">{STATS.dist[k]}</span>
            </div>
          ))}
        </div>

        {/* destaques */}
        <div className="heat-card">
          <div className="heat-head"><span className="heat-title">Destaques do ano</span></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 4 }}>
            <Highlight label="Gênero favorito" value={STATS.topGenre[0]} sub={`${STATS.topGenre[1]} livros`} />
            <Highlight label="Autor mais lido" value={STATS.topAuthor[0]} sub={`${STATS.topAuthor[1]} livros`} />
            <Highlight label="Maior sequência" value={`${STATS.bestStreak} dias`} sub="lendo sem parar" />
            <Highlight label="Gêneros explorados" value={genreEntries.length} sub={genreEntries.map(g => g[0]).join(' · ')} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Highlight({ label, value, sub }) {  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, paddingBottom: 14, borderBottom: '1px solid var(--line-2)' }}>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--ink-4)' }}>{label}</span>
      <span style={{ fontFamily: 'var(--serif)', fontSize: 22, fontWeight: 500, color: 'var(--teal-deep)', letterSpacing: '-0.01em' }}>{value}</span>
      <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{sub}</span>
    </div>
  );
}

/* ════ QUERO LER (já tenho, TBR pile) ════════════════════════════════════ */
function ToRead({ navigate, openLog }) {
  const owned = BOOKS.filter(b => b.status === 'owned');
  return (
    <div className="page">
      <div className="section-head" style={{ marginTop: 32, marginBottom: 0 }}>
        <h2 className="section-title" style={{ fontSize: 28 }}>Quero ler</h2>
        <span className="section-sub">{owned.length} livros na pilha</span>
      </div>
      <div className="wl-list">
        {owned.map(b => (
          <div key={b.id} className="wl-item">
            <div style={{ flexShrink: 0, cursor: 'pointer' }} onClick={() => navigate('detalhe', b.id)}>
              <Cover book={b} />
            </div>
            <div className="wl-info">
              <div className="wl-title" onClick={() => navigate('detalhe', b.id)}>{b.title}</div>
              <div className="wl-author">{b.author} · {b.year}</div>
              <span className="wl-genre">{b.genre}</span>
            </div>
            <div className="wl-right" style={{ justifyContent: 'center' }}>
              <button className="btn btn-primary" style={{ fontSize: 12.5, padding: '9px 18px' }}
                      onClick={() => openLog(b.id)}>
                <Icon name="open" /> Começar a ler
              </button>
            </div>
          </div>
        ))}
        {owned.length === 0 && (
          <p style={{ color: 'var(--ink-4)', textAlign: 'center', padding: '60px 0', fontStyle: 'italic', fontFamily: 'var(--serif)', fontSize: 18 }}>
            Sem livros na pilha ainda.
          </p>
        )}
      </div>
    </div>
  );
}


function Wishlist({ navigate, openLog, onToast }) {
  const [wishlist, setWishlist] = React.useState(() => BOOKS.filter(b => b.status === 'wishlist'));
  const [links, setLinks] = React.useState(() => {
    const m = {};
    BOOKS.filter(b => b.status === 'wishlist').forEach(b => { if (b.storeLink) m[b.id] = b.storeLink; });
    return m;
  });
  const [editing, setEditing] = React.useState(null);
  const [drafts, setDrafts] = React.useState({});

  const startEdit = (id) => {
    setEditing(id);
    setDrafts(d => ({ ...d, [id]: links[id] || '' }));
  };
  const saveLink = (id) => {
    const url = (drafts[id] || '').trim();
    const book = bookById(id);
    if (book) book.storeLink = url || null;
    setLinks(l => url ? { ...l, [id]: url } : Object.fromEntries(Object.entries(l).filter(([k]) => k !== id)));
    setEditing(null);
    if (onToast) onToast(url ? 'Link da loja salvo' : 'Link removido');
  };
  const getDomain = (url) => {
    try { return new URL(url.startsWith('http') ? url : 'https://' + url).hostname.replace('www.', ''); }
    catch { return url.slice(0, 28); }
  };
  const normUrl = (url) => url.startsWith('http') ? url : 'https://' + url;

  return (
    <div className="page">
      <div className="section-head" style={{ marginTop: 32, marginBottom: 0 }}>
        <h2 className="section-title" style={{ fontSize: 28 }}>Wishlist</h2>
        <span className="section-sub">{wishlist.length} livros pra comprar</span>
      </div>

      <div className="wl-list">
        {wishlist.map(b => {
          const link = links[b.id];
          const isEditing = editing === b.id;
          return (
            <div key={b.id} className="wl-item">
              <div style={{ flexShrink: 0, cursor: 'pointer' }} onClick={() => navigate('detalhe', b.id)}>
                <Cover book={b} />
              </div>

              <div className="wl-info">
                <div className="wl-title" onClick={() => navigate('detalhe', b.id)}>{b.title}</div>
                <div className="wl-author">{b.author} · {b.year}</div>
                <span className="wl-genre">{b.genre}</span>
              </div>

              <div className="wl-right">
                {isEditing ? (
                  <div className="wl-input-row">
                    <input className="wl-input" type="url"
                           placeholder="amazon.com.br/…  ou cole qualquer link"
                           value={drafts[b.id] || ''}
                           autoFocus
                           onChange={e => setDrafts(d => ({ ...d, [b.id]: e.target.value }))}
                           onKeyDown={e => { if (e.key === 'Enter') saveLink(b.id); if (e.key === 'Escape') setEditing(null); }} />
                    <button className="wl-save-btn" onClick={() => saveLink(b.id)}>Salvar</button>
                    <button className="wl-cancel-btn" onClick={() => setEditing(null)}>✕</button>
                  </div>
                ) : link ? (
                  <div className="wl-link-saved">
                    <span className="wl-domain">{getDomain(link)}</span>
                    <a className="wl-open" href={normUrl(link)} target="_blank" rel="noopener noreferrer">Abrir →</a>
                    <button className="wl-edit-btn" title="Editar link" onClick={() => startEdit(b.id)}>✎</button>
                  </div>
                ) : (
                  <button className="wl-add-link" onClick={() => startEdit(b.id)}>
                    <Icon name="plus" style={{ width: 13, height: 13 }} /> Link da loja
                  </button>
                )}
                <button className="btn btn-ghost" style={{ fontSize: 12, padding: '7px 14px', marginTop: 10, width: '100%', justifyContent: 'center' }}
                        onClick={() => openLog(b.id)}>
                  Começar a ler
                </button>
              </div>
            </div>
          );
        })}

        {wishlist.length === 0 && (
          <p style={{ color: 'var(--ink-4)', textAlign: 'center', padding: '60px 0', fontStyle: 'italic', fontFamily: 'var(--serif)', fontSize: 18 }}>
            Sua lista está vazia — adicione livros pelo catálogo.
          </p>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { Lists, ShelfView, Activity, Reviews, Stats, Highlight, ToRead, Wishlist });