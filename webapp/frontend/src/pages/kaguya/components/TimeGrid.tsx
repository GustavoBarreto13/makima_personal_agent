// TimeGrid — grid de 24h para as views Dia e Semana (fatia 019, T012/T023/T024).
// Estrutura: cabeçalho de dias sticky → faixa all-day sticky → grid scrollável com gutter.
// Interações (T023): mover/redimensionar/criar por pointer; (T024): drop de time-blocking.
// Editabilidade por fonte: só "kaguya" e "gcal" movem/redimensionam; cross-agent é read-only.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CalEvent, Calendar } from '../types'
import { kaguyaApi } from '../kaguyaApi'

// ── Helpers de data ─────────────────────────────────────────────────────────

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Converte string ISO datetime (ou "HH:MM") em minutos desde meia-noite.
function timeToMin(t: string | null | undefined): number {
  if (!t) return 0
  const part = t.includes('T') ? t.split('T')[1] : t
  const [h, m] = part.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

// Converte minutos desde meia-noite em string "HH:MM".
function minToLabel(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// Snap para o múltiplo de 15 min mais próximo.
function snapTo15(min: number): number {
  return Math.round(min / 15) * 15
}

// Monta uma string ISO datetime a partir de um dia (YYYY-MM-DD) e minutos.
function buildISO(day: string, min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${day}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`
}

// Abreviações de dia da semana em pt-BR.
const WEEKDAY_ABBR: Record<number, string> = {
  0: 'Dom', 1: 'Seg', 2: 'Ter', 3: 'Qua', 4: 'Qui', 5: 'Sex', 6: 'Sáb',
}

// Fontes editáveis: só kaguya e gcal permitem mover/resize/criar.
const EDITABLE = new Set(['kaguya', 'gcal'])

// ── Algoritmo de lane (sobreposição) ────────────────────────────────────────

interface LanedEvent {
  ev: CalEvent
  lane: number
  totalLanes: number
  startMin: number
  endMin: number
}

function assignLanes(events: CalEvent[]): LanedEvent[] {
  const timed = events
    .filter((e) => e.start && !e.allDay)
    .map((e) => ({
      ev: e,
      startMin: timeToMin(e.start),
      endMin: e.end ? timeToMin(e.end) : timeToMin(e.start) + 30,
      lane: 0,
      totalLanes: 1,
    }))
  timed.sort((a, b) => a.startMin - b.startMin)

  const result: LanedEvent[] = []
  let group: typeof timed = []

  for (const item of timed) {
    const groupEnd = group.length > 0 ? Math.max(...group.map((g) => g.endMin)) : 0
    if (group.length === 0 || item.startMin < groupEnd) {
      item.lane = group.length
      group.push(item)
    } else {
      const total = group.length
      for (const g of group) g.totalLanes = total
      result.push(...group)
      group = [item]
      item.lane = 0
    }
  }
  if (group.length > 0) {
    const total = group.length
    for (const g of group) g.totalLanes = total
    result.push(...group)
  }
  return result
}

// Cor do evento: própria > calendário > fallback.
function resolveColor(ev: CalEvent, cals: Calendar[]): string {
  if (ev.color) return ev.color
  return cals.find((c) => c.id === ev.cal)?.color ?? 'var(--ink-3)'
}

// Adiciona transparência a uma cor, suportando OKLCH e hex.
// OKLCH: oklch(L C H) → oklch(L C H / alpha)
// Hex:   #rrggbb     → #rrggbbXX  (alpha como dois dígitos hex)
// CSS var(--foo): retorna a cor sem alpha (variáveis não suportam essa operação)
function withAlpha(color: string, alpha: number): string {
  if (color.startsWith('oklch(')) {
    // Insere "/ alpha" antes do ")" final
    return color.replace(')', ` / ${alpha})`)
  }
  if (color.startsWith('#')) {
    // Converte 0..1 para dois dígitos hexadecimais (00..FF)
    const hex = Math.round(alpha * 255).toString(16).padStart(2, '0')
    return color + hex
  }
  // Fallback para variáveis CSS ou outros formatos: sem alpha
  return color
}

// ── Props ────────────────────────────────────────────────────────────────────

interface TimeGridProps {
  days: string[]
  events: CalEvent[]
  cals: Calendar[]
  // Clique num evento (sem arrastar) — o pai decide o que fazer (popover, TaskModal, etc.)
  onEventClick: (ev: CalEvent, clientPos: { x: number; y: number }) => void
  // Clique-direito num evento — abre o ContextMenu
  onEventContextMenu?: (ev: CalEvent, pos: { x: number; y: number }) => void
  // Drag-drop de TrayCard: taskId + drop pos → time-block
  onTimeDrop?: (taskId: number, day: string, startISO: string) => void
  // Grid criou novo slot arrastando (para kaguya: criar tarefa; para gcal: criar evento)
  onCreateSlot?: (day: string, startISO: string, endISO: string) => void
  // Chamado após mover/resize para que o pai recarregue
  onRefresh?: () => void
}

// ── Estado de drag interno ────────────────────────────────────────────────────
// Guardado em refs (não state) para não causar re-render durante o arrastar.

type DragMode = 'move' | 'resize' | 'create'

interface DragState {
  mode: DragMode
  ev?: CalEvent          // evento sendo movido/redimensionado (undefined para create)
  startY: number         // Y do pointerdown (para detectar clique vs drag)
  startX: number
  originMin: number      // minuto de início no pointerdown (para move: offset interno)
  originDay: string      // dia de origem
  colEl: HTMLElement     // elemento da coluna (para calcular posição relativa)
  offsetMin: number      // offset entre o topo do evento e onde o usuário clicou (move)
  ghost?: HTMLElement    // elemento fantasma DOM criado durante o drag
  dragging: boolean      // true depois de mover ≥4px
}

// ── Componente ───────────────────────────────────────────────────────────────

export function TimeGrid({
  days,
  events,
  cals,
  onEventClick,
  onEventContextMenu,
  onTimeDrop,
  onCreateSlot,
  onRefresh,
}: TimeGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)

  // Estado de ghost visível (mínimo para forçar re-render ao iniciar/parar drag)
  const [ghostInfo, setGhostInfo] = useState<{
    day: string; startMin: number; endMin: number
    left: string; width: string
  } | null>(null)

  const todayISO = toISO(new Date())
  const ncols = days.length
  const now = new Date()
  const nowMin = now.getHours() * 60 + now.getMinutes()

  // Auto-scroll para ~07:00 na montagem
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 7 * 52
  }, [])

  // ── Utilitários de coordenada ─────────────────────────────────────────────

  // Retorna a coluna (elemento DOM) e o dia (string) correspondentes a clientX.
  const colFromX = useCallback((clientX: number): { colEl: HTMLElement; day: string } | null => {
    if (!gridRef.current) return null
    // Cada cg-col é absoluta (position: relative dentro do cal-grid)
    const cols = gridRef.current.querySelectorAll<HTMLElement>('.cg-col')
    for (let i = 0; i < cols.length; i++) {
      const rect = cols[i].getBoundingClientRect()
      if (clientX >= rect.left && clientX <= rect.right) {
        return { colEl: cols[i], day: days[i] }
      }
    }
    return null
  }, [days])

  // Converte clientY em minutos desde meia-noite dentro de uma coluna.
  // Compensação de escala: rect.height / offsetHeight (para zoom ou transform CSS).
  const yToMin = useCallback((clientY: number, colEl: HTMLElement): number => {
    const rect = colEl.getBoundingClientRect()
    const scale = rect.height / colEl.offsetHeight
    const relY = (clientY - rect.top) / scale
    const totalHeight = colEl.offsetHeight   // 24h em px
    return (relY / totalHeight) * 1440
  }, [])

  // ── Pointer events para mover/redimensionar ───────────────────────────────

  const onEventPointerDown = useCallback((
    e: React.PointerEvent<HTMLDivElement>,
    ev: CalEvent,
    mode: 'move' | 'resize',
    startMin: number,
    _endMin: number,
    day: string,
  ) => {
    // Só editáveis podem ser movidos/redimensionados
    if (!EDITABLE.has(ev.cal)) return

    e.preventDefault()
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)

    const colInfo = colFromX(e.clientX)
    if (!colInfo) return

    dragRef.current = {
      mode,
      ev,
      startY: e.clientY,
      startX: e.clientX,
      originMin: startMin,
      originDay: day,
      colEl: colInfo.colEl,
      // Para "move": preserva o offset entre o topo do evento e onde o usuário clicou
      offsetMin: mode === 'move' ? (yToMin(e.clientY, colInfo.colEl) - startMin) : 0,
      dragging: false,
    }
  }, [colFromX, yToMin])

  // Pointer move: atualiza o fantasma
  const onGridPointerMove = useCallback((e: PointerEvent) => {
    const d = dragRef.current
    if (!d || d.mode === 'create') return

    // Inicia o drag após mover ≥ 4px para distinguir de clique
    const moved = Math.abs(e.clientY - d.startY) + Math.abs(e.clientX - d.startX)
    if (!d.dragging && moved < 4) return
    d.dragging = true

    const colInfo = colFromX(e.clientX)
    if (!colInfo) return

    const rawMin = yToMin(e.clientY, colInfo.colEl)
    const duration = d.mode === 'move'
      ? ((d.ev?.end ? timeToMin(d.ev.end) : d.originMin + 30) - d.originMin)
      : 0   // resize: duração não é fixa

    let snapMin: number
    if (d.mode === 'move') {
      // Move: calcula novo início subtraindo o offset interno
      snapMin = snapTo15(rawMin - d.offsetMin)
    } else {
      // Resize: só o fim muda
      snapMin = d.originMin  // startMin fica fixo no resize
    }

    const endMin = d.mode === 'move'
      ? snapMin + duration
      : Math.max(d.originMin + 15, snapTo15(rawMin))  // mínimo 15min

    // Identifica a coluna visual para posicionar o fantasma
    const colIdx = days.indexOf(colInfo.day)
    const leftPct = (colIdx / ncols) * 100
    const widthPct = 100 / ncols

    setGhostInfo({
      day: colInfo.day,
      startMin: d.mode === 'move' ? snapMin : d.originMin,
      endMin,
      left: `calc(var(--gutter) + ${leftPct}%)`,
      width: `${widthPct}%`,
    })
  }, [colFromX, yToMin, days, ncols])

  // Pointer up: commita a mudança
  const onGridPointerUp = useCallback(async (e: PointerEvent) => {
    const d = dragRef.current
    dragRef.current = null
    setGhostInfo(null)

    if (!d || !d.dragging) {
      // Foi um clique simples — o onClick do evento tratará
      return
    }

    if (!d.ev) return

    const colInfo = colFromX(e.clientX)
    const targetDay = colInfo?.day ?? d.originDay
    const rawMin = colInfo ? yToMin(e.clientY, colInfo.colEl) : d.originMin

    const duration = (d.ev.end ? timeToMin(d.ev.end) : d.originMin + 30) - d.originMin

    let newStartMin: number
    let newEndMin: number

    if (d.mode === 'move') {
      newStartMin = snapTo15(rawMin - d.offsetMin)
      newEndMin = newStartMin + duration
    } else {
      // resize: só o fim muda
      newStartMin = d.originMin
      newEndMin = Math.max(newStartMin + 15, snapTo15(rawMin))
    }

    const newStartISO = buildISO(targetDay, newStartMin)
    const newEndISO = buildISO(targetDay, newEndMin)

    try {
      if (d.ev.cal === 'kaguya' && d.ev.taskId) {
        // Se o dia mudou, atualiza due_date separadamente (updateTask não aceita start_at).
        if (targetDay !== d.originDay) {
          await kaguyaApi.updateTask(d.ev.taskId, { due_date: targetDay })
        }
        // Grava o bloco de tempo (start_at + end_at) via endpoint dedicado.
        await kaguyaApi.setTimeBlock(d.ev.taskId, { start_at: newStartISO, end_at: newEndISO })
      } else if (d.ev.cal === 'gcal') {
        await kaguyaApi.updateCalendarEvent(d.ev.id, {
          start: newStartISO,
          end: newEndISO,
          day: targetDay,
        })
      }
      onRefresh?.()
    } catch { /* evento volta à posição original — o grid não re-renderiza */ }
  }, [colFromX, yToMin, onRefresh])

  // Registra os listeners globais de pointer (para capturar fora da coluna)
  useEffect(() => {
    const el = gridRef.current
    if (!el) return
    el.addEventListener('pointermove', onGridPointerMove)
    el.addEventListener('pointerup', onGridPointerUp)
    return () => {
      el.removeEventListener('pointermove', onGridPointerMove)
      el.removeEventListener('pointerup', onGridPointerUp)
    }
  }, [onGridPointerMove, onGridPointerUp])

  // ── Pointer events para criar arrastando área vazia ───────────────────────

  const onColPointerDown = useCallback((
    e: React.PointerEvent<HTMLDivElement>,
    day: string,
    colEl: HTMLElement,
  ) => {
    // Só inicia criação se o clique foi diretamente na coluna (não em evento filho)
    if ((e.target as HTMLElement).closest('.cg-event')) return
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)

    const startMin = snapTo15(yToMin(e.clientY, colEl))

    dragRef.current = {
      mode: 'create',
      startY: e.clientY,
      startX: e.clientX,
      originMin: startMin,
      originDay: day,
      colEl,
      offsetMin: 0,
      dragging: false,
    }
  }, [yToMin])

  const onColPointerMove = useCallback((
    e: React.PointerEvent<HTMLDivElement>,
    day: string,
    colIdx: number,
  ) => {
    const d = dragRef.current
    if (!d || d.mode !== 'create') return

    const moved = Math.abs(e.clientY - d.startY)
    if (!d.dragging && moved < 4) return
    d.dragging = true

    const rawMin = yToMin(e.clientY, d.colEl)
    const endMin = Math.max(d.originMin + 30, snapTo15(rawMin))   // mínimo 30min ao criar

    setGhostInfo({
      day,
      startMin: d.originMin,
      endMin,
      left: `calc(var(--gutter) + ${(colIdx / ncols) * 100}%)`,
      width: `${100 / ncols}%`,
    })
  }, [yToMin, ncols])

  const onColPointerUp = useCallback((
    e: React.PointerEvent<HTMLDivElement>,
    day: string,
  ) => {
    const d = dragRef.current
    if (!d || d.mode !== 'create') return
    dragRef.current = null
    setGhostInfo(null)

    if (!d.dragging) return   // clique simples na coluna — nada a criar

    const rawMin = yToMin(e.clientY, d.colEl)
    const endMin = Math.max(d.originMin + 30, snapTo15(rawMin))

    const startISO = buildISO(day, d.originMin)
    const endISO = buildISO(day, endMin)
    onCreateSlot?.(day, startISO, endISO)
  }, [yToMin, onCreateSlot])

  // ── Drag-drop de time-blocking (TrayCard → coluna) ───────────────────────

  const onColDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    // Aceita somente drags que contêm um taskId (TrayCard)
    if (e.dataTransfer.types.includes('text/task-id')) {
      e.preventDefault()   // permite o drop
      e.dataTransfer.dropEffect = 'move'
    }
  }, [])

  const onColDrop = useCallback((
    e: React.DragEvent<HTMLDivElement>,
    day: string,
    colEl: HTMLElement,
  ) => {
    e.preventDefault()
    const taskIdStr = e.dataTransfer.getData('text/task-id')
    if (!taskIdStr) return

    const taskId = parseInt(taskIdStr, 10)
    const dropMin = snapTo15(yToMin(e.clientY, colEl))
    const startISO = buildISO(day, dropMin)

    onTimeDrop?.(taskId, day, startISO)
  }, [yToMin, onTimeDrop])

  // ── Indexa eventos por dia ────────────────────────────────────────────────
  const byDay: Record<string, CalEvent[]> = {}
  for (const ev of events) {
    if (!ev.day) continue
    if (!byDay[ev.day]) byDay[ev.day] = []
    byDay[ev.day].push(ev)
  }

  const hours = Array.from({ length: 24 }, (_, i) => i)

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="calx" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Cabeçalho de dias (sticky) */}
      <div className="cal-dayhead" style={{ gridTemplateColumns: `repeat(${ncols}, 1fr)` }}>
        <div className="cal-tz" style={{ position: 'absolute', left: 0, bottom: 4, width: 'var(--gutter)', textAlign: 'center' }}>
          BRT
        </div>
        {days.map((iso) => {
          const d = new Date(iso + 'T00:00:00')
          return (
            <div key={iso} className={`cal-dayhead-cell${iso === todayISO ? ' today' : ''}`}>
              <div className="cal-day-abbr">{WEEKDAY_ABBR[d.getDay()]}</div>
              <div className="cal-day-num">{d.getDate()}</div>
            </div>
          )
        })}
      </div>

      {/* Faixa all-day (sticky) */}
      <div className="cal-allday" style={{ gridTemplateColumns: `repeat(${ncols}, 1fr)` }}>
        {days.map((iso) => {
          const allDayEvs = (byDay[iso] ?? []).filter((e) => e.allDay || !e.start)
          return (
            <div key={iso} style={{ minHeight: 28 }}>
              {allDayEvs.map((ev) => {
                const color = resolveColor(ev, cals)
                return (
                  <div
                    key={ev.id}
                    className="cad-pill"
                    style={{ backgroundColor: withAlpha(color, 0.2), color }}
                    onClick={(e) => onEventClick(ev, { x: e.clientX, y: e.clientY })}
                    onContextMenu={(e) => { e.preventDefault(); onEventContextMenu?.(ev, { x: e.clientX, y: e.clientY }) }}
                    title={ev.title}
                  >
                    {ev.title}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      {/* Grid scrollável de 24h */}
      <div className="cal-scroll" ref={scrollRef}>
        <div
          ref={gridRef}
          className="cal-grid"
          style={{ gridTemplateColumns: `var(--gutter) repeat(${ncols}, 1fr)`, position: 'relative' }}
        >
          {/* Gutter de horas */}
          <div className="cal-gutter">
            {hours.map((h) => (
              <div key={h} className="cal-gutter-label">
                {h === 0 ? '' : `${String(h).padStart(2, '0')}:00`}
              </div>
            ))}
          </div>

          {/* Colunas de dia */}
          {days.map((iso, colIdx) => {
            const isToday = iso === todayISO
            const dayEvs = byDay[iso] ?? []
            const laned = assignLanes(dayEvs)
            const timedLaned = laned.filter((le) => !le.ev.allDay && le.ev.start)

            return (
              <div
                key={iso}
                className={`cg-col${isToday ? ' today' : ''}`}
                style={{ position: 'relative', height: '100%', gridColumn: colIdx + 2 }}
                // Arrastar área vazia → criar evento
                onPointerDown={(e) => onColPointerDown(e, iso, e.currentTarget)}
                onPointerMove={(e) => onColPointerMove(e, iso, colIdx)}
                onPointerUp={(e) => onColPointerUp(e, iso)}
                // Drag-drop de TrayCard
                onDragOver={onColDragOver}
                onDrop={(e) => onColDrop(e, iso, e.currentTarget)}
              >
                {/* Linha "agora" na coluna de hoje */}
                {isToday && (
                  <div
                    className="cg-now"
                    style={{ top: `${(nowMin / 1440) * 100}%` }}
                    aria-label={`Agora: ${minToLabel(nowMin)}`}
                  />
                )}

                {/* Eventos timed */}
                {timedLaned.map(({ ev, lane, totalLanes, startMin, endMin }) => {
                  const color = resolveColor(ev, cals)
                  const duration = endMin - startMin
                  const topPct = (startMin / 1440) * 100
                  const heightPct = Math.max((duration / 1440) * 100, 2)
                  const leftPct = (lane / totalLanes) * 100
                  const widthCalc = `calc(${100 / totalLanes}% - 2px)`
                  const bgColor = withAlpha(color, 0.8)
                  const isEditable = EDITABLE.has(ev.cal)

                  return (
                    <div
                      key={ev.id}
                      className={['cg-event', ev.kind === 'task' ? 'task' : '', duration <= 30 ? 'tiny' : ''].filter(Boolean).join(' ')}
                      style={{
                        top: `${topPct}%`,
                        height: `${heightPct}%`,
                        left: `${leftPct}%`,
                        width: widthCalc,
                        backgroundColor: bgColor,
                        color: 'white',
                        borderColor: color,
                        cursor: isEditable ? 'grab' : 'default',
                      }}
                      onClick={(e) => {
                        // Só dispara onClick se não houve drag (dragRef já foi nulificado)
                        if (!dragRef.current?.dragging) {
                          onEventClick(ev, { x: e.clientX, y: e.clientY })
                        }
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        onEventContextMenu?.(ev, { x: e.clientX, y: e.clientY })
                      }}
                      // Inicia drag de mover
                      onPointerDown={isEditable ? (e) => onEventPointerDown(e, ev, 'move', startMin, endMin, iso) : undefined}
                      title={`${minToLabel(startMin)}–${minToLabel(endMin)} · ${ev.title}`}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ev.title}
                      </span>
                      {/* Alça de resize — só para fontes editáveis */}
                      {isEditable && (
                        <div
                          className="cg-resize"
                          onPointerDown={(e) => {
                            e.stopPropagation()
                            onEventPointerDown(e, ev, 'resize', startMin, endMin, iso)
                          }}
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}

          {/* Fantasma: elemento visual durante drag (criar ou mover) */}
          {ghostInfo && (
            <div
              className="cg-ghost"
              style={{
                position: 'absolute',
                left: ghostInfo.left,
                width: ghostInfo.width,
                top: `${(ghostInfo.startMin / 1440) * 100}%`,
                height: `${((ghostInfo.endMin - ghostInfo.startMin) / 1440) * 100}%`,
                background: 'var(--accent-1, oklch(0.65 0.20 250))',
                opacity: 0.35,
                border: '2px dashed var(--accent-1, oklch(0.65 0.20 250))',
                borderRadius: 4,
                pointerEvents: 'none',
                zIndex: 10,
                display: 'flex',
                alignItems: 'flex-start',
                padding: '2px 4px',
                fontSize: 11,
                color: 'var(--ink-1)',
              }}
            >
              {minToLabel(ghostInfo.startMin)} – {minToLabel(ghostInfo.endMin)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
