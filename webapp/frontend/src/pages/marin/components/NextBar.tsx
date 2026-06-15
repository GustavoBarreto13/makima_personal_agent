// Barra inferior fixa "● PRÓXIMO EP" — exibe o próximo episódio a lançar
// do catálogo em progresso do usuário. Fiel ao design do protótipo (logmodal.jsx).
//
// Layout (da esquerda para a direita):
//   "● PRÓXIMO EP" (label) · mini pôster (42px) · título + "Ep N · sub · data"
//   · ‹ prev (se hasPrev) · › next (se hasNext) · "✓ Já vi" (botão primário)
//
// Posicionamento: fixed na base da área principal — left: 244px (sidebar 244px).
// Colapsa para left: 64px em ≤ 900px (sidebar em modo rail de ícones).

import type { ScheduleItem } from '../types'
import { Icon }  from './Icon'
import { PosterCard } from './PosterCard'

interface NextBarProps {
  // Item do schedule atualmente exibido
  episode: ScheduleItem
  // Título do anime (extraído do próprio ScheduleItem)
  animeTitle: string
  // UUID do anime no banco (para navegação e log)
  animeId: string
  // Chave da paleta tipográfica do pôster (fallback kawaii)
  animeKey?: string
  // URL do pôster real (null → fallback tipográfico)
  animeUrl?: string | null
  // Chamado ao clicar "✓ Já vi" — abre o LogWatchModal com ep pré-preenchido
  onLog: (animeId: string, epNumber: number) => void
  // Chamado ao clicar no pôster/título — navega para o detalhe do anime
  onNavigate: (animeId: string) => void
  // Controle de paginação entre múltiplos itens do schedule
  hasNext: boolean
  hasPrev: boolean
  onNext: () => void
  onPrev: () => void
}

/**
 * Barra fixa de "Próximo Episódio" — montada no MarinShell logo abaixo do `<main>`.
 * Como é position:fixed, não ocupa espaço no fluxo normal do layout.
 * O `.mr-scroll` já tem padding-bottom: 80px para compensar a altura de 70px.
 */
export function NextBar({
  episode,
  animeTitle,
  animeId,
  animeKey,
  animeUrl,
  onLog,
  onNavigate,
  hasNext,
  hasPrev,
  onNext,
  onPrev,
}: NextBarProps) {
  return (
    <div className="mr-next-bar" role="complementary" aria-label="Próximo episódio">

      {/* Label "● PRÓXIMO EP" — ponto pulsante + texto monoespaçado em caps */}
      <span className="mr-next-bar-ep">
        {/* Bolinha cyan pulsante — indica "ao vivo" / próximo */}
        <span
          aria-hidden="true"
          style={{
            display: 'inline-block',
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: 'var(--cyan)',
            animation: 'mr-pulse 2.2s infinite',
            flexShrink: 0,
          }}
        />
        PRÓXIMO EP
      </span>

      {/* Mini pôster clicável — navega para o detalhe do anime */}
      <div
        style={{ width: 42, flexShrink: 0, cursor: 'pointer' }}
        onClick={() => onNavigate(animeId)}
        role="button"
        aria-label={`Ver detalhe de ${animeTitle}`}
        tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onNavigate(animeId) }}
      >
        <PosterCard
          title={animeTitle}
          posterUrl={animeUrl}
          posterKey={animeKey}
        />
      </div>

      {/* Info: título + "Ep N · episóde title · data relativa" */}
      <div className="mr-next-bar-info">
        {/* Título do anime — clicável, navega para o detalhe */}
        <div
          className="mr-next-bar-title"
          onClick={() => onNavigate(animeId)}
          role="button"
          tabIndex={0}
          onKeyDown={e => { if (e.key === 'Enter') onNavigate(animeId) }}
          aria-label={`Ver detalhe de ${animeTitle}`}
        >
          {animeTitle}
        </div>
        {/* Subtítulo: "Ep N · título do ep · data relativa" */}
        <div className="mr-next-bar-date">
          Ep {episode.episode_number}
          {episode.episode_title ? ` · ${episode.episode_title}` : ''}
        </div>
      </div>

      {/* Botões ‹ e › para paginar entre itens do schedule */}
      <div className="mr-next-bar-actions">
        {/* Botão "Anterior" — só exibe se houver item anterior */}
        {hasPrev && (
          <button
            className="mr-next-bar-btn"
            onClick={onPrev}
            aria-label="Episódio anterior no schedule"
            title="Anterior"
          >
            <Icon name="chevron-left" />
          </button>
        )}

        {/* Botão "Próximo" — só exibe se houver item seguinte */}
        {hasNext && (
          <button
            className="mr-next-bar-btn"
            onClick={onNext}
            aria-label="Próximo episódio no schedule"
            title="Próximo"
          >
            <Icon name="chevron" />
          </button>
        )}

        {/* Botão primário "✓ Já vi" — abre o modal de log com ep pré-preenchido */}
        <button
          className="mr-next-bar-btn mr-next-bar-btn--primary"
          onClick={() => onLog(animeId, episode.episode_number)}
          aria-label={`Marcar episódio ${episode.episode_number} de ${animeTitle} como assistido`}
        >
          <Icon name="check" />
          Já vi
        </button>
      </div>
    </div>
  )
}
