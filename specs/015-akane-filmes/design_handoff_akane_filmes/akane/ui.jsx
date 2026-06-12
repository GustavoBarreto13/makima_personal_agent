/* ─────────────────────────────────────────────────────────────────────────
   Akane · Filmes — primitivos de UI
   Ícones, pôster tipográfico de cinema, estrelas (meia via clip), rating
   interativo com meio-passo, coração, heatmap de sessões, sparkline, helpers.
   ───────────────────────────────────────────────────────────────────────── */

const ICONS = {
  inicio:   'M3 10.5 12 3l9 7.5M5 9.5V21h5v-6h4v6h5V9.5',
  filmes:   'M4 4h16v16H4zM4 8h16M4 16h16M8 4v16M16 4v16',                 // tira de filme
  diario:   'M7 3v4M17 3v4M3.5 9h17M5 5h14a1.5 1.5 0 0 1 1.5 1.5V19A1.5 1.5 0 0 1 19 20.5H5A1.5 1.5 0 0 1 3.5 19V6.5A1.5 1.5 0 0 1 5 5z',
  watchlist:'M5 3h14a1 1 0 0 1 1 1v17l-8-5-8 5V4a1 1 0 0 1 1-1z',
  listas:   'M3 6h13M3 12h13M3 18h13M20 6h.01M20 12h.01M20 18h.01',
  tags:     'M3 7.5 11 3l9.5 5v8L11 21l-8-4.5zM11 3v18',
  rewind:   'M11 7 5 12l6 5M11 7v10M19 7l-6 5 6 5z',
  plus:     'M12 5v14M5 12h14',
  search:   'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  x:        'M18 6 6 18M6 6l12 12',
  arrowLeft:'M19 12H5M12 19l-7-7 7-7',
  chevL:    'M15 18l-6-6 6-6',
  chevR:    'M9 18l6-6-6-6',
  check:    'M20 6 9 17l-5-5',
  play:     'M6 4l14 8-14 8z',
  doc:      'M7 3h7l4 4v14H7zM14 3v4h4',
  quote:    'M9 7H6a2 2 0 0 0-2 2v3h5V7zm9 0h-3a2 2 0 0 0-2 2v3h5V7z',
  pen:      'M4 20l4-1 11-11-3-3L5 16l-1 4zM14 5l3 3',
  rewatch:  'M3 12a9 9 0 1 0 3-6.7M3 4v4h4',
  clock:    'M12 7v5l3.5 2M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z',
  film:     'M4 4h16v16H4zM8 4v16M16 4v16M4 9h4M16 9h4M4 14h4M16 14h4',
  user:     'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5 21a7 7 0 0 1 14 0',
  star:     'M12 3l2.95 5.98 6.6.96-4.77 4.65 1.13 6.57L12 17.55l-5.9 3.1 1.13-6.57L2.46 9.44l6.6-.96z',
  link:     'M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1',
};

function Icon({ name, style }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" style={style}
         stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={ICONS[name]} />
    </svg>
  );
}

/* coração cheio */
function Heart({ filled, className }) {
  return (
    <svg viewBox="0 0 24 24" className={className}
         fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d="M12 20.5C5.5 16 3 12.4 3 8.8 3 6 5 4 7.5 4c1.7 0 3.3.9 4.5 2.6C13.2 4.9 14.8 4 16.5 4 19 4 21 6 21 8.8c0 3.6-2.5 7.2-9 11.7z" />
    </svg>
  );
}

/* estrela (preenchível) */
function StarShape({ filled }) {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M12 2.5l2.95 5.98 6.6.96-4.77 4.65 1.13 6.57L12 17.55l-5.9 3.1 1.13-6.57L2.46 9.44l6.6-.96z"
            fill={filled ? 'currentColor' : 'none'}
            stroke="currentColor" strokeWidth={filled ? 0 : 1.5} strokeLinejoin="round" />
    </svg>
  );
}

/* estrelas estáticas (suporta meia via clip) */
function Stars({ value, lg }) {
  const pct = Math.max(0, Math.min(5, value || 0)) / 5 * 100;
  return (
    <span className={'stars' + (lg ? ' lg' : '')} title={(value || 0).toFixed(1) + ' / 5'}>
      <span style={{ position: 'relative', display: 'inline-flex' }}>
        <span style={{ display: 'inline-flex', gap: '1px' }} className="empty">
          {[0,1,2,3,4].map(i => <StarShape key={i} filled />)}
        </span>
        <span style={{ position: 'absolute', inset: 0, overflow: 'hidden', width: pct + '%',
                       display: 'inline-flex', gap: '1px', color: 'var(--gold)' }}>
          {[0,1,2,3,4].map(i => <StarShape key={i} filled />)}
        </span>
      </span>
    </span>
  );
}

/* rating interativo com meio-passo (clique na metade esquerda = .5) */
function RateInput({ value, onChange }) {
  const [hover, setHover] = React.useState(0);
  const shown = hover || value || 0;
  return (
    <div className="rate-input" onMouseLeave={() => setHover(0)}>
      {[1,2,3,4,5].map(n => {
        const full = shown >= n;
        const half = !full && shown >= n - 0.5;
        return (
          <span key={n} className="rate-star">
            <StarShape filled />
            <span className="fill" style={{ position: 'absolute', inset: 0, width: full ? '100%' : half ? '50%' : '0%' }}>
              <StarShape filled />
            </span>
            <span className="rate-half l" onMouseEnter={() => setHover(n - 0.5)} onClick={() => onChange(n - 0.5)} />
            <span className="rate-half r" onMouseEnter={() => setHover(n)} onClick={() => onChange(n)} />
          </span>
        );
      })}
      {value > 0 && <span className="rate-val">{value.toFixed(1)}</span>}
      {value > 0 && <button className="rate-clear" onClick={() => onChange(0)}>limpar</button>}
    </div>
  );
}

/* ── Pôster tipográfico de cinema ──────────────────────────────────────── */
function Poster({ film, badge, showRating, mini }) {
  const p = POSTER[film.poster] || POSTER.noir;
  if (mini) {
    return (
      <div className="poster mini" style={{ background: p.bg, color: p.ink }}>
        <div className="p-inner" />
        <div className="p-mini-title">{film.title}</div>
      </div>
    );
  }
  const len = film.title.length;
  const titleSize = len > 28 ? 16 : len > 18 ? 20 : len > 12 ? 25 : 30;
  return (
    <div className="poster" style={{ background: p.bg, color: p.ink }}>
      <div className="p-inner" />
      {badge && (
        <div className="p-badges">
          {film.status === 'watchlist' && <div className="p-badge want"><Icon name="watchlist" /> quero ver</div>}
          {film.liked && <div className="p-heart"><Heart filled /></div>}
        </div>
      )}
      <div className="p-kicker">{film.genre.split(' · ')[0]}</div>
      <div className="p-title" style={{ fontSize: titleSize }}>{film.title}</div>
      <div className="p-foot">
        <div className="p-rule" />
        <div className="p-dir">{film.director}</div>
        <div className="p-year">{film.year}</div>
      </div>
      {showRating && film.rating && (
        <div className="p-rating"><Stars value={film.rating} /></div>
      )}
    </div>
  );
}

/* ── Heatmap de sessões ────────────────────────────────────────────────── */
function heatLevel(c) { if (c <= 0) return 0; if (c === 1) return 1; if (c === 2) return 2; if (c === 3) return 3; return 4; }
function Heatmap({ data }) {
  const monthNames = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const months = [];
  data.forEach(d => {
    const m = new Date(d.date + 'T00:00:00').getMonth();
    let g = months.find(x => x.m === m);
    if (!g) { g = { m, days: [] }; months.push(g); }
    g.days.push(d);
  });
  return (
    <div>
      <div className="heat-months-wrap">
        {months.map(g => {
          const first = new Date(g.days[0].date + 'T00:00:00');
          const lead = first.getDay();
          const cells = [];
          for (let i = 0; i < lead; i++) cells.push(null);
          g.days.forEach(d => cells.push(d));
          while (cells.length % 7 !== 0) cells.push(null);
          const sum = g.days.reduce((a, d) => a + d.count, 0);
          return (
            <div className="heat-month" key={g.m}>
              <div className="hm-head"><span className="hm-name">{monthNames[g.m]}</span><span className="hm-sum">{sum}</span></div>
              <div className="hm-cells">
                {cells.map((d, i) => (
                  <div key={i} className="hm-cell"
                       title={d ? `${d.date} · ${d.count} ${d.count === 1 ? 'filme' : 'filmes'}` : ''}
                       style={{ background: d ? `var(--heat-${heatLevel(d.count)})` : 'transparent' }} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="heat-legend">
        <span>menos</span>
        <span className="heat-sw">{[0,1,2,3,4].map(i => <i key={i} style={{ background: `var(--heat-${i})` }} />)}</span>
        <span>mais</span>
      </div>
    </div>
  );
}

/* ── Sparkline ─────────────────────────────────────────────────────────── */
function Spark({ data }) {
  const max = Math.max(...data, 1);
  return (
    <div className="stat-spark">
      {data.map((v, i) => (
        <i key={i} className={v >= max * 0.7 && v > 0 ? 'hot' : ''}
           style={{ height: Math.max(2, (v / max) * 24) + 'px' }} />
      ))}
    </div>
  );
}

/* ── helpers de data (pt-BR) ───────────────────────────────────────────── */
const MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const MESES_CURTO = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const DIAS_CURTO = ['dom','seg','ter','qua','qui','sex','sáb'];
function fmtDate(iso) { const d = new Date(iso + 'T00:00:00'); return `${d.getDate()} de ${MESES[d.getMonth()]}`; }
function relDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  const today = new Date(TODAY + 'T00:00:00');
  const diff = Math.round((today - d) / 86400000);
  if (diff === 0) return 'hoje';
  if (diff === 1) return 'ontem';
  if (diff < 7) return `${diff} dias atrás`;
  return fmtDate(iso);
}

Object.assign(window, { Icon, Heart, StarShape, Stars, RateInput, Poster, Heatmap, Spark, heatLevel, fmtDate, relDate, MESES, MESES_CURTO, DIAS_CURTO });
