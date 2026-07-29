// FocusWidget — widget flutuante persistente da sessão de foco ativa (spec 037 +
// spec 062). Montado uma vez em KaguyaShell.tsx (fora do switch de views), sobrevive
// a qualquer troca de tela interna. O tempo restante NUNCA é contado do zero na tela:
// é sempre derivado de `started_at` (recebido do servidor) via setInterval de 1s —
// por isso sobrevive a reload sem perder precisão (R1/R7 do plano).
//
// A árvore mostra a espécie que a sessão VAI virar se for concluída agora
// (`minutes={duration_planned_min}`) crescendo em tempo real via `growth` — um
// preview visual do que está em jogo, não só um número regressivo.

import { useEffect, useState } from 'react'
import type { FocusSession } from '../types'
import { Icon } from '../ui/Icons'
import { FocusTree } from '../ui/FocusTree'

interface FocusWidgetProps {
  session: FocusSession
  onFinish: () => void
  onCancel: () => void   // spec 062: "pede" o cancelamento — o pai abre o modal de motivo
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
  const growth = focusSec ? Math.max(0, Math.min(1, elapsedSec / focusSec)) : 1

  return (
    <div className="kg-focus-widget">
      <FocusTree
        minutes={session.duration_planned_min}
        outcome={null}
        growth={phase === 'foco' ? growth : 1}
        color={session.project_color ?? undefined}
        size={44}
      />
      <div className="kg-focus-widget-info">
        <div className="kg-focus-widget-phase">{phase === 'foco' ? '🎯 Foco' : '☕ Pausa'}</div>
        <div className="kg-focus-widget-time">{fmt(remainingSec)}</div>
        <div className="kg-focus-widget-task">
          {session.task_title ?? session.habit_name ?? 'Foco avulso'}
        </div>
      </div>
      <div className="kg-focus-widget-actions">
        <button className="kg-icon-btn" onClick={onFinish} aria-label="Concluir" title="Concluir">
          <Icon name="check" size={14} />
        </button>
        <button className="kg-icon-btn" onClick={onCancel} aria-label="Desistir" title="Desistir">
          <Icon name="x" size={14} />
        </button>
      </div>
    </div>
  )
}
