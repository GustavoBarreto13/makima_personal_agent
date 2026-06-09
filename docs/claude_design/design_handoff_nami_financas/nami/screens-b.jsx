/* ─────────────────────────────────────────────────────────────────────────
   Nami · Finanças — telas B: Orçamentos, Assinaturas, Empréstimos,
   Financiamentos  (com CRUD)
   ───────────────────────────────────────────────────────────────────────── */

const SUB_COLORS = [
  'oklch(0.52 0.20 22)', 'oklch(0.62 0.16 150)', 'oklch(0.55 0.02 250)', 'oklch(0.58 0.14 240)',
  'oklch(0.55 0.08 175)', 'oklch(0.66 0.16 60)', 'oklch(0.45 0.02 60)', 'oklch(0.58 0.16 320)',
];

/* ════ ORÇAMENTOS ════════════════════════════════════════════════════════ */
function Orcamentos({ monthKey: mk, refresh, onToast }) {
  const [adding, setAdding] = React.useState(false);
  const stat = monthStats(mk);
  const rows = BUDGETS.map(b => ({ ...b, cat: CAT[b.catId], spent: stat.byCat[b.catId] || 0 }));
  const totalLimit = rows.reduce((a, b) => a + b.limit, 0) || 1;
  const totalSpent = rows.reduce((a, b) => a + b.spent, 0);
  const totalPct = Math.min(100, Math.round(totalSpent / totalLimit * 100));

  const freeCats = CATEGORIES.filter(c => c.kind === 'out' && !BUDGETS.some(b => b.catId === c.id));

  const addBudget = (v) => {
    BUDGETS.push({ catId: v.catId, limit: v.limit });
    onToast('Orçamento criado'); refresh();
  };
  const removeBudget = (catId) => {
    const i = BUDGETS.findIndex(b => b.catId === catId);
    if (i >= 0) { BUDGETS.splice(i, 1); onToast('Orçamento removido'); refresh(); }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Orçamentos</h1>
          <p className="page-sub">{monthLabel(mk)} · limites por categoria</p>
        </div>
        {freeCats.length > 0 && <button className="add-btn" onClick={() => setAdding(true)}><Icon name="plus" /> Novo orçamento</button>}
      </div>

      <div className="panel" style={{ marginTop: 24 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <div className="modal-label" style={{ marginBottom: 6 }}>Gasto / orçado no mês</div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 30, fontWeight: 700, letterSpacing: '-0.03em' }}>
              <span className="amount"><span style={{ color: totalSpent > totalLimit ? 'var(--out)' : 'var(--ink)' }}>R$ {fmtBRL(totalSpent, { cents: false })}</span></span>
              <span style={{ fontSize: 18, color: 'var(--ink-3)', fontWeight: 600 }}> / <span className="amount">R$ {fmtBRL(totalLimit, { cents: false })}</span></span>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: 26, fontWeight: 700, color: totalPct >= 100 ? 'var(--out)' : 'var(--tang)' }}>{totalPct}%</div>
            <div style={{ fontSize: 12, color: 'var(--ink-3)' }} className="amount">restam R$ {fmtBRL(Math.max(0, totalLimit - totalSpent), { cents: false })}</div>
          </div>
        </div>
        <div className="budget-track" style={{ height: 10 }}>
          <i style={{ width: totalPct + '%', background: totalPct >= 100 ? 'var(--out)' : 'linear-gradient(90deg, var(--tang), var(--tang-bright))' }} />
        </div>
      </div>

      <div className="budget-list">
        {rows.map(b => {
          const pct = Math.round(b.spent / b.limit * 100);
          const over = b.spent > b.limit;
          const remaining = b.limit - b.spent;
          return (
            <div key={b.catId} className="budget-row">
              <div className="budget-top">
                <div className="budget-ico" style={{ background: b.cat.color.replace(')', ' / 0.14)'), color: b.cat.color }}>
                  <Icon name={b.cat.icon} />
                </div>
                <span className="budget-name">{b.cat.name}</span>
                <div className="budget-nums">
                  <span className="spent amount" style={{ color: over ? 'var(--out)' : 'var(--ink)' }}>R$ {fmtBRL(b.spent, { cents: false })}</span>
                  <span className="lim amount"> / R$ {fmtBRL(b.limit, { cents: false })}</span>
                </div>
                <button className="del-btn" style={{ marginLeft: 10 }} title="Remover orçamento" onClick={() => removeBudget(b.catId)}><Icon name="trash" /></button>
              </div>
              <div className="budget-track">
                <i style={{ width: Math.min(100, pct) + '%', background: over ? 'var(--out)' : (pct > 85 ? 'var(--gold)' : b.cat.color) }} />
              </div>
              <div className="budget-foot">
                <span>{pct}% usado</span>
                {over
                  ? <span className="over amount">passou R$ {fmtBRL(-remaining, { cents: false })}</span>
                  : <span className="ok amount">restam R$ {fmtBRL(remaining, { cents: false })}</span>}
              </div>
            </div>
          );
        })}
        {rows.length === 0 && <div className="empty"><Icon name="target" /><div>Nenhum orçamento criado ainda.</div></div>}
      </div>

      <FormModal open={adding} title="Novo orçamento" submitLabel="Criar orçamento"
        fields={[
          { key: 'catId', label: 'Categoria', type: 'select', default: freeCats[0]?.id, options: freeCats.map(c => ({ value: c.id, label: c.name })) },
          { key: 'limit', label: 'Limite mensal', type: 'money', required: true },
        ]}
        onClose={() => setAdding(false)} onSave={addBudget} />
    </div>
  );
}

/* ════ ASSINATURAS ═══════════════════════════════════════════════════════ */
function Assinaturas({ refresh, onToast }) {
  const [adding, setAdding] = React.useState(false);
  const monthlyTotal = SUBSCRIPTIONS.reduce((a, s) => a + s.amount, 0);
  const yearlyTotal = monthlyTotal * 12;
  const sorted = [...SUBSCRIPTIONS].sort((a, b) => {
    const today = new Date(TODAY).getDate();
    return ((a.nextDay - today + 31) % 31) - ((b.nextDay - today + 31) % 31);
  });

  const addSub = (v) => {
    const id = 'sub' + Date.now();
    SUBSCRIPTIONS.push({
      id, name: v.name, amount: v.amount, cycle: 'mensal',
      nextDay: Math.min(28, Math.max(1, Number(v.nextDay) || 1)), catId: v.catId, color: v.color, img: v.img || null,
      short: v.name.slice(0, 1).toUpperCase(),
    });
    onToast('Assinatura adicionada'); refresh();
  };
  const removeSub = (id) => {
    const i = SUBSCRIPTIONS.findIndex(s => s.id === id);
    if (i >= 0) { SUBSCRIPTIONS.splice(i, 1); onToast('Assinatura removida'); refresh(); }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Assinaturas</h1>
          <p className="page-sub">{SUBSCRIPTIONS.length} ativas · recorrência mensal</p>
        </div>
        <button className="add-btn" onClick={() => setAdding(true)}><Icon name="plus" /> Nova assinatura</button>
      </div>

      <div className="stat-row" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="stat-card">
          <div className="stat-label"><span className="dot" style={{ background: 'var(--tang)' }} /> Por mês</div>
          <div className="stat-value"><span className="cur">R$</span>{fmtBRL(monthlyTotal, { cents: false })}</div>
          <div className="stat-foot">debitado todo mês</div>
        </div>
        <div className="stat-card">
          <div className="stat-label"><span className="dot" style={{ background: 'var(--sea)' }} /> Por ano</div>
          <div className="stat-value"><span className="cur">R$</span>{fmtBRL(yearlyTotal, { cents: false })}</div>
          <div className="stat-foot">projeção em 12 meses</div>
        </div>
        <div className="stat-card">
          <div className="stat-label"><span className="dot" style={{ background: 'var(--out)' }} /> Próxima</div>
          <div className="stat-value" style={{ fontSize: 22 }}>{sorted[0] ? sorted[0].name : '—'}</div>
          <div className="stat-foot">{sorted[0] ? `dia ${sorted[0].nextDay} · ${daysUntil(sorted[0].nextDay)}` : 'nenhuma'}</div>
        </div>
      </div>

      <div className="sub-list">
        {sorted.map(s => (
          <div key={s.id} className="sub-row">
            <div className="sub-logo" style={{ background: s.color }}>{s.img ? <img src={s.img} alt="" /> : s.short}</div>
            <div className="sub-info">
              <div className="sub-name">{s.name}</div>
              <div className="sub-meta">{CAT[s.catId]?.name || 'Assinaturas'} · cobra no cartão</div>
            </div>
            <div className="sub-next">
              <div className="when">dia {s.nextDay}</div>
              <div className="days">{daysUntil(s.nextDay)}</div>
            </div>
            <div className="sub-amount">
              <Money v={s.amount} />
              <span className="cyc">/mês</span>
            </div>
            <button className="del-btn" title="Cancelar assinatura" onClick={() => removeSub(s.id)}><Icon name="trash" /></button>
          </div>
        ))}
      </div>

      <FormModal open={adding} title="Nova assinatura" submitLabel="Adicionar"
        fields={[
          { key: 'name', label: 'Serviço', type: 'text', placeholder: 'Ex: Disney+, YouTube Premium…', required: true },
          { key: 'amount', label: 'Valor mensal', type: 'money', required: true },
          { key: 'nextDay', label: 'Dia da cobrança', type: 'number', placeholder: '15' },
          { key: 'catId', label: 'Categoria', type: 'select', default: 'lazer', options: CATEGORIES.filter(c => c.kind === 'out').map(c => ({ value: c.id, label: c.name })) },
          { key: 'color', label: 'Cor', type: 'color', default: SUB_COLORS[0], options: SUB_COLORS },
          { key: 'img', label: 'Ícone — upload ou link (opcional)', type: 'image', shape: 'rounded', colorKey: 'color' },
        ]}
        onClose={() => setAdding(false)} onSave={addSub} />
    </div>
  );
}

/* ── Cartão de empréstimo / financiamento (compartilhado) ───────────────── */
function LoanCard({ l, variant, onDelete }) {
  const instVal = l.total / l.installments;
  const remaining = instVal * (l.installments - l.paid);
  const pct = Math.round(l.paid / l.installments * 100);
  const isFin = variant === 'financing';
  const accent = isFin ? 'var(--out)' : (l.dir === 'lent' ? 'var(--in)' : 'var(--out)');
  return (
    <div className="loan-card" style={{ position: 'relative' }}>
      <button className="card-del" title="Remover" onClick={() => onDelete(l.id)}><Icon name="trash" /></button>
      <div className="loan-top">
        {isFin
          ? <span className="loan-dir borrowed">financiamento</span>
          : <span className={'loan-dir ' + l.dir}>{l.dir === 'lent' ? 'emprestou' : 'você deve'}</span>}
        <span className="loan-person">{l.person}</span>
      </div>
      <div className="loan-remaining" style={{ color: accent }}><span className="cur">R$</span>{fmtBRL(remaining, { cents: false })}</div>
      <div className="loan-of amount">
        de R$ {fmtBRL(l.total, { cents: false })} · parcela de R$ {fmtBRL(instVal)}
        {isFin && l.rate ? ` · ${l.rate}` : ''}
      </div>

      <div className="loan-track">
        <i style={{ width: pct + '%', background: accent }} />
        <i style={{ width: (100 - pct) + '%', background: 'var(--line-2)' }} />
      </div>

      <div className="loan-dots">
        {Array.from({ length: l.installments }).map((_, i) => (
          <div key={i} className={'loan-dot ' + (i < l.paid ? 'paid' : 'due')}>{i < l.paid ? '✓' : i + 1}</div>
        ))}
      </div>

      <div className="loan-foot">
        <span>{l.paid}/{l.installments} parcelas{isFin && l.lender ? ` · ${l.lender}` : ''}</span>
        {l.paid < l.installments && <span>próxima dia {l.nextDay} · {daysUntil(l.nextDay)}</span>}
      </div>
      {l.note && <p style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 12, fontStyle: 'italic' }}>{l.note}</p>}
    </div>
  );
}

/* ════ EMPRÉSTIMOS (pessoa a pessoa) ═════════════════════════════════════ */
function Emprestimos({ refresh, onToast }) {
  const [adding, setAdding] = React.useState(false);
  const toReceive = LOANS.filter(l => l.dir === 'lent').reduce((a, l) => a + l.total * (l.installments - l.paid) / l.installments, 0);
  const toPay = LOANS.filter(l => l.dir === 'borrowed').reduce((a, l) => a + l.total * (l.installments - l.paid) / l.installments, 0);

  const addLoan = (v) => {
    const id = 'loan' + Date.now();
    LOANS.push({
      id, dir: v.dir, person: v.person, total: v.total,
      installments: Math.max(1, Number(v.installments) || 1), paid: Math.max(0, Number(v.paid) || 0),
      nextDay: Math.min(28, Math.max(1, Number(v.nextDay) || 10)), note: v.note || '',
    });
    onToast('Empréstimo adicionado'); refresh();
  };
  const removeLoan = (id) => {
    const i = LOANS.findIndex(l => l.id === id);
    if (i >= 0) { LOANS.splice(i, 1); onToast('Empréstimo removido'); refresh(); }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Empréstimos</h1>
          <p className="page-sub">Dinheiro entre você e outras pessoas</p>
        </div>
        <button className="add-btn" onClick={() => setAdding(true)}><Icon name="plus" /> Novo empréstimo</button>
      </div>

      <div className="stat-row" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
        <div className="stat-card">
          <div className="stat-label"><span className="dot" style={{ background: 'var(--in)' }} /> A receber</div>
          <div className="stat-value pos"><span className="cur">R$</span>{fmtBRL(toReceive, { cents: false })}</div>
          <div className="stat-foot">{LOANS.filter(l => l.dir === 'lent').length} pessoa(s) te devem</div>
        </div>
        <div className="stat-card">
          <div className="stat-label"><span className="dot" style={{ background: 'var(--out)' }} /> A pagar</div>
          <div className="stat-value neg"><span className="cur">R$</span>{fmtBRL(toPay, { cents: false })}</div>
          <div className="stat-foot">você deve a {LOANS.filter(l => l.dir === 'borrowed').length} pessoa(s)</div>
        </div>
      </div>

      <div className="loan-grid">
        {LOANS.map(l => <LoanCard key={l.id} l={l} variant="loan" onDelete={removeLoan} />)}
        {LOANS.length === 0 && <div className="empty"><Icon name="handshake" /><div>Nenhum empréstimo registrado.</div></div>}
      </div>

      <FormModal open={adding} title="Novo empréstimo" submitLabel="Adicionar"
        fields={[
          { key: 'dir', label: 'Direção', type: 'segment', default: 'lent', options: [{ value: 'lent', label: 'Emprestei' }, { value: 'borrowed', label: 'Peguei emprestado' }] },
          { key: 'person', label: 'Pessoa', type: 'text', placeholder: 'Ex: João, Maria…', required: true },
          { key: 'total', label: 'Valor total', type: 'money', required: true },
          { key: 'installments', label: 'Parcelas', type: 'number', placeholder: '1' },
          { key: 'paid', label: 'Parcelas já pagas', type: 'number', placeholder: '0' },
          { key: 'nextDay', label: 'Dia do vencimento', type: 'number', placeholder: '15' },
          { key: 'note', label: 'Observação (opcional)', type: 'text', placeholder: 'Sobre o que foi?' },
        ]}
        onClose={() => setAdding(false)} onSave={addLoan} />
    </div>
  );
}

/* ════ FINANCIAMENTOS ════════════════════════════════════════════════════ */
function Financiamentos({ refresh, onToast }) {
  const [adding, setAdding] = React.useState(false);
  const totalDebt = FINANCINGS.reduce((a, l) => a + l.total * (l.installments - l.paid) / l.installments, 0);
  const monthlyDue = FINANCINGS.reduce((a, l) => a + (l.paid < l.installments ? l.total / l.installments : 0), 0);

  const addFin = (v) => {
    const id = 'fin' + Date.now();
    FINANCINGS.push({
      id, person: v.person, lender: v.lender || '', total: v.total,
      installments: Math.max(1, Number(v.installments) || 1), paid: Math.max(0, Number(v.paid) || 0),
      nextDay: Math.min(28, Math.max(1, Number(v.nextDay) || 10)), rate: v.rate || '', note: v.note || '',
    });
    onToast('Financiamento adicionado'); refresh();
  };
  const removeFin = (id) => {
    const i = FINANCINGS.findIndex(l => l.id === id);
    if (i >= 0) { FINANCINGS.splice(i, 1); onToast('Financiamento removido'); refresh(); }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Financiamentos</h1>
          <p className="page-sub">Parcelamentos e crédito em aberto</p>
        </div>
        <button className="add-btn" onClick={() => setAdding(true)}><Icon name="plus" /> Novo financiamento</button>
      </div>

      <div className="stat-row" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
        <div className="stat-card">
          <div className="stat-label"><span className="dot" style={{ background: 'var(--out)' }} /> Saldo devedor</div>
          <div className="stat-value neg"><span className="cur">R$</span>{fmtBRL(totalDebt, { cents: false })}</div>
          <div className="stat-foot">{FINANCINGS.length} contrato(s) em aberto</div>
        </div>
        <div className="stat-card">
          <div className="stat-label"><span className="dot" style={{ background: 'var(--tang)' }} /> Parcelas/mês</div>
          <div className="stat-value"><span className="cur">R$</span>{fmtBRL(monthlyDue, { cents: false })}</div>
          <div className="stat-foot">comprometido mensalmente</div>
        </div>
      </div>

      <div className="loan-grid">
        {FINANCINGS.map(l => <LoanCard key={l.id} l={l} variant="financing" onDelete={removeFin} />)}
        {FINANCINGS.length === 0 && <div className="empty"><Icon name="building" /><div>Nenhum financiamento em aberto.</div></div>}
      </div>

      <FormModal open={adding} title="Novo financiamento" submitLabel="Adicionar"
        fields={[
          { key: 'person', label: 'Descrição', type: 'text', placeholder: 'Ex: Carro, Apartamento…', required: true },
          { key: 'lender', label: 'Credor / banco', type: 'text', placeholder: 'Ex: Santander, Caixa…' },
          { key: 'total', label: 'Valor financiado', type: 'money', required: true },
          { key: 'installments', label: 'Parcelas', type: 'number', placeholder: '12' },
          { key: 'paid', label: 'Parcelas já pagas', type: 'number', placeholder: '0' },
          { key: 'nextDay', label: 'Dia do vencimento', type: 'number', placeholder: '10' },
          { key: 'rate', label: 'Taxa (opcional)', type: 'text', placeholder: 'Ex: 2,1% a.m.' },
        ]}
        onClose={() => setAdding(false)} onSave={addFin} />
    </div>
  );
}

Object.assign(window, { Orcamentos, Assinaturas, Emprestimos, Financiamentos, LoanCard, SUB_COLORS });
