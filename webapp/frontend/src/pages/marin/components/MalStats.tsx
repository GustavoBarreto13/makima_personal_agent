// Componente de estatísticas do perfil MAL integrado.
// Exibe barra empilhada por status (colorida com --st-{status}) + grid de números.
// Usado na HomeScreen (profile-split) para dar visão geral do catálogo.

import type { HomeData } from '../types'

interface MalStatsProps {
  // Contagens por status vindas do HomeData.counts
  counts: HomeData['counts']
  // Total de episódios e média de nota do ano
  totalEps?: number
  avgScore?: number | null
  className?: string
}

// Status na ordem de exibição
const STATUS_ORDER = [
  'assistindo',
  'completo',
  'quero_assistir',
  'pausado',
  'abandonado',
] as const

// Labels curtos para o grid de números
const STATUS_LABELS: Record<string, string> = {
  assistindo:     'Assistindo',
  completo:       'Completos',
  quero_assistir: 'Na fila',
  pausado:        'Pausados',
  abandonado:     'Abandonados',
}

/**
 * Estatísticas do catálogo MAL — barra empilhada + grid de contagens.
 * Cores: variáveis CSS --st-{status} definidas em marin.css.
 */
export function MalStats({ counts, totalEps, avgScore, className }: MalStatsProps) {
  // Total de animes (soma de todos os status)
  const total = STATUS_ORDER.reduce((acc, s) => acc + (counts[s] ?? 0), 0)

  return (
    <div className={`mr-mal-stats${className ? ' ' + className : ''}`}>
      {/* Barra empilhada por status */}
      {total > 0 && (
        <div
          className="mr-mal-bar"
          role="img"
          aria-label="Distribuição de animes por status"
          style={{
            display: 'flex',
            height: 8,
            borderRadius: 4,
            overflow: 'hidden',
            marginBottom: 12,
          }}
        >
          {STATUS_ORDER.map(s => {
            const count = counts[s] ?? 0
            if (!count) return null
            const pct = (count / total) * 100
            return (
              <div
                key={s}
                style={{
                  width: `${pct}%`,
                  background: `var(--st-${s})`,
                  transition: 'width 0.4s ease',
                }}
                title={`${STATUS_LABELS[s]}: ${count}`}
              />
            )
          })}
        </div>
      )}

      {/* Grid de contagens por status */}
      <div
        className="mr-mal-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '6px 16px',
        }}
      >
        {STATUS_ORDER.map(s => (
          <div
            key={s}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            {/* Bolinha colorida com a cor do status */}
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: `var(--st-${s})`,
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 11, color: 'var(--ink-3)', flex: 1 }}>
              {STATUS_LABELS[s]}
            </span>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', fontFamily: 'var(--mono)' }}>
              {counts[s] ?? 0}
            </span>
          </div>
        ))}
      </div>

      {/* Linha de totais */}
      <div
        style={{
          display: 'flex',
          gap: 20,
          marginTop: 12,
          paddingTop: 10,
          borderTop: '1px solid var(--line)',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>{total}</div>
          <div style={{ fontSize: 10, color: 'var(--ink-3)' }}>animes</div>
        </div>
        {totalEps != null && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>{totalEps}</div>
            <div style={{ fontSize: 10, color: 'var(--ink-3)' }}>eps este ano</div>
          </div>
        )}
        {avgScore != null && avgScore > 0 && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--star)' }}>{avgScore.toFixed(1)}</div>
            <div style={{ fontSize: 10, color: 'var(--ink-3)' }}>nota média</div>
          </div>
        )}
      </div>
    </div>
  )
}
