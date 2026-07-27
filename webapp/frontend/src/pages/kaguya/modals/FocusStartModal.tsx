// FocusStartModal — escolhe a duração (preset ou custom) e inicia uma sessão de foco
// (spec 037), ligada a uma tarefa ou avulsa. Se já existe uma sessão ativa, confirma
// antes de reenviar com force=true (FR-003).

import { useEffect, useState } from 'react'
import type { Task } from '../types'
import { kaguyaApi } from '../kaguyaApi'
import { Icon } from '../ui/Icons'

interface FocusStartModalProps {
  task?: Task | null              // ausente = sessão avulsa
  onClose: () => void
  onStarted: () => void           // pai busca /focus/active de novo
  toast: (msg: string, kind?: 'ok' | 'err') => void
}

// Presets fixos da v1 (FR-002) — "Custom" libera os dois campos numéricos.
const PRESETS = [
  { label: '25 / 5', focus: 25, brk: 5 },
  { label: '50 / 10', focus: 50, brk: 10 },
]

export function FocusStartModal({ task, onClose, onStarted, toast }: FocusStartModalProps) {
  const [focusMin, setFocusMin] = useState(25)
  const [breakMin, setBreakMin] = useState(5)
  const [custom, setCustom] = useState(false)
  const [starting, setStarting] = useState(false)

  // Sugere a última duração usada (R4 — lembrada no servidor).
  useEffect(() => {
    kaguyaApi.focus.prefs().then((p) => {
      setFocusMin(p.focus_min)
      setBreakMin(p.break_min)
      setCustom(!PRESETS.some((pr) => pr.focus === p.focus_min && pr.brk === p.break_min))
    }).catch(() => { /* mantém o default 25/5 se a preferência falhar ao carregar */ })
  }, [])

  const start = async (force = false) => {
    setStarting(true)
    try {
      await kaguyaApi.focus.start({ task_id: task?.id ?? null, focus_min: focusMin, break_min: breakMin, force })
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
            <div className="kg-field-label" style={{ marginBottom: 12 }}>Na tarefa: <b>{task.title}</b></div>
          ) : (
            <div className="kg-field-label" style={{ marginBottom: 12 }}>Foco avulso (sem tarefa)</div>
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
          <button className="kg-btn kg-btn-primary" disabled={starting} onClick={() => start(false)}>
            {starting ? 'Iniciando...' : 'Iniciar'}
          </button>
        </div>
      </div>
    </div>
  )
}
