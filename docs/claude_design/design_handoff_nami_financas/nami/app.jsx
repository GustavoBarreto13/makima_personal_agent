/* ─────────────────────────────────────────────────────────────────────────
   Nami · Finanças — App (shell, sidebar, roteamento, mês, tweaks, lançamento)
   ───────────────────────────────────────────────────────────────────────── */

const NAV = [
  { group: 'Visão geral', items: [
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  ]},
  { group: 'Dia a dia', items: [
    { id: 'transacoes', label: 'Transações', icon: 'receipt' },
    { id: 'contas',     label: 'Contas',     icon: 'bank' },
    { id: 'cartoes',    label: 'Cartões',    icon: 'card' },
  ]},
  { group: 'Planejamento', items: [
    { id: 'orcamentos',    label: 'Orçamentos',    icon: 'target' },
    { id: 'assinaturas',   label: 'Assinaturas',   icon: 'repeat' },
    { id: 'emprestimos',   label: 'Empréstimos',   icon: 'handshake' },
    { id: 'financiamentos',label: 'Financiamentos',icon: 'building' },
  ]},
];
const TITLES = {
  dashboard: 'Dashboard', transacoes: 'Transações', contas: 'Contas', cartoes: 'Cartões',
  orcamentos: 'Orçamentos', assinaturas: 'Assinaturas', emprestimos: 'Empréstimos', financiamentos: 'Financiamentos',
};
const MONTH_SCOPED = ['dashboard', 'transacoes', 'contas', 'cartoes', 'orcamentos'];

const PALETTE_MAP = {
  '#EF8B3D': { base:'oklch(0.685 0.176 52)',  deep:'oklch(0.585 0.165 47)', bright:'oklch(0.77 0.155 60)' },  /* tangerina */
  '#3B82C4': { base:'oklch(0.56 0.104 234)',  deep:'oklch(0.46 0.100 236)', bright:'oklch(0.68 0.105 232)' }, /* maré */
  '#E0524A': { base:'oklch(0.595 0.165 24)',  deep:'oklch(0.50 0.155 24)',  bright:'oklch(0.70 0.150 30)' },  /* coral */
  '#C9A227': { base:'oklch(0.70 0.130 80)',   deep:'oklch(0.60 0.120 76)',  bright:'oklch(0.80 0.120 84)' },  /* ouro */
};

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "tema": "Claro",
  "densidade": "Confortável",
  "acento": "#EF8B3D",
  "privacidade": false
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const initialView = (() => {
    const h = (window.location.hash || '').replace('#', '');
    return TITLES[h] ? h : 'dashboard';
  })();
  const [view, setView] = React.useState(initialView);
  const [monthIdx, setMonthIdx] = React.useState(MONTHS.length - 1);
  const [query, setQuery] = React.useState('');
  const [addOpen, setAddOpen] = React.useState(false);
  const [toast, setToast] = React.useState('');
  const [, setVersion] = React.useState(0);
  const scrollRef = React.useRef(null);

  const selectedMonth = MONTHS[monthIdx];

  const navigate = React.useCallback((v) => {
    setView(v);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    if (v !== 'transacoes') setQuery('');
  }, []);

  // tema
  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', t.tema === 'Escuro' ? 'dark' : 'light');
  }, [t.tema]);
  // densidade
  React.useEffect(() => {
    document.querySelector('.nm-app')?.setAttribute('data-density', t.densidade === 'Compacto' ? 'compacto' : 'confortavel');
  }, [t.densidade]);
  // privacidade
  React.useEffect(() => {
    document.querySelector('.nm-app')?.setAttribute('data-privacy', t.privacidade ? 'on' : 'off');
  }, [t.privacidade]);
  // acento
  React.useEffect(() => {
    const p = PALETTE_MAP[t.acento] || PALETTE_MAP['#EF8B3D'];
    const root = document.documentElement;
    root.style.setProperty('--tang', p.base);
    root.style.setProperty('--tang-deep', p.deep);
    root.style.setProperty('--tang-bright', p.bright);
    root.style.setProperty('--tang-tint', p.base.replace(')', ' / 0.12)'));
    root.style.setProperty('--tang-tint-2', p.base.replace(')', ' / 0.20)'));
  }, [t.acento]);

  // toast auto-some
  React.useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(''), 2600);
    return () => clearTimeout(id);
  }, [toast]);

  // atalho A abre o modal
  React.useEffect(() => {
    const onKey = (e) => {
      if (addOpen) return;
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.key === 'a' || e.key === 'A' || e.key === '+') { e.preventDefault(); setAddOpen(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [addOpen]);

  const addTransaction = (tx) => {
    const item = { id: 'u' + Date.now(), ...tx };
    TRANSACTIONS.unshift(item);
    TRANSACTIONS.sort((a, b) => b.date.localeCompare(a.date) || (b.id > a.id ? 1 : -1));
    // saldo da conta (não cartão)
    if (!sourceIsCard(item.source) && ACC[item.source]) {
      ACC[item.source].balance += (item.type === 'in' ? item.amount : -item.amount);
      window.NET_WORTH = ACCOUNTS.reduce((a, x) => a + x.balance, 0);
      window.LIQUID = ACCOUNTS.filter(a => a.kind !== 'Investimentos').reduce((a, x) => a + x.balance, 0);
    }
    // atualiza fluxo de caixa
    CASHFLOW.forEach(c => { const st = monthStats(c.key); c.in = st.income; c.out = st.expense; c.net = st.net; });
    // pula para o mês da transação
    const mk = item.date.slice(0, 7);
    const mi = MONTHS.indexOf(mk);
    if (mi >= 0) setMonthIdx(mi);
    setToast(`${item.type === 'in' ? 'Receita' : 'Despesa'} de R$ ${fmtBRL(item.amount)} lançada`);
    setVersion(v => v + 1);
  };

  const stat = monthStats(selectedMonth);
  const faturaTotal = CARDS.reduce((a, c) => a + cardInvoice(c.id), 0);
  const subTotal = SUBSCRIPTIONS.reduce((a, s) => a + s.amount, 0);

  const refresh = React.useCallback(() => setVersion(v => v + 1), []);

  const deleteTransaction = (id) => {
    const i = TRANSACTIONS.findIndex(t => t.id === id);
    if (i < 0) return;
    const item = TRANSACTIONS[i];
    TRANSACTIONS.splice(i, 1);
    if (!sourceIsCard(item.source) && ACC[item.source]) {
      ACC[item.source].balance -= (item.type === 'in' ? item.amount : -item.amount);
      recomputeWorth();
    }
    CASHFLOW.forEach(c => { const st = monthStats(c.key); c.in = st.income; c.out = st.expense; c.net = st.net; });
    setToast('Transação excluída');
    setVersion(v => v + 1);
  };

  const renderView = () => {
    switch (view) {
      case 'dashboard':     return <Dashboard monthKey={selectedMonth} stat={stat} navigate={navigate} openAdd={() => setAddOpen(true)} onQuickSave={addTransaction} onToast={setToast} onDeleteTx={deleteTransaction} />;
      case 'transacoes':    return <Transacoes monthKey={selectedMonth} query={query} onQuickSave={addTransaction} onToast={setToast} openAdd={() => setAddOpen(true)} onDeleteTx={deleteTransaction} />;
      case 'contas':        return <Contas monthKey={selectedMonth} navigate={navigate} refresh={refresh} onToast={setToast} />;
      case 'cartoes':       return <Cartoes monthKey={selectedMonth} refresh={refresh} onToast={setToast} onDeleteTx={deleteTransaction} />;
      case 'orcamentos':    return <Orcamentos monthKey={selectedMonth} refresh={refresh} onToast={setToast} />;
      case 'assinaturas':   return <Assinaturas refresh={refresh} onToast={setToast} />;
      case 'emprestimos':   return <Emprestimos refresh={refresh} onToast={setToast} />;
      case 'financiamentos':return <Financiamentos refresh={refresh} onToast={setToast} />;
      default:              return <Dashboard monthKey={selectedMonth} stat={stat} navigate={navigate} openAdd={() => setAddOpen(true)} onQuickSave={addTransaction} onToast={setToast} onDeleteTx={deleteTransaction} />;
    }
  };

  const navAmt = (id) => {
    if (id === 'contas')      return { v: <Money v={NET_WORTH} cents={false} cur={false} />, cls: '' };
    if (id === 'cartoes')     return { v: <Money v={faturaTotal} cents={false} cur={false} />, cls: 'neg' };
    if (id === 'assinaturas') return { v: <Money v={subTotal} cents={false} cur={false} />, cls: '' };
    return null;
  };

  return (
    <div className="nm-app" data-density={t.densidade === 'Compacto' ? 'compacto' : 'confortavel'} data-privacy={t.privacidade ? 'on' : 'off'}>

      {/* ── Sidebar ── */}
      <aside className="nm-side">
        <div className="side-brand">
          <div className="brand-mark"><img src="nami/nami.jpg" alt="Nami" /></div>
          <div className="brand-text">
            <div className="brand-name">Nami</div>
            <div className="brand-role">Finanças</div>
          </div>
        </div>
        <button className="side-add" onClick={() => setAddOpen(true)}>
          <Icon name="plus" /> <span>Nova transação</span> <kbd>A</kbd>
        </button>
        <nav className="side-nav">
          {NAV.map(grp => (
            <div key={grp.group}>
              <div className="nav-group-label">{grp.group}</div>
              {grp.items.map(n => {
                const amt = navAmt(n.id);
                return (
                  <button key={n.id} className={'nav-item' + (view === n.id ? ' active' : '')} onClick={() => navigate(n.id)}>
                    <Icon name={n.icon} /> <span>{n.label}</span>
                    {amt && <span className={'nav-amt ' + amt.cls}>{amt.v}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="side-foot">
          <a className="back-makima" href="Makima Diário.html"><span className="dot" /> <span>Voltar à Makima</span></a>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="nm-main">
        <div className="nm-topbar">
          <span className="topbar-title">{TITLES[view]}</span>
          <div className="topbar-spacer" />

          {MONTH_SCOPED.includes(view) && (
            <div className="month-switch">
              <button className="month-btn" disabled={monthIdx === 0} onClick={() => setMonthIdx(i => Math.max(0, i - 1))}><Icon name="chevL" /></button>
              <span className="mlabel">{MONTH_NAMES[Number(selectedMonth.split('-')[1]) - 1]} {selectedMonth.split('-')[0]}</span>
              <button className="month-btn" disabled={monthIdx === MONTHS.length - 1} onClick={() => setMonthIdx(i => Math.min(MONTHS.length - 1, i + 1))}><Icon name="chevR" /></button>
            </div>
          )}

          <div className="search">
            <Icon name="search" />
            <input value={query} placeholder="Buscar transação…"
                   onChange={e => { setQuery(e.target.value); if (e.target.value && view !== 'transacoes') navigate('transacoes'); }} />
          </div>
        </div>

        <div className="nm-scroll" ref={scrollRef}>
          {renderView()}
        </div>
      </main>

      {/* ── Barra de resumo do mês ── */}
      <SummBar stat={stat} onAdd={() => setAddOpen(true)} />

      {/* ── Modal de lançamento ── */}
      <AddModal open={addOpen} onClose={() => setAddOpen(false)} onSave={addTransaction} defaultSource="nu-card" />

      <Toast message={toast} />

      {/* ── Tweaks ── */}
      <TweaksPanel title="Tweaks">
        <TweakSection label="Aparência" />
        <TweakRadio label="Tema" value={t.tema} options={['Claro', 'Escuro']} onChange={v => setTweak('tema', v)} />
        <TweakColor label="Cor de acento" value={t.acento}
                    options={['#EF8B3D', '#3B82C4', '#E0524A', '#C9A227']}
                    onChange={v => setTweak('acento', v)} />
        <TweakSection label="Extrato" />
        <TweakRadio label="Densidade" value={t.densidade} options={['Confortável', 'Compacto']} onChange={v => setTweak('densidade', v)} />
        <TweakSection label="Privacidade" />
        <TweakToggle label="Esconder valores" value={t.privacidade} onChange={v => setTweak('privacidade', v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
