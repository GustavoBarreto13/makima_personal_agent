// SeasonAccordion — componente exclusivo da Mai (Séries).
// Lista de temporadas em acordeão com lazy-load de episódios.
// Abertura exclusiva: abrir uma temporada fecha as outras.
// Animação: max-height + opacity definidos no mai.css.
//
// Comportamentos ativos:
//   - Marcar ep N → marca todos os eps ≤ N da mesma temporada (lançados)
//   - Desmarcar ep N → desmarca todos os eps ≥ N da mesma temporada
//   - Botão "Marcar temporada" / "Desmarcar": toggle da temporada inteira
//   - Todos os episódios são renderizados de uma vez; o painel interno
//     tem altura máxima com overflow-y: auto (rola em temporadas longas).

import { useState, useEffect } from 'react'
import type { Season, Episode } from '../types'
import { maiApi } from '../maiApi'
import { IconChevR, IconCheck } from './MaiIcons'
import { EpisodeLine } from './EpisodeLine'

interface Props {
  seriesId: string
  seasons: (Season & { watched_count: number })[]
  /**
   * Chamado quando o usuário marca/desmarca um episódio ou uma temporada.
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
 * Marcação cumulativa:
 *   - Checkbox ep N (marcar): eps 1…N ficam ✓ (só lançados)
 *   - Checkbox ep N (desmarcar): eps N…último perdem ✓
 *   - Botão temporada: toggle — marca/desmarca a temporada inteira
 */
// onEpisodeToggle é recebido mas não usado internamente (fica disponível para uso futuro via prop)
export function SeasonAccordion({ seriesId, seasons, onProgressChange }: Props) {
  // Temporada aberta no momento (null = nenhuma)
  const [open, setOpen]       = useState<number | null>(null)
  // Cache de episódios por número de temporada
  const [epCache, setEpCache] = useState<Record<number, Episode[]>>({})
  // Estado de carregamento por temporada
  const [loading, setLoading] = useState<Record<number, boolean>>({})
  // Episódios/temporadas que estão sendo processados (para desabilitar durante a chamada)
  // Chaves: "sn-en" para episódio individual, "season-sn" para a temporada inteira
  const [busy, setBusy]       = useState<Set<string>>(new Set())

  // Quando uma temporada é aberta e não tem cache, busca os episódios
  useEffect(() => {
    if (open === null) return
    if (epCache[open]) return            // já em cache — não refaz
    if (loading[open]) return            // já carregando — evita chamada dupla

    setLoading(prev => ({ ...prev, [open]: true }))

    maiApi.episodes(seriesId, open)
      .then(res => {
        // Armazena todos os episódios no cache — renderizados de uma vez com rolagem interna
        setEpCache(prev => ({ ...prev, [open]: res.episodes }))
      })
      .catch(() => {
        // Falha silenciosa — acordeão mostra lista vazia
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

  /**
   * Toggle de checkbox de um episódio: marca/desmarca com lógica cumulativa.
   *
   * Estratégia "optimistic update":
   *   1. Atualiza o cache local imediatamente (cumulativo: ≤ N ao marcar, ≥ N ao desmarcar)
   *   2. Chama a API em segundo plano
   *   3. Em caso de erro, reverte para o estado anterior
   *   4. Após sucesso, dispara onProgressChange para a DetailScreen recarregar
   *
   * Regras de negócio espelhadas do backend:
   *   - Marcar ep N: todos os eps da mesma temporada com number ≤ N E airing_status != 'agendado'
   *   - Desmarcar ep N: todos os eps da mesma temporada com number ≥ N (inclusive futuros)
   */
  async function handleToggleWatched(episode: Episode, nextWatched: boolean) {
    const { season_number: sn, episode_number: en } = episode

    // Chave única para controlar o estado "busy" deste episódio específico
    const key = `${sn}-${en}`

    // Evita cliques duplos enquanto a chamada anterior ainda está em andamento
    if (busy.has(key)) return

    // Salva o estado atual para reverter em caso de erro
    const prevCache = epCache[sn] ?? []

    // ── Atualização otimista do cache local (cumulativa) ─────────────────────
    setEpCache(prev => ({
      ...prev,
      [sn]: (prev[sn] ?? []).map(ep => {
        if (nextWatched) {
          // Marcar: afeta eps ≤ N que já foram lançados
          if (ep.episode_number <= en && ep.airing_status !== 'agendado') {
            return {
              ...ep,
              watched: true,
              // Preserva watched_date original; define hoje se ainda estava vazio
              watched_date: ep.watched_date ?? new Date().toISOString().slice(0, 10),
            }
          }
        } else {
          // Desmarcar: afeta eps ≥ N (inclusive futuros que possam estar marcados)
          if (ep.episode_number >= en) {
            return { ...ep, watched: false, watched_date: null }
          }
        }
        return ep
      }),
    }))

    // Marca este episódio como "busy" para desabilitar o checkbox durante a chamada
    setBusy(prev => new Set(prev).add(key))

    try {
      // Chama o endpoint cumulativo no backend
      await maiApi.setEpisodeWatched(seriesId, sn, en, nextWatched)

      // Sucesso: dispara callback para a DetailScreen recarregar o progresso geral
      onProgressChange?.()
    } catch {
      // Erro: reverte o cache para o estado anterior
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

  /**
   * Toggle da temporada inteira: marca ou desmarca todos os episódios.
   *
   * Se a temporada está completa (done=true) → desmarca tudo.
   * Se não está completa → marca tudo (apenas episódios lançados).
   *
   * Usa chave "season-sn" no Set de busy para desabilitar o botão durante a chamada.
   */
  async function handleToggleSeason(seasonNumber: number, nextWatched: boolean) {
    // Chave de busy para a temporada inteira (diferente das chaves de episódios individuais)
    const key = `season-${seasonNumber}`
    if (busy.has(key)) return

    // Salva snapshot do cache para rollback em caso de erro
    const prevCache = epCache[seasonNumber] ?? []

    // ── Atualização otimista do cache: espelha a lógica do backend ──────────
    if (epCache[seasonNumber]) {
      setEpCache(prev => ({
        ...prev,
        [seasonNumber]: (prev[seasonNumber] ?? []).map(ep => {
          if (nextWatched) {
            // Marcar: só eps lançados (equivalente ao IS DISTINCT FROM 'agendado' do SQL)
            if (ep.airing_status !== 'agendado') {
              return {
                ...ep,
                watched: true,
                watched_date: ep.watched_date ?? new Date().toISOString().slice(0, 10),
              }
            }
          } else {
            // Desmarcar: todos os eps da temporada, inclusive agendados
            return { ...ep, watched: false, watched_date: null }
          }
          return ep
        }),
      }))
    }

    setBusy(prev => new Set(prev).add(key))

    try {
      await maiApi.setSeasonWatched(seriesId, seasonNumber, nextWatched)
      // Recarrega dados da série para atualizar watched_count e barra de progresso
      onProgressChange?.()
    } catch {
      // Reverte o cache em caso de erro de rede ou do backend
      setEpCache(prev => ({ ...prev, [seasonNumber]: prevCache }))
    } finally {
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
        const isLoad  = loading[season.season_number] ?? false

        // Progresso da temporada (vem do servidor via watched_count)
        const total   = season.episode_count ?? 0
        const watched = season.watched_count ?? 0
        const pct     = total > 0 ? (watched / total) : 0
        const done    = total > 0 && watched >= total

        // Chave de busy para o botão de marcar a temporada inteira
        const seasonBusyKey = `season-${season.season_number}`
        const seasonBusy    = busy.has(seasonBusyKey)

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

              {/*
                Botão de toggle de temporada inteira.
                e.stopPropagation() impede que o clique no botão abra/feche o acordeão.
                Rótulo dinâmico: "Desmarcar" se completa, "Marcar temporada" se não.
              */}
              {total > 0 && (
                <button
                  className={`season-markall${seasonBusy ? ' busy' : ''}`}
                  disabled={seasonBusy}
                  onClick={e => {
                    e.stopPropagation()
                    handleToggleSeason(season.season_number, !done)
                  }}
                  title={done ? 'Desmarcar temporada inteira' : 'Marcar todos os episódios como assistidos'}
                  type="button"
                >
                  {done ? 'Desmarcar' : 'Marcar temporada'}
                </button>
              )}

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

                {/* Todos os episódios são renderizados de uma vez.
                    O scroll interno do .season-body-inner (mai.css) cuida da rolagem
                    quando a temporada tem muitos episódios. */}
                {!isLoad && eps.map(ep => {
                  // Chave de busy para este episódio individual
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
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
