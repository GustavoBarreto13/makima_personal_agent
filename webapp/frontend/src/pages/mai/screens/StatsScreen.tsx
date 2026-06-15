// StatsScreen — estatísticas anuais (ano selecionável).
// Layout: seletor de ano + 4 big stats + Destaque do ano + barras mensais
//         + top gêneros/redes + por status + Heatmap de sessões.

import { useState, useEffect } from 'react'
import type { Stats } from '../types'
import { maiApi } from '../maiApi'
import { IconChevL, IconChevR } from '../components/MaiIcons'
import { Heatmap } from '../components/Heatmap'
import { Stars } from '../components/Stars'
import { PosterCard } from '../components/PosterCard'

/** StatsScreen — métricas anuais de séries assistidas. */
export function StatsScreen() {
  const currentYear = new Date().getFullYear()
  const [year,    setYear]    = useState(currentYear)
  const [stats,   setStats]   = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  // Recarrega stats toda vez que o ano muda
  useEffect(() => {
    setLoading(true)
    maiApi.stats(year)
      .then(res => setStats(res as unknown as Stats))
      .catch(() => setStats(null))
      .finally(() => setLoading(false))
  }, [year])

  // Valor máximo dos meses para escala das barras mensais
  const maxMonth = stats ? Math.max(...stats.monthly, 1) : 1

  // Abreviações dos meses em pt-BR para o eixo X das barras
  const MONTH_LABELS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

  return (
    <div className="page" style={{ paddingTop: 28 }}>

      {/* ── Seletor de ano ──────────────────────────────────────────────────── */}
      <div className="year-switch">
        <button
          onClick={() => setYear(y => y - 1)}
          disabled={year <= 2020}
        >
          <IconChevL />
        </button>
        <span className="yr">{year}</span>
        <button
          onClick={() => setYear(y => y + 1)}
          disabled={year >= currentYear}
        >
          <IconChevR />
        </button>
        {stats && (
          <div className="yr-sub">
            {stats.total_episodes} eps · {stats.total_hours}h
          </div>
        )}
      </div>

      {loading && <div className="empty-state" style={{ marginTop: 48 }}>Carregando…</div>}

      {!loading && stats && (
        <>
          {/* ── 4 Big Stats ───────────────────────────────────────────────── */}
          <div className="big-stat-row" style={{ marginTop: 26 }}>
            <div className="big-stat">
              <div className="n">{stats.total_series}</div>
              <div className="l">Séries</div>
            </div>
            <div className="big-stat">
              <div className="n">{stats.total_episodes}</div>
              <div className="l">Episódios</div>
            </div>
            <div className="big-stat">
              <div className="n">{stats.total_hours}<span className="u">h</span></div>
              <div className="l">Horas</div>
            </div>
            <div className="big-stat">
              <div className="n" style={{ fontSize: 36 }}>
                {stats.avg_rating ? stats.avg_rating.toFixed(1) : '—'}
              </div>
              <div className="l">Nota média ⭐</div>
            </div>
          </div>

          {/* ── Destaque do ano ───────────────────────────────────────────── */}
          {/* Exibido apenas quando há dados — série com maior rating e sessões no ano */}
          {stats.highlight && (
            <div className="yr-highlight" style={{ marginTop: 26 }}>
              {/* Pôster à esquerda */}
              <div className="yh-poster">
                <PosterCard series={{
                  title: stats.highlight.title,
                  title_original: null,
                  poster_url: stats.highlight.poster_url,
                  first_air_date: null,
                  network: stats.highlight.network,
                  episodes_watched: stats.highlight.episodes_year,
                  episodes_count: null,
                  rating: stats.highlight.rating,
                  status: 'concluida',
                }} />
              </div>

              {/* Info à direita */}
              <div className="yh-body">
                <div className="yh-eyebrow">⭐ Destaque de {year}</div>
                <div className="yh-title">{stats.highlight.title}</div>
                {stats.highlight.network && (
                  <div className="yh-net">{stats.highlight.network}</div>
                )}

                {/* Nota em estrelas */}
                {stats.highlight.rating && (
                  <Stars rating={stats.highlight.rating} size="sm" showNum />
                )}

                {/* Métricas do ano: episódios e sessões */}
                <div className="yh-stats">
                  <div className="yh-stat">
                    <span className="k">Episódios no ano</span>
                    <span className="v">{stats.highlight.episodes_year}</span>
                  </div>
                  <div className="yh-stat">
                    <span className="k">Sessões</span>
                    <span className="v">{stats.highlight.sessions_year}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Barras mensais + Top gêneros ──────────────────────────────── */}
          <div className="stats-grid" style={{ marginTop: 18 }}>
            {/* Barras mensais */}
            <div className="stat-panel">
              <div className="stat-panel-head">
                <span className="t">Episódios por mês</span>
              </div>
              <div className="bars">
                {stats.monthly.map((count, i) => (
                  <div key={i} className="bar-col">
                    <span className="bar-val">{count > 0 ? count : ''}</span>
                    <div
                      className={`bar${count === 0 ? ' empty' : ''}`}
                      style={{ height: `${(count / maxMonth) * 120}px` }}
                    />
                    <span className="bar-lbl">{MONTH_LABELS[i]}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Top gêneros + plataformas */}
            <div className="stat-panel">
              <div className="stat-panel-head">
                <span className="t">Top gêneros</span>
              </div>
              {stats.top_genres.length === 0 ? (
                <div style={{ color: 'var(--ink-4)', fontSize: 13, fontStyle: 'italic' }}>Sem dados</div>
              ) : (
                stats.top_genres.map((g, i) => (
                  <div key={i} className="rank-row">
                    <span className="rk-name">{g.genre}</span>
                    <div className="rk-track">
                      <i style={{ width: `${(g.count / stats.top_genres[0].count) * 100}%` }} />
                    </div>
                    <span className="rk-n">{g.count}</span>
                  </div>
                ))
              )}

              {/* Top plataformas/redes */}
              {stats.top_networks.length > 0 && (
                <>
                  <div className="detail-section-title" style={{ marginTop: 22 }}>
                    Plataformas
                    <span className="st-line" />
                  </div>
                  {stats.top_networks.map((n, i) => (
                    <div key={i} className="rank-row">
                      <span className="rk-name">{n.network}</span>
                      <div className="rk-track warm">
                        <i style={{ width: `${(n.count / stats.top_networks[0].count) * 100}%` }} />
                      </div>
                      <span className="rk-n">{n.count}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>

          {/* ── Distribuição por status ────────────────────────────────────── */}
          {stats.by_status && Object.keys(stats.by_status).length > 0 && (
            <div className="stat-panel" style={{ marginTop: 18 }}>
              <div className="stat-panel-head">
                <span className="t">Por status</span>
              </div>
              <div className="ps-cols">
                {Object.entries(stats.by_status).map(([status, count]) => (
                  <div key={status} className="ps-row">
                    <span className="ps-dot" style={{ background: `var(--st-${status})` }} />
                    <span className="ps-label">{status.replace(/_/g, ' ')}</span>
                    <span className="ps-n">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Heatmap de sessões ─────────────────────────────────────────── */}
          {/* Só exibe se houver dados diários (proteção para anos sem sessões) */}
          {stats.daily && stats.daily.length > 0 && (
            <div className="heat-card" style={{ marginTop: 26 }}>
              <div className="stat-panel-head" style={{ marginBottom: 16 }}>
                <span className="t">Sessões · {year}</span>
              </div>
              <Heatmap data={stats.daily} />
            </div>
          )}
        </>
      )}

      {!loading && !stats && (
        <div className="empty-state" style={{ marginTop: 48 }}>
          Nenhum dado disponível para {year}.
        </div>
      )}
    </div>
  )
}
