// Página de diário pessoal — editor de bullets diário com heatmap anual,
// agrupamento de @menções e #tags, busca e filtragem por pessoa/tag.
// Layout: editor central + sidebar direita com heatmap/menções/busca.
// Referência visual: Journalistic app.

import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { api } from '../lib/api'

// ── Tipos de dados ─────────────────────────────────────────────────────────────────────────────

interface Bullet {
  id: number | null
  content: string
  position: number
  localKey: string
  createdAt: string | null  // ISO timestamp do banco (para exibir "HH:MM h" abaixo do bullet)
}

interface PageResponse {
  page: {
    id: number
    date: string
    type_id: number
  }
  bullets: Array<{
    id: number
    content: string
    position: number
    created_at: string
  }>
}

type HeatmapResponse = Record<string, number>

interface MentionItem {
  value: string
  count: number
}

interface FilterGroup {
  date: string
  bullets: Array<{
    id: number
    content: string
  }>
}

interface UpsertResponse {
  status: string
  bullet: {
    id: number
    content: string
    position: number
    created_at: string
  }
}

type Mode =
  | { type: 'day'; date: string }
  | { type: 'filter'; kind: 'person' | 'tag'; value: string }
  | { type: 'search'; query: string }

// ── Prompts de sugestão ────────────────────────────────────────────────────────────────────────

const PROMPTS = [
  'Como foi seu dia?',
  'O que você aprendeu hoje?',
  'Com quem você interagiu hoje?',
  'O que está na sua cabeça agora?',
]

// ── Funções auxiliares puras ───────────────────────────────────────────────────────────────────

function todayISO(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Retorna a data no formato curto: "6 jun. 2026"
 */
function shortDatePT(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * Retorna o dia da semana com a primeira letra maiúscula: "Sexta-feira"
 */
function weekdayPT(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  const wd = d.toLocaleDateString('pt-BR', { weekday: 'long' })
  return wd.charAt(0).toUpperCase() + wd.slice(1)
}

/**
 * Formata data completa em português para os cabeçalhos de grupo: "Sexta-feira, 6 de junho de 2026"
 */
function formatDatePT(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

/**
 * Formata um timestamp ISO para "HH:MM h" no fuso local.
 * Se iso for null, usa o horário atual como fallback.
 */
function formatTime(iso: string | null): string {
  const d = iso ? new Date(iso) : new Date()
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + ' h'
}

/**
 * Calcula streak: quantos dias consecutivos com pelo menos 1 bullet, contando para trás.
 */
function calcStreak(hm: Record<string, number>): number {
  let streak = 0
  const today = new Date()
  for (let i = 0; i < 365; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    if (hm[key] && hm[key] > 0) {
      streak++
    } else if (i > 0) {
      break
    }
  }
  return streak
}

/**
 * Destaca @menções (violeta) e #tags (verde) em texto de bullet.
 */
function renderHighlighted(text: string): React.ReactNode {
  const parts = text.split(/(@\w+|#\w+)/g)
  return parts.map((part, i) => {
    const key = `${i}-${part.slice(0, 8)}`
    if (part.startsWith('@')) return <span key={key} style={{ color: '#a78bfa' }}>{part}</span>
    if (part.startsWith('#')) return <span key={key} style={{ color: '#86efac' }}>{part}</span>
    return <span key={key}>{part}</span>
  })
}

function getInitialPosition(index: number): number { return index * 1000 }
function getMidPosition(prev: number, next: number): number { return Math.floor((prev + next) / 2) }

// ── Paleta de cores centralizada ──────────────────────────────────────────────────────────────

const C = {
  bg:       '#0e0d0b',
  sidebar:  '#0a0908',
  border:   '#2a2825',
  text:     '#f0ebe0',
  muted:    '#9a9185',
  faint:    '#4a4540',
  amber:    '#c9a96e',
  amberDim: '#44372b',
  violet:   '#a78bfa',
  green:    '#86efac',
}

// ── SVG Icons inline (evita dependência de lib de ícones) ─────────────────────────────────────

function IconPencil({ size = 16, color = C.muted }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  )
}

function IconBarChart({ size = 16, color = C.muted }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
    </svg>
  )
}

function IconUsers({ size = 16, color = C.muted }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  )
}

function IconHash({ size = 16, color = C.muted }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/>
      <line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/>
    </svg>
  )
}

function IconSearch({ size = 14, color = C.faint }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  )
}

// ── Componente principal ───────────────────────────────────────────────────────────────────────

export default function Journal() {
  // ── Estado principal ──
  const [mode, setMode] = useState<Mode>({ type: 'day', date: todayISO() })
  const [pageId, setPageId] = useState<number | null>(null)
  const [pageNum, setPageNum] = useState<number | null>(null)  // page.id para exibir como #N
  const [bullets, setBullets] = useState<Bullet[]>([])
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  // ── Estado da sidebar direita ──
  const [heatmap, setHeatmap] = useState<Record<string, number>>({})
  const [streak, setStreak] = useState(0)
  const [people, setPeople] = useState<MentionItem[]>([])
  const [tags, setTags] = useState<MentionItem[]>([])
  // Qual seção da sidebar está ativa: 'write' | 'insights' | 'people' | 'tags' | 'search'
  const [sidebarSection, setSidebarSection] = useState<'write' | 'insights' | 'people' | 'tags' | 'search'>('write')

  // ── Estado de filtro/busca ──
  const [filterResults, setFilterResults] = useState<FilterGroup[]>([])
  const [searchQuery, setSearchQuery] = useState('')

  // ── Refs ──
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pageIdRef = useRef<number | null>(null)

  const randomPrompt = useMemo(() => PROMPTS[Math.floor(Math.random() * PROMPTS.length)], [])
  const currentDate = mode.type === 'day' ? mode.date : ''
  const heatmapGrid = useMemo(() => buildHeatmapGrid(), [heatmap]) // eslint-disable-line react-hooks/exhaustive-deps
  const monthLabels = useMemo(() => buildMonthLabels(), [heatmapGrid]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Funções auxiliares ──

  const refreshSidebar = useCallback(() => {
    const year = new Date().getFullYear()
    Promise.all([
      api.get<HeatmapResponse>(`/api/journal/heatmap?year=${year}`),
      api.get<MentionItem[]>('/api/journal/mentions?kind=person'),
      api.get<MentionItem[]>('/api/journal/mentions?kind=tag'),
    ]).then(([hm, p, t]) => {
      setHeatmap(hm); setStreak(calcStreak(hm)); setPeople(p); setTags(t)
    }).catch(console.error)
  }, [])

  const saveBullet = useCallback(async (bullet: Bullet, pid: number) => {
    if (bullet.content === '' && bullet.id === null) return
    setSaveStatus('saving')
    try {
      const res = await api.post<UpsertResponse>('/api/journal/bullets', {
        page_id: pid, position: bullet.position, content: bullet.content,
      })
      setBullets(prev =>
        prev.map(b => b.localKey === bullet.localKey
          ? { ...b, id: res.bullet.id, createdAt: res.bullet.created_at ?? b.createdAt }
          : b
        )
      )
      setSaveStatus('saved')
      refreshSidebar()
    } catch {
      setSaveStatus('idle')
    }
  }, [refreshSidebar])

  // ── Efeitos ──

  useEffect(() => {
    const year = new Date().getFullYear()
    Promise.all([
      api.get<HeatmapResponse>(`/api/journal/heatmap?year=${year}`),
      api.get<MentionItem[]>('/api/journal/mentions?kind=person'),
      api.get<MentionItem[]>('/api/journal/mentions?kind=tag'),
    ]).then(([hm, p, t]) => {
      setHeatmap(hm); setStreak(calcStreak(hm)); setPeople(p); setTags(t)
    }).catch(console.error)
  }, [])

  useEffect(() => {
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [])

  useEffect(() => {
    if (!currentDate) return
    setLoading(true)
    api.get<PageResponse>(`/api/journal/page?date=${currentDate}`)
      .then(res => {
        setPageId(res.page.id)
        setPageNum(res.page.id)
        pageIdRef.current = res.page.id
        if (res.bullets.length === 0) {
          setBullets([{ id: null, content: '', position: getInitialPosition(0), localKey: 'initial-0', createdAt: null }])
          setFocusedIndex(0)
        } else {
          setBullets(res.bullets.map(b => ({
            ...b,
            localKey: `${b.id}-${b.position}`,
            createdAt: b.created_at ?? null,
          })))
          setFocusedIndex(null)
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [currentDate])

  useEffect(() => {
    if (mode.type === 'filter') {
      api.get<FilterGroup[]>(`/api/journal/filter?kind=${mode.kind}&value=${encodeURIComponent(mode.value)}`)
        .then(setFilterResults).catch(console.error)
    } else if (mode.type === 'search' && mode.query.trim()) {
      api.get<FilterGroup[]>(`/api/journal/search?q=${encodeURIComponent(mode.query)}`)
        .then(setFilterResults).catch(console.error)
    }
  }, [mode])

  // ── Handlers ──

  const handleBulletChange = (index: number, content: string) => {
    const updated = bullets.map((b, i) => i === index ? { ...b, content } : b)
    setBullets(updated)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      if (pageIdRef.current) saveBullet(updated[index], pageIdRef.current)
    }, 800)
  }

  const handleBulletEnter = async (index: number) => {
    if (!pageId) return
    const prev = bullets[index]
    const next = bullets[index + 1]
    const newPos = next ? getMidPosition(prev.position, next.position) : prev.position + 1000
    const newBullet: Bullet = {
      id: null, content: '', position: newPos,
      localKey: `new-${Date.now()}`,
      createdAt: new Date().toISOString(),  // fallback local até o banco confirmar
    }
    setBullets([...bullets.slice(0, index + 1), newBullet, ...bullets.slice(index + 1)])
    setFocusedIndex(index + 1)
    setSaveStatus('saving')
    try {
      const res = await api.post<UpsertResponse>('/api/journal/bullets', {
        page_id: pageId, position: newPos, content: '',
      })
      setBullets(prev =>
        prev.map(b => b.localKey === newBullet.localKey
          ? { ...b, id: res.bullet.id, createdAt: res.bullet.created_at ?? b.createdAt }
          : b
        )
      )
      setSaveStatus('saved')
    } catch {
      setSaveStatus('idle')
    }
  }

  const handleBulletBackspace = async (index: number) => {
    const bullet = bullets[index]
    if (bullet.content !== '') return
    if (bullets.length === 1) return
    if (bullet.id !== null) {
      try { await api.del(`/api/journal/bullets/${bullet.id}`) } catch { /* ignora */ }
    }
    setBullets(bullets.filter((_, i) => i !== index))
    setFocusedIndex(Math.max(0, index - 1))
    refreshSidebar()
  }

  const navigateDay = (delta: number) => {
    if (mode.type !== 'day') return
    const d = new Date(mode.date + 'T12:00:00')
    d.setDate(d.getDate() + delta)
    setMode({ type: 'day', date: d.toISOString().split('T')[0] })
  }

  const goToDay = (date: string) => {
    setSearchQuery('')
    setMode({ type: 'day', date })
    setSidebarSection('write')
  }

  // ── Heatmap ──

  function buildHeatmapGrid(): { date: string; count: number }[][] {
    const weeks: { date: string; count: number }[][] = []
    const today = new Date()
    const start = new Date(today)
    start.setDate(start.getDate() - 364)
    const dayOfWeek = start.getDay() || 7
    start.setDate(start.getDate() - (dayOfWeek - 1))
    const cur = new Date(start)
    for (let w = 0; w < 52; w++) {
      const week = []
      for (let d = 0; d < 7; d++) {
        const iso = cur.toISOString().split('T')[0]
        week.push({ date: iso, count: heatmap[iso] || 0 })
        cur.setDate(cur.getDate() + 1)
      }
      weeks.push(week)
    }
    return weeks
  }

  function buildMonthLabels(): { weekIndex: number; label: string }[] {
    const labels: { weekIndex: number; label: string }[] = []
    const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
    let lastMonth = -1
    heatmapGrid.forEach((week, wi) => {
      const m = new Date(week[0].date + 'T12:00:00').getMonth()
      if (m !== lastMonth) { labels.push({ weekIndex: wi, label: MESES[m] }); lastMonth = m }
    })
    return labels
  }

  function heatmapCellBg(count: number): string {
    if (count === 0)  return '#1a1917'
    if (count <= 2)   return '#44372b'
    if (count <= 5)   return '#7a5c38'
    if (count <= 9)   return '#b8843f'
    return '#d4a055'
  }

  // ── Renderização ───────────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full -m-6" style={{ fontFamily: "'DM Sans', sans-serif", background: C.bg }}>

      {/* ── Editor central ── */}
      <main className="flex-1 overflow-y-auto relative journal-grain" style={{ background: C.bg }}>

        {/* Indicador de save */}
        <div className="absolute top-5 right-5 flex items-center gap-1.5 select-none z-10">
          {saveStatus === 'saving' && (
            <><span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: C.amber }} />
            <span className="text-xs" style={{ color: C.muted }}>salvando</span></>
          )}
          {saveStatus === 'saved' && (
            <><span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: C.green }} />
            <span className="text-xs" style={{ color: C.faint }}>salvo</span></>
          )}
        </div>

        <div className="max-w-2xl mx-auto px-8 py-10 relative z-10">

          {/* ── Modo 'day' ── */}
          {mode.type === 'day' && (
            <>
              {/* Header da data estilo Journalistic */}
              <div className="mb-8">

                {/* Linha 1: data curta + navegação */}
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-xs" style={{ color: C.muted }}>
                    {shortDatePT(mode.date)}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => navigateDay(-1)}
                      className="px-2 py-0.5 text-base leading-none transition-opacity hover:opacity-50"
                      style={{ color: C.faint }}
                      aria-label="Dia anterior"
                    >‹</button>
                    <button
                      onClick={() => navigateDay(1)}
                      className="px-2 py-0.5 text-base leading-none transition-opacity hover:opacity-50"
                      style={{ color: C.faint }}
                      aria-label="Próximo dia"
                    >›</button>
                    {mode.date !== todayISO() && (
                      <button
                        onClick={() => setMode({ type: 'day', date: todayISO() })}
                        className="ml-1 text-xs transition-opacity hover:opacity-60"
                        style={{ color: C.amber }}
                      >hoje</button>
                    )}
                  </div>
                </div>

                {/* Linha 2: nome do dia em Archivo Black — o elemento visual dominante */}
                <h1
                  className="leading-none"
                  style={{
                    fontFamily: "'Archivo Black', sans-serif",
                    fontSize: 'clamp(2.6rem, 6vw, 3.8rem)',
                    color: C.text,
                    letterSpacing: '-0.02em',
                  }}
                >
                  {weekdayPT(mode.date)}
                </h1>

                {/* Linha 3: número da página */}
                {pageNum !== null && (
                  <p className="mt-0.5 text-xs" style={{ color: C.faint }}>
                    #{pageNum}
                  </p>
                )}

                {/* Divisor */}
                <div className="mt-5" style={{ height: '1px', background: C.border }} />
              </div>

              {/* Spinner */}
              {loading && (
                <div className="flex justify-center py-16">
                  <div className="w-5 h-5 rounded-full border-2 animate-spin"
                    style={{ borderColor: C.border, borderTopColor: C.amber }} />
                </div>
              )}

              {/* Lista de bullets */}
              {!loading && (
                <div>
                  {bullets.map((bullet, index) => (
                    <div key={bullet.localKey} className="mb-3">
                      {/* Linha do bullet: ponto + texto */}
                      <div
                        className="flex items-start gap-2.5 group rounded px-1.5 py-0.5 -mx-1.5 transition-colors"
                        style={{ background: focusedIndex === index ? '#161512' : 'transparent' }}
                        onMouseEnter={e => { if (focusedIndex !== index) e.currentTarget.style.background = '#141210' }}
                        onMouseLeave={e => { if (focusedIndex !== index) e.currentTarget.style.background = 'transparent' }}
                      >
                        {/* Marcador */}
                        <span
                          className="mt-[0.3em] shrink-0 select-none text-xs"
                          style={{ color: C.faint }}
                        >•</span>

                        {/* Input ativo */}
                        {focusedIndex === index ? (
                          <input
                            autoFocus
                            type="text"
                            value={bullet.content}
                            onChange={e => handleBulletChange(index, e.target.value)}
                            onBlur={() => setFocusedIndex(null)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') { e.preventDefault(); handleBulletEnter(index) }
                              if (e.key === 'Backspace' && bullet.content === '') {
                                e.preventDefault(); handleBulletBackspace(index)
                              }
                            }}
                            placeholder={index === 0 && bullets.length === 1 && bullet.content === '' ? randomPrompt : ''}
                            className="flex-1 bg-transparent border-none outline-none text-base leading-relaxed"
                            style={{ color: C.text, caretColor: C.amber }}
                          />
                        ) : (
                          // Visualização com highlight
                          <div
                            onClick={() => setFocusedIndex(index)}
                            className="flex-1 text-base leading-relaxed cursor-text"
                            style={{ color: C.text, minHeight: '1.6rem' }}
                          >
                            {bullet.content
                              ? renderHighlighted(bullet.content)
                              : <span style={{ color: C.faint }}>{index === 0 ? randomPrompt : ''}</span>
                            }
                          </div>
                        )}
                      </div>

                      {/* Timestamp abaixo do bullet */}
                      <div className="ml-[22px] mt-0.5">
                        <span className="text-[11px]" style={{ color: C.faint }}>
                          {formatTime(bullet.createdAt)}
                        </span>
                      </div>
                    </div>
                  ))}

                  {/* Dica de teclado */}
                  {focusedIndex === bullets.length - 1 && bullets.length > 0 && (
                    <p className="text-xs mt-3 ml-[22px]" style={{ color: C.faint }}>
                      Enter para nova linha · Backspace em linha vazia para deletar
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          {/* ── Modo 'filter' ou 'search' ── */}
          {(mode.type === 'filter' || mode.type === 'search') && (
            <>
              <div className="mb-8">
                <div className="flex items-center justify-between mb-0.5">
                  <button
                    onClick={() => goToDay(todayISO())}
                    className="text-xs transition-opacity hover:opacity-60"
                    style={{ color: C.muted }}
                  >← voltar</button>
                </div>

                <h1
                  className="leading-none"
                  style={{
                    fontFamily: "'Archivo Black', sans-serif",
                    fontSize: 'clamp(2rem, 5vw, 3rem)',
                    color: C.text,
                    letterSpacing: '-0.02em',
                  }}
                >
                  {mode.type === 'filter' && (
                    mode.kind === 'person'
                      ? <span style={{ color: C.violet }}>@{mode.value}</span>
                      : <span style={{ color: C.green }}>#{mode.value}</span>
                  )}
                  {mode.type === 'search' && <span>"{mode.query}"</span>}
                </h1>

                {mode.type === 'filter' && (
                  <p className="mt-0.5 text-xs" style={{ color: C.faint }}>
                    {filterResults.reduce((acc, g) => acc + g.bullets.length, 0)} menções
                  </p>
                )}

                <div className="mt-5" style={{ height: '1px', background: C.border }} />
              </div>

              {filterResults.length === 0 && (
                <p className="text-sm py-12 text-center" style={{ color: C.faint }}>
                  Nenhum resultado encontrado.
                </p>
              )}

              {filterResults.map(group => (
                <div key={group.date} className="mb-8">
                  <button
                    onClick={() => goToDay(group.date)}
                    className="text-[11px] uppercase tracking-widest mb-3 transition-opacity hover:opacity-60"
                    style={{ color: C.amber }}
                  >
                    {formatDatePT(group.date)}
                  </button>
                  <div>
                    {group.bullets.map(b => (
                      <div key={b.id} className="flex items-start gap-2.5 mb-2">
                        <span className="mt-[0.3em] shrink-0 text-xs select-none" style={{ color: C.faint }}>•</span>
                        <div className="text-base leading-relaxed" style={{ color: C.text }}>
                          {renderHighlighted(b.content)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </main>

      {/* ── Sidebar direita — submenu da seção Diário ── */}
      <aside
        className="w-52 shrink-0 flex flex-col overflow-y-auto"
        style={{ background: C.sidebar, borderLeft: `1px solid ${C.border}` }}
      >

        {/* Seção de navegação superior: Escrever / Insights */}
        <nav className="px-2 pt-4 pb-2">
          {/* Botão Escrever */}
          <button
            onClick={() => { setSidebarSection('write'); goToDay(todayISO()) }}
            className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-md text-sm transition-colors mb-0.5"
            style={{
              background: sidebarSection === 'write' ? 'rgba(255,255,255,0.06)' : 'transparent',
              color: sidebarSection === 'write' ? C.text : C.muted,
            }}
            onMouseEnter={e => { if (sidebarSection !== 'write') e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
            onMouseLeave={e => { if (sidebarSection !== 'write') e.currentTarget.style.background = 'transparent' }}
          >
            <IconPencil color={sidebarSection === 'write' ? C.amber : C.faint} />
            <span>Escrever</span>
          </button>

          {/* Botão Insights (toggle heatmap) */}
          <button
            onClick={() => setSidebarSection(sidebarSection === 'insights' ? 'write' : 'insights')}
            className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-md text-sm transition-colors mb-0.5"
            style={{
              background: sidebarSection === 'insights' ? 'rgba(255,255,255,0.06)' : 'transparent',
              color: sidebarSection === 'insights' ? C.text : C.muted,
            }}
            onMouseEnter={e => { if (sidebarSection !== 'insights') e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
            onMouseLeave={e => { if (sidebarSection !== 'insights') e.currentTarget.style.background = 'transparent' }}
          >
            <IconBarChart color={sidebarSection === 'insights' ? C.amber : C.faint} />
            <span>Insights</span>
          </button>
        </nav>

        {/* Separador */}
        <div style={{ height: '1px', background: C.border, margin: '0 12px' }} />

        {/* Seção de filtros: Pessoas / Tags / Busca */}
        <nav className="px-2 pt-2 pb-2">
          <button
            onClick={() => setSidebarSection(sidebarSection === 'people' ? 'write' : 'people')}
            className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-md text-sm transition-colors mb-0.5"
            style={{
              background: sidebarSection === 'people' ? 'rgba(255,255,255,0.06)' : 'transparent',
              color: sidebarSection === 'people' ? C.text : C.muted,
            }}
            onMouseEnter={e => { if (sidebarSection !== 'people') e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
            onMouseLeave={e => { if (sidebarSection !== 'people') e.currentTarget.style.background = 'transparent' }}
          >
            <IconUsers color={sidebarSection === 'people' ? C.violet : C.faint} />
            <span>Pessoas</span>
          </button>

          <button
            onClick={() => setSidebarSection(sidebarSection === 'tags' ? 'write' : 'tags')}
            className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-md text-sm transition-colors mb-0.5"
            style={{
              background: sidebarSection === 'tags' ? 'rgba(255,255,255,0.06)' : 'transparent',
              color: sidebarSection === 'tags' ? C.text : C.muted,
            }}
            onMouseEnter={e => { if (sidebarSection !== 'tags') e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
            onMouseLeave={e => { if (sidebarSection !== 'tags') e.currentTarget.style.background = 'transparent' }}
          >
            <IconHash color={sidebarSection === 'tags' ? C.green : C.faint} />
            <span>Tags</span>
          </button>

          <button
            onClick={() => setSidebarSection(sidebarSection === 'search' ? 'write' : 'search')}
            className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-md text-sm transition-colors"
            style={{
              background: sidebarSection === 'search' ? 'rgba(255,255,255,0.06)' : 'transparent',
              color: sidebarSection === 'search' ? C.text : C.muted,
            }}
            onMouseEnter={e => { if (sidebarSection !== 'search') e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
            onMouseLeave={e => { if (sidebarSection !== 'search') e.currentTarget.style.background = 'transparent' }}
          >
            <IconSearch size={16} color={sidebarSection === 'search' ? C.muted : C.faint} />
            <span>Busca</span>
          </button>
        </nav>

        {/* Separador antes do conteúdo expandido */}
        <div style={{ height: '1px', background: C.border, margin: '0 12px' }} />

        {/* Conteúdo expandido conforme a seção ativa */}
        <div className="flex-1 overflow-y-auto">

          {/* Insights: heatmap + streak */}
          {sidebarSection === 'insights' && (
            <div className="p-3">
              {/* Rótulos de mês */}
              <div className="relative mb-1" style={{ height: '14px' }}>
                {monthLabels.map(({ weekIndex, label }) => (
                  <span
                    key={label + weekIndex}
                    className="absolute text-[9px] select-none"
                    style={{ left: `${weekIndex * 9}px`, color: C.faint, letterSpacing: '0.04em' }}
                  >{label}</span>
                ))}
              </div>

              {/* Grade do heatmap */}
              <div className="flex" style={{ gap: '2px' }}>
                {heatmapGrid.map((week, wi) => (
                  <div key={wi} className="flex flex-col" style={{ gap: '2px' }}>
                    {week.map(cell => (
                      <div
                        key={cell.date}
                        title={`${cell.date}: ${cell.count} bullet${cell.count !== 1 ? 's' : ''}`}
                        onClick={() => goToDay(cell.date)}
                        className="cursor-pointer rounded-[2px] transition-opacity hover:opacity-70"
                        style={{
                          width: '7px', height: '7px',
                          background: heatmapCellBg(cell.count),
                          boxShadow: cell.date === todayISO() ? `0 0 0 1px ${C.amber}` : 'none',
                        }}
                      />
                    ))}
                  </div>
                ))}
              </div>

              {/* Streak badge */}
              {streak > 0 && (
                <div className="mt-3 inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs"
                  style={{ background: C.amberDim, color: C.amber }}
                >
                  <span>🔥</span>
                  <span style={{ fontWeight: 500 }}>{streak} {streak === 1 ? 'dia' : 'dias'}</span>
                </div>
              )}
            </div>
          )}

          {/* Pessoas */}
          {sidebarSection === 'people' && (
            <div className="p-3">
              {people.length === 0 && (
                <p className="text-xs" style={{ color: C.faint }}>Nenhuma menção ainda.</p>
              )}
              <div className="flex flex-wrap gap-1.5">
                {people.map(p => (
                  <button
                    key={p.value}
                    onClick={() => { setSearchQuery(''); setMode({ type: 'filter', kind: 'person', value: p.value }) }}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-opacity hover:opacity-70"
                    style={{ background: 'rgba(167,139,250,0.12)', color: C.violet, border: `1px solid rgba(167,139,250,0.25)` }}
                  >
                    <span>@{p.value}</span>
                    <span style={{ color: C.faint, fontSize: '10px' }}>{p.count}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Tags */}
          {sidebarSection === 'tags' && (
            <div className="p-3">
              {tags.length === 0 && (
                <p className="text-xs" style={{ color: C.faint }}>Nenhuma tag ainda.</p>
              )}
              <div className="flex flex-wrap gap-1.5">
                {tags.map(t => (
                  <button
                    key={t.value}
                    onClick={() => { setSearchQuery(''); setMode({ type: 'filter', kind: 'tag', value: t.value }) }}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-opacity hover:opacity-70"
                    style={{ background: 'rgba(134,239,172,0.10)', color: C.green, border: `1px solid rgba(134,239,172,0.22)` }}
                  >
                    <span>#{t.value}</span>
                    <span style={{ color: C.faint, fontSize: '10px' }}>{t.count}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Busca */}
          {sidebarSection === 'search' && (
            <div className="p-3">
              <div className="relative">
                <div className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                  <IconSearch />
                </div>
                <input
                  type="text"
                  placeholder="Buscar…"
                  value={searchQuery}
                  autoFocus
                  onChange={e => {
                    const q = e.target.value
                    setSearchQuery(q)
                    if (q.trim().length >= 2) setMode({ type: 'search', query: q })
                    else if (q.trim() === '') setMode({ type: 'day', date: todayISO() })
                  }}
                  className="w-full text-sm pl-8 pr-3 py-1.5 rounded-md outline-none transition-colors"
                  style={{
                    background: '#161412', border: `1px solid ${C.border}`,
                    color: C.text, caretColor: C.amber,
                  }}
                  onFocus={e => { e.target.style.borderColor = C.amber }}
                  onBlur={e => { e.target.style.borderColor = C.border }}
                />
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}
