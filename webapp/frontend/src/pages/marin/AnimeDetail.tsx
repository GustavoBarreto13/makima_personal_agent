// Tela de detalhe completo de um anime.
// Layout: banner de fundo + pôster + metadados em 2 colunas + episódios paginados + diário.
// Aceita animeId como prop e busca os dados do endpoint GET /api/animes/{id}.

import { useState, useEffect } from 'react'
import { marinApi } from './marinApi'
import type { AnimeDetail as AnimeDetailData, Episode } from './types'
import { PosterCard }       from './components/PosterCard'
import { StatusChip }       from './components/StatusChip'
import { Score }            from './components/Score'
import { EpisodeProgress }  from './components/EpisodeProgress'
import { EpisodeLine }      from './components/EpisodeLine'

interface AnimeDetailProps {
  // ID do anime no banco (UUID)
  animeId: string
  // Callbacks de ação
  onBack: () => void
  onLog: (animeId: string, epNumber?: number) => void
  onToast: (msg: string) => void
}

/**
 * Tela de detalhe de anime.
 * Carrega dados do backend e exibe pôster, metadados, episódios e diário.
 */
export function AnimeDetail({ animeId, onBack, onLog, onToast }: AnimeDetailProps) {
  const [data, setData] = useState<AnimeDetailData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Paginação de episódios — 12 por página
  const [epPage, setEpPage] = useState(1)
  const [epData, setEpData] = useState<{ episodes: Episode[]; total: number; page: number } | null>(null)
  const [epLoading, setEpLoading] = useState(false)

  // Status local — permite atualizar sem refetch completo
  const [localStatus, setLocalStatus] = useState<string | null>(null)
  const [localScore, setLocalScore] = useState<number | null | undefined>(undefined)

  useEffect(() => {
    setLoading(true)
    setError(null)
    marinApi.detail(animeId)
      .then(d => {
        setData(d)
        setLocalStatus(d.anime?.status ?? null)
        setLocalScore(d.anime?.score ?? null)
        // Inicializa a lista de episódios com os 12 primeiros que já vieram no detalhe
        setEpData({
          episodes: d.episodes ?? [],
          total: d.episodes_total_cached ?? 0,
          page: 1,
        })
      })
      .catch(() => setError('Não foi possível carregar o anime.'))
      .finally(() => setLoading(false))
  }, [animeId])

  // Carrega página de episódios adicional (scroll de episódios)
  function loadEpPage(page: number) {
    setEpLoading(true)
    marinApi.episodes(animeId, page)
      .then(res => {
        setEpData(res)
        setEpPage(page)
      })
      .catch(() => onToast('Erro ao carregar episódios.'))
      .finally(() => setEpLoading(false))
  }

  // Muda o status do anime
  function handleStatusChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newStatus = e.target.value
    marinApi.updateStatus(animeId, { status: newStatus })
      .then(() => {
        setLocalStatus(newStatus)
        onToast(`Status atualizado para "${newStatus}".`)
      })
      .catch(() => onToast('Erro ao atualizar status.'))
  }

  if (loading) {
    return (
      <div className="mr-detail-loading">
        <div className="mr-spinner" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="mr-detail-error">
        <p>{error ?? 'Anime não encontrado.'}</p>
        <button className="mr-btn" onClick={onBack}>← Voltar</button>
      </div>
    )
  }

  const { anime, next_episode, recent_logs } = data
  const status = (localStatus ?? anime.status) as typeof anime.status
  const score = localScore !== undefined ? localScore : anime.score
  const totalEps = epData?.total ?? anime.episodes_total ?? 0
  const hasMoreEps = epData ? (epPage * 12) < epData.total : false

  return (
    <div className="mr-detail">
      {/* ── Banner ─────────────────────────────────────────────────────────── */}
      <div
        className="mr-detail-banner"
        style={{
          backgroundImage: anime.banner_url
            ? `url(${anime.banner_url})`
            : undefined,
          backgroundColor: !anime.banner_url ? 'var(--card)' : undefined,
        }}
      >
        {/* Botão de voltar sobre o banner */}
        <button className="mr-detail-back" onClick={onBack}>
          ← Voltar
        </button>
      </div>

      {/* ── Hero: pôster + info rápida ─────────────────────────────────────── */}
      <div className="mr-detail-hero">
        {/* Pôster */}
        <div className="mr-detail-poster">
          <PosterCard
            title={anime.title}
            posterUrl={anime.poster_url}
            posterKey={anime.poster_key}
          >
            {/* Chip de status sobreposto ao pôster */}
            <StatusChip status={status} variant="onPoster" />
          </PosterCard>
        </div>

        {/* Metadados rápidos */}
        <div className="mr-detail-meta">
          <h1 className="mr-detail-title">{anime.title}</h1>
          {anime.title_japanese && (
            <p className="mr-detail-jp-title">{anime.title_japanese}</p>
          )}

          {/* Linha de info: tipo · temporada · estúdio */}
          <div className="mr-detail-tags">
            {anime.media_type && (
              <span className="mr-tag">{anime.media_type.toUpperCase()}</span>
            )}
            {anime.season && (
              <span className="mr-tag">{anime.season}</span>
            )}
            {anime.studio && (
              <span className="mr-tag">{anime.studio}</span>
            )}
          </div>

          {/* Progresso de episódios */}
          <EpisodeProgress
            watched={anime.episodes_watched ?? 0}
            total={anime.episodes_total}
            className="mr-detail-progress"
          />

          {/* Nota */}
          <Score score={score} variant="full" />

          {/* Seletor de status */}
          <select
            className="mr-select"
            value={status}
            onChange={handleStatusChange}
            aria-label="Status do anime"
          >
            <option value="assistindo">Assistindo</option>
            <option value="quero_assistir">Quero assistir</option>
            <option value="completo">Completo</option>
            <option value="pausado">Pausado</option>
            <option value="abandonado">Abandonado</option>
          </select>

          {/* Botão de logar episódio */}
          <button
            className="mr-btn mr-btn--primary"
            onClick={() => onLog(animeId, next_episode?.number)}
            style={{ marginTop: 12 }}
          >
            {next_episode
              ? `▶ Logar ep ${next_episode.number}`
              : '▶ Logar sessão'
            }
          </button>
        </div>
      </div>

      {/* ── Próximo episódio (destaque) ────────────────────────────────────── */}
      {next_episode && (
        <div className="mr-detail-next">
          <span className="mr-detail-next-label">Próximo:</span>
          <span className="mr-detail-next-ep">
            Ep {next_episode.number}
            {next_episode.title ? ` — ${next_episode.title}` : ''}
          </span>
          {next_episode.aired && (
            <span className="mr-detail-next-date">
              {new Date(next_episode.aired).toLocaleDateString('pt-BR')}
            </span>
          )}
        </div>
      )}

      {/* ── Dois painéis: sinopse + gêneros / episódios ─────────────────── */}
      <div className="mr-detail-body">

        {/* Painel esquerdo: sinopse + gêneros + notas */}
        <div className="mr-detail-col-left">
          {anime.overview && (
            <section className="mr-detail-section">
              <h2 className="mr-detail-section-title">Sinopse</h2>
              <p className="mr-detail-overview">{anime.overview}</p>
            </section>
          )}

          {anime.genres && anime.genres.length > 0 && (
            <section className="mr-detail-section">
              <h2 className="mr-detail-section-title">Gêneros</h2>
              <div className="mr-detail-genres">
                {anime.genres.map(g => (
                  <span key={g} className="mr-tag">{g}</span>
                ))}
              </div>
            </section>
          )}

          {/* Datas */}
          <section className="mr-detail-section">
            <h2 className="mr-detail-section-title">Datas</h2>
            <div className="mr-detail-dates">
              {anime.date_started && (
                <span>Iniciado: {new Date(anime.date_started).toLocaleDateString('pt-BR')}</span>
              )}
              {anime.date_finished && (
                <span>Concluído: {new Date(anime.date_finished).toLocaleDateString('pt-BR')}</span>
              )}
            </div>
          </section>
        </div>

        {/* Painel direito: episódios */}
        <div className="mr-detail-col-right">
          <section className="mr-detail-section">
            <h2 className="mr-detail-section-title">
              Episódios
              {totalEps > 0 && <span style={{ fontWeight: 400, color: 'var(--ink-3)' }}> ({totalEps})</span>}
            </h2>

            <div className="mr-ep-list" role="list">
              {(epData?.episodes ?? []).map(ep => (
                <EpisodeLine
                  key={ep.id}
                  episode={ep}
                  onLog={(e) => onLog(animeId, e.number)}
                />
              ))}
            </div>

            {/* Paginação de episódios */}
            {hasMoreEps && (
              <button
                className="mr-btn"
                onClick={() => loadEpPage(epPage + 1)}
                disabled={epLoading}
                style={{ marginTop: 8, width: '100%' }}
              >
                {epLoading ? 'Carregando...' : `Carregar mais (${totalEps - epPage * 12} restantes)`}
              </button>
            )}

            {/* Páginas anteriores */}
            {epPage > 1 && (
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className="mr-btn" onClick={() => loadEpPage(epPage - 1)}>
                  ← Anterior
                </button>
                <span style={{ fontSize: 11, color: 'var(--ink-3)', lineHeight: '28px' }}>
                  Página {epPage}
                </span>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* ── Diário de sessões deste anime ──────────────────────────────────── */}
      {recent_logs && recent_logs.length > 0 && (
        <section className="mr-detail-section mr-detail-diary">
          <h2 className="mr-detail-section-title">Sessões recentes</h2>
          <div className="mr-detail-logs">
            {recent_logs.map(log => (
              <div key={log.id} className="mr-detail-log">
                <span className="mr-detail-log-date">
                  {log.watched_date ? new Date(log.watched_date).toLocaleDateString('pt-BR') : '—'}
                </span>
                {log.ep_start && log.ep_end && (
                  <span className="mr-detail-log-eps">
                    Eps {log.ep_start}–{log.ep_end}
                  </span>
                )}
                {log.rating && (
                  <span className="mr-detail-log-rating" style={{ color: 'var(--star)' }}>
                    ★ {log.rating}
                  </span>
                )}
                {log.notes && (
                  <span className="mr-detail-log-notes">{log.notes}</span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
