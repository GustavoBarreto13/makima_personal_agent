/* ─────────────────────────────────────────────────────────────────────────
   Nami · Finanças — telas A: Transações, Contas, Cartões  (com CRUD)
   ───────────────────────────────────────────────────────────────────────── */

const ACCT_COLORS = [
  'oklch(0.52 0.18 300)', 'oklch(0.62 0.17 50)', 'oklch(0.50 0.14 250)',
  'oklch(0.40 0.03 250)', 'oklch(0.62 0.12 150)', 'oklch(0.58 0.15 10)', 'oklch(0.60 0.13 195)',
];
const CARD_GRADS = [
  'linear-gradient(135deg, oklch(0.42 0.16 300), oklch(0.30 0.10 290))',
  'linear-gradient(135deg, oklch(0.62 0.17 48), oklch(0.50 0.15 35))',
  'linear-gradient(135deg, oklch(0.46 0.12 250), oklch(0.32 0.08 250))',
  'linear-gradient(135deg, oklch(0.40 0.03 250), oklch(0.26 0.02 250))',
  'linear-gradient(135deg, oklch(0.52 0.14 160), oklch(0.38 0.09 160))',
];

/* ── Linha de transação (compartilhada) ─────────────────────────────────── */
function TxRow({ t, onDelete }) {
  const cat = CAT[t.catId] || CAT.outros;
  return (
    <div className="tx-row">
      <CatBadge catId={t.catId} />
      <div className="tx-body">
        <div className="tx-merchant">{t.merchant}</div>
        <div className="tx-meta">
          <span>{cat.name}</span>
          <span className="pill">{sourceName(t.source)}</span>
        </div>
      </div>
      <span className={'tx-amount ' + (t.type === 'in' ? 'in' : 'out')}>
        <Money v={t.amount} sign={t.type === 'in' ? 'in' : 'out'} />
      </span>
      {onDelete && (
        <button className="del-btn" title="Excluir transação" onClick={() => onDelete(t.id)}><Icon name="trash" /></button>
      )}
    </div>
  );
}

/* ── Lista agrupada por dia ─────────────────────────────────────────────── */
function TxList({ list, onDelete }) {
  if (!list.length) {
    return <div className="empty"><Icon name="receipt" /><div>Nenhuma transação por aqui.</div></div>;
  }
  const groups = [];
  list.forEach(t => {
    const last = groups[groups.length - 1];
    if (last && last.date === t.date) last.items.push(t);
    else groups.push({ date: t.date, items: [t] });
  });
  return (
    <div>
      {groups.map(g => {
        const net = g.items.reduce((a, t) => a + (t.type === 'in' ? t.amount : -t.amount), 0);
        return (
          <div key={g.date}>
            <div className="tx-day-label">
              <span>{relDay(g.date)} · {fmtDay(g.date)}</span>
              <span className="sum amount" style={{ color: net >= 0 ? 'var(--in)' : 'var(--ink-3)' }}>
                {net >= 0 ? '+' : '−'} R$ {fmtBRL(net)}
              </span>
            </div>
            <div className="tx-list">
              {g.items.map(t => <TxRow key={t.id} t={t} onDelete={onDelete} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ════ TRANSAÇÕES ════════════════════════════════════════════════════════ */
function Transacoes({ monthKey: mk, query, onQuickSave, onToast, openAdd, onDeleteTx }) {
  const [filter, setFilter] = React.useState('todos');
  const [catFilter, setCatFilter] = React.useState(null);

  let list = txInMonth(mk);
  if (filter === 'in') list = list.filter(t => t.type === 'in');
  if (filter === 'out') list = list.filter(t => t.type === 'out');
  if (catFilter) list = list.filter(t => t.catId === catFilter);
  if (query) {
    const q = query.toLowerCase();
    list = list.filter(t => t.merchant.toLowerCase().includes(q) || (CAT[t.catId]?.name || '').toLowerCase().includes(q));
  }

  const presentCats = [...new Set(txInMonth(mk).filter(t => t.type === 'out').map(t => t.catId))]
    .map(id => CAT[id]).filter(Boolean);

  const inSum = list.filter(t => t.type === 'in').reduce((a, t) => a + t.amount, 0);
  const outSum = list.filter(t => t.type === 'out').reduce((a, t) => a + t.amount, 0);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Transações</h1>
          <p className="page-sub">{monthLabel(mk)} · {list.length} lançamentos · entrou <b style={{ color: 'var(--in)' }}><Money v={inSum} cents={false} /></b>, saiu <b style={{ color: 'var(--out)' }}><Money v={outSum} cents={false} /></b></p>
        </div>
        <button className="add-btn" onClick={openAdd}><Icon name="plus" /> Adicionar</button>
      </div>

      <QuickAdd onSave={onQuickSave} onToast={onToast} />

      <div className="toolbar">
        <div className="chips">
          {[['todos', 'Tudo'], ['out', 'Despesas'], ['in', 'Receitas']].map(([id, lb]) => (
            <button key={id} className={'chip' + (filter === id ? ' active' : '')} onClick={() => setFilter(id)}>{lb}</button>
          ))}
        </div>
        <div className="toolbar-spacer" />
        <div className="chips">
          {presentCats.map(c => (
            <button key={c.id} className={'chip' + (catFilter === c.id ? ' active' : '')}
                    onClick={() => setCatFilter(catFilter === c.id ? null : c.id)}>
              <span className="sw" style={{ background: c.color }} />{c.name}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 8 }}>
        <TxList list={list} onDelete={onDeleteTx} />
      </div>
    </div>
  );
}

/* ════ CONTAS ════════════════════════════════════════════════════════════ */
function Contas({ monthKey: mk, navigate, refresh, onToast }) {
  const [adding, setAdding] = React.useState(false);

  const movByAcct = {};
  txInMonth(mk).forEach(t => {
    if (sourceIsCard(t.source)) return;
    if (!movByAcct[t.source]) movByAcct[t.source] = { in: 0, out: 0 };
    movByAcct[t.source][t.type] += t.amount;
  });

  const addAccount = (v) => {
    const id = 'acc' + Date.now();
    const obj = {
      id, name: v.name, kind: v.kind, balance: v.balance, color: v.color, img: v.img || null,
      short: (v.short || v.name.slice(0, 2)).slice(0, 2),
    };
    ACCOUNTS.push(obj); ACC[id] = obj; recomputeWorth();
    onToast('Conta adicionada'); refresh();
  };
  const removeAccount = (id) => {
    const i = ACCOUNTS.findIndex(a => a.id === id);
    if (i >= 0) { ACCOUNTS.splice(i, 1); delete ACC[id]; recomputeWorth(); onToast('Conta removida'); refresh(); }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Contas</h1>
          <p className="page-sub">Patrimônio total <b><Money v={NET_WORTH} cents={false} /></b> · disponível <b><Money v={LIQUID} cents={false} /></b></p>
        </div>
        <button className="add-btn" onClick={() => setAdding(true)}><Icon name="plus" /> Nova conta</button>
      </div>

      <div className="acct-grid">
        {ACCOUNTS.map(a => {
          const mov = movByAcct[a.id] || { in: 0, out: 0 };
          return (
            <div key={a.id} className="acct-card">
              <button className="card-del" title="Remover conta" onClick={() => removeAccount(a.id)}><Icon name="trash" /></button>
              <div className="accent-bar" style={{ background: a.color }} />
              <div className="acct-top">
                <div className="acct-logo" style={{ background: a.img ? 'var(--card-2)' : a.color.replace(')', ' / 0.15)'), color: a.color }}>{a.img ? <img src={a.img} alt="" /> : a.short}</div>
                <div>
                  <div className="acct-name">{a.name}</div>
                  <div className="acct-kind">{a.kind}</div>
                </div>
              </div>
              <div className="acct-balance"><span className="cur">R$</span>{fmtBRL(a.balance, { cents: false })}</div>
              <div className="acct-foot">
                <span>↑ <span className="amount" style={{ color: 'var(--in)' }}>{fmtBRL(mov.in, { cents: false })}</span></span>
                <span>↓ <span className="amount" style={{ color: 'var(--out)' }}>{fmtBRL(mov.out, { cents: false })}</span></span>
                <span style={{ color: 'var(--ink-4)' }}>no mês</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="section">
        <div className="panel">
          <div className="panel-head"><span className="panel-title">Composição do patrimônio</span></div>
          <div style={{ display: 'flex', height: 14, borderRadius: 999, overflow: 'hidden', marginBottom: 16 }}>
            {ACCOUNTS.map(a => (
              <div key={a.id} title={a.name} style={{ width: (a.balance / NET_WORTH * 100) + '%', background: a.color }} />
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
            {ACCOUNTS.map(a => (
              <div key={a.id} className="cat-leg-row">
                <span className="sw" style={{ background: a.color }} />
                <span className="nm">{a.name}</span>
                <span className="pc">{Math.round(a.balance / NET_WORTH * 100)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <FormModal open={adding} title="Nova conta" submitLabel="Adicionar conta"
        fields={[
          { key: 'name', label: 'Nome da conta', type: 'text', placeholder: 'Ex: Inter, C6, Banco do Brasil…', required: true },
          { key: 'kind', label: 'Tipo', type: 'select', default: 'Conta corrente', options: ['Conta corrente', 'Poupança', 'Investimentos', 'Dinheiro'] },
          { key: 'balance', label: 'Saldo atual', type: 'money', required: true },
          { key: 'short', label: 'Sigla (2 letras)', type: 'text', placeholder: 'Ex: In' },
          { key: 'color', label: 'Cor', type: 'color', default: ACCT_COLORS[0], options: ACCT_COLORS },
          { key: 'img', label: 'Ícone — upload ou link (opcional)', type: 'image', shape: 'circle', colorKey: 'color' },
        ]}
        onClose={() => setAdding(false)} onSave={addAccount} />
    </div>
  );
}

/* ════ CARTÕES ═══════════════════════════════════════════════════════════ */
function Cartoes({ monthKey: mk, refresh, onToast, onDeleteTx }) {
  const [adding, setAdding] = React.useState(false);

  const addCard = (v) => {
    const id = 'card' + Date.now();
    const obj = {
      id, name: v.name, brand: v.brand, last4: (v.last4 || '0000').slice(-4),
      limit: v.limit, closeDay: Number(v.closeDay) || 1, dueDay: Number(v.dueDay) || 10, grad: v.grad,
    };
    CARDS.push(obj); CARD[id] = obj; onToast('Cartão adicionado'); refresh();
  };
  const removeCard = (id) => {
    const i = CARDS.findIndex(c => c.id === id);
    if (i >= 0) { CARDS.splice(i, 1); delete CARD[id]; onToast('Cartão removido'); refresh(); }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Cartões</h1>
          <p className="page-sub">Fatura aberta · {monthLabel(mk)}</p>
        </div>
        <button className="add-btn" onClick={() => setAdding(true)}><Icon name="plus" /> Novo cartão</button>
      </div>

      <div className="cc-grid">
        {CARDS.map(c => {
          const invoice = cardInvoice(c.id, mk);
          const usage = Math.min(100, Math.round(invoice / c.limit * 100));
          const recent = txInMonth(mk).filter(t => t.source === c.id).slice(0, 4);
          return (
            <div key={c.id} className="cc-card">
              <div className="cc-plastic" style={{ background: c.grad }}>
                <button className="card-del" style={{ background: 'oklch(1 0 0 / 0.16)', borderColor: 'transparent', color: '#fff' }} title="Remover cartão" onClick={() => removeCard(c.id)}><Icon name="trash" /></button>
                <div className="cc-top">
                  <span className="cc-bank">{c.name}</span>
                  <span className="cc-chip" />
                </div>
                <div className="cc-num priv">•••• •••• •••• {c.last4}</div>
                <div className="cc-row">
                  <div><div className="k">Titular</div><div className="v">M. KISHIBE</div></div>
                  <div style={{ textAlign: 'right' }}><div className="k">{c.brand}</div></div>
                </div>
              </div>

              <div className="cc-info">
                <div className="cc-fatura-row">
                  <div>
                    <div className="modal-label" style={{ marginBottom: 4 }}>Fatura atual</div>
                    <div className="cc-fatura"><span className="cur">R$ </span><span className="amount">{fmtBRL(invoice)}</span></div>
                  </div>
                  <button className="btn btn-ghost" style={{ padding: '8px 14px', fontSize: 12.5 }}>Pagar fatura</button>
                </div>
                <div className="cc-limit-track">
                  <i style={{ width: usage + '%', background: usage > 80 ? 'var(--out)' : 'var(--tang)' }} />
                </div>
                <div className="cc-limit-meta">
                  <span className="amount">Usado R$ {fmtBRL(invoice, { cents: false })}</span>
                  <span>Limite <span className="amount">R$ {fmtBRL(c.limit, { cents: false })}</span></span>
                </div>
                <div className="cc-dates">
                  <div className="cc-date"><div className="k">Fecha</div><div className="v">dia {c.closeDay}</div></div>
                  <div className="cc-date"><div className="k">Vence</div><div className="v">dia {c.dueDay}</div></div>
                  <div className="cc-date"><div className="k">Disponível</div><div className="v amount">R$ {fmtBRL(c.limit - invoice, { cents: false })}</div></div>
                </div>

                {recent.length > 0 && (
                  <div style={{ marginTop: 16 }}>
                    <div className="modal-label" style={{ marginBottom: 6 }}>Últimos lançamentos</div>
                    <div className="tx-list">
                      {recent.map(t => <TxRow key={t.id} t={t} onDelete={onDeleteTx} />)}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <FormModal open={adding} title="Novo cartão" submitLabel="Adicionar cartão"
        fields={[
          { key: 'name', label: 'Nome do cartão', type: 'text', placeholder: 'Ex: Inter Gold, C6 Carbon…', required: true },
          { key: 'brand', label: 'Bandeira', type: 'select', default: 'Mastercard', options: ['Mastercard', 'Visa', 'Elo', 'American Express'] },
          { key: 'last4', label: 'Final do cartão', type: 'text', placeholder: '0000' },
          { key: 'limit', label: 'Limite', type: 'money', required: true },
          { key: 'closeDay', label: 'Dia do fechamento', type: 'number', placeholder: '28' },
          { key: 'dueDay', label: 'Dia do vencimento', type: 'number', placeholder: '5' },
          { key: 'grad', label: 'Cor', type: 'color', default: CARD_GRADS[0], options: CARD_GRADS },
        ]}
        onClose={() => setAdding(false)} onSave={addCard} />
    </div>
  );
}

Object.assign(window, { TxRow, TxList, Transacoes, Contas, Cartoes, ACCT_COLORS, CARD_GRADS });
