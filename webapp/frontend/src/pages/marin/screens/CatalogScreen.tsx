// Tela de catálogo — grid de todos os animes com filtros de status e ordenação.
// Filtros: chips coloridos com bolinhas --st-{status}.
// Ordenação: respeita tweaks.ordenacao do usuário.

import { useState, useEffect } from 'react'
import { marinApi } from '../marinApi'
import type { Anime, Tweaks } from '../types'
import { PosterCard }  from '../components/PosterCard'
import { StatusChip }  from '../components/StatusChip'
import { Score }       from '../components/Score'

interface CatalogScreenProps {
  tweaks: Tweaks
  onSelectAnime: (id: string) => void
  // Query externa passada pela topbar do shell (quando o usuário digita na busca global).
  // Se fornecida, sobrescreve a busca interna da tela (sem request adicional).
  externalQuery?: string
}

// Filtros disponíveis na chip-bar
const FILTERS = [
  { id: '',             label: 'Todos'       },
  { id: 'assistindo',  label: 'Assistindo'  },
  { id: 'completo',    label: 'Completo'    },
  { id: 'quero_assistir', label: 'Na fila'  },
  { id: 'pausado',     label: 'Pausado'     },
  { id: 'abandonado',  label: 'Abandonado'  },
] as const

// Mapa de ordenação (tweak) → parâmetro de API
const SORT_MAP: Record<string, string> = {
  'Atualizado': 'updated',
  'Adicionado': 'added',
  'Nota':       'score',
  'Título':     'title',
}

/**
 * CatalogScreen — grid filtrado e ordenado do catálogo de animes.
 *
 * Aceita `externalQuery` passada pelo shell (topbar de busca global) para
 * sincronizar a busca sem request adicional. A busca interna do próprio campo
 * da tela continua funcionando quando externalQuery está vazia.
 */
export function CatalogScreen({ tweaks, onSelectAnime, externalQuery = '' }: CatalogScreenProps) {
  const [animes, setAnimes] = useState<Anime[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('')  // filtro de status
  const [query, setQuery] = useState('')             // busca interna (campo da tela)

  const sort = SORT_MAP[tweaks.ordenacao] || 'updated'

  // Quando o shell injeta uma query externa, limpa a busca interna para evitar conflito
  useEffect(() => {
    if (externalQuery.trim()) setQuery('')
  }, [externalQuery])

  // Rebusca quando filtro ou ordenação mudam
  useEffect(() => {
    setLoading(true)
    marinApi.list({ status: filter || undefined, sort })
      .then(res => setAnimes(res.animes ?? []))
      .catch(() => setAnimes([]))
      .finally(() => setLoading(false))
  }, [filter, sort])

  // Determina qual query usar: externa (topbar do shell) tem prioridade sobre a interna.
  // Isso permite que a busca global da topbar filtre o catálogo sem request adicional.
  const activeQuery = externalQuery.trim() || query.trim()

  // Filtro de busca local (sem request adicional) — aplica a query ativa
  const displayed = activeQuery
    ? animes.filter(a =>
        a.title.toLowerCase().includes(activeQuery.toLowerCase()) ||
        (a.studio && a.studio.toLowerCase().includes(activeQuery.toLowerCase())) ||
        (a.genres && a.genres.some(g => g.toLowerCase().includes(activeQuery.toLowerCase())))
      )
    : animes

  return (
    <div className="mr-catalog">
      {/* ── Busca + chips de filtro ─────────────────────────────────────────── */}
      <div className="mr-catalog-header">
        {/* Campo de busca interno — mostra a query ativa (interna ou da topbar global) */}
        <input
          type="search"
          className="mr-search-input"
          placeholder="Buscar no catálogo..."
          value={externalQuery.trim() ? externalQuery : query}
          onChange={e => setQuery(e.target.value)}
          readOnly={!!externalQuery.trim()}  // Somente-leitura quando topbar controla a busca
          aria-label="Buscar anime"
        />

        {/* Chips de status com bolinhas coloridas */}
        <div className="mr-catalog-chips" role="group" aria-label="Filtrar por status">
          {FILTERS.map(f => (
            <button
              key={f.id}
              className={`mr-chip${filter === f.id ? ' mr-chip--active' : ''}`}
              onClick={() => setFilter(f.id)}
              aria-pressed={filter === f.id}
            >
              {/* Bolinha colorida para filtros de status específicos */}
              {f.id && (
                <span
                  className="mr-chip-dot"
                  style={{ background: `var(--st-${f.id})` }}
                />
              )}
              {f.label}
              {/* Contagem de animes neste status */}
              {filter === f.id && displayed.length > 0 && (
                <span className="mr-chip-count">{displayed.length}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Grid de pôsteres ─────────────────────────────────────────────────── */}
      {loading ? (
        <div className="mr-catalog-loading"><div className="mr-spinner" /></div>
      ) : displayed.length === 0 ? (
        <div className="mr-catalog-empty">
          <p>Nenhum anime encontrado.</p>
        </div>
      ) : (
        <div className="mr-catalog-grid">
          {displayed.map(anime => (
            <div key={anime.id} className="mr-catalog-item">
              <PosterCard
                title={anime.title}
                posterUrl={anime.poster_url}
                posterKey={anime.poster_key}
                onClick={() => onSelectAnime(anime.id)}
              >
                {/* Chip de status sobre o pôster */}
                <StatusChip status={anime.status} variant="onPoster" />
              </PosterCard>

              {/* Info abaixo do pôster */}
              <div className="mr-catalog-info">
                <p className="mr-catalog-title">{anime.title}</p>
                {anime.score && anime.score > 0 && (
                  <Score score={anime.score} variant="compact" />
                )}
                {anime.studio && (
                  <p className="mr-catalog-studio">{anime.studio}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
