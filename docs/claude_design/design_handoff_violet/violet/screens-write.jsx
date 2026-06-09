/* ─────────────────────────────────────────────────────────────────────────
   Violet · Diário — telas: Write (home), Journal (arquivo), Reflect
   ───────────────────────────────────────────────────────────────────────── */

/* ═══ WRITE — entrada diária ═════════════════════════════════════════════ */
function Write({ entry, isToday, onNav, navigate }) {
  const d = new Date(entry.date + 'T00:00:00');
  const dreamPrompt = DREAM_PROMPTS[0];

  const typeChips = [
    { kind: 'bullet',    label: 'Bullet' },
    { kind: 'highlight', label: 'Destaque' },
    { kind: 'idea',      label: 'Ideia' },
    { kind: 'wisdom',    label: 'Sabedoria' },
    { kind: 'note',      label: 'Nota' },
    { kind: 'dream',     label: 'Sonho' },
  ];

  return (
    <div className="write-wrap">

      {/* cabeçalho de data */}
      <div className="w-datehead">
        <div className="w-month">{MESES_ABR[d.getMonth()]} {d.getDate()}</div>
        <h1 className="w-day">{DIAS[d.getDay()]}</h1>
        <div className="w-meta">
          <span className="w-num">#{entry.num}</span>
          <span className="w-sep">/</span>
          {isToday
            ? <span className="w-today">Hoje</span>
            : <span className="when">{relDate(entry.date)}</span>}
        </div>
      </div>

      {/* prompt do sonho */}
      <div className="w-prompt">
        <span className="p-icon"><Icon name="moon" /></span>
        {entry.dream
          ? <span className="p-text" style={{ fontStyle: 'italic', color: 'var(--ink-2)' }}>{entry.dream}</span>
          : <span className="p-text">{dreamPrompt}</span>}
      </div>

      {/* bullets */}
      <div className="bullets">
        {entry.bullets.map((b, i) => {
          const g = KIND_GLYPH[b.kind] || KIND_GLYPH.bullet;
          return (
            <div className="bgroup" data-kind={b.kind} key={i}>
              <div className="b-mark">
                {g.name === 'dot'
                  ? <span className="dot" />
                  : <span className="glyph"><Icon name={g.name} style={{ color: g.color }} /></span>}
              </div>
              <div className="b-lines">
                <div className={'bline' + (b.kind === 'wisdom' ? ' lead' : '')}>
                  <span className="b-text" style={b.kind === 'wisdom' ? { fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: '16.5px' } : null}>
                    <RichText text={b.text} onTag={t => navigate('tags', t)} onPerson={p => navigate('people', p)} />
                  </span>
                  <span className="b-time">{b.time}</span>
                </div>
              </div>
            </div>
          );
        })}

        {/* novo bullet */}
        <div className="bnew">
          <div className="b-mark"><span className="dot" /></div>
          <span className="ph">Novo bullet…</span>
        </div>
      </div>

      {/* tipos */}
      <div className="w-types">
        {typeChips.map(tc => {
          const g = KIND_GLYPH[tc.kind] || { name: 'moon', color: 'var(--gold)' };
          const gl = tc.kind === 'dream' ? { name: 'moon', color: 'var(--gold)' } : g;
          return (
            <button className="type-chip" key={tc.kind} title={`Adicionar ${tc.label.toLowerCase()}`}>
              <span className="tc-icon">{gl.name === 'dot'
                ? <Icon name="dot" style={{ color: gl.color, width: 12, height: 12 }} />
                : <Icon name={gl.name} style={{ color: gl.color }} />}</span>
              {tc.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* navegação inferior do Write (renderizada pelo App, fixa) */
function WriteFoot({ idx, total, onNav }) {
  return (
    <footer className="w-foot">
      <button className="foot-btn" title="Primeira entrada" onClick={() => onNav('first')} disabled={idx >= total - 1}><Icon name="first" /></button>
      <button className="foot-btn" title="Dia anterior" onClick={() => onNav('prev')} disabled={idx >= total - 1}><Icon name="chevL" /></button>
      <button className="foot-btn" title="Lista de entradas" onClick={() => onNav('list')} style={{ padding: '0 12px' }}>
        <Icon name="journal" /> Lista
      </button>
      <button className={'foot-btn today' + (idx === 0 ? '' : '')} title="Hoje" onClick={() => onNav('today')}><Icon name="dot" style={{ width: 12, height: 12 }} /></button>
      <button className="foot-btn" title="Próximo dia" onClick={() => onNav('next')} disabled={idx <= 0}><Icon name="chevR" /></button>
      <button className="foot-btn" title="Entrada mais recente" onClick={() => onNav('latest')} disabled={idx <= 0}><Icon name="last" /></button>
    </footer>
  );
}

/* ═══ JOURNAL — arquivo / timeline ═══════════════════════════════════════ */
function Journal({ navigate, openEntry }) {
  // agrupa por mês
  const groups = [];
  ENTRIES.forEach(e => {
    const d = new Date(e.date + 'T00:00:00');
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    let g = groups.find(x => x.key === key);
    if (!g) { g = { key, m: d.getMonth(), y: d.getFullYear(), items: [] }; groups.push(g); }
    g.items.push(e);
  });

  return (
    <div className="j-stream">
      {groups.map(g => (
        <div key={g.key}>
          <div className="j-monthhead">{MESES[g.m]} {g.y}</div>
          {g.items.map((e, i) => {
            const d = new Date(e.date + 'T00:00:00');
            const hl = e.bullets.filter(b => b.kind === 'highlight').length;
            return (
              <div className="j-card" key={i} onClick={() => openEntry(e.num)}>
                <div className="j-card-date">
                  <div className="d-num">{d.getDate()}</div>
                  <div className="d-dow">{DIAS_ABR[d.getDay()]}</div>
                </div>
                <div className="j-card-body">
                  <div className="j-card-meta">
                    <span className="j-card-num">#{e.num}</span>
                    <span style={{ color: 'var(--ink-4)' }}>·</span>
                    <span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>{relDate(e.date)}</span>
                  </div>
                  <div className="j-card-excerpt"><RichText text={excerpt(e)} /></div>
                  <div className="j-card-foot">
                    <span className="ct"><Icon name="write" /> {e.bullets.length} bullets</span>
                    {hl > 0 && <span className="pill-count" style={{ color: 'var(--garnet)' }}><Icon name="heart" /> {hl}</span>}
                    {e.dream && <span className="pill-count" style={{ color: 'var(--gold-deep)' }}><Icon name="moon" /> sonho</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/* ═══ REFLECT ════════════════════════════════════════════════════════════ */

/* semente determinística a partir da data — muda todo dia, mas é estável */
function _seedPick(arr, seed) {
  if (!arr || arr.length === 0) return null;
  return arr[Math.abs(seed) % arr.length];
}

function _buildReleiase() {
  // semente = dia do ano (1–366) de TODAY
  const d = new Date(TODAY + 'T00:00:00');
  const start = new Date(d.getFullYear() + '-01-01T00:00:00');
  const seed = Math.floor((d - start) / 86400000) + 1; // 1–366

  // um por categoria, de meses diferentes se possível
  // ordena cada pool do mais antigo ao mais recente antes de indexar
  const wisdom    = [...WISDOM].sort((a, b) => a.date.localeCompare(b.date));
  const highlights = [...HIGHLIGHTS].sort((a, b) => a.date.localeCompare(b.date));
  const dreams    = [...DREAMS].sort((a, b) => a.date.localeCompare(b.date));
  const ideas     = [...IDEAS].sort((a, b) => a.date.localeCompare(b.date));

  const picks = [
    wisdom[0]                                      && { ...wisdom[0],     kind: 'wisdom' },
    _seedPick(highlights, seed + 1)                && { ..._seedPick(highlights, seed + 1), kind: 'highlight' },
    _seedPick(dreams, seed + 2)                    && { ..._seedPick(dreams, seed + 2),     kind: 'dream'     },
    _seedPick(ideas, Math.floor(seed / 2))         && { ..._seedPick(ideas, Math.floor(seed / 2)), kind: 'idea' },
    wisdom[wisdom.length - 1]                      && { ...wisdom[wisdom.length - 1], kind: 'wisdom' },
  ].filter(Boolean);

  // remove duplicatas por texto
  const seen = new Set();
  return picks.filter(p => { if (seen.has(p.text)) return false; seen.add(p.text); return true; });
}

const KIND_LABEL = { wisdom: 'Sabedoria', highlight: 'Destaque', dream: 'Sonho', idea: 'Ideia', note: 'Nota' };
const KIND_ICON  = { wisdom: 'gem', highlight: 'heart', dream: 'moon', idea: 'bulb', note: 'pin' };
const KIND_COLOR = { wisdom: 'var(--violet-c)', highlight: 'var(--garnet)', dream: 'var(--gold)', idea: 'var(--amber)', note: 'var(--ink-4)' };

function Reflect({ navigate }) {
  const [pi, setPi] = React.useState(0);
  const prompt = REFLECT_PROMPTS[pi % REFLECT_PROMPTS.length];
  const past = React.useMemo(_buildReleiase, []);

  return (
    <div className="reflect-wrap">
      <div style={{ marginTop: 30 }}>
        <div className="page-eyebrow">Reflexão do dia</div>
      </div>

      <div className="reflect-prompt-card">
        <div className="rp-eyebrow">Uma pergunta de Violet</div>
        <div className="rp-q">{prompt.q}</div>
        <div className="rp-by">— escreva como se fosse uma carta a alguém que te entende.</div>
        <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
          <button className="foot-btn today" style={{ height: 34, padding: '0 16px' }} onClick={() => navigate('write')}>
            <Icon name="write" /> Responder hoje
          </button>
          <button className="foot-btn" style={{ height: 34, padding: '0 14px' }} onClick={() => setPi(pi + 1)}>
            Outra pergunta
          </button>
        </div>
      </div>

      <div className="onthisday">
        <div className="section-head">
          <h2 className="section-title">Releia-se</h2>
          <span className="section-sub">um de cada tipo, escolhidos para hoje</span>
        </div>
        {past.map((b, i) => {
          const ico  = KIND_ICON[b.kind]  || 'dot';
          const clr  = KIND_COLOR[b.kind] || 'var(--ink-4)';
          const lbl  = KIND_LABEL[b.kind] || b.kind;
          const isSerif = b.kind === 'wisdom' || b.kind === 'dream';
          const dateD = new Date((b.date || b.entryDate || TODAY) + 'T00:00:00');
          return (
            <div className="otd-item" key={i}>
              <div className="otd-year">
                <span style={{ display: 'flex', width: 32, height: 32, borderRadius: '50%', background: `${clr.replace(')', ' / 0.12)').replace('var(--', 'var(--')}`, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={ico} style={{ width: 16, height: 16, color: clr }} />
                </span>
              </div>
              <div className="otd-body">
                <div className="otd-text" style={isSerif ? { fontFamily: 'var(--serif)', fontStyle: 'italic' } : null}>
                  <RichText text={b.text} onTag={t => navigate('tags', t)} onPerson={p => navigate('people', p)} />
                </div>
                <div className="otd-meta" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: clr, fontWeight: 600 }}>{lbl}</span>
                  <span>·</span>
                  <span>{fmtDate(b.date || TODAY)}</span>
                  {b.entryNum && <><span>·</span><span style={{ cursor: 'pointer', color: 'var(--accent-deep)' }} onClick={() => navigate('write', '#' + b.entryNum)}>entrada #{b.entryNum}</span></>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

Object.assign(window, { Write, WriteFoot, Journal, Reflect });
