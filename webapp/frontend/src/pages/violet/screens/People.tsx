// Tela People — grid de pessoas mencionadas com avatar de iniciais e contagem.

import { useEffect, useState } from 'react'
import { violetApi } from '../../../lib/api'
import type { MentionCount } from '../types'

interface PeopleProps {
  navigate: (view: string, param?: string | null) => void
}

// Gera as iniciais de um nome para o avatar (ex.: "João Silva" → "JS")
function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

export function People({ navigate: _navigate }: PeopleProps) {
  const [people, setPeople] = useState<MentionCount[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    violetApi.mentions('person').then((list: unknown) => {
      setPeople(list as MentionCount[])
    }).catch(() => setPeople([]))
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

  if (!people.length) {
    return (
      <div className="page" style={{ paddingTop: 40, textAlign: 'center' }}>
        <div style={{ marginTop: 60 }}>
          <div style={{ fontFamily: 'var(--serif)', fontSize: 22, color: 'var(--ink-2)', marginBottom: 10 }}>
            Nenhuma pessoa ainda
          </div>
          <div style={{ color: 'var(--ink-4)', fontSize: 13 }}>
            Use @Pessoa nos seus bullets para registrar quem esteve no seu dia.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page" style={{ paddingTop: 32 }}>
      <div className="pp-header">
        <span className="pp-title">Pessoas</span>
        <span className="col-count-badge">{people.length}</span>
      </div>

      <div className="pp-grid">
        {people.map(person => (
          <button
            key={person.value}
            className="pp-card"
            onClick={() => _navigate('journal')}
            title={`${person.count} ${person.count === 1 ? 'menção' : 'menções'}`}
          >
            {/* Avatar circular com iniciais do nome */}
            <div className="pp-avatar">
              {initials(person.value)}
            </div>
            <div className="pp-name">{person.value}</div>
            <div className="pp-count">{person.count}×</div>
          </button>
        ))}
      </div>
    </div>
  )
}
