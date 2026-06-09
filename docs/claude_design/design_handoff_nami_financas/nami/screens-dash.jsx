/* ─────────────────────────────────────────────────────────────────────────
   Nami · Finanças — Dashboard (visão geral)
   Hero + lançamento rápido + resumos + fluxo de caixa + categorias +
   contas, próximos vencimentos, orçamentos e transações recentes.
   ───────────────────────────────────────────────────────────────────────── */

function Dashboard({ monthKey: mk, stat, navigate, openAdd, onQuickSave, onToast, onDeleteTx }) {
  const isCurrent = mk === TODAY.slice(0, 7);

  // variação vs mês anterior
  const idx = MONTHS.indexOf(mk);
  const prev = idx > 0 ? monthStats(MONTHS[idx - 1]) : null;
  const expDelta = prev && prev.expense ? Math.round((stat.expense - prev.expense) / prev.expense * 100) : 0;
  const savingRate = stat.income ? Math.round(stat.net / stat.income * 100) : 0;

  // donut — top 6 categorias + agrupado
  const top = stat.cats.slice(0, 6);
  const restTotal = stat.cats.slice(6).reduce((a, c) => a + c.total, 0);
  const segments = top.map(c => ({ value: c.total, color: c.cat.color }));
  if (restTotal > 0) segments.push({ value: restTotal, color: 'var(--ink-4)' });

  // próximos vencimentos (assinaturas + financiamentos + empréstimos a pagar)
  const upcoming = [
    ...SUBSCRIPTIONS.map(s => ({ kind: 'sub', name: s.name, amount: s.amount, day: s.nextDay, color: s.color, short: s.short, img: s.img })),
    ...FINANCINGS.filter(l => l.paid < l.installments).map(l => ({ kind: 'fin', name: l.person, amount: l.total / l.installments, day: l.nextDay, color: 'oklch(0.575 0.170 24)', short: '⌂' })),
    ...LOANS.filter(l => l.dir === 'borrowed' && l.paid < l.installments).map(l => ({ kind: 'loan', name: l.person, amount: l.total / l.installments, day: l.nextDay, color: 'oklch(0.575 0.170 24)', short: '↺' })),
  ].sort((a, b) => {
    const da = (a.day - new Date(TODAY).getDate() + 31) % 31;
    const db = (b.day - new Date(TODAY).getDate() + 31) % 31;
    return da - db;
  }).slice(0, 4);

  // orçamentos (preview top 3 por uso)
  const budgetPreview = BUDGETS.map(b => ({ ...b, cat: CAT[b.catId], spent: stat.byCat[b.catId] || 0 }))
    .sort((a, b) => (b.spent / b.limit) - (a.spent / a.limit)).slice(0, 3);

  const recent = txInMonth(mk).slice(0, 6);
  const maxFlow = Math.max(...CASHFLOW.flatMap(c => [c.in, c.out]), 1);

  return (
    <div className="page">
      {/* ── HERO ── */}
      <div className="hero">
        <div className="hero-grain" />
        <div className="hero-copy">
          <div className="hero-eyebrow">{isCurrent ? 'Resumo de ' + MONTH_NAMES[new Date(TODAY).getMonth()] : monthLabel(mk)}</div>
          <div className="hero-greet">{greet()} — o mês está {stat.net >= 0 ? 'no azul' : 'no vermelho'}.</div>
          <div className={'hero-net ' + (stat.net >= 0 ? 'pos' : 'neg')}>
            <span className="cur">R$</span><span className="amount">{fmtBRL(stat.net, { cents: false })}</span>
          </div>
          <div className="hero-sub">
            Entrou <b style={{ color: 'var(--in)' }}><Money v={stat.income} cents={false} /></b> · saiu <b style={{ color: 'var(--out)' }}><Money v={stat.expense} cents={false} /></b>
            {savingRate > 0 && <> · guardou <b>{savingRate}%</b></>}
          </div>
          <div className="hero-cta">
            <button className="btn btn-primary" onClick={openAdd}><Icon name="plus" /> Nova transação</button>
            <button className="btn btn-ghost" onClick={() => navigate('transacoes')}><Icon name="receipt" /> Ver extrato</button>
          </div>
        </div>
        <div className="hero-portrait">
          <div className="halo" />
          <img src="nami/nami-hero.png" alt="Nami" />
        </div>
      </div>

      {/* ── LANÇAMENTO RÁPIDO ── */}
      <QuickAdd onSave={onQuickSave} onToast={onToast} />

      {/* ── RESUMOS ── */}
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label"><span className="dot" style={{ background: 'var(--in)' }} /> Receitas</div>
          <div className="stat-value pos"><span className="cur">R$</span>{fmtBRL(stat.income, { cents: false })}</div>
          <div className="stat-foot">{stat.cats.length ? `${txInMonth(mk).filter(t => t.type === 'in').length} entradas` : 'sem entradas'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label"><span className="dot" style={{ background: 'var(--out)' }} /> Despesas</div>
          <div className="stat-value neg"><span className="cur">R$</span>{fmtBRL(stat.expense, { cents: false })}</div>
          <Spark data={stat.daily} />
          <div className="stat-foot">
            {expDelta !== 0 && (expDelta > 0
              ? <span className="down">↑ {expDelta}%</span>
              : <span className="up">↓ {Math.abs(expDelta)}%</span>)} {prev ? 'vs. mês anterior' : 'neste mês'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label"><span className="dot" style={{ background: 'var(--tang)' }} /> Saldo do mês</div>
          <div className={'stat-value ' + (stat.net >= 0 ? 'pos' : 'neg')}><span className="cur">R$</span>{fmtBRL(stat.net, { cents: false })}</div>
          <div className="goal-track"><i style={{ width: Math.max(4, Math.min(100, savingRate)) + '%' }} /></div>
          <div className="stat-foot">taxa de economia <b>{savingRate}%</b></div>
        </div>
        <div className="stat-card">
          <div className="stat-label"><span className="dot" style={{ background: 'var(--sea)' }} /> Patrimônio</div>
          <div className="stat-value"><span className="cur">R$</span>{fmtBRL(NET_WORTH, { cents: false })}</div>
          <div className="stat-foot">líquido <b><Money v={LIQUID} cents={false} /></b></div>
        </div>
      </div>

      {/* ── FLUXO + CATEGORIAS ── */}
      <div className="section grid-2">
        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">Fluxo de caixa</span>
            <span className="section-sub">entradas e saídas por mês</span>
          </div>
          <div className="flow">
            {CASHFLOW.map(c => (
              <div key={c.key} className={'flow-col' + (c.key === mk ? ' cur' : '')}>
                <div className="flow-bars">
                  <div className="b in" style={{ height: (c.in / maxFlow * 100) + '%' }} title={'Entrou R$ ' + fmtBRL(c.in)} />
                  <div className="b out" style={{ height: (c.out / maxFlow * 100) + '%' }} title={'Saiu R$ ' + fmtBRL(c.out)} />
                </div>
                <span className="m">{MONTH_ABBR[c.m]}</span>
              </div>
            ))}
          </div>
          <div className="flow-legend">
            <span><i style={{ background: 'var(--in)' }} />Entradas</span>
            <span><i style={{ background: 'var(--out)' }} />Saídas</span>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">Para onde foi</span>
          </div>
          {segments.length ? (
            <div className="donut-wrap">
              <Donut segments={segments} total={stat.expense} label="no mês" />
              <div className="cat-legend">
                {top.slice(0, 5).map(c => (
                  <div key={c.id} className="cat-leg-row">
                    <span className="sw" style={{ background: c.cat.color }} />
                    <span className="nm">{c.cat.name}</span>
                    <span className="pc">{Math.round(c.total / stat.expense * 100)}%</span>
                    <span className="vl"><Money v={c.total} cents={false} /></span>
                  </div>
                ))}
              </div>
            </div>
          ) : <p style={{ color: 'var(--ink-3)' }}>Nenhuma despesa neste mês ainda.</p>}
        </div>
      </div>

      {/* ── CONTAS + PRÓXIMOS ── */}
      <div className="section grid-2">
        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">Suas contas</span>
            <span className="section-link" onClick={() => navigate('contas')}>Ver todas →</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {ACCOUNTS.map(a => (
              <div key={a.id} className="tx-row" style={{ cursor: 'pointer' }} onClick={() => navigate('contas')}>
                <div className="acct-logo" style={{ width: 34, height: 34, fontSize: 13, background: a.img ? 'var(--card-2)' : a.color.replace(')', ' / 0.15)'), color: a.color }}>{a.img ? <img src={a.img} alt="" /> : a.short}</div>
                <div className="tx-body">
                  <div className="tx-merchant">{a.name}</div>
                  <div className="tx-meta">{a.kind}</div>
                </div>
                <span className="tx-amount" style={{ color: 'var(--ink)' }}><Money v={a.balance} cents={false} /></span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">Próximos vencimentos</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {upcoming.map((u, i) => (
              <div key={i} className="tx-row">
                <div className="sub-logo" style={{ width: 34, height: 34, fontSize: 13, background: u.color }}>{u.img ? <img src={u.img} alt="" /> : u.short}</div>
                <div className="tx-body">
                  <div className="tx-merchant">{u.name}</div>
                  <div className="tx-meta">{u.kind === 'sub' ? 'assinatura' : u.kind === 'fin' ? 'financiamento' : 'empréstimo'} · dia {u.day} · {daysUntil(u.day)}</div>
                </div>
                <span className="tx-amount" style={{ color: 'var(--ink)' }}><Money v={u.amount} /></span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── ORÇAMENTOS PREVIEW ── */}
      <div className="section">
        <div className="section-head">
          <h2 className="section-title">Orçamentos</h2>
          <span className="section-link" onClick={() => navigate('orcamentos')}>Gerenciar →</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          {budgetPreview.map(b => {
            const pct = Math.min(100, Math.round(b.spent / b.limit * 100));
            const over = b.spent > b.limit;
            return (
              <div key={b.catId} className="panel" style={{ padding: '16px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <CatBadge catId={b.catId} size={30} />
                  <span style={{ fontSize: 13.5, fontWeight: 600 }}>{b.cat.name}</span>
                  <span className="amount" style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-3)' }}>{pct}%</span>
                </div>
                <div className="budget-track">
                  <i style={{ width: pct + '%', background: over ? 'var(--out)' : b.cat.color }} />
                </div>
                <div className="budget-foot" style={{ marginTop: 7 }}>
                  <span className="amount"><Money v={b.spent} cents={false} /> de <Money v={b.limit} cents={false} /></span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── TRANSAÇÕES RECENTES ── */}
      <div className="section">
        <div className="section-head">
          <h2 className="section-title">Transações recentes</h2>
          <span className="section-link" onClick={() => navigate('transacoes')}>Ver extrato →</span>
        </div>
        <TxList list={recent} onDelete={onDeleteTx} />
      </div>
    </div>
  );
}

Object.assign(window, { Dashboard });
