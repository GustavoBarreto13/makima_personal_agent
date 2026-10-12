// Experimentos (Tiny Experiments): testes com prazo. A aderência mede o esforço e perdoa uma falha isolada. A lista traz os
// ativos/pausados (com “Fiz hoje” rápido) e os concluídos com o veredicto; o detalhe (DetailPage do DS) tem o tracker de
// check-ins por período (com backfill e correção) e a revisão de encerramento.

import { useCallback, useState } from 'react'
import { Button, Chip, DatePicker, DetailPage, EmptyState, ErrorState, Field, Icon, IconButton, Input, LoadingState, Page, ProgressBar, SectionHeader, Textarea, toast } from '../../../design'
import { getAgent } from '../../../design/core/agents'
import { fmtDate } from '../../../design/core/format'
import { kaguyaApi } from '../api'
import { ExperimentModal } from '../components/GoalModals'
import { useKaguya } from '../context'
import { useLoad } from '../lib/useLoad'
import type { Experiment, ExperimentLog, ExperimentVerdict } from '../types'

const HUE = getAgent('kaguya').hue
const VERDICTS: { value: ExperimentVerdict; label: string }[] = [{ value: 'persist', label: 'Persistir' }, { value: 'pause', label: 'Pausar' }, { value: 'pivot', label: 'Pivotar' }]
const VERDICT_LABEL = Object.fromEntries(VERDICTS.map((v) => [v.value, v.label])) as Record<ExperimentVerdict, string>
const reason = (e: unknown, fallback: string) => (e instanceof Error && e.message && !/^HTTP \d+$/.test(e.message) ? e.message : fallback)

const cadenceLabel = (c: string) => (c === 'weekly' ? 'Semanal' : 'Diária')
export function expDeadline(e: Pick<Experiment, 'is_overdue' | 'days_remaining'>): string {
  if (e.is_overdue) return `atrasado ${Math.abs(e.days_remaining)}d`
  if (e.days_remaining === 0) return 'termina hoje'
  if (e.days_remaining < 0) return 'encerrado'
  return `faltam ${e.days_remaining}d`
}

function Card({ exp, onOpen, onCheckin }: { exp: Experiment; onOpen: (id: number) => void; onCheckin: (e: Experiment) => void }) {
  const done = exp.status === 'completed'
  return (
    <article className={`kn-goal${done ? ' kn-goal-closed' : ''}`} aria-label={exp.title}>
      <div className="kn-goal-h">
        <button type="button" className="kn-goal-title" onClick={() => onOpen(exp.id)}>{exp.title}</button>
        {exp.status === 'paused' && <Chip on icon="pause">Pausado</Chip>}
        {exp.is_overdue && <Chip on icon="warning">Atrasado</Chip>}
        {done && exp.verdict && <Chip on>{VERDICT_LABEL[exp.verdict]}</Chip>}
      </div>
      {exp.why && <p className="ds-hint">{exp.why}</p>}
      <p className="ds-mono kn-goal-meta">{[cadenceLabel(exp.cadence), done ? `aderência final ${exp.adherence_pct}%` : expDeadline(exp), exp.goal_title ? `meta: ${exp.goal_title}` : ''].filter(Boolean).join(' · ')}</p>
      <ProgressBar value={exp.adherence_pct} label={`Aderência de ${exp.title}: ${exp.adherence_pct}% (${exp.periods_done} de ${exp.periods_expected})`} />
      <p className="ds-hint">Aderência {exp.adherence_pct}% · {exp.periods_done}/{exp.periods_expected}</p>
      {done && exp.review && <p>“{exp.review}”</p>}
      {exp.status === 'active' && (
        <div className="kn-quick-i">
          {exp.logged_current
            ? <Chip on icon="check">Registrado no período</Chip>
            : <Button icon="check" onClick={() => onCheckin(exp)}>Fiz hoje</Button>}
          <Button variant="ghost" onClick={() => onOpen(exp.id)}>Detalhe</Button>
        </div>
      )}
    </article>
  )
}

export function Experiments() {
  const k = useKaguya()
  const { state, retry } = useLoad(() => kaguyaApi.experiments.list(true), [k.rev])
  const [modal, setModal] = useState(false)
  const open = (id: number) => k.goto({ view: 'experiments', id })
  const checkin = async (e: Experiment) => {
    try { await kaguyaApi.experiments.log(e.id, { period_date: k.today, done: true }); toast('Check-in de hoje registrado.', { tone: 'success' }); k.reload() }
    catch (err) { toast(reason(err, 'Não foi possível registrar o check-in.'), { tone: 'error' }) }
  }
  return (
    <Page wide className="kn-page">
      <div className="kn-quick">
        <p className="ds-hint">Testes com prazo — a aderência mede o esforço e perdoa uma falha isolada.</p>
        <Button variant="primary" icon="add" onClick={() => setModal(true)}>Novo experimento</Button>
      </div>
      {state.status === 'loading' && <LoadingState variant="card" count={3} />}
      {state.status === 'error' && <ErrorState onRetry={retry} />}
      {state.status === 'ok' && (state.data.length === 0
        ? <EmptyState icon="experiment" title="Nenhum experimento ainda" hint="Crie o primeiro para testar uma mudança por um tempo definido." action={<Button variant="primary" icon="add" onClick={() => setModal(true)}>Novo experimento</Button>} />
        : (
          <>
            <div className="kn-goals" aria-label="Ativos e pausados">
              {state.data.filter((e) => e.status !== 'completed').map((e) => <Card key={e.id} exp={e} onOpen={open} onCheckin={(x) => void checkin(x)} />)}
            </div>
            {state.data.some((e) => e.status === 'completed') && (
              <section aria-label="Concluídos">
                <SectionHeader title="Concluídos" />
                <div className="kn-goals">{state.data.filter((e) => e.status === 'completed').map((e) => <Card key={e.id} exp={e} onOpen={open} onCheckin={() => {}} />)}</div>
              </section>
            )}
          </>
        ))}
      {modal && <ExperimentModal onClose={() => setModal(false)} onSaved={k.reload} />}
    </Page>
  )
}

const feelingLabel = (n: number | null) => (n == null ? '—' : `${n}/5`)

export function ExperimentDetail({ id }: { id: number }) {
  const k = useKaguya()
  const { state, retry } = useLoad(() => kaguyaApi.experiments.get(id), [id, k.rev])
  const [tab, setTab] = useState('tracker')
  const [editing, setEditing] = useState(false)
  const [date, setDate] = useState(k.today)
  const [done, setDone] = useState(true)
  const [feeling, setFeeling] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [verdict, setVerdict] = useState<ExperimentVerdict | null>(null)
  const [review, setReview] = useState('')
  const [concluding, setConcluding] = useState(false)
  const back = useCallback(() => k.goto({ view: 'experiments' }), [k])

  const run = async (fn: () => Promise<unknown>, fallback: string, ok?: string) => {
    try { await fn(); if (ok) toast(ok, { tone: 'success' }); k.reload(); return true } catch (e) { toast(reason(e, fallback), { tone: 'error' }); return false }
  }

  if (state.status === 'loading') return <Page wide><LoadingState variant="card" count={2} /></Page>
  if (state.status === 'error') return <Page wide><ErrorState onRetry={retry} /></Page>
  const exp = state.data
  const completed = exp.status === 'completed'
  const logs = exp.logs ?? []

  // Corrigir um check-in: o período é grampeado em [início, fim] — na cadência semanal o registro guarda a segunda-feira,
  // que pode ser ANTES do início (semana parcial) e o backend recusaria reenviá-la.
  const editLog = (log: ExperimentLog) => {
    setDate(log.period_date < exp.start_date ? exp.start_date : log.period_date > exp.end_date ? exp.end_date : log.period_date)
    setDone(log.done); setFeeling(log.feeling); setNote(log.note ?? '')
  }
  const submitCheckin = async () => {
    if (!date) { toast('Escolha uma data.', { tone: 'error' }); return }
    if (await run(() => kaguyaApi.experiments.log(id, { period_date: date, done, feeling, note: note.trim() || null }), 'Não foi possível registrar o check-in.', 'Check-in registrado.')) {
      setFeeling(null); setNote(''); setDone(true)
    }
  }
  const conclude = async () => {
    if (!verdict) { toast('Escolha um veredicto.', { tone: 'error' }); return }
    if (!review.trim()) { toast('Escreva o aprendizado.', { tone: 'error' }); return }
    setConcluding(true)
    await run(() => kaguyaApi.experiments.review(id, { verdict, review: review.trim() }), 'Não foi possível concluir o experimento.', 'Experimento concluído.')
    setConcluding(false)
  }

  const tracker = (
    <>
      <ProgressBar value={exp.adherence_pct} label={`Aderência: ${exp.adherence_pct}%`} />
      <p className="ds-hint">Aderência {exp.adherence_pct}% · {exp.periods_done}/{exp.periods_expected} períodos</p>
      {(exp.why || exp.hypothesis) && (
        <div>{exp.why && <p><b>Por quê:</b> {exp.why}</p>}{exp.hypothesis && <p><b>Hipótese:</b> {exp.hypothesis}</p>}</div>
      )}
      {logs.length === 0 ? <p className="ds-hint">Nenhum check-in ainda.</p> : (
        <table className="kn-tracker">
          <caption className="ds-hint">Check-ins por período</caption>
          <thead><tr><th scope="col">Período</th><th scope="col">Fez?</th><th scope="col">Sensação</th><th scope="col">Nota</th><th scope="col"><span className="kn-sr">Ações</span></th></tr></thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td>{fmtDate(log.period_date)}</td>
                <td><Icon name={log.done ? 'check' : 'close'} size={14} aria-label={log.done ? 'Fez' : 'Não fez'} /></td>
                <td className="ds-mono">{feelingLabel(log.feeling)}</td>
                <td>{log.note ?? '—'}</td>
                <td>
                  {!completed && (
                    <span className="kn-quick-i">
                      <IconButton icon="edit" label={`Corrigir o check-in de ${fmtDate(log.period_date)}`} size={14} onClick={() => editLog(log)} />
                      <IconButton icon="delete" label={`Remover o check-in de ${fmtDate(log.period_date)}`} size={14} onClick={() => void run(() => kaguyaApi.experiments.removeLog(id, log.period_date), 'Não foi possível remover o check-in.', 'Check-in removido.')} />
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!completed && (
        <section aria-label="Registrar check-in">
          <SectionHeader title="Registrar ou corrigir um check-in" />
          <div className="kn-props">
            <Field label="Dia">{(c) => <DatePicker id={c.id} value={date} onChange={setDate} />}</Field>
            <Field label="Fez?">{() => (
              <div className="kn-chips" role="group" aria-label="Fez?">
                <Chip on={done} aria-pressed={done} onClick={() => setDone(true)}>Sim</Chip>
                <Chip on={!done} aria-pressed={!done} onClick={() => setDone(false)}>Não</Chip>
              </div>
            )}</Field>
            <Field label="Sensação">{() => (
              <div className="kn-chips" role="group" aria-label="Sensação de 1 a 5">
                {[1, 2, 3, 4, 5].map((n) => <Chip key={n} on={feeling === n} aria-pressed={feeling === n} aria-label={`Sensação ${n}`} onClick={() => setFeeling(feeling === n ? null : n)}>{n}</Chip>)}
              </div>
            )}</Field>
          </div>
          <Field label="Nota (opcional)">{(c) => <Input {...c} value={note} placeholder="Como foi?" onChange={(e) => setNote(e.target.value)} />}</Field>
          <div><Button variant="primary" onClick={() => void submitCheckin()}>Salvar check-in</Button></div>
        </section>
      )}
    </>
  )

  const revisao = completed ? (
    <>
      {exp.verdict && <Chip on>{VERDICT_LABEL[exp.verdict]}</Chip>}
      {exp.review ? <p>“{exp.review}”</p> : <p className="ds-hint">Sem texto de revisão.</p>}
    </>
  ) : (
    <>
      <p className="ds-hint">Encerrar com um veredicto e o que você aprendeu.</p>
      <div className="kn-chips" role="group" aria-label="Veredicto">
        {VERDICTS.map((v) => <Chip key={v.value} on={verdict === v.value} aria-pressed={verdict === v.value} onClick={() => setVerdict(v.value)}>{v.label}</Chip>)}
      </div>
      <Textarea aria-label="O que você aprendeu com este experimento?" rows={3} placeholder="O que você aprendeu com este experimento?" value={review} onChange={(e) => setReview(e.target.value)} />
      <div><Button variant="primary" disabled={concluding} onClick={() => void conclude()}>{concluding ? 'Concluindo…' : 'Concluir experimento'}</Button></div>
    </>
  )

  return (
    <Page wide className="kn-page">
      <DetailPage
        backLabel="Experimentos"
        onBack={back}
        title={exp.title}
        subtitle={`${cadenceLabel(exp.cadence)} · ${fmtDate(exp.start_date)} → ${fmtDate(exp.end_date)}${!completed ? ` · ${expDeadline(exp)}` : ''}`}
        chips={<>{exp.status === 'paused' && <Chip on icon="pause">Pausado</Chip>}{exp.is_overdue && <Chip on icon="warning">Atrasado</Chip>}{completed && <Chip on>Concluído</Chip>}{exp.goal_title && <Chip on icon="goal">{exp.goal_title}</Chip>}</>}
        icon="experiment"
        hue={HUE}
        actions={(
          <>
            {!completed && (exp.status === 'paused'
              ? <Button icon="play" onClick={() => void run(() => kaguyaApi.experiments.resume(id), 'Não foi possível retomar.', 'Experimento retomado.')}>Retomar</Button>
              : <Button icon="pause" onClick={() => void run(() => kaguyaApi.experiments.pause(id), 'Não foi possível pausar.', 'Experimento pausado.')}>Pausar</Button>)}
            <Button icon="edit" onClick={() => setEditing(true)}>Editar</Button>
          </>
        )}
        tabs={[{ id: 'tracker', label: 'Tracker', content: tracker }, { id: 'revisao', label: 'Revisão', content: revisao }]}
        tab={tab}
        onTab={setTab}
      />
      {editing && <ExperimentModal experiment={exp} onClose={() => setEditing(false)} onSaved={k.reload} onDeleted={back} />}
    </Page>
  )
}
