// Tela Collection — exibe bullets de um tipo específico (highlights, dreams, ideas, wisdom, notes)
// ou os sonhos registrados no campo dream das pages, em grid com accent bar por tipo.

import { useEffect, useState } from 'react'
import { violetApi } from '../../../lib/api'
import type { CollectionItem, DreamItem } from '../types'
import { RichText } from '../ui/RichText'

interface CollectionProps {
  // kind usa os nomes das views da sidebar (plural para combinar com o switch de rotas)
  kind: 'dreams' | 'highlights' | 'ideas' | 'wisdom' | 'notes'
  navigate: (view: string, param?: string | null) => void
}

// Mapeamento: view name → kind do backend + cor da accent bar + label
const KIND_MAP: Record<string, { backendKind: string; barColor: string; label: string; italic: boolean }> = {
  highlights: { backendKind: 'highlight', barColor: 'var(--garnet)', label: 'Destaques', italic: false },
  dreams:     { backendKind: 'dream',     barColor: 'var(--gold)',   label: 'Sonhos',    italic: true  },
  ideas:      { backendKind: 'idea',      barColor: 'var(--amber)',  label: 'Ideias',    italic: false },
  wisdom:     { backendKind: 'wisdom',    barColor: 'var(--violet-c)', label: 'Sabedoria', italic: true },
  notes:      { backendKind: 'note',      barColor: 'var(--ink-3)', label: 'Notas',     italic: false },
}

// Nomes dos meses para formatar a data de origem
const MONTHS_SHORT = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez']

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`
}

// Componente de card de um bullet de coleção (highlight/dream/idea/wisdom/note)
function BulletCard({ item, barColor, italic, navigate }: {
  item: CollectionItem
  barColor: string
  italic: boolean
  navigate: (view: string, param?: string | null) => void
}) {
  return (
    <div className="col-card" style={{ '--bar': barColor } as React.CSSProperties}>
      <div className="col-bar" />
      <div className="col-content">
        <p className="col-text" style={{ fontFamily: italic ? 'var(--serif)' : undefined, fontStyle: italic ? 'italic' : undefined }}>
          <RichText content={item.content} />
        </p>
        {/* Link para a entry de origem */}
        <button
          className="col-origin"
          onClick={() => navigate('write', item.date)}
        >
          #{item.entry_num} · {fmtDate(item.date)}
        </button>
      </div>
    </div>
  )
}

// Card para um sonho registrado no campo dream da page (texto livre)
function DreamCard({ item, navigate }: {
  item: DreamItem
  navigate: (view: string, param?: string | null) => void
}) {
  return (
    <div className="col-card" style={{ '--bar': 'var(--gold)' } as React.CSSProperties}>
      <div className="col-bar" />
      <div className="col-content">
        <p className="col-text" style={{ fontFamily: 'var(--serif)', fontStyle: 'italic' }}>
          {item.dream}
        </p>
        <button
          className="col-origin"
          onClick={() => navigate('write', item.date)}
        >
          #{item.entry_num} · {fmtDate(item.date)}
        </button>
      </div>
    </div>
  )
}

export function Collection({ kind, navigate }: CollectionProps) {
  const [items, setItems] = useState<(CollectionItem | DreamItem)[]>([])
  const [loading, setLoading] = useState(true)
  const cfg = KIND_MAP[kind]

  useEffect(() => {
    setLoading(true)
    setItems([])

    // Sonhos da tela "dreams" são os campos dream das pages, não bullets kind='dream'
    const promise = kind === 'dreams'
      ? violetApi.dreams()
      : violetApi.collection(cfg.backendKind)

    promise.then((list: unknown) => {
      setItems(list as (CollectionItem | DreamItem)[])
    }).catch(() => {
      setItems([])
    }).finally(() => setLoading(false))
  }, [kind])

  if (loading) {
    return (
      <div className="page" style={{ paddingTop: 40 }}>
        <div style={{ color: 'var(--ink-4)', fontFamily: 'var(--mono)', fontSize: 12, textAlign: 'center', paddingTop: 60 }}>
          carregando...
        </div>
      </div>
    )
  }

  if (!items.length) {
    return (
      <div className="page" style={{ paddingTop: 40, textAlign: 'center' }}>
        <div style={{ marginTop: 60 }}>
          <div style={{ fontFamily: 'var(--serif)', fontSize: 22, color: 'var(--ink-2)', marginBottom: 10 }}>
            Nenhum item ainda
          </div>
          <div style={{ color: 'var(--ink-4)', fontSize: 13 }}>
            {cfg.label} aparecerão aqui conforme você escreve.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page" style={{ paddingTop: 32 }}>
      <div className="col-header">
        <span className="col-title">{cfg.label}</span>
        <span className="col-count-badge">{items.length}</span>
      </div>

      <div className="col-grid">
        {kind === 'dreams'
          ? (items as DreamItem[]).map(item => (
              <DreamCard key={item.page_id} item={item} navigate={navigate} />
            ))
          : (items as CollectionItem[]).map(item => (
              <BulletCard key={item.id} item={item} barColor={cfg.barColor} italic={cfg.italic} navigate={navigate} />
            ))
        }
      </div>
    </div>
  )
}
