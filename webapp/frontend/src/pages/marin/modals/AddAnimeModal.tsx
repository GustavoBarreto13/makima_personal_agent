// Modal para adicionar novo anime ao catálogo via busca no Jikan/MAL.
// Fluxo: digitar título → busca no MAL via marinApi.search() → selecionar resultado →
//   se já está no catálogo: chip "Já na lista" → navega ao detalhe
//   se não está: add({ mal_id }) → toast "Adicionado!" → navega ao detalhe

import { useState, useEffect, useCallback } from 'react'
import { marinApi } from '../marinApi'
import type { AnimeSearchResult } from '../types'

interface AddAnimeModalProps {
  onAdded: (animeId: string) => void  // abre o detalhe do anime adicionado
  onClose: () => void
  onToast: (msg: string) => void
}

/**
 * AddAnimeModal — busca no MAL (via Jikan) e adiciona ao catálogo.
 * Se o anime já está no catálogo (in_catalog=true), navega direto ao detalhe.
 */
export function AddAnimeModal({ onAdded, onClose, onToast }: AddAnimeModalProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<AnimeSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [adding, setAdding] = useState<number | null>(null)  // mal_id sendo adicionado

  // Busca no Jikan com debounce de 500ms (Jikan tem limite de 3 req/s)
  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      return
    }
    const timer = setTimeout(() => {
      setSearching(true)
      marinApi.search(query, 8)
        .then(res => setResults(res.results ?? []))
        .catch(() => setResults([]))
        .finally(() => setSearching(false))
    }, 500)
    return () => clearTimeout(timer)
  }, [query])

  // Esc fecha o modal
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }, [])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  async function handleSelect(result: AnimeSearchResult) {
    // Se já está no catálogo, navega direto ao detalhe
    if (result.in_catalog && result.local_id) {
      onAdded(result.local_id)
      return
    }

    // Adiciona ao catálogo via MAL ID
    setAdding(result.mal_id)
    try {
      const res = await marinApi.add({ mal_id: result.mal_id })
      const newId = (res as { id?: string; anime_id?: string }).id
        || (res as { id?: string; anime_id?: string }).anime_id
        || ''
      onToast(`${result.title} adicionado ao catálogo!`)
      if (newId) onAdded(newId)
      else onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao adicionar anime.'
      onToast(msg)
    } finally {
      setAdding(null)
    }
  }

  return (
    <div
      className="mr-modal-scrim"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal
      aria-label="Adicionar anime"
    >
      <div className="mr-modal mr-add-modal">
        {/* Cabeçalho */}
        <div className="mr-modal-header">
          <h2 className="mr-modal-title">Adicionar anime</h2>
          <button className="mr-modal-close" onClick={onClose} aria-label="Fechar">✕</button>
        </div>

        <div className="mr-modal-body">
          {/* Campo de busca */}
          <input
            type="text"
            className="mr-input"
            placeholder="Nome do anime (busca no MAL via Jikan)..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoFocus
            aria-label="Buscar anime no MAL"
          />

          {/* Aviso de espera (Jikan tem rate limit) */}
          {searching && (
            <div className="mr-add-searching">
              <div className="mr-spinner mr-spinner--sm" />
              Buscando no MyAnimeList...
            </div>
          )}

          {/* Resultados */}
          {results.length > 0 && (
            <div className="mr-add-results">
              {results.map(r => (
                <button
                  key={r.mal_id}
                  className={`mr-add-result${r.in_catalog ? ' mr-add-result--in-catalog' : ''}`}
                  onClick={() => handleSelect(r)}
                  disabled={adding === r.mal_id}
                  title={r.in_catalog ? 'Já está no catálogo — clique para abrir' : 'Clique para adicionar'}
                >
                  {/* Miniatura do pôster (quando disponível) */}
                  {r.poster_url && (
                    <img
                      src={r.poster_url}
                      alt=""
                      className="mr-add-result-thumb"
                      loading="lazy"
                    />
                  )}

                  {/* Informações do anime */}
                  <div className="mr-add-result-info">
                    <p className="mr-add-result-title">{r.title}</p>
                    <p className="mr-add-result-meta">
                      {r.type && <span>{r.type.toUpperCase()}</span>}
                      {r.season && <span> · {r.season}</span>}
                      {r.score && <span> · ⭐ {r.score}</span>}
                      {r.episodes && <span> · {r.episodes} eps</span>}
                    </p>
                  </div>

                  {/* Status */}
                  <div className="mr-add-result-action">
                    {adding === r.mal_id ? (
                      <div className="mr-spinner mr-spinner--sm" />
                    ) : r.in_catalog ? (
                      <span className="mr-chip mr-chip--green">Já na lista →</span>
                    ) : (
                      <span className="mr-add-plus">+</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Estado vazio (query digitada mas sem resultados e sem busca em andamento) */}
          {!searching && query.trim() && results.length === 0 && (
            <p className="mr-add-no-results">
              Nenhum resultado para "{query}". Tente um nome diferente.
            </p>
          )}

          {/* Dica inicial */}
          {!query && (
            <p className="mr-add-hint">
              Digite o nome do anime para buscar no MyAnimeList.
            </p>
          )}
        </div>

        <div className="mr-modal-footer">
          <button className="mr-btn" onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  )
}
