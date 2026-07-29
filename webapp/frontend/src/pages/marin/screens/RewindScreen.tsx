// Tela de Rewind — retrospectiva anual de animes (spec 054, FR-005).
// Mesmo shape de dados da StatsScreen (GET /animes/rewind reusa get_stats
// internamente), apresentado num tom de "retrospectiva do ano" com seletor de ano.

import { useState, useEffect } from 'react'
import { marinApi } from '../marinApi'
import type { Stats } from '../types'
import { Heatmap } from '../components/Heatmap'
import { PosterCard } from '../components/PosterCard'
import { Stars } from '../components/Stars'
import { Icon } from '../components/Icon'

interface RewindScreenProps {
  onSelectAnime: (id: string) => void
}

export function RewindScreen({ onSelectAnime }: RewindScreenProps) {
  const [year, setYear] = useState<number>(new Date().getFullYear())
  const [data, setData] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  const currentYear = new Date().getFullYear()

  useEffect(() => {
    setLoading(true)
    marinApi.rewind(year)
      .then(res => setData(res as unknown as Stats))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [year])

  if (loading) {
    return <div className="mr-stats-loading"><div className="mr-spinner" /></div>
  }

  // Ano sem nenhuma atividade — estado vazio amigável (US5, cenário 2)
  const isEmpty = !data || ((data.total_sessions ?? 0) === 0 && (data.total_episodes ?? 0) === 0)

  return (
    <div className="mr-stats">
      <div className="mr-stats-year-switch">
        <button className="mr-stats-yr-btn" onClick={() => setYear(y => y - 1)} aria-label="Ano anterior">
          <Icon name="chevron-left" size={16} />
        </button>
        <div className="mr-stats-yr-center">
          <span className="mr-stats-yr-label">Rewind {year}</span>
          <span className="mr-stats-yr-sub">sua retrospectiva do ano</span>
        </div>
        <button
          className="mr-stats-yr-btn" onClick={() => setYear(y => y + 1)}
          disabled={year >= currentYear} aria-label="Próximo ano"
        >
          <Icon name="chevron" size={16} />
        </button>
      </div>

      {isEmpty ? (
        <p style={{ color: 'var(--ink-4)', padding: '40px 0', textAlign: 'center' }}>
          Nenhuma atividade registrada em {year} ainda.
        </p>
      ) : (
        <>
          <div className="mr-stats-totals">
            {[
              { label: 'Completos',  value: data!.completed ?? 0 },
              { label: 'Eps vistos', value: data!.total_episodes ?? 0 },
              { label: 'Horas',      value: Math.round(data!.total_hours ?? 0) },
              { label: 'Nota média', value: data!.avg_score ? data!.avg_score.toFixed(1) : '—' },
            ].map(({ label, value }) => (
              <div key={label} className="mr-stat-big">
                <span className="mr-stat-big-num">{value}</span>
                <span className="mr-stat-big-label">{label}</span>
              </div>
            ))}
          </div>

          {data!.highlight && (
            <section className="mr-stats-section">
              <h3 className="mr-stats-section-title">O melhor do ano</h3>
              <div
                className="mr-stats-highlight-card"
                onClick={() => onSelectAnime(data!.highlight!.anime_id)}
                style={{ cursor: 'pointer' }}
              >
                <div style={{ width: 64, flexShrink: 0 }}>
                  <PosterCard
                    title={data!.highlight!.title}
                    posterUrl={data!.highlight!.poster_url}
                    posterKey={data!.highlight!.poster_key ?? 'magenta'}
                  />
                </div>
                <div className="mr-stats-highlight-info">
                  <p className="mr-stats-highlight-title">{data!.highlight!.title}</p>
                  <Stars score={data!.highlight!.score ?? 0} size={14} />
                  {(data!.highlight!.studio || data!.highlight!.season) && (
                    <p className="mr-stats-highlight-meta">
                      {[data!.highlight!.studio, data!.highlight!.season].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  {data!.max_marathon_day != null && data!.max_marathon_day > 0 && (
                    <p className="mr-stats-marathon">
                      🏃 Maior maratona: <strong>{data!.max_marathon_day}</strong> eps num dia
                    </p>
                  )}
                </div>
              </div>
            </section>
          )}

          {data!.top_studios && data!.top_studios.length > 0 && (
            <section className="mr-stats-section">
              <h3 className="mr-stats-section-title">Estúdios mais assistidos</h3>
              <div className="mr-stats-bars">
                {data!.top_studios.slice(0, 5).map(s => {
                  const max = data!.top_studios[0]?.count ?? 1
                  return (
                    <div key={s.studio} className="mr-stats-bar-row">
                      <span className="mr-stats-bar-label">{s.studio}</span>
                      <div className="mr-stats-bar-track">
                        <div
                          className="mr-stats-bar-fill"
                          style={{ width: `${Math.round((s.count / max) * 100)}%`, background: 'var(--cyan)' }}
                        />
                      </div>
                      <span className="mr-stats-bar-count">{s.count}</span>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {data!.top_genres && data!.top_genres.length > 0 && (
            <section className="mr-stats-section">
              <h3 className="mr-stats-section-title">Gêneros mais assistidos</h3>
              <div className="mr-stats-bars">
                {data!.top_genres.slice(0, 8).map(g => {
                  const max = data!.top_genres[0]?.count ?? 1
                  return (
                    <div key={g.genre} className="mr-stats-bar-row">
                      <span className="mr-stats-bar-label">{g.genre}</span>
                      <div className="mr-stats-bar-track">
                        <div
                          className="mr-stats-bar-fill"
                          style={{ width: `${Math.round((g.count / max) * 100)}%`, background: 'var(--marin)' }}
                        />
                      </div>
                      <span className="mr-stats-bar-count">{g.count}</span>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {data!.heatmap && Object.keys(data!.heatmap).length > 0 && (
            <section className="mr-stats-section">
              <h3 className="mr-stats-section-title">Atividade em {year}</h3>
              <Heatmap data={data!.heatmap} year={year} />
            </section>
          )}
        </>
      )}
    </div>
  )
}
