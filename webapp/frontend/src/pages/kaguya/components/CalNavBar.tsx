// CalNavBar — barra de navegação do Calendar Hub (fatia 019, T010).
// Exibe: título (mês/ano ou dia completo) + label "SEMANA N" (view semana),
// botões ‹ / Hoje / › e segmentado Dia/Semana/Mês.
// Componente puro: sem estado próprio, tudo via props.
//
// Classes do handoff (spec 019):
//   .cal-bar         → container da barra (backdrop blur)
//   .cal-title       → wrapper do título + sublabel
//   .cal-month       → rótulo principal (22px/800; capitalize via CSS)
//   .cal-week-lbl    → sublabel "SEMANA N" (mono 11px uppercase; só na view semana)
//   .cal-spacer      → flex:1, empurra controles para a direita
//   .cal-nav         → grupo de botões de navegação
//   .cal-iconbtn     → botão ícone 30×30
//   .cal-today       → botão "Hoje" 32px
//   .cal-seg         → segmented control Dia/Semana/Mês
//   .cal-seg button.on → botão ativo do segmented

import { Icon } from '../ui/Icons'

// ── Helpers de data ─────────────────────────────────────────────────────────

// Avança n dias a partir de d (imutável — retorna novo Date)
function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

// Retorna o número da semana ISO 8601 de um Date.
// A semana começa na segunda-feira; a primeira semana do ano é aquela que contém
// a primeira quinta-feira do ano.
function isoWeek(d: Date): number {
  // Usamos UTC para evitar surpresas de fuso horário
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = tmp.getUTCDay() || 7    // 0=Dom→7, 1=Seg→1 … 6=Sáb→6
  // Avança até a quinta-feira da mesma semana ISO (def. ISO 8601)
  tmp.setUTCDate(tmp.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1))
  return Math.ceil((((tmp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
}

// Nomes completos dos meses em pt-BR (para o rótulo semana/mês)
const MONTHS_PT = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

// Abreviaturas de mês em pt-BR (para o rótulo da view dia)
const MONTHS_SHORT = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
]

// Abreviaturas de dia da semana em pt-BR (para a view dia — capitalize via CSS)
const DAYS_PT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

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
  // ── Rótulo principal (capitalize automático via CSS) ──────────────────────
  // View semana/mês → "junho 2026"
  // View dia → "seg, 15 jun" → CSS capitaliza para "Seg, 15 Jun"
  let monthLabel: string
  if (view === 'day') {
    const dow = DAYS_PT[refDate.getDay()]
    const d   = refDate.getDate()
    const mon = MONTHS_SHORT[refDate.getMonth()]
    monthLabel = `${dow}, ${d} ${mon}`
  } else {
    monthLabel = `${MONTHS_PT[refDate.getMonth()]} ${refDate.getFullYear()}`
  }

  // ── Número da semana ISO (calculado pela quinta-feira da semana visível) ──
  // A "semana visível" na view semana começa no domingo anterior a refDate.
  // ISO 8601 define a semana pelo dia da quinta-feira — usamos domingo+4.
  // Isso é mais preciso do que usar refDate diretamente (que pode ser sáb/dom
  // e estar na semana ISO seguinte/anterior à que o usuário está vendo).
  const sunday   = addDays(refDate, -refDate.getDay())   // domingo da semana visível
  const thursday = addDays(sunday, 4)                    // quinta-feira da mesma semana
  const weekNum  = isoWeek(thursday)

  return (
    <div className="cal-bar">
      {/* ── Título: rótulo principal + (só semana) sublabel SEMANA N ── */}
      <div className="cal-title">
        {/* Rótulo principal: mês+ano ou dia-da-semana+data */}
        <span className="cal-month">{monthLabel}</span>
        {/* Sublabel mono: "SEMANA N" exibido apenas na view semana */}
        {view === 'week' && (
          <span className="cal-week-lbl">SEMANA {weekNum}</span>
        )}
      </div>

      {/* Espaçador flexível: empurra os controles de navegação para a direita */}
      <div className="cal-spacer" />

      {/* ── Controles de navegação: ‹ | Hoje | › ── */}
      <div className="cal-nav">
        {/* Botão retroceder */}
        <button
          className="cal-iconbtn"
          onClick={() => onNav(-1)}
          aria-label="Anterior"
          title="Período anterior"
        >
          <Icon name="back" size={15} />
        </button>

        {/* Botão "Hoje": volta ao período que contém a data atual */}
        <button className="cal-today" onClick={onToday}>
          Hoje
        </button>

        {/* Botão avançar */}
        <button
          className="cal-iconbtn"
          onClick={() => onNav(1)}
          aria-label="Próximo"
          title="Próximo período"
        >
          <Icon name="chevron" size={15} />
        </button>
      </div>

      {/* ── Segmented control: Dia / Semana / Mês ── */}
      {/* Classe ativa: 'on' (não 'active') — alinhado com o CSS do handoff */}
      <div className="cal-seg">
        {(['day', 'week', 'month'] as const).map((v) => {
          const labels: Record<typeof v, string> = { day: 'Dia', week: 'Semana', month: 'Mês' }
          return (
            <button
              key={v}
              className={view === v ? 'on' : ''}
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
