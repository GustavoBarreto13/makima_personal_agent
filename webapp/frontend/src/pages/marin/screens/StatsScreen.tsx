// Tela de estatísticas — análise do histórico de animes por ano.
// Layout: year switch com chevrons + 4 totais DM Serif + barras mensais +
//         barras por status + top gêneros + top estúdios + Destaque do ano + Heatmap.

import { useState, useEffect } from 'react'
import { marinApi } from '../marinApi'
import type { Stats } from '../types'
import { Heatmap } from '../components/Heatmap'
import { PosterCard } from '../components/PosterCard'
import { Stars } from '../components/Stars'
import { Icon } from '../components/Icon'

interface StatsScreenProps {}

/**
 * StatsScreen — painel de estatísticas anual.
 * Year switch com chevrons permite navegar entre anos.
 * Todos os dados vêm do endpoint GET /api/animes/stats?year=N.
 */
export function StatsScreen(_: StatsScreenProps) {
  // Ano selecionado — começa no ano atual
  const [year, setYear] = useState<number>(new Date().getFullYear())
  const [data, setData] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  // Ano máximo: não permite navegar para o futuro além do ano atual
  const currentYear = new Date().getFullYear()

  // Recarrega os dados sempre que o ano muda
  useEffect(() => {
    setLoading(true)
    marinApi.stats(year)
      .then(res => setData(res as unknown as Stats))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [year])

  // Tela de carregamento — spinner centralizado
  if (loading) {
    return <div className="mr-stats-loading"><div className="mr-spinner" /></div>
  }

  // Tela de estado vazio quando a API retorna null (erro de rede ou sem dados)
  if (!data) {
    return (
      <div className="mr-stats-empty">
        <p>Sem dados de estatísticas para {year}.</p>
      </div>
    )
  }

  const {
    total_episodes,
    total_hours,
    avg_score,
    completed,
    max_marathon_day,
    total_sessions,
    top_genres,
    top_studios,
    monthly,
    by_status,
    heatmap,
    highlight,
  } = data

  // monthly é number[] (índice 0=janeiro..11=dezembro)
  const monthlyValues = monthly ?? []
  // Valor máximo das barras mensais para normalizar a altura
  const monthlyMax = Math.max(...monthlyValues, 1)

  // Meses abreviados para os labels do gráfico de barras mensal
  const MONTHS_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

  // Valor máximo para normalizar as barras de status
  const statusValues = Object.values(by_status ?? {}) as number[]
  const statusMax = Math.max(...statusValues, 1)

  // Valor máximo para normalizar as barras de gênero e estúdio
  const topGenreMax = top_genres?.[0]?.count ?? 1
  const topStudioMax = top_studios?.[0]?.count ?? 1

  return (
    <div className="mr-stats">

      {/* ── Year switch com chevrons ─────────────────────────────────────────── */}
      {/* Substitui os botões de ano individuais por seletor compacto com ‹ › */}
      <div className="mr-stats-year-switch">
        {/* Botão de ano anterior — sempre habilitado (sem limite mínimo) */}
        <button
          className="mr-stats-yr-btn"
          onClick={() => setYear(y => y - 1)}
          aria-label="Ano anterior"
        >
          <Icon name="chevron-left" size={16} />
        </button>

        {/* Centro: ano em DM Serif grande + subtítulo em mono com totais */}
        <div className="mr-stats-yr-center">
          <span className="mr-stats-yr-label">{year}</span>
          <span className="mr-stats-yr-sub">
            {total_sessions ?? 0} sessões · {total_episodes ?? 0} eps · {Math.round(total_hours ?? 0)}h
          </span>
        </div>

        {/* Botão de próximo ano — desabilitado se já está no ano atual */}
        <button
          className="mr-stats-yr-btn"
          onClick={() => setYear(y => y + 1)}
          disabled={year >= currentYear}
          aria-label="Próximo ano"
        >
          <Icon name="chevron" size={16} />
        </button>
      </div>

      {/* ── 4 totais grandes em DM Serif ─────────────────────────────────────── */}
      {/* Grade de 4 colunas (2×2 em mobile) com números em DM Serif Display */}
      <div className="mr-stats-totals">
        {[
          { label: 'Completos',  value: completed ?? 0,                         unit: ''   },
          { label: 'Eps vistos', value: total_episodes ?? 0,                    unit: ''   },
          { label: 'Horas',      value: Math.round(total_hours ?? 0),           unit: 'h'  },
          { label: 'Nota média', value: avg_score ? avg_score.toFixed(1) : '—', unit: avg_score ? '/10' : '' },
        ].map(({ label, value, unit }) => (
          <div key={label} className="mr-stat-big">
            {/* Número grande em DM Serif Display */}
            <span className="mr-stat-big-num">{value}{unit}</span>
            {/* Label em mono caps muted */}
            <span className="mr-stat-big-label">{label}</span>
          </div>
        ))}
      </div>

      {/* ── Gráfico mensal de episódios ───────────────────────────────────────── */}
      {monthlyValues.length > 0 && (
        <section className="mr-stats-section">
          <h3 className="mr-stats-section-title">Episódios por mês</h3>
          <div className="mr-stats-monthly">
            {/* Barras: altura proporcional ao máximo do mês */}
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
            {/* Total anual abaixo das barras */}
            <p className="mr-stats-monthly-total">
              {monthlyValues.reduce((a, b) => a + b, 0)} eps em {year}
            </p>
          </div>
        </section>
      )}

      {/* ── Por status ───────────────────────────────────────────────────────── */}
      {by_status && Object.keys(by_status).length > 0 && (
        <section className="mr-stats-section">
          <h3 className="mr-stats-section-title">Por status</h3>
          <div className="mr-stats-bars">
            {Object.entries(by_status).map(([status, count]) => (
              <div key={status} className="mr-stats-bar-row">
                {/* Nome do status na cor correspondente ao --st-{status} */}
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

      {/* ── Top gêneros ──────────────────────────────────────────────────────── */}
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

      {/* ── Top estúdios ─────────────────────────────────────────────────────── */}
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

      {/* ── Destaque do ano ──────────────────────────────────────────────────── */}
      {/* Exibe o anime com maior nota + mais episódios, com pôster e maratona */}
      {highlight && (
        <section className="mr-stats-section">
          <h3 className="mr-stats-section-title">Destaque do ano</h3>
          <div className="mr-stats-highlight-card">
            {/* Pôster do anime destaque (64px de largura, usa paleta tipográfica se sem URL) */}
            <div style={{ width: 64, flexShrink: 0 }}>
              <PosterCard
                title={highlight.title}
                posterUrl={highlight.poster_url}
                posterKey={highlight.poster_key ?? 'magenta'}
              />
            </div>

            {/* Informações do anime destaque */}
            <div className="mr-stats-highlight-info">
              {/* Título em sans semi-bold */}
              <p className="mr-stats-highlight-title">{highlight.title}</p>

              {/* Nota em estrelas MAL (escala 0–10) */}
              <Stars score={highlight.score ?? 0} size={14} />

              {/* Estúdio · Temporada em mono muted */}
              {(highlight.studio || highlight.season) && (
                <p className="mr-stats-highlight-meta">
                  {[highlight.studio, highlight.season].filter(Boolean).join(' · ')}
                </p>
              )}

              {/* Maior maratona: exibido só quando há dados e > 0 */}
              {max_marathon_day != null && max_marathon_day > 0 && (
                <p className="mr-stats-marathon">
                  🏃 Maior maratona: <strong>{max_marathon_day}</strong> eps num dia
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ── Heatmap de atividade ─────────────────────────────────────────────── */}
      {heatmap && Object.keys(heatmap).length > 0 && (
        <section className="mr-stats-section">
          <h3 className="mr-stats-section-title">Atividade em {year}</h3>
          <Heatmap data={heatmap} year={year} />
        </section>
      )}
    </div>
  )
}
