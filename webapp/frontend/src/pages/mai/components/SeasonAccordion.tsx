// SeasonAccordion — componente exclusivo da Mai (Séries).
// Lista de temporadas em acordeão com lazy-load de episódios.
// Abertura exclusiva: abrir uma temporada fecha as outras.
// Animação: max-height + opacity definidos no mai.css.

import { useState, useEffect } from 'react'
import type { Season, Episode } from '../types'
import { maiApi } from '../maiApi'
import { IconChevR, IconCheck } from './MaiIcons'
import { EpisodeLine } from './EpisodeLine'

// Quantos episódios mostrar inicialmente por temporada
const EP_PAGE = 5
// Quantos episódios carregar a mais ao clicar "ver mais"
const EP_MORE = 8

interface Props {
  seriesId: string
  seasons: (Season & { watched_count: number })[]
  /**
   * Chamado quando o usuário marca/desmarca um episódio pelo checkbox.
   * A DetailScreen usa este callback para re-buscar os dados da série
   * e atualizar a barra de progresso + watched_count das temporadas.
   */
  onProgressChange?: () => void
  /**
   * Callback para abrir o modal de log de sessão rica (com nota/review).
   * Diferente do toggle de checkbox: este abre um modal completo.
   * Mantido para compatibilidade com o botão "Registrar sessão".
   */
  onEpisodeToggle?: () => void
}

/**
 * SeasonAccordion — acordeão exclusivo da Mai para listar temporadas com episódios.
 *
 * Lazy-load: episódios são buscados da API apenas ao abrir a temporada.
 * Cache local: episódios já carregados não são re-buscados ao fechar/abrir.
 * Exclusivo: abrir uma temporada fecha automaticamente as demais.
 *
 * Checkbox: marcar/desmarcar um episódio atualiza o cache local imediatamente
 * (resposta otimista) e depois chama a API. Em caso de erro, reverte o estado.
 */
export function SeasonAccordion({ seriesId, seasons, onProgressChange, onEpisodeToggle }: Props) {
  // Temporada aberta no momento (null = nenhuma)
  const [open, setOpen]       = useState<number | null>(null)
  // Cache de episódios por número de temporada
  const [epCache, setEpCache] = useState<Record<number, Episode[]>>({})
  // Estado de carregamento por temporada
  const [loading, setLoading] = useState<Record<number, boolean>>({})
  // Número de episódios exibidos por temporada (paginação)
  const [epLimit, setEpLimit] = useState<Record<number, number>>({})
  // Episódios que estão sendo processados (para desabilitar checkbox durante a chamada)
  const [busy, setBusy]       = useState<Set<string>>(new Set())

  // Quando uma temporada é aberta e não tem cache, busca os episódios
  useEffect(() => {
    if (open === null) return
    if (epCache[open]) return            // já em cache — não refaz
    if (loading[open]) return            // já carregando — evita chamada dupla

    setLoading(prev => ({ ...prev, [open]: true }))

    maiApi.episodes(seriesId, open)
      .then(res => {
        setEpCache(prev => ({ ...prev, [open]: res.episodes }))
        setEpLimit(prev => ({ ...prev, [open]: EP_PAGE }))
      })
      .catch(() => {
        // Falha silenciosa — accordeão mostra lista vazia
        setEpCache(prev => ({ ...prev, [open]: [] }))
      })
      .finally(() => {
        setLoading(prev => ({ ...prev, [open]: false }))
      })
  }, [open, seriesId, epCache, loading])

  /** Abre ou fecha uma temporada (abertura exclusiva: fecha as demais). */
  function toggle(seasonNumber: number) {
    setOpen(prev => prev === seasonNumber ? null : seasonNumber)
  }

  /** Carrega mais episódios na paginação da temporada. */
  function showMore(seasonNumber: number, total: number) {
    setEpLimit(prev => ({
      ...prev,
      [seasonNumber]: Math.min((prev[seasonNumber] ?? EP_PAGE) + EP_MORE, total),
    }))
  }

  /**
   * Toggle de checkbox de um episódio: marca/desmarca como assistido.
   *
   * Estratégia "optimistic update":
   *   1. Atualiza o cache local imediatamente (o usuário vê a mudança na hora)
   *   2. Chama a API em segundo plano
   *   3. Em caso de erro, reverte para o estado anterior
   *   4. Após sucesso, dispara onProgressChange para a DetailScreen recarregar
   *      os watched_count das temporadas e a barra de progresso
   */
  async function handleToggleWatched(episode: Episode, nextWatched: boolean) {
    const { season_number: sn, episode_number: en } = episode

    // Chave única para controlar o estado "busy" deste episódio específico
    const key = `${sn}-${en}`

    // Evita cliques duplos enquanto a chamada anterior ainda está em andamento
    if (busy.has(key)) return

    // Salva o estado atual para reverter em caso de erro
    const prevCache = epCache[sn] ?? []

    // ── Atualização otimista do cache local ──────────────────────────────────
    // Atualiza o episódio no cache imediatamente, sem esperar a API
    setEpCache(prev => ({
      ...prev,
      [sn]: (prev[sn] ?? []).map(ep =>
        ep.episode_number === en
          ? { ...ep, watched: nextWatched, watched_date: nextWatched ? new Date().toISOString().slice(0, 10) : undefined }
          : ep
      ),
    }))

    // Marca este episódio como "busy" para desabilitar o checkbox durante a chamada
    setBusy(prev => new Set(prev).add(key))

    try {
      // Chama o endpoint de toggle de episódio individual
      await maiApi.setEpisodeWatched(seriesId, sn, en, nextWatched)

      // Sucesso: dispara callback para a DetailScreen recarregar o progresso geral
      // (barra de progresso, watched_count das temporadas, next_episode)
      onProgressChange?.()
    } catch {
      // Erro: reverte o cache para o estado anterior (desfaz o optimistic update)
      setEpCache(prev => ({ ...prev, [sn]: prevCache }))
    } finally {
      // Remove o estado "busy" independente do resultado
      setBusy(prev => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    }
  }

  return (
    <div className="season-acc">
      {seasons.map(season => {
        const isOpen  = open === season.season_number
        const eps     = epCache[season.season_number] ?? []
        const limit   = epLimit[season.season_number] ?? EP_PAGE
        const isLoad  = loading[season.season_number] ?? false

        // Progresso da temporada (vem do servidor via watched_count)
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

                {!isLoad && eps.slice(0, limit).map(ep => {
                  // Chave de busy para este episódio
                  const key = `${ep.season_number}-${ep.episode_number}`
                  return (
                    <EpisodeLine
                      key={ep.id}
                      episode={ep}
                      onToggleWatched={handleToggleWatched}
                      busy={busy.has(key)}
                    />
                  )
                })}

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
