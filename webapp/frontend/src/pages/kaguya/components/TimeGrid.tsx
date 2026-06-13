// TimeGrid — grid de 24h para as views Dia (1 coluna) e Semana (7 colunas) (fatia 019, T012).
// Renderiza apenas — sem interação por ponteiro (drag/resize chegam na T023).
// Estrutura: cabeçalho de dias sticky → faixa all-day sticky → grid scrollável com gutter de horas.
// Inclui algoritmo de lane para sobreposição de eventos e linha "agora" na coluna de hoje.

import { useEffect, useRef } from 'react'
import type { CalEvent, Calendar } from '../types'

// ── Helpers de data ─────────────────────────────────────────────────────────

// Formata um Date LOCAL como "AAAA-MM-DD".
function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Converte uma string de tempo ("AAAA-MM-DDTHH:MM:SS" ou "HH:MM") em minutos desde meia-noite.
function timeToMin(t: string | null | undefined): number {
  if (!t) return 0
  // Extrai a parte de tempo depois do 'T' (se for ISO completo) ou usa diretamente
  const timePart = t.includes('T') ? t.split('T')[1] : t
  const [h, m] = timePart.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

// Formata minutos desde meia-noite como "HH:MM" (ex.: 870 → "14:30").
function minToLabel(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// Abreviações de dia da semana em pt-BR (1=Seg, 2=Ter … 0=Dom).
const WEEKDAY_ABBR: Record<number, string> = {
  0: 'Dom',
  1: 'Seg',
  2: 'Ter',
  3: 'Qua',
  4: 'Qui',
  5: 'Sex',
  6: 'Sáb',
}

// ── Algoritmo de lane (sobreposição) ────────────────────────────────────────

// Dado um array de eventos de uma coluna (um dia), calcula o `lane` (coluna de sobreposição)
// e `totalLanes` para cada evento. Eventos que se sobrepõem dividem o espaço horizontal.
interface LanedEvent {
  ev: CalEvent
  lane: number       // índice da faixa (0-based)
  totalLanes: number // total de faixas no grupo de sobreposição
  startMin: number
  endMin: number
}

function assignLanes(events: CalEvent[]): LanedEvent[] {
  // Filtra apenas eventos com hora de início definida
  const timed = events
    .filter((e) => e.start && !e.allDay)
    .map((e) => ({
      ev: e,
      startMin: timeToMin(e.start),
      // Se não tiver fim, assume 30 minutos de duração mínima
      endMin: e.end ? timeToMin(e.end) : timeToMin(e.start) + 30,
      lane: 0,
      totalLanes: 1,
    }))

  // Ordena por hora de início
  timed.sort((a, b) => a.startMin - b.startMin)

  // Algoritmo guloso: monta "grupos" de eventos que se sobrepõem no tempo.
  // Para cada grupo, distribui lanes 0, 1, 2, … e define totalLanes = tamanho do grupo.
  const result: LanedEvent[] = []
  let group: typeof timed = []

  for (const item of timed) {
    // Verifica se este evento começa depois que todos do grupo atual terminaram
    const groupEnd = group.length > 0 ? Math.max(...group.map((g) => g.endMin)) : 0
    if (group.length === 0 || item.startMin < groupEnd) {
      // Pertence ao grupo atual
      item.lane = group.length
      group.push(item)
    } else {
      // Novo grupo: finaliza o anterior (define totalLanes para todos)
      const total = group.length
      for (const g of group) g.totalLanes = total
      result.push(...group)
      // Começa novo grupo com este item
      group = [item]
      item.lane = 0
    }
  }
  // Fecha o último grupo
  if (group.length > 0) {
    const total = group.length
    for (const g of group) g.totalLanes = total
    result.push(...group)
  }

  return result
}

// ── Utilitário: cor do evento ────────────────────────────────────────────────

// Retorna a cor do evento: a cor do próprio evento, ou a do Calendar correspondente, ou fallback.
function resolveColor(ev: CalEvent, cals: Calendar[]): string {
  if (ev.color) return ev.color
  const cal = cals.find((c) => c.id === ev.cal)
  return cal?.color ?? 'var(--ink-3)'
}

// ── Props ────────────────────────────────────────────────────────────────────

interface TimeGridProps {
  // Datas ISO a exibir: 1 string para a view Dia, 7 para a view Semana
  days: string[]
  // Todos os eventos na janela (o componente filtra por `day`)
  events: CalEvent[]
  // Calendários para resolver cores
  cals: Calendar[]
  // Callback ao clicar num evento
  onEventClick: (ev: CalEvent) => void
}

// ── Componente ───────────────────────────────────────────────────────────────

export function TimeGrid({ days, events, cals, onEventClick }: TimeGridProps) {
  // Ref para o container scrollável — usado para o auto-scroll a ~07:00 no mount
  const scrollRef = useRef<HTMLDivElement>(null)

  // Rola para ~07:00 ao montar (faz os horários de manhã ficarem visíveis por padrão)
  useEffect(() => {
    if (scrollRef.current) {
      // 7 horas × 52px (--hh padrão) = 364px
      // Como --hh pode variar por variante, usamos a estimativa padrão
      scrollRef.current.scrollTop = 7 * 52
    }
  }, [])

  // Data de hoje em ISO para comparação
  const todayISO = toISO(new Date())

  // Número atual de colunas (1 = dia, 7 = semana) — define o template CSS do grid
  const ncols = days.length

  // Largura de cada coluna de dia (calculada dinamicamente em %; o gutter ocupa --gutter)
  // Usamos percentuais para que o componente funcione com qualquer largura de container.
  // As colunas ficam à direita do gutter (var(--gutter) ≈ 58px).
  // Posicionamos cada coluna de forma absoluta, então a largura da coluna é calculada
  // como (100% - gutter) / ncols, mas usamos variáveis CSS para evitar hardcode.

  // ── Calcula hora e minuto atuais para a linha "agora" ──────────────────────
  const now = new Date()
  const nowMin = now.getHours() * 60 + now.getMinutes()

  // ── Indexa eventos por dia ──────────────────────────────────────────────────
  const byDay: Record<string, CalEvent[]> = {}
  for (const ev of events) {
    if (!ev.day) continue
    if (!byDay[ev.day]) byDay[ev.day] = []
    byDay[ev.day].push(ev)
  }

  // ── Rótulos das 24 horas para o gutter ──────────────────────────────────────
  const hours = Array.from({ length: 24 }, (_, i) => i) // 0..23

  return (
    // Container raiz do grid — usa a classe .calx que define --hh e --gutter via CSS
    <div className="calx" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ── Cabeçalho de dias (sticky) ── */}
      <div
        className="cal-dayhead"
        style={{ gridTemplateColumns: `repeat(${ncols}, 1fr)` }}
      >
        {/* Canto superior esquerdo: fuso horário "BRT" */}
        {/* O cabeçalho usa padding-left=var(--gutter) via CSS; o BRT fica posicionado absolutamente no canto */}
        <div
          className="cal-tz"
          style={{
            position: 'absolute',
            left: 0,
            bottom: 4,
            width: 'var(--gutter)',
            textAlign: 'center',
          }}
        >
          BRT
        </div>

        {/* Uma célula por dia */}
        {days.map((iso) => {
          const d = new Date(iso + 'T00:00:00') // força hora local
          const dayOfWeek = d.getDay() // 0=Dom … 6=Sáb
          const isToday = iso === todayISO

          return (
            <div
              key={iso}
              className={`cal-dayhead-cell${isToday ? ' today' : ''}`}
            >
              {/* Abreviação do dia da semana em mono uppercase */}
              <div className="cal-day-abbr">{WEEKDAY_ABBR[dayOfWeek]}</div>
              {/* Número do dia: círculo azul no hoje */}
              <div className="cal-day-num">{d.getDate()}</div>
            </div>
          )
        })}
      </div>

      {/* ── Faixa all-day (sticky, abaixo do cabeçalho) ── */}
      <div
        className="cal-allday"
        style={{ gridTemplateColumns: `repeat(${ncols}, 1fr)` }}
      >
        {days.map((iso) => {
          // Filtra eventos all-day ou sem hora de início para este dia
          const allDayEvs = (byDay[iso] ?? []).filter((e) => e.allDay || !e.start)
          return (
            <div key={iso} style={{ minHeight: 28 }}>
              {allDayEvs.map((ev) => {
                const color = resolveColor(ev, cals)
                return (
                  <div
                    key={ev.id}
                    className="cad-pill"
                    style={{ backgroundColor: color + '33', color }}
                    onClick={() => onEventClick(ev)}
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

      {/* ── Grid scrollável de 24h ── */}
      <div className="cal-scroll" ref={scrollRef}>
        <div
          className="cal-grid"
          style={{
            // Define o número de colunas via variável CSS customizada
            gridTemplateColumns: `var(--gutter) repeat(${ncols}, 1fr)`,
          }}
        >
          {/* Gutter: coluna de rótulos de hora (00:00 … 23:00) */}
          <div className="cal-gutter">
            {hours.map((h) => (
              <div key={h} className="cal-gutter-label">
                {/* Não exibe "00:00" (meia-noite) para evitar sobreposição visual */}
                {h === 0 ? '' : `${String(h).padStart(2, '0')}:00`}
              </div>
            ))}
          </div>

          {/* Uma coluna por dia */}
          {days.map((iso, colIdx) => {
            const isToday = iso === todayISO
            const dayEvs = byDay[iso] ?? []

            // Calcula as lanes de sobreposição para os eventos timed deste dia
            const laned = assignLanes(dayEvs)

            // Filtra os eventos all-day (já exibidos na faixa acima)
            // para não renderizá-los duas vezes
            const timedLaned = laned.filter((le) => !le.ev.allDay && le.ev.start)

            return (
              <div
                key={iso}
                className={`cg-col${isToday ? ' today' : ''}`}
                style={{
                  // Posiciona a coluna no grid usando grid-column implícito
                  // (a primeira coluna do grid-template é o gutter; colunas de dia vêm depois)
                  position: 'relative',
                  height: '100%',
                  gridColumn: colIdx + 2, // +2 porque coluna 1 é o gutter
                }}
              >
                {/* Linha "agora" — só na coluna de hoje */}
                {isToday && (
                  <div
                    className="cg-now"
                    style={{ top: `${(nowMin / 1440) * 100}%` }}
                    aria-label={`Agora: ${minToLabel(nowMin)}`}
                  />
                )}

                {/* Eventos timed com cálculo de lane */}
                {timedLaned.map(({ ev, lane, totalLanes, startMin, endMin }) => {
                  const color = resolveColor(ev, cals)
                  const duration = endMin - startMin

                  // Calcula posição percentual dentro da coluna de 1440 minutos (24h)
                  const topPct = (startMin / 1440) * 100
                  // Altura mínima de 2% para eventos muito curtos não desaparecerem
                  const heightPct = Math.max((duration / 1440) * 100, 2)

                  // Divide horizontalmente entre as lanes
                  // Fórmula: left = lane/totalLanes * 100%, width = 100%/totalLanes - 2px de gap
                  const leftPct = (lane / totalLanes) * 100
                  const widthCalc = `calc(${100 / totalLanes}% - 2px)`

                  // Cor de fundo: levemente transparente para mostrar o grid atrás
                  const bgColor = color + 'CC' // α ≈ 80%

                  // Classes adicionais
                  const evClass = [
                    'cg-event',
                    ev.kind === 'task' ? 'task' : '',
                    duration <= 30 ? 'tiny' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')

                  return (
                    <div
                      key={ev.id}
                      className={evClass}
                      style={{
                        top: `${topPct}%`,
                        height: `${heightPct}%`,
                        left: `${leftPct}%`,
                        width: widthCalc,
                        backgroundColor: bgColor,
                        color: 'white',
                        borderColor: color,
                      }}
                      onClick={() => onEventClick(ev)}
                      title={`${minToLabel(startMin)}–${minToLabel(endMin)} · ${ev.title}`}
                    >
                      {/* Título do evento */}
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ev.title}
                      </span>
                      {/* Alça de resize no rodapé (interação adicionada na T023) */}
                      <div className="cg-resize" />
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
