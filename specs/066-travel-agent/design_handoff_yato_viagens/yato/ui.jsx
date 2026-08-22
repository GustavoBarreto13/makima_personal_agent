/* ─────────────────────────────────────────────────────────────────────
   Yato · Viagens — primitivos de UI
   ───────────────────────────────────────────────────────────────────── */
const ICONS = {
  inicio:   'M3 10.5 12 3l9 7.5M5 9.5V21h5v-6h4v6h5V9.5',
  mochila:  'M8 7V5.5A4 4 0 0 1 16 5.5V7M6.5 7h11A2.5 2.5 0 0 1 20 9.5V19a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9.5A2.5 2.5 0 0 1 6.5 7zM9 12h6v4H9z',
  mapa:     'M9 3 3 5.5v15L9 18l6 3 6-2.5v-15L15 6zM9 3v15M15 6v15',
  rota:     'M6 3v11a4 4 0 0 0 4 4h8M18 14l4 4-4 4M6 3a2 2 0 1 0 0 0.01',
  carimbo:  'M9 3h6a2 2 0 0 1 2 2v3.5a3 3 0 0 1-1 2.2L15 12v2H9v-2l-1-1.3a3 3 0 0 1-1-2.2V5a2 2 0 0 1 2-2zM4 17h16v4H4z',
  moeda:    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v10M9.5 9.5h5M9.5 14.5h5',
  cifrao:   'M12 3v18M16.5 7.5C16 5.8 14.3 5 12 5c-2.5 0-4 1.2-4 3s1.6 2.6 4 3.2c2.6.6 4.3 1.3 4.3 3.3S14.6 19 12 19c-2.4 0-4.2-.9-4.7-2.8',
  lista:    'M4 6h13M4 12h13M4 18h13M20 6h.01M20 12h.01M20 18h.01',
  onibus:   'M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5V17H4zM4 12h16M7 17v2.5M17 17v2.5M8 20h8',
  relogio:  'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7.5V12l3.2 2',
  calendar: 'M7 3v4M17 3v4M3.5 9h17M5 5h14a1.5 1.5 0 0 1 1.5 1.5V19A1.5 1.5 0 0 1 19 20.5H5A1.5 1.5 0 0 1 3.5 19V6.5A1.5 1.5 0 0 1 5 5z',
  check:    'M20 6 9 17l-5-5',
  chevR:    'M9 18l6-6-6-6',
  chevL:    'M15 18l-6-6 6-6',
  search:   'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  gear:     'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-2.87 1.2v.17a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 2.6 15v-.09A2 2 0 1 1 4.6 11h.17A1.7 1.7 0 0 0 6.4 7.7L6.34 7.64A2 2 0 1 1 9.17 4.8l.06.06A1.7 1.7 0 0 0 11.1 5.2h.08A1.7 1.7 0 0 0 12.4 3.6V3.4a2 2 0 1 1 4 0v.17a1.7 1.7 0 0 0 2.87 1.2l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 21.4 11h.17',
  plus:     'M12 5v14M5 12h14',
  x:        'M18 6 6 18M6 6l12 12',
  alerta:   'M12 4 2.5 20h19zM12 10v4.5M12 17.2h.01',
  pedestre: 'M12 5.5a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2zM12 7.5 9 10v4M12 7.5 15 10.5v3M12 12v4l-2.5 5.5M12 16l2.5 5.5',
  arrowL:   'M19 12H5M12 19l-7-7 7-7',
};

function Icon({ name, style }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" style={style} stroke="currentColor"
         strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d={ICONS[name] || ICONS.mapa} />
    </svg>
  );
}

/* ── vereditos ───────────────────────────────────────────────────────── */
const VERDICT = {
  confirmado:   { cls: 'v-ok',      sym: '●', label: 'confirmado' },
  ausente:      { cls: 'v-none',    sym: '⊖', label: 'ausente' },
  inconclusivo: { cls: 'v-unknown', sym: '◐', label: 'inconclusivo' },
  pendente:     { cls: 'v-pending', sym: '○', label: 'pendente' },
  na:           { cls: 'v-na',      sym: '—', label: 'n/a' },
};
const VERDICT_VAR = {
  confirmado: 'var(--verdict-ok)', ausente: 'var(--verdict-none)',
  inconclusivo: 'var(--verdict-unknown)', pendente: 'var(--verdict-pending-tint)',
  na: 'var(--ink-4)',
};

function VerdictChip({ v, md }) {
  const x = VERDICT[v] || VERDICT.pendente;
  return (
    <span className={'vchip ' + x.cls + (md ? ' md' : '')}>
      <span className="vsym">{x.sym}</span>{x.label}
    </span>
  );
}

/* ── medidor de prontidão: 7 segmentos, cada um na cor do seu veredito ── */
function ReadinessMeter({ dossier, size = '' }) {
  const cs = checksOf(dossier);
  return (
    <div className={'meter ' + size}>
      {cs.map((c, i) => (
        <i key={i} title={c.step.name + ' · ' + (VERDICT[c.v] || VERDICT.pendente).label}
           style={{ background: VERDICT_VAR[c.v] || VERDICT_VAR.pendente }} />
      ))}
    </div>
  );
}

function ReadinessLine({ dossier, size, onClick }) {
  const n = checkedCount(dossier);
  return (
    <div className="meter-wrap" onClick={onClick} style={onClick ? { cursor: 'pointer' } : null}>
      <ReadinessMeter dossier={dossier} size={size} />
      <span className="meter-txt">{n}/7 checados</span>
    </div>
  );
}

/* ── ticket kraft ────────────────────────────────────────────────────── */
function TripCard({ trip, onClick }) {
  const d = dossierOf(trip);
  const cancel = trip.status === 'cancelada';
  const cd = daysBetween(TODAY, trip.start);
  const body = (
    <div className={'ticket' + (cancel ? ' trip-cancel' : '')} onClick={onClick}>
      <div className="ticket-body">
        <div className="t-city">{trip.city}<span className="t-uf">/{trip.uf}</span></div>
        <div className="t-dates">{fmtRange(trip.start, trip.end)}</div>
        <div className="t-chips">
          <span className={'chip chip-static ' + PROFILE_CLASS[trip.profile]}>{PROFILE_LABEL[trip.profile]}</span>
          <span className="chip chip-static">{STATUS_LABEL[trip.status]}</span>
          {cd > 0 && !cancel && <span className="chip chip-static">faltam {cd} dias</span>}
        </div>
      </div>
      <div className="ticket-stub">
        <div>
          <div className="t-stub-k">dias</div>
          <div className="t-stub-v">{tripDays(trip)}</div>
        </div>
        <div>
          <div className="t-stub-k">prontidão</div>
          <ReadinessMeter dossier={d} />
          <div className="t-stub-k" style={{ marginTop: 4, letterSpacing: '0.08em' }}>{checkedCount(d)}/7</div>
        </div>
      </div>
    </div>
  );
  if (!cancel) return body;
  return <div className="trip-cancel-wrap">{body}<div className="trip-cancel-tag">cancelada</div></div>;
}

/* ── card de app sugerido — selo obrigatório ─────────────────────────── */
function AppSuggestionCard({ app }) {
  return (
    <div className="app-card">
      <div className="app-name">{app.name}<span className="app-kind">{app.kind}</span></div>
      <div className="app-cov">{app.cov}</div>
      <div className="app-seal">⚑ cobertura declarada — confirmar in-app</div>
    </div>
  );
}

/* ── barra de orçamento ──────────────────────────────────────────────── */
function BudgetBar({ item }) {
  const ratio = item.est ? item.act / item.est : 0;
  const over = ratio > 1;
  const color = over ? 'var(--budget-over)' : ratio >= 0.8 ? 'var(--budget-warn)' : 'var(--budget-ok)';
  const w = Math.min(1, ratio) * 100;
  return (
    <div className="bud-row">
      <span className="bud-k">{item.label}</span>
      <div className="bud-track">
        <div className="bud-fill" style={{ width: w + '%', background: color }} />
        {over && (
          <div className="bud-fill bud-over"
               style={{ left: '100%', width: Math.min(14, (ratio - 1) * 100) + '%', background: 'var(--budget-over)' }} />
        )}
      </div>
      <span className="bud-v" style={over ? { color: 'var(--budget-over)' } : null}>
        {money(item.act)} / {money(item.est)}
      </span>
    </div>
  );
}

/* ── linha de checklist ──────────────────────────────────────────────── */
function ChecklistRow({ item, onToggle }) {
  return (
    <div className={'chk-row' + (item.done ? ' done' : '')}>
      <button className={'chk-box' + (item.done ? ' done' : '')} onClick={onToggle}
              title={item.done ? 'desmarcar' : 'marcar'}>{item.done ? '✕' : ''}</button>
      <span className="chk-label">{item.label}</span>
      <span className={'chk-src' + (item.src === 'dossie' ? ' dos' : '')}
            title={item.src === 'dossie' ? 'item gerado por um passo do dossiê de mobilidade' : 'item criado à mão'}>
        {item.src === 'dossie' ? 'do dossiê' : 'manual'}
      </span>
    </div>
  );
}

/* ── matriz de conforto ANTT ─────────────────────────────────────────── */
function ComfortMatrix({ hours = 11, night = true }) {
  const recIdx = COMFORT.findIndex(c => c.key === COMFORT_REC.key);
  return (
    <div className="card comfort">
      <div className="section-head" style={{ marginBottom: 0 }}>
        <span className="section-title">Economia × conforto</span>
        <span className="section-sub">trecho de {hours}h{night ? ' · noturno' : ''} · classes ANTT</span>
      </div>
      <div className="comfort-ruler">
        {COMFORT.map((c, i) => (
          <div key={c.key} className={'cf' + (i === recIdx ? ' rec' : i > recIdx ? ' avail' : '')}>
            <div className="cf-name">{c.name}</div>
            <div className="seat">
              <div className="base" />
              <div className="back" style={{ transform: `rotate(${c.deg}deg)` }} />
            </div>
            <div className="cf-ang">{c.ang}</div>
            <div className="cf-ang" style={{ color: 'var(--ink-4)' }}>{c.note}</div>
            {i === recIdx && <div className="eyebrow" style={{ fontSize: 9 }}>recomendada</div>}
          </div>
        ))}
      </div>
      <div className="cf-balloon">{COMFORT_REC.why}</div>
      <div className="roi">
        <div className="dos-foot-k">fila de upgrades por retorno</div>
        {COMFORT_REC.roi.map((r, i) => (
          <div className="roi-row" key={r}><span className="roi-n">{i + 1}.</span><span>{r}</span></div>
        ))}
      </div>
    </div>
  );
}

function Toast({ message }) {
  if (!message) return null;
  return <div className="toast">{message}</div>;
}

Object.assign(window, {
  Icon, VERDICT, VERDICT_VAR, VerdictChip, ReadinessMeter, ReadinessLine,
  TripCard, AppSuggestionCard, BudgetBar, ChecklistRow, ComfortMatrix, Toast,
});
