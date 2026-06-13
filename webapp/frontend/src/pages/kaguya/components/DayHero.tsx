// DayHero — cabeçalho do Meu Dia: saudação, data por extenso, 3 stats e retrato.
// Alimentado pelo objeto `capacity` de GET /api/tasks/my-day.

import type { CapacityStats } from '../types'

// Formata minutos como "Xh" ou "Xh Ym" (omite minutos quando zero).
function fmtMin(min: number): string {
  if (min <= 0) return '0min'
  const h = Math.floor(Math.abs(min) / 60)
  const m = Math.abs(min) % 60
  if (h === 0) return `${m}min`
  return m === 0 ? `${h}h` : `${h}h ${m}min`
}

// Saudação contextual por horário.
function greet(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

interface DayHeroProps {
  capacity: CapacityStats
}

export function DayHero({ capacity }: DayHeroProps) {
  const { no_plano, estimado_min, folga_min, excedeu, calendar_ok } = capacity

  // Data por extenso no fuso local (ex.: "Sexta, 13 de junho").
  const dataLabel = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long',
  })

  // Sub-título dinâmico.
  const sub = estimado_min > 0
    ? `Seu plano soma ${fmtMin(estimado_min)}${calendar_ok && capacity.agenda_min > 0 ? ` com ${fmtMin(capacity.agenda_min)} de agenda` : ''}.${
        !calendar_ok ? ' (agenda indisponível)' : ''
      }`
    : 'Nenhuma estimativa ainda.'

  return (
    <div className="kg-day-hero">
      <div className="kg-day-hero-left">
        {/* Eyebrow: domínio + saudação */}
        <div className="kg-day-eyebrow">Meu Dia · {greet()}</div>

        {/* Título: data por extenso */}
        <div className="kg-day-title" style={{ textTransform: 'capitalize' }}>{dataLabel}</div>

        {/* Sub-título com resumo */}
        <div className="kg-day-sub">{sub}</div>

        {/* 3 stats */}
        <div className="kg-day-stats">
          <div className="kg-day-stat">
            <span className="kg-day-stat-value">{no_plano}</span>
            <span className="kg-day-stat-label">no plano</span>
          </div>
          <div className="kg-day-stat">
            <span className="kg-day-stat-value">{fmtMin(estimado_min)}</span>
            <span className="kg-day-stat-label">estimado</span>
          </div>
          <div className="kg-day-stat">
            <span className={`kg-day-stat-value ${excedeu ? 'over' : folga_min > 0 ? 'ok' : ''}`}>
              {excedeu ? '+' : ''}{fmtMin(Math.abs(folga_min))}
            </span>
            <span className="kg-day-stat-label">{excedeu ? 'acima' : 'de folga'}</span>
          </div>
        </div>
      </div>

      {/* Retrato Kaguya */}
      <img src="/kaguya.jpg" alt="Kaguya" className="kg-day-hero-portrait" />
    </div>
  )
}
