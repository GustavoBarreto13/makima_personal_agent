// MonthGrid — grade de mês 6 semanas × 7 colunas (fatia 019, T011).
// Exibe uma grade de 42 células (6 linhas × 7 colunas) com os dias do mês.
// Cada célula mostra até 4 pílulas de evento; se houver mais, exibe "+N mais".
// Pílulas com `allDay=true` têm fundo tonal; pílulas timed têm dot colorido + hora.

import type { CalEvent, Calendar } from '../types'

// ── Helpers de data ─────────────────────────────────────────────────────────

// Formata um Date LOCAL como "AAAA-MM-DD" (sem passar por UTC).
function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Soma `n` dias a uma data sem mutar o original.
function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

// Abreviações dos dias da semana em pt-BR (começa no domingo como no Brasil).
const WEEKDAYS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

// Abreviações dos meses em pt-BR — usadas quando o mês muda dentro da grade.
const MONTH_ABBR_PT = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
]

// ── Props ────────────────────────────────────────────────────────────────────

interface MonthGridProps {
  // Data de referência: qualquer dia do mês que queremos exibir
  refDate: Date
  // Todos os eventos na janela visível (pré-filtrados pelo parent)
  events: CalEvent[]
  // Lista de calendários para resolver a cor padrão de cada evento
  cals: Calendar[]
  // Callback ao clicar numa célula de dia (recebe ISO "AAAA-MM-DD")
  onDayClick: (date: string) => void
}

// ── Utilitário: resolve a cor de um evento ──────────────────────────────────

// Retorna a cor do evento: `event.color` se definida, senão a cor do Calendar correspondente.
// Se não encontrar nenhuma, usa um fallback neutro.
function resolveColor(ev: CalEvent, cals: Calendar[]): string {
  if (ev.color) return ev.color
  const cal = cals.find((c) => c.id === ev.cal)
  return cal?.color ?? 'var(--ink-3)'
}

// ── Componente ───────────────────────────────────────────────────────────────

export function MonthGrid({ refDate, events, cals, onDayClick }: MonthGridProps) {
  // Data de hoje para marcar a célula correta com a classe `today`
  const todayISO = toISO(new Date())

  // Mês de referência (0-11) — células fora desse mês recebem a classe `dim`
  const currentMonth = refDate.getMonth()

  // Calcula o dia inicial da grade: o domingo da semana que contém o dia 1 do mês.
  // `first` = dia 1 do mês de referência; `gridStart` = domingo anterior (ou o próprio dia 1 se já for domingo).
  const first = new Date(refDate.getFullYear(), refDate.getMonth(), 1)
  const gridStart = addDays(first, -first.getDay()) // getDay(): 0=Dom, 1=Seg, …

  // Os 42 dias da grade (6 semanas completas)
  const gridDays = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))

  // Indexa os eventos por dia ISO para lookup O(1) em cada célula.
  // Um evento pode aparecer em vários dias se for de múltiplos dias, mas aqui
  // usamos `event.day` (campo que o backend já resolve para o dia correto).
  const byDay: Record<string, CalEvent[]> = {}
  for (const ev of events) {
    if (!ev.day) continue
    if (!byDay[ev.day]) byDay[ev.day] = []
    byDay[ev.day].push(ev)
  }

  // Formata a hora de um evento timed: extrai "HH:MM" de uma string ISO ou "HH:MM:SS".
  function formatTime(t: string | null): string {
    if (!t) return ''
    // Suporta "AAAA-MM-DDTHH:MM:SS" e "HH:MM" diretamente
    const part = t.includes('T') ? t.split('T')[1] : t
    return part.slice(0, 5) // "HH:MM"
  }

  return (
    <div className="cmo-grid">
      {/* ── Cabeçalho: abreviações dos dias da semana ── */}
      {WEEKDAYS_PT.map((wd) => (
        <div key={wd} className="cmo-header-cell">
          {wd}
        </div>
      ))}

      {/* ── Células de dia (42 no total) ── */}
      {gridDays.map((d) => {
        const iso = toISO(d)
        const dayEvents = byDay[iso] ?? []

        // Verifica se o mês mudou em relação à célula anterior para exibir a abreviação do mês.
        // A abreviação aparece quando a célula é dia 1 ou quando a grade entra em um mês diferente.
        const showMonthAbbr = d.getDate() === 1

        // Classes da célula:
        // - `dim`: dia fora do mês atual (pertence ao mês anterior ou posterior)
        // - `today`: dia de hoje
        const isOutside = d.getMonth() !== currentMonth
        const isToday = iso === todayISO
        const cellClass = [
          'cmo-cell',
          isOutside ? 'dim' : '',
          isToday ? 'today' : '',
        ]
          .filter(Boolean)
          .join(' ')

        // Mostra até 4 pílulas; o restante vira "+N mais"
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
            {/* Número do dia — envolto em circle para marcar o today */}
            <div className="cmo-day-num">
              {d.getDate()}
              {/* Abreviação do mês quando muda (ex.: "jan") — aparece ao lado do número */}
              {showMonthAbbr && (
                <span className="cmo-month-abbr">{MONTH_ABBR_PT[d.getMonth()]}</span>
              )}
            </div>

            {/* Pílulas de evento */}
            {visibleEvents.map((ev, idx) => {
              const color = resolveColor(ev, cals)

              if (ev.allDay || !ev.start) {
                // Pílula all-day: fundo tonal (cor com 20% opacidade)
                // A CSS já define `.cmo-pill.filled` como placeholder; o fundo vem inline.
                return (
                  <div
                    key={`${iso}-${ev.id}-${idx}`}
                    className="cmo-pill filled"
                    style={{
                      backgroundColor: color + '33', // hex α=0x33 ≈ 20% opacidade
                      color,
                    }}
                    title={ev.title}
                    onClick={(e) => e.stopPropagation()} // não propaga para onDayClick
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
                  style={{ color: 'var(--ink-2)' }}
                  title={ev.title}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Ponto colorido que identifica o calendário */}
                  <span className="cmo-dot" style={{ backgroundColor: color }} />
                  {/* Hora de início formatada */}
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-4)', flexShrink: 0 }}>
                    {formatTime(ev.start)}
                  </span>
                  {/* Título do evento (truncado pelo overflow:hidden da pílula) */}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {ev.title}
                  </span>
                </div>
              )
            })}

            {/* "+N mais" quando há eventos além do limite */}
            {extraCount > 0 && (
              <div className="cmo-more">+{extraCount} mais</div>
            )}
          </div>
        )
      })}
    </div>
  )
}
