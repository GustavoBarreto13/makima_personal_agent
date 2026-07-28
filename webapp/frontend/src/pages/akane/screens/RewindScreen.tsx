// Tela Rewind — year-in-review, reescrita hi-fi conforme o handoff §7.8:
// hero "Rewind {ano}", 4 totais, sessões por mês (barras), histograma de
// notas, destaques (favorito/maratona/década/nota média), top gêneros,
// top diretores e pessoas do ano — todos com os primitivos do sistema.
// Dados de GET /api/movies/rewind?year=AAAA + GET /heatmap (vazio-seguro).

import { useState, useEffect } from 'react'
import { akaneApi } from '../akaneApi'
import type { Rewind, HeatmapDay } from '../types'
import { Heatmap } from '../components/Heatmap'
import { Stars } from '../components/Stars'
import { Icon } from '../ui/Icon'
import { MESES_CURTO } from '../dateUtils'

// Iniciais de um nome (até 2 letras) — usado no avatar de rank-row
function initials(name: string): string {
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

/** Bloco chave-valor-subtítulo do card "Destaques do ano". */
function Highlight({ k, v, s }: { k: string; v: string; s?: string }) {
  return (
    <div className="ak-highlight">
      <span className="ak-hl-k">{k}</span>
      <span className="ak-hl-v">{v}</span>
      {s && <span className="ak-hl-s">{s}</span>}
    </div>
  )
}

export function RewindScreen() {
  const [year, setYear] = useState(new Date().getFullYear())
  const [data, setData] = useState<Rewind | null>(null)
  const [heatmapDays, setHeatmapDays] = useState<HeatmapDay[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    akaneApi.rewind(year)
      .then(d => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
    akaneApi.heatmap(year)
      .then(r => setHeatmapDays(r.days))
      .catch(() => setHeatmapDays([]))
  }, [year])

  const currentYear = new Date().getFullYear()
  const yearOptions = Array.from({ length: 6 }, (_, i) => currentYear - i)

  if (loading) return <p className="ak-empty-state">Calculando o rewind…</p>

  return (
    <div className="ak-page">
      {/* ── HERO ── */}
      <div className="ak-rewind-hero">
        <div className="ak-eyebrow">Seu ano em cinema</div>
        <h2>
          Rewind {year}
          <select value={year} onChange={e => setYear(Number(e.target.value))}
                  className="ak-period-select" style={{ marginLeft: 14, fontSize: 15 }}>
            {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </h2>
        {data && data.total_films > 0 && (
          <p className="ak-sub">
            {data.total_sessions} sessões · {data.total_films} filmes ·{' '}
            {Math.round(data.total_minutes / 60)} horas no escuro
          </p>
        )}
      </div>

      {!data || data.total_films === 0 ? (
        <p className="ak-empty-state">Nenhum filme em {year} — comece a logar sessões para ver o Rewind.</p>
      ) : (
        <>
          {/* ── TOTAIS ── */}
          <div className="ak-big-stat-row">
            <div className="ak-big-stat"><div className="ak-n">{data.total_films}</div><div className="ak-l">filmes vistos</div></div>
            <div className="ak-big-stat"><div className="ak-n">{data.total_sessions}</div><div className="ak-l">sessões no diário</div></div>
            <div className="ak-big-stat">
              <div className="ak-n">{Math.round(data.total_minutes / 60)}<span style={{ fontSize: 24 }}>h</span></div>
              <div className="ak-l">horas assistidas</div>
            </div>
            <div className="ak-big-stat"><div className="ak-n">{data.rewatches}</div><div className="ak-l">revisões</div></div>
          </div>

          {/* ── SESSÕES POR MÊS ── */}
          {data.monthly.length === 12 && (
            <div className="ak-section">
              <div className="ak-heat-card">
                <div className="ak-heat-head">
                  <span className="ak-heat-title">Sessões por mês</span>
                  <span className="ak-section-sub">o pulso do ano</span>
                </div>
                <div className="ak-bars">
                  {data.monthly.map((v, i) => {
                    const max = Math.max(...data.monthly, 1)
                    return (
                      <div key={i} className="ak-bar-col">
                        <span className="ak-bar-val">{v}</span>
                        <div className={'ak-bar' + (v === 0 ? ' ak-empty' : '')}
                             style={{ height: `${Math.max(2, (v / max) * 100)}%` }} />
                        <span className="ak-bar-lbl">{MESES_CURTO[i]}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          <div className="ak-section ak-rewind-grid">
            {/* ── HISTOGRAMA DE NOTAS ── */}
            <div className="ak-heat-card">
              <div className="ak-heat-head"><span className="ak-heat-title">Como você avalia</span><span className="ak-section-sub">0,5 a 5,0</span></div>
              {(() => {
                const distKeys: string[] = []
                for (let v = 5; v >= 0.5; v -= 0.5) distKeys.push(v.toFixed(1))
                const maxDist = Math.max(...distKeys.map(k => data.rating_histogram[k] ?? 0), 1)
                return distKeys.map(k => (
                  <div key={k} className="ak-hist-row">
                    <span className="ak-hl"><Stars value={Number(k)} /><span className="ak-n">{k}</span></span>
                    <span className="ak-hist-bar"><i style={{ width: `${((data.rating_histogram[k] ?? 0) / maxDist) * 100}%` }} /></span>
                    <span className="ak-hist-n">{data.rating_histogram[k] ?? 0}</span>
                  </div>
                ))
              })()}
            </div>

            {/* ── DESTAQUES ── */}
            <div className="ak-heat-card">
              <div className="ak-heat-head"><span className="ak-heat-title">Destaques do ano</span></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 4 }}>
                {data.favorite && (
                  <Highlight k="Filme favorito" v={data.favorite.title} s={`${data.favorite.rating.toFixed(1)}★`} />
                )}
                {data.max_sessions > 0 && (
                  <Highlight k="Maior maratona" v={`${data.max_sessions} filmes`} s="no mesmo dia" />
                )}
                {data.top_decade && (
                  <Highlight k="Década mais vista" v={`Anos ${String(data.top_decade.decade).slice(2)}`}
                             s={`${data.top_decade.count} filmes desse período`} />
                )}
                {data.avg_rating != null && (
                  <Highlight k="Nota média" v={data.avg_rating.toFixed(2)} s={`${data.liked_count} filmes com coração`} />
                )}
              </div>
            </div>

            {/* ── TOP GÊNEROS ── */}
            {data.top_genres.length > 0 && (
              <div className="ak-heat-card">
                <div className="ak-heat-head"><span className="ak-heat-title">Top gêneros</span></div>
                {(() => {
                  const genres = data.top_genres.slice(0, 6)
                  const max = Math.max(...genres.map(g => g.count), 1)
                  return genres.map(g => (
                    <div key={g.genre} className="ak-rank-row">
                      <div style={{ flex: '0 0 auto', minWidth: 92 }}>
                        <div className="ak-rk-name">{g.genre}</div>
                      </div>
                      <span className="ak-rk-track"><i style={{ width: `${(g.count / max) * 100}%` }} /></span>
                      <span className="ak-rk-n">{g.count}</span>
                    </div>
                  ))
                })()}
              </div>
            )}

            {/* ── TOP DIRETORES ── */}
            {data.top_directors.length > 0 && (
              <div className="ak-heat-card">
                <div className="ak-heat-head"><span className="ak-heat-title">Top diretores</span></div>
                {(() => {
                  const directors = data.top_directors.slice(0, 6)
                  const max = Math.max(...directors.map(d => d.count), 1)
                  return directors.map(d => (
                    <div key={d.director} className="ak-rank-row">
                      <span className="ak-rk-av">{initials(d.director)}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="ak-rk-name">{d.director}</div>
                        <div className="ak-rk-sub">{d.count} {d.count === 1 ? 'filme' : 'filmes'}</div>
                      </div>
                      <span className="ak-rk-track" style={{ maxWidth: 90 }}><i style={{ width: `${(d.count / max) * 100}%` }} /></span>
                    </div>
                  ))
                })()}
              </div>
            )}
          </div>

          {/* ── ATIVIDADE DO ANO (heatmap) ── */}
          {heatmapDays.length > 0 && (
            <div className="ak-section">
              <div className="ak-heat-card">
                <div className="ak-heat-head"><span className="ak-heat-title">Atividade do ano</span></div>
                <Heatmap data={heatmapDays} />
              </div>
            </div>
          )}

          {/* ── PESSOAS QUE MARCARAM O ANO ── */}
          {data.top_people.length > 0 && (
            <div className="ak-section">
              <div className="ak-heat-card">
                <div className="ak-heat-head">
                  <span className="ak-heat-title">Pessoas que marcaram seu ano</span>
                  <span className="ak-section-sub">direção + elenco + equipe</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '4px 24px' }}>
                  {data.top_people.map(p => (
                    <div key={p.name} className="ak-rank-row ak-person">
                      <span className="ak-rk-av">{initials(p.name)}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="ak-rk-name">{p.name}</div>
                        <div className="ak-rk-sub">{p.roles.join(' · ')}</div>
                      </div>
                      <span className="ak-rk-n">{p.count}</span>
                    </div>
                  ))}
                </div>
                <div className="ak-people-note">
                  <Icon name="user" /> Em breve, cada pessoa abre um perfil próprio — conectado à base de pessoas do app.
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
