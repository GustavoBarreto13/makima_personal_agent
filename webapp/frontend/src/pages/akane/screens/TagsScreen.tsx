// Tela Etiquetas — reescrita hi-fi conforme o handoff §7.7: nuvem de
// tag-chip com contagem; etiquetas de pessoa ganham glifo de usuário e o
// aviso people-note. Clicar filtra os Filmes por aquela etiqueta.

import { useState, useEffect } from 'react'
import { akaneApi } from '../akaneApi'
import type { Tag } from '../types'
import { Icon } from '../ui/Icon'
import { matches } from '../searchUtils'

interface TagsScreenProps {
  /** Navega para Filmes filtrado por essa tag. */
  onSelectTag: (tag: string) => void
  /** Query da busca contextual da topbar — filtra client-side. */
  query: string
}

/** Nuvem de etiquetas — pessoas ganham glifo e destaque. */
export function TagsScreen({ onSelectTag, query }: TagsScreenProps) {
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  const load = () => {
    setLoading(true)
    setLoadError(false)
    akaneApi.tags()
      .then(r => setTags(r.tags))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  if (loading) return <p className="empty-state">Carregando etiquetas…</p>

  if (loadError) {
    return (
      <div className="page">
        <p className="empty-state">
          Não foi possível carregar as etiquetas.{' '}
          <button className="btn btn-ghost" onClick={load} style={{ marginLeft: 8 }}>Tentar novamente</button>
        </p>
      </div>
    )
  }

  const filtered = tags.filter(t => matches(query, t.name))
  const hasPeople = filtered.some(t => t.person)

  return (
    <div className="page">
      <div className="section-head" style={{ marginTop: 32 }}>
        <h2 className="section-title" style={{ fontSize: 30 }}>Etiquetas</h2>
        <span className="section-sub">{tags.length} etiquetas · organize por tema, estilo ou pessoa</span>
      </div>

      {hasPeople && (
        <div className="people-note" style={{ marginTop: 0, marginBottom: 18 }}>
          <Icon name="user" /> Etiquetas de pessoas vão se conectar à base de pessoas em breve.
        </div>
      )}

      {tags.length === 0 ? (
        <p className="empty-state">Nenhuma etiqueta ainda — adicione tags ao logar uma sessão ou nos detalhes de um filme.</p>
      ) : filtered.length === 0 && query.trim() ? (
        <p className="empty-state">Nada encontrado para "{query}".</p>
      ) : (
        <div className="chips" style={{ gap: 10 }}>
          {filtered.map(t => (
            <a key={t.name} className={'tag-chip' + (t.person ? ' person' : '')}
               onClick={() => onSelectTag(t.name)} style={{ fontSize: 13.5, padding: '8px 14px' }}>
              {t.person
                ? <Icon name="user" style={{ width: 14, height: 14, color: 'var(--rose)' }} />
                : <span className="t-hash">#</span>}
              {t.name}
              <span className="t-count">{t.count}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
