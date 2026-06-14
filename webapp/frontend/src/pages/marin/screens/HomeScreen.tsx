// Tela inicial da Marin — hub de dados da cinemateca de animes.
// Dados: marinApi.home() → um único request que agrega todos os blocos.
// Layout: hero (último anime) + stats rápidos + profile-split (favoritos + mal-stats) +
//         "Assistindo agora" + carrossel watchlist + próximos episódios.

import { useState, useEffect } from 'react'
import { marinApi } from '../marinApi'
import type { HomeData, Tweaks } from '../types'
import { PosterCard }       from '../components/PosterCard'
import { EpisodeProgress }  from '../components/EpisodeProgress'
import { MalStats }         from '../components/MalStats'
import { FavoriteAnimes }   from '../components/FavoriteAnimes'
import { Score }            from '../components/Score'

interface HomeScreenProps {
  tweaks: Tweaks
  onSelectAnime: (id: string) => void
  onLog: (animeId?: string, epNumber?: number) => void
  onNav: (screen: string) => void
  onToast: (msg: string) => void
}

/**
 * HomeScreen — dashboard principal da Marin.
 * Um único fetch de /api/animes/home preenche todos os blocos.
 */
export function HomeScreen({ onSelectAnime, onLog, onNav, onToast }: HomeScreenProps) {
  const [data, setData] = useState<HomeData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    marinApi.home()
      .then(d => setData(d as unknown as HomeData))
      .catch(() => onToast('Erro ao carregar dados da home.'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="mr-home-loading">
        <div className="mr-spinner" />
      </div>
    )
  }

  if (!data) return null

  const {
    last_session,
    currently_watching,
    recent_logs,
    upcoming_episodes,
    watchlist_preview,
    counts,
    episodes_7d,
    episodes_7d_prev,
    avg_score_year,
  } = data

  // Variação de episódios semana vs semana anterior (para o stat card)
  const epDelta = episodes_7d - (episodes_7d_prev ?? 0)
  const epDeltaText = epDelta === 0
    ? '= semana anterior'
    : epDelta > 0
    ? `↑ ${epDelta} a mais`
    : `↓ ${Math.abs(epDelta)} a menos`

  // Total de animes no catálogo
  const totalAnimes = Object.values(counts).reduce((a, b) => a + b, 0)

  return (
    <div className="mr-home">

      {/* ── Hero estático — portrait da Marin + stats ─────────────────────── */}
      <section className="mr-hero">
        {/* Fundo com gradiente temático */}
        <div className="mr-hero-bg" />
        {/* Brilho quente posicionado no canto superior direito */}
        <div className="mr-hero-warmlight" />
        {/* Portrait da Marin com halo de brilho */}
        <div className="mr-hero-portrait">
          <div className="mr-hero-halo" />
          <img src="/marin.png" alt="Marin Kitagawa" />
        </div>
        {/* Conteúdo textual à esquerda */}
        <div className="mr-hero-inner">
          <div className="mr-hero-eyebrow">
            <span>🎀</span> Marin Kitagawa
          </div>
          <h1 className="mr-hero-title">
            Seu catálogo<br />de animes
          </h1>
          <div className="mr-hero-line">
            <span><b>{totalAnimes}</b> animes</span>
            <span>·</span>
            <span><b>{counts.assistindo ?? 0}</b> em andamento</span>
            {avg_score_year != null && (
              <>
                <span>·</span>
                <span>Média <b>{avg_score_year.toFixed(1)} ⭐</b></span>
              </>
            )}
          </div>
          <div className="mr-hero-cta">
            <button className="mr-btn mr-btn--primary" onClick={() => onLog()}>
              📺 Logar ep
            </button>
            <button className="mr-btn mr-btn-ghost" onClick={() => onNav('catalogo')}>
              Ver catálogo
            </button>
          </div>
        </div>
      </section>

      {/* ── Hero dinâmico: último anime assistido ──────────────────────────── */}
      {last_session && (
        <section className="mr-home-hero">
          {/* Banner do último anime */}
          <div
            className="mr-home-hero-banner"
            style={{
              backgroundImage: last_session.anime?.banner_url
                ? `url(${last_session.anime.banner_url})`
                : undefined,
            }}
          >
            <div className="mr-home-hero-gradient" />
          </div>

          <div className="mr-home-hero-content">
            {/* Pôster miniatura */}
            <PosterCard
              title={last_session.anime?.title ?? ''}
              posterUrl={last_session.anime?.poster_url}
              posterKey={last_session.anime?.poster_key}
              onClick={() => onSelectAnime(last_session.anime.id)}
              className="mr-home-hero-poster"
            />

            <div className="mr-home-hero-info">
              <p className="mr-home-hero-label">Continue assistindo</p>
              <h2 className="mr-home-hero-title">
                {last_session.anime?.title}
              </h2>

              {last_session.next_episode && (
                <p className="mr-home-hero-ep">
                  Próximo: Ep {last_session.next_episode.number}
                  {last_session.next_episode.title
                    ? ` — ${last_session.next_episode.title}`
                    : ''}
                </p>
              )}

              <EpisodeProgress
                watched={last_session.anime?.episodes_watched ?? 0}
                total={last_session.anime?.episodes_total}
                className="mr-home-hero-progress"
              />

              {/* Botão de continuar */}
              <button
                className="mr-btn mr-btn--primary"
                onClick={() =>
                  onLog(last_session.anime.id, last_session.next_episode?.number)
                }
              >
                {last_session.next_episode
                  ? `▶ Ep ${last_session.next_episode.number}`
                  : '▶ Logar sessão'
                }
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ── Cards de estatísticas rápidas ─────────────────────────────────── */}
      <section className="mr-home-stats-row">
        <div className="mr-stat-card">
          <div className="mr-stat-value">{episodes_7d}</div>
          <div className="mr-stat-label">Eps esta semana</div>
          <div className="mr-stat-sub" style={{ color: epDelta >= 0 ? 'var(--marin)' : 'var(--ink-3)' }}>
            {epDeltaText}
          </div>
        </div>
        <div className="mr-stat-card">
          <div className="mr-stat-value">{counts.assistindo ?? 0}</div>
          <div className="mr-stat-label">Em andamento</div>
        </div>
        <div className="mr-stat-card">
          <div className="mr-stat-value" style={{ color: 'var(--star)' }}>
            {avg_score_year ? avg_score_year.toFixed(1) : '—'}
          </div>
          <div className="mr-stat-label">Média este ano</div>
        </div>
        <div className="mr-stat-card">
          <div className="mr-stat-value">{totalAnimes}</div>
          <div className="mr-stat-label">Total no catálogo</div>
        </div>
      </section>

      {/* ── Profile split: favoritos + mal-stats ────────────────────────────── */}
      <section className="mr-home-profile-split">
        <div className="mr-home-profile-col">
          <h3 className="mr-home-section-title">Favoritos</h3>
          <FavoriteAnimes onSelectAnime={onSelectAnime} />
        </div>
        <div className="mr-home-profile-col">
          <h3 className="mr-home-section-title">Catálogo</h3>
          <MalStats counts={counts} avgScore={avg_score_year} />
        </div>
      </section>

      {/* ── Assistindo agora ────────────────────────────────────────────────── */}
      {currently_watching && currently_watching.length > 0 && (
        <section className="mr-home-watching">
          <h3 className="mr-home-section-title">Assistindo agora</h3>
          <div className="mr-home-watching-list">
            {currently_watching.slice(0, 6).map(anime => (
              <div
                key={anime.id}
                className="mr-watching-item"
                onClick={() => onSelectAnime(anime.id)}
                role="button"
                tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter') onSelectAnime(anime.id) }}
              >
                <PosterCard
                  title={anime.title}
                  posterUrl={anime.poster_url}
                  posterKey={anime.poster_key}
                  className="mr-watching-poster"
                />
                <div className="mr-watching-info">
                  <p className="mr-watching-title">{anime.title}</p>
                  <EpisodeProgress
                    watched={anime.episodes_watched ?? 0}
                    total={anime.episodes_total}
                    showBar={false}
                  />
                  {anime.score && <Score score={anime.score} variant="compact" />}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Próximos episódios ────────────────────────────────────────────── */}
      {upcoming_episodes && upcoming_episodes.length > 0 && (
        <section className="mr-home-upcoming">
          <h3 className="mr-home-section-title">Próximos episódios</h3>
          <div className="mr-upcoming-list">
            {upcoming_episodes.map((ep, i) => (
              <div key={i} className="mr-upcoming-item">
                <PosterCard
                  title={ep.anime_title}
                  posterUrl={ep.poster_url}
                  posterKey={ep.poster_key}
                  className="mr-upcoming-poster"
                  onClick={() => onSelectAnime(ep.anime_id)}
                />
                <div className="mr-upcoming-info">
                  <p className="mr-upcoming-anime">{ep.anime_title}</p>
                  <p className="mr-upcoming-ep">Ep {ep.episode_number}</p>
                  {ep.aired && (
                    <p className="mr-upcoming-date">
                      {ep.airing_status === 'agendado' ? '📅 ' : ''}
                      {new Date(ep.aired).toLocaleDateString('pt-BR')}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Carrossel watchlist ────────────────────────────────────────────── */}
      {watchlist_preview && watchlist_preview.length > 0 && (
        <section className="mr-home-watchlist">
          <h3 className="mr-home-section-title">Na fila de espera</h3>
          <div className="mr-home-carousel">
            {watchlist_preview.map(anime => (
              <PosterCard
                key={anime.id}
                title={anime.title}
                posterUrl={anime.poster_url}
                posterKey={anime.poster_key}
                onClick={() => onSelectAnime(anime.id)}
                className="mr-carousel-poster"
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Sessões recentes (mini diário) ─────────────────────────────────── */}
      {recent_logs && recent_logs.length > 0 && (
        <section className="mr-home-recent">
          <h3 className="mr-home-section-title">Sessões recentes</h3>
          <div className="mr-recent-list">
            {recent_logs.map(log => (
              <div
                key={log.id}
                className="mr-recent-item"
                onClick={() => onSelectAnime(log.anime_id)}
                role="button"
                tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter') onSelectAnime(log.anime_id) }}
              >
                <PosterCard
                  title={log.anime_title ?? ''}
                  posterUrl={log.poster_url}
                  posterKey={log.poster_key}
                  className="mr-recent-poster"
                />
                <div className="mr-recent-info">
                  <p className="mr-recent-title">{log.anime_title}</p>
                  {log.ep_start && log.ep_end && (
                    <p className="mr-recent-eps">
                      Eps {log.ep_start}–{log.ep_end}
                    </p>
                  )}
                  {log.watched_date && (
                    <p className="mr-recent-date">
                      {new Date(log.watched_date).toLocaleDateString('pt-BR')}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
