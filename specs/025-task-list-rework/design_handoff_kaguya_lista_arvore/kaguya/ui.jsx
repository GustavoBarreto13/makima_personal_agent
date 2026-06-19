/* ─────────────────────────────────────────────────────────────────────────
   Kaguya · Tarefas — primitivos de UI
   Ícones (linha), checkbox circular, marca de prioridade, chips, anel de
   força do hábito, heatmap (padrão Frieren) e o mirror do parser.
   ───────────────────────────────────────────────────────────────────────── */

const ICONS = {
  /* views */
  sun:      'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z M12 1v3M12 20v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M1 12h3M20 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1',
  list:     'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  board:    'M4 4h5v16H4zM10.5 4h5v10h-5zM17 4h3v16h-3z',
  calendar: 'M7 3v4M17 3v4M3.5 9h17M5 5h14a1.5 1.5 0 0 1 1.5 1.5V19A1.5 1.5 0 0 1 19 20.5H5A1.5 1.5 0 0 1 3.5 19V6.5A1.5 1.5 0 0 1 5 5z',
  grid2x2:  'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  loop:     'M17 2l3 3-3 3M3 11V9a4 4 0 0 1 4-4h13M7 22l-3-3 3-3M21 13v2a4 4 0 0 1-4 4H4',
  /* projetos */
  inbox:    'M3 13h4l1.5 3h7L17 13h4M5 5h14a1 1 0 0 1 1 1l-1.5 9.5a2 2 0 0 1-2 1.5H7.5a2 2 0 0 1-2-1.5L4 6a1 1 0 0 1 1-1z',
  home:     'M3 10.5 12 3l9 7.5M5 9.5V21h5v-6h4v6h5V9.5',
  users:    'M16 19a4 4 0 0 0-8 0M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM20 19a3 3 0 0 0-4-2.8M17.5 10a2.5 2.5 0 0 0 0-4',
  heart:    'M12 20s-7-4.5-9.5-9C1 8 2.5 4.5 6 4.5c2 0 3.2 1.2 4 2.3.8-1.1 2-2.3 4-2.3 3.5 0 5 3.5 3.5 6.5C19 15.5 12 20 12 20z',
  grad:     'M22 9 12 4 2 9l10 5 10-5zM6 11.5V16c0 1.3 2.7 2.5 6 2.5s6-1.2 6-2.5v-4.5M22 9v5',
  book:     'M4 5.5C6 4 9 4 11 5.5v13C9 17 6 17 4 18.5zM20 5.5C18 4 15 4 13 5.5v13c2-1.5 5-1.5 7 0z',
  brush:    'M14 4l6 6-9 9H5v-6zM13 5l6 6M5 19l2.5-.5',
  wallet:   'M3 7a2 2 0 0 1 2-2h13v4M3 7v10a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-3M3 7h16M17 13h4v-3h-4a1.5 1.5 0 0 0 0 3z',
  /* filtros / hábitos */
  zap:      'M13 2 4 14h7l-1 8 9-12h-7z',
  timer:    'M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 14V10M9 2h6M19 6l1.5-1.5',
  lotus:    'M12 3c2 2.5 2 5.5 0 8-2-2.5-2-5.5 0-8zM4 9c3 0 5 2 6 5-3 1-6-1-6-5zM20 9c-3 0-5 2-6 5 3 1 6-1 6-5zM5 14c2.5 1 4 3 4 6h6c0-3 1.5-5 4-6',
  dumbbell: 'M6.5 6.5l11 11M4 9l-1.5 1.5a2 2 0 0 0 0 3L4 15M9 4l-1.5 1.5M20 9l1.5 1.5a2 2 0 0 1 0 3L20 15M15 20l1.5-1.5',
  drop:     'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z',
  /* utilitários */
  plus:     'M12 5v14M5 12h14',
  check:    'M20 6 9 17l-5-5',
  x:        'M18 6 6 18M6 6l12 12',
  search:   'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  chevL:    'M15 18l-6-6 6-6',
  chevR:    'M9 18l6-6-6-6',
  chevDown: 'M6 9l6 6 6-6',
  flag:     'M5 21V4M5 4h12l-2 4 2 4H5',
  clock:    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 8v4l3 2',
  tag:      'M3 11.5V5a2 2 0 0 1 2-2h6.5L21 12.5 12.5 21z M7.5 7.5h.01',
  trash:    'M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M10 11v6M14 11v6',
  dots:     'M5 12h.01M12 12h.01M19 12h.01',
  sort:     'M3 6h12M3 12h9M3 18h5M17 8V20M17 20l3-3M17 20l-3-3',
  command:  'M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z',
  arrowR:   'M5 12h14M13 6l6 6-6 6',
  edit:     'M14 4l6 6-10 10H4v-6zM13 5l6 6',
  moon:     'M21 12.5A8.5 8.5 0 0 1 11.5 3a7 7 0 1 0 9.5 9.5z',
  sparkles: 'M12 3l1.8 4.7L18.5 9.5 13.8 11.3 12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 14l.9 2.3 2.3.9-2.3.9L19 20l-.9-2.3-2.3-.9 2.3-.9z',
  minus:    'M5 12h14',
  filter:   'M3 5h18l-7 8v6l-4-2v-4z',
  folder:   'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  reschedule:'M3 5v6h6M3 11a9 9 0 1 1 1.5 5',
  more:     'M12 6v.01M12 12v.01M12 18v.01',
  grip:     'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
  arrowUpRight: 'M7 17 17 7M8 7h9v9',
  cake:     'M5 21h14M6 21v-8h12v8M6 13v-1a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1M12 10V7M12 7c-1 0-1.4-1.6 0-2 1.4.4 1 2 0 2',
};

function Icon({ name, style, className }) {
  const d = ICONS[name] || ICONS.dots;
  return (
    <svg viewBox="0 0 24 24" fill="none" style={style} className={className}
         stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {d.split('M').filter(Boolean).map((seg, i) => <path key={i} d={'M' + seg} />)}
    </svg>
  );
}

/* ── Checkbox circular (com pop ao concluir) ────────────────────────────── */
function Check({ done, popping, color = 'var(--done)', onClick, size }) {
  const cls = 'tk-check' + (done ? ' on' : '') + (popping ? ' popping' : '');
  const style = { '--cb-color': color, '--cb-tint': 'var(--kg-tint)' };
  if (size) { style.width = size; style.height = size; }
  return (
    <button type="button" className={cls} style={style}
            onClick={(e) => { e.stopPropagation(); onClick && onClick(); }}>
      <Icon name="check" />
    </button>
  );
}

/* ── Marca de prioridade (ícone de bandeira) ────────────────────────────── */
function PrioFlag({ level, style }) {
  if (!level) return null;
  const cls = level === 3 ? 'flag-high' : level === 2 ? 'flag-med' : 'flag-low';
  return <Icon name="flag" className={cls} style={Object.assign({ width: 13, height: 13 }, style)} />;
}

/* ── Chips de tag / data / projeto ──────────────────────────────────────── */
function TagChip({ tag }) {
  const c = (TAGS[tag] || {}).color || 'var(--ink-3)';
  return <span className="chip-tag"><span className="sw" style={{ width: 6, height: 6, borderRadius: 2, background: c }} />{tag}</span>;
}
function DateChip({ iso, time, done }) {
  if (!iso) return null;
  const cls = dueClass(iso, done);
  const label = dueLabel(iso);
  return <span className={'chip-date ' + cls}><Icon name="calendar" />{label}{time ? ' · ' + fmtTime(time) : ''}</span>;
}
function ProjChip({ id }) {
  const p = projById(id);
  return <span className="chip-proj"><span className="cp-dot" style={{ background: p.color }} />{p.name}</span>;
}

/* ── Anel de força do hábito ────────────────────────────────────────────── */
function StrengthRing({ value, color, size = 56 }) {
  const stroke = 5, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const dash = value * c;
  return (
    <div className="strength-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line-2)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
                strokeDasharray={`${dash} ${c - dash}`} strokeLinecap="round" />
      </svg>
      <div className="sr-val">
        <span className="sr-num">{Math.round(value * 100)}</span>
        <span className="sr-pct">FORÇA</span>
      </div>
    </div>
  );
}

/* ── Heatmap por mês (reuso do padrão Frieren) ──────────────────────────── */
function heatLevel(v, target) {
  if (v <= 0) return 0;
  if (!target) return 4;          // hábito sim/não
  const r = v / target;
  if (r < 0.5) return 1;
  if (r < 0.85) return 2;
  if (r < 1.0) return 3;
  return 4;
}
function heatColor(level, color) {
  if (level === 0) return 'var(--line-2)';
  const op = [0, 0.28, 0.5, 0.74, 1][level];
  return color.replace(')', ` / ${op})`);
}
function Heatmap({ months, color, target }) {
  return (
    <div className="heat-months-wrap">
      {months.map((g, gi) => {
        const first = iso2d(g.days[0].date);
        const lead = first.getDay();
        const cells = [];
        for (let i = 0; i < lead; i++) cells.push(null);
        g.days.forEach(d => cells.push(d));
        while (cells.length % 7 !== 0) cells.push(null);
        return (
          <div className="heat-month" key={gi}>
            <div className="hm-head"><span className="hm-name">{MESES_ABBR[g.m]}</span></div>
            <div className="hm-cells">
              {cells.map((d, i) => (
                <div key={i} className="hm-cell" title={d ? `${d.date} · ${d.v || 0}` : ''}
                     style={{ background: d ? heatColor(heatLevel(d.v, target), color) : 'transparent' }} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Mirror do parser (highlight ao vivo) ───────────────────────────────── */
function ParseMirror({ segments }) {
  return (
    <div className="qa-mirror" aria-hidden="true">
      {segments.map((s, i) => s.cls ? <span key={i} className={s.cls}>{s.text}</span> : <span key={i}>{s.text}</span>)}
    </div>
  );
}

Object.assign(window, {
  ICONS, Icon, Check, PrioFlag, TagChip, DateChip, ProjChip,
  StrengthRing, Heatmap, heatLevel, heatColor, ParseMirror,
});
