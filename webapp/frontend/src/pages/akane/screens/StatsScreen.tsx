// Tela Estatísticas — SEM referência no design handoff (extra do app real).
// Recomposta só com os primitivos já portados (big-stat-row, hist-row,
// rank-row) para ficar no mesmo sistema visual das outras telas.

import { useState, useEffect } from 'react'
import { akaneApi } from '../akaneApi'
import type { Stats } from '../types'
import { Icon } from '../ui/Icon'
import { Stars } from '../components/Stars'

/**
 * Estatísticas do ano — totais, histograma de notas, top gêneros e diretores.
 * Vazio-seguro: sem dados, mostra os cards zerados (SC-006).
 */
export function StatsScreen() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [year, setYear] = useState(new Date().getFullYear())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    akaneApi.stats(year)
      .then(res => setStats(res))
      .catch(() => setStats(null))
      .finally(() => setLoading(false))
  }, [year])

  if (loading) return <p className="empty-state">Calculando estatísticas…</p>

  const s = stats

  return (
    <div className="page">
      {/* ── Seletor de ano ── */}
      <div className="rewind-hero">
        <div className="eyebrow">Números da cinemateca</div>
        <h2>
          Estatísticas
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 14 }}>
            <button className="year-nav-btn" onClick={() => setYear(y => y - 1)} aria-label="Ano anterior">
              <Icon name="chevL" />
            </button>
            <span style={{ fontFamily: 'var(--display)', fontSize: 22, color: 'var(--rose-deep)' }}>{year}</span>
            <button className="year-nav-btn" onClick={() => setYear(y => y + 1)}
                    disabled={year >= new Date().getFullYear()} aria-label="Próximo ano">
              <Icon name="chevR" />
            </button>
          </span>
        </h2>
      </div>

      {/* ── Totais ── */}
      <div className="big-stat-row">
        <div className="big-stat"><div className="n">{s?.total_films ?? 0}</div><div className="l">filmes vistos</div></div>
        <div className="big-stat"><div className="n">{s?.total_sessions ?? 0}</div><div className="l">sessões</div></div>
        <div className="big-stat"><div className="n">{s?.rewatches ?? 0}</div><div className="l">revisões</div></div>
        <div className="big-stat"><div className="n">{s?.avg_rating ? s.avg_rating.toFixed(1) : '—'}</div><div className="l">nota média</div></div>
      </div>

      <div className="section rewind-grid">
        {/* ── Histograma de notas ── */}
        {s && Object.values(s.rating_histogram).some(v => v > 0) && (
          <div className="heat-card">
            <div className="heat-head"><span className="heat-title">Distribuição de notas</span><span className="section-sub">0,5 a 5,0</span></div>
            {(() => {
              const distKeys: string[] = []
              for (let v = 5; v >= 0.5; v -= 0.5) distKeys.push(v.toFixed(1))
              const maxDist = Math.max(...distKeys.map(k => s.rating_histogram[k] ?? 0), 1)
              return distKeys.map(k => (
                <div key={k} className="hist-row">
                  <span className="hl"><Stars value={Number(k)} /><span className="n">{k}</span></span>
                  <span className="hist-bar"><i style={{ width: `${((s.rating_histogram[k] ?? 0) / maxDist) * 100}%` }} /></span>
                  <span className="hist-n">{s.rating_histogram[k] ?? 0}</span>
                </div>
              ))
            })()}
          </div>
        )}

        {/* ── Top gêneros ── */}
        {s && s.top_genres.length > 0 && (
          <div className="heat-card">
            <div className="heat-head"><span className="heat-title">Gêneros mais vistos</span></div>
            {(() => {
              const max = Math.max(...s.top_genres.map(g => g.count), 1)
              return s.top_genres.slice(0, 6).map(g => (
                <div key={g.genre} className="rank-row">
                  <div style={{ flex: '0 0 auto', minWidth: 92 }}><div className="rk-name">{g.genre}</div></div>
                  <span className="rk-track"><i style={{ width: `${(g.count / max) * 100}%` }} /></span>
                  <span className="rk-n">{g.count}</span>
                </div>
              ))
            })()}
          </div>
        )}

        {/* ── Top diretores ── */}
        {s && s.top_directors.length > 0 && (
          <div className="heat-card">
            <div className="heat-head"><span className="heat-title">Diretores mais vistos</span></div>
            {(() => {
              const max = Math.max(...s.top_directors.map(d => d.count), 1)
              return s.top_directors.slice(0, 6).map(d => (
                <div key={d.director} className="rank-row">
                  <div style={{ flex: '0 0 auto', minWidth: 92 }}><div className="rk-name">{d.director}</div></div>
                  <span className="rk-track"><i style={{ width: `${(d.count / max) * 100}%` }} /></span>
                  <span className="rk-n">{d.count}</span>
                </div>
              ))
            })()}
          </div>
        )}
      </div>

      {s && s.total_sessions === 0 && (
        <p className="empty-state">Nenhuma sessão em {year} — registre filmes assistidos para ver as estatísticas.</p>
      )}
    </div>
  )
}
