// Os dois rituais do GTD: processar o Inbox (um item por vez: renomear, escolher a lista e decidir — teclas 1 a 6) e a
// revisão semanal guiada em 6 passos (Inbox zero, próximas ações, aguardando, listas, calendário, algum dia). A revisão
// pode ser retomada de onde parou e só conclui depois de ver todos os passos; as listas vencidas pela cadência de revisão
// sobem para o topo e o que está aguardando há muito tempo ganha destaque.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Chip, DatePicker, EmptyState, Field, IconButton, Input, Modal, Select, Textarea, toast } from '../../../design'
import { addDaysISO, fmtDate } from '../../../design/core/format'
import { kaguyaApi } from '../api'
import { useKaguya } from '../context'
import { REVIEW_STEPS } from '../types'
import type { AggregateResponse, DueReviewProject, InboxDecision, Project, ReviewStep, Task, TaskContext, WaitingReviewItem, WeeklyReview } from '../types'
import { ProjectOptions } from './ProjectOptions'

const reason = (e: unknown, fallback: string) => (e instanceof Error && e.message && !/^HTTP \d+$/.test(e.message) ? e.message : fallback)

// ── Processar o Inbox ──────────────────────────────────────────────────────────

const DECISIONS: { key: string; decision: InboxDecision; label: string; icon: 'task' | 'waiting' | 'watchlist' | 'calendar' | 'check' | 'delete'; hint: string }[] = [
  { key: '1', decision: 'next_action', label: 'Próxima ação', icon: 'task', hint: 'Dá para fazer assim que possível' },
  { key: '2', decision: 'waiting', label: 'Aguardando', icon: 'waiting', hint: 'Depende de outra pessoa ou coisa' },
  { key: '3', decision: 'someday', label: 'Algum dia', icon: 'watchlist', hint: 'Ideia para incubar' },
  { key: '4', decision: 'schedule', label: 'Agendar', icon: 'calendar', hint: 'Escolher o dia' },
  { key: '5', decision: 'done', label: 'Feito agora', icon: 'check', hint: 'Levou menos de 2 minutos' },
  { key: '6', decision: 'trash', label: 'Lixo', icon: 'delete', hint: 'Não precisa mais' },
]

export function InboxWizard({ onClose }: { onClose: () => void }) {
  const k = useKaguya()
  const [items, setItems] = useState<Task[] | null>(null)
  const [done, setDone] = useState(0)
  const [skipped, setSkipped] = useState<number[]>([])
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState<'menu' | 'waiting' | 'schedule'>('menu')
  const [title, setTitle] = useState('')
  const [projectId, setProjectId] = useState('')
  const [contextId, setContextId] = useState('')
  const [contexts, setContexts] = useState<TaskContext[]>([])
  const [note, setNote] = useState('')
  const [when, setWhen] = useState(k.today)

  const load = useCallback(async () => { setItems((await kaguyaApi.inboxQueue()).items) }, [])
  useEffect(() => { void load().catch(() => toast('Não foi possível carregar o Inbox.', { tone: 'error' })) }, [load])
  useEffect(() => { kaguyaApi.listContexts().then(setContexts).catch(() => setContexts([])) }, [])

  const queue = (items ?? []).filter((t) => !skipped.includes(t.id))
  const current = queue[0] ?? null
  const total = done + queue.length
  useEffect(() => { setTitle(current?.title ?? ''); setStep('menu'); setNote(''); setWhen(k.today); setProjectId(''); setContextId('') }, [current?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const apply = useCallback(async (decision: InboxDecision, extra: Record<string, unknown> = {}) => {
    if (!current) return
    setBusy(true)
    try {
      // Renomear vale para qualquer decisão: o título editado grava antes.
      if (title.trim() && title.trim() !== current.title) await kaguyaApi.updateTask(current.id, { title: title.trim() })
      const r = await kaguyaApi.processInboxItem(current.id, {
        decision,
        project_id: projectId ? Number(projectId) : null,
        context_id: decision === 'next_action' && contextId ? Number(contextId) : null,
        ...extra,
      })
      if (r.status === 'error') { toast(r.message ?? 'Não foi possível processar o item.', { tone: 'error' }); return }
      setDone((d) => d + 1)
      k.reload()
      await load()
    } catch (e) { toast(reason(e, 'Não foi possível processar o item.'), { tone: 'error' }) } finally { setBusy(false) }
  }, [current, title, projectId, contextId, k, load])

  const choose = (decision: InboxDecision) => {
    if (decision === 'waiting') setStep('waiting')
    else if (decision === 'schedule') setStep('schedule')
    else void apply(decision)
  }

  // Teclas 1–6 escolhem a decisão (a menos que o foco esteja num campo de texto).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (busy || !current || step !== 'menu' || e.ctrlKey || e.metaKey || e.altKey) return
      const t = e.target as HTMLElement
      if (t.closest('input, textarea, select')) return
      const d = DECISIONS.find((x) => x.key === e.key)
      if (d) { e.preventDefault(); choose(d.decision) }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  return (
    <Modal title="Processar o Inbox" size="md" onClose={onClose} footer={<Button variant={current ? 'ghost' : 'primary'} onClick={onClose}>{current ? 'Fechar' : 'Concluir'}</Button>}>
      {items === null && <p className="ds-hint">Carregando…</p>}
      {items !== null && !current && (
        <EmptyState icon="inbox" title={done > 0 ? 'Inbox zerada' : 'Nada para processar'} hint={done > 0 ? `${done} item(ns) clarificado(s). Nada mais pendente no Inbox.` : 'O Inbox não tem itens pendentes de processamento.'} />
      )}
      {current && (
        <>
          <p className="ds-mono ds-hint">{done + 1} de {total}</p>
          <Field label="O que é isto?">{(c) => <Input {...c} value={title} onChange={(e) => setTitle(e.target.value)} />}</Field>
          {current.description && <p className="ds-hint">{current.description}</p>}
          <div className="kn-props">
            <Field label="Mover para a lista" hint="Opcional">{(c) => (
              <Select {...c} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">Continuar no Inbox</option>
                <ProjectOptions projects={k.projects.filter((p: Project) => !p.is_inbox)} groups={k.groups} />
              </Select>
            )}</Field>
            {contexts.length > 0 && (
              <Field label="Onde (@)" hint="Só para “próxima ação”">{(c) => (
                <Select {...c} value={contextId} onChange={(e) => setContextId(e.target.value)}>
                  <option value="">Sem local</option>
                  {contexts.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </Select>
              )}</Field>
            )}
          </div>

          {step === 'menu' && (
            <div className="kn-decisions" role="group" aria-label="Decisão">
              {DECISIONS.map((d) => (
                <Button key={d.decision} icon={d.icon} variant={d.decision === 'done' ? 'primary' : 'default'} disabled={busy} title={d.hint} kbd={d.key} onClick={() => choose(d.decision)}>{d.label}</Button>
              ))}
              <Button variant="ghost" disabled={busy} onClick={() => setSkipped((s) => [...s, current.id])}>Pular</Button>
            </div>
          )}
          {step === 'waiting' && (
            <>
              <Field label="Por quem ou o quê você espera? (opcional)">{(c) => <Input {...c} autoFocus value={note} placeholder="Ex.: orçamento do João" onChange={(e) => setNote(e.target.value)} />}</Field>
              <div className="kn-quick"><Button variant="ghost" onClick={() => setStep('menu')}>Voltar</Button><Button variant="primary" disabled={busy} onClick={() => void apply('waiting', { waiting_note: note || null })}>Confirmar</Button></div>
            </>
          )}
          {step === 'schedule' && (
            <>
              <Field label="Para quando?">{(c) => <DatePicker id={c.id} value={when} onChange={setWhen} />}</Field>
              <div className="kn-quick"><Button variant="ghost" onClick={() => setStep('menu')}>Voltar</Button><Button variant="primary" disabled={busy || !when} onClick={() => void apply('schedule', { due_date: when })}>Confirmar</Button></div>
            </>
          )}
        </>
      )}
    </Modal>
  )
}

// ── Revisão semanal ────────────────────────────────────────────────────────────

const STEP_ICON: Record<ReviewStep, 'inbox' | 'task' | 'waiting' | 'folder' | 'calendar' | 'watchlist'> = {
  inbox: 'inbox', next_actions: 'task', waiting: 'waiting', lists: 'folder', calendar: 'calendar', someday: 'watchlist',
}

function Rows<T>({ items, empty, render }: { items: T[] | null; empty: string; render: (item: T) => React.ReactNode }) {
  if (items === null) return <p className="ds-hint">Carregando…</p>
  if (items.length === 0) return <EmptyState icon="success" title={empty} />
  return <ul className="kn-sublist">{items.map(render)}</ul>
}

export function WeeklyReviewModal({ onClose }: { onClose: () => void }) {
  const k = useKaguya()
  const [review, setReview] = useState<WeeklyReview | null>(null)
  const [step, setStep] = useState<ReviewStep>('inbox')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [missing, setMissing] = useState<ReviewStep[] | null>(null)
  const [inbox, setInbox] = useState<Task[] | null>(null)
  const [next, setNext] = useState<Task[] | null>(null)
  const [waiting, setWaiting] = useState<WaitingReviewItem[] | null>(null)
  const [lists, setLists] = useState<{ project: Project; due?: DueReviewProject }[] | null>(null)
  const [cal, setCal] = useState<{ past: { tasks: Task[]; agg: AggregateResponse }; ahead: { tasks: Task[]; agg: AggregateResponse } } | null>(null)
  const [someday, setSomeday] = useState<Task[] | null>(null)
  const [editing, setEditing] = useState<{ id: number; note: string } | null>(null)

  useEffect(() => {
    void kaguyaApi.reviewStart().then((r) => {
      setReview(r)
      setNote(r.note ?? '')
      setStep(REVIEW_STEPS.find((s) => !r.steps_seen.includes(s.key))?.key ?? 'inbox')
    }).catch((e) => toast(reason(e, 'Não foi possível iniciar a revisão.'), { tone: 'error' }))
  }, [])

  const loadStep = useCallback(async (s: ReviewStep) => {
    try {
      if (s === 'inbox') setInbox((await kaguyaApi.inboxQueue()).items)
      else if (s === 'next_actions') setNext(await kaguyaApi.builtinTasks('next-actions', k.space))
      else if (s === 'waiting') setWaiting(await kaguyaApi.reviewWaitingOrdered())
      else if (s === 'lists') {
        const [sidebar, due] = await Promise.all([kaguyaApi.sidebar(), kaguyaApi.dueReview().catch(() => [] as DueReviewProject[])])
        const dueBy = new Map(due.map((d) => [d.id, d]))
        // Vencidas pela cadência primeiro; depois as nunca revisadas e as revisadas há mais tempo.
        const sorted = [...sidebar.projects].sort((a, b) => Number(dueBy.has(b.id)) - Number(dueBy.has(a.id)) || (a.last_reviewed_at ?? '').localeCompare(b.last_reviewed_at ?? ''))
        setLists(sorted.map((project) => ({ project, due: dueBy.get(project.id) })))
      } else if (s === 'calendar') {
        const back = addDaysISO(k.today, -7)
        const ahead = addDaysISO(k.today, 7)
        const [aggPast, tasksPast, aggAhead, tasksAhead] = await Promise.all([
          kaguyaApi.calendarAggregate(back, k.today), kaguyaApi.calendar(back, k.today, undefined, k.space), kaguyaApi.calendarAggregate(k.today, ahead), kaguyaApi.calendar(k.today, ahead, undefined, k.space),
        ])
        setCal({ past: { agg: aggPast, tasks: tasksPast }, ahead: { agg: aggAhead, tasks: tasksAhead } })
      } else if (s === 'someday') setSomeday(await kaguyaApi.builtinTasks('someday', k.space))
    } catch { toast('Não foi possível carregar os dados do passo.', { tone: 'error' }) }
  }, [k.today, k.space])

  useEffect(() => {
    if (!review) return
    void kaguyaApi.reviewMarkStep(review.id, step).then((r) => { if (r.steps_seen) setReview((p) => p && { ...p, steps_seen: r.steps_seen! }) }).catch(() => undefined)
    void loadStep(step)
  }, [step, review?.id, loadStep]) // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (fn: () => Promise<{ status?: string; message?: string } | unknown>, fallback: string) => {
    setBusy(true)
    try {
      const r = (await fn()) as { status?: string; message?: string }
      if (r?.status === 'error') { toast(r.message ?? fallback, { tone: 'error' }); return }
      await loadStep(step)
      k.reload()
    } catch (e) { toast(reason(e, fallback), { tone: 'error' }) } finally { setBusy(false) }
  }
  const complete = async () => {
    if (!review) return
    setBusy(true)
    try {
      const r = await kaguyaApi.reviewComplete(review.id, note || null)
      if (r.error === 'steps_pending') { setMissing(r.missing ?? []); return }
      if (r.status === 'error') { toast('Não foi possível concluir a revisão.', { tone: 'error' }); return }
      toast('Revisão concluída. Até a próxima semana.', { tone: 'success' })
      k.reload()
      onClose()
    } catch (e) { toast(reason(e, 'Não foi possível concluir a revisão.'), { tone: 'error' }) } finally { setBusy(false) }
  }
  const idx = useMemo(() => REVIEW_STEPS.findIndex((s) => s.key === step), [step])

  const taskRow = (t: Task, actions: React.ReactNode) => (
    <li key={t.id}><button type="button" className="kn-main" onClick={() => k.openTask(t.id)}><span className="kn-title">{t.title}</span></button>{actions}</li>
  )
  const week = (w: { tasks: Task[]; agg: AggregateResponse }) => (w.tasks.length + w.agg.items.length === 0
    ? <p className="ds-hint">Nada nessa janela.</p>
    : (
      <ul className="kn-sublist">
        {w.tasks.map((t) => <li key={`t${t.id}`}><span className="kn-title">{t.title}</span>{t.due_date && <span className="ds-mono">{fmtDate(t.due_date)}</span>}</li>)}
        {w.agg.items.map((it, i) => <li key={`a${i}`}><span className="kn-title">{it.title}</span><span className="ds-mono">{fmtDate(it.date)}</span></li>)}
      </ul>
    ))

  return (
    <Modal
      title={`Revisão semanal${review?.resumed ? ' — retomada' : ''}`}
      size="lg"
      onClose={onClose}
      footer={(
        <>
          <span className="ds-mono ds-hint">Passo {idx + 1} de {REVIEW_STEPS.length}</span>
          <Button variant="primary" disabled={busy || !review} onClick={() => void complete()}>Concluir revisão</Button>
        </>
      )}
    >
      {review?.resumed && <p className="ds-hint">Em andamento desde {fmtDate(review.started_at.slice(0, 10))}.</p>}
      <div className="kn-chips" role="group" aria-label="Passos da revisão">
        {REVIEW_STEPS.map((s, i) => (
          <Chip key={s.key} on={s.key === step} icon={review?.steps_seen.includes(s.key) ? 'check' : STEP_ICON[s.key]} aria-pressed={s.key === step} onClick={() => setStep(s.key)}>{i + 1}. {s.name}</Chip>
        ))}
      </div>

      <div className="kn-rev-body">
        {!review && <p className="ds-hint">Carregando…</p>}
        {review && step === 'inbox' && (
          <>
            <Rows items={inbox} empty="Inbox zerada" render={(t) => taskRow(t, <span className="kn-quick-i">
              <IconButton icon="task" label={`Próxima ação: ${t.title}`} size={14} disabled={busy} onClick={() => void act(() => kaguyaApi.processInboxItem(t.id, { decision: 'next_action' }), 'Não foi possível processar.')} />
              <IconButton icon="waiting" label={`Aguardando: ${t.title}`} size={14} disabled={busy} onClick={() => void act(() => kaguyaApi.processInboxItem(t.id, { decision: 'waiting' }), 'Não foi possível processar.')} />
              <IconButton icon="watchlist" label={`Algum dia: ${t.title}`} size={14} disabled={busy} onClick={() => void act(() => kaguyaApi.processInboxItem(t.id, { decision: 'someday' }), 'Não foi possível processar.')} />
              <IconButton icon="check" label={`Feito: ${t.title}`} size={14} disabled={busy} onClick={() => void act(() => kaguyaApi.processInboxItem(t.id, { decision: 'done' }), 'Não foi possível processar.')} />
              <IconButton icon="delete" label={`Lixo: ${t.title}`} size={14} disabled={busy} onClick={() => void act(() => kaguyaApi.processInboxItem(t.id, { decision: 'trash' }), 'Não foi possível processar.')} />
            </span>)} />
          </>
        )}
        {review && step === 'next_actions' && (
          <Rows items={next} empty="Nenhuma próxima ação pendente" render={(t) => taskRow(t, <Button size="sm" icon="check" disabled={busy} aria-label={`Concluir ${t.title}`} onClick={() => void act(() => kaguyaApi.complete(t.id), 'Não foi possível concluir.')}>Concluir</Button>)} />
        )}
        {review && step === 'waiting' && (
          <Rows
            items={waiting}
            empty="Nada aguardando resposta"
            render={(t) => (
              <li key={t.id} className="kn-rev-wait">
                <button type="button" className="kn-main" onClick={() => k.openTask(t.id)}>
                  <span className="kn-title">{t.title}</span>
                  <span className="ds-hint">{t.days_waiting != null ? `há ${t.days_waiting} dia(s)` : ''}{t.waiting_note ? ` — ${t.waiting_note}` : ''}</span>
                </button>
                {t.days_waiting != null && t.days_waiting >= 7 && <Chip on icon="warning">Cobrar</Chip>}
                <span className="kn-quick-i">
                  <IconButton icon="edit" label={`Editar a nota de ${t.title}`} size={14} disabled={busy} onClick={() => setEditing({ id: t.id, note: t.waiting_note ?? '' })} />
                  <IconButton icon="check" label={`Concluir ${t.title}`} size={14} disabled={busy} onClick={() => void act(() => kaguyaApi.complete(t.id), 'Não foi possível concluir.')} />
                  <IconButton icon="back" label={`Desistir de esperar ${t.title}`} size={14} disabled={busy} onClick={() => void act(() => kaguyaApi.updateTask(t.id, { gtd_status: 'next_action' }), 'Não foi possível mover.')} />
                </span>
                {editing?.id === t.id && (
                  <div className="kn-quick-i kn-rev-edit">
                    <Input aria-label="Nota da espera" autoFocus value={editing.note} placeholder="Por quem ou o quê espera" onChange={(e) => setEditing({ id: t.id, note: e.target.value })} />
                    <Button variant="primary" disabled={busy} onClick={() => void act(async () => { await kaguyaApi.updateTask(t.id, { waiting_note: editing.note || null }); setEditing(null) }, 'Não foi possível salvar.')}>Salvar</Button>
                  </div>
                )}
              </li>
            )}
          />
        )}
        {review && step === 'lists' && (
          <Rows
            items={lists}
            empty="Nenhuma lista para revisar"
            render={({ project: p, due }) => (
              <li key={p.id}>
                <span className="kn-main"><span className="kn-title">{p.name}</span><span className="ds-hint">{p.open_count} aberta(s) — {p.last_reviewed_at ? `revisada em ${fmtDate(p.last_reviewed_at.slice(0, 10))}` : 'nunca revisada'}</span></span>
                {due && <Chip on icon="warning">Venceu há {due.days_overdue}d (a cada {due.review_interval_days}d)</Chip>}
                <Button size="sm" icon="check" disabled={busy} aria-label={`Marcar ${p.name} como revisada`} onClick={() => void act(() => kaguyaApi.markProjectReviewed(p.id), 'Não foi possível marcar.')}>Revisada</Button>
              </li>
            )}
          />
        )}
        {review && step === 'calendar' && (
          <div>
            <h3 className="kn-h3">Semana passada</h3>{cal ? week(cal.past) : <p className="ds-hint">Carregando…</p>}
            <h3 className="kn-h3">Semana que vem</h3>{cal ? week(cal.ahead) : null}
          </div>
        )}
        {review && step === 'someday' && (
          <Rows items={someday} empty="Nada em incubação" render={(t) => taskRow(t, <span className="kn-quick-i">
            <IconButton icon="task" label={`Promover a próxima ação: ${t.title}`} size={14} disabled={busy} onClick={() => void act(() => kaguyaApi.updateTask(t.id, { gtd_status: 'next_action' }), 'Não foi possível promover.')} />
            <IconButton icon="delete" label={`Excluir ${t.title}`} size={14} disabled={busy} onClick={() => void act(async () => { await kaguyaApi.remove(t.id); toast('Enviada para a lixeira.', { tone: 'success' }) }, 'Não foi possível excluir.')} />
          </span>)} />
        )}
      </div>

      {missing && missing.length > 0 && <p className="kn-err" role="alert">Passos ainda não vistos: {missing.map((m) => REVIEW_STEPS.find((s) => s.key === m)?.name).join(', ')}.</p>}
      <Field label="Nota final (opcional)">{(c) => <Textarea {...c} rows={2} value={note} placeholder="O que você aprendeu esta semana?" onChange={(e) => setNote(e.target.value)} />}</Field>
    </Modal>
  )
}
