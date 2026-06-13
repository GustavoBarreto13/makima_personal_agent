// CalendarsAside — sidebar lateral direita do Calendar Hub (fatia 019, T013).
// Contém: mini-mês com navegação independente + campo de busca (placeholder) +
// seção de calendários (placeholder — será completada na T022).
// O mini-mês tem estado próprio (`miniAnchor`) que NÃO sincroniza com o calendário
// principal automaticamente; cliques nos dias chamam `onDayClick` que atualiza o parent.

import { useState } from 'react'
import { Icon } from '../ui/Icons'

// ── Helpers de data ─────────────────────────────────────────────────────────

// Formata um Date LOCAL como "AAAA-MM-DD".
function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Soma `n` dias a uma data sem mutar o original.
function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

// Retorna o número da semana ISO 8601 de uma data.
// A semana que contém a primeira quinta-feira do ano é a semana 1.
function isoWeek(d: Date): number {
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = tmp.getUTCDay() || 7
  tmp.setUTCDate(tmp.getUTCDate() + 4 - day)
  const year = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1))
  return Math.ceil((((tmp.getTime() - year.getTime()) / 86400000) + 1) / 7)
}

// Nomes dos meses em pt-BR abreviados (para o cabeçalho do mini-mês).
const MONTHS_PT = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
]

// Abreviações de 1 letra para os dias da semana (começa no domingo = padrão brasileiro).
const WEEKDAY_1 = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

// ── Props ────────────────────────────────────────────────────────────────────

interface CalendarsAsideProps {
  // Data de referência do calendário principal (usada para inicializar o mini-mês)
  refDate: Date
  // Data selecionada/destacada no calendário principal (ISO "AAAA-MM-DD")
  selectedDate: string
  // Callback ao clicar em um dia no mini-mês
  onDayClick: (date: string) => void
}

// ── Componente ───────────────────────────────────────────────────────────────

export function CalendarsAside({ refDate, selectedDate, onDayClick }: CalendarsAsideProps) {
  // Estado interno do mini-mês: qual mês está visível (começa no mês de refDate).
  // Não sincroniza automaticamente com o calendário principal — o usuário pode
  // navegar o mini-mês independentemente. Só uma chamada onDayClick "re-ancora" o principal.
  const [miniAnchor, setMiniAnchor] = useState<Date>(
    () => new Date(refDate.getFullYear(), refDate.getMonth(), 1)
  )

  // Hoje em ISO para marcar a célula com a classe `today`
  const todayISO = toISO(new Date())

  // Navega o mini-mês um mês para frente (+1) ou para trás (-1)
  function navMini(delta: 1 | -1) {
    setMiniAnchor((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1))
  }

  // ── Computa as 42 células do mini-mês ──────────────────────────────────────
  const first = new Date(miniAnchor.getFullYear(), miniAnchor.getMonth(), 1)
  const gridStart = addDays(first, -first.getDay()) // domingo antes do dia 1
  const miniDays = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))

  // Semana ISO da data selecionada — usada para marcar a faixa `.in-week`
  const selectedWeek = selectedDate ? isoWeek(new Date(selectedDate + 'T00:00:00')) : -1

  // Título do mini-mês: "jan 2026" (mês abreviado + ano)
  const miniTitle = `${MONTHS_PT[miniAnchor.getMonth()]} ${miniAnchor.getFullYear()}`

  return (
    <aside className="cal-aside" data-col="right">

      {/* ── Mini-mês ─────────────────────────────────────────────────────────── */}
      <div className="mini">
        {/* Cabeçalho do mini-mês: título + botões de navegação */}
        <div className="mini-header">
          <span className="mini-title">{miniTitle}</span>
          <div className="mini-nav">
            {/* Botão retroceder um mês */}
            <button onClick={() => navMini(-1)} aria-label="Mês anterior">
              <Icon name="back" size={12} />
            </button>
            {/* Botão avançar um mês */}
            <button onClick={() => navMini(1)} aria-label="Próximo mês">
              <Icon name="chevron" size={12} />
            </button>
          </div>
        </div>

        {/* Grade do mini-mês (7 colunas × 7 linhas = 7 headers + 42 células) */}
        <div className="mini-grid">
          {/* Cabeçalho: 1 letra por dia da semana */}
          {WEEKDAY_1.map((l, i) => (
            <div key={i} className="mini-hdr">{l}</div>
          ))}

          {/* Células de dia */}
          {miniDays.map((d) => {
            const iso = toISO(d)
            const isToday = iso === todayISO
            const isSelected = iso === selectedDate
            const isOutside = d.getMonth() !== miniAnchor.getMonth()

            // Verifica se esta célula está na mesma semana ISO que a data selecionada,
            // para aplicar o highlight `.in-week` (faixa azul claro na semana do selecionado)
            const cellWeek = isoWeek(d)
            const isInWeek = cellWeek === selectedWeek && selectedWeek !== -1

            // Monta as classes CSS da célula
            const cls = [
              'mini-cell',
              isToday ? 'today' : '',
              isSelected ? 'selected' : '',
              isInWeek && !isSelected ? 'in-week' : '',
              isInWeek && isSelected ? 'in-week selected' : '',
              isOutside ? 'dim' : '',
            ]
              .filter(Boolean)
              .join(' ')
            // Remove duplicatas de classes (caso isSelected e isInWeek se combinem)
            const classDedup = [...new Set(cls.split(' '))].join(' ')

            return (
              <div
                key={iso}
                className={classDedup}
                onClick={() => onDayClick(iso)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && onDayClick(iso)}
                aria-label={`Dia ${d.getDate()}`}
                aria-pressed={isSelected}
              >
                {d.getDate()}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Campo de busca (placeholder — não funcional nesta fatia) ── */}
      <div className="cal-srch" aria-label="Buscar eventos (em breve)">
        🔍 Encontrar com…
      </div>

      {/* ── Seção de calendários (placeholder — será preenchida na T022) ── */}
      <div
        style={{
          color: 'var(--ink-4)',
          fontSize: 12,
          padding: '8px 2px',
        }}
      >
        Calendários disponíveis em breve
      </div>

    </aside>
  )
}
