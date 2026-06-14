/* ─────────────────────────────────────────────────────────────────────────
   Marin · Animes — primitivos de UI
   Ícones, pôster kawaii (gradiente + título), estrelas MAL (0–10, meia via
   clip), rating interativo meio-passo, chip de status, barra de episódios,
   heatmap, sparkline, helpers de data pt-BR.
   ───────────────────────────────────────────────────────────────────────── */

const ICONS = {
  inicio:    'M3 10.5 12 3l9 7.5M5 9.5V21h5v-6h4v6h5V9.5',
  catalogo:  'M4 5h7v14H4zM13 5h7v14h-7M4 9h7M13 9h7M4 13h7M13 13h7',
  diario:    'M7 3v4M17 3v4M3.5 9h17M5 5h14a1.5 1.5 0 0 1 1.5 1.5V19A1.5 1.5 0 0 1 19 20.5H5A1.5 1.5 0 0 1 3.5 19V6.5A1.5 1.5 0 0 1 5 5z',
  watchlist: 'M5 3h14a1 1 0 0 1 1 1v17l-8-5-8 5V4a1 1 0 0 1 1-1z',
  calendar:  'M7 3v4M17 3v4M3.5 9h17M5 5h14a1.5 1.5 0 0 1 1.5 1.5V19A1.5 1.5 0 0 1 19 20.5H5A1.5 1.5 0 0 1 3.5 19V6.5A1.5 1.5 0 0 1 5 5z',
  stats:     'M4 20V10M10 20V4M16 20v-7M22 20H2',
  plus:      'M12 5v14M5 12h14',
  search:    'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  x:         'M18 6 6 18M6 6l12 12',
  arrowLeft: 'M19 12H5M12 19l-7-7 7-7',
  chevL:     'M15 18l-6-6 6-6',
  chevR:     'M9 18l6-6-6-6',
  check:     'M20 6 9 17l-5-5',
  play:      'M6 4l14 8-14 8z',
  sync:      'M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5',
  cam:       'M4 7h3l1.5-2h7L17 7h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  clock:     'M12 7v5l3.5 2M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z',
  star:      'M12 3l2.6 5.3 5.9.86-4.25 4.15 1 5.85L12 16.9l-5.25 2.76 1-5.85L3.5 9.66l5.9-.86z',
  edit:      'M4 20l4-1 11-11-3-3L5 16l-1 4zM14 5l3 3',
  heart:     'M12 20.5C5.5 16 3 12.4 3 8.8 3 6 5 4 7.5 4c1.7 0 3.3.9 4.5 2.6C13.2 4.9 14.8 4 16.5 4 19 4 21 6 21 8.8c0 3.6-2.5 7.2-9 11.7z',
  tv:        'M4 7h16v11H4zM8 21h8M9 7 6 3M15 7l3-4',
};

function Icon({ name, style, className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" style={style} className={className}
         stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={ICONS[name]} />
    </svg>
  );
}

function Heart({ filled, className }) {
  return (
    <svg viewBox="0 0 24 24" className={className}
         fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d="M12 20.5C5.5 16 3 12.4 3 8.8 3 6 5 4 7.5 4c1.7 0 3.3.9 4.5 2.6C13.2 4.9 14.8 4 16.5 4 19 4 21 6 21 8.8c0 3.6-2.5 7.2-9 11.7z" />
    </svg>
  );
}

function StarShape({ filled }) {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M12 2.6l2.7 5.48 6.05.88-4.38 4.27 1.03 6.02L12 16.4l-5.4 2.84 1.03-6.02L3.25 8.96l6.05-.88z"
            fill={filled ? 'currentColor' : 'none'}
            stroke="currentColor" strokeWidth={filled ? 0 : 1.4} strokeLinejoin="round" />
    </svg>
  );
}

/* estrelas MAL estáticas — 10 estrelas, meia via clip (value 0–10) */
function Stars({ value, lg, sm }) {
  const pct = Math.max(0, Math.min(10, value || 0)) / 10 * 100;
  const cls = 'stars' + (lg ? ' lg' : '') + (sm ? ' sm' : '');
  return (
    <span className={cls} title={(value || 0).toFixed(1) + ' / 10'}>
      <span style={{ position: 'relative', display: 'inline-flex' }}>
        <span style={{ display: 'inline-flex', gap: '1px' }} className="empty">
          {Array.from({ length: 10 }, (_, i) => <StarShape key={i} filled />)}
        </span>
        <span style={{ position: 'absolute', inset: 0, overflow: 'hidden', width: pct + '%',
                       display: 'inline-flex', gap: '1px', color: 'var(--star)' }}>
          {Array.from({ length: 10 }, (_, i) => <StarShape key={i} filled />)}
        </span>
      </span>
    </span>
  );
}

/* score compacto — uma estrela + número (cards, listas) */
function Score({ value, className }) {
  if (value == null) return <span className={'score-num ' + (className || '')} style={{ color: 'var(--ink-4)' }}>— / 10</span>;
  return (
    <span className={'score-num ' + (className || '')} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      <span className="stars sm" style={{ display: 'inline-flex' }}><StarShape filled /></span>
      {value.toFixed(1)}
    </span>
  );
}

/* rating interativo MAL — 10 estrelas, meio-passo (clique na metade = .5) */
function RateInput({ value, onChange }) {
  const [hover, setHover] = React.useState(0);
  const shown = hover || value || 0;
  return (
    <div className="rate-input" onMouseLeave={() => setHover(0)}>
      {Array.from({ length: 10 }, (_, idx) => {
        const n = idx + 1;
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

/* ── Chip de status ────────────────────────────────────────────────────── */
function StatusChip({ status, md, onPoster }) {
  const v = STATUS_VAR[status] || '--st-assistindo';
  const cls = 'status-chip' + (md ? ' md' : '') + (onPoster ? ' on-poster' : '');
  const style = onPoster
    ? { color: 'oklch(0.99 0.01 90)', background: `color-mix(in oklch, var(${v}) 78%, oklch(0.1 0.02 300))` }
    : { color: `var(${v})`, background: `color-mix(in oklch, var(${v}) 16%, transparent)` };
  return <span className={cls} style={style}><span className="sc-dot" />{STATUS_LABEL[status]}</span>;
}

/* ── Barra de progresso de episódios ───────────────────────────────────── */
function EpisodeProgress({ watched, total, next, compact }) {
  const done = total != null && watched >= total;
  const pct = total ? Math.min(100, watched / total * 100) : Math.min(100, (watched % 12) / 12 * 100);
  return (
    <div className="ep-progress">
      {!done && <div className="ep-bar"><i style={{ width: pct + '%' }} /></div>}
      {done && <div className="ep-bar done"><i style={{ width: '100%' }} /></div>}
      <div className="ep-line">
        <span className={'ep-count' + (done ? ' done' : '')}>
          {done ? 'Completo ✓' : `${watched} / ${total == null ? '?' : total} eps`}
        </span>
        {!compact && next && next.aired && (
          <span className="ep-next"><span className="pulse" />Ep {next.number}{next.title ? ` · ${next.title}` : ''}</span>
        )}
      </div>
    </div>
  );
}

/* ── Pôster kawaii (gradiente + título) ────────────────────────────────── */
function PosterCard({ anime, badge, showStatus, showScore, showProgress }) {
  const p = POSTER[anime.poster] || POSTER.magenta;
  const len = anime.title.length;
  const titleSize = len > 30 ? 15 : len > 22 ? 17 : len > 14 ? 21 : 26;
  return (
    <div className="poster" style={{ background: `linear-gradient(155deg, ${p.a}, ${p.b})`, color: p.ink }}>
      {badge && anime.fav && <div className="p-badges"><div className="p-heart"><Heart filled /></div></div>}
      <div className="p-kicker">{anime.genres[0]}{anime.media_type !== 'TV' ? ` · ${anime.media_type}` : ''}</div>
      <div className="p-title" style={{ fontSize: titleSize }}>{anime.title}</div>
      <div className="p-foot">
        <div className="p-rule" />
        <div className="p-studio">{anime.studio}</div>
        <div className="p-year">{anime.season}</div>
      </div>
      {showStatus && <div className="p-status"><StatusChip status={anime.status} onPoster /></div>}
      {showScore && anime.score != null && (
        <div className="p-score"><span className="st"><span className="stars sm" style={{ display: 'inline-flex' }}><StarShape filled /></span></span>{anime.score.toFixed(1)}</div>
      )}
      {showProgress && anime.episodes_total != null && anime.episodes_watched > 0 && anime.episodes_watched < anime.episodes_total && (
        <div className="p-prog"><i style={{ width: (anime.episodes_watched / anime.episodes_total * 100) + '%' }} /></div>
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
                       title={d ? `${d.date} · ${d.count} ${d.count === 1 ? 'sessão' : 'sessões'}` : ''}
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

/* ── Widget de stats do MAL (barra empilhada + colunas) ─────────────── */
function MalStats({ profile }) {
  const p = profile || MAL_PROFILE;
  const sum = p.rows.reduce((a, r) => a + r.n, 0) || 1;
  const fmt = n => n.toLocaleString('pt-BR');
  return (
    <div className="mal-stats">
      <div className="mal-bar">
        {p.rows.map(r => (
          <span key={r.status} title={`${r.label} · ${r.n}`}
                style={{ width: (r.n / sum * 100) + '%', background: `var(${STATUS_VAR[r.status]})` }} />
        ))}
      </div>
      <div className="mal-cols">
        <div className="mal-col">
          {p.rows.map(r => (
            <div key={r.status} className="mal-row">
              <span className="ml-dot" style={{ background: `var(${STATUS_VAR[r.status]})` }} />
              <span className="ml-label">{r.label}</span>
              <span className="ml-n">{fmt(r.n)}</span>
            </div>
          ))}
        </div>
        <div className="mal-col totals">
          <div className="mal-row"><span className="ml-label">Total de títulos</span><span className="ml-n">{fmt(p.total)}</span></div>
          <div className="mal-row"><span className="ml-label">Rewatches</span><span className="ml-n">{fmt(p.rewatched)}</span></div>
          <div className="mal-row"><span className="ml-label">Episódios</span><span className="ml-n">{fmt(p.episodes)}</span></div>
        </div>
      </div>
    </div>
  );
}

/* ── helpers de data (pt-BR) ───────────────────────────────────────────── */
const MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const MESES_CURTO = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const DIAS_CURTO = ['dom','seg','ter','qua','qui','sex','sáb'];
const DIAS_LONGO = ['domingo','segunda','terça','quarta','quinta','sexta','sábado'];
function fmtDate(iso) { const d = new Date(iso + 'T00:00:00'); return `${d.getDate()} de ${MESES[d.getMonth()]}`; }
function fmtShort(iso) { const d = new Date(iso + 'T00:00:00'); return `${d.getDate()} ${MESES_CURTO[d.getMonth()]}`; }
function relDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  const today = new Date(TODAY + 'T00:00:00');
  const diff = Math.round((today - d) / 86400000);
  if (diff === 0) return 'hoje';
  if (diff === 1) return 'ontem';
  if (diff < 7) return `${diff} dias atrás`;
  return fmtDate(iso);
}
function relFuture(iso) {
  const d = new Date(iso + 'T00:00:00');
  const today = new Date(TODAY + 'T00:00:00');
  const diff = Math.round((d - today) / 86400000);
  if (diff <= 0) return 'Hoje';
  if (diff === 1) return 'Amanhã';
  return `${DIAS_LONGO[d.getDay()].charAt(0).toUpperCase() + DIAS_LONGO[d.getDay()].slice(1)}, ${d.getDate()} ${MESES_CURTO[d.getMonth()]}`;
}

Object.assign(window, {
  Icon, Heart, StarShape, Stars, Score, RateInput, StatusChip, EpisodeProgress, PosterCard,
  Heatmap, Spark, MalStats, heatLevel, fmtDate, fmtShort, relDate, relFuture, MESES, MESES_CURTO, DIAS_CURTO, DIAS_LONGO,
});
