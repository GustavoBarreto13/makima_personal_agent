/* ─────────────────────────────────────────────────────────────────────────
   Komi · Pessoas — página da pessoa (perfil + dashboard de cards por domínio)
   ───────────────────────────────────────────────────────────────────────── */

/* realça @menções num trecho de diário */
function highlightMentions(text) {
  const parts = text.split(/(@[\wÀ-ÿ]+)/g);
  return parts.map((seg, i) =>
    seg.startsWith('@') ? <span key={i} className="mention">{seg}</span> : <React.Fragment key={i}>{seg}</React.Fragment>
  );
}

function DomCard({ icon, title, agent, color, tint, headval, headsub, headcls, children, empty }) {
  const style = { '--dc-color': color, '--dc-tint': tint };
  return (
    <div className="dom-card" style={style}>
      <div className="dom-head">
        <div className="dom-icon"><Icon name={icon} /></div>
        <div className="dom-titles">
          <div className="dom-title">{title}</div>
          <div className="dom-agent">{agent}</div>
        </div>
        {headval != null && (
          <div className={'dom-headval ' + (headcls || '')}>
            {headval}
            {headsub && <span className="hv-sub">{headsub}</span>}
          </div>
        )}
      </div>
      <div className="dom-body">
        {empty ? (
          <div className="dom-empty">
            <Icon name={icon} />
            <div className="de-text">{empty}</div>
          </div>
        ) : children}
      </div>
    </div>
  );
}

function FinanceCard({ data }) {
  const txns = data?.txns || [];
  const net = data?.net || 0;
  const headcls = net > 0 ? 'pos' : net < 0 ? 'neg' : '';
  const headsub = net > 0 ? 'te devem' : net < 0 ? 'você deve' : 'quitado';
  return (
    <DomCard icon="wallet" title="Finanças" agent="Nami" color="var(--fin)" tint="var(--fin-t)"
             headval={net === 0 && txns.length === 0 ? null : brl(net)} headsub={net === 0 && txns.length ? 'quitado' : headsub} headcls={headcls}
             empty={txns.length ? null : 'Nenhuma transação ligada'}>
      {txns.map((t, i) => (
        <div className="dom-row" key={i}>
          <div className="dr-main">
            <div className="dr-title">{t.desc}</div>
            <div className="dr-sub">{fmtDayMonth(t.date)} · {t.method}</div>
          </div>
          <div className={'dr-amt ' + (t.amount > 0 ? 'pos' : 'neg')}>{brl(t.amount)}</div>
        </div>
      ))}
    </DomCard>
  );
}

function TaskCard({ data }) {
  const items = data?.items || [];
  const open = items.filter(i => !i.done).length;
  const done = items.filter(i => i.done).length;
  return (
    <DomCard icon="checks" title="Tarefas" agent="Kaguya" color="var(--task)" tint="var(--task-t)"
             headval={items.length ? open : null} headsub={items.length ? 'abertas' : null}
             empty={items.length ? null : 'Nenhuma tarefa ligada'}>
      {items.map((t, i) => (
        <div className="dom-row" key={i}>
          <span className={'dr-check' + (t.done ? ' on' : '')}>{t.done && <Icon name="check" />}</span>
          <div className="dr-main">
            <div className={'dr-title' + (t.done ? ' done' : '')}>{t.title}</div>
            <div className="dr-sub">{t.done ? 'concluída' : 'vence ' + fmtDayMonth(t.due)}</div>
          </div>
        </div>
      ))}
      {done > 0 && open > 0 && (
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-4)', paddingTop: 10 }}>
          {done} concluída{done > 1 ? 's' : ''} · {open} aberta{open > 1 ? 's' : ''}
        </div>
      )}
    </DomCard>
  );
}

function DiaryCard({ data }) {
  const mentions = data?.mentions || [];
  return (
    <DomCard icon="feather" title="Diário" agent="Violet" color="var(--diary)" tint="var(--diary-t)"
             headval={mentions.length ? mentions.length : null} headsub={mentions.length ? 'menções' : null}
             empty={mentions.length ? null : 'Nenhuma menção no diário'}>
      {mentions.map((m, i) => (
        <div className="diary-snippet" key={i}>
          <div className="ds-text">{highlightMentions(m.text)}</div>
          <div className="ds-when">{fmtDayMonth(m.date)} · {m.time}</div>
        </div>
      ))}
    </DomCard>
  );
}

function BookCard({ data }) {
  const books = data || [];
  return (
    <DomCard icon="book" title="Livros" agent="Frieren" color="var(--book)" tint="var(--book-t)"
             headval={books.length ? books.length : null} headsub={books.length ? 'livros' : null}
             empty={books.length ? null : 'Nenhum livro ligado'}>
      {books.map((b, i) => (
        <div className="dom-row book-row" key={i}>
          <div className="bk-cover" />
          <div className="dr-main">
            <div className="dr-title">{b.title}</div>
            <div className="dr-sub">{b.author}</div>
          </div>
          <span className="bk-status">{b.status}</span>
        </div>
      ))}
    </DomCard>
  );
}

function PersonPage({ p, onEdit }) {
  const cat = REL_CATS[p.category] || REL_CATS.outros;
  const L = p.links || emptyLinks();
  const style = { '--rel-color': cat.color, '--rel-tint': cat.tint };

  const contacts = [
    p.phone && { icon: 'phone', label: p.phone, href: 'tel:' + p.phone.replace(/\s/g, '') },
    p.email && { icon: 'mail', label: p.email, href: 'mailto:' + p.email },
    p.instagram && { icon: 'at', label: p.instagram, href: 'https://instagram.com/' + p.instagram.replace('@', '') },
    p.telegram && { icon: 'send', label: p.telegram },
    p.city && { icon: 'pin', label: p.city },
  ].filter(Boolean);

  const upcomingDates = (p.dates || [])
    .map(d => ({ ...d, days: daysUntil(d.date, d.recurring) }))
    .sort((a, b) => a.days - b.days);

  return (
    <div className="person-page" style={style}>
      <div className="profile-hero">
        <div className="ph-avatar"><Avatar person={p} size={96} /></div>
        <div className="ph-body">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span className="ph-rel tint"><span className="so-mark" style={{ width: 7, height: 7, borderRadius: '50%', background: cat.color }} />{p.relationship}</span>
            {(p.aliases || []).length > 0 && (
              <span className="ph-aliases">
                {p.aliases.map((a, i) => <span className="alias-chip" key={i}>"{a}"</span>)}
              </span>
            )}
          </div>
          <div className="ph-name" style={{ marginTop: 8 }}>{p.name}</div>

          {contacts.length > 0 && (
            <div className="ph-contacts">
              {contacts.map((c, i) => (
                <span className="contact" key={i}>
                  <Icon name={c.icon} />
                  {c.href ? <a href={c.href} target="_blank" rel="noreferrer">{c.label}</a> : <span>{c.label}</span>}
                </span>
              ))}
            </div>
          )}

          {p.notes && <div className="ph-notes">"{p.notes}"</div>}

          {upcomingDates.length > 0 && (
            <div className="dates-strip">
              {upcomingDates.map((d, i) => (
                <div className="date-pill" key={i}>
                  <div className="dp-icon"><Icon name={/anivers/i.test(d.label) ? 'cake' : 'calendar'} /></div>
                  <div>
                    <div className="dp-label">{d.label}</div>
                    <div className={'dp-when' + (d.days <= 30 ? ' dp-soon' : '')}>
                      {fmtDayMonth(d.date)}{d.days === 0 ? ' · hoje!' : d.days <= 30 ? ` · em ${d.days}d` : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="ph-actions">
          <button className="btn btn-ghost btn-sm" onClick={() => onEdit(p.id)}><Icon name="edit" />Editar</button>
        </div>
      </div>

      <div className="dom-grid">
        <FinanceCard data={L.finances} />
        <TaskCard data={L.tasks} />
        <DiaryCard data={L.journal} />
        <BookCard data={L.books} />
      </div>
    </div>
  );
}

Object.assign(window, { PersonPage, highlightMentions });
