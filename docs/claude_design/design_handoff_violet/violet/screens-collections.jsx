/* ─────────────────────────────────────────────────────────────────────────
   Violet · Diário — telas de coleção
   Sonhos · Destaques · Ideias · Sabedoria · Notas · Tags · Pessoas
   ───────────────────────────────────────────────────────────────────────── */

const COLLECTION_META = {
  dreams:     { title: 'Sonhos',    glyph: 'moon',  color: 'var(--gold)',     tint: 'var(--gold-tint)',     blurb: 'O que a noite escreveu enquanto você dormia. Anote antes que escorra entre os dedos.' },
  highlights: { title: 'Destaques', glyph: 'heart', color: 'var(--garnet)',   tint: 'var(--garnet-tint)',   blurb: 'Os momentos que você marcou para não deixar passar batido. As pequenas alegrias contam.' },
  ideas:      { title: 'Ideias',    glyph: 'bulb',  color: 'var(--amber)',    tint: 'var(--gold-tint)',     blurb: 'Faíscas soltas ao longo dos dias. Algumas viram projetos; todas merecem um lugar.' },
  wisdom:     { title: 'Sabedoria', glyph: 'gem',   color: 'var(--violet-c)', tint: 'var(--violet-tint)',   blurb: 'As frases que você escreveu para o seu eu de amanhã. Verdades pequenas, ditas a si mesmo.' },
  notes:      { title: 'Notas',     glyph: 'pin',   color: 'var(--ink-3)',    tint: 'var(--mist)',          blurb: 'Lembretes e fios soltos fixados no diário, para não esquecer o que precisa ser feito.' },
};

const COLLECTION_DATA = {
  dreams:     () => DREAMS.map(d => ({ text: d.text, date: d.date, entryNum: d.entryNum })),
  highlights: () => HIGHLIGHTS,
  ideas:      () => IDEAS,
  wisdom:     () => WISDOM,
  notes:      () => NOTES,
};

function Collection({ id, navigate }) {
  const meta = COLLECTION_META[id];
  const items = COLLECTION_DATA[id]();
  const serif = id === 'wisdom' || id === 'dreams';

  return (
    <div className="page page-narrow">
      <div className="section" style={{ marginTop: 30 }}>
        <div className="col-intro">
          <div className="col-icon" style={{ background: meta.tint }}>
            <Icon name={meta.glyph} style={{ color: meta.color }} />
          </div>
          <div>
            <h1 className="page-h1" style={{ fontSize: 40 }}>{meta.title}</h1>
            <p className="col-blurb">{meta.blurb}</p>
          </div>
        </div>

        <div className="col-grid">
          {items.map((b, i) => (
            <div className={'col-card' + (serif ? ' serif' : '')} key={i}>
              <div className="cc-accent" style={{ background: meta.color }} />
              <div className="cc-text">
                <RichText text={b.text} onTag={t => navigate('tags', t)} onPerson={p => navigate('people', p)} />
              </div>
              <div className="cc-foot">
                <span className="cc-date"><Icon name="calendar" style={{ width: 12, height: 12 }} /> {fmtDate(b.date)}</span>
                <span className="cc-src" onClick={() => navigate('write', '#' + b.entryNum)}>#{b.entryNum}</span>
              </div>
            </div>
          ))}
          {items.length === 0 && (
            <p style={{ color: 'var(--ink-3)', fontStyle: 'italic', fontFamily: 'var(--serif)' }}>Ainda nada por aqui — comece a marcar no Write.</p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══ TAGS ═══════════════════════════════════════════════════════════════ */
function Tags({ navigate }) {
  const max = Math.max(...TAGS.map(t => t.count), 1);
  return (
    <div className="page page-narrow">
      <div className="section" style={{ marginTop: 30 }}>
        <div className="col-intro">
          <div className="col-icon" style={{ background: 'var(--sapphire-tint)' }}>
            <Icon name="hash" style={{ color: 'var(--sapphire)' }} />
          </div>
          <div>
            <h1 className="page-h1" style={{ fontSize: 40 }}>Tags</h1>
            <p className="col-blurb">Os temas que atravessam os seus dias. Quanto maior, mais vezes você voltou a eles.</p>
          </div>
        </div>
        <div className="tag-cloud">
          {TAGS.map((t, i) => {
            const scale = 0.92 + (t.count / max) * 0.55;
            return (
              <button className="tagbig" key={i} style={{ fontSize: `${scale}em` }}>
                <span className="t-name">{t.token}</span>
                <span className="t-cnt">{t.count}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ═══ PEOPLE ═════════════════════════════════════════════════════════════ */
function People({ navigate }) {
  return (
    <div className="page page-narrow">
      <div className="section" style={{ marginTop: 30 }}>
        <div className="col-intro">
          <div className="col-icon" style={{ background: 'var(--emerald-tint)' }}>
            <Icon name="at" style={{ color: 'var(--emerald)' }} />
          </div>
          <div>
            <h1 className="page-h1" style={{ fontSize: 40 }}>Pessoas</h1>
            <p className="col-blurb">Quem caminhou pelos seus dias. Um diário também é o registro de quem esteve por perto.</p>
          </div>
        </div>
        <div className="ppl-grid">
          {PEOPLE.map((p, i) => {
            const name = p.token.replace('@', '');
            return (
              <div className="ppl-card" key={i}>
                <div className="ppl-av">{name[0]}</div>
                <div className="ppl-info">
                  <div className="ppl-name">{name}</div>
                  <div className="ppl-meta">{p.count} {p.count === 1 ? 'menção' : 'menções'} · {relDate(p.last).toLowerCase()}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Collection, Tags, People, COLLECTION_META });
