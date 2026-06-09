/* ─────────────────────────────────────────────────────────────────────────
   Violet · Diário — tela Insights (Violet em destaque)
   ───────────────────────────────────────────────────────────────────────── */

const INS_TABS = [
  { id: 'journal',    label: 'Diário',    glyph: 'journal', color: 'var(--ink-3)' },
  { id: 'dreams',     label: 'Sonhos',    glyph: 'moon',    color: 'var(--gold)' },
  { id: 'highlights', label: 'Destaques', glyph: 'heart',   color: 'var(--garnet)' },
  { id: 'tags',       label: 'Tags',      glyph: 'hash',    color: 'var(--sapphire)' },
  { id: 'people',     label: 'Pessoas',   glyph: 'at',      color: 'var(--emerald)' },
  { id: 'wisdom',     label: 'Sabedoria', glyph: 'gem',     color: 'var(--violet-c)' },
  { id: 'ideas',      label: 'Ideias',    glyph: 'bulb',    color: 'var(--amber)' },
];

function Insights({ navigate }) {
  const [tab, setTab] = React.useState('journal');

  return (
    <div className="page">
      {/* hero com Violet em destaque */}
      <div className="ins-hero">
        <div className="ins-hero-copy">
          <div className="page-eyebrow">Seu ano em palavras</div>
          <h1 className="page-h1" style={{ marginTop: 8 }}>
            Insights <span className="h1-pro">Pro</span>
          </h1>
          <p className="ins-greet">
            <b>132 entradas</b> este ano. Você escreveu em metade dos dias —
            e em cada um deles deixou um pouco de você no papel. Eu li todas.
          </p>
        </div>
        <div className="ins-hero-portrait">
          <div className="halo" />
          <img src="violet/violet.png" alt="Violet Evergarden" />
        </div>
      </div>

      {/* abas */}
      <div className="ins-tabs">
        {INS_TABS.map(t => (
          <div key={t.id} className={'ins-tab' + (tab === t.id ? ' active' : '')} onClick={() => setTab(t.id)}>
            <span className="tab-glyph"><Icon name={t.glyph} style={{ color: tab === t.id ? 'var(--ink)' : t.color }} /></span>
            {t.label}
          </div>
        ))}
      </div>

      {tab === 'journal' ? <InsightsJournal navigate={navigate} /> : <InsightsCollection id={tab} navigate={navigate} />}
    </div>
  );
}

/* ── aba Diário: analytics completo ─────────────────────────────────────── */
function InsightsJournal({ navigate }) {
  const lines = [
    { label: 'Palavras', val: STATS.totalWords.toLocaleString('pt-BR'), unit: 'no total', bar: 1 },
    { label: 'Média diária', val: STATS.perDay, unit: 'palavras / dia escrito', bar: 0.42 },
    { label: 'Taxa de destaque', val: STATS.highlightRate + '%', unit: 'das entradas', bar: STATS.highlightRate / 100 },
    { label: 'Frequência', val: STATS.freqPerWeek, unit: 'entradas / semana', bar: STATS.freqPerWeek / 7 },
    { label: 'Bullets por entrada', val: STATS.bulletRate, unit: 'em média', bar: STATS.bulletRate / 6 },
  ];
  const dayMax = Math.max(...DAYTIME, 1);

  return (
    <>
      {/* heatmap */}
      <div className="ins-heatcard">
        <HeatmapRow data={HEATMAP} />
        <div className="heat-foot">
          <span className="heat-stat"><span className="hs-chip"><Icon name="calendar" /> {STATS.daysWritten}</span> dias escritos</span>
          <span className="heat-stat"><span className="hs-chip"><Icon name="write" /> {STATS.entries}</span> entradas</span>
          <span className="heat-stat"><span className="hs-chip" style={{ color: 'var(--garnet)' }}><Icon name="flame" /> {STATS.longestStreak}</span> maior sequência</span>
          <span className="heat-legend">
            menos {[0,1,2,3,4].map(i => <i key={i} style={{ background: `var(--heat-${i})` }} />)} mais
          </span>
        </div>
      </div>

      {/* chips de contagem */}
      <div className="count-chips">
        <div className="count-chip">
          <span className="cc-ico" style={{ background: 'var(--garnet-tint)' }}><Icon name="heart" style={{ color: 'var(--garnet)' }} /></span>
          <span className="cc-n">{STATS.highlights}</span><span className="cc-l">destaques</span>
        </div>
        <div className="count-chip">
          <span className="cc-ico" style={{ background: 'var(--sapphire-tint)' }}><Icon name="hash" style={{ color: 'var(--sapphire)' }} /></span>
          <span className="cc-n">{STATS.tags}</span><span className="cc-l">tags</span>
        </div>
        <div className="count-chip">
          <span className="cc-ico" style={{ background: 'var(--emerald-tint)' }}><Icon name="at" style={{ color: 'var(--emerald)' }} /></span>
          <span className="cc-n">{STATS.mentions}</span><span className="cc-l">menções</span>
        </div>
        <div className="count-chip">
          <span className="cc-ico" style={{ background: 'var(--gold-tint)' }}><Icon name="moon" style={{ color: 'var(--gold)' }} /></span>
          <span className="cc-n">{STATS.dreams}</span><span className="cc-l">sonhos</span>
        </div>
      </div>

      {/* linhas de stat */}
      <div className="stat-lines">
        {lines.map((l, i) => (
          <div className="stat-line" key={i}>
            <span className="sl-label">{l.label}</span>
            <span className="sl-val">{l.val}<span className="unit">{l.unit}</span></span>
            <span className="sl-bar"><i style={{ width: Math.min(100, l.bar * 100) + '%' }} /></span>
          </div>
        ))}
      </div>

      {/* gráfico de palavras por mês */}
      <div className="chart-card">
        <div className="chart-title">Palavras por mês</div>
        <div className="chart-sub">o ritmo da sua escrita ao longo de {YEAR}</div>
        <AreaChart data={WORDS_BY_MONTH} />
      </div>

      {/* distribuição por hora */}
      <div className="chart-card">
        <div className="chart-title">A que horas você escreve</div>
        <div className="chart-sub">a noite é, de longe, o seu momento</div>
        <div className="day-bars">
          {DAYTIME.map((v, i) => (
            <div className="day-bar" key={i} title={`${i*2}h – ${i*2+2}h`}>
              <div className="db-fill" style={{ height: Math.max(3, (v / dayMax) * 100) + '%' }} />
              <span className="db-lbl">{String(i * 2).padStart(2, '0')}</span>
            </div>
          ))}
        </div>
      </div>

      {/* grandes números */}
      <div className="big-stat-row">
        <div className="big-stat"><div className="n">{STATS.currentStreak}</div><div className="l">dias seguidos escrevendo</div><div className="s">sua sequência atual</div></div>
        <div className="big-stat"><div className="n">{STATS.bullets}</div><div className="l">bullets no ano</div><div className="s">cada um, um instante</div></div>
        <div className="big-stat"><div className="n">{Math.round(STATS.totalWords / 250)}</div><div className="l">páginas de livro</div><div className="s">é o quanto você já escreveu</div></div>
      </div>
    </>
  );
}

/* ── abas de coleção: resumo focado ─────────────────────────────────────── */
function InsightsCollection({ id, navigate }) {
  const meta = (typeof COLLECTION_META !== 'undefined' && COLLECTION_META[id]) || null;

  if (id === 'tags') {
    const max = Math.max(...TAGS.map(t => t.count), 1);
    const top = TAGS.slice(0, 8);
    return (
      <div style={{ marginTop: 28 }}>
        <div className="big-stat-row">
          <div className="big-stat"><div className="n">{STATS.tags}</div><div className="l">tags únicas</div></div>
          <div className="big-stat"><div className="n">{TAGS[0]?.token}</div><div className="l">a mais usada</div><div className="s">{TAGS[0]?.count} vezes</div></div>
          <div className="big-stat"><div className="n">{STATS.mentions}</div><div className="l">menções totais</div></div>
        </div>
        <div className="chart-card">
          <div className="chart-title">Tags mais frequentes</div>
          <div className="stat-lines" style={{ marginTop: 16 }}>
            {top.map((t, i) => (
              <div className="stat-line" key={i}>
                <span className="sl-label" style={{ color: 'var(--accent-deep)', fontWeight: 600, minWidth: 130 }}>{t.token}</span>
                <span className="sl-bar" style={{ maxWidth: 320 }}><i style={{ width: (t.count / max) * 100 + '%' }} /></span>
                <span className="sl-val">{t.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (id === 'people') {
    const max = Math.max(...PEOPLE.map(p => p.count), 1);
    return (
      <div style={{ marginTop: 28 }}>
        <div className="big-stat-row">
          <div className="big-stat"><div className="n">{PEOPLE.length}</div><div className="l">pessoas citadas</div></div>
          <div className="big-stat"><div className="n">{PEOPLE[0]?.token.replace('@','')}</div><div className="l">mais presente</div><div className="s">{PEOPLE[0]?.count} menções</div></div>
          <div className="big-stat"><div className="n">{STATS.mentions}</div><div className="l">menções no ano</div></div>
        </div>
        <div className="chart-card">
          <div className="chart-title">Quem mais aparece</div>
          <div className="stat-lines" style={{ marginTop: 16 }}>
            {PEOPLE.map((p, i) => (
              <div className="stat-line" key={i}>
                <span className="sl-label" style={{ color: 'var(--emerald)', fontWeight: 600, minWidth: 130 }}>{p.token}</span>
                <span className="sl-bar" style={{ maxWidth: 320 }}><i style={{ width: (p.count / max) * 100 + '%', background: 'var(--emerald)' }} /></span>
                <span className="sl-val">{p.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // dreams / highlights / wisdom / ideas — número + amostras recentes
  const data = { dreams: DREAMS, highlights: HIGHLIGHTS, wisdom: WISDOM, ideas: IDEAS }[id] || [];
  const totalMap = { dreams: STATS.dreams, highlights: STATS.highlights, wisdom: 24, ideas: 19 };
  return (
    <div style={{ marginTop: 28 }}>
      <div className="big-stat-row">
        <div className="big-stat">
          <div className="n" style={{ color: meta.color }}>{totalMap[id]}</div>
          <div className="l">{meta.title.toLowerCase()} no ano</div>
        </div>
        <div className="big-stat"><div className="n">{data.length}</div><div className="l">registrados recentemente</div></div>
        <div className="big-stat"><div className="n">{Math.round(totalMap[id] / 132 * 100)}%</div><div className="l">das entradas têm {meta.title.toLowerCase()}</div></div>
      </div>
      <div className="chart-card">
        <div className="chart-title">Releia alguns</div>
        <div className="col-grid" style={{ marginTop: 18 }}>
          {data.slice(0, 4).map((b, i) => (
            <div className={'col-card' + (id === 'wisdom' || id === 'dreams' ? ' serif' : '')} key={i}>
              <div className="cc-accent" style={{ background: meta.color }} />
              <div className="cc-text"><RichText text={b.text} /></div>
              <div className="cc-foot"><span className="cc-date">{fmtDate(b.date)}</span><span className="cc-src" onClick={() => navigate(id)}>ver todos →</span></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Insights, INS_TABS });
