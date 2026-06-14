// SeasonAccordion — componente exclusivo da Mai (Séries).
// Lista de temporadas em acordeão com lazy-load de episódios.
// Abertura exclusiva: abrir uma temporada fecha as outras.
// Animação: max-height + opacity definidos no mai.css.

import { useState, useEffect } from 'react'
import type { Season, Episode } from '../types'
import { maiApi } from '../maiApi'
import { IconChevR, IconCheck } from './MaiIcons'
import { EpisodeLine } from './EpisodeLine'

const EP_PAGE = 5   // episódios por página inicial
const EP_MORE = 8   // mais episódios ao clicar "ver mais"

interface Props {
  seriesId: string
  seasons: (Season & { watched_count: number })[]
  /** Callback quando o usuário marcar/desmarcar um episódio. */
  onEpisodeToggle?: () => void
}

/**
 * SeasonAccordion — acordeão exclusivo da Mai para listar temporadas com episódios.
 *
 * Lazy-load: episódios são buscados da API apenas ao abrir a temporada.
 * Cache local: episódios já carregados não são re-buscados ao fechar/abrir.
 * Exclusivo: abrir uma temporada fecha automaticamente as demais.
 */
export function SeasonAccordion({ seriesId, seasons, onEpisodeToggle }: Props) {
  // Temporada aberta no momento (null = nenhuma)
  const [open, setOpen]       = useState<number | null>(null)
  // Cache de episódios por número de temporada
  const [epCache, setEpCache] = useState<Record<number, Episode[]>>({})
  // Estado de carregamento por temporada
  const [loading, setLoading] = useState<Record<number, boolean>>({})
  // Número de episódios exibidos por temporada (paginação)
  const [epLimit, setEpLimit] = useState<Record<number, number>>({})

  // Quando uma temporada é aberta e não tem cache, busca os episódios
  useEffect(() => {
    if (open === null) return
    if (epCache[open]) return            // já em cache
    if (loading[open]) return            // já carregando

    setLoading(prev => ({ ...prev, [open]: true }))

    maiApi.episodes(seriesId, open)
      .then(res => {
        setEpCache(prev => ({ ...prev, [open]: res.episodes }))
        setEpLimit(prev => ({ ...prev, [open]: EP_PAGE }))
      })
      .catch(() => {
        // Falha silenciosa — accordion mostra lista vazia
        setEpCache(prev => ({ ...prev, [open]: [] }))
      })
      .finally(() => {
        setLoading(prev => ({ ...prev, [open]: false }))
      })
  }, [open, seriesId, epCache, loading])

  function toggle(seasonNumber: number) {
    // Abre/fecha com exclusividade (fecha outras)
    setOpen(prev => prev === seasonNumber ? null : seasonNumber)
  }

  function showMore(seasonNumber: number, total: number) {
    setEpLimit(prev => ({
      ...prev,
      [seasonNumber]: Math.min((prev[seasonNumber] ?? EP_PAGE) + EP_MORE, total),
    }))
  }

  return (
    <div className="season-acc">
      {seasons.map(season => {
        const isOpen  = open === season.season_number
        const eps     = epCache[season.season_number] ?? []
        const limit   = epLimit[season.season_number] ?? EP_PAGE
        const isLoad  = loading[season.season_number] ?? false

        // Progresso da temporada
        const total   = season.episode_count ?? 0
        const watched = season.watched_count ?? 0
        const pct     = total > 0 ? (watched / total) : 0
        const done    = total > 0 && watched >= total

        return (
          <div
            key={season.season_number}
            className={`season-row${isOpen ? ' open' : ''}`}
          >
            {/* Cabeçalho clicável do acordeão */}
            <div className="season-head" onClick={() => toggle(season.season_number)}>
              {/* Chevron: rotaciona 90° via CSS quando .open */}
              <span className="season-chev">
                <IconChevR />
              </span>

              <div className="season-headmain">
                <div className="season-name">
                  {season.name || `Temporada ${season.season_number}`}
                  {done && (
                    <span className="sn-tag">✓ Completa</span>
                  )}
                </div>
                <div className="season-sub">
                  {total > 0 && <span>{total} eps</span>}
                  {season.air_date && (
                    <span>{new Date(season.air_date + 'T00:00:00').getFullYear()}</span>
                  )}
                </div>
              </div>

              {/* Mini barra de progresso + contagem à direita */}
              <div className="season-prog-compact">
                <div className={`spc-bar${done ? ' done' : ''}`}>
                  <i style={{ width: `${pct * 100}%` }} />
                </div>
                {done ? (
                  <span className="spc-n done">
                    <IconCheck />
                    {watched}/{total}
                  </span>
                ) : (
                  <span className="spc-n">
                    {watched}/{total}
                  </span>
                )}
              </div>
            </div>

            {/* Corpo do acordeão (max-height animada no CSS) */}
            <div className="season-body">
              <div className="season-body-inner">
                {isLoad && (
                  <div style={{ padding: '16px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>
                    Carregando episódios…
                  </div>
                )}

                {!isLoad && eps.length === 0 && isOpen && (
                  <div style={{ padding: '16px', color: 'var(--ink-4)', fontSize: 13, fontStyle: 'italic' }}>
                    Episódios não disponíveis.
                  </div>
                )}

                {!isLoad && eps.slice(0, limit).map(ep => (
                  <EpisodeLine
                    key={ep.id}
                    episode={ep}
                    onToggle={onEpisodeToggle}
                  />
                ))}

                {/* Botão "ver mais" quando há mais episódios do que o limite */}
                {!isLoad && eps.length > limit && (
                  <div className="epi-more">
                    <button onClick={() => showMore(season.season_number, eps.length)}>
                      +{eps.length - limit} episódios
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
