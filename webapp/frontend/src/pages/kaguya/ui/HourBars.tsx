// HourBars — "quando eu foco × quando eu largo" (spec 062). 24 colunas, uma por
// hora do dia (0–23, hora LOCAL de início da sessão): barra pra CIMA = minutos
// concluídos naquela hora, barra pra BAIXO = quantas sessões falharam (canceladas
// + abandonadas) naquela hora. É o gráfico que responde "de manhã eu concluo, à
// noite eu desisto" de relance.

import type { FocusHourStats } from '../types'

interface HourBarsProps {
  data: FocusHourStats[]  // sempre 24 entradas (0..23), zero-filled pelo backend
}

export function HourBars({ data }: HourBarsProps) {
  const maxUp = Math.max(1, ...data.map((h) => h.completed_min))
  const maxDown = Math.max(1, ...data.map((h) => h.failed_n))

  return (
    <div className="kg-hourbars">
      <div className="kg-hourbars-grid">
        {data.map((h) => (
          <div key={h.hour} className="kg-hourbars-col" title={
            `${String(h.hour).padStart(2, '0')}h — ${h.completed_min}min concluídos (${h.completed_n} sessões)`
            + (h.failed_n ? ` · ${h.failed_n} falha${h.failed_n === 1 ? '' : 's'}` : '')
          }>
            <div className="kg-hourbars-up">
              <div
                className="kg-hourbars-bar kg-hourbars-bar-up"
                style={{ height: `${(h.completed_min / maxUp) * 100}%` }}
              />
            </div>
            <div className="kg-hourbars-axis" />
            <div className="kg-hourbars-down">
              <div
                className="kg-hourbars-bar kg-hourbars-bar-down"
                style={{ height: `${(h.failed_n / maxDown) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="kg-hourbars-labels">
        {data.map((h) => (
          <span key={h.hour} className="kg-hourbars-label">
            {h.hour % 3 === 0 ? String(h.hour).padStart(2, '0') : ''}
          </span>
        ))}
      </div>
      <div className="kg-hourbars-legend">
        <span><i className="kg-hourbars-sw kg-hourbars-sw-up" /> concluído</span>
        <span><i className="kg-hourbars-sw kg-hourbars-sw-down" /> falhado</span>
      </div>
    </div>
  )
}
