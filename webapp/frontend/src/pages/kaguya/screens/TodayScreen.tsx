// TodayScreen — versão "Hoje" simples do MVP (guia §4.6): tarefas de hoje +
// vencidas, agrupadas. O hero/capacity/timeline do ritual "Meu Dia" são da Fase 3;
// o QuickAdd com ParseMirror entra na US4.

import { useEffect, useState, useCallback } from 'react'
import type { Task, Project } from '../types'
import { kaguyaApi } from '../kaguyaApi'
import { TaskRow } from '../components/TaskRow'
import { QuickAdd } from '../components/QuickAdd'
import { Icon } from '../ui/Icons'

interface TodayScreenProps {
  projects: Project[]
  reloadKey: number
  onChanged: () => void
  onOpenTask: (task: Task) => void
  toast: (msg: string, kind?: 'ok' | 'err') => void
}

export function TodayScreen({ projects, reloadKey, onChanged, onOpenTask, toast }: TodayScreenProps) {
  const [overdue, setOverdue] = useState<Task[]>([])
  const [today, setToday] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await kaguyaApi.today()
      setOverdue(r.overdue); setToday(r.today)
    } catch { toast('Falha ao carregar o dia.', 'err') }
    finally { setLoading(false) }
  }, [toast])

  useEffect(() => { load() }, [load, reloadKey])

  const toggle = async (task: Task) => {
    try {
      if (task.completed_at) await kaguyaApi.reopen(task.id)
      else {
        const r = await kaguyaApi.complete(task.id)
        if (r.needs_cascade) {
          if (!window.confirm(`Concluir ${r.open_subtasks} subtarefa(s) também?`)) return
          await kaguyaApi.complete(task.id, true)
        }
      }
      await load(); onChanged()
    } catch { toast('Não foi possível atualizar.', 'err') }
  }

  const rename = async (task: Task, title: string) => {
    try { await kaguyaApi.updateTask(task.id, { title }); await load() } catch { toast('Falha ao renomear.', 'err') }
  }

  const dateLabel = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="kg-page">
      <h1 className="kg-page-title"><Icon name="sun" size={24} /> Meu Dia</h1>
      <div className="kg-page-sub">{dateLabel}</div>

      {/* Captura rápida (parser @lista + !prioridade) */}
      <QuickAdd projects={projects} onCreated={() => { load(); onChanged() }} toast={toast} />

      {loading ? (
        <div className="kg-empty">Carregando…</div>
      ) : overdue.length === 0 && today.length === 0 ? (
        <div className="kg-empty"><div className="kg-empty-title">Dia tranquilo</div>Nada vence hoje. ...Como esperado.</div>
      ) : (
        <>
          {overdue.length > 0 && (
            <div className="kg-today-section">
              <div className="kg-today-head overdue"><Icon name="clock" size={13} /> Vencidas ({overdue.length})</div>
              <div className="kg-list">
                {overdue.map((t) => <TaskRow key={t.id} task={t} showProject onToggle={toggle} onOpen={onOpenTask} onRename={rename} />)}
              </div>
            </div>
          )}
          <div className="kg-today-section">
            <div className="kg-today-head"><Icon name="sun" size={13} /> Hoje ({today.length})</div>
            <div className="kg-list">
              {today.length === 0 ? <div className="kg-empty" style={{ padding: 24 }}>Nada marcado para hoje.</div>
                : today.map((t) => <TaskRow key={t.id} task={t} showProject onToggle={toggle} onOpen={onOpenTask} onRename={rename} />)}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
