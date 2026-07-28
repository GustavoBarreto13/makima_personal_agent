// Tela Filmes (a LISTA do acervo) — reescrita hi-fi conforme o handoff §7.2:
// section-head (título + contagem do acervo), cat-toolbar com chips de filtro
// (Todos / Vistos / Curtidos / Quero ver / Com nota) + contagem de resultados,
// e poster-grid com metadados ABAIXO de cada pôster (título serif, diretor·ano,
// estrelas+coração ou "quero ver"). Também é a tela de etiqueta (prop tag).

import { useState, useEffect } from 'react'
import { akaneApi } from '../akaneApi'
import type { Movie, Tweaks } from '../types'
import { Icon } from '../ui/Icon'
import { Heart } from '../ui/Heart'
import { Poster } from '../components/Poster'
import { Stars } from '../components/Stars'
import { matches } from '../searchUtils'

// Chips de filtro (rótulos do handoff → valores do param 'filter' da API)
const FILTER_CHIPS: Array<{ label: string; value: string }> = [
  { label: 'Todos',     value: 'all' },
  { label: 'Vistos',    value: 'watched' },
  { label: 'Curtidos',  value: 'liked' },
  { label: 'Quero ver', value: 'watchlist' },
  { label: 'Com nota',  value: 'rated' },
]

// Rótulo humano de cada ordenação (para o "· por X" da contagem)
const SORT_LABELS: Record<string, string> = {
  recent: 'recentes', rating: 'nota', title: 'título',
  director: 'diretor', year: 'ano', runtime: 'duração',
}

interface FilmsScreenProps {
  tweaks: Tweaks
  /** Abre o detalhe de um filme. */
  onSelectMovie: (id: string) => void
  /** Etiqueta pré-selecionada (vinda da tela de etiquetas). */
  initialTag?: string | null
  /** Query da busca contextual da topbar — filtra client-side. */
  query: string
}

/** Grid principal do catálogo com filtros, ordenação (tweak) e modo etiqueta. */
export function FilmsScreen({ tweaks, onSelectMovie, initialTag, query }: FilmsScreenProps) {
  const [movies, setMovies] = useState<Movie[]>([])
  const [loading, setLoading] = useState(true)
  // Chip de filtro ativo ('all' = sem filtro)
  const [filter, setFilter] = useState('all')
  // Etiqueta ativa (modo "#tag": esconde a toolbar e mostra o header próprio)
  const [activeTag, setActiveTag] = useState<string | null>(initialTag ?? null)

  // A ordenação vem do tweak (painel de tweaks), como no handoff
  const sort = tweaks.sort

  // Busca os filmes sempre que filtro/sort/tag mudam
  useEffect(() => {
    setLoading(true)
    akaneApi.list({
      filter: filter !== 'all' ? filter : undefined,
      sort,
      tag: activeTag ?? undefined,
    })
      .then(res => setMovies(res.movies))
      .catch(() => setMovies([]))
      .finally(() => setLoading(false))
  }, [filter, sort, activeTag])

  // Busca client-side cumulativa com o filtro/tag já aplicados no fetch
  const list = movies.filter(m =>
    matches(query, m.title, m.director, m.genres, m.year, m.tags)
  )

  const watchedCount = movies.filter(m => m.status === 'watched').length

  return (
    <div className="ak-page">
      {/* ── Cabeçalho da seção ── */}
      <div className="ak-section-head" style={{ marginTop: 32, marginBottom: 0 }}>
        <h2 className="ak-section-title" style={{ fontSize: 30 }}>
          {activeTag
            ? <>Etiqueta <span style={{ color: 'var(--rose-deep)' }}>#{activeTag}</span></>
            : 'Filmes'}
        </h2>
        <span className="ak-section-sub">
          {activeTag
            ? `${list.length} ${list.length === 1 ? 'filme' : 'filmes'}`
            : `${movies.length} no acervo · ${watchedCount} vistos`}
        </span>
      </div>

      {/* ── Toolbar de filtros (só fora do modo etiqueta) ── */}
      {!activeTag && (
        <div className="ak-cat-toolbar">
          <div className="ak-chips">
            {FILTER_CHIPS.map(f => (
              <button key={f.value}
                      className={'ak-chip' + (filter === f.value ? ' ak-active' : '')}
                      onClick={() => setFilter(f.value)}>
                {f.label}
              </button>
            ))}
          </div>
          <div className="ak-toolbar-spacer" />
          <span className="ak-result-count">
            {list.length} {list.length === 1 ? 'filme' : 'filmes'} · por {SORT_LABELS[sort] ?? sort}
          </span>
        </div>
      )}

      {/* ── Modo etiqueta: botão de voltar para a nuvem ── */}
      {activeTag && (
        <button className="ak-detail-back" onClick={() => setActiveTag(null)} style={{ paddingTop: 14 }}>
          <Icon name="arrowLeft" /> Todas as etiquetas
        </button>
      )}

      {/* ── Grade de pôsteres ── */}
      {loading ? (
        <p className="ak-empty-state">Carregando filmes…</p>
      ) : (
        <>
          <div className="ak-poster-grid">
            {list.map(f => (
              <a key={f.id} className="ak-poster-link" onClick={() => onSelectMovie(f.id)}>
                <Poster
                  title={f.title}
                  posterUrl={f.poster_url}
                  palette={f.poster_palette}
                  genre={f.genres?.[0]}
                  director={f.director?.[0]}
                  year={f.year}
                  status={f.status}
                  liked={f.liked}
                  badge
                />
                <div className="ak-poster-meta">
                  <div className="ak-pm-title">{f.title}</div>
                  <div className="ak-pm-sub">{[f.director?.[0], f.year].filter(Boolean).join(' · ')}</div>
                  <div className="ak-pm-row">
                    {f.rating
                      ? <><Stars value={f.rating} />{f.liked && <Heart filled className="ak-heart-ico" />}</>
                      : f.status === 'watchlist'
                        ? <span className="ak-result-count" style={{ color: 'var(--rose-deep)' }}>quero ver</span>
                        : <span className="ak-result-count">sem nota</span>}
                  </div>
                </div>
              </a>
            ))}
          </div>
          {list.length === 0 && (
            <p className="ak-empty-state">Nada encontrado{query ? ` para "${query}"` : ''}.</p>
          )}
        </>
      )}
    </div>
  )
}
