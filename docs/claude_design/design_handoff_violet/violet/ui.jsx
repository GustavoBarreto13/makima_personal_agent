/* ─────────────────────────────────────────────────────────────────────────
   Violet · Diário — primitivos de UI
   Ícones (linha), fichas de navegação coloridas, render de menções inline,
   heatmap mensal, gráfico de área, helpers de data (pt-BR).
   ───────────────────────────────────────────────────────────────────────── */

const ICONS = {
  /* navegação principal */
  write:    'M3 21c1.5-3 4-9 7.5-12.5C13.5 5.5 17 3.5 20.5 3.5c0 3.5-1.8 7-4.8 10C12 17 6 19.5 3 21zM13.5 8.5 6 16',  // pena
  journal:  'M5 4.5A1.5 1.5 0 0 1 6.5 3H19v18H6.5A1.5 1.5 0 0 1 5 19.5zM9 3v18M9 8h7M9 12h7',
  reflect:  'M3.5 9A9 9 0 1 1 3 13M3 4v5h5M12 8v4l3 2',
  insights: 'M5 20V11M12 20V4M19 20v-6',
  /* coleções */
  moon:     'M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5z',
  heart:    'M12 20S4 15 4 8.8A4.2 4.2 0 0 1 12 6a4.2 4.2 0 0 1 8 2.8C20 15 12 20 12 20z',
  hash:     'M9 3 7 21M17 3l-2 18M4 8.5h16M3 15.5h16',
  at:       'M16 12a4 4 0 1 0-1.2 2.9M16 8v5a2.5 2.5 0 0 0 5 0v-1a9 9 0 1 0-3 6.7',
  pin:      'M9.5 3h5l-1 6 3.5 3v2H7v-2l3.5-3zM12 14v7',
  gem:      'M6 3h12l3 6-9 12L3 9zM3 9h18M9 3 7.5 9 12 21M15 3l1.5 6L12 21',
  bulb:     'M9 18h6M10 21h4M8.5 14a6 6 0 1 1 7 0c-.7.6-1 1.2-1 2.2H9.5c0-1-.3-1.6-1-2.2z',
  /* utilitários */
  plus:     'M12 5v14M5 12h14',
  search:   'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  x:        'M18 6 6 18M6 6l12 12',
  chevL:    'M15 18l-6-6 6-6',
  chevR:    'M9 18l6-6-6-6',
  chevsL:   'M11 18l-6-6 6-6M18 18l-6-6 6-6',
  first:    'M18 18l-6-6 6-6M7 6v12',
  last:     'M6 18l6-6-6-6M17 6v12',
  dot:      '',  // tratado abaixo
  clock:    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3.5 2',
  calendar: 'M7 3v4M17 3v4M3.5 9h17M5 5h14a1.5 1.5 0 0 1 1.5 1.5V19A1.5 1.5 0 0 1 19 20.5H5A1.5 1.5 0 0 1 3.5 19V6.5A1.5 1.5 0 0 1 5 5z',
  flame:    'M12 3c1 3-1 4-2 6s0 4 2 4 3-2 2-5c2 1 3 3 3 5a5 5 0 0 1-10 0c0-3 2-4 3-6s1-3-1-4z',
  person:   'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20a7.5 7.5 0 0 1 15 0',
  arrowL:   'M19 12H5M12 19l-7-7 7-7',
  feather:  'M3 21c1.5-3 4-9 7.5-12.5C13.5 5.5 17 3.5 20.5 3.5c0 3.5-1.8 7-4.8 10C12 17 6 19.5 3 21zM13.5 8.5 6 16',
};

const FILLED = new Set(['heart', 'moon', 'gem']);

function Icon({ name, style, filled }) {
  const d = ICONS[name];
  if (name === 'dot') {
    return <svg viewBox="0 0 24 24" style={style}><circle cx="12" cy="12" r="4" fill="currentColor" /></svg>;
  }
  const fill = (filled ?? FILLED.has(name)) ? 'currentColor' : 'none';
  const stroke = (filled ?? FILLED.has(name)) ? 'none' : 'currentColor';
  return (
    <svg viewBox="0 0 24 24" fill={fill} style={style}
         stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

/* glyphs das coleções, com cor */
const KIND_GLYPH = {
  bullet:    { name: 'dot',   color: 'var(--ink-4)' },
  highlight: { name: 'heart', color: 'var(--garnet)' },
  dream:     { name: 'moon',  color: 'var(--gold)' },
  idea:      { name: 'bulb',  color: 'var(--amber)' },
  wisdom:    { name: 'gem',   color: 'var(--violet-c)' },
  note:      { name: 'pin',   color: 'var(--ink-3)' },
};

/* ── render de texto com menções (#tag, @pessoa) ────────────────────────── */
function RichText({ text, onTag, onPerson }) {
  const parts = String(text).split(/(@[\wÀ-ÿ]+|#[\wÀ-ÿ-]+)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (/^@[\wÀ-ÿ]+$/.test(p)) return <span key={i} className="mp" onClick={() => onPerson && onPerson(p)}>{p}</span>;
        if (/^#[\wÀ-ÿ-]+$/.test(p)) return <span key={i} className="mt" onClick={() => onTag && onTag(p)}>{p}</span>;
        return <React.Fragment key={i}>{p}</React.Fragment>;
      })}
    </>
  );
}

/* ── heatmap por mês (linha rolável) ────────────────────────────────────── */
function heatLevel(words) {
  if (words <= 0) return 0;
  if (words < 50) return 1;
  if (words < 110) return 2;
  if (words < 190) return 3;
  return 4;
}
function HeatmapRow({ data }) {
  const monthNames = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  const months = [];
  data.forEach(d => {
    const m = new Date(d.date + 'T00:00:00').getMonth();
    let g = months.find(x => x.m === m);
    if (!g) { g = { m, days: [] }; months.push(g); }
    g.days.push(d);
  });
  return (
    <div className="heat-row-wrap">
      {months.map(g => {
        const first = new Date(g.days[0].date + 'T00:00:00');
        const lead = first.getDay();
        const cells = [];
        for (let i = 0; i < lead; i++) cells.push(null);
        g.days.forEach(d => cells.push(d));
        while (cells.length % 7 !== 0) cells.push(null);
        return (
          <div className="heat-mo" key={g.m}>
            <div className="mo-name">{monthNames[g.m]}</div>
            <div className="mo-cells">
              {cells.map((d, i) => (
                <div key={i} className="hc"
                     title={d ? `${fmtDate(d.date)} · ${d.words} palavras` : ''}
                     style={{ background: d ? `var(--heat-${heatLevel(d.words)})` : 'transparent' }} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── gráfico de área (palavras por mês) ─────────────────────────────────── */
function AreaChart({ data, height = 180 }) {
  const W = 760, H = height, pad = 8;
  const max = Math.max(...data, 1);
  const n = data.length;
  const x = i => pad + (i / (n - 1)) * (W - pad * 2);
  const y = v => H - 18 - (v / max) * (H - 34);
  const pts = data.map((v, i) => [x(i), y(v)]);
  // caminho suave (catmull-rom → bezier)
  const line = pts.map((p, i) => {
    if (i === 0) return `M${p[0]},${p[1]}`;
    const p0 = pts[i - 1];
    const cx = (p0[0] + p[0]) / 2;
    return `C${cx},${p0[1]} ${cx},${p[1]} ${p[0]},${p[1]}`;
  }).join(' ');
  const area = `${line} L${x(n - 1)},${H - 18} L${x(0)},${H - 18} Z`;
  const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }} preserveAspectRatio="none">
      <defs>
        <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#areaFill)" />
      <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r={i === 5 || i === 7 ? 3 : 0} fill="var(--accent)" />
      ))}
      {months.map((m, i) => (
        <text key={i} x={x(i)} y={H - 4} fontSize="9" fill="var(--ink-4)" textAnchor="middle"
              fontFamily="var(--mono)">{m}</text>
      ))}
    </svg>
  );
}

/* ── helpers de data (pt-BR) ────────────────────────────────────────────── */
const MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const MESES_ABR = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const DIAS = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
const DIAS_ABR = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

function _d(iso) { return new Date(iso + 'T00:00:00'); }
function fmtDate(iso) { const d = _d(iso); return `${d.getDate()} de ${MESES[d.getMonth()]}`; }
function dayName(iso) { return DIAS[_d(iso).getDay()]; }
function monthAbbr(iso) { const d = _d(iso); return `${MESES_ABR[d.getMonth()]} ${d.getDate()}`; }
function relDate(iso) {
  const d = _d(iso), today = _d(TODAY);
  const diff = Math.round((today - d) / 86400000);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Ontem';
  if (diff < 7) return `${diff} dias atrás`;
  if (diff < 30) return `${Math.round(diff / 7)} sem atrás`;
  return fmtDate(iso);
}
function excerpt(entry) {
  const lead = entry.bullets.find(b => b.kind === 'highlight') || entry.bullets[0];
  return lead ? lead.text : '';
}

Object.assign(window, {
  Icon, ICONS, KIND_GLYPH, RichText, HeatmapRow, AreaChart, heatLevel,
  MESES, MESES_ABR, DIAS, DIAS_ABR, fmtDate, dayName, monthAbbr, relDate, excerpt,
});
