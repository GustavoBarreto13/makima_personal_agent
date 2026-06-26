// TimeGrid — grid de 24h para as views Dia e Semana (fatia 019, T012/T023/T024).
// Estrutura do handoff (spec 019):
//   .cal-scroll (raiz, overflow-y:scroll)
//     .cal-stickytop (sticky top:0 dentro do scroll)
//       .cal-dayhead  → .cdh-corner + .cdh-day × N (com .cdh-dow + .cdh-num)
//       .cal-allday   → .cad-label + .cad-col × N (com .cad-pill por evento)
//     .cal-grid (position:relative; grid-template-columns: var(--gutter) repeat(N,1fr))
//       .cg-gutter    → .cg-hourlabel × 24
//       .cg-col × N   → .cg-now + .cg-event (com .ce-title/.ce-time) + .cg-resize
//       .cg-ghost     → .gh-time (durante drag)
//
// Cor dos eventos: via variável CSS --cc injetada inline; o CSS usa color-mix(in oklab,...).
// Interações: mover/redimensionar/criar por pointer (T023); drop de TrayCard (T024).
// Editabilidade por fonte: só "kaguya" e "gcal" movem/redimensionam; cross-agent é read-only.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { CalEvent, Calendar } from '../types'
import { kaguyaApi, isGcal, gcalCalendarId } from '../kaguyaApi'
// localISO: monta ISO 8601 com offset local sem toISOString() (nunca UTC naked).
import { localISO } from '../lib/dateUtils'

// ── Helpers de data ─────────────────────────────────────────────────────────

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Converte string ISO datetime (ou "HH:MM") em minutos desde meia-noite, no fuso LOCAL.
//
// Por que usar new Date() e não split literal:
//   O backend devolve start_at/end_at como UTC ("...17:00:00+00:00") para uma task de
//   14:00 BRT. Fatiar o "HH:MM" literal retornaria 17 → 3h à frente. new Date() aplica
//   o offset automaticamente → getHours() retorna 14 (correto).
//
// Casos cobertos:
//   "2026-06-26T17:00:00+00:00" (backend UTC) → 840 (14:00 local) ✅
//   "2026-06-26T14:00:00-03:00" (offset local) → 840 (14:00 local) ✅
//   "2026-06-26T14:00:00"        (naive, sem offset) → interpretado como LOCAL pelo JS ✅
//   "14:30"                      (só hora, e.g. due_time) → split literal ✅
function timeToMin(t: string | null | undefined): number {
  if (!t) return 0
  // Datetime completo (com "T"): usa new Date() para respeitar o offset.
  // new Date("AAAA-MM-DDTHH:MM") sem offset é tratado como LOCAL pelo JS — não UTC.
  if (t.includes('T')) {
    const d = new Date(t)
    if (!isNaN(d.getTime())) return d.getHours() * 60 + d.getMinutes()
  }
  // Fallback: string pura "HH:MM" (due_time, sem data) — split literal continua correto.
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
// Redireciona para localISO (lib/dateUtils) que inclui o offset local no resultado.
// Antes emitia string naive ("AAAA-MM-DDTHH:MM:00" sem offset): o Postgres interpretava
// como UTC, gravando 3h antes do pretendido. Com offset incluído, o round-trip é correto.
function buildISO(day: string, min: number): string {
  return localISO(day, min)   // "AAAA-MM-DDTHH:MM:00-03:00" (offset local, nunca naked)
}

// Abreviações de dia da semana em pt-BR.
const WEEKDAY_ABBR: Record<number, string> = {
  0: 'Dom', 1: 'Seg', 2: 'Ter', 3: 'Qua', 4: 'Qui', 5: 'Sex', 6: 'Sáb',
}

// Verifica se um evento pode ser movido/redimensionado.
// Kaguya: sempre. Google: apenas se o calendário for owner/writer (writable=true).
function isEventEditable(ev: CalEvent, cals: Calendar[]): boolean {
  if (ev.cal === 'kaguya') return true
  if (isGcal(ev.cal)) {
    return !!cals.find((c) => c.id === ev.cal)?.writable
  }
  return false
}

// ── Algoritmo de lane (sobreposição) ────────────────────────────────────────

interface LanedEvent {
  ev: CalEvent
  lane: number
  totalLanes: number
  startMin: number
  endMin: number
}

function assignLanes(events: CalEvent[]): LanedEvent[] {
  // Filtra apenas eventos com horário definido e ordena por início
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
      // Evento se sobrepõe ao grupo atual — atribui próxima lane
      item.lane = group.length
      group.push(item)
    } else {
      // Fecha o grupo anterior: todos compartilham o mesmo totalLanes
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

// Resolve a cor de exibição de um evento.
// Prioridade: event.color > cor do calendário > var(--kg) (azul índigo da Kaguya).
// O fallback var(--kg) garante que eventos sem cor explícita ficam na cor da Kaguya.
function resolveColor(ev: CalEvent, cals: Calendar[]): string {
  if (ev.color) return ev.color
  return cals.find((c) => c.id === ev.cal)?.color ?? 'var(--kg)'
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
  // Grid criou novo slot arrastando (para kaguya: criar tarefa)
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
  originMin: number      // minuto de início no pointerdown
  originDay: string      // dia de origem
  colEl: HTMLElement     // elemento da coluna (para calcular posição relativa)
  offsetMin: number      // offset entre o topo do evento e onde o usuário clicou (move)
  dragging: boolean      // true depois de mover ≥ 4px
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
  // Flag que impede o onClick do evento de reabrir o popover logo após um drag.
  // Setada para `true` no onGridPointerUp (quando houve drag real); limpa num setTimeout(0)
  // após o evento de click sintético ser despachado pelo browser.
  const justDraggedRef = useRef(false)

  // Estado de ghost visível (mínimo para forçar re-render ao iniciar/parar drag)
  const [ghostInfo, setGhostInfo] = useState<{
    day: string; startMin: number; endMin: number
    left: string; width: string
  } | null>(null)

  const todayISO = toISO(new Date())
  const ncols = days.length
  const now = new Date()
  const nowMin = now.getHours() * 60 + now.getMinutes()

  // Auto-scroll para mostrar ~07:00 na montagem.
  // Usa scrollHeight proporcional (7/24) em vez de 7*52px fixo,
  // pois o --hh pode variar por variante CSS e o header sticky agora faz parte do scroll.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight * (7 / 24)
    }
  }, [])

  // ── Utilitários de coordenada ─────────────────────────────────────────────

  // Retorna a coluna (elemento DOM) e o dia (string) correspondentes a clientX.
  const colFromX = useCallback((clientX: number): { colEl: HTMLElement; day: string } | null => {
    if (!gridRef.current) return null
    // Cada .cg-col é relativa dentro de .cal-grid
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
    if (!isEventEditable(ev, cals)) return

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
      : 0

    let snapMin: number
    if (d.mode === 'move') {
      snapMin = snapTo15(rawMin - d.offsetMin)
    } else {
      snapMin = d.originMin   // startMin fica fixo no resize
    }

    const endMin = d.mode === 'move'
      ? snapMin + duration
      : Math.max(d.originMin + 15, snapTo15(rawMin))   // mínimo 15min

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
    // Modo 'create' é tratado pelo onColPointerUp da própria coluna. Este listener é nativo no
    // gridRef (ancestral) e dispara ANTES do handler React da coluna no mesmo pointerup; se ele
    // zerar o dragRef aqui, o onColPointerUp encontra null e o onCreateSlot nunca roda. Por isso
    // saímos sem tocar no dragRef — espelhando a guarda que o onGridPointerMove já tem (linha 285).
    if (d?.mode === 'create') return
    dragRef.current = null
    setGhostInfo(null)

    if (!d || !d.dragging) {
      // Foi um clique simples — o onClick do evento tratará
      return
    }

    // Marca que houve um drag real. O onClick do .cg-event é disparado pelo browser
    // logo após o pointerup e, sem esse guard, reabre o popover depois de todo move/resize.
    // O setTimeout(0) limpa a flag após o event loop processar o click sintético.
    justDraggedRef.current = true
    setTimeout(() => { justDraggedRef.current = false }, 0)

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
        // Se o dia mudou, atualiza due_date separadamente
        if (targetDay !== d.originDay) {
          await kaguyaApi.updateTask(d.ev.taskId, { due_date: targetDay })
        }
        // Grava o bloco de tempo via endpoint dedicado
        await kaguyaApi.setTimeBlock(d.ev.taskId, { start_at: newStartISO, end_at: newEndISO })
      } else if (isGcal(d.ev.cal)) {
        await kaguyaApi.updateCalendarEvent(d.ev.id, {
          start: newStartISO,
          end: newEndISO,
          day: targetDay,
          // Garante que a atualização vai para o calendário correto (não só o principal)
          calendar_id: gcalCalendarId(d.ev.cal),
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
      e.preventDefault()
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
  //
  // Estrutura: .cal-scroll é a raiz do componente (NÃO .calx — o calx já existe no CalendarScreen).
  // O .cal-stickytop fica DENTRO de .cal-scroll para que o position:sticky funcione
  // em relação ao container de scroll, não à página.

  return (
    <div className="cal-scroll" ref={scrollRef}>

      {/* Cabeçalho sticky: linha de dias + faixa all-day.
          Fica dentro de .cal-scroll para grudar no topo durante o scroll vertical. */}
      <div className="cal-stickytop">

        {/* Linha de cabeçalho com abreviação e número do dia */}
        <div
          className="cal-dayhead"
          style={{ gridTemplateColumns: `var(--gutter) repeat(${ncols}, 1fr)` }}
        >
          {/* Canto esquerdo do gutter: exibe o fuso horário "BRT" */}
          <div className="cdh-corner">
            <span className="cdh-tz">BRT</span>
          </div>

          {days.map((iso) => {
            const d = new Date(iso + 'T00:00:00')
            return (
              <div key={iso} className={`cdh-day${iso === todayISO ? ' today' : ''}`}>
                {/* Abreviação do dia: "Seg", "Ter", etc. */}
                <span className="cdh-dow">{WEEKDAY_ABBR[d.getDay()]}</span>
                {/* Número do dia: circulo destacado quando é hoje */}
                <span className="cdh-num">{d.getDate()}</span>
              </div>
            )
          })}
        </div>

        {/* Faixa all-day: pílulas de eventos sem horário ou duração de dia inteiro */}
        <div
          className="cal-allday"
          style={{ gridTemplateColumns: `var(--gutter) repeat(${ncols}, 1fr)` }}
        >
          {/* Label da faixa (texto "Todo o dia" visível à esquerda) */}
          <div className="cad-label">Todo o dia</div>

          {days.map((iso) => {
            // Filtra apenas eventos all-day ou sem horário de início
            const allDayEvs = (byDay[iso] ?? []).filter((e) => e.allDay || !e.start)
            return (
              <div key={iso} className="cad-col">
                {allDayEvs.map((ev) => (
                  <div
                    key={ev.id}
                    className="cad-pill"
                    // --cc: cor corrente injetada inline; o CSS usa color-mix para o fundo tonal
                    style={{ '--cc': resolveColor(ev, cals) } as CSSProperties}
                    onClick={(e) => onEventClick(ev, { x: e.clientX, y: e.clientY })}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      onEventContextMenu?.(ev, { x: e.clientX, y: e.clientY })
                    }}
                    title={ev.title}
                  >
                    {ev.title}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>

      {/* Grid de 24h: não sticky; scrollado verticalmente junto com o conteúdo */}
      <div
        ref={gridRef}
        className="cal-grid"
        style={{ gridTemplateColumns: `var(--gutter) repeat(${ncols}, 1fr)`, position: 'relative' }}
      >
        {/* Gutter de horas: labels "00:00", "01:00"… alinhados com a grade horizontal */}
        <div className="cg-gutter">
          {hours.map((h) => (
            <div key={h} className="cg-hourlabel">
              {/* A meia-noite (h=0) fica sem label para não sobrepor a borda do header */}
              {h === 0 ? '' : `${String(h).padStart(2, '0')}:00`}
            </div>
          ))}
        </div>

        {/* Colunas de dia — uma por dia da semana (ou único dia na view Dia) */}
        {days.map((iso, colIdx) => {
          const isToday = iso === todayISO
          const dayEvs = byDay[iso] ?? []
          const laned = assignLanes(dayEvs)
          // Só eventos com horário vão para o grid de horas; all-day já foi tratado acima
          const timedLaned = laned.filter((le) => !le.ev.allDay && le.ev.start)

          return (
            <div
              key={iso}
              // today-col (não today): classe CSS que destaca a coluna de hoje
              className={`cg-col${isToday ? ' today-col' : ''}`}
              style={{ position: 'relative', height: '100%', gridColumn: colIdx + 2 }}
              // Arrastar área vazia → criar slot de tempo
              onPointerDown={(e) => onColPointerDown(e, iso, e.currentTarget)}
              onPointerMove={(e) => onColPointerMove(e, iso, colIdx)}
              onPointerUp={(e) => onColPointerUp(e, iso)}
              // Drag-drop de TrayCard → time-blocking
              onDragOver={onColDragOver}
              onDrop={(e) => onColDrop(e, iso, e.currentTarget)}
            >
              {/* Linha "agora": indicador de hora atual — só na coluna de hoje */}
              {isToday && (
                <div
                  className="cg-now"
                  style={{ top: `${(nowMin / 1440) * 100}%` }}
                  aria-label={`Agora: ${minToLabel(nowMin)}`}
                />
              )}

              {/* Eventos com horário definido */}
              {timedLaned.map(({ ev, lane, totalLanes, startMin, endMin }) => {
                const duration = endMin - startMin
                const topPct = (startMin / 1440) * 100
                // Altura mínima de 2% para que eventos muito curtos ainda sejam visíveis
                const heightPct = Math.max((duration / 1440) * 100, 2)
                const leftPct = (lane / totalLanes) * 100
                const widthCalc = `calc(${100 / totalLanes}% - 2px)`
                const isEditable = isEventEditable(ev, cals)
                // "tiny" = evento com ≤ 30 min de duração (layout compacto via CSS)
                const isTiny = duration <= 30

                return (
                  <div
                    key={ev.id}
                    className={[
                      'cg-event',
                      ev.kind === 'task' ? 'task' : '',
                      isTiny ? 'tiny' : '',
                    ].filter(Boolean).join(' ')}
                    // --cc injetado inline; o CSS (agora) deriva fundo, borda e texto de var(--cc)
                    style={{
                      '--cc': resolveColor(ev, cals),
                      top: `${topPct}%`,
                      height: `${heightPct}%`,
                      left: `${leftPct}%`,
                      width: widthCalc,
                      cursor: isEditable ? 'grab' : 'default',
                    } as CSSProperties}
                    onClick={(e) => {
                      // Só abre o popover se não houve drag logo antes.
                      // `dragRef.current?.dragging` cobre o drag ainda em progresso;
                      // `justDraggedRef.current` cobre o click sintético disparado
                      // pelo browser imediatamente após o pointerup de um drag concluído.
                      if (!dragRef.current?.dragging && !justDraggedRef.current) {
                        onEventClick(ev, { x: e.clientX, y: e.clientY })
                      }
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      onEventContextMenu?.(ev, { x: e.clientX, y: e.clientY })
                    }}
                    // Inicia drag de mover (só para fontes editáveis)
                    onPointerDown={isEditable
                      ? (e) => onEventPointerDown(e, ev, 'move', startMin, endMin, iso)
                      : undefined
                    }
                    title={`${minToLabel(startMin)}–${minToLabel(endMin)} · ${ev.title}`}
                  >
                    {/* Título do evento — truncado por CSS (.ce-title) */}
                    <span className="ce-title">{ev.title}</span>
                    {/* Hora de início — oculta em tiny via CSS */}
                    <span className="ce-time">{minToLabel(startMin)}</span>

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

        {/* Fantasma: elemento translúcido que aparece durante drag (criar ou mover).
            Renderizado dentro de .cal-grid para usar o mesmo sistema de coordenadas. */}
        {ghostInfo && (
          <div
            className="cg-ghost"
            style={{
              position: 'absolute',
              left: ghostInfo.left,
              width: ghostInfo.width,
              top: `${(ghostInfo.startMin / 1440) * 100}%`,
              height: `${((ghostInfo.endMin - ghostInfo.startMin) / 1440) * 100}%`,
              pointerEvents: 'none',
              zIndex: 10,
            }}
          >
            {/* Label de horário no ghost: "07:00 – 08:00" */}
            <span className="gh-time">
              {minToLabel(ghostInfo.startMin)} – {minToLabel(ghostInfo.endMin)}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
