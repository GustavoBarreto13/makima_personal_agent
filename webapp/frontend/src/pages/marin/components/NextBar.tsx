// Barra inferior fixa que exibe o próximo episódio do último anime assistido.
// Posicionada fixed na base da área principal (left: 244px no layout desktop).
// Botões: ← Anterior (log ep anterior), "Já vi" (log ep atual), → Próximo.
// Só renderiza quando há um próximo episódio disponível.

import type { Episode } from '../types'

interface NextBarProps {
  // Próximo episódio não assistido
  episode: Episode
  // Título do anime
  animeTitle: string
  // ID do anime (para construir a ação de log)
  animeId: string
  // Callback para logar o episódio atual
  onLog: (animeId: string, epNumber: number) => void
  // Fechar a barra (usuário descartou)
  onClose?: () => void
}

/**
 * Barra de próximo episódio — fixa na base da tela.
 * Exibe número + título do próximo ep + botão de log rápido.
 */
export function NextBar({ episode, animeTitle, animeId, onLog, onClose }: NextBarProps) {
  // Formata a data de exibição
  const airedText = episode.aired
    ? new Date(episode.aired).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
    : null

  return (
    <div className="mr-next-bar" role="complementary" aria-label="Próximo episódio">
      {/* Informações do próximo episódio */}
      <div className="mr-next-bar-info">
        <span className="mr-next-bar-ep">
          {animeTitle} · Ep {episode.number}
        </span>
        {episode.title && (
          <span className="mr-next-bar-title">
            {episode.title}
          </span>
        )}
        {airedText && (
          <span className="mr-next-bar-date">
            {episode.airing_status === 'agendado' ? '📅 ' : ''}{airedText}
          </span>
        )}
      </div>

      {/* Ações */}
      <div className="mr-next-bar-actions">
        {/* Botão principal: logar este episódio */}
        <button
          className="mr-next-bar-btn mr-next-bar-btn--primary"
          onClick={() => onLog(animeId, episode.number)}
          aria-label={`Marcar episódio ${episode.number} como assistido`}
        >
          ✓ Já vi
        </button>

        {/* Fechar barra */}
        {onClose && (
          <button
            className="mr-next-bar-btn"
            onClick={onClose}
            aria-label="Fechar barra de próximo episódio"
            style={{ opacity: 0.6 }}
          >
            ✕
          </button>
        )}
      </div>
    </div>
  )
}
