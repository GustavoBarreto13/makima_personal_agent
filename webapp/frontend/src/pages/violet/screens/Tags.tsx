// Tela Tags — nuvem de tags com tamanho proporcional à frequência de uso.

import { useEffect, useState } from 'react'
import { violetApi } from '../../../lib/api'
import type { MentionCount } from '../types'

interface TagsProps {
  navigate: (view: string, param?: string | null) => void
}

export function Tags({ navigate: _navigate }: TagsProps) {
  const [tags, setTags] = useState<MentionCount[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    violetApi.mentions('tag').then((list: unknown) => {
      setTags(list as MentionCount[])
    }).catch(() => { setTags([]) })
    .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="page" style={{ paddingTop: 40 }}>
        <div style={{ color: 'var(--ink-4)', fontFamily: 'var(--mono)', fontSize: 12, textAlign: 'center', paddingTop: 60 }}>
          carregando...
        </div>
      </div>
    )
  }

  if (!tags.length) {
    return (
      <div className="page" style={{ paddingTop: 40, textAlign: 'center' }}>
        <div style={{ marginTop: 60 }}>
          <div style={{ fontFamily: 'var(--serif)', fontSize: 22, color: 'var(--ink-2)', marginBottom: 10 }}>
            Nenhuma tag ainda
          </div>
          <div style={{ color: 'var(--ink-4)', fontSize: 13 }}>
            Use #tag nos seus bullets para criar a nuvem de temas.
          </div>
        </div>
      </div>
    )
  }

  // Calcula o tamanho de fonte proporcional à frequência: 0.92em + (count/max) * 0.55em
  const maxCount = Math.max(...tags.map(t => t.count))

  return (
    <div className="page" style={{ paddingTop: 32 }}>
      <div className="tg-header">
        <span className="tg-title">Tags</span>
        <span className="col-count-badge">{tags.length}</span>
      </div>

      <div className="tg-cloud">
        {tags.map(tag => {
          // Tamanho de fonte proporcional: tags frequentes ficam maiores
          const fontSize = 0.92 + (tag.count / maxCount) * 0.55
          return (
            <button
              key={tag.value}
              className="tg-chip"
              style={{ fontSize: `${fontSize}em` }}
              title={`${tag.count} ${tag.count === 1 ? 'vez' : 'vezes'}`}
              onClick={() => _navigate('journal')}
            >
              {tag.value}
            </button>
          )
        })}
      </div>
    </div>
  )
}
