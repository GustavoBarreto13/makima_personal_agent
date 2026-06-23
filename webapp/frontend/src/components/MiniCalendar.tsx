// MiniCalendar — grade de calendário mensal reutilizável, cross-shell.
//
// Extraída de pages/kaguya/components/MiniCalendar.tsx (fase 026) para ser
// reutilizável em qualquer shell que precise de um seletor de data com tema.
// O kaguya original agora re-exporta daqui — sem duplicação de lógica.
//
// Usa as classes .mini-* já definidas em kaguya.css (linhas 838-855), que
// estão totalmente tematizadas com os tokens OKLCH (claro e escuro).
//
// Props:
//   anchor     — Date com o ano/mês a exibir (qualquer dia; usamos só ano+mês)
//   selected   — string ISO da data selecionada ("AAAA-MM-DD") ou "" para nenhuma
//   onSelect   — chamado com ISO quando o usuário clica em um dia
//   onNavMonth — chamado com +1 ou -1 quando o usuário clica em ‹ ou ›

import { Icon } from '../pages/kaguya/ui/Icons'
import { toISO, addDays, todayISO, MONTHS_PT, WEEKDAY_1 } from '../pages/kaguya/lib/dateUtils'

interface MiniCalendarProps {
  // Define qual mês a grade exibe (ano + mês extraídos; o dia é ignorado)
  anchor: Date
  // Data atualmente selecionada em ISO ou "" para nenhuma
  selected: string
  // Callback ao clicar em um dia — recebe a data em ISO
  onSelect: (iso: string) => void
  // Callback ao clicar nos botões de navegação: +1 = próximo, -1 = anterior
  onNavMonth: (delta: 1 | -1) => void
}

export function MiniCalendar({ anchor, selected, onSelect, onNavMonth }: MiniCalendarProps) {
  // Data de hoje para marcar visualmente (classe .today)
  const today = todayISO()

  // Primeiro dia do mês que está sendo exibido (sempre dia 1)
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)

  // Ponto de início da grade: domingo antes (ou igual) ao dia 1.
  // Se o dia 1 for domingo (getDay() === 0), gridStart = first.
  // Se for segunda (getDay() === 1), gridStart = first - 1 dia, etc.
  const gridStart = addDays(first, -first.getDay())

  // 42 células = 6 linhas × 7 colunas (suficiente para qualquer mês do ano)
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))

  // Título do cabeçalho: "jun 2026" (mês em minúsculas + ano)
  const title = `${MONTHS_PT[anchor.getMonth()]} ${anchor.getFullYear()}`

  return (
    <div className="mini">

      {/* ── Cabeçalho: título + botões de navegação ── */}
      <div className="mini-head">
        {/* Nome do mês e ano, capitalizado via CSS (text-transform: capitalize) */}
        <span className="mini-title">{title}</span>

        {/* Botões ‹ (mês anterior) e › (próximo mês) */}
        <div className="mini-nav">
          <button
            type="button"
            onClick={() => onNavMonth(-1)}
            aria-label="Mês anterior"
          >
            <Icon name="back" size={12} />
          </button>
          <button
            type="button"
            onClick={() => onNavMonth(1)}
            aria-label="Próximo mês"
          >
            <Icon name="chevron" size={12} />
          </button>
        </div>
      </div>

      {/* ── Grade de 7 colunas: cabeçalho + 42 células de dia ── */}
      <div className="mini-grid">

        {/* Cabeçalho dos dias: D S T Q Q S S */}
        {WEEKDAY_1.map((letra, i) => (
          <div key={i} className="mini-dow">{letra}</div>
        ))}

        {/* Células de dia (6 semanas × 7 dias = 42 células) */}
        {days.map((d) => {
          const iso = toISO(d)

          // .dim = dia pertence ao mês anterior ou seguinte (fora do mês exibido)
          const isOutside  = d.getMonth() !== anchor.getMonth()
          // .today = é o dia atual
          const isToday    = iso === today
          // .sel = é a data selecionada pelo usuário
          const isSelected = iso === selected

          // Combina as classes CSS conforme o estado do dia
          const cls = [
            'mini-day',
            isOutside  && 'dim',    // cinza apagado para dias fora do mês
            isToday    && 'today',  // acento de cor + negrito
            isSelected && 'sel',    // círculo preenchido com --kg
          ].filter(Boolean).join(' ')

          return (
            <div
              key={iso}
              className={cls}
              role="button"
              tabIndex={0}
              aria-label={`${d.getDate()} de ${MONTHS_PT[d.getMonth()]}`}
              aria-pressed={isSelected}
              onClick={() => onSelect(iso)}
              onKeyDown={(e) => {
                // Acessibilidade: Enter também seleciona
                if (e.key === 'Enter') onSelect(iso)
              }}
            >
              {d.getDate()}
            </div>
          )
        })}
      </div>
    </div>
  )
}
