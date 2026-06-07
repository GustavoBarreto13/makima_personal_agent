// Página de diário pessoal — editor de bullets diário com heatmap anual,
// agrupamento de @menções e #tags, busca e filtragem por pessoa/tag.
// Fonte Lora (serif) para o conteúdo dos bullets; Cormorant Garamond para o título da data.

import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { api } from '../lib/api'

// ── Tipos de dados ─────────────────────────────────────────────────────────────────────────────

interface Bullet {
  id: number | null
  content: string
  position: number
  localKey: string
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
  }
}

type Mode =
  | { type: 'day'; date: string }
  | { type: 'filter'; kind: 'person' | 'tag'; value: string }
  | { type: 'search'; query: string }

// ── Prompts de sugestão para o primeiro bullet vazio ──────────────────────────────────────────

const PROMPTS = [
  'Como foi seu dia?',
  'O que você aprendeu hoje?',
  'Com quem você interagiu hoje?',
  'O que está na sua cabeça agora?',
]

// ── Funções auxiliares puras ───────────────────────────────────────────────────────────────────

/**
 * Retorna a data de hoje no formato YYYY-MM-DD, usando hora local para evitar bug de fuso.
 */
function todayISO(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Retorna o dia da semana em português maiúsculo, ex: "SEXTA-FEIRA".
 */
function weekdayPT(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('pt-BR', { weekday: 'long' }).toUpperCase()
}

/**
 * Retorna o dia + mês + ano em português, ex: "6 de junho de 2026".
 */
function dayMonthYearPT(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/**
 * Formata data completa em português, ex: "Sexta-feira, 6 de junho de 2026".
 */
function formatDatePT(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/**
 * Calcula quantos dias consecutivos o usuário escreveu no diário, contando para trás a partir de hoje.
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
 * Destaca @menções (violeta) e #tags (verde) no texto de um bullet.
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

function getInitialPosition(index: number): number {
  return index * 1000
}

function getMidPosition(prev: number, next: number): number {
  return Math.floor((prev + next) / 2)
}

// ── Componente principal ───────────────────────────────────────────────────────────────────────

/**
 * Página de diário pessoal com editor de bullets, heatmap anual âmbar e sidebar de menções.
 * Design "literary noir": fundo quente escuro, tipografia editorial, sensação de caderno real.
 */
export default function Journal() {
  // ── Estado principal ──
  const [mode, setMode] = useState<Mode>({ type: 'day', date: todayISO() })
  const [pageId, setPageId] = useState<number | null>(null)
  const [bullets, setBullets] = useState<Bullet[]>([])
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null)

  // ── Estado da sidebar ──
  const [heatmap, setHeatmap] = useState<Record<string, number>>({})
  const [streak, setStreak] = useState(0)
  const [people, setPeople] = useState<MentionItem[]>([])
  const [tags, setTags] = useState<MentionItem[]>([])

  // ── Estado de filtro/busca ──
  const [filterResults, setFilterResults] = useState<FilterGroup[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)

  // ── Refs ──
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pageIdRef = useRef<number | null>(null)

  const randomPrompt = useMemo(() => PROMPTS[Math.floor(Math.random() * PROMPTS.length)], [])
  const currentDate = mode.type === 'day' ? mode.date : ''
  const heatmapGrid = useMemo(() => buildHeatmapGrid(), [heatmap]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Funções auxiliares ──

  const refreshSidebar = useCallback(() => {
    const year = new Date().getFullYear()
    Promise.all([
      api.get<HeatmapResponse>(`/api/journal/heatmap?year=${year}`),
      api.get<MentionItem[]>('/api/journal/mentions?kind=person'),
      api.get<MentionItem[]>('/api/journal/mentions?kind=tag'),
    ]).then(([hm, p, t]) => {
      setHeatmap(hm)
      setStreak(calcStreak(hm))
      setPeople(p)
      setTags(t)
    }).catch(console.error)
  }, [])

  const saveBullet = useCallback(async (bullet: Bullet, pid: number) => {
    if (bullet.content === '' && bullet.id === null) return
    setSaveStatus('saving')
    try {
      const res = await api.post<UpsertResponse>('/api/journal/bullets', {
        page_id: pid,
        position: bullet.position,
        content: bullet.content,
      })
      setBullets(prev =>
        prev.map(b => b.localKey === bullet.localKey ? { ...b, id: res.bullet.id } : b)
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
      setHeatmap(hm)
      setStreak(calcStreak(hm))
      setPeople(p)
      setTags(t)
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
        pageIdRef.current = res.page.id
        if (res.bullets.length === 0) {
          setBullets([{ id: null, content: '', position: getInitialPosition(0), localKey: 'initial-0' }])
          setFocusedIndex(0)
        } else {
          setBullets(res.bullets.map(b => ({ ...b, localKey: `${b.id}-${b.position}` })))
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
    const newBullet: Bullet = { id: null, content: '', position: newPos, localKey: `new-${Date.now()}` }
    const newBullets = [...bullets.slice(0, index + 1), newBullet, ...bullets.slice(index + 1)]
    setBullets(newBullets)
    setFocusedIndex(index + 1)
    setSaveStatus('saving')
    try {
      const res = await api.post<UpsertResponse>('/api/journal/bullets', {
        page_id: pageId, position: newPos, content: '',
      })
      setBullets(prev => prev.map(b => b.localKey === newBullet.localKey ? { ...b, id: res.bullet.id } : b))
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

  // ── Heatmap ──

  /**
   * Constrói a grade do heatmap: 52 semanas × 7 dias.
   * Também calcula os rótulos de mês para exibir acima da grade.
   */
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

  /**
   * Calcula os rótulos de mês para o heatmap.
   * Retorna um array com o índice da semana e o nome do mês abreviado (quando muda o mês).
   */
  function buildMonthLabels(): { weekIndex: number; label: string }[] {
    const labels: { weekIndex: number; label: string }[] = []
    const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
    let lastMonth = -1
    heatmapGrid.forEach((week, wi) => {
      const m = new Date(week[0].date + 'T12:00:00').getMonth()
      if (m !== lastMonth) {
        labels.push({ weekIndex: wi, label: MESES[m] })
        lastMonth = m
      }
    })
    return labels
  }

  /**
   * Retorna a cor de fundo âmbar/sépia para a célula do heatmap conforme a contagem de bullets.
   */
  function heatmapCellColor(count: number, date: string): string {
    const isToday = date === todayISO()
    // Tons âmbar/sépia: inativo → dourado intenso
    const bg =
      count === 0  ? '#1a1917' :
      count <= 2   ? '#44372b' :
      count <= 5   ? '#7a5c38' :
      count <= 9   ? '#b8843f' : '#d4a055'

    // Anel âmbar para o dia de hoje
    const ring = isToday ? 'box-shadow: 0 0 0 1px #c9a96e;' : ''

    return `background:${bg};${ring}`
  }

  const monthLabels = useMemo(() => buildMonthLabels(), [heatmapGrid]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Paleta de cores (centralizada como constantes inline para facilitar manutenção) ──
  const C = {
    bg:         '#0e0d0b',  // fundo principal
    sidebar:    '#111009',  // fundo da sidebar
    border:     '#2a2825',  // bordas e divisores
    text:       '#f0ebe0',  // texto principal (creme quente)
    muted:      '#9a9185',  // texto secundário
    faint:      '#4a4540',  // placeholder, sugestões
    amber:      '#c9a96e',  // acento âmbar (hover, hoje, streak)
    amberDim:   '#7a5c38',  // âmbar mais escuro para fundo de badge
    violet:     '#a78bfa',  // @pessoas
    green:      '#86efac',  // #tags
  }

  // ── Renderização ───────────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full -m-6" style={{ fontFamily: "'DM Sans', sans-serif" }}>

      {/* ── Sidebar ── */}
      <aside
        className="w-72 shrink-0 flex flex-col overflow-y-auto"
        style={{ background: C.sidebar, borderRight: `1px solid ${C.border}` }}
      >

        {/* Heatmap anual */}
        <div className="p-4 pb-3">

          {/* Rótulos de mês — posicionados relativamente ao grid */}
          <div className="relative mb-1" style={{ height: '14px' }}>
            {monthLabels.map(({ weekIndex, label }) => (
              <span
                key={label + weekIndex}
                className="absolute text-[10px] select-none"
                style={{
                  left: `${weekIndex * 9}px`,  // cada semana ocupa ~9px (7px célula + 2px gap)
                  color: C.faint,
                  letterSpacing: '0.04em',
                }}
              >
                {label}
              </span>
            ))}
          </div>

          {/* Grade de semanas × dias */}
          <div className="flex" style={{ gap: '2px' }}>
            {heatmapGrid.map((week, wi) => (
              <div key={wi} className="flex flex-col" style={{ gap: '2px' }}>
                {week.map(cell => (
                  <div
                    key={cell.date}
                    title={`${cell.date}: ${cell.count} bullet${cell.count !== 1 ? 's' : ''}`}
                    onClick={() => setMode({ type: 'day', date: cell.date })}
                    className="cursor-pointer rounded-[2px] transition-opacity hover:opacity-70"
                    style={{
                      width: '7px',
                      height: '7px',
                      ...Object.fromEntries(
                        heatmapCellColor(cell.count, cell.date)
                          .split(';')
                          .filter(Boolean)
                          .map(s => {
                            const [k, ...v] = s.split(':')
                            // Converte "background" → "background" e "box-shadow" → "boxShadow"
                            const key = k.trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase())
                            return [key, v.join(':').trim()]
                          })
                      ),
                    }}
                  />
                ))}
              </div>
            ))}
          </div>

          {/* Badge de streak */}
          {streak > 0 && (
            <div className="mt-3 inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs"
              style={{ background: C.amberDim, color: C.amber }}
            >
              <span>🔥</span>
              <span style={{ fontWeight: 500 }}>{streak} {streak === 1 ? 'dia seguido' : 'dias seguidos'}</span>
            </div>
          )}
        </div>

        {/* Divisor */}
        <div style={{ height: '1px', background: C.border, margin: '0 16px' }} />

        {/* @Pessoas */}
        {people.length > 0 && (
          <div className="px-4 py-3">
            <p className="text-[10px] uppercase tracking-widest mb-2" style={{ color: C.faint }}>
              Pessoas
            </p>
            {/* Pills inline de menções */}
            <div className="flex flex-wrap gap-1.5">
              {people.map(p => (
                <button
                  key={p.value}
                  onClick={() => { setSearchQuery(''); setMode({ type: 'filter', kind: 'person', value: p.value }) }}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-opacity hover:opacity-70"
                  style={{
                    background: 'rgba(167,139,250,0.12)',
                    color: C.violet,
                    border: '1px solid rgba(167,139,250,0.25)',
                  }}
                >
                  <span>@{p.value}</span>
                  <span style={{ color: C.faint, fontSize: '10px' }}>{p.count}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* #Tags */}
        {tags.length > 0 && (
          <div className="px-4 pb-3">
            <p className="text-[10px] uppercase tracking-widest mb-2" style={{ color: C.faint }}>
              Tags
            </p>
            <div className="flex flex-wrap gap-1.5">
              {tags.map(t => (
                <button
                  key={t.value}
                  onClick={() => { setSearchQuery(''); setMode({ type: 'filter', kind: 'tag', value: t.value }) }}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-opacity hover:opacity-70"
                  style={{
                    background: 'rgba(134,239,172,0.10)',
                    color: C.green,
                    border: '1px solid rgba(134,239,172,0.22)',
                  }}
                >
                  <span>#{t.value}</span>
                  <span style={{ color: C.faint, fontSize: '10px' }}>{t.count}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Busca — fixada no rodapé da sidebar */}
        <div className="mt-auto px-4 py-4" style={{ borderTop: `1px solid ${C.border}` }}>
          <div className="relative">
            {/* Ícone de lupa */}
            <svg
              className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
              width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke={C.faint} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              placeholder="Buscar…"
              value={searchQuery}
              onChange={e => {
                const q = e.target.value
                setSearchQuery(q)
                if (q.trim().length >= 2) setMode({ type: 'search', query: q })
                else if (q.trim() === '') setMode({ type: 'day', date: todayISO() })
              }}
              className="w-full text-sm pl-8 pr-3 py-1.5 rounded-md outline-none transition-colors"
              style={{
                background: '#1a1917',
                border: `1px solid ${C.border}`,
                color: C.text,
                caretColor: C.amber,
              }}
              onFocus={e => { e.target.style.borderColor = C.amber }}
              onBlur={e => { e.target.style.borderColor = C.border }}
            />
          </div>
        </div>
      </aside>

      {/* ── Área principal do editor ── */}
      <main
        className="flex-1 overflow-y-auto relative journal-grain"
        style={{ background: C.bg }}
      >

        {/* Indicador de save — ponto colorido no canto sup-direito */}
        <div className="absolute top-5 right-6 flex items-center gap-1.5 select-none z-10">
          {saveStatus === 'saving' && (
            <>
              <span
                className="inline-block w-1.5 h-1.5 rounded-full animate-pulse"
                style={{ background: C.amber }}
              />
              <span className="text-xs" style={{ color: C.muted }}>salvando</span>
            </>
          )}
          {saveStatus === 'saved' && (
            <>
              <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: '#86efac' }} />
              <span className="text-xs" style={{ color: C.faint }}>salvo</span>
            </>
          )}
        </div>

        <div className="max-w-2xl mx-auto px-10 py-12 relative z-10">

          {/* ── Modo 'day': editor de bullets ── */}
          {mode.type === 'day' && (
            <>
              {/* Cabeçalho editorial da data */}
              <div className="mb-10">

                {/* Linha 1: dia da semana + navegação */}
                <div className="flex items-center gap-3 mb-1">
                  <span
                    className="text-[11px] tracking-[0.18em] uppercase select-none"
                    style={{ color: C.muted }}
                  >
                    {weekdayPT(mode.date)}
                  </span>

                  {/* Botões de navegação de dia */}
                  <div className="ml-auto flex items-center gap-1">
                    <button
                      onClick={() => navigateDay(-1)}
                      className="px-2 py-0.5 rounded transition-colors text-base leading-none"
                      style={{ color: C.faint }}
                      onMouseEnter={e => (e.currentTarget.style.color = C.text)}
                      onMouseLeave={e => (e.currentTarget.style.color = C.faint)}
                      aria-label="Dia anterior"
                    >
                      ‹
                    </button>
                    <button
                      onClick={() => navigateDay(1)}
                      className="px-2 py-0.5 rounded transition-colors text-base leading-none"
                      style={{ color: C.faint }}
                      onMouseEnter={e => (e.currentTarget.style.color = C.text)}
                      onMouseLeave={e => (e.currentTarget.style.color = C.faint)}
                      aria-label="Próximo dia"
                    >
                      ›
                    </button>
                    {mode.date !== todayISO() && (
                      <button
                        onClick={() => setMode({ type: 'day', date: todayISO() })}
                        className="ml-1 text-xs px-2 py-0.5 rounded transition-colors"
                        style={{ color: C.amber }}
                        onMouseEnter={e => (e.currentTarget.style.opacity = '0.7')}
                        onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                      >
                        hoje
                      </button>
                    )}
                  </div>
                </div>

                {/* Linha 2: data completa em Cormorant Garamond — o elemento editorial central */}
                <h1
                  className="leading-none"
                  style={{
                    fontFamily: "'Cormorant Garamond', serif",
                    fontSize: 'clamp(2.2rem, 5vw, 3.2rem)',
                    fontWeight: 300,
                    color: C.text,
                    letterSpacing: '-0.01em',
                  }}
                >
                  {dayMonthYearPT(mode.date)}
                </h1>

                {/* Divisor fino sob o título */}
                <div className="mt-6" style={{ height: '1px', background: C.border }} />
              </div>

              {/* Spinner de carregamento */}
              {loading && (
                <div className="flex justify-center py-16">
                  <div
                    className="w-5 h-5 rounded-full border-2 animate-spin"
                    style={{ borderColor: C.border, borderTopColor: C.amber }}
                  />
                </div>
              )}

              {/* Editor de bullets */}
              {!loading && (
                <div className="space-y-0.5">
                  {bullets.map((bullet, index) => (
                    <div
                      key={bullet.localKey}
                      className="flex items-start gap-3 group rounded-md px-2 py-0.5 -mx-2 transition-colors"
                      style={{ background: focusedIndex === index ? '#161512' : 'transparent' }}
                      onMouseEnter={e => {
                        if (focusedIndex !== index) e.currentTarget.style.background = '#161512'
                      }}
                      onMouseLeave={e => {
                        if (focusedIndex !== index) e.currentTarget.style.background = 'transparent'
                      }}
                    >
                      {/* Marcador vertical — traço fino âmbar em foco, discreto normalmente */}
                      <span
                        className="mt-[0.45em] shrink-0 select-none transition-colors"
                        style={{
                          color: focusedIndex === index ? C.amber : C.border,
                          fontSize: '18px',
                          lineHeight: 1,
                          fontFamily: 'monospace',
                        }}
                      >
                        ▎
                      </span>

                      {/* Input ativo quando em foco */}
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
                          placeholder={
                            index === 0 && bullets.length === 1 && bullet.content === ''
                              ? randomPrompt : ''
                          }
                          className="flex-1 bg-transparent border-none outline-none"
                          style={{
                            fontFamily: "'Lora', serif",
                            fontSize: '1.15rem',
                            lineHeight: 1.85,
                            color: C.text,
                            caretColor: C.amber,
                          }}
                        />
                      ) : (
                        // Visualização com @menções e #tags destacadas
                        <div
                          onClick={() => setFocusedIndex(index)}
                          className="flex-1 cursor-text"
                          style={{
                            fontFamily: "'Lora', serif",
                            fontSize: '1.15rem',
                            lineHeight: 1.85,
                            color: C.text,
                            minHeight: '1.85rem',
                          }}
                        >
                          {bullet.content
                            ? renderHighlighted(bullet.content)
                            : <span style={{ color: C.faint }}>{index === 0 ? randomPrompt : ''}</span>
                          }
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Dica de teclado — visível só no último bullet em foco */}
                  {focusedIndex === bullets.length - 1 && bullets.length > 0 && (
                    <p className="text-xs ml-7 mt-2" style={{ color: C.faint }}>
                      Enter para nova linha · Backspace em linha vazia para deletar
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          {/* ── Modo 'filter' ou 'search': resultados agrupados por data ── */}
          {(mode.type === 'filter' || mode.type === 'search') && (
            <>
              {/* Cabeçalho do filtro */}
              <div className="mb-10">
                <div className="flex items-center gap-3 mb-1">
                  <button
                    onClick={() => { setSearchQuery(''); setMode({ type: 'day', date: todayISO() }) }}
                    className="text-xs transition-opacity hover:opacity-60"
                    style={{ color: C.muted }}
                  >
                    ← voltar
                  </button>
                </div>

                <h1
                  className="leading-none"
                  style={{
                    fontFamily: "'Cormorant Garamond', serif",
                    fontSize: 'clamp(1.8rem, 4vw, 2.6rem)',
                    fontWeight: 300,
                    color: C.text,
                  }}
                >
                  {mode.type === 'filter' && (
                    <>
                      {mode.kind === 'person'
                        ? <span style={{ color: C.violet }}>@{mode.value}</span>
                        : <span style={{ color: C.green }}>#{mode.value}</span>
                      }
                      <span style={{ color: C.muted, fontSize: '60%', marginLeft: '0.5em' }}>
                        {filterResults.reduce((acc, g) => acc + g.bullets.length, 0)} menções
                      </span>
                    </>
                  )}
                  {mode.type === 'search' && (
                    <span>"{mode.query}"</span>
                  )}
                </h1>

                <div className="mt-5" style={{ height: '1px', background: C.border }} />
              </div>

              {/* Estado vazio */}
              {filterResults.length === 0 && (
                <p className="text-sm py-12 text-center" style={{ color: C.faint }}>
                  Nenhum resultado encontrado.
                </p>
              )}

              {/* Grupos por data */}
              {filterResults.map(group => (
                <div key={group.date} className="mb-8">
                  {/* Data do grupo — clicável para ir ao dia completo */}
                  <button
                    onClick={() => { setSearchQuery(''); setMode({ type: 'day', date: group.date }) }}
                    className="text-[11px] uppercase tracking-widest mb-3 transition-opacity hover:opacity-60"
                    style={{ color: C.amber }}
                  >
                    {formatDatePT(group.date)}
                  </button>

                  <div className="space-y-0.5">
                    {group.bullets.map(b => (
                      <div key={b.id} className="flex items-start gap-3">
                        <span
                          className="mt-[0.45em] shrink-0 select-none"
                          style={{ color: C.border, fontSize: '18px', lineHeight: 1, fontFamily: 'monospace' }}
                        >
                          ▎
                        </span>
                        <div
                          style={{
                            fontFamily: "'Lora', serif",
                            fontSize: '1.05rem',
                            lineHeight: 1.85,
                            color: C.text,
                          }}
                        >
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
    </div>
  )
}
