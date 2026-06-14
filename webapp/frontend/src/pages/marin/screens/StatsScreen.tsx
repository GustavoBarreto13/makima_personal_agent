// Tela de estatísticas — análise do histórico de animes por ano.
// Layout: year switch + 4 totais + barras mensais + barras por status +
//         top gêneros + top estúdios + Heatmap + Destaque do ano.

import { useState, useEffect } from 'react'
import { marinApi } from '../marinApi'
import type { Stats } from '../types'
import { Heatmap } from '../components/Heatmap'

interface StatsScreenProps {}

/**
 * StatsScreen — painel de estatísticas anual.
 * Year switch permite ver qualquer ano; undefined = todos os tempos.
 */
export function StatsScreen(_: StatsScreenProps) {
  // Ano selecionado (null = todos os tempos)
  const [year, setYear] = useState<number>(new Date().getFullYear())
  const [data, setData] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  // Gera lista de anos disponíveis (ano atual até 2020)
  const currentYear = new Date().getFullYear()
  const years = Array.from(
    { length: currentYear - 2019 },
    (_, i) => currentYear - i
  )

  useEffect(() => {
    setLoading(true)
    marinApi.stats(year)
      .then(res => setData(res as unknown as Stats))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [year])

  if (loading) {
    return <div className="mr-stats-loading"><div className="mr-spinner" /></div>
  }

  if (!data) {
    return (
      <div className="mr-stats-empty">
        <p>Sem dados de estatísticas para {year}.</p>
      </div>
    )
  }

  const {
    total_animes,
    total_episodes,
    total_hours,
    avg_score,
    top_genres,
    top_studios,
    monthly,
    by_status,
    heatmap,
    highlight,
  } = data

  // monthly é number[] (índice 0=janeiro..11=dezembro) — usa direto
  const monthlyValues = monthly ?? []
  const monthlyMax = Math.max(...monthlyValues, 1)

  // Meses abreviados para os labels do gráfico mensal
  const MONTHS_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

  // Máximo para normalizar barras de status e gênero
  const statusValues = Object.values(by_status ?? {}) as number[]
  const statusMax = Math.max(...statusValues, 1)

  const topGenreMax = top_genres?.[0]?.count ?? 1
  const topStudioMax = top_studios?.[0]?.count ?? 1

  return (
    <div className="mr-stats">
      {/* ── Seletor de ano ─────────────────────────────────────────────────── */}
      <div className="mr-stats-year-switch">
        {years.map(y => (
          <button
            key={y}
            className={`mr-year-btn${year === y ? ' mr-year-btn--active' : ''}`}
            onClick={() => setYear(y)}
          >
            {y}
          </button>
        ))}
      </div>

      {/* ── 4 totais em grade 2×2 ─────────────────────────────────────────── */}
      <section className="mr-stats-totals">
        <div className="mr-total-card">
          <div className="mr-total-value">{total_animes ?? 0}</div>
          <div className="mr-total-label">Animes</div>
        </div>
        <div className="mr-total-card">
          <div className="mr-total-value">{total_episodes ?? 0}</div>
          <div className="mr-total-label">Episódios</div>
        </div>
        <div className="mr-total-card">
          <div className="mr-total-value">{total_hours ? Math.round(total_hours) : 0}h</div>
          <div className="mr-total-label">Assistidos</div>
        </div>
        <div className="mr-total-card">
          <div className="mr-total-value" style={{ color: 'var(--star)' }}>
            {avg_score ? avg_score.toFixed(1) : '—'}
          </div>
          <div className="mr-total-label">Nota média</div>
        </div>
      </section>

      {/* ── Gráfico mensal (Spark + eixo de meses) ───────────────────────── */}
      {monthlyValues.length > 0 && (
        <section className="mr-stats-section">
          <h3 className="mr-stats-section-title">Episódios por mês</h3>
          <div className="mr-stats-monthly">
            <div className="mr-stats-monthly-bars">
              {monthlyValues.map((val, i) => (
                <div key={i} className="mr-stats-monthly-bar-col">
                  <div
                    className="mr-stats-monthly-bar"
                    style={{ height: `${Math.round((val / monthlyMax) * 80)}px` }}
                    title={`${MONTHS_SHORT[i]}: ${val} eps`}
                  />
                  <span className="mr-stats-monthly-label">{MONTHS_SHORT[i]}</span>
                </div>
              ))}
            </div>
            {/* Legenda total anual */}
            <p className="mr-stats-monthly-total">
              {monthlyValues.reduce((a, b) => a + b, 0)} eps em {year}
            </p>
          </div>
        </section>
      )}

      {/* ── Por status ────────────────────────────────────────────────────── */}
      {by_status && Object.keys(by_status).length > 0 && (
        <section className="mr-stats-section">
          <h3 className="mr-stats-section-title">Por status</h3>
          <div className="mr-stats-bars">
            {Object.entries(by_status).map(([status, count]) => (
              <div key={status} className="mr-stats-bar-row">
                <span className="mr-stats-bar-label" style={{ color: `var(--st-${status})` }}>
                  {status.replace('_', ' ')}
                </span>
                <div className="mr-stats-bar-track">
                  <div
                    className="mr-stats-bar-fill"
                    style={{
                      width: `${Math.round(((count as number) / statusMax) * 100)}%`,
                      background: `var(--st-${status})`,
                    }}
                  />
                </div>
                <span className="mr-stats-bar-count">{count as number}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Top gêneros ───────────────────────────────────────────────────── */}
      {top_genres && top_genres.length > 0 && (
        <section className="mr-stats-section">
          <h3 className="mr-stats-section-title">Top gêneros</h3>
          <div className="mr-stats-bars">
            {top_genres.slice(0, 8).map(g => (
              <div key={g.genre} className="mr-stats-bar-row">
                <span className="mr-stats-bar-label">{g.genre}</span>
                <div className="mr-stats-bar-track">
                  <div
                    className="mr-stats-bar-fill"
                    style={{
                      width: `${Math.round((g.count / topGenreMax) * 100)}%`,
                      background: 'var(--marin)',
                    }}
                  />
                </div>
                <span className="mr-stats-bar-count">{g.count}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Top estúdios ──────────────────────────────────────────────────── */}
      {top_studios && top_studios.length > 0 && (
        <section className="mr-stats-section">
          <h3 className="mr-stats-section-title">Top estúdios</h3>
          <div className="mr-stats-bars">
            {top_studios.slice(0, 5).map(s => (
              <div key={s.studio} className="mr-stats-bar-row">
                <span className="mr-stats-bar-label">{s.studio}</span>
                <div className="mr-stats-bar-track">
                  <div
                    className="mr-stats-bar-fill"
                    style={{
                      width: `${Math.round((s.count / topStudioMax) * 100)}%`,
                      background: 'var(--cyan)',
                    }}
                  />
                </div>
                <span className="mr-stats-bar-count">{s.count}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Destaque do ano ───────────────────────────────────────────────── */}
      {highlight && (
        <section className="mr-stats-section mr-stats-highlight">
          <h3 className="mr-stats-section-title">Destaque de {year}</h3>
          <div className="mr-highlight-card">
            {highlight.poster_url && (
              <img
                src={highlight.poster_url}
                alt={highlight.title}
                className="mr-highlight-poster"
                loading="lazy"
              />
            )}
            <div className="mr-highlight-info">
              <p className="mr-highlight-label">Anime do ano</p>
              <p className="mr-highlight-title">{highlight.title}</p>
              {highlight.score && (
                <p className="mr-highlight-score">
                  ⭐ {highlight.score.toFixed(1)} / 10
                </p>
              )}
              {highlight.episodes_watched && (
                <p className="mr-highlight-eps">
                  {highlight.episodes_watched} eps assistidos
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ── Heatmap de atividade ──────────────────────────────────────────── */}
      {heatmap && Object.keys(heatmap).length > 0 && (
        <section className="mr-stats-section">
          <h3 className="mr-stats-section-title">Atividade em {year}</h3>
          <Heatmap data={heatmap} year={year} />
        </section>
      )}
    </div>
  )
}
