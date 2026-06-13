// CalNavBar — barra de navegação do Calendar Hub (fatia 019, T010).
// Exibe: título com mês/ano + label "SEMANA N" (ISO week), botões de navegação
// ‹ / Hoje / › e o controle segmentado Dia/Semana/Mês.
// É um componente puro: não tem estado próprio, tudo vem de props.

import { Icon } from '../ui/Icons'

// ── Helpers de data ─────────────────────────────────────────────────────────

// Formata um Date como "AAAA-MM-DD" usando a data LOCAL (sem converter para UTC).
function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Retorna o número da semana ISO 8601.
// A semana ISO começa na segunda-feira; a semana que contém a primeira quinta-feira
// do ano é a semana 1. Seguindo o algoritmo padrão.
function isoWeek(d: Date): number {
  // Cria uma cópia em UTC para não ter surpresas de fuso horário
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  // 0=Dom → 7, 1=Seg → 1, …, 6=Sáb → 6
  const day = tmp.getUTCDay() || 7
  // Avança para a quinta-feira da mesma semana ISO
  tmp.setUTCDate(tmp.getUTCDate() + 4 - day)
  // Primeiro dia do ano em UTC
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1))
  // Número da semana = ceil( (dias desde 1º jan + 1) / 7 )
  return Math.ceil((((tmp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
}

// Nomes dos meses em pt-BR para montar o label "junho de 2026".
const MONTHS_PT = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

// ── Props ────────────────────────────────────────────────────────────────────

interface CalNavBarProps {
  // Visão atual do calendário
  view: 'day' | 'week' | 'month'
  // Data de referência para exibir título e semana ISO
  refDate: Date
  // Callback quando o usuário clica em Dia / Semana / Mês
  onViewChange: (v: 'day' | 'week' | 'month') => void
  // Callback de navegação: +1 = avançar, -1 = recuar
  onNav: (delta: 1 | -1) => void
  // Callback para voltar ao período de hoje
  onToday: () => void
}

// ── Componente ───────────────────────────────────────────────────────────────

export function CalNavBar({ view, refDate, onViewChange, onNav, onToday }: CalNavBarProps) {
  // Rótulo "junho de 2026" — capitalizado via CSS (capitalize)
  const monthLabel = `${MONTHS_PT[refDate.getMonth()]} de ${refDate.getFullYear()}`

  // Para o label SEMANA N, o CalNavBar exibe:
  // - na view dia/semana: a semana ISO de refDate
  // - na view mês: a semana ISO do primeiro dia do mês (primeira linha da grade)
  //   (o criador da grade monta a partir de domingo da semana do dia 1, mas o label
  //    mostra a semana do dia 1 em si, que é mais intuitivo)
  const firstOfMonth = new Date(refDate.getFullYear(), refDate.getMonth(), 1)
  const weekNum = view === 'month' ? isoWeek(firstOfMonth) : isoWeek(refDate)

  // Não expõe toISO para fora, mas é usado acima em future helpers se necessário
  void toISO // evita aviso "unused"

  return (
    <div className="cal-bar">
      {/* ── Título: mês/ano + label de semana ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1 }}>
        {/* Mês e ano principal — 22px/800 por padrão; a variante editorial sobrescreve para serif 27px */}
        <span
          style={{
            fontFamily: 'var(--display)',
            fontSize: 22,
            fontWeight: 800,
            color: 'var(--ink)',
            textTransform: 'capitalize',
            lineHeight: 1.15,
          }}
        >
          {monthLabel}
        </span>
        {/* Label de semana ISO — mono 11px uppercase */}
        <span
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: '0.07em',
            color: 'var(--ink-4)',
          }}
        >
          SEMANA {weekNum}
        </span>
      </div>

      {/* ── Controles de navegação: ‹ | Hoje | › ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {/* Botão retroceder (‹ = seta para esquerda) */}
        <button
          className="kg-icon-btn"
          onClick={() => onNav(-1)}
          aria-label="Anterior"
          title="Período anterior"
        >
          <Icon name="back" size={15} />
        </button>

        {/* Botão "Hoje": volta ao período que contém a data atual */}
        <button className="kg-btn kg-btn-ghost" onClick={onToday} style={{ fontSize: 13 }}>
          Hoje
        </button>

        {/* Botão avançar (› = seta para direita / chevron) */}
        <button
          className="kg-icon-btn"
          onClick={() => onNav(1)}
          aria-label="Próximo"
          title="Próximo período"
        >
          <Icon name="chevron" size={15} />
        </button>
      </div>

      {/* ── Segmented control: Dia / Semana / Mês ── */}
      <div className="cal-seg">
        {(['day', 'week', 'month'] as const).map((v) => {
          // Mapeia a key interna para o label em pt-BR
          const labels: Record<typeof v, string> = { day: 'Dia', week: 'Semana', month: 'Mês' }
          return (
            <button
              key={v}
              className={view === v ? 'active' : ''}
              onClick={() => onViewChange(v)}
            >
              {labels[v]}
            </button>
          )
        })}
      </div>
    </div>
  )
}
