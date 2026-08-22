/* ─────────────────────────────────────────────────────────────────────
   Yato · Viagens — telas B: Dossiê, Orçamento, Checklist
   ───────────────────────────────────────────────────────────────────── */

/* ════ DOSSIÊ DE MOBILIDADE ═════════════════════════════════════════ */
function Mobility({ initialKey, onCheck, onStart }) {
  const options = [
    { k: 'MG/Tiradentes', label: 'Tiradentes/MG' },
    { k: 'BA/Caraíva', label: 'Caraíva/BA' },
    { k: 'MG/Ouro Preto', label: 'Ouro Preto/MG' },
  ];
  const [key, setKey] = React.useState(initialKey || 'MG/Tiradentes');
  const dossier = DOSSIERS[key] || null;
  const uf = key.split('/')[0];
  const apps = APPS.filter(a => a.uf === uf || a.uf === 'BR');
  const strat = STRATEGY_LABEL[dossier && dossier.strategy] || { txt: 'a definir', emoji: '•' };

  return (
    <div className="page">
      <div className="section-head" style={{ marginTop: 4 }}>
        <h2 className="section-title">Dossiê de mobilidade</h2>
        <span className="section-sub">o protocolo dos 7 passos</span>
        <div className="filters" style={{ marginLeft: 'auto' }}>
          {options.map(o => (
            <button key={o.k} className={'chip' + (key === o.k ? ' on' : '')} onClick={() => setKey(o.k)}>{o.label}</button>
          ))}
        </div>
      </div>

      <div className="dos-layout">
        <MobilityDossier dossier={dossier} onCheck={onCheck} onStart={onStart} />

        <div className="stack">
          <div className="card panel">
            <div className="panel-head"><span className="panel-title">Estratégia recomendada</span></div>
            <div className="strategy-big"><span className="strategy-emoji">{strat.emoji}</span>{strat.txt}</div>
            {dossier
              ? <p style={{ fontSize: 12.5, color: 'var(--ink-2)', textWrap: 'pretty' }}>
                  {pendingCount(dossier) > 0
                    ? `Ainda com ${pendingCount(dossier)} passo pendente — trato isso como hipótese, não como resposta.`
                    : 'Protocolo fechado. Pode confiar nisso.'}
                </p>
              : <p style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>Sem dossiê, sem estratégia. Não invento o que não checei.</p>}
          </div>

          <div className="card panel">
            <div className="panel-head">
              <span className="panel-title">Apps sugeridos</span>
              <span className="dim mono" style={{ fontSize: 10.5, marginLeft: 'auto' }}>{uf}</span>
            </div>
            <div className="stack">
              {apps.map(a => <AppSuggestionCard key={a.name} app={a} />)}
            </div>
          </div>

          <div className="card panel">
            <div className="panel-head"><span className="panel-title">Contatos locais</span></div>
            <div className="stack">
              {CONTACTS.map(c => (
                <div className="card contact" key={c.name}>
                  <span className="c-name">{c.name}</span>
                  <span className="c-num">{c.num}</span>
                  <span className="c-note">{c.note}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════ ORÇAMENTO ════════════════════════════════════════════════════ */
function Budget({ trip, onLog }) {
  const tot = budgetTotals();
  const neg = tot.saldo < 0;
  return (
    <div className="page">
      <div className="section-head" style={{ marginTop: 4 }}>
        <h2 className="section-title">Orçamento</h2>
        <span className="section-sub">{trip.city}/{trip.uf} · {fmtRange(trip.start, trip.end)}</span>
        <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} onClick={onLog}>
          <Icon name="cifrao" /> Registrar gasto
        </button>
      </div>

      <div className="big3">
        <div className="card big-num"><span className="bn-k">estimado</span><span className="bn-v mono">{money(tot.est)}</span><span className="bn-s">7 categorias</span></div>
        <div className="card big-num"><span className="bn-k">realizado</span><span className="bn-v mono">{money(tot.act)}</span><span className="bn-s">{EXPENSES.length} lançamentos</span></div>
        <div className="card big-num">
          <span className="bn-k">saldo</span>
          <span className="bn-v mono" style={{ color: neg ? 'var(--budget-over)' : 'var(--budget-ok)' }}>{money(tot.saldo)}</span>
          <span className="bn-s">{neg ? 'estourou — reveja alimentação' : 'ainda cabe um passeio'}</span>
        </div>
      </div>

      <div className="section">
        <div className="card">
          <div className="dos-head" style={{ padding: '13px 18px' }}>
            <div className="dos-head-top">
              <span className="dos-kicker">por categoria</span>
              <span className="dos-checked">realizado sobre o trilho do estimado</span>
            </div>
          </div>
          <div className="bud-list">
            {BUDGET.map(b => <BudgetBar key={b.cat} item={b} />)}
          </div>
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <h2 className="section-title">Gastos</h2>
          <span className="section-sub">cada linha já espelhada nas finanças</span>
        </div>
        <div className="card" style={{ overflow: 'hidden' }}>
          <table className="exp-table">
            <thead><tr><th>data</th><th>categoria</th><th>descrição</th><th className="num">valor</th><th></th></tr></thead>
            <tbody>
              {EXPENSES.map(e => (
                <tr key={e.id}>
                  <td>{fmtBR(e.date)}</td>
                  <td>{CAT_LABEL[e.cat]}</td>
                  <td style={{ fontFamily: 'var(--sans)' }}>{e.desc}</td>
                  <td className="num">{money(e.v)}</td>
                  <td><span className="nami-seal" title="lançada nas finanças (Nami) no ato do registro">→ Nami</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ════ CHECKLIST ════════════════════════════════════════════════════ */
function Checklist({ onToggle, onAdd, onRegen }) {
  const [drafts, setDrafts] = React.useState({});
  const done = checklistDone();
  const pct = Math.round(done / CHECKLIST.length * 100);
  return (
    <div className="page">
      <div className="section-head" style={{ marginTop: 4 }}>
        <h2 className="section-title">Checklist pré-viagem</h2>
        <span className="section-sub">{done} de {CHECKLIST.length} feitos</span>
        <button className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={onRegen}>
          <Icon name="carimbo" /> Regerar do dossiê
        </button>
      </div>
      <div className="card" style={{ padding: 16 }}>
        <div className="prog-wide"><i style={{ width: pct + '%' }} /></div>
        <div className="kv" style={{ marginTop: 9 }}>
          <span className="k">progresso</span><span>{pct}% — os itens do dossiê vêm primeiro, porque são os que te deixam na mão.</span>
        </div>
      </div>

      {CHK_GROUPS.map(g => {
        const items = CHECKLIST.filter(c => c.group === g)
          .sort((a, b) => (a.src === b.src ? 0 : a.src === 'dossie' ? -1 : 1));
        return (
          <div className="chk-group" key={g}>
            <div className="chk-glabel">{g}</div>
            <div className="card">
              {items.map(it => <ChecklistRow key={it.id} item={it} onToggle={() => onToggle(it.id)} />)}
              <div className="chk-add">
                <input className="inp" placeholder="adicionar item…" value={drafts[g] || ''}
                       onChange={e => setDrafts({ ...drafts, [g]: e.target.value })}
                       onKeyDown={e => { if (e.key === 'Enter' && (drafts[g] || '').trim()) { onAdd(g, drafts[g].trim()); setDrafts({ ...drafts, [g]: '' }); } }} />
                <button className="btn btn-sm" onClick={() => { if ((drafts[g] || '').trim()) { onAdd(g, drafts[g].trim()); setDrafts({ ...drafts, [g]: '' }); } }}>
                  <Icon name="plus" /> Adicionar
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

Object.assign(window, { Mobility, Budget, Checklist });
