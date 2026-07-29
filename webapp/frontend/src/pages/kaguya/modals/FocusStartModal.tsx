// FocusStartModal — escolhe o alvo (tarefa, hábito ou avulso) e a duração (preset ou
// custom), e inicia uma sessão de foco (spec 037 + spec 062). Se já existe uma sessão
// ativa, confirma antes de reenviar com force=true (FR-003).
//
// `task` e `habitId` podem vir pré-selecionados (abrir "Focar" a partir do TaskModal
// ou do card de um hábito) — nesse caso o seletor de alvo nasce travado naquele tipo,
// mas o usuário ainda pode trocar antes de iniciar.

import { useEffect, useState } from 'react'
import type { Habit, Task } from '../types'
import { kaguyaApi } from '../kaguyaApi'
import { Icon } from '../ui/Icons'

interface FocusStartModalProps {
  task?: Task | null       // pré-selecionado a partir do TaskModal
  habitId?: number | null  // pré-selecionado a partir do card de um hábito
  onClose: () => void
  onStarted: () => void    // pai busca /focus/active de novo
  toast: (msg: string, kind?: 'ok' | 'err') => void
}

// Presets fixos da v1 (FR-002) — "Custom" libera os dois campos numéricos.
const PRESETS = [
  { label: '25 / 5', focus: 25, brk: 5 },
  { label: '50 / 10', focus: 50, brk: 10 },
]

type Target = 'task' | 'habit' | 'none'

export function FocusStartModal({ task, habitId, onClose, onStarted, toast }: FocusStartModalProps) {
  const [focusMin, setFocusMin] = useState(25)
  const [breakMin, setBreakMin] = useState(5)
  const [custom, setCustom] = useState(false)
  const [starting, setStarting] = useState(false)

  const [target, setTarget] = useState<Target>(task ? 'task' : habitId ? 'habit' : 'none')
  const [habits, setHabits] = useState<Habit[]>([])
  const [selectedHabitId, setSelectedHabitId] = useState<number | null>(habitId ?? null)

  // Sugere a última duração usada (R4 — lembrada no servidor).
  useEffect(() => {
    kaguyaApi.focus.prefs().then((p) => {
      setFocusMin(p.focus_min)
      setBreakMin(p.break_min)
      setCustom(!PRESETS.some((pr) => pr.focus === p.focus_min && pr.brk === p.break_min))
    }).catch(() => { /* mantém o default 25/5 se a preferência falhar ao carregar */ })
  }, [])

  // Carrega a lista de hábitos só quando o seletor de alvo pode precisar dela — a
  // tarefa já veio pronta via prop, então não faz sentido buscar hábitos se o alvo
  // já está travado numa tarefa e o usuário nunca abre o seletor "hábito".
  useEffect(() => {
    if (task) return // alvo já é uma tarefa — não precisa da lista de hábitos
    kaguyaApi.listHabits().then(setHabits).catch(() => { /* seletor de hábito só fica vazio */ })
  }, [task])

  const start = async (force = false) => {
    setStarting(true)
    try {
      await kaguyaApi.focus.start({
        task_id: target === 'task' ? (task?.id ?? null) : null,
        habit_id: target === 'habit' ? selectedHabitId : null,
        focus_min: focusMin,
        break_min: breakMin,
        force,
      })
      onStarted()
      onClose()
    } catch (e: any) {
      // 409: já existe sessão ativa — confirma encerrar a anterior antes de reenviar.
      if (!force && String(e?.message ?? '').includes('já existe')) {
        if (confirm('Já existe uma sessão de foco ativa. Encerrar e iniciar esta?')) {
          await start(true)
          return
        }
      } else {
        toast(e?.message ?? 'Não foi possível iniciar o foco', 'err')
      }
    } finally {
      setStarting(false)
    }
  }

  return (
    <div className="kg-scrim" onClick={onClose}>
      <div className="kg-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380 }}>
        <div className="kg-modal-head">
          <h3>Focar</h3>
          <button className="kg-icon-btn" onClick={onClose} aria-label="Fechar"><Icon name="x" /></button>
        </div>
        <div className="kg-modal-body">
          {task ? (
            // Alvo travado numa tarefa específica (aberto a partir do TaskModal) — sem seletor.
            <div className="kg-field-label" style={{ marginBottom: 12 }}>Na tarefa: <b>{task.title}</b></div>
          ) : (
            <div className="kg-field" style={{ marginBottom: 12 }}>
              <span className="kg-field-label">Focar em</span>
              <div className="kg-segment">
                <button
                  type="button"
                  className={`kg-seg-opt${target === 'none' ? ' active' : ''}`}
                  onClick={() => setTarget('none')}
                >Avulso</button>
                <button
                  type="button"
                  className={`kg-seg-opt${target === 'habit' ? ' active' : ''}`}
                  onClick={() => setTarget('habit')}
                >Hábito</button>
              </div>
              {target === 'habit' && (
                <select
                  className="kg-select"
                  style={{ marginTop: 8 }}
                  value={selectedHabitId ?? ''}
                  onChange={(e) => setSelectedHabitId(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">Selecione um hábito…</option>
                  {habits.map((h) => (
                    <option key={h.id} value={h.id}>{h.icon ? `${h.icon} ` : ''}{h.name}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div className="kg-field">
            <span className="kg-field-label">Duração</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  className={`kg-btn${!custom && focusMin === p.focus && breakMin === p.brk ? ' kg-btn-primary' : ''}`}
                  style={{ padding: '6px 10px' }}
                  onClick={() => { setCustom(false); setFocusMin(p.focus); setBreakMin(p.brk) }}
                >
                  {p.label}
                </button>
              ))}
              <button
                type="button"
                className={`kg-btn${custom ? ' kg-btn-primary' : ''}`}
                style={{ padding: '6px 10px' }}
                onClick={() => setCustom(true)}
              >
                Custom
              </button>
            </div>
          </div>

          {custom && (
            <div className="kg-field" style={{ display: 'flex', gap: 12 }}>
              <label style={{ flex: 1 }}>
                <span className="kg-field-label">Foco (min)</span>
                <input
                  className="kg-input"
                  type="number"
                  min={1}
                  value={focusMin}
                  onChange={(e) => setFocusMin(Math.max(1, Number(e.target.value) || 1))}
                />
              </label>
              <label style={{ flex: 1 }}>
                <span className="kg-field-label">Pausa (min)</span>
                <input
                  className="kg-input"
                  type="number"
                  min={0}
                  value={breakMin}
                  onChange={(e) => setBreakMin(Math.max(0, Number(e.target.value) || 0))}
                />
              </label>
            </div>
          )}

        </div>

        <div className="kg-modal-foot">
          <button className="kg-btn kg-btn-ghost" onClick={onClose}>Cancelar</button>
          <button
            className="kg-btn kg-btn-primary"
            disabled={starting || (target === 'habit' && selectedHabitId == null)}
            onClick={() => start(false)}
          >
            {starting ? 'Iniciando...' : 'Iniciar'}
          </button>
        </div>
      </div>
    </div>
  )
}
