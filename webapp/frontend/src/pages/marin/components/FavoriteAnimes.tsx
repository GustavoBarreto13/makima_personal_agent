// Vitrine de até 4 animes favoritos — persiste em localStorage['marin.favorites'].
// Não usa endpoint /api; apenas armazena IDs localmente para performance.
// No modo de edição, abre um AnimePicker com busca inline no catálogo local.

import { useState, useEffect } from 'react'
import { marinApi } from '../marinApi'
import type { Anime } from '../types'
import { PosterCard } from './PosterCard'

// Chave do localStorage para persistir os IDs favoritos
const LS_KEY = 'marin.favorites'

// Número máximo de animes na vitrine
const MAX_FAVORITES = 4

interface FavoriteAnimesProps {
  // Callback ao clicar em um anime da vitrine → navega ao detalhe
  onSelectAnime?: (id: string) => void
  className?: string
}

/**
 * Vitrine de animes favoritos.
 * IDs persistidos em localStorage; metadados buscados por demanda.
 * Clique em slot vazio → abre mini-picker de busca no catálogo.
 */
export function FavoriteAnimes({ onSelectAnime, className }: FavoriteAnimesProps) {
  // IDs dos favoritos (até 4)
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(LS_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed.slice(0, MAX_FAVORITES) : []
    } catch {
      return []
    }
  })

  // Metadados dos animes favoritos (buscados por ID)
  const [animes, setAnimes] = useState<Record<string, Anime>>({})

  // Busca metadados dos favoritos que ainda não foram carregados
  useEffect(() => {
    favoriteIds.forEach(id => {
      if (animes[id]) return
      marinApi.detail(id)
        .then(res => {
          if (res.anime) {
            setAnimes(prev => ({ ...prev, [id]: res.anime }))
          }
        })
        .catch(() => {})
    })
  }, [favoriteIds])

  // Estado do mini-picker de busca
  const [pickerSlot, setPickerSlot] = useState<number | null>(null)  // índice do slot aberto
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Anime[]>([])
  const [searching, setSearching] = useState(false)

  // Busca no catálogo local ao digitar
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([])
      return
    }
    setSearching(true)
    marinApi.list({ status: undefined })
      .then(res => {
        const q = searchQuery.toLowerCase()
        const filtered = (res.animes ?? [])
          .filter(a => a.title.toLowerCase().includes(q))
          .slice(0, 6)
        setSearchResults(filtered)
      })
      .catch(() => setSearchResults([]))
      .finally(() => setSearching(false))
  }, [searchQuery])

  // Persiste no localStorage toda vez que favoriteIds muda
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(favoriteIds))
    } catch {}
  }, [favoriteIds])

  function setFavoriteAtSlot(slotIndex: number, animeId: string) {
    setFavoriteIds(prev => {
      const updated = [...prev]
      // Garante que o array tenha pelo menos slotIndex+1 elementos
      while (updated.length <= slotIndex) updated.push('')
      updated[slotIndex] = animeId
      // Remove strings vazias no final do array
      return updated.filter((id, i) => id || i < slotIndex)
    })
    setPickerSlot(null)
    setSearchQuery('')
    setSearchResults([])
  }

  function removeFavorite(slotIndex: number) {
    setFavoriteIds(prev => {
      const updated = [...prev]
      updated.splice(slotIndex, 1)
      return updated
    })
  }

  // Render os 4 slots (alguns podem estar vazios)
  const slots = Array.from({ length: MAX_FAVORITES }, (_, i) => favoriteIds[i] ?? null)

  return (
    <div className={`mr-favorites${className ? ' ' + className : ''}`}>
      <div className="mr-favorites-grid">
        {slots.map((animeId, i) => {
          const anime = animeId ? animes[animeId] : null
          const isPickerOpen = pickerSlot === i

          return (
            <div key={i} className="mr-favorites-slot">
              {anime ? (
                // Slot preenchido — mostra pôster com opção de remover
                <div style={{ position: 'relative' }}>
                  <PosterCard
                    title={anime.title}
                    posterUrl={anime.poster_url}
                    posterKey={anime.poster_key}
                    onClick={() => onSelectAnime?.(anime.id)}
                  />
                  {/* Botão de remover (pequeno, no canto superior direito) */}
                  <button
                    className="mr-favorites-remove"
                    onClick={(e) => {
                      e.stopPropagation()
                      removeFavorite(i)
                    }}
                    title="Remover favorito"
                    aria-label={`Remover ${anime.title} dos favoritos`}
                  >
                    ✕
                  </button>
                </div>
              ) : isPickerOpen ? (
                // Slot com picker de busca aberto
                <div className="mr-favorites-picker">
                  <input
                    type="text"
                    className="mr-favorites-search"
                    placeholder="Buscar anime..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    autoFocus
                  />
                  {searching && (
                    <div style={{ padding: 8, fontSize: 11, color: 'var(--ink-3)' }}>
                      Buscando...
                    </div>
                  )}
                  <div className="mr-favorites-results">
                    {searchResults.map(a => (
                      <button
                        key={a.id}
                        className="mr-favorites-result-item"
                        onClick={() => setFavoriteAtSlot(i, a.id)}
                      >
                        {a.title}
                      </button>
                    ))}
                  </div>
                  {/* Fechar picker sem selecionar */}
                  <button
                    className="mr-favorites-picker-close"
                    onClick={() => {
                      setPickerSlot(null)
                      setSearchQuery('')
                    }}
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                // Slot vazio — botão de adicionar
                <button
                  className="mr-favorites-add"
                  onClick={() => setPickerSlot(i)}
                  aria-label={`Adicionar favorito no slot ${i + 1}`}
                >
                  <span style={{ fontSize: 20, opacity: 0.4 }}>+</span>
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
