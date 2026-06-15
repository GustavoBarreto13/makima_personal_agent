// Tela de catálogo — grid de todos os animes com filtros de status e ordenação.
// Filtros: chips coloridos com bolinhas --st-{status}.
// Ordenação: respeita tweaks.ordenacao do usuário.

import { useState, useEffect } from 'react'
import { marinApi } from '../marinApi'
import type { Anime, Tweaks, Status } from '../types'
import { PosterCard }  from '../components/PosterCard'
import { StatusChip }  from '../components/StatusChip'
import { Score }       from '../components/Score'

interface CatalogScreenProps {
  tweaks: Tweaks
  onSelectAnime: (id: string) => void
  // Query externa passada pela topbar do shell (quando o usuário digita na busca global).
  // Se fornecida, sobrescreve a busca interna da tela (sem request adicional).
  externalQuery?: string
  // Contagens por status vindas do HomeData.counts (já buscadas pelo shell na home).
  // Evita um segundo request para obter os totais do header.
  externalCounts?: Record<Status, number>
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
  'Progresso':  'progress',  // ordena por % de episódios assistidos
}

// Rótulos legíveis da ordenação para a linha de resultados (sempre minúsculos)
const SORT_LABELS: Record<string, string> = {
  'Atualizado': 'atualizado',
  'Adicionado': 'adicionado',
  'Nota':       'nota',
  'Título':     'título',
  'Progresso':  'progresso',
}

/**
 * CatalogScreen — grid filtrado e ordenado do catálogo de animes.
 *
 * Aceita `externalQuery` passada pelo shell (topbar de busca global) para
 * sincronizar a busca sem request adicional. A busca interna do próprio campo
 * da tela continua funcionando quando externalQuery está vazia.
 *
 * Aceita `externalCounts` do HomeData para exibir totais no header sem
 * fazer um request extra.
 */
export function CatalogScreen({
  tweaks,
  onSelectAnime,
  externalQuery = '',
  externalCounts,
}: CatalogScreenProps) {
  const [animes, setAnimes] = useState<Anime[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('')  // filtro de status
  const [query, setQuery] = useState('')             // busca interna (campo da tela)

  const sort = SORT_MAP[tweaks.ordenacao] || 'updated'

  // Rótulo legível da ordenação atual (para exibir na linha de resultados)
  const sortLabel = SORT_LABELS[tweaks.ordenacao] ?? tweaks.ordenacao.toLowerCase()

  // Total de animes no acervo — soma de todos os status (do externalCounts)
  const totalAnimes = externalCounts
    ? Object.values(externalCounts).reduce((acc, n) => acc + n, 0)
    : animes.length

  // Total de animes com status 'completo' — para o header
  const completedCount = externalCounts?.completo ?? 0

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

      {/* ── Header: título DM Serif + subtítulo com totais ──────────────────── */}
      <div className="mr-cat-header">
        <h1 className="mr-cat-title">Catálogo</h1>
        <p className="mr-cat-sub">
          {totalAnimes} no acervo · {completedCount} completos
        </p>
      </div>

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

        {/* Linha de contagem de resultados + ordenação ativa */}
        {!loading && (
          <div className="mr-result-count">
            {displayed.length} anime{displayed.length !== 1 ? 's' : ''} · por {sortLabel}
          </div>
        )}
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
            // Cada card é clicável e navega para o detalhe do anime
            <div
              key={anime.id}
              className="mr-poster-link"
              onClick={() => onSelectAnime(anime.id)}
              role="button"
              tabIndex={0}
              // Suporte a teclado: Enter/Espaço disparam o clique
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onSelectAnime(anime.id) }}
            >
              {/* Container relativo para posicionar a barra de progresso */}
              <div style={{ position: 'relative' }}>
                <PosterCard
                  title={anime.title}
                  posterUrl={anime.poster_url}
                  posterKey={anime.poster_key}
                >
                  {/* Chip de status sobreposto ao pôster */}
                  <StatusChip status={anime.status} variant="onPoster" />
                </PosterCard>

                {/* Barra de progresso fina na base do pôster —
                    só aparece quando há progresso parcial (não zerado nem 100%) */}
                {anime.episodes_total != null &&
                 anime.episodes_watched > 0 &&
                 anime.episodes_watched < anime.episodes_total && (
                  <div
                    className="mr-poster-progress-bar"
                    style={{
                      // Preenche a % já assistida com a cor de acento; resto transparente
                      background: `linear-gradient(to right, var(--marin) ${(anime.episodes_watched / anime.episodes_total) * 100}%, transparent 0)`,
                    }}
                  />
                )}
              </div>

              {/* Meta abaixo do pôster: título + nota + contagem de episódios */}
              <div className="mr-poster-meta">
                <p className="mr-poster-meta-title">{anime.title}</p>
                <div className="mr-poster-meta-row">
                  {/* Nota — só exibe se o anime foi avaliado */}
                  {anime.score != null && anime.score > 0 && (
                    <Score score={anime.score} variant="compact" />
                  )}
                  {/* Progresso em episódios: X/Y ou X/? quando total desconhecido */}
                  <span className="mr-poster-meta-eps">
                    {anime.episodes_watched}/{anime.episodes_total ?? '?'}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
