// Avaliação dos Valores (spec 076) — ferramenta guiada para clarear os princípios que orientam a vida, separar
// objetivos (com linha de chegada) de direções valorizadas (contínuas) e achar onde a rotina está desalinhada.
// Três fases, uma pergunta por tela (bom de fazer no celular), com salvamento automático:
//   0. Antes de começar — não há certo/errado; objetivo ≠ valor; responda pelo mundo ideal.
//   I. As 12 áreas — o "você ideal" em cada uma (pode pular sem culpa), com perguntas-guia e dicas do roteiro.
//  II. Seis notas de 1 a 10 por área (a Ação é só da semana passada).
//      Diagnóstico — as áreas de alerta: importa muito, a ação satisfaz pouco e preocupa.
// III. Narrativa (uma frase de direção por área) e ações compromissadas nas áreas críticas.
// O resumo vira contexto do Conselho do Dia e da Revisão semanal. Refazer cria uma versão nova (histórico).

import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import {
  Button, Chip, EmptyState, ErrorState, Field, Hero, Icon, Input, LoadingState, Page, ProgressBar, SectionHeader, Textarea, confirm, toast,
} from '../../../design'
import { fmtDate } from '../../../design/core/format'
import { kaguyaApi } from '../../kaguya/api'
import { useViolet } from '../context'
import { useLoad } from '../lib/useLoad'
import { violetApi } from '../violetApi'
import type { ScoreKey, ValuesArea, ValuesAssessment, ValuesGuide } from '../types'

export function Values() {
  const v = useViolet()
  const guide = useLoad(() => violetApi.valuesGuide(), [])
  const current = useLoad(() => violetApi.valuesCurrent(), [v.rev])
  if (guide.state.status === 'loading' || current.state.status === 'loading') return <Page><LoadingState count={4} /></Page>
  if (guide.state.status === 'error' || current.state.status === 'error') return <Page><ErrorState onRetry={() => { guide.retry(); current.retry() }} /></Page>
  const g = guide.state.data
  const a = current.state.data.assessment
  if (v.route.valuesHistory) return <ValuesHistory guide={g} />
  if (v.route.valuesEdit) return <Wizard guide={g} initial={a?.status === 'draft' ? a : null} />
  return <ValuesSummary guide={g} assessment={a} />
}

// ── Resumo ──────────────────────────────────────────────────────────────────

function ValuesSummary({ guide, assessment: a }: { guide: ValuesGuide; assessment: ValuesAssessment | null }) {
  const v = useViolet()
  const labels = Object.fromEntries(guide.domains.map((d) => [d.key, d.label]))

  async function start() {
    try { await violetApi.valuesStart(); v.goto({ view: 'values', valuesEdit: true }) }
    catch { toast('Não consegui começar agora.', { tone: 'error' }) }
  }

  if (!a) {
    return (
      <Page>
        <Hero eyebrow="Avaliação dos Valores" eyebrowIcon="values" title="O que realmente importa para você?"
          meta="Uns 30 minutos, guiados. Dá para parar e continuar depois — tudo salva sozinho."
          actions={<Button variant="primary" icon="values" onClick={() => void start()}>Começar a avaliação</Button>} />
        <div className="vl-twocol">
          {guide.intro.map((i) => <section key={i.title} className="vl-card"><h4 className="vl-card-title">{i.title}</h4><p>{i.body}</p></section>)}
        </div>
        <p className="vl-muted">O resumo vira contexto do Conselho do Dia e da Revisão semanal: a Violet passa a cobrar pelo que você mesmo disse que valoriza.</p>
      </Page>
    )
  }

  if (a.status === 'draft') {
    const done = a.areas.filter((x) => x.skipped || x.description).length
    return (
      <Page>
        <Hero compact eyebrow="Avaliação dos Valores" eyebrowIcon="values" title="Avaliação em andamento" meta={`${done} de 12 áreas descritas · começou em ${fmtDate(a.started_at.slice(0, 10))}`}
          actions={<>
            <Button variant="primary" icon="right" onClick={() => v.goto({ view: 'values', valuesEdit: true })}>Continuar</Button>
            <Button variant="ghost" icon="delete" onClick={async () => { if (await confirm({ title: 'Descartar o rascunho?', confirmLabel: 'Descartar', danger: true })) { await violetApi.valuesDiscard(); v.reload() } }}>Descartar</Button>
          </>} />
      </Page>
    )
  }

  const d = a.diagnosis
  return (
    <Page>
      <Hero compact eyebrow="Avaliação dos Valores" eyebrowIcon="values" title="Seu mapa de valores"
        meta={`Concluída em ${a.completed_at ? fmtDate(a.completed_at.slice(0, 10)) : '—'} · ${d.alerts.length ? `${d.alerts.length} área(s) de alerta` : 'nenhuma área de alerta'}`}
        actions={<>
          <Button icon="refresh" onClick={() => void start()}>Refazer</Button>
          <Button variant="ghost" icon="history" onClick={() => v.goto({ view: 'values', valuesHistory: true })}>Histórico</Button>
        </>} />

      <WeeklyCheckin guide={guide} assessment={a} />

      {d.alerts.length > 0 && (
        <section className="vl-card vl-alert">
          <h4 className="vl-card-title"><Icon name="warning" size={14} /> Áreas de alerta</h4>
          <p className="vl-muted">Importam muito, a ação da semana satisfaz pouco e preocupam — é daqui que costuma vir a sensação de estar travado.</p>
          <div className="vl-chips">{d.alerts.map((k) => <span key={k} className="vl-pill vl-pill-warn">{labels[k]}</span>)}</div>
        </section>
      )}

      <SectionHeader title="Importância × satisfação" mono="por área" />
      <Gaps ranked={d.ranked} />

      <SectionHeader title="Suas direções" />
      <div className="vl-narratives">
        {d.ranked.map((r) => {
          const area = a.areas.find((x) => x.domain_key === r.domain_key)
          const text = area?.narrative || area?.description
          return text ? (
            <article key={r.domain_key} className="vl-narrative">
              <h4>{r.label}{r.alert && <Icon name="warning" size={13} label="área de alerta" />}</h4>
              <p>{text}</p>
            </article>
          ) : null
        })}
      </div>

      <SectionHeader title="Ações compromissadas" />
      <Commitments assessment={a} labels={labels} />
    </Page>
  )
}

function Gaps({ ranked }: { ranked: ValuesAssessment['diagnosis']['ranked'] }) {
  return (
    <div className="vl-card vl-gaps" role="table" aria-label="Importância e satisfação por área">
      {ranked.map((r) => (
        <div key={r.domain_key} className={`vl-gap${r.alert ? ' vl-alert' : ''}`} role="row">
          <span role="cell">{r.label}</span>
          <span role="cell" className="vl-gapbars">
            <span className="vl-gap-imp" style={{ ['--vl-level' as string]: (r.importance ?? 0) / 10 }} title={`Importância ${r.importance ?? '—'}`} />
            <span className="vl-gap-sat" style={{ ['--vl-level' as string]: (r.satisfaction ?? 0) / 10 }} title={`Satisfação ${r.satisfaction ?? '—'}`} />
          </span>
          <span role="cell" className="ds-mono">{r.importance ?? '—'} / {r.satisfaction ?? '—'}</span>
        </div>
      ))}
      <p className="vl-muted vl-small"><span className="vl-key vl-gap-imp" /> importância <span className="vl-key vl-gap-sat" /> satisfação com a ação</p>
    </div>
  )
}

function Commitments({ assessment: a, labels }: { assessment: ValuesAssessment; labels: Record<string, string> }) {
  const v = useViolet()
  const [items, setItems] = useState(a.commitments)
  async function toTask(i: number) {
    const c = items[i]
    try {
      const t = await kaguyaApi.createTask({ title: c.text, description: `Ação compromissada — ${labels[c.domain_key]} (Avaliação dos Valores)` })
      if (!t.id) throw new Error()
      await violetApi.valuesUpdateCommitment(c.id, { task_id: t.id })
      setItems(items.map((x, j) => (j === i ? { ...x, task_id: t.id as number } : x)))
      toast('Virou tarefa na Kaguya.', { tone: 'success' })
    } catch { toast('Não consegui criar a tarefa.', { tone: 'error' }) }
  }
  if (!items.length) return <EmptyState icon="goal" title="Nenhuma ação compromissada" hint="Ao refazer a avaliação, escolha de 1 a 3 áreas críticas e o que fazer nelas na próxima semana." action={<Button onClick={() => v.goto({ view: 'values', valuesEdit: true })}>Abrir avaliação</Button>} />
  return (
    <div className="vl-actions">
      {items.map((c, i) => (
        <div key={c.id} className="vl-action">
          <div><b>{c.text}</b><small>{labels[c.domain_key]}</small></div>
          {c.task_id ? <span className="vl-pill vl-pill-ok"><Icon name="check" size={12} />Na Kaguya</span> : <Button size="sm" icon="task" onClick={() => void toTask(i)}>Virar tarefa</Button>}
        </div>
      ))}
    </div>
  )
}

function WeeklyCheckin({ guide, assessment }: { guide: ValuesGuide; assessment: ValuesAssessment }) {
  const active = assessment.diagnosis.ranked.filter((r) => (r.importance ?? 0) >= 7)
  const [open, setOpen] = useState(false)
  const [vals, setVals] = useState<Record<string, { action: number | null; satisfaction: number | null }>>({})
  const [saving, setSaving] = useState(false)
  if (!active.length) return null
  const labels = Object.fromEntries(guide.domains.map((d) => [d.key, d.label]))
  async function save() {
    setSaving(true)
    try {
      for (const [k, x] of Object.entries(vals)) if (x.action && x.satisfaction) await violetApi.valuesCheckin(k, x.action, x.satisfaction)
      toast('Check-in da semana salvo.', { tone: 'success' }); setOpen(false)
    } catch { toast('Não consegui salvar o check-in.', { tone: 'error' }) }
    setSaving(false)
  }
  return (
    <section className="vl-card">
      <header className="vl-card-head"><Icon name="weekly-review" size={16} /><h3>Check-in da semana</h3><span className="vl-spacer" />
        {!open && <Button size="sm" onClick={() => setOpen(true)}>Fazer agora</Button>}</header>
      <p className="vl-muted">Ação e satisfação da semana que passou, nas áreas que mais importam. Leva um minuto e mantém o mapa vivo sem refazer tudo.</p>
      {open && (
        <>
          {active.map((r) => (
            <div key={r.domain_key} className="vl-checkin">
              <b>{labels[r.domain_key]}</b>
              <ScorePicker label={`Ação em ${labels[r.domain_key]}`} caption="Ação" value={vals[r.domain_key]?.action ?? null} onChange={(n) => setVals({ ...vals, [r.domain_key]: { action: n, satisfaction: vals[r.domain_key]?.satisfaction ?? null } })} />
              <ScorePicker label={`Satisfação em ${labels[r.domain_key]}`} caption="Satisfação" value={vals[r.domain_key]?.satisfaction ?? null} onChange={(n) => setVals({ ...vals, [r.domain_key]: { action: vals[r.domain_key]?.action ?? null, satisfaction: n } })} />
            </div>
          ))}
          <div className="vl-row vl-row-end"><Button variant="ghost" onClick={() => setOpen(false)}>Depois</Button><Button variant="primary" disabled={saving} onClick={() => void save()}>Salvar check-in</Button></div>
        </>
      )}
    </section>
  )
}

function ScorePicker({ value, onChange, label, caption }: { value: number | null; onChange: (n: number) => void; label: string; caption?: string }) {
  return (
    <div className="vl-score">
      {caption && <small className="vl-muted">{caption}</small>}
      <div className="vl-intensity vl-score-1to10" role="radiogroup" aria-label={label}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button key={n} type="button" role="radio" aria-checked={value === n} className={value === n ? 'vl-on' : undefined}
            style={{ ['--vl-level' as string]: n / 10 }} onClick={() => onChange(n)}>{n}</button>
        ))}
      </div>
    </div>
  )
}

// ── Wizard ──────────────────────────────────────────────────────────────────

type Step =
  | { t: 'intro'; i: number }
  | { t: 'describe'; key: string }
  | { t: 'score'; key: string }
  | { t: 'diagnosis' }
  | { t: 'narrative' }
  | { t: 'commit' }
  | { t: 'done' }

function Wizard({ guide, initial }: { guide: ValuesGuide; initial: ValuesAssessment | null }) {
  const v = useViolet()
  const [a, setA] = useState<ValuesAssessment | null>(initial)
  const [stepIdx, setStepIdx] = useState(0)
  const pending = useRef<Record<string, number>>({})

  // Sem rascunho (link direto): começa um.
  useEffect(() => {
    if (a) return
    violetApi.valuesStart().then((r) => setA(r.assessment)).catch(() => toast('Não consegui abrir a avaliação.', { tone: 'error' }))
  }, [a])

  const steps: Step[] = useMemo(() => {
    if (!a) return []
    const active = a.areas.filter((x) => !x.skipped).map((x) => x.domain_key)
    return [
      ...guide.intro.map((_, i) => ({ t: 'intro', i }) as Step),
      ...guide.domains.map((d) => ({ t: 'describe', key: d.key }) as Step),
      ...active.map((key) => ({ t: 'score', key }) as Step),
      { t: 'diagnosis' }, { t: 'narrative' }, { t: 'commit' }, { t: 'done' },
    ]
  }, [a, guide])

  // Retoma de onde parou (por avaliação, neste navegador).
  const storeKey = a ? `violet:values:step:${a.id}` : ''
  useEffect(() => {
    if (!storeKey) return
    try { const s = Number(sessionStorage.getItem(storeKey)); if (s > 0) setStepIdx(s) } catch { /* sem storage */ }
  }, [storeKey])
  useEffect(() => { if (storeKey) try { sessionStorage.setItem(storeKey, String(stepIdx)) } catch { /* sem storage */ } }, [storeKey, stepIdx])

  if (!a || !steps.length) return <Page><LoadingState count={3} /></Page>
  const step = steps[Math.min(stepIdx, steps.length - 1)]
  const domain = (key: string) => guide.domains.find((d) => d.key === key)!
  const area = (key: string) => a.areas.find((x) => x.domain_key === key)!

  /** Atualiza local na hora e salva no servidor com um respiro (texto) ou já (notas, pular). */
  const patch = (key: string, body: Partial<ValuesArea> & Partial<Record<ScoreKey, number | null>>, delay = 600) => {
    setA((cur) => cur && { ...cur, areas: cur.areas.map((x) => (x.domain_key === key ? { ...x, ...body } : x)) })
    window.clearTimeout(pending.current[key])
    pending.current[key] = window.setTimeout(() => {
      violetApi.valuesArea(a.id, key, body as never).then((r) => setA((cur) => cur && {
        ...cur, diagnosis: r.diagnosis, areas: cur.areas.map((x) => (x.domain_key === key ? { ...x, hints: r.area.hints } : x)),
      })).catch(() => toast('Não consegui salvar — confira a conexão.', { tone: 'error' }))
    }, delay)
  }

  const next = () => { setStepIdx((i) => Math.min(i + 1, steps.length - 1)); window.scrollTo?.({ top: 0 }) }
  const back = () => setStepIdx((i) => Math.max(i - 1, 0))
  const phase = step.t === 'intro' ? 'Antes de começar' : step.t === 'describe' ? 'Fase I · As 12 áreas' : step.t === 'score' ? 'Fase II · As notas' : step.t === 'diagnosis' ? 'Diagnóstico' : 'Fase III · Consolidação'

  async function finish() {
    try {
      await violetApi.valuesComplete(a!.id)
      try { sessionStorage.removeItem(storeKey) } catch { /* sem storage */ }
      toast('Avaliação concluída — a Violet já usa isso nos conselhos.', { tone: 'success' })
      v.reload(); v.goto('values')
    } catch { toast('Não consegui concluir.', { tone: 'error' }) }
  }

  let body: ReactElement
  if (step.t === 'intro') {
    const it = guide.intro[step.i]
    body = <div className="vl-wz-intro"><h2>{it.title}</h2><p>{it.body}</p></div>
  } else if (step.t === 'describe') {
    const d = domain(step.key), ar = area(step.key)
    body = (
      <div className="vl-wz">
        <h2>{d.label}</h2>
        <p className="vl-muted">{d.about}</p>
        <ul className="vl-wz-questions">{d.questions.map((q) => <li key={q}>{q}</li>)}</ul>
        {ar.skipped ? (
          <div className="vl-card"><p>Você pulou esta área.</p><Button onClick={() => patch(step.key, { skipped: false }, 0)}>Descrever mesmo assim</Button></div>
        ) : (
          <>
            <Field label="O você ideal nesta área">
              {(c) => (<Textarea {...c} autoFocus rows={6} value={ar.description ?? ''} onChange={(e) => patch(step.key, { description: e.target.value })}
                placeholder="Escreva como se ninguém fosse ler, pensando no mundo ideal." />)}
            </Field>
            {ar.hints.map((h) => <p key={h} className="vl-hint"><Icon name="info" size={13} /> {h}</p>)}
          </>
        )}
      </div>
    )
  } else if (step.t === 'score') {
    const d = domain(step.key), ar = area(step.key)
    body = (
      <div className="vl-wz">
        <h2>{d.label}</h2>
        {ar.description && <p className="vl-quote-sm">“{ar.description}”</p>}
        {guide.scores.map((s) => (
          <Field key={s.key} label={s.label} hint={s.help}>
            {() => (<ScorePicker label={`${s.label} em ${d.label}`} value={ar[s.key] ?? null} onChange={(n) => patch(step.key, { [s.key]: n }, 0)} />)}
          </Field>
        ))}
      </div>
    )
  } else if (step.t === 'diagnosis') {
    body = (
      <div className="vl-wz">
        <h2>O ponto cego</h2>
        <p>Procure as áreas com <b>importância alta</b> (8 a 10) e <b>satisfação com a ação baixa</b> (1 a 4), ainda mais quando a preocupação é alta. Essa distância costuma ser a fonte da frustração ou da sensação de estagnação.</p>
        {a.diagnosis.alerts.length
          ? <div className="vl-chips">{a.diagnosis.alerts.map((k) => <span key={k} className="vl-pill vl-pill-warn">{domain(k).label}</span>)}</div>
          : <p className="vl-muted">Nenhuma área bateu os três critérios ao mesmo tempo — olhe as de maior distância abaixo.</p>}
        <Gaps ranked={a.diagnosis.ranked} />
      </div>
    )
  } else if (step.t === 'narrative') {
    body = (
      <div className="vl-wz">
        <h2>Uma frase de direção por área</h2>
        <p className="vl-muted">A narrativa que vai orientar sua conduta. Curta, no presente, como um jeito de ser (não uma meta).</p>
        {a.areas.filter((x) => !x.skipped).map((x) => (
          <Field key={x.domain_key} label={domain(x.domain_key).label}>
            {(c) => (<Input {...c} value={x.narrative ?? ''} onChange={(e) => patch(x.domain_key, { narrative: e.target.value })}
              placeholder={x.description ? `Ex.: ${x.description.split(/[.!?\n]/)[0].slice(0, 90)}` : 'Ser…'} />)}
          </Field>
        ))}
      </div>
    )
  } else if (step.t === 'commit') {
    body = <CommitStep guide={guide} assessment={a} onChange={(c) => setA({ ...a, commitments: c })} />
  } else {
    body = (
      <div className="vl-wz">
        <h2>Pronto</h2>
        <p>Seu mapa fica salvo e passa a fazer parte do contexto da Violet: os conselhos e a revisão semanal vão comparar o que você faz com o que você disse que valoriza.</p>
        <Button variant="primary" icon="check" onClick={() => void finish()}>Concluir a avaliação</Button>
      </div>
    )
  }

  return (
    <Page>
      <div className="vl-wz-top">
        <button type="button" className="ds-back-l" onClick={() => v.goto('values')}><Icon name="left" size={16} /> Valores</button>
        <span className="vl-muted ds-mono">{phase} · {stepIdx + 1}/{steps.length}</span>
      </div>
      <ProgressBar value={((stepIdx + 1) / steps.length) * 100} label="Progresso da avaliação" />
      {body}
      <div className="vl-wz-nav">
        <Button variant="ghost" icon="left" disabled={stepIdx === 0} onClick={back}>Voltar</Button>
        <span className="vl-spacer" />
        {step.t === 'describe' && !area(step.key).skipped && (
          <Button variant="ghost" onClick={() => { patch(step.key, { skipped: true }, 0); next() }}>Pular esta área</Button>
        )}
        {step.t !== 'done' && <Button variant="primary" iconRight="right" onClick={next}>{step.t === 'intro' ? 'Entendi' : 'Próximo'}</Button>}
      </div>
    </Page>
  )
}

function CommitStep({ guide, assessment: a, onChange }: { guide: ValuesGuide; assessment: ValuesAssessment; onChange: (c: ValuesAssessment['commitments']) => void }) {
  const ranked = a.diagnosis.ranked
  const [chosen, setChosen] = useState<string[]>(() => (a.diagnosis.alerts.length ? a.diagnosis.alerts : ranked.slice(0, 2).map((r) => r.domain_key)).slice(0, 3))
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const label = (k: string) => guide.domains.find((d) => d.key === k)?.label ?? k
  async function add(k: string) {
    const text = (drafts[k] ?? '').trim()
    if (!text) return
    try {
      const r = await violetApi.valuesAddCommitment(a.id, k, text)
      onChange([...a.commitments, r.commitment]); setDrafts({ ...drafts, [k]: '' })
    } catch { toast('Não consegui salvar a ação.', { tone: 'error' }) }
  }
  async function remove(id: number) {
    await violetApi.valuesDeleteCommitment(id).catch(() => {})
    onChange(a.commitments.filter((c) => c.id !== id))
  }
  return (
    <div className="vl-wz">
      <h2>Ações compromissadas</h2>
      <p className="vl-muted">Escolha de 1 a 3 áreas críticas. Para cada uma: {guide.key_question.charAt(0).toLowerCase() + guide.key_question.slice(1)}</p>
      <div className="vl-chips">
        {ranked.map((r) => (
          <Chip key={r.domain_key} on={chosen.includes(r.domain_key)} disabled={!chosen.includes(r.domain_key) && chosen.length >= 3}
            onClick={() => setChosen(chosen.includes(r.domain_key) ? chosen.filter((x) => x !== r.domain_key) : [...chosen, r.domain_key])}>
            {r.label}{r.alert ? ' · alerta' : ''}
          </Chip>
        ))}
      </div>
      {chosen.map((k) => (
        <section key={k} className="vl-card">
          <h4 className="vl-card-title">{label(k)}</h4>
          {a.commitments.filter((c) => c.domain_key === k).map((c) => (
            <div key={c.id} className="vl-row"><Icon name="check" size={14} /><span>{c.text}</span><span className="vl-spacer" />
              <Button size="sm" variant="ghost" icon="delete" aria-label={`Remover ${c.text}`} onClick={() => void remove(c.id)} /></div>
          ))}
          <div className="vl-row">
            <Input aria-label={`Ação para ${label(k)}`} placeholder="Algo concreto para a próxima semana…" value={drafts[k] ?? ''}
              onChange={(e) => setDrafts({ ...drafts, [k]: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void add(k) } }} />
            <Button icon="add" disabled={!(drafts[k] ?? '').trim()} onClick={() => void add(k)}>Adicionar</Button>
          </div>
        </section>
      ))}
    </div>
  )
}

function ValuesHistory({ guide }: { guide: ValuesGuide }) {
  const v = useViolet()
  const { state, retry } = useLoad(() => violetApi.valuesHistory(), [v.rev])
  if (state.status === 'loading') return <Page><LoadingState count={3} /></Page>
  if (state.status === 'error') return <Page><ErrorState onRetry={retry} /></Page>
  const { versions, evolution } = state.data
  return (
    <Page>
      <button type="button" className="ds-back-l" onClick={() => v.goto('values')}><Icon name="left" size={16} /> Valores</button>
      <SectionHeader title="Evolução por área" mono={`${versions.length} avaliação(ões)`} />
      {versions.length < 2 && <p className="vl-muted">Com duas avaliações concluídas, a evolução de cada área aparece aqui.</p>}
      <div className="vl-card">
        {guide.domains.filter((d) => evolution[d.key]?.length).map((d) => (
          <div key={d.key} className="vl-rankrow">
            <span>{d.label}</span>
            <span className="ds-mono">{evolution[d.key].map((p) => `${p.satisfaction ?? '—'}`).join(' → ')}</span>
            <span className="vl-muted vl-small">satisfação</span>
          </div>
        ))}
      </div>
      <SectionHeader title="Versões" />
      {versions.map((x) => (
        <div key={x.id} className="vl-card"><b>{x.completed_at ? fmtDate(x.completed_at.slice(0, 10)) : '—'}</b>
          <p className="vl-muted">{x.diagnosis.alerts.length ? `Alertas: ${x.diagnosis.alerts.map((k) => guide.domains.find((d) => d.key === k)?.label).join(', ')}` : 'Sem áreas de alerta'}</p></div>
      ))}
    </Page>
  )
}
