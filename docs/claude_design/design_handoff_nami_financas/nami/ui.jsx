/* ─────────────────────────────────────────────────────────────────────────
   Nami · Finanças — primitivos de UI
   Ícones, valores em BRL (com modo privacidade), selo de categoria, donut,
   sparkline e helpers de data.
   ───────────────────────────────────────────────────────────────────────── */

const ICONS = {
  /* navegação */
  dashboard: 'M4 13h7V4H4zM13 9h7V4h-7zM13 20h7v-9h-7zM4 20h7v-5H4z',
  receipt:   'M5 3v18l2.5-1.5L10 21l2-1.5L14 21l2.5-1.5L19 21V3l-2.5 1.5L14 3l-2 1.5L10 3 7.5 4.5z M8 8h8 M8 12h8',
  bank:      'M3 10h18M5 10V20M9 10V20M15 10V20M19 10V20M3 20h18M12 3 3 8h18z',
  card:      'M2.5 7.5h19v10h-19z M2.5 11h19 M6 15h4',
  target:    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M12 12h.01',
  calendar:  'M7 3v4M17 3v4M3.5 9h17M5 5h14a1.5 1.5 0 0 1 1.5 1.5V19A1.5 1.5 0 0 1 19 20.5H5A1.5 1.5 0 0 1 3.5 19V6.5A1.5 1.5 0 0 1 5 5z',
  handshake: 'M11 17 8.5 14.5a2 2 0 0 1 0-2.8l3.5-3.5 2 2 3-3 4 4M3 7l4-2 5 3M3 7v8l3 3M21 7l-4-2',

  /* categorias */
  cart:     'M3 4h2l2.2 11.2a1.5 1.5 0 0 0 1.5 1.3h8.6a1.5 1.5 0 0 0 1.5-1.2L21 8H6 M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2 M18 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2',
  utensils: 'M5 3v8a2 2 0 0 0 4 0V3M7 11v10M17 3c-1.5 0-2.5 1.5-2.5 4s1 4 2.5 4M17 3v18',
  car:      'M5 13l1.5-4.5A2 2 0 0 1 8.4 7h7.2a2 2 0 0 1 1.9 1.5L19 13M4 13h16v5H4z M7 18v2M17 18v2M6.5 15.5h.01M17.5 15.5h.01',
  home:     'M3 10.5 12 3l9 7.5M5 9.5V21h5v-6h4v6h5V9.5',
  pulse:    'M3 12h4l2 6 4-14 2 8h6',
  ticket:   'M4 6h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4z M14 6v12',
  bag:      'M6 8h12l-1 12H7zM9 8V6a3 3 0 0 1 6 0v2',
  book:     'M4 5.5C6 4 9 4 11 5.5v13C9 17 6 17 4 18.5zM20 5.5C18 4 15 4 13 5.5v13c2-1.5 5-1.5 7 0z',
  plane:    'M10.5 13.5 3 11l1-2 8 1 4.5-5a2 2 0 0 1 3 3l-5 4.5 1 8-2 1z',
  repeat:   'M17 2l3 3-3 3M3 11V9a4 4 0 0 1 4-4h13M7 22l-3-3 3-3M21 13v2a4 4 0 0 1-4 4H4',
  dots:     'M5 12h.01M12 12h.01M19 12h.01',
  wallet:   'M3 7a2 2 0 0 1 2-2h13v4M3 7v10a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-3M3 7h16M17 13h4v-3h-4a1.5 1.5 0 0 0 0 3z',
  laptop:   'M5 5h14v10H5zM3 19h18M9 19l.5-2h5l.5 2',
  trend:    'M3 17l6-6 4 4 7-7M14 8h6v6',
  refund:   'M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',

  /* utilitários */
  plus:     'M12 5v14M5 12h14',
  minus:    'M5 12h14',
  search:   'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  x:        'M18 6 6 18M6 6l12 12',
  check:    'M20 6 9 17l-5-5',
  chevL:    'M15 18l-6-6 6-6',
  chevR:    'M9 18l6-6-6-6',
  arrowLeft:'M19 12H5M12 19l-7-7 7-7',
  up:       'M12 19V5M5 12l7-7 7 7',
  down:     'M12 5v14M5 12l7 7 7-7',
  eye:      'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  eyeOff:   'M3 3l18 18M10.6 10.6a3 3 0 0 0 4.2 4.2M9.4 5.2A9.7 9.7 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-2.7 3.5M6.3 6.3A17 17 0 0 0 2 12s3.5 7 10 7a9.6 9.6 0 0 0 3-.5',
  coins:    'M8 14a6 6 0 1 0 0-12 6 6 0 0 0 0 12z M14 8a6 6 0 1 1 0 12 6 6 0 0 1 0-12',
  zap:      'M13 2 4 14h7l-1 8 9-12h-7z',
  trash:    'M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M10 11v6M14 11v6',
  image:    'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z M3 16l5-5 4 4 3-3 6 6 M9 10a1.4 1.4 0 1 0 0-2.8A1.4 1.4 0 0 0 9 10z',
  upload:   'M12 16V4M7 9l5-5 5 5M5 20h14',
  building: 'M5 21V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v17M15 21h3a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1h-3M8 7h.01M11 7h.01M8 11h.01M11 11h.01M8 15h.01M11 15h.01M3 21h18',
};

function Icon({ name, style }) {
  const d = ICONS[name] || ICONS.dots;
  return (
    <svg viewBox="0 0 24 24" fill="none" style={style}
         stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

/* ── Valor monetário (com modo privacidade via .amount) ─────────────────── */
function Money({ v, cur = true, cents = true, sign = null, className = '' }) {
  const num = fmtBRL(v, { cents });
  const pre = sign === 'in' ? '+ ' : sign === 'out' ? '− ' : '';
  return <span className={'amount ' + className}>{pre}{cur ? 'R$ ' : ''}{num}</span>;
}

/* valor com R$ menor (cifrão sobrescrito) */
function BigMoney({ v, cents = false, className = '' }) {
  return (
    <span className={'amount ' + className}>
      <span className="cur">R$</span>{fmtBRL(v, { cents })}
    </span>
  );
}

/* ── Selo de categoria (ícone em caixa colorida) ────────────────────────── */
function CatBadge({ catId, size = 38 }) {
  const c = CAT[catId] || CAT.outros;
  const r = size >= 36 ? 11 : 9;
  return (
    <div className="tx-ico" style={{
      width: size, height: size, borderRadius: r,
      background: c.color.replace(')', ' / 0.14)').replace('oklch(', 'oklch('),
      color: c.color,
    }}>
      <Icon name={c.icon} />
    </div>
  );
}

/* ── Donut de categorias ────────────────────────────────────────────────── */
function Donut({ segments, total, label = 'gasto', size = 132, stroke = 15 }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const sum = segments.reduce((a, s) => a + s.value, 0) || 1;
  return (
    <div className="donut" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line-2)" strokeWidth={stroke} />
        {segments.map((s, i) => {
          const frac = s.value / sum;
          const dash = frac * c;
          const el = (
            <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none"
                    stroke={s.color} strokeWidth={stroke}
                    strokeDasharray={`${dash} ${c - dash}`}
                    strokeDashoffset={-offset}
                    strokeLinecap="butt" />
          );
          offset += dash;
          return el;
        })}
      </svg>
      <div className="donut-center">
        <span className="v amount">{fmtK(total)}</span>
        <span className="l">{label}</span>
      </div>
    </div>
  );
}

/* ── Sparkline de barras ────────────────────────────────────────────────── */
function Spark({ data }) {
  const max = Math.max(...data, 1);
  return (
    <div className="stat-spark">
      {data.map((v, i) => (
        <i key={i} className={v >= max * 0.72 ? 'hot' : ''}
           style={{ height: Math.max(2, (v / max) * 22) + 'px' }} />
      ))}
    </div>
  );
}

/* ── helpers de data (pt-BR) ────────────────────────────────────────────── */
const DIAS_ABBR = ['dom','seg','ter','qua','qui','sex','sáb'];
const DIAS_FULL = ['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];
function fmtDay(iso) {
  const d = new Date(iso + 'T00:00:00');
  return `${DIAS_ABBR[d.getDay()]}, ${d.getDate()} de ${MONTH_NAMES[d.getMonth()].slice(0, 3)}`;
}
function relDay(iso) {
  const d = new Date(iso + 'T00:00:00');
  const today = new Date(TODAY + 'T00:00:00');
  const diff = Math.round((today - d) / 86400000);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Ontem';
  if (diff < 7) return `${diff} dias atrás`;
  return DIAS_FULL[d.getDay()].replace('-feira', '');
}
function daysUntil(dayOfMonth) {
  const today = new Date(TODAY + 'T00:00:00');
  let next = new Date(today.getFullYear(), today.getMonth(), dayOfMonth);
  if (next < today) next = new Date(today.getFullYear(), today.getMonth() + 1, dayOfMonth);
  const diff = Math.round((next - today) / 86400000);
  if (diff === 0) return 'hoje';
  if (diff === 1) return 'amanhã';
  return `em ${diff} dias`;
}
function greet() {
  const h = new Date().getHours();
  if (h < 5) return 'Boa noite';
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

Object.assign(window, {
  Icon, Money, BigMoney, CatBadge, Donut, Spark,
  fmtDay, relDay, daysUntil, greet, DIAS_ABBR, DIAS_FULL,
});
