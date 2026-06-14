// Barra de progresso de episódios de um anime.
// Mostra "X/N eps" e uma barra horizontal preenchida proporcionalmente.
// Quando não há episódios_total, exibe apenas a contagem assistida.
// Pulsação animada no próximo episódio disponível (mr-pulse).

interface EpisodeProgressProps {
  // Episódios já assistidos
  watched: number
  // Total de episódios (null se série em andamento sem data de fim)
  total: number | null | undefined
  // Mostra a barra visual além do texto (padrão: true)
  showBar?: boolean
  className?: string
}

/**
 * Progresso de episódios de um anime.
 * Barra proporcional: watched/total quando total conhecido.
 */
export function EpisodeProgress({ watched, total, showBar = true, className }: EpisodeProgressProps) {
  // Calcula a porcentagem de progresso (0–1) — fallback para 0 se total desconhecido
  const pct = total && total > 0 ? Math.min(watched / total, 1) : 0
  // Texto de progresso: "3/12 eps" ou "3 eps" se sem total
  const text = total ? `${watched}/${total} eps` : `${watched} eps`
  // Considera completo se >= total
  const completed = total ? watched >= total : false

  return (
    <div className={`mr-ep-progress${className ? ' ' + className : ''}`}>
      {/* Texto de contagem */}
      <span className="mr-ep-progress-text" aria-label={text}>
        {text}
      </span>

      {/* Barra visual de progresso */}
      {showBar && (
        <div
          className="mr-ep-bar"
          role="progressbar"
          aria-valuenow={watched}
          aria-valuemax={total ?? undefined}
          aria-label={`Progresso: ${text}`}
        >
          <div
            className={`mr-ep-bar-fill${completed ? ' mr-ep-bar-fill--done' : ''}`}
            style={{ width: total ? `${pct * 100}%` : '0%' }}
          />
        </div>
      )}
    </div>
  )
}
