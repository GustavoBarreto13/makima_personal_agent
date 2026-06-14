// Tela de watchlist — animes com status "quero_assistir", em lista vertical.
// Ação principal: botão "▶ Começar" → muda status para "assistindo" + abre modal de log ep1.

import { useState, useEffect } from 'react'
import { marinApi } from '../marinApi'
import type { Anime } from '../types'
import { PosterCard }       from '../components/PosterCard'
import { EpisodeProgress }  from '../components/EpisodeProgress'

interface WatchlistScreenProps {
  onSelectAnime: (id: string) => void
  onStartAnime: (animeId: string) => void  // muda status e abre LogModal no ep1
  onToast: (msg: string) => void
}

/**
 * WatchlistScreen — lista de animes na fila de espera.
 * "▶ Começar" muda status → assistindo e abre modal de log para o ep 1.
 */
export function WatchlistScreen({ onSelectAnime, onStartAnime, onToast }: WatchlistScreenProps) {
  const [animes, setAnimes] = useState<Anime[]>([])
  const [loading, setLoading] = useState(true)
  // Controla quais animes estão sendo "iniciados" (para desabilitar botão durante request)
  const [starting, setStarting] = useState<Set<string>>(new Set())

  useEffect(() => {
    marinApi.watchlist()
      .then(res => setAnimes(res.animes ?? []))
      .catch(() => onToast('Erro ao carregar watchlist.'))
      .finally(() => setLoading(false))
  }, [])

  async function handleStart(animeId: string, title: string) {
    setStarting(prev => new Set(prev).add(animeId))
    try {
      // Muda status para "assistindo"
      await marinApi.updateStatus(animeId, { status: 'assistindo' })
      // Remove da lista local (já não é mais "quero_assistir")
      setAnimes(prev => prev.filter(a => a.id !== animeId))
      onToast(`${title} adicionado em andamento!`)
      // Abre modal para logar o primeiro episódio
      onStartAnime(animeId)
    } catch {
      onToast('Erro ao iniciar anime.')
    } finally {
      setStarting(prev => {
        const next = new Set(prev)
        next.delete(animeId)
        return next
      })
    }
  }

  if (loading) {
    return <div className="mr-watchlist-loading"><div className="mr-spinner" /></div>
  }

  if (animes.length === 0) {
    return (
      <div className="mr-watchlist-empty">
        <p>A watchlist está vazia.</p>
        <p style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 8 }}>
          Adicione animes pelo botão "+" no topo da tela.
        </p>
      </div>
    )
  }

  return (
    <div className="mr-watchlist">
      <p className="mr-watchlist-count">
        {animes.length} {animes.length === 1 ? 'anime' : 'animes'} na fila
      </p>

      <div className="mr-watchlist-list">
        {animes.map(anime => (
          <div key={anime.id} className="mr-watchlist-item">
            {/* Pôster clicável */}
            <PosterCard
              title={anime.title}
              posterUrl={anime.poster_url}
              posterKey={anime.poster_key}
              onClick={() => onSelectAnime(anime.id)}
              className="mr-watchlist-poster"
            />

            {/* Informações do anime */}
            <div
              className="mr-watchlist-info"
              onClick={() => onSelectAnime(anime.id)}
              style={{ cursor: 'pointer', flex: 1 }}
            >
              <p className="mr-watchlist-title">{anime.title}</p>
              {anime.studio && (
                <p className="mr-watchlist-studio">{anime.studio}</p>
              )}
              {/* Progresso (provavelmente 0 eps, mas mostra o total) */}
              <EpisodeProgress
                watched={anime.episodes_watched ?? 0}
                total={anime.episodes_total}
                showBar={false}
              />
              {anime.season && (
                <p className="mr-watchlist-season">{anime.season}</p>
              )}
            </div>

            {/* Ação: botão de começar */}
            <button
              className="mr-btn mr-btn--primary"
              onClick={() => handleStart(anime.id, anime.title)}
              disabled={starting.has(anime.id)}
              aria-label={`Começar ${anime.title}`}
            >
              {starting.has(anime.id) ? '...' : '▶ Começar'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
