// A sessão de foco ao vivo: o widget flutuante, o modal de iniciar (alvo + duração) e o de desistir (com motivo).
// O tempo restante NUNCA é contado do zero na tela: deriva sempre de `started_at` (o horário que o servidor guardou)
// a cada segundo — por isso sobrevive a recarregar a página sem perder precisão.

import { useEffect, useState } from 'react'
import { Button, Chip, Field, IconButton, Input, Modal, Select, Textarea, confirm, toast } from '../../../design'
import { kaguyaApi } from '../api'
import type { FocusSession, Habit, Task } from '../types'
import { FocusTree } from './FocusTree'

const reason = (e: unknown, fallback: string) => (e instanceof Error && e.message && !/^HTTP \d+$/.test(e.message) ? e.message : fallback)
const clock = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(Math.floor(sec % 60)).padStart(2, '0')}`

export function FocusWidget({ session, onFinish, onCancel }: { session: FocusSession; onFinish: () => void; onCancel: () => void }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id) }, [])
  const elapsed = (now - new Date(session.started_at).getTime()) / 1000
  const focusSec = session.duration_planned_min * 60
  const breakSec = session.break_planned_min * 60
  const phase: 'foco' | 'pausa' = elapsed < focusSec ? 'foco' : 'pausa'
  const remaining = Math.max(0, phase === 'foco' ? focusSec - elapsed : focusSec + breakSec - elapsed)
  const growth = focusSec ? Math.max(0, Math.min(1, elapsed / focusSec)) : 1
  return (
    <aside className="kn-fw" aria-label="Sessão de foco em andamento">
      <FocusTree minutes={session.duration_planned_min} outcome={null} growth={phase === 'foco' ? growth : 1} color={session.project_color ?? undefined} size={44} />
      <div className="kn-fw-info">
        <span className="ds-mono">{phase === 'foco' ? 'Foco' : 'Pausa'}</span>
        <b className="ds-num" role="timer" aria-label={`${phase === 'foco' ? 'Foco' : 'Pausa'}: ${clock(remaining)} restantes`}>{clock(remaining)}</b>
        <span className="kn-fw-task">{session.task_title ?? session.habit_name ?? 'Foco avulso'}</span>
      </div>
      <IconButton icon="check" label="Concluir sessão" size={16} onClick={onFinish} />
      <IconButton icon="close" label="Desistir da sessão" size={16} onClick={onCancel} />
    </aside>
  )
}

const PRESETS = [{ label: '25 / 5', focus: 25, brk: 5 }, { label: '50 / 10', focus: 50, brk: 10 }]
type Target = 'task' | 'habit' | 'none'

export function FocusStartModal({ task, habitId, onClose, onStarted }: { task?: Task | null; habitId?: number | null; onClose: () => void; onStarted: () => void }) {
  const [focusMin, setFocusMin] = useState(25)
  const [breakMin, setBreakMin] = useState(5)
  const [custom, setCustom] = useState(false)
  const [starting, setStarting] = useState(false)
  const [target, setTarget] = useState<Target>(task ? 'task' : habitId ? 'habit' : 'none')
  const [habits, setHabits] = useState<Habit[]>([])
  const [habit, setHabit] = useState<number | null>(habitId ?? null)

  // Sugere a última duração usada (lembrada no servidor).
  useEffect(() => {
    kaguyaApi.focus.prefs().then((p) => {
      setFocusMin(p.focus_min); setBreakMin(p.break_min)
      setCustom(!PRESETS.some((pr) => pr.focus === p.focus_min && pr.brk === p.break_min))
    }).catch(() => { /* fica no 25/5 */ })
  }, [])
  // A lista de hábitos só importa quando o alvo não está travado numa tarefa.
  useEffect(() => { if (!task) kaguyaApi.listHabits().then(setHabits).catch(() => setHabits([])) }, [task])

  const start = async (force = false): Promise<void> => {
    setStarting(true)
    try {
      await kaguyaApi.focus.start({
        task_id: target === 'task' ? (task?.id ?? null) : null,
        habit_id: target === 'habit' ? habit : null,
        focus_min: focusMin, break_min: breakMin, force,
      })
      onStarted()
      onClose()
    } catch (e) {
      // 409: já existe uma sessão ativa — confirma encerrar a anterior antes de reenviar.
      if (!force && /já existe/i.test(String((e as Error)?.message ?? ''))) {
        if (await confirm({ title: 'Já existe uma sessão de foco ativa', body: 'Encerrar a anterior e iniciar esta?', confirmLabel: 'Encerrar e iniciar' })) await start(true)
      } else toast(reason(e, 'Não foi possível iniciar o foco.'), { tone: 'error' })
    } finally { setStarting(false) }
  }

  return (
    <Modal
      title="Focar"
      size="sm"
      onClose={onClose}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" icon="play" disabled={starting || (target === 'habit' && habit == null)} onClick={() => void start(false)}>{starting ? 'Iniciando…' : 'Iniciar'}</Button>
        </>
      )}
    >
      {task ? (
        <p>Na tarefa: <b>{task.title}</b></p>
      ) : (
        <Field label="Focar em">{(c) => (
          <>
            <div className="kn-chips" role="group" aria-label="Focar em">
              <Chip on={target === 'none'} aria-pressed={target === 'none'} onClick={() => setTarget('none')}>Avulso</Chip>
              <Chip on={target === 'habit'} aria-pressed={target === 'habit'} onClick={() => setTarget('habit')}>Hábito</Chip>
            </div>
            {target === 'habit' && (
              <Select {...c} aria-label="Hábito" value={habit ?? ''} onChange={(e) => setHabit(e.target.value ? Number(e.target.value) : null)}>
                <option value="">Escolha um hábito…</option>
                {habits.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </Select>
            )}
          </>
        )}</Field>
      )}
      <Field label="Duração">{() => (
        <div className="kn-chips" role="group" aria-label="Duração">
          {PRESETS.map((p) => (
            <Chip key={p.label} on={!custom && focusMin === p.focus && breakMin === p.brk} aria-pressed={!custom && focusMin === p.focus && breakMin === p.brk} onClick={() => { setCustom(false); setFocusMin(p.focus); setBreakMin(p.brk) }}>{p.label}</Chip>
          ))}
          <Chip on={custom} aria-pressed={custom} onClick={() => setCustom(true)}>Personalizada</Chip>
        </div>
      )}</Field>
      {custom && (
        <div className="kn-props">
          <Field label="Foco (min)">{(c) => <Input {...c} type="number" min={1} value={focusMin} onChange={(e) => setFocusMin(Math.max(1, Number(e.target.value) || 1))} />}</Field>
          <Field label="Pausa (min)">{(c) => <Input {...c} type="number" min={0} value={breakMin} onChange={(e) => setBreakMin(Math.max(0, Number(e.target.value) || 0))} />}</Field>
        </div>
      )}
    </Modal>
  )
}

export function FocusCancelModal({ sessionId, elapsedMin, onClose, onCancelled }: { sessionId: number; elapsedMin: number; onClose: () => void; onCancelled: () => void }) {
  const [why, setWhy] = useState('')
  const [busy, setBusy] = useState(false)
  const give = async () => {
    setBusy(true)
    try { await kaguyaApi.focus.cancel(sessionId, why.trim() || undefined); onCancelled(); onClose() }
    catch (e) { toast(reason(e, 'Não foi possível desistir da sessão.'), { tone: 'error' }) }
    finally { setBusy(false) }
  }
  return (
    <Modal
      title="Desistir do foco?"
      size="sm"
      onClose={onClose}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>Voltar ao foco</Button>
          <Button variant="danger" disabled={busy} onClick={() => void give()}>{busy ? 'Cancelando…' : 'Desistir'}</Button>
        </>
      )}
    >
      <div className="kn-fc-tree"><FocusTree minutes={elapsedMin} outcome="cancelled" size={72} /></div>
      <p className="ds-hint kn-center">{elapsedMin} min focados até agora — esta sessão não conta como concluída.</p>
      <Field label="O que te tirou do foco? (opcional)">{(c) => <Textarea {...c} rows={3} value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Ex.: notificação, alguém chamou, perdi o interesse…" />}</Field>
    </Modal>
  )
}
