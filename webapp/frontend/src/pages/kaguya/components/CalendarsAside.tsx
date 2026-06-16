// CalendarsAside — sidebar lateral direita do Calendar Hub (fatia 019, T013/T022).
// Estrutura do handoff (spec 019):
//   .cal-aside
//     .cal-aside-scroll (scroll interno)
//       .mini (mini-mês: .mini-head + .mini-grid/.mini-dow/.mini-day)
//       .cal-srch (campo de pesquisa decorativo — sem funcionalidade real)
//       .cal-aside-sec × N (um por conta)
//         .cal-aside-head (label da conta)
//         .cal-item × M (um por calendário: .ci-box + .ci-name + .ci-tag + .ci-eye × 2)
//           .cal-colors > .cal-sw × 10 (paleta de cores, abre no hover do paint)
//       .cal-aside-sec (bandeja sem horário — se houver tarefas)
//         .cal-aside-head "Sem horário"
//         .cal-tray-card × N (arrastáveis → TimeGrid via text/task-id)
//
// Faixa de semana no mini-mês usa Set-based approach para wk-start/wk-end
// (necessário para os pseudo-elementos de banda arredondada no CSS).

import { useState, useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../ui/Icons'
import { kaguyaApi, CAL_SWATCHES, isGcal } from '../kaguyaApi'
import type { Calendar, Task } from '../types'

// ── Helpers de data ─────────────────────────────────────────────────────────

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

// Retorna um Set com os 7 ISO strings da semana (Dom→Sáb) que contém `selectedDate`.
// Usado para marcar a faixa .in-week no mini-mês com as classes wk-start e wk-end.
function buildWeekSet(selectedDate: string): { set: Set<string>; sunISO: string; satISO: string } {
  const ref = new Date(selectedDate + 'T00:00:00')
  const sun = addDays(ref, -ref.getDay())   // domingo da semana selecionada
  const sunISO = toISO(sun)
  const satISO = toISO(addDays(sun, 6))
  const set = new Set<string>()
  for (let i = 0; i < 7; i++) set.add(toISO(addDays(sun, i)))
  return { set, sunISO, satISO }
}

// Nomes dos meses em pt-BR abreviados (para o mini-mês).
const MONTHS_PT = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
]

// Abreviações de 1 letra para os dias da semana (Dom → Sáb).
const WEEKDAY_1 = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

// ── Props ────────────────────────────────────────────────────────────────────

interface CalendarsAsideProps {
  // Data de referência do calendário principal (inicializa o mini-mês)
  refDate: Date
  // Data selecionada/destacada no calendário principal (ISO "AAAA-MM-DD")
  selectedDate: string
  // Callback ao clicar em um dia no mini-mês
  onDayClick: (date: string) => void
  // Callback quando a visibilidade ou cor de um calendário muda
  onSourcesChanged?: () => void
  // Tarefas sem horário na janela visível — exibidas na bandeja arrastável
  unscheduled?: Task[]
}

// ── Componente ───────────────────────────────────────────────────────────────

export function CalendarsAside({
  refDate,
  selectedDate,
  onDayClick,
  onSourcesChanged,
  unscheduled,
}: CalendarsAsideProps) {
  // Âncora do mini-mês: estado interno, independente do calendário principal
  const [miniAnchor, setMiniAnchor] = useState<Date>(
    () => new Date(refDate.getFullYear(), refDate.getMonth(), 1)
  )

  // Lista de fontes de calendário carregadas do hub
  const [sources, setSources] = useState<Calendar[]>([])

  // Status do Google Calendar: null enquanto carrega; { connected, reason } depois
  const [gcalStatus, setGcalStatus] = useState<{ connected: boolean; reason: string | null } | null>(null)

  // ID do calendário com o color picker aberto (null = fechado)
  const [colorPickerId, setColorPickerId] = useState<string | null>(null)

  // Ref para fechar o color picker ao clicar fora
  const colorPickerRef = useRef<HTMLDivElement | null>(null)

  const todayISO = toISO(new Date())

  // ── Carrega fontes na montagem ──────────────────────────────────────────────
  useEffect(() => {
    kaguyaApi.calendarSources()
      .then((srcs) => {
        setSources(srcs)
        // Verifica autenticação do Google Calendar se houver qualquer fonte gcal
        if (srcs.some((s) => isGcal(s.id))) {
          kaguyaApi.gcalStatus()
            .then(setGcalStatus)
            .catch(() => setGcalStatus({ connected: false, reason: 'Erro ao verificar autenticação' }))
        }
      })
      .catch(() => setSources([]))
  }, [])

  // ── Fecha o color picker ao clicar fora dele ──────────────────────────────
  useEffect(() => {
    if (!colorPickerId) return
    function handler(e: MouseEvent) {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) {
        setColorPickerId(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [colorPickerId])

  // ── Handlers ───────────────────────────────────────────────────────────────

  // Navega o mini-mês um mês para frente (+1) ou para trás (-1)
  function navMini(delta: 1 | -1) {
    setMiniAnchor((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1))
  }

  // Alterna a visibilidade de um calendário com atualização otimista
  async function toggleVisible(cal: Calendar) {
    const updated = sources.map((s) =>
      s.id === cal.id ? { ...s, visible: !s.visible } : s
    )
    setSources(updated)   // otimista: não espera a API para não piscar
    try {
      await kaguyaApi.setCalendarPref(cal.id, { visible: !cal.visible })
      onSourcesChanged?.()
    } catch {
      setSources(sources)  // reverte em caso de falha
    }
  }

  // Aplica uma nova cor a um calendário com atualização otimista
  async function applyColor(cal: Calendar, color: string) {
    setColorPickerId(null)  // fecha a paleta imediatamente
    const updated = sources.map((s) =>
      s.id === cal.id ? { ...s, color } : s
    )
    setSources(updated)
    try {
      await kaguyaApi.setCalendarPref(cal.id, { color })
      onSourcesChanged?.()
    } catch {
      setSources(sources)
    }
  }

  // ── Mini-mês ───────────────────────────────────────────────────────────────

  const first = new Date(miniAnchor.getFullYear(), miniAnchor.getMonth(), 1)
  const gridStart = addDays(first, -first.getDay())  // domingo antes do dia 1
  const miniDays = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))

  const miniTitle = `${MONTHS_PT[miniAnchor.getMonth()]} ${miniAnchor.getFullYear()}`

  // Constrói o Set da semana selecionada para calcular wk-start/wk-end
  // (necessário para a banda de semana arredondada no mini-mês)
  const { set: weekSet, sunISO: wkSunISO, satISO: wkSatISO } = selectedDate
    ? buildWeekSet(selectedDate)
    : { set: new Set<string>(), sunISO: '', satISO: '' }

  // ── Agrupa fontes por conta (ex.: "makima" ou email Google) ───────────────
  const sourcesByAccount = sources.reduce<Record<string, Calendar[]>>((acc, s) => {
    const key = s.account
    if (!acc[key]) acc[key] = []
    acc[key].push(s)
    return acc
  }, {})

  // ID do primeiro calendário Google da lista — o aviso ⚠️ de desconexão aparece só nele
  const firstGcalId = sources.find((s) => isGcal(s.id))?.id

  const hasTray = (unscheduled?.length ?? 0) > 0

  return (
    <aside className="cal-aside">
      <div className="cal-aside-scroll">

        {/* ── Mini-mês ──────────────────────────────────────────────────────── */}
        <div className="mini">
          {/* Cabeçalho: "jan 2026" + botões ‹ › */}
          <div className="mini-head">
            <span className="mini-title">{miniTitle}</span>
            <div className="mini-nav">
              <button onClick={() => navMini(-1)} aria-label="Mês anterior">
                <Icon name="back" size={12} />
              </button>
              <button onClick={() => navMini(1)} aria-label="Próximo mês">
                <Icon name="chevron" size={12} />
              </button>
            </div>
          </div>

          {/* Grade: 7 colunas — header de dias + 42 células */}
          <div className="mini-grid">
            {/* Cabeçalho: inicial do dia da semana (D S T Q Q S S) */}
            {WEEKDAY_1.map((l, i) => (
              <div key={i} className="mini-dow">{l}</div>
            ))}

            {/* Células de dia (42 = 6 semanas × 7 dias) */}
            {miniDays.map((d) => {
              const iso = toISO(d)
              const isToday    = iso === todayISO
              const isSelected = iso === selectedDate
              const isOutside  = d.getMonth() !== miniAnchor.getMonth()

              // Faixa de semana: a banda que envolve a semana selecionada.
              // wk-start (domingo) e wk-end (sábado) definem os cantos arredondados.
              // O selected não participa da faixa (tem seu próprio círculo).
              const isInWeek = weekSet.has(iso) && !isSelected
              const isWkStart = isInWeek && iso === wkSunISO
              const isWkEnd   = isInWeek && iso === wkSatISO

              const classes = [
                'mini-day',
                isToday    && 'today',
                isSelected && 'sel',
                isInWeek   && 'in-week',
                isWkStart  && 'wk-start',
                isWkEnd    && 'wk-end',
                isOutside  && 'dim',
              ].filter(Boolean).join(' ')

              return (
                <div
                  key={iso}
                  className={classes}
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

        {/* ── Campo de pesquisa decorativo ──────────────────────────────────── */}
        {/* Sem funcionalidade real: apenas alinha o espaço visual do design */}
        <div className="cal-srch" aria-hidden="true">
          <Icon name="search" size={12} />
          <span>Pesquisar</span>
        </div>

        {/* ── Lista de calendários por conta ─────────────────────────────────── */}
        {Object.entries(sourcesByAccount).map(([account, cals]) => (
          <section key={account} className="cal-aside-sec">
            {/* Rótulo da conta */}
            <div className="cal-aside-head">
              {account === 'makima' ? 'Makima' : account}
            </div>

            {/* Um item por calendário da conta */}
            {cals.map((cal) => (
              <div
                key={cal.id}
                // off = calendário oculto (a classe muda visual do ci-box via CSS)
                className={`cal-item${cal.visible === false ? ' off' : ''}`}
                // --cc: cor corrente do calendário — consumida por .ci-box, .ci-tag, etc.
                style={{ '--cc': cal.color || 'var(--kg)' } as CSSProperties}
              >
                {/* ci-box: quadrado colorido — clique = toggle de visibilidade */}
                <div
                  className="ci-box"
                  onClick={() => toggleVisible(cal)}
                  role="checkbox"
                  aria-checked={cal.visible !== false}
                  aria-label={`${cal.visible !== false ? 'Ocultar' : 'Mostrar'} ${cal.name}`}
                  title={cal.visible !== false ? 'Ocultar' : 'Mostrar'}
                >
                  {/* Ícone de check quando o calendário está visível */}
                  {cal.visible !== false && <Icon name="check" size={9} />}
                </div>

                {/* ci-name: nome do calendário + aviso gcal se desconectado */}
                <span className="ci-name">
                  {cal.name}
                  {cal.id === firstGcalId && gcalStatus !== null && !gcalStatus.connected && (
                    <span
                      title={gcalStatus.reason ?? 'Google desconectado — reautorize'}
                      style={{ marginLeft: 4, fontSize: 10, color: 'oklch(0.65 0.20 30)', cursor: 'help', userSelect: 'none' }}
                      aria-label="Google Calendar desconectado"
                    >
                      ⚠️
                    </span>
                  )}
                </span>

                {/* ci-tag: badge "padrão" para o calendário principal da Kaguya */}
                {cal.id === 'kaguya' && <span className="ci-tag">padrão</span>}

                {/* ci-eye: botão paleta — abre o color picker (visível no hover) */}
                <button
                  className="ci-eye"
                  onClick={() => setColorPickerId(colorPickerId === cal.id ? null : cal.id)}
                  title={`Mudar cor de ${cal.name}`}
                  aria-label={`Mudar cor de ${cal.name}`}
                >
                  <Icon name="paint" size={13} />
                </button>

                {/* ci-eye: botão olho — alterna visibilidade (visível no hover) */}
                <button
                  className="ci-eye"
                  onClick={() => toggleVisible(cal)}
                  title={cal.visible !== false ? `Ocultar ${cal.name}` : `Mostrar ${cal.name}`}
                  aria-label={cal.visible !== false ? `Ocultar ${cal.name}` : `Mostrar ${cal.name}`}
                >
                  <Icon name={cal.visible !== false ? 'eye' : 'eyeOff'} size={13} />
                </button>

                {/* Paleta de cores: abre ao clicar no botão de paleta */}
                {colorPickerId === cal.id && (
                  <div
                    ref={colorPickerRef}
                    className="cal-colors"
                    role="listbox"
                    aria-label={`Escolher cor para ${cal.name}`}
                  >
                    {CAL_SWATCHES.map((swatch) => (
                      <button
                        key={swatch}
                        // cal-sw: círculo de cor; classe 'on' = cor atualmente selecionada
                        className={`cal-sw${cal.color === swatch ? ' on' : ''}`}
                        // --cc: cor do swatch — CSS usa var(--cc) para o background
                        style={{ '--cc': swatch } as CSSProperties}
                        role="option"
                        aria-selected={cal.color === swatch}
                        onClick={() => applyColor(cal, swatch)}
                        title={swatch}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </section>
        ))}

        {/* ── Bandeja "Sem horário" ─────────────────────────────────────────── */}
        {/* Mostra tarefas da janela visível que têm due_date mas sem start_at/due_time.
            Cada card é arrastável para o TimeGrid via drag-and-drop (payload: text/task-id).
            O TimeGrid já consome esse payload em onDrop → onTimeDrop. */}
        {hasTray && (
          <section className="cal-aside-sec">
            <div className="cal-aside-head">Sem horário</div>
            {unscheduled!.map((task) => (
              <div
                key={task.id}
                className="cal-tray-card"
                draggable
                onDragStart={(e) => {
                  // Envia o ID da tarefa como dado do drag — o TimeGrid lê com getData
                  e.dataTransfer.setData('text/task-id', String(task.id))
                  e.dataTransfer.effectAllowed = 'move'
                }}
                title={`Arrastar para o grid de horários: ${task.title}`}
              >
                {/* Barra de cor lateral (cor da Kaguya via var(--kg)) */}
                <div className="tc-bar" style={{ '--cc': 'var(--kg)' } as CSSProperties} />
                {/* Nome da tarefa */}
                <span className="tc-name">{task.title}</span>
                {/* Data de vencimento como estimativa */}
                {task.due_date && (
                  <span className="tc-est">{task.due_date}</span>
                )}
              </div>
            ))}
          </section>
        )}

      </div>
    </aside>
  )
}
