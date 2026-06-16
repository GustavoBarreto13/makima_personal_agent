// MonthGrid — grade de mês 6 semanas × 7 colunas (fatia 019, T011).
// Estrutura do handoff (spec 019):
//   .cmo-grid        → flex column, height:100%
//     .cmo-dow-row   → row com 7 abreviações de dia (Dom/Seg/…)
//     .cmo-weeks     → flex:1, grid com 6 rows de igual altura
//       .cmo-week × 6  → grid 7 colunas (uma semana)
//         .cmo-cell    → clicável; classes extras: dim, today
//           .cmo-numrow → flex row-end com .cmo-num (círculo no today)
//           .cmo-pill(.filled) → pílula all-day com --cc
//           .cmo-pill          → pílula timed com .cp-dot + hora + título
//           .cmo-more          → "+N mais"
//
// Cor dos eventos: via variável CSS --cc injetada inline; o CSS usa color-mix para tints.

import type { CSSProperties } from 'react'
import type { CalEvent, Calendar } from '../types'

// ── Helpers de data ─────────────────────────────────────────────────────────

// Formata um Date LOCAL como "AAAA-MM-DD" (sem converter para UTC).
function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Soma `n` dias a uma data sem mutar o original.
function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

// Abreviações dos dias da semana em pt-BR (começa no domingo).
const WEEKDAYS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

// Abreviações dos meses em pt-BR — exibidas quando o mês muda dentro da grade.
const MONTH_ABBR_PT = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
]

// ── Props ────────────────────────────────────────────────────────────────────

interface MonthGridProps {
  // Data de referência: qualquer dia do mês a exibir
  refDate: Date
  // Todos os eventos na janela visível (pré-filtrados pelo parent)
  events: CalEvent[]
  // Lista de calendários para resolver a cor padrão de cada evento
  cals: Calendar[]
  // Callback ao clicar numa célula de dia (recebe ISO "AAAA-MM-DD")
  onDayClick: (date: string) => void
}

// ── Utilitário: resolve a cor de exibição de um evento ──────────────────────

// Prioridade: event.color > cor do calendário > var(--kg) (fallback azul da Kaguya).
function resolveColor(ev: CalEvent, cals: Calendar[]): string {
  if (ev.color) return ev.color
  const cal = cals.find((c) => c.id === ev.cal)
  return cal?.color ?? 'var(--kg)'
}

// ── Componente ───────────────────────────────────────────────────────────────

export function MonthGrid({ refDate, events, cals, onDayClick }: MonthGridProps) {
  // Data de hoje para marcar a célula correta
  const todayISO = toISO(new Date())

  // Mês de referência (0-11) — células fora desse mês recebem a classe `dim`
  const currentMonth = refDate.getMonth()

  // Calcula o dia inicial da grade: domingo da semana que contém o dia 1 do mês.
  const first = new Date(refDate.getFullYear(), refDate.getMonth(), 1)
  const gridStart = addDays(first, -first.getDay())  // getDay(): 0=Dom

  // Os 42 dias da grade (6 semanas completas)
  const gridDays = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))

  // Indexa os eventos por dia ISO para lookup O(1) em cada célula.
  const byDay: Record<string, CalEvent[]> = {}
  for (const ev of events) {
    if (!ev.day) continue
    if (!byDay[ev.day]) byDay[ev.day] = []
    byDay[ev.day].push(ev)
  }

  // Formata a hora de um evento timed: extrai "HH:MM" de uma string ISO ou "HH:MM:SS".
  function formatTime(t: string | null): string {
    if (!t) return ''
    const part = t.includes('T') ? t.split('T')[1] : t
    return part.slice(0, 5)   // "HH:MM"
  }

  // Divide os 42 dias em 6 grupos de 7 (semanas)
  const weeks = Array.from({ length: 6 }, (_, w) => gridDays.slice(w * 7, w * 7 + 7))

  return (
    <div className="cmo-grid">

      {/* ── Cabeçalho: abreviações dos dias da semana ── */}
      <div className="cmo-dow-row">
        {WEEKDAYS_PT.map((wd) => (
          <div key={wd} className="cmo-dow">{wd}</div>
        ))}
      </div>

      {/* ── Área de semanas: 6 linhas de igual altura ── */}
      <div className="cmo-weeks">
        {weeks.map((weekDays, weekIdx) => (
          <div key={weekIdx} className="cmo-week">
            {weekDays.map((d) => {
              const iso = toISO(d)
              const dayEvents = byDay[iso] ?? []

              // Abreviação do mês: aparece quando a célula é o primeiro dia do mês
              const showMonthAbbr = d.getDate() === 1

              // Classes da célula: dim = fora do mês atual; today = data de hoje
              const isOutside = d.getMonth() !== currentMonth
              const isToday = iso === todayISO
              const cellClass = [
                'cmo-cell',
                isOutside ? 'dim' : '',
                isToday ? 'today' : '',
              ].filter(Boolean).join(' ')

              // Limite de pílulas visíveis; excedente vira "+N mais"
              const MAX_PILLS = 4
              const visibleEvents = dayEvents.slice(0, MAX_PILLS)
              const extraCount = dayEvents.length - MAX_PILLS

              return (
                <div
                  key={iso}
                  className={cellClass}
                  onClick={() => onDayClick(iso)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && onDayClick(iso)}
                  aria-label={`Dia ${d.getDate()}`}
                >
                  {/* Número do dia — alinhado à direita; círculo quando today (via CSS) */}
                  <div className="cmo-numrow">
                    <span className="cmo-num">
                      {d.getDate()}
                      {/* Abreviação do mês quando o mês muda na grade (ex: "jan") */}
                      {showMonthAbbr && (
                        <span className="cmo-month-abbr"> {MONTH_ABBR_PT[d.getMonth()]}</span>
                      )}
                    </span>
                  </div>

                  {/* Pílulas de evento */}
                  {visibleEvents.map((ev, idx) => {
                    // Cor corrente: injetada via --cc para que o CSS use color-mix
                    const cc = resolveColor(ev, cals)

                    if (ev.allDay || !ev.start) {
                      // Pílula all-day: fundo tonal derivado de --cc pelo CSS
                      // (.cmo-pill.filled { background: color-mix(in oklab, var(--cc) 18%, var(--card)) })
                      return (
                        <div
                          key={`${iso}-${ev.id}-${idx}`}
                          className="cmo-pill filled"
                          style={{ '--cc': cc } as CSSProperties}
                          title={ev.title}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {ev.title}
                        </div>
                      )
                    }

                    // Pílula timed: dot colorido + hora + título
                    return (
                      <div
                        key={`${iso}-${ev.id}-${idx}`}
                        className="cmo-pill"
                        title={ev.title}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {/* Ponto que identifica o calendário — cor via --cc */}
                        <span className="cp-dot" style={{ '--cc': cc } as CSSProperties} />
                        {/* Hora de início formatada em mono */}
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-4)', flexShrink: 0 }}>
                          {formatTime(ev.start)}
                        </span>
                        {/* Título (truncado pelo overflow:hidden da pílula) */}
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {ev.title}
                        </span>
                      </div>
                    )
                  })}

                  {/* Indicador de eventos além do limite */}
                  {extraCount > 0 && (
                    <div className="cmo-more">+{extraCount} mais</div>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
