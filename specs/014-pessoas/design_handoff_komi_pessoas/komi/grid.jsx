/* ─────────────────────────────────────────────────────────────────────────
   Komi · Pessoas — grid de pessoas, cartões, filtros, próximas datas
   ───────────────────────────────────────────────────────────────────────── */

function PersonCard({ p, onOpen }) {
  const cat = REL_CATS[p.category] || REL_CATS.outros;
  const c = linkCounts(p);
  const total = c.fin + c.task + c.diary + c.book;
  const bday = (p.dates || []).find(d => /anivers/i.test(d.label));
  const style = { '--rel-color': cat.color };

  const LinkDot = ({ kind, n, icon }) => (
    <span className={'pc-linkdot ' + kind + (n ? '' : ' muted')} title={n + ' vínculo(s)'}>
      <Icon name={icon} />{n}
    </span>
  );

  return (
    <div className="ppl-card" style={style} onClick={() => onOpen(p.id)}>
      <div className="pc-top">
        <Avatar person={p} size={48} />
        <div style={{ minWidth: 0 }}>
          <div className="pc-name">{p.name}</div>
          <div className="pc-rel"><span className="rd" />{p.relationship}</div>
        </div>
      </div>
      {(bday || p.city) && (
        <div className="pc-meta">
          {bday && <span className="pc-birth"><Icon name="cake" />{fmtDayMonth(bday.date)}</span>}
          {bday && p.city && <span style={{ color: 'var(--ink-4)', fontSize: 10 }}>·</span>}
          {p.city && <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--ink-4)' }}>{p.city}</span>}
        </div>
      )}
      <div className="pc-links">
        <LinkDot kind="fin" n={c.fin} icon="wallet" />
        <LinkDot kind="task" n={c.task} icon="checks" />
        <LinkDot kind="diary" n={c.diary} icon="feather" />
        <LinkDot kind="book" n={c.book} icon="book" />
        <span className="pc-links-spacer" />
        <span className="pc-total">{total} {total === 1 ? 'vínculo' : 'vínculos'}</span>
      </div>
    </div>
  );
}

function PeopleGrid({ people, query, filter, setFilter, onOpen, onNew }) {
  const cats = ['todos', 'familia', 'amigos', 'trabalho', 'outros'];
  const counts = React.useMemo(() => {
    const m = { todos: people.length };
    people.forEach(p => { m[p.category] = (m[p.category] || 0) + 1; });
    return m;
  }, [people]);

  const filtered = React.useMemo(() => {
    const q = normalize(query);
    return people.filter(p => {
      if (filter !== 'todos' && p.category !== filter) return false;
      if (!q) return true;
      const hay = normalize(p.name + ' ' + p.relationship + ' ' + (p.aliases || []).join(' ') + ' ' + (p.city || ''));
      return hay.includes(q);
    }).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [people, query, filter]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="page-title">Diretório de pessoas</div>
          <div className="page-sub">Identidade canônica · todos os vínculos com os outros agentes num lugar só</div>
        </div>
        <button className="btn btn-primary" onClick={onNew}><Icon name="plus" />Nova pessoa</button>
      </div>

      <div className="km-toolbar">
        {cats.map(c => {
          const meta = c === 'todos' ? { label: 'Todas', color: 'var(--km)' } : REL_CATS[c];
          return (
            <button key={c} className={'chip' + (filter === c ? ' active' : '')} onClick={() => setFilter(c)}>
              {c !== 'todos' && <span className="sw" style={{ background: meta.color }} />}
              {meta.label}
              <span className="ct">{counts[c] || 0}</span>
            </button>
          );
        })}
        <span className="toolbar-spacer" />
        <span className="result-count">{filtered.length} {filtered.length === 1 ? 'pessoa' : 'pessoas'}</span>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="es-icon"><Icon name="users" /></div>
          <div className="es-title">Nenhuma pessoa encontrada</div>
          <div className="es-sub">Ajuste a busca ou cadastre alguém novo.</div>
        </div>
      ) : (
        <div className="ppl-grid">
          {filtered.map(p => <PersonCard key={p.id} p={p} onOpen={onOpen} />)}
        </div>
      )}
    </div>
  );
}

/* ── Próximas datas (aniversários e datas importantes) ───────────────────── */
function UpcomingDates({ people, onOpen }) {
  const items = React.useMemo(() => {
    const out = [];
    people.forEach(p => (p.dates || []).forEach(d => {
      out.push({ person: p, label: d.label, date: d.date, recurring: d.recurring, days: daysUntil(d.date, d.recurring) });
    }));
    return out.filter(i => i.days >= 0).sort((a, b) => a.days - b.days);
  }, [people]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="page-title">Próximas datas</div>
          <div className="page-sub">Aniversários e datas importantes de todas as pessoas</div>
        </div>
      </div>
      {items.length === 0 ? (
        <div className="empty-state">
          <div className="es-icon"><Icon name="cake" /></div>
          <div className="es-title">Nenhuma data cadastrada</div>
          <div className="es-sub">Adicione datas importantes ao editar uma pessoa.</div>
        </div>
      ) : (
        <div className="dates-list">
          {items.map((i, k) => (
            <div className="date-card" key={k} onClick={() => onOpen(i.person.id)}>
              <div className="dc-when">
                <div className="dcw-big">{i.days === 0 ? 'hoje' : i.days}</div>
                {i.days !== 0 && <div className="dcw-unit">{i.days === 1 ? 'dia' : 'dias'}</div>}
              </div>
              <Avatar person={i.person} size={40} />
              <div className="dc-body">
                <div className="dc-name">{i.person.name}</div>
                <div className="dc-label">{i.label}{i.recurring ? ' · recorrente' : ''}</div>
              </div>
              <div className="dc-date">{fmtDayMonth(i.date)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

Object.assign(window, { PersonCard, PeopleGrid, UpcomingDates });
