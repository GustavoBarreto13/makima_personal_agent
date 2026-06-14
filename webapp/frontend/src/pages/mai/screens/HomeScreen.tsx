// HomeScreen — tela Início da Mai.
// Exibe: hero animado com status resumido + seção "Assistindo agora" + seção "Próximos".

import { useState, useEffect } from 'react'
import type { Series, UpcomingEpisode } from '../types'
import { maiApi } from '../maiApi'
import { PosterCard } from '../components/PosterCard'
import { Stars } from '../components/Stars'

interface Props {
  /** Navega para outra tela da shell. */
  onNav: (view: string, param?: string) => void
  /** Abre o modal de log de sessão. */
  onOpenLog: (seriesId?: string, title?: string) => void
}

/** Tela Início — visão geral do catálogo de séries. */
export function HomeScreen({ onNav, onOpenLog }: Props) {
  const [watching,  setWatching]  = useState<Series[]>([])
  const [upcoming,  setUpcoming]  = useState<UpcomingEpisode[]>([])
  const [stats,     setStats]     = useState<{ total_series: number; total_episodes: number; avg_rating: number | null } | null>(null)
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    // Carrega em paralelo: séries "assistindo", próximos eps e estatísticas
    Promise.allSettled([
      maiApi.list('assistindo'),
      maiApi.upcoming(),
      maiApi.stats(),
    ]).then(([watchRes, upRes, statsRes]) => {
      if (watchRes.status === 'fulfilled') setWatching((watchRes.value as any).series ?? [])
      if (upRes.status   === 'fulfilled') setUpcoming((upRes.value as any).upcoming ?? [])
      if (statsRes.status === 'fulfilled') {
        const s = statsRes.value as any
        setStats({ total_series: s.total_series, total_episodes: s.total_episodes, avg_rating: s.avg_rating })
      }
    }).finally(() => setLoading(false))
  }, [])

  // Agrupa próximos eps por data
  const today = new Date().toISOString().slice(0, 10)
  const todayEps  = upcoming.filter(u => u.air_date === today)
  const soonEps   = upcoming.filter(u => u.air_date > today).slice(0, 5)

  return (
    <div className="page">
      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <div className="hero">
        <div className="hero-bg">
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(135deg, var(--paper-2), var(--paper))',
          }} />
        </div>
        <div className="hero-warmlight" />
        <div className="hero-portrait" style={{ display: 'none' }} /> {/* placeholder – imagem opcional */}
        <div className="hero-inner">
          <div className="hero-eyebrow">
            <span>🐰</span> Mai Sakurajima
          </div>
          <h1 className="hero-title">
            Sua cinemateca<br />de séries
          </h1>
          <div className="hero-line">
            {stats && (
              <>
                <span><b>{stats.total_series}</b> séries</span>
                <span>·</span>
                <span><b>{stats.total_episodes}</b> episódios</span>
                {stats.avg_rating && (
                  <>
                    <span>·</span>
                    <span>Média <b>{stats.avg_rating.toFixed(1)} ⭐</b></span>
                  </>
                )}
              </>
            )}
          </div>
          <div className="hero-cta">
            <button className="btn btn-primary" onClick={() => onOpenLog()}>
              📺 Registrar sessão
            </button>
            <button className="btn btn-ghost" onClick={() => onNav('catalog')}>
              Ver catálogo
            </button>
          </div>
        </div>
      </div>

      {/* ── Assistindo agora ──────────────────────────────────────────────── */}
      {(loading || watching.length > 0) && (
        <div className="section">
          <div className="section-head">
            <h2 className="section-title">Assistindo agora</h2>
            {watching.length > 4 && (
              <button className="section-link" onClick={() => onNav('catalog', 'assistindo')}>
                Ver todos
              </button>
            )}
          </div>
          {loading ? (
            <div className="empty-state" style={{ padding: '40px 0' }}>Carregando…</div>
          ) : (
            <div className="poster-grid">
              {watching.slice(0, 8).map(s => (
                <div key={s.id} className="poster-link" onClick={() => onNav('detail', s.id)}>
                  <PosterCard series={s} />
                  <div className="poster-meta">
                    <div className="pm-title">{s.title}</div>
                    <div className="pm-sub">
                      {s.rating && (
                        <span className="sc">
                          <Stars rating={s.rating} size="sm" />
                          {s.rating.toFixed(1)}
                        </span>
                      )}
                      <span>{s.network}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Episódios de hoje ─────────────────────────────────────────────── */}
      {todayEps.length > 0 && (
        <div className="section">
          <div className="section-head">
            <h2 className="section-title">Hoje</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {todayEps.map((ep, i) => (
              <div
                key={i}
                className="sched-card"
                onClick={() => onNav('detail', ep.series_id)}
              >
                <div className="sched-still">
                  {ep.still_url
                    ? <img src={ep.still_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }} />
                    : <span style={{ fontSize: 18 }}>📺</span>
                  }
                </div>
                <div className="sched-info">
                  <div className="sched-title">{ep.series_title}</div>
                  <div className="sched-ep">
                    T{ep.season_number} E{String(ep.episode_number).padStart(2, '0')}
                    {ep.title ? ` · ${ep.title}` : ''}
                  </div>
                </div>
                <div className="sched-badge">HOJE</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Em breve ──────────────────────────────────────────────────────── */}
      {soonEps.length > 0 && (
        <div className="section">
          <div className="section-head">
            <h2 className="section-title">Em breve</h2>
            <button className="section-link" onClick={() => onNav('upcoming')}>
              Ver todos
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {soonEps.map((ep, i) => {
              const d = new Date(ep.air_date + 'T00:00:00')
              const label = d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })
              return (
                <div key={i} className="sched-card" onClick={() => onNav('detail', ep.series_id)}>
                  <div className="sched-still">
                    {ep.still_url
                      ? <img src={ep.still_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }} />
                      : <span style={{ fontSize: 18 }}>🌙</span>
                    }
                  </div>
                  <div className="sched-info">
                    <div className="sched-title">{ep.series_title}</div>
                    <div className="sched-ep">T{ep.season_number} E{String(ep.episode_number).padStart(2, '0')}</div>
                  </div>
                  <div className="sched-badge">{label}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Empty state quando não há nada assistindo */}
      {!loading && watching.length === 0 && upcoming.length === 0 && (
        <div className="empty-state" style={{ marginTop: 48 }}>
          Nenhuma série no catálogo ainda. 📺
          <br />
          <button
            className="btn btn-primary"
            style={{ marginTop: 16 }}
            onClick={() => onNav('catalog')}
          >
            Explorar catálogo
          </button>
        </div>
      )}
    </div>
  )
}
