/* ─────────────────────────────────────────────────────────────────────────
   Frieren · Livros — primitivos de UI
   Ícones (linha, simples), capa tipográfica, estrelas, progresso, heatmap.
   ───────────────────────────────────────────────────────────────────────── */

/* ── Ícones (Lucide-style, stroke) ──────────────────────────────────────── */
const ICONS = {
  inicio:   'M3 10.5 12 3l9 7.5M5 9.5V21h5v-6h4v6h5V9.5',
  catalogo: 'M3 4h7v16H3zM14 4h7v16h-7z',          // será sobrescrito abaixo (grid)
  lendo:    'M3 5.5C5 4 8 4 10 5.5v13C8 17 5 17 3 18.5zM21 5.5C19 4 16 4 14 5.5v13c2-1.5 5-1.5 7 0z',
  wishlist: 'M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z',
  listas:   'M3 6h13M3 12h13M3 18h13M20 6h.01M20 12h.01M20 18h.01',
  atividade:'M3 12h4l2 6 4-14 2 8h6',
  resenhas: 'M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.6 6.8 19.2l1-5.8L3.5 9.2l5.9-.9z',
  stats:    'M4 20V10M10 20V4M16 20v-7M22 20H2',
  plus:     'M12 5v14M5 12h14',
  search:   'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  x:        'M18 6 6 18M6 6l12 12',
  arrowLeft:'M19 12H5M12 19l-7-7 7-7',
  chevL:    'M15 18l-6-6 6-6',
  chevR:    'M9 18l6-6-6-6',
  check:    'M20 6 9 17l-5-5',
  sliders:  'M4 6h10M18 6h2M4 12h2M10 12h10M4 18h12M20 18h0M14 4v4M6 10v4M16 16v4',
  calendar: 'M7 3v4M17 3v4M3.5 9h17M5 5h14a1.5 1.5 0 0 1 1.5 1.5V19A1.5 1.5 0 0 1 19 20.5H5A1.5 1.5 0 0 1 3.5 19V6.5A1.5 1.5 0 0 1 5 5z',
  flame:    'M12 3c1 3-1 4-2 6s0 4 2 4 3-2 2-5c2 1 3 3 3 5a5 5 0 0 1-10 0c0-3 2-4 3-6s1-3-1-4z',
  sparkle:  'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z',
  open:     'M12 6.5C9.5 4.8 6.5 4.5 4 5.5v13c2.5-1 5.5-.7 8 1 2.5-1.7 5.5-2 8-1v-13c-2.5-1-5.5-.7-8 1zM12 6.5V20.5',
};
ICONS.catalogo = 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z';

function Icon({ name, style }) {
  const d = ICONS[name];
  const filled = name === 'resenhas' || name === 'sparkle';
  return (
    <svg viewBox="0 0 24 24" fill="none" style={style}
         stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

/* estrela cheia (para ratings) */
function StarShape({ filled }) {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M12 2.5l2.95 5.98 6.6.96-4.77 4.65 1.13 6.57L12 17.55l-5.9 3.1 1.13-6.57L2.46 9.44l6.6-.96z"
            fill={filled ? 'currentColor' : 'none'}
            stroke="currentColor" strokeWidth={filled ? 0 : 1.6} strokeLinejoin="round" />
    </svg>
  );
}

/* ── Estrelas (suporta meia estrela via clip) ───────────────────────────── */
function Stars({ value, lg }) {
  const pct = Math.max(0, Math.min(5, value)) / 5 * 100;
  return (
    <span className={'stars' + (lg ? ' lg' : '')} title={value + ' / 5'}>
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

/* ── Capa tipográfica ───────────────────────────────────────────────────── */
function Cover({ book, badge, progress, onClick }) {
  const c = COVER[book.cover];
  const titleSize = book.title.length > 22 ? 16 : book.title.length > 13 ? 19 : 23;
  const showReading = book.status === 'reading';
  return (
    <div className="cover" style={{ background: c.bg, color: c.ink }} onClick={onClick}>
      <div className="c-inner" />
      {badge && showReading && <div className="c-badge reading">lendo</div>}
      {badge && book.status === 'wishlist' && <div className="c-badge">quero ler</div>}
      <div className="c-title" style={{ fontSize: titleSize, color: c.ink }}>{book.title}</div>
      <div className="c-rule" />
      <div className="c-author" style={{ color: c.ink }}>{book.author}</div>
      {(progress || showReading) && book.progress != null && (
        <div className="c-progress"><i style={{ width: (book.progress * 100) + '%' }} /></div>
      )}
    </div>
  );
}

/* ── Barra de progresso ─────────────────────────────────────────────────── */
function ProgressBar({ value }) {
  return <div className="progress-track"><i style={{ width: Math.round(value * 100) + '%' }} /></div>;
}

/* ── Heatmap de leitura ─────────────────────────────────────────────────── */
const HEAT_LEVELS = [
  'var(--line-2)',
  'oklch(0.86 0.045 196)',
  'oklch(0.76 0.07 196)',
  'oklch(0.65 0.082 196)',
  'oklch(0.52 0.082 197)',
];
function heatLevel(pages) {
  if (pages <= 0) return 0;
  if (pages < 18) return 1;
  if (pages < 38) return 2;
  if (pages < 62) return 3;
  return 4;
}
function Heatmap({ data }) {
  const monthNames = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  // agrupa os dias por mês
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
          while (cells.length % 7 !== 0) cells.push(null);   // completa a última semana
          const sum = g.days.reduce((a, d) => a + d.pages, 0);
          return (
            <div className="heat-month" key={g.m}>
              <div className="hm-head"><span className="hm-name">{monthNames[g.m]}</span><span className="hm-sum">{(sum / 1000).toFixed(1)}k</span></div>
              <div className="hm-cells">
                {cells.map((d, i) => (
                  <div key={i} className="hm-cell"
                       title={d ? `${d.date} · ${d.pages} págs` : ''}
                       style={{ background: d ? `var(--heat-${heatLevel(d.pages)})` : 'transparent' }} />
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

/* ── Mini sparkline (últimos N dias) ────────────────────────────────────── */
function Spark({ data }) {
  const max = Math.max(...data, 1);
  return (
    <div className="stat-spark">
      {data.map((v, i) => (
        <i key={i} className={v >= max * 0.7 ? 'hot' : ''}
           style={{ height: Math.max(2, (v / max) * 22) + 'px' }} />
      ))}
    </div>
  );
}

/* ── helpers de data (pt-BR) ────────────────────────────────────────────── */
const MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const DIAS = ['domingo','segunda','terça','quarta','quinta','sexta','sábado'];
function fmtDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  return `${d.getDate()} de ${MESES[d.getMonth()]}`;
}
function relDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  const today = new Date('2026-06-08T00:00:00');
  const diff = Math.round((today - d) / 86400000);
  if (diff === 0) return 'hoje';
  if (diff === 1) return 'ontem';
  if (diff < 7) return `${diff} dias atrás`;
  return fmtDate(iso);
}

Object.assign(window, { Icon, Stars, StarShape, Cover, ProgressBar, Heatmap, Spark, HEAT_LEVELS, heatLevel, fmtDate, relDate, MESES, DIAS });
