// FocusWidget — widget flutuante persistente da sessão de foco ativa (spec 037).
// Montado uma vez em KaguyaShell.tsx (fora do switch de views), sobrevive a qualquer
// troca de tela interna. O tempo restante NUNCA é contado do zero na tela: é sempre
// derivado de `started_at` (recebido do servidor) via setInterval de 1s — por isso
// sobrevive a reload sem perder precisão (R1/R7 do plano).

import { useEffect, useState } from 'react'
import type { FocusSession } from '../types'
import { Icon } from '../ui/Icons'

interface FocusWidgetProps {
  session: FocusSession
  onFinish: () => void
  onCancel: () => void
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function FocusWidget({ session, onFinish, onCancel }: FocusWidgetProps) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const started = new Date(session.started_at).getTime()
  const elapsedSec = (now - started) / 1000
  const focusSec = session.duration_planned_min * 60
  const breakSec = session.break_planned_min * 60

  const phase: 'foco' | 'pausa' = elapsedSec < focusSec ? 'foco' : 'pausa'
  const remainingSec = Math.max(0, phase === 'foco' ? focusSec - elapsedSec : focusSec + breakSec - elapsedSec)

  return (
    <div className="kg-focus-widget">
      <div className="kg-focus-widget-phase">{phase === 'foco' ? '🎯 Foco' : '☕ Pausa'}</div>
      <div className="kg-focus-widget-time">{fmt(remainingSec)}</div>
      <div className="kg-focus-widget-task">{session.task_title ?? 'Foco avulso'}</div>
      <div className="kg-focus-widget-actions">
        <button className="kg-icon-btn" onClick={onFinish} aria-label="Concluir" title="Concluir">
          <Icon name="check" size={14} />
        </button>
        <button className="kg-icon-btn" onClick={onCancel} aria-label="Cancelar" title="Cancelar">
          <Icon name="x" size={14} />
        </button>
      </div>
    </div>
  )
}
