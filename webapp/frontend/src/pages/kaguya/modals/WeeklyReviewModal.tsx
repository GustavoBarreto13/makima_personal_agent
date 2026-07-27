// WeeklyReviewModal — revisão semanal guiada em 6 passos (spec 035).
// Ao abrir, inicia OU retoma a revisão aberta (POST /reviews/start) — se retomada (US2),
// pula direto para o primeiro passo ainda não visto. Cada passo consulta dados AO VIVO
// (nenhum snapshot) e aplica ações com efeito IMEDIATO no sistema (FR-002) reusando as
// mesmas tools das telas normais (process_inbox_item, update_task, complete_task, etc.).
// Passo aberto = passo marcado como visto (PATCH .../step); concluir exige os 6 vistos.

import { useEffect, useMemo, useState } from 'react'
import type {
  ReviewStep, WeeklyReview, Task, WaitingReviewItem, Project, AggregateResponse,
} from '../types'
import { REVIEW_STEPS } from '../types'
import { kaguyaApi } from '../kaguyaApi'
import { Icon } from '../ui/Icons'
import { todayISO, addDays, toISO, fmtDateLabel } from '../lib/dateUtils'

interface WeeklyReviewModalProps {
  onClose: () => void
  onChanged: () => void   // pai re-busca sidebar/contadores após qualquer ação
  toast: (msg: string, kind?: 'ok' | 'err') => void
}

export function WeeklyReviewModal({ onClose, onChanged, toast }: WeeklyReviewModalProps) {
  const [review, setReview] = useState<WeeklyReview | null>(null)
  const [step, setStep] = useState<ReviewStep>('inbox')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  // Dados de cada passo (carregados sob demanda, quando o passo fica ativo).
  const [inboxItems, setInboxItems] = useState<Task[] | null>(null)
  const [nextActions, setNextActions] = useState<Task[] | null>(null)
  const [waitingItems, setWaitingItems] = useState<WaitingReviewItem[] | null>(null)
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [pastWeek, setPastWeek] = useState<{ agg: AggregateResponse; tasks: Task[] } | null>(null)
  const [nextWeek, setNextWeek] = useState<{ agg: AggregateResponse; tasks: Task[] } | null>(null)
  const [somedayItems, setSomedayItems] = useState<Task[] | null>(null)

  // Formulário inline do passo "Aguardando" (editar a nota de espera de um item por vez).
  const [editingWaitingId, setEditingWaitingId] = useState<number | null>(null)
  const [waitingNoteDraft, setWaitingNoteDraft] = useState('')

  // Inicia/retoma a revisão ao abrir o modal.
  useEffect(() => {
    (async () => {
      const r = await kaguyaApi.reviewStart()
      setReview(r)
      setNote(r.note ?? '')
      // Retomada (US2): pula para o primeiro passo ainda não visto.
      const firstPending = REVIEW_STEPS.find((s) => !r.steps_seen.includes(s.key))
      setStep(firstPending ? firstPending.key : 'inbox')
    })()
  }, [])

  // Marca o passo atual como visto (idempotente) e carrega seus dados, sempre que o passo muda.
  useEffect(() => {
    if (!review) return
    kaguyaApi.reviewMarkStep(review.id, step).then((r) => {
      if (r.steps_seen) setReview((prev) => prev && { ...prev, steps_seen: r.steps_seen! })
    })
    loadStepData(step)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, review?.id])

  const loadStepData = async (s: ReviewStep) => {
    try {
      if (s === 'inbox') setInboxItems((await kaguyaApi.inboxQueue()).items)
      else if (s === 'next_actions') setNextActions(await kaguyaApi.builtinTasks('next-actions'))
      else if (s === 'waiting') setWaitingItems(await kaguyaApi.reviewWaitingOrdered())
      else if (s === 'lists') {
        const sidebar = await kaguyaApi.sidebar()
        const sorted = [...sidebar.projects].sort((a, b) => {
          if (!a.last_reviewed_at && !b.last_reviewed_at) return 0
          if (!a.last_reviewed_at) return -1
          if (!b.last_reviewed_at) return 1
          return a.last_reviewed_at.localeCompare(b.last_reviewed_at)
        })
        setProjects(sorted)
      } else if (s === 'calendar') {
        const today = todayISO()
        const weekAgo = toISO(addDays(new Date(), -7))
        const weekAhead = toISO(addDays(new Date(), 7))
        const [aggPast, tasksPast, aggNext, tasksNext] = await Promise.all([
          kaguyaApi.calendarAggregate(weekAgo, today),
          kaguyaApi.calendar(weekAgo, today),
          kaguyaApi.calendarAggregate(today, weekAhead),
          kaguyaApi.calendar(today, weekAhead),
        ])
        setPastWeek({ agg: aggPast, tasks: tasksPast })
        setNextWeek({ agg: aggNext, tasks: tasksNext })
      } else if (s === 'someday') setSomedayItems(await kaguyaApi.builtinTasks('someday'))
    } catch {
      toast('Falha ao carregar os dados do passo.', 'err')
    }
  }

  const refreshCurrentStep = async () => { await loadStepData(step); onChanged() }

  // ── Ações do passo 1 (Inbox) — mesmas 6 decisões da InboxProcessModal (spec 034) ──
  const processInbox = async (taskId: number, decision: Parameters<typeof kaguyaApi.processInboxItem>[1]['decision'], extra: Record<string, unknown> = {}) => {
    setBusy(true)
    try {
      const r = await kaguyaApi.processInboxItem(taskId, { decision, ...extra })
      if (r.status === 'error') { toast(r.message ?? 'Falha ao processar.', 'err'); return }
      await refreshCurrentStep()
    } finally { setBusy(false) }
  }

  // ── Ações do passo 2 (Próximas ações) ──
  const completeTask = async (taskId: number) => {
    setBusy(true)
    try {
      const r = await kaguyaApi.complete(taskId)
      if (r.status === 'error') { toast(r.message ?? 'Falha ao concluir.', 'err'); return }
      await refreshCurrentStep()
    } finally { setBusy(false) }
  }

  // ── Ações do passo 3 (Aguardando) ──
  const saveWaitingNote = async (taskId: number) => {
    setBusy(true)
    try {
      const r = await kaguyaApi.updateTask(taskId, { waiting_note: waitingNoteDraft || null })
      if (r.status === 'error') { toast(r.message ?? 'Falha ao salvar.', 'err'); return }
      setEditingWaitingId(null)
      await refreshCurrentStep()
    } finally { setBusy(false) }
  }
  const desistWaiting = async (taskId: number) => {
    setBusy(true)
    try {
      const r = await kaguyaApi.updateTask(taskId, { gtd_status: 'next_action' })
      if (r.status === 'error') { toast(r.message ?? 'Falha ao mover.', 'err'); return }
      await refreshCurrentStep()
    } finally { setBusy(false) }
  }

  // ── Ações do passo 4 (Listas/projetos) ──
  const markReviewed = async (projectId: number) => {
    setBusy(true)
    try {
      const r = await kaguyaApi.markProjectReviewed(projectId)
      if (r.status === 'error') { toast(r.message ?? 'Falha ao marcar.', 'err'); return }
      await refreshCurrentStep()
    } finally { setBusy(false) }
  }

  // ── Ações do passo 6 (Algum dia/talvez) ──
  const promoteSomeday = async (taskId: number) => {
    setBusy(true)
    try {
      const r = await kaguyaApi.updateTask(taskId, { gtd_status: 'next_action' })
      if (r.status === 'error') { toast(r.message ?? 'Falha ao promover.', 'err'); return }
      await refreshCurrentStep()
    } finally { setBusy(false) }
  }
  const deleteSomeday = async (taskId: number) => {
    if (!window.confirm('Excluir esta tarefa? Vai para a lixeira.')) return
    setBusy(true)
    try {
      await kaguyaApi.remove(taskId)
      await refreshCurrentStep()
    } finally { setBusy(false) }
  }

  const [missingSteps, setMissingSteps] = useState<ReviewStep[] | null>(null)

  const complete = async () => {
    if (!review) return
    setBusy(true)
    try {
      const r = await kaguyaApi.reviewComplete(review.id, note || null)
      if (r.error === 'steps_pending') { setMissingSteps(r.missing ?? []); return }
      if (r.status === 'error') { toast('Falha ao concluir a revisão.', 'err'); return }
      toast('Revisão concluída. Até a próxima semana.', 'ok')
      onChanged()
      onClose()
    } finally { setBusy(false) }
  }

  const stepIndex = useMemo(() => REVIEW_STEPS.findIndex((s) => s.key === step), [step])

  return (
    <div className="kg-scrim" onClick={onClose}>
      <div className="kg-modal kg-modal-wide" style={{ maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
        <div className="kg-modal-head">
          <h3>Revisão semanal{review?.resumed ? ' — retomada' : ''}</h3>
          <button className="kg-icon-btn" onClick={onClose} aria-label="Fechar"><Icon name="x" /></button>
        </div>

        {review?.resumed && (
          <p className="kg-muted" style={{ padding: '0 16px' }}>
            Revisão em andamento desde {fmtDateLabel(review.started_at.slice(0, 10))}.
          </p>
        )}

        {/* Progresso — chips clicáveis dos 6 passos, navegação livre (FR-006). */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '0 16px 8px' }}>
          {REVIEW_STEPS.map((s, i) => {
            const seen = review?.steps_seen.includes(s.key)
            const active = s.key === step
            return (
              <button
                key={s.key}
                className={`kg-btn ${active ? 'kg-btn-primary' : 'kg-btn-ghost'}`}
                style={{ fontSize: 12, padding: '4px 8px' }}
                onClick={() => setStep(s.key)}
              >
                {seen && <Icon name="check" size={12} />} {i + 1}. {s.name}
              </button>
            )
          })}
        </div>

        <div className="kg-modal-body" style={{ minHeight: 260 }}>
          {!review && <p>Carregando…</p>}

          {review && step === 'inbox' && (
            <StepList
              empty="Inbox zerado. Nada para clarificar."
              items={inboxItems}
              render={(t: Task) => (
                <div key={t.id} className="kg-row">
                  <div className="kg-row-main">
                    <div className="kg-row-title">{t.title}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="kg-icon-btn" disabled={busy} title="Próxima ação" onClick={() => processInbox(t.id, 'next_action')}><Icon name="zap" size={14} /></button>
                    <button className="kg-icon-btn" disabled={busy} title="Aguardando" onClick={() => processInbox(t.id, 'waiting')}><Icon name="clock" size={14} /></button>
                    <button className="kg-icon-btn" disabled={busy} title="Algum dia" onClick={() => processInbox(t.id, 'someday')}><Icon name="inbox" size={14} /></button>
                    <button className="kg-icon-btn" disabled={busy} title="Feito agora" onClick={() => processInbox(t.id, 'done')}><Icon name="check" size={14} /></button>
                    <button className="kg-icon-btn" disabled={busy} title="Lixo" onClick={() => processInbox(t.id, 'trash')}><Icon name="trash" size={14} /></button>
                  </div>
                </div>
              )}
            />
          )}

          {review && step === 'next_actions' && (
            <StepList
              empty="Nenhuma próxima ação pendente."
              items={nextActions}
              render={(t: Task) => (
                <div key={t.id} className="kg-row">
                  <div className="kg-row-main"><div className="kg-row-title">{t.title}</div></div>
                  <button className="kg-btn kg-btn-ghost" disabled={busy} onClick={() => completeTask(t.id)}>
                    <Icon name="check" size={14} /> Concluir
                  </button>
                </div>
              )}
            />
          )}

          {review && step === 'waiting' && (
            <StepList
              empty="Nada aguardando resposta."
              items={waitingItems}
              render={(t: WaitingReviewItem) => (
                <div key={t.id} className="kg-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                    <div className="kg-row-main">
                      <div className="kg-row-title">{t.title}</div>
                      <span className="kg-muted" style={{ fontSize: 12 }}>
                        {t.days_waiting != null ? `há ${t.days_waiting} dia(s)` : ''}
                        {t.waiting_note ? ` — ${t.waiting_note}` : ''}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="kg-icon-btn" disabled={busy} title="Editar nota" onClick={() => { setEditingWaitingId(t.id); setWaitingNoteDraft(t.waiting_note ?? '') }}><Icon name="edit" size={14} /></button>
                      <button className="kg-icon-btn" disabled={busy} title="Concluir" onClick={() => completeTask(t.id)}><Icon name="check" size={14} /></button>
                      <button className="kg-icon-btn" disabled={busy} title="Desistir (voltar a próxima ação)" onClick={() => desistWaiting(t.id)}><Icon name="back" size={14} /></button>
                    </div>
                  </div>
                  {editingWaitingId === t.id && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                      <input className="kg-input" autoFocus value={waitingNoteDraft} onChange={(e) => setWaitingNoteDraft(e.target.value)} placeholder="Por quem/o quê espera" />
                      <button className="kg-btn kg-btn-primary" disabled={busy} onClick={() => saveWaitingNote(t.id)}>Salvar</button>
                    </div>
                  )}
                </div>
              )}
            />
          )}

          {review && step === 'lists' && (
            <StepList
              empty="Nenhuma lista para revisar."
              items={projects}
              render={(p: Project) => (
                <div key={p.id} className="kg-row">
                  <div className="kg-row-main">
                    <div className="kg-row-title">{p.name}</div>
                    <span className="kg-muted" style={{ fontSize: 12 }}>
                      {p.open_count} aberta(s) — {p.last_reviewed_at ? `revisada em ${fmtDateLabel(p.last_reviewed_at.slice(0, 10))}` : 'nunca revisada'}
                    </span>
                  </div>
                  <button className="kg-btn kg-btn-ghost" disabled={busy} onClick={() => markReviewed(p.id)}>
                    <Icon name="check" size={14} /> Marcar revisada
                  </button>
                </div>
              )}
            />
          )}

          {review && step === 'calendar' && (
            <div>
              <h4 style={{ marginTop: 0 }}>Semana passada</h4>
              <CalendarWeek data={pastWeek} />
              <h4>Semana que vem</h4>
              <CalendarWeek data={nextWeek} />
            </div>
          )}

          {review && step === 'someday' && (
            <StepList
              empty="Nada em incubação."
              items={somedayItems}
              render={(t: Task) => (
                <div key={t.id} className="kg-row">
                  <div className="kg-row-main"><div className="kg-row-title">{t.title}</div></div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="kg-icon-btn" disabled={busy} title="Promover a próxima ação" onClick={() => promoteSomeday(t.id)}><Icon name="zap" size={14} /></button>
                    <button className="kg-icon-btn" disabled={busy} title="Excluir" onClick={() => deleteSomeday(t.id)}><Icon name="trash" size={14} /></button>
                  </div>
                </div>
              )}
            />
          )}
        </div>

        <div className="kg-modal-foot" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
          {missingSteps && missingSteps.length > 0 && (
            <p className="kg-muted" style={{ color: 'var(--p-high, #c0392b)' }}>
              Passos ainda não vistos: {missingSteps.map((k) => REVIEW_STEPS.find((s) => s.key === k)?.name).join(', ')}.
            </p>
          )}
          <textarea
            className="kg-textarea"
            placeholder="Nota final (opcional) — o que aprendeu essa semana?"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="kg-muted" style={{ fontSize: 12, alignSelf: 'center' }}>
              Passo {stepIndex + 1} de {REVIEW_STEPS.length}
            </span>
            <button className="kg-btn kg-btn-primary" disabled={busy || !review} onClick={complete}>
              Concluir revisão
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Lista genérica de um passo — estado de carregamento/vazio + itens via render prop.
function StepList<T>({ items, empty, render }: { items: T[] | null; empty: string; render: (item: T) => React.ReactNode }) {
  if (items === null) return <p>Carregando…</p>
  if (items.length === 0) return <p className="kg-muted">🎉 {empty}</p>
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>{items.map(render)}</div>
}

// Bloco somente-leitura de uma janela do passo "Calendário" (tarefas Kaguya + hub cross-agent).
function CalendarWeek({ data }: { data: { agg: AggregateResponse; tasks: Task[] } | null }) {
  if (!data) return <p>Carregando…</p>
  const total = data.tasks.length + data.agg.items.length
  if (total === 0) return <p className="kg-muted">Nada nessa janela.</p>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
      {data.tasks.map((t) => (
        <div key={`t${t.id}`} className="kg-row"><div className="kg-row-main"><div className="kg-row-title">📋 {t.title} {t.due_date ? `— ${fmtDateLabel(t.due_date)}` : ''}</div></div></div>
      ))}
      {data.agg.items.map((it, i) => (
        <div key={`a${i}`} className="kg-row"><div className="kg-row-main"><div className="kg-row-title">{it.title} — {it.date}</div></div></div>
      ))}
    </div>
  )
}
