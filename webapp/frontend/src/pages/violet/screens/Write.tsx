// Tela Write — entrada diária do bullet journal com bullets tipados e sonho.

import { useEffect, useState, useRef } from 'react'
import { violetApi } from '../../../lib/api'
import type { Bullet, BulletKind, Entry } from '../types'
import { Icon } from '../ui/Icon'
import { RichText } from '../ui/RichText'
import { EmotionSection } from '../components/EmotionLog'

interface WriteProps {
  date: string
  entryIdx: number
  navigate: (view: string, param?: string | null) => void
}

const MONTHS_PT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
const DAYS_PT   = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado']

const KIND_CONFIG: Record<BulletKind, { label: string; icon: React.ReactNode }> = {
  bullet:    { label: 'Bullet',    icon: <span className="b-mark"><span className="dot" /></span> },
  highlight: { label: 'Destaque', icon: <Icon name="heart" size={15} /> },
  dream:     { label: 'Sonho',    icon: <Icon name="moon" size={15} /> },
  idea:      { label: 'Ideia',    icon: <Icon name="bulb" size={15} /> },
  wisdom:    { label: 'Sabedoria',icon: <Icon name="gem" size={15} /> },
  note:      { label: 'Nota',     icon: <Icon name="pin" size={15} /> },
}

function fmtTime(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

export function Write({ date, navigate }: Omit<WriteProps, 'entryIdx'> & { entryIdx?: number }) {
  const [page, setPage]     = useState<Entry | null>(null)
  const [bullets, setBullets] = useState<Bullet[]>([])
  const [dream, setDream]   = useState('')
  const [editing, setEditing] = useState<number | null>(null)
  const [editText, setEditText] = useState('')
  const [adding, setAdding]  = useState<BulletKind | null>(null)
  const [newText, setNewText] = useState('')
  const addRef = useRef<HTMLTextAreaElement>(null)

  const today = new Date().toISOString().slice(0,10)
  const effectiveDate = date || today

  useEffect(() => {
    setPage(null); setBullets([]); setDream('')
    violetApi.page(effectiveDate).then((res: any) => {
      setPage(res.page)
      setBullets(res.bullets || [])
      setDream(res.page?.dream || '')
    }).catch(() => {})
  }, [effectiveDate])

  useEffect(() => {
    if (adding && addRef.current) addRef.current.focus()
  }, [adding])

  const d = new Date(effectiveDate + 'T12:00:00')
  const diffDays = Math.round((new Date(today).getTime() - new Date(effectiveDate).getTime()) / 86400000)

  async function saveDream() {
    if (!page) return
    await violetApi.setDream(page.id, dream).catch(() => {})
  }

  async function addBullet(kind: BulletKind, text: string) {
    if (!page || !text.trim()) { setAdding(null); setNewText(''); return }
    const pos = bullets.length > 0 ? (bullets[bullets.length-1].position + 1000) : 1000
    const res: any = await violetApi.upsertBullet({ page_id: page.id, position: pos, content: text.trim(), kind }).catch(() => null)
    if (res?.bullet) setBullets(prev => [...prev, res.bullet as Bullet])
    setAdding(null); setNewText('')
  }

  async function saveBullet(bullet: Bullet, text: string) {
    if (!page) return
    const res: any = await violetApi.upsertBullet({ page_id: page.id, position: bullet.position, content: text, kind: bullet.kind }).catch(() => null)
    if (res?.bullet) setBullets(prev => prev.map(b => b.position === bullet.position ? res.bullet as Bullet : b))
    setEditing(null)
  }

  // Renderiza o marcador (ícone/ponto) de um bullet.
  // Quando favoritado (favorite=true), o marcador SEMPRE vira um coração garnet —
  // independente do tipo — replicando visualmente o comportamento do Destaque (FR-003).
  // O tipo original é preservado nos dados; só a exibição visual muda.
  function renderMark(kind: BulletKind, favorite = false) {
    // Favoritado: coração garnet em qualquer tipo — idêntico ao marcador do Destaque
    if (favorite) {
      return <span className="glyph is-fav"><Icon name="heart" size={15} /></span>
    }
    // Não favoritado: renderização normal por tipo
    if (kind === 'bullet') return <span className="dot" />
    const icons: Record<string, React.ReactNode> = {
      highlight: <Icon name="heart" size={15} />,
      dream:     <Icon name="moon" size={15} />,
      idea:      <Icon name="bulb" size={15} />,
      wisdom:    <Icon name="gem" size={15} />,
      note:      <Icon name="pin" size={15} />,
    }
    return <span className="glyph">{icons[kind]}</span>
  }

  // Alterna o estado de favorito de um bullet com optimistic update + rollback (FR-008).
  // 1. Guarda o valor anterior para rollback em caso de falha.
  // 2. Atualiza o estado local imediatamente (< 200ms, SC-001).
  // 3. Envia o estado-alvo explícito ao backend (set_favorite, não toggle no servidor).
  // 4. Em caso de falha, reverte o estado local ao valor anterior — sem favorito "fantasma".
  async function toggleFavorite(b: Bullet) {
    // Salva o valor anterior antes de qualquer mudança — necessário para o rollback
    const anterior = b.favorite
    const novoValor = !anterior

    // Optimistic update: atualiza visualmente antes da confirmação do servidor
    setBullets(prev => prev.map(x => x.id === b.id ? { ...x, favorite: novoValor } : x))

    try {
      await violetApi.setFavorite(b.id, novoValor)
    } catch {
      // Rollback: reverte ao estado anterior se a requisição falhar (FR-008)
      setBullets(prev => prev.map(x => x.id === b.id ? { ...x, favorite: anterior } : x))
    }
  }

  return (
    <div className="write-wrap">
      <div className="w-datehead">
        <div className="w-month">{MONTHS_PT[d.getMonth()]} {d.getDate()}</div>
        <div className="w-day">{DAYS_PT[d.getDay()]}</div>
        <div className="w-meta">
          <span className="w-num">#{page?.num ?? '—'}</span>
          <span className="w-sep">·</span>
          {diffDays === 0
            ? <span className="w-today">Hoje</span>
            : <span className="when">{diffDays === 1 ? 'Ontem' : `${diffDays} dias atrás`}</span>
          }
        </div>
      </div>

      {/* Prompt de sonho */}
      <div className="w-prompt" onClick={() => document.getElementById('vl-dream')?.focus()}>
        <span className="p-icon"><Icon name="moon" size={15} /></span>
        <textarea
          id="vl-dream"
          className="p-text"
          style={{ border:'none', outline:'none', background:'transparent', resize:'none', width:'100%', fontFamily:'inherit', fontStyle:'inherit', fontSize:'inherit', color:'inherit' }}
          placeholder="O que você sonhou?"
          value={dream}
          onChange={e => setDream(e.target.value)}
          onBlur={saveDream}
          rows={1}
        />
      </div>

      {/* Seção de registro emocional (TCC) — Feature 006.
          Fica entre o prompt de sonho e os bullets; é ortogonal aos bullets
          (não conta palavras nem afeta heatmap/coleções). */}
      <EmotionSection pageId={page?.id ?? null} />

      {/* Lista de bullets */}
      <div className="bullets">
        {bullets.map(b => (
          <div key={b.id} className="bgroup" data-kind={b.kind} data-fav={b.favorite ? 'true' : undefined}>
            {/* Marcador clicável — um clique favorita ou desfavorita o bullet (FR-002).
                role="button" torna o elemento semanticamente interativo para screen readers.
                title e aria-label descrevem a ação ao cursor/hover e a leitores de tela (FR-004).
                stopPropagation garante que o clique no marcador não propague ao bgroup. */}
            <div
              className="b-mark"
              role="button"
              title={b.favorite ? 'Desfavoritar' : 'Favoritar'}
              aria-label={b.favorite ? 'Desfavoritar' : 'Favoritar'}
              onClick={e => { e.stopPropagation(); toggleFavorite(b) }}
            >
              {renderMark(b.kind, b.favorite)}
            </div>
            <div className="b-lines">
              {editing === b.position ? (
                <textarea
                  className="bline"
                  style={{ border:'none', outline:'none', background:'transparent', resize:'none', width:'100%', fontFamily:'inherit', fontSize:'15.5px', color:'var(--ink)' }}
                  value={editText}
                  onChange={e => setEditText(e.target.value)}
                  onBlur={() => saveBullet(b, editText)}
                  onKeyDown={e => { if(e.key==='Enter' && !e.shiftKey) { e.preventDefault(); saveBullet(b, editText) } if(e.key==='Escape') setEditing(null) }}
                  autoFocus
                />
              ) : (
                <div className="bline lead" onDoubleClick={() => { setEditing(b.position); setEditText(b.content) }}>
                  <span className="b-text">
                    <RichText content={b.content} onMentionClick={(kind, _val) => navigate(kind === 'person' ? 'people' : 'tags')} />
                  </span>
                  <span className="b-time">{fmtTime(b.created_at)}</span>
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Placeholder "novo bullet" */}
        {adding ? (
          <div className="bgroup" data-kind={adding}>
            <div className="b-mark">{renderMark(adding)}</div>
            <div className="b-lines">
              <textarea
                ref={addRef}
                className="bline"
                style={{ border:'none', outline:'none', background:'transparent', resize:'none', width:'100%', fontFamily:'inherit', fontSize:'15.5px', color:'var(--ink)' }}
                placeholder="Registrar um momento..."
                value={newText}
                onChange={e => setNewText(e.target.value)}
                onBlur={() => addBullet(adding, newText)}
                onKeyDown={e => { if(e.key==='Enter' && !e.shiftKey) { e.preventDefault(); addBullet(adding, newText) } if(e.key==='Escape') { setAdding(null); setNewText('') } }}
              />
            </div>
          </div>
        ) : (
          <div className="bnew" onClick={() => setAdding('bullet')}>
            <div className="b-mark"><span className="dot" /></div>
            <span className="ph">Registrar um momento...</span>
          </div>
        )}
      </div>

      {/* Chips de tipo */}
      <div className="w-types">
        {(Object.entries(KIND_CONFIG) as [BulletKind, typeof KIND_CONFIG[BulletKind]][]).map(([kind, cfg]) => (
          <button key={kind} className="type-chip" onClick={() => { setAdding(kind); setNewText('') }}>
            <span className="tc-icon">{cfg.icon}</span>
            {cfg.label}
          </button>
        ))}
      </div>
    </div>
  )
}
