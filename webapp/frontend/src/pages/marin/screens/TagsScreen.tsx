// Tela de Etiquetas — nuvem de etiquetas livres com contagem (spec 054, FR-004).
// Clique numa etiqueta navega para o Catálogo filtrado por ela (busca contextual
// da topbar, já que o backend de catálogo não tem parâmetro de tag dedicado).

import { useState, useEffect } from 'react'
import { marinApi } from '../marinApi'
import type { TagEntry } from '../types'

interface TagsScreenProps {
  onSelectTag: (tag: string) => void
  onToast: (msg: string) => void
}

export function TagsScreen({ onSelectTag, onToast }: TagsScreenProps) {
  const [tags, setTags] = useState<TagEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    marinApi.getTags()
      .then(r => setTags(r.tags ?? []))
      .catch(() => onToast('Erro ao carregar etiquetas.'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="mr-watchlist-loading"><div className="mr-spinner" /></div>
  }

  return (
    <div className="mr-catalog">
      <div className="mr-catalog-header" style={{ marginTop: 22 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>Etiquetas</h1>
      </div>

      {tags.length === 0 ? (
        <p style={{ color: 'var(--ink-4)', padding: '20px 0' }}>
          Nenhuma etiqueta ainda — adicione etiquetas pelo detalhe de um anime.
        </p>
      ) : (
        <div className="mr-catalog-chips" style={{ marginTop: 22 }}>
          {tags.map(t => (
            <button
              key={t.name}
              className="mr-chip"
              onClick={() => onSelectTag(t.name)}
            >
              {t.name}
              <span className="mr-chip-count">{t.count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
