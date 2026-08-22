/* ─────────────────────────────────────────────────────────────────────
   Yato · Viagens — telas A: Início, Viagens, Detalhe + Roteiro
   ───────────────────────────────────────────────────────────────────── */

/* ════ INÍCIO ═══════════════════════════════════════════════════════ */
function Home({ trip, navigate, onNewTrip, onCheck }) {
  if (!trip) {
    return (
      <div className="page">
        <div className="card empty" style={{ marginTop: 40 }}>
          <span className="e-emoji">🎒</span>
          <span className="e-txt">Nenhuma viagem no horizonte. Cinco ienes e eu te levo pra qualquer lugar.</span>
          <button className="btn btn-primary" onClick={onNewTrip}><Icon name="plus" /> Nova viagem</button>
        </div>
      </div>
    );
  }
  const d = dossierOf(trip);
  const cd = daysBetween(TODAY, trip.start);
  const strat = STRATEGY_LABEL[d && d.strategy] || { txt: 'a definir', emoji: '•' };
  const tot = budgetTotals();
  const done = checklistDone();
  const pctChk = Math.round(done / CHECKLIST.length * 100);
  const pend = CHECKLIST.filter(c => !c.done).slice(0, 5);
  const days = dayList(trip);
  const day1 = itinOf(trip.id).filter(i => i.day === days[0]);
  const others = TRIPS.filter(t => t.id !== trip.id);

  return (
    <div className="page">
      {/* ── HERO ── */}
      <div className="hero">
        <div className="hero-tex" />
        <div className="hero-inner">
          <div className="hero-copy">
            <div className="hero-eyebrow">caderno de bordo · próxima viagem</div>
            <h1 className="hero-city">{trip.city}<span className="hc-uf">/{trip.uf}</span></h1>
            <div className="hero-meta">
              <span>{fmtRange(trip.start, trip.end)}</span>
              <span className="sep" />
              <span>{tripDays(trip)} dias</span>
              <span className="sep" />
              <span className={'chip chip-static ' + PROFILE_CLASS[trip.profile]}>{PROFILE_LABEL[trip.profile]}</span>
              <span className="hero-count">faltam {cd} dias</span>
            </div>
            <p className="hero-quote">
              Centro histórico inteiro cabe nos pés — e eu já sei qual atalho evita a ladeira.
              Cinco ienes e a gente ainda economiza no transfer.
            </p>
            <div className="hero-cta">
              <button className="btn btn-primary" onClick={() => navigate('mobility')}>
                <Icon name="carimbo" /> Abrir dossiê
              </button>
              <button className="btn btn-kraft" onClick={() => navigate('trip', trip.id)}>
                <Icon name="rota" /> Ver roteiro
              </button>
            </div>
          </div>
          <div className="hero-right">
            <div className="hero-ready">
              <div className="hr-k">prontidão do protocolo</div>
              <div className="hr-v">{checkedCount(d)}<span style={{ fontSize: 15, color: 'var(--ink-3)' }}>/7</span></div>
              <ReadinessMeter dossier={d} size="lg" />
              <div className="hr-sub">checklist {pctChk}% · {pendingCount(d)} passo pendente</div>
            </div>
            <div className="hero-portrait">
              <div className="halo" />
              <img src="yato/yato.png" alt="Yato" />
            </div>
          </div>
        </div>
      </div>

      {/* ── 3 painéis ── */}
      <div className="tri-grid">
        <div className="card panel">
          <div className="panel-head">
            <span className="panel-title">Estratégia de mobilidade</span>
            <span className="panel-link" onClick={() => navigate('mobility')}>abrir dossiê →</span>
          </div>
          <div className="strategy-big"><span className="strategy-emoji">{strat.emoji}</span>{strat.txt}</div>
          <ReadinessLine dossier={d} onClick={() => navigate('mobility')} />
          <p style={{ fontSize: 12.5, color: 'var(--ink-2)', textWrap: 'pretty' }}>
            {d ? d.summary : 'Ainda não checamos nada dessa cidade. Vamos por partes.'}
          </p>
        </div>

        <div className="card panel">
          <div className="panel-head">
            <span className="panel-title">Orçamento</span>
            <span className="panel-link" onClick={() => navigate('budget')}>detalhar →</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span className="mono" style={{ fontFamily: 'var(--display)', fontSize: 24, fontWeight: 700, whiteSpace: 'nowrap' }}>{money(tot.act)}</span>
            <span className="dim mono" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>de {money(tot.est)}</span>
          </div>
          <div className="prog-wide"><i style={{ width: Math.min(100, tot.act / tot.est * 100) + '%' }} /></div>
          <div className="kv"><span className="k">saldo</span>
            <span className="mono" style={{ color: tot.saldo < 0 ? 'var(--budget-over)' : 'var(--budget-ok)', fontWeight: 600 }}>{money(tot.saldo)}</span>
          </div>
          <div className="kv"><span className="k">estouro</span><span>alimentação passou {money(385 - 300)}</span></div>
        </div>

        <div className="card panel">
          <div className="panel-head">
            <span className="panel-title">Próximas pendências</span>
            <span className="panel-link" onClick={() => navigate('checklist')}>checklist →</span>
          </div>
          <div className="pend-list">
            {pend.map(c => (
              <div className="pend-row" key={c.id}>
                <span className="fb-box" />
                <span>{c.label}</span>
              </div>
            ))}
          </div>
          <div className="kv" style={{ marginTop: 'auto' }}><span className="k">feitos</span><span>{done} de {CHECKLIST.length}</span></div>
        </div>
      </div>

      {/* ── dia 1 ── */}
      <div className="section">
        <div className="section-head">
          <h2 className="section-title">Linha do tempo do dia 1</h2>
          <span className="section-sub">{fmtBRfull(days[0])} · {DOW[dparse(days[0]).getDay()]}</span>
          <span className="section-link" onClick={() => navigate('trip', trip.id)}>roteiro completo →</span>
        </div>
        <div className="card" style={{ padding: '10px 16px' }}>
          {day1.map((it, i) => (
            <div className="itin" key={it.id}>
              {i < day1.length - 1 && <div className="itin-seam" />}
              <div className="itin-mode" title={MODE_LABEL[it.mode]}>{MODE_EMOJI[it.mode]}</div>
              <div className="itin-b">
                <div className="itin-top">
                  {it.time && <span className="itin-time">{it.time}</span>}
                  <span className="itin-title">{it.title}</span>
                  {it.cost != null && <span className="itin-cost">{money(it.cost)}</span>}
                </div>
                {it.addr && <div className="itin-addr">{it.addr}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── outras viagens ── */}
      <div className="section">
        <div className="section-head">
          <h2 className="section-title">Outras viagens</h2>
          <span className="section-link" onClick={() => navigate('trips')}>ver todas →</span>
        </div>
        <div className="trips-grid">
          {others.map(t => <TripCard key={t.id} trip={t} onClick={() => navigate('trip', t.id)} />)}
        </div>
      </div>
    </div>
  );
}

/* ════ VIAGENS ══════════════════════════════════════════════════════ */
const STATUS_FILTERS = ['todas', 'planejando', 'confirmada', 'em curso', 'concluída', 'cancelada'];

function Trips({ navigate, sort, query, onNewTrip }) {
  const [status, setStatus] = React.useState('todas');
  const [view, setView] = React.useState('grid');

  let list = TRIPS.filter(t => status === 'todas' || STATUS_LABEL[t.status] === status);
  if (query) {
    const q = query.toLowerCase();
    list = list.filter(t => (t.city + t.uf + (t.title || '')).toLowerCase().includes(q));
  }
  const sorters = {
    'Data de ida': (a, b) => a.start.localeCompare(b.start),
    'Criada': (a, b) => b.created.localeCompare(a.created),
    'Prontidão': (a, b) => checkedCount(dossierOf(b)) - checkedCount(dossierOf(a)),
    'Orçamento': (a, b) => tripDays(b) - tripDays(a),
  };
  list = [...list].sort(sorters[sort] || sorters['Data de ida']);

  return (
    <div className="page">
      <div className="section-head" style={{ marginTop: 4 }}>
        <h2 className="section-title">Viagens</h2>
        <span className="section-sub">{list.length} de {TRIPS.length}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 7 }}>
          <button className={'chip' + (view === 'grid' ? ' on' : '')} onClick={() => setView('grid')}>grade</button>
          <button className={'chip' + (view === 'lista' ? ' on' : '')} onClick={() => setView('lista')}>lista</button>
        </div>
      </div>
      <div className="filters" style={{ marginBottom: 16 }}>
        {STATUS_FILTERS.map(s => (
          <button key={s} className={'chip' + (status === s ? ' on' : '')} onClick={() => setStatus(s)}>{s}</button>
        ))}
        <span className="dim mono" style={{ fontSize: 11, marginLeft: 'auto' }}>ordenado por {sort.toLowerCase()}</span>
      </div>

      {list.length === 0 && (
        <div className="card empty">
          <span className="e-emoji">🎒</span>
          <span className="e-txt">Nenhuma viagem no horizonte. Cinco ienes e eu te levo pra qualquer lugar.</span>
          <button className="btn btn-primary" onClick={onNewTrip}><Icon name="plus" /> Nova viagem</button>
        </div>
      )}

      {view === 'grid' && list.length > 0 && (
        <div className="trips-grid">
          {list.map(t => <TripCard key={t.id} trip={t} onClick={() => navigate('trip', t.id)} />)}
        </div>
      )}

      {view === 'lista' && list.length > 0 && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table className="trip-table">
            <thead><tr>
              <th>cidade/uf</th><th>datas</th><th>perfil</th><th>prontidão</th><th>orçamento</th><th>status</th>
            </tr></thead>
            <tbody>
              {list.map(t => {
                const d = dossierOf(t);
                return (
                  <tr key={t.id} onClick={() => navigate('trip', t.id)}>
                    <td className="city">{t.city}/{t.uf}</td>
                    <td className="mono">{fmtRange(t.start, t.end)}</td>
                    <td><span className={'chip chip-static ' + PROFILE_CLASS[t.profile]}>{PROFILE_LABEL[t.profile]}</span></td>
                    <td style={{ width: 150 }}><ReadinessLine dossier={d} /></td>
                    <td className="mono">{t.id === 't1' ? money(budgetTotals().est) : '—'}</td>
                    <td>{STATUS_LABEL[t.status]}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ════ DETALHE + ROTEIRO ════════════════════════════════════════════ */
function DayColumn({ date, items, onAdd }) {
  const d = dparse(date);
  const cost = items.reduce((a, i) => a + (i.cost || 0), 0);
  const periods = [['manha', 'manhã'], ['tarde', 'tarde'], ['noite', 'noite']];
  return (
    <div className="day-col">
      <div className="day-head">
        <span className="day-dow">{DOW[d.getDay()]}</span>
        <span className="day-date">{fmtBR(date)}</span>
        {cost > 0 && <span className="day-cost">{money(cost)}</span>}
      </div>
      {periods.map(([k, label]) => {
        const its = items.filter(i => i.period === k);
        return (
          <div className="period" key={k}>
            <div className="period-k">{label}</div>
            {its.map((it, i) => (
              <div className="itin" key={it.id}>
                {i < its.length - 1 && <div className="itin-seam" />}
                <div className="itin-mode" title={MODE_LABEL[it.mode]}>{MODE_EMOJI[it.mode] || '•'}</div>
                <div className="itin-b">
                  <div className="itin-top">
                    {it.time && <span className="itin-time">{it.time}</span>}
                    <span className="itin-title">{it.title}</span>
                    {it.cost != null && <span className="itin-cost">{money(it.cost)}</span>}
                  </div>
                  {it.addr && <div className="itin-addr">{it.addr}</div>}
                </div>
              </div>
            ))}
            {its.length === 0 && <button className="period-add" onClick={() => onAdd(date, k)}>+ adicionar</button>}
            {its.length > 0 && <button className="period-add" style={{ marginTop: 6 }} onClick={() => onAdd(date, k)}>+</button>}
          </div>
        );
      })}
    </div>
  );
}

function TripDetail({ tripId, navigate, onAddItem, orphans, onOrphan, onDates }) {
  const trip = TRIPS.find(t => t.id === tripId) || TRIPS[0];
  const d = dossierOf(trip);
  const items = itinOf(trip.id);
  const days = dayList(trip);
  const tot = budgetTotals();

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <button className="btn btn-sm" onClick={() => navigate('trips')}><Icon name="arrowL" /> Viagens</button>
      </div>

      {orphans > 0 && (
        <div className="banner" style={{ marginBottom: 14 }}>
          <span className="b-sym">◐</span>
          <span><b>{orphans} itens</b> ficaram fora das novas datas. Nada foi apagado — decide você.</span>
          <span className="b-acts">
            <button className="btn btn-sm" onClick={() => onOrphan('mover')}>Mover</button>
            <button className="btn btn-sm" onClick={() => onOrphan('remover')}>Remover</button>
          </span>
        </div>
      )}

      <div className="section-head" style={{ alignItems: 'flex-end' }}>
        <div>
          <div className="eyebrow">{trip.title || 'viagem'}</div>
          <h2 className="hero-city" style={{ fontSize: 34 }}>{trip.city}<span className="hc-uf">/{trip.uf}</span></h2>
          <div className="hero-meta" style={{ marginTop: 6 }}>
            <input className="inp mono" type="date" value={trip.start} style={{ padding: '4px 7px' }}
                   onChange={e => onDates('start', e.target.value)} />
            <span className="sep" />
            <input className="inp mono" type="date" value={trip.end} style={{ padding: '4px 7px' }}
                   onChange={e => onDates('end', e.target.value)} />
            <span className="sep" />
            <span className={'chip chip-static ' + PROFILE_CLASS[trip.profile]}>{PROFILE_LABEL[trip.profile]}</span>
            <span className="chip chip-static">{STATUS_LABEL[trip.status]}</span>
          </div>
        </div>
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <div className="dos-foot-k" style={{ marginBottom: 6 }}>dossiê</div>
          <ReadinessLine dossier={d} size="md" onClick={() => navigate('mobility')} />
        </div>
      </div>

      <div className="kpi-row" style={{ marginTop: 6 }}>
        <div className="card kpi"><div className="kk">dias</div><div className="kv2 mono">{tripDays(trip)}</div><div className="ks">{days.length} colunas no roteiro</div></div>
        <div className="card kpi"><div className="kk">itens de roteiro</div><div className="kv2 mono">{items.length}</div><div className="ks">{items.filter(i => i.time).length} com horário marcado</div></div>
        <div className="card kpi"><div className="kk">prontidão</div><div className="kv2 mono">{checkedCount(d)}/7</div><div className="ks">{pendingCount(d)} passo pendente</div></div>
        <div className="card kpi"><div className="kk">orçamento</div><div className="kv2 mono">{money(tot.act)}</div><div className="ks">de {money(tot.est)} estimado</div></div>
      </div>

      <div className="section">
        <div className="section-head">
          <h2 className="section-title">Roteiro</h2>
          <span className="section-sub">manhã · tarde · noite — horário só quando existe</span>
          <button className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={() => onAddItem(days[0], 'manha')}>
            <Icon name="plus" /> Novo item
          </button>
        </div>
        <div className="board">
          {days.map(dt => (
            <DayColumn key={dt} date={dt} items={items.filter(i => i.day === dt)} onAdd={onAddItem} />
          ))}
        </div>
      </div>

      <div className="section">
        <ComfortMatrix hours={11} night />
      </div>
    </div>
  );
}

Object.assign(window, { Home, Trips, TripDetail, DayColumn });
