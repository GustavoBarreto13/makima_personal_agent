/* ─────────────────────────────────────────────────────────────────────────
   Komi · Pessoas — Início (hero da Komi, resumo, reconectar, próximas datas)
   ───────────────────────────────────────────────────────────────────────── */

function greeting() {
  const h = new Date().getHours();
  if (h < 6)  return 'Boa madrugada';
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

/* CTA inteligente: telegram > whatsapp(telefone) > instagram > abrir perfil */
function contactCTA(p) {
  if (p.telegram) return { label: 'Telegram', icon: 'send', href: 'https://t.me/' + p.telegram.replace('@', '') };
  if (p.phone)    return { label: 'WhatsApp', icon: 'phone', href: 'https://wa.me/' + p.phone.replace(/[^\d]/g, '') };
  if (p.instagram)return { label: 'Instagram', icon: 'at', href: 'https://instagram.com/' + p.instagram.replace('@', '') };
  return null;
}

function reconnectPrompt(days) {
  if (days >= 60) return 'Faz muito tempo — que tal retomar?';
  if (days >= 30) return 'Mais de um mês sem falar. Manda um oi?';
  if (days >= 14) return 'Já fazem semanas. Dá um alô?';
  return 'Uma semana quietos. Que tal um oi?';
}

function ReconnectCard({ p, last, onOpen }) {
  const cat = REL_CATS[p.category] || REL_CATS.outros;
  const days = daysSince(last.date);
  const cta = contactCTA(p);
  return (
    <div className="reconnect-card" onClick={() => onOpen(p.id)}>
      <div className="rc-head">
        <Avatar person={p} size={40} />
        <div className="rc-id">
          <div className="rc-name">{p.name}</div>
          <div className="rc-rel">{p.relationship}</div>
        </div>
        <span className={'rc-gap' + (days >= 14 ? ' warm' : '')}>{humanGap(days)}</span>
      </div>
      <div className="rc-context">
        <span className="rc-kind">{last.kind}</span> · {last.text}
      </div>
      <div className="rc-prompt">{reconnectPrompt(days)}</div>
      <div className="rc-actions" onClick={(e) => e.stopPropagation()}>
        {cta
          ? <a className="rc-cta primary" href={cta.href} target="_blank" rel="noreferrer"><Icon name={cta.icon} />{cta.label}</a>
          : <button className="rc-cta primary" onClick={() => onOpen(p.id)}><Icon name="user" />Ver perfil</button>}
        <button className="rc-cta ghost" onClick={() => onOpen(p.id)}>Abrir</button>
      </div>
    </div>
  );
}

function Home({ people, onOpen, onNew, goView, setFilter }) {
  // resumo
  const totalVinc = people.reduce((n, p) => n + totalLinks(p), 0);
  const upcoming = React.useMemo(() => {
    const out = [];
    people.forEach(p => (p.dates || []).forEach(d => {
      const days = daysUntil(d.date, d.recurring);
      if (days >= 0) out.push({ p, label: d.label, date: d.date, recurring: d.recurring, days });
    }));
    return out.sort((a, b) => a.days - b.days);
  }, [people]);
  const datesThisMonth = upcoming.filter(d => d.days <= 31).length;

  // reconectar: maior tempo sem interação (>= 7 dias), top 4
  const reconnect = React.useMemo(() => {
    return people
      .map(p => ({ p, last: lastInteraction(p) }))
      .filter(x => x.last && daysSince(x.last.date) >= 7)
      .sort((a, b) => daysSince(b.last.date) - daysSince(a.last.date))
      .slice(0, 4);
  }, [people]);

  // a acertar (financeiro com saldo != 0)
  const settle = React.useMemo(() => {
    return people
      .map(p => ({ p, net: (p.links?.finances?.net) || 0 }))
      .filter(x => x.net !== 0)
      .sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
  }, [people]);

  return (
    <div className="home">
      {/* ── Hero ── */}
      <div className="km-hero">
        <div className="hero-copy">
          <div className="hero-eyebrow">Komi · Pessoas</div>
          <div className="hero-title">{greeting()}.</div>
          <div className="hero-sub">
            Você acompanha <b>{people.length} pessoas</b>
            {reconnect.length > 0 && <> · <b>{reconnect.length} conversa{reconnect.length > 1 ? 's' : ''}</b> pra retomar</>}
            {datesThisMonth > 0 && <> · <b>{datesThisMonth} data{datesThisMonth > 1 ? 's' : ''}</b> chegando</>}.
          </div>
          <div className="hero-stats">
            <div className="hstat"><div className="hs-num">{people.length}</div><div className="hs-lbl">Pessoas</div></div>
            <div className="hstat"><div className="hs-num">{totalVinc}</div><div className="hs-lbl">Vínculos</div></div>
            <div className="hstat"><div className="hs-num">{datesThisMonth}</div><div className="hs-lbl">Datas / mês</div></div>
          </div>
        </div>
        <div className="hero-glow" />
        <img className="hero-art" src="komi/komi.png" alt="Komi" />
      </div>

      {/* ── Reconectar ── */}
      <div className="home-section">
        <div className="home-sec-head">
          <div className="home-sec-title">Que tal entrar em contato?</div>
          <div className="home-sec-sub">mais tempo sem falar</div>
          <button className="home-sec-link" onClick={() => onNew()}><Icon name="plus" />Nova pessoa</button>
        </div>
        {reconnect.length === 0 ? (
          <div className="home-empty">Você está em dia com todo mundo — nada pra retomar agora.</div>
        ) : (
          <div className="reconnect-grid">
            {reconnect.map(({ p, last }) => <ReconnectCard key={p.id} p={p} last={last} onOpen={onOpen} />)}
          </div>
        )}
      </div>

      {/* ── Colunas: próximas datas + a acertar ── */}
      <div className="home-cols">
        <div className="home-panel">
          <div className="home-panel-head">
            <span className="hp-icon" style={{ background: 'var(--garnet-t)', color: 'var(--garnet)' }}><Icon name="cake" /></span>
            <span className="hp-title">Próximas datas</span>
            <span className="home-sec-link" onClick={() => goView('dates')}>ver todas</span>
          </div>
          <div className="home-panel-body">
            {upcoming.length === 0 ? <div className="home-empty">Nenhuma data cadastrada.</div> : upcoming.slice(0, 5).map((d, i) => (
              <div className="mini-row" key={i} onClick={() => onOpen(d.p.id)}>
                <Avatar person={d.p} size={28} />
                <div className="mr-body">
                  <div className="mr-name">{d.p.name}</div>
                  <div className="mr-sub">{d.label} · {fmtDayMonth(d.date)}</div>
                </div>
                <div className="mr-when">
                  <div className="mrw-big">{d.days === 0 ? 'hoje' : d.days}</div>
                  {d.days !== 0 && <div>{d.days === 1 ? 'dia' : 'dias'}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="home-panel">
          <div className="home-panel-head">
            <span className="hp-icon" style={{ background: 'var(--fin-t)', color: 'var(--fin)' }}><Icon name="wallet" /></span>
            <span className="hp-title">A acertar</span>
            <span className="hp-count">{settle.length} pessoa{settle.length === 1 ? '' : 's'}</span>
          </div>
          <div className="home-panel-body">
            {settle.length === 0 ? <div className="home-empty">Nenhuma conta pendente.</div> : settle.slice(0, 5).map(({ p, net }, i) => (
              <div className="mini-row" key={i} onClick={() => onOpen(p.id)}>
                <Avatar person={p} size={28} />
                <div className="mr-body">
                  <div className="mr-name">{p.name}</div>
                  <div className="mr-sub">{net > 0 ? 'te devem' : 'você deve'}</div>
                </div>
                <div className={'mr-amt ' + (net > 0 ? 'pos' : 'neg')}>{brl(net)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Home });
