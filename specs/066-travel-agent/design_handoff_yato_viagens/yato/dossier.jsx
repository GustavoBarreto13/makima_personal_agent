/* ─────────────────────────────────────────────────────────────────────
   Yato · Viagens — ⭐ MobilityDossier (componente-assinatura)
   Os 7 passos do protocolo como coluna de carimbos.
   ───────────────────────────────────────────────────────────────────── */
function DossierRow({ c, onCheck }) {
  const v = VERDICT[c.v] || VERDICT.pendente;
  const pend = c.v === 'pendente';
  return (
    <div className="dos-row">
      <div className="dos-sym" style={{ color: c.v === 'pendente' ? 'var(--verdict-pending)' : VERDICT_VAR[c.v] }}>{v.sym}</div>
      <div>
        <div className="dos-step"><span className="n">{c.step.n} ·</span>{c.step.name}</div>
        <div className={'dos-ev' + (pend ? ' instr' : '')}>{pend ? c.step.instr : c.ev}</div>
      </div>
      <div className="dos-stamp"><VerdictChip v={c.v} md /></div>
      <div className="dos-src">
        {pend
          ? <button className="btn btn-sm" onClick={() => onCheck(c.step.key)}>Checar <Icon name="chevR" /></button>
          : <>{fmtBR(c.at)}<br />{c.src}</>}
      </div>
    </div>
  );
}

function MobilityDossier({ dossier, onCheck, onStart }) {
  if (!dossier) {
    return (
      <div className="card dossier">
        <div className="dos-empty">
          <div className="eyebrow">dossiê de mobilidade</div>
          <div className="stat-macro">51%</div>
          <div className="empty-txt" style={{ fontFamily: 'var(--display)', fontSize: 16, fontWeight: 600, maxWidth: '44ch', textWrap: 'pretty' }}>
            dos municípios brasileiros não têm nenhum ônibus urbano. Apps de corrida chegam a 26%.
          </div>
          <p className="dim" style={{ maxWidth: '46ch', fontSize: 13 }}>
            Ainda não checamos nada dessa cidade. Vamos por partes — sete passos, um por vez.
          </p>
          <button className="btn btn-primary" onClick={onStart}><Icon name="carimbo" /> Iniciar protocolo</button>
        </div>
      </div>
    );
  }

  const cs = checksOf(dossier);
  const pend = pendingCount(dossier);
  const strat = STRATEGY_LABEL[dossier.strategy] || { txt: 'a definir', emoji: '•' };
  const ped = dossier.pedestrian;
  const collapsed = ped ? cs.slice(1, 5) : [];
  const shown = ped ? [cs[0], cs[5], cs[6]] : cs;
  const [openColl, setOpenColl] = React.useState(false);

  return (
    <div className="card dossier">
      <div className="dos-head">
        <div className="dos-head-top">
          <span className="dos-kicker">dossiê de mobilidade</span>
          <span className="dos-title">{dossier.city}<span style={{ color: 'var(--ink-3)', fontWeight: 400 }}>/{dossier.uf}</span></span>
          <span className="dos-checked">checado em {fmtBRfull(dossier.last)}</span>
        </div>
        <div className="dos-head-bot">
          <span className="dos-size">cidade {dossier.size} · {dossier.pop}</span>
          {ped && <span className="vchip v-na">escala pedonal</span>}
          <div className="dos-meter"><ReadinessLine dossier={dossier} size="md" /></div>
        </div>
      </div>

      {dossier.stale && (
        <div className="dos-stale">
          <b>dossiê com mais de 6 meses</b> — revalidar antes de viajar. Cobertura de app muda sem aviso.
        </div>
      )}

      {ped && (
        <div className="dos-collapsed">
          <span style={{ color: 'var(--ink-4)' }}>—</span>
          <div style={{ flex: 1 }}>
            <div className="dos-step" style={{ marginBottom: 4 }}>Passos 2 a 5 · mobilidade motorizada</div>
            <div style={{ textWrap: 'pretty' }}>
              Vila sem circulação de veículos: app de corrida, táxi e ônibus urbano <b>não se aplicam</b> aqui.
              Não é ausência de serviço — é ausência de rua.
            </div>
            <button className="btn btn-sm" style={{ marginTop: 9 }} onClick={() => setOpenColl(o => !o)}>
              {openColl ? 'esconder passos' : 'ver os 4 passos'}
            </button>
          </div>
          <span className="vchip v-na">n/a</span>
        </div>
      )}
      {ped && openColl && collapsed.map(c => (
        <div className="dos-row" key={c.step.key}>
          <div className="dos-sym" style={{ color: 'var(--ink-4)' }}>—</div>
          <div>
            <div className="dos-step"><span className="n">{c.step.n} ·</span>{c.step.name}</div>
            <div className="dos-ev">Não se aplica em escala pedonal.</div>
          </div>
          <div className="dos-stamp"><span className="vchip v-na md">— n/a</span></div>
          <div className="dos-src">—</div>
        </div>
      ))}

      {shown.map(c => <DossierRow key={c.step.key} c={c} onCheck={onCheck} />)}

      <div className="dos-foot">
        <div className="dos-foot-strat">
          <span className="dos-foot-k">estratégia {pend ? 'provisória' : 'recomendada'}</span>
          <span className="strategy-emoji">{strat.emoji}</span>
          <span className="dos-foot-v">{strat.txt}</span>
        </div>
        <div className="dos-foot-note">
          {pend > 0
            ? <>Falta{pend > 1 ? 'm' : ''} <b>{pend}</b> passo{pend > 1 ? 's' : ''} — então isso aqui ainda não é veredito final. {dossier.summary}</>
            : dossier.summary}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { MobilityDossier, DossierRow });
