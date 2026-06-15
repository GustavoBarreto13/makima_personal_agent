// EpisodeLine — linha de episódio dentro do SeasonAccordion.
// Grid: indicador 18px | still 96×54px | meta 1fr | estado auto.
//
// Comportamentos:
//   - Clicar no corpo da linha (epi-meta) → expande/colapsa sinopse do episódio
//   - Clicar no checkbox (epi-check) → marca/desmarca episódio como assistido (SEM abrir modal)
//   - Episódios 'agendado' (ainda não lançados) → mostra 📅 data por extenso no lugar do checkbox

import { useState } from 'react'
import type { Episode } from '../types'
import { IconCheck } from './MaiIcons'

interface Props {
  episode: Episode
  /**
   * Callback de toggle do checkbox de progresso.
   * Recebe o episódio e o novo estado (watched = true/false).
   * Não deve abrir o modal de log — apenas atualizar o progresso.
   */
  onToggleWatched?: (episode: Episode, nextWatched: boolean) => void
  /**
   * Indica que o toggle está sendo processado (aguardando resposta da API).
   * Quando true, o checkbox fica desabilitado para evitar cliques duplos.
   */
  busy?: boolean
}

/**
 * EpisodeLine — linha de um episódio com still, número, título, sinopse e estado.
 *
 * Corpo da linha: clique expande/colapsa a sinopse do episódio.
 * Checkbox (círculo direito): toggle de watched, sem abrir modal.
 * Episódios agendados: mostra 📅 data de lançamento no lugar do checkbox.
 */
export function EpisodeLine({ episode, onToggleWatched, busy = false }: Props) {
  // Controla se a sinopse está expandida abaixo da linha
  const [expanded, setExpanded] = useState(false)

  const isWatched  = episode.watched
  // Episódio lançado e ainda não assistido — próximo a assistir (dot âmbar)
  const isNext     = !isWatched && episode.airing_status === 'lancado'
  // Episódio ainda não disponível (air_date no futuro ou sem data)
  const isScheduled = episode.airing_status === 'agendado'

  // Formata a data de exibição curta: "12 jun"
  const airDateShort = episode.air_date
    ? new Date(episode.air_date + 'T00:00:00').toLocaleDateString('pt-BR', {
        day: 'numeric',
        month: 'short',
      })
    : null

  // Formata a data completa para o bloco de detalhe expandido: "12 de junho de 2025"
  const airDateFull = episode.air_date
    ? new Date(episode.air_date + 'T00:00:00').toLocaleDateString('pt-BR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null

  /**
   * Clique no corpo da linha: expande/colapsa sinopse.
   * Não chama o callback de toggle — apenas alterna o estado local de expansão.
   */
  function handleBodyClick() {
    setExpanded(prev => !prev)
  }

  /**
   * Clique no checkbox: marca/desmarca episódio como assistido.
   * Usa e.stopPropagation() para NÃO expandir a sinopse ao mesmo tempo.
   */
  function handleCheckClick(e: React.MouseEvent) {
    e.stopPropagation()
    if (busy || isScheduled) return   // episódio agendado não pode ser marcado ainda
    onToggleWatched?.(episode, !isWatched)
  }

  return (
    // O wrapper engloba tanto a linha principal quanto o bloco de sinopse
    <div className={`epi-wrap${expanded ? ' expanded' : ''}`}>
      <div
        className={`epi-line${isWatched ? ' watched' : ''}${isNext ? ' next' : ''}`}
        onClick={handleBodyClick}
        title={expanded ? 'Ocultar sinopse' : 'Expandir sinopse'}
      >
        {/* Indicador de estado (ponto colorido) */}
        <div className="epi-dot" />

        {/* Still do episódio (96×54) ou placeholder numérico */}
        <div className="epi-still">
          {episode.still_url ? (
            <img
              src={episode.still_url}
              alt={episode.title ?? `Episódio ${episode.episode_number}`}
              loading="lazy"
              style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }}
            />
          ) : (
            <>
              <span className="es-ico">📺</span>
              <span className="es-num">{episode.episode_number}</span>
            </>
          )}
        </div>

        {/* Meta: título + sub (número + data) */}
        <div className="epi-meta">
          <div className="em-title">
            {episode.title || `Episódio ${episode.episode_number}`}
          </div>
          <div className="em-sub">
            E{String(episode.episode_number).padStart(2, '0')}
            {airDateShort && ` · ${airDateShort}`}
          </div>
        </div>

        {/* Estado no canto direito: checkbox interativo, "PRÓXIMO" ou data de lançamento */}
        {isScheduled ? (
          // Episódio ainda não lançado: mostra data de lançamento com ícone de calendário
          <div className="epi-state epi-upcoming" title="Data de lançamento">
            📅 {airDateShort ?? 'BREVE'}
          </div>
        ) : (
          // Episódio já lançado: checkbox clicável de progresso
          <button
            className={`epi-check${busy ? ' busy' : ''}`}
            onClick={handleCheckClick}
            title={isWatched ? 'Desmarcar episódio' : 'Marcar como assistido'}
            disabled={busy}
            // Evita que o clique no botão propague para o handleBodyClick
            type="button"
          >
            {isWatched && <IconCheck />}
          </button>
        )}
      </div>

      {/* Bloco de sinopse — visível apenas quando expanded=true */}
      {expanded && (
        <div className="epi-detail">
          {/* Sinopse do episódio */}
          <p className="epi-overview">
            {episode.overview ?? 'Sinopse não disponível.'}
          </p>
          {/* Data completa de exibição */}
          {airDateFull && (
            <span className="epi-date-full">📅 {airDateFull}</span>
          )}
        </div>
      )}
    </div>
  )
}
