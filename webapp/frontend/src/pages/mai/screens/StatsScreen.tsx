// StatsScreen — estatísticas anuais (ano selecionável).
// Layout: seletor de ano + 4 big stats + top gêneros + barras mensais.

import { useState, useEffect } from 'react'
import type { Stats } from '../types'
import { maiApi } from '../maiApi'
import { IconChevL, IconChevR } from '../components/MaiIcons'

/** StatsScreen — métricas anuais de séries assistidas. */
export function StatsScreen() {
  const currentYear = new Date().getFullYear()
  const [year,    setYear]    = useState(currentYear)
  const [stats,   setStats]   = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    maiApi.stats(year)
      .then(res => setStats(res as unknown as Stats))
      .catch(() => setStats(null))
      .finally(() => setLoading(false))
  }, [year])

  // Valor máximo dos meses para escala das barras
  const maxMonth = stats ? Math.max(...stats.monthly, 1) : 1

  const MONTH_LABELS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

  return (
    <div className="page" style={{ paddingTop: 28 }}>
      {/* ── Seletor de ano ────────────────────────────────────────────────── */}
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
          {/* ── 4 Big Stats ─────────────────────────────────────────────── */}
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

          {/* ── Barras mensais + Top gêneros ────────────────────────────── */}
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

            {/* Top gêneros */}
            <div className="stat-panel">
              <div className="stat-panel-head">
                <span className="t">Top gêneros</span>
              </div>
              {stats.top_genres.length === 0 ? (
                <div style={{ color: 'var(--ink-4)', fontSize: 13, fontStyle: 'italic' }}>Sem dados</div>
              ) : (
                <>
                  {stats.top_genres.map((g, i) => (
                    <div key={i} className="rank-row">
                      <span className="rk-name">{g.genre}</span>
                      <div className="rk-track">
                        <i style={{ width: `${(g.count / stats.top_genres[0].count) * 100}%` }} />
                      </div>
                      <span className="rk-n">{g.count}</span>
                    </div>
                  ))}
                </>
              )}

              {/* Top redes */}
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

          {/* ── Distribuição por status ──────────────────────────────────── */}
          {stats.by_status && Object.keys(stats.by_status).length > 0 && (
            <div className="stat-panel" style={{ marginTop: 18 }}>
              <div className="stat-panel-head">
                <span className="t">Por status</span>
              </div>
              <div className="ps-cols">
                {Object.entries(stats.by_status).map(([status, count]) => (
                  <div key={status} className="ps-row">
                    <span className="ps-dot" style={{ background: `var(--st-${status})` }} />
                    <span className="ps-label">{status.replace('_', ' ')}</span>
                    <span className="ps-n">{count}</span>
                  </div>
                ))}
              </div>
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
