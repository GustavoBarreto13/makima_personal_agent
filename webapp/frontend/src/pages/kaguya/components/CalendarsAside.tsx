// CalendarsAside — sidebar lateral direita do Calendar Hub (fatia 019, T013/T022).
// Contém: mini-mês com navegação independente + lista de calendários com toggle/recolor.
// O mini-mês tem estado próprio (`miniAnchor`) independente do calendário principal.
// A lista de calendários carrega via calendarSources() e persiste prefs no banco.

import { useState, useEffect, useRef } from 'react'
import { Icon } from '../ui/Icons'
import { kaguyaApi, CAL_SWATCHES } from '../kaguyaApi'
import type { Calendar } from '../types'

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
function isoWeek(d: Date): number {
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = tmp.getUTCDay() || 7
  tmp.setUTCDate(tmp.getUTCDate() + 4 - day)
  const year = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1))
  return Math.ceil((((tmp.getTime() - year.getTime()) / 86400000) + 1) / 7)
}

// Nomes dos meses em pt-BR abreviados.
const MONTHS_PT = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
]

// Abreviações de 1 letra para os dias da semana (começando pelo domingo).
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
  // O pai usa isso para re-buscar a agregação com as prefs atualizadas
  onSourcesChanged?: () => void
}

// ── Componente ───────────────────────────────────────────────────────────────

export function CalendarsAside({
  refDate,
  selectedDate,
  onDayClick,
  onSourcesChanged,
}: CalendarsAsideProps) {
  // Estado interno do mini-mês: qual mês está visível.
  const [miniAnchor, setMiniAnchor] = useState<Date>(
    () => new Date(refDate.getFullYear(), refDate.getMonth(), 1)
  )

  // Lista de fontes de calendário carregadas do hub.
  const [sources, setSources] = useState<Calendar[]>([])

  // Estado de conexão do Google Calendar: null enquanto carrega,
  // depois { connected: boolean, reason: string | null }.
  // Só relevante quando existe a fonte "gcal" na lista.
  const [gcalStatus, setGcalStatus] = useState<{ connected: boolean; reason: string | null } | null>(null)

  // ID do calendário cujo seletor de cor está aberto (null = nenhum).
  const [colorPickerId, setColorPickerId] = useState<string | null>(null)

  // Ref para fechar o color picker ao clicar fora.
  const colorPickerRef = useRef<HTMLDivElement | null>(null)

  // Hoje em ISO para marcar a célula `today`.
  const todayISO = toISO(new Date())

  // ── Carrega fontes na montagem ──────────────────────────────────────────────
  useEffect(() => {
    kaguyaApi.calendarSources()
      .then((srcs) => {
        setSources(srcs)
        // Se a fonte "gcal" existe, verifica se o token OAuth ainda está válido.
        // Isso permite mostrar um aviso visível em vez de a agenda sumir silenciosamente.
        if (srcs.some((s) => s.id === 'gcal')) {
          kaguyaApi.gcalStatus()
            .then(setGcalStatus)
            .catch(() => setGcalStatus({ connected: false, reason: 'Erro ao verificar autenticação' }))
        }
      })
      .catch(() => setSources([]))
  }, [])

  // ── Fecha color picker ao clicar fora ──────────────────────────────────────
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

  // Navega o mini-mês um mês para frente (+1) ou para trás (-1).
  function navMini(delta: 1 | -1) {
    setMiniAnchor((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1))
  }

  // Alterna a visibilidade de um calendário e persiste no banco.
  async function toggleVisible(cal: Calendar) {
    const updated = sources.map((s) =>
      s.id === cal.id ? { ...s, visible: !s.visible } : s
    )
    setSources(updated)  // atualização otimista (não espera a API para não piscar)
    try {
      await kaguyaApi.setCalendarPref(cal.id, { visible: !cal.visible })
      onSourcesChanged?.()  // avisa o pai para re-agregar
    } catch {
      // Reverte em caso de falha de rede
      setSources(sources)
    }
  }

  // Aplica uma nova cor a um calendário e persiste no banco.
  async function applyColor(cal: Calendar, color: string) {
    setColorPickerId(null)  // fecha a paleta
    const updated = sources.map((s) =>
      s.id === cal.id ? { ...s, color } : s
    )
    setSources(updated)  // atualização otimista
    try {
      await kaguyaApi.setCalendarPref(cal.id, { color })
      onSourcesChanged?.()
    } catch {
      setSources(sources)
    }
  }

  // ── Mini-mês: computa as 42 células ────────────────────────────────────────
  const first = new Date(miniAnchor.getFullYear(), miniAnchor.getMonth(), 1)
  const gridStart = addDays(first, -first.getDay())  // domingo antes do dia 1
  const miniDays = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))

  // Semana ISO da data selecionada — para marcar a faixa `.in-week`.
  const selectedWeek = selectedDate ? isoWeek(new Date(selectedDate + 'T00:00:00')) : -1

  const miniTitle = `${MONTHS_PT[miniAnchor.getMonth()]} ${miniAnchor.getFullYear()}`

  // ── Agrupa fontes por conta ─────────────────────────────────────────────────
  // No momento todas as fontes pertencem à conta "makima".
  // O agrupamento usa a chave `account` para futuras contas externas (Google, etc.).
  const sourcesByAccount = sources.reduce<Record<string, Calendar[]>>((acc, s) => {
    const key = s.account
    if (!acc[key]) acc[key] = []
    acc[key].push(s)
    return acc
  }, {})

  return (
    <aside className="cal-aside" data-col="right">

      {/* ── Mini-mês ─────────────────────────────────────────────────────────── */}
      <div className="mini">
        {/* Cabeçalho do mini-mês com navegação */}
        <div className="mini-header">
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

        {/* Grade do mini-mês (7 colunas: 1 header + 6 semanas de dias) */}
        <div className="mini-grid">
          {/* Cabeçalho: inicial do dia da semana */}
          {WEEKDAY_1.map((l, i) => (
            <div key={i} className="mini-hdr">{l}</div>
          ))}

          {/* Células de dia (42 = 6 semanas × 7 dias) */}
          {miniDays.map((d) => {
            const iso = toISO(d)
            const isToday = iso === todayISO
            const isSelected = iso === selectedDate
            const isOutside = d.getMonth() !== miniAnchor.getMonth()
            const cellWeek = isoWeek(d)
            const isInWeek = cellWeek === selectedWeek && selectedWeek !== -1

            const classes = [
              'mini-cell',
              isToday && 'today',
              isSelected && 'selected',
              isInWeek && !isSelected && 'in-week',
              isOutside && 'dim',
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

      {/* ── Lista de calendários por conta ───────────────────────────────────── */}
      {Object.entries(sourcesByAccount).map(([account, cals]) => (
        <section key={account} className="cal-tray">
          {/* Rótulo da conta (ex.: "Makima" ou email do Google) */}
          {/* cal-tray-title = label uppercase monoespaçado do CSS; cal-hint é tooltip fixo — não usar aqui */}
          <div className="cal-tray-title">
            {account === 'makima' ? 'Makima' : account}
          </div>

          {/* Um item por calendário da conta */}
          {cals.map((cal) => (
            <div key={cal.id} className="cal-item">
              {/*
                ci-box é o indicador colorido de 14×14px definido no CSS.
                Deve ser um elemento ISOLADO dentro de .cal-item, não um
                container para nome e toggle — senão esses ficam invisíveis
                espremidos na caixa minúscula.
              */}
              <button
                className="ci-box"
                style={{
                  // A cor da borda/preenchimento do ci-box vem do `color` via currentColor
                  color: cal.color || 'var(--ink-4)',
                  background: cal.visible ? 'currentColor' : 'none',
                  cursor: 'pointer',
                  padding: 0,
                  flexShrink: 0,
                }}
                onClick={() => setColorPickerId(colorPickerId === cal.id ? null : cal.id)}
                aria-label={`Cor de ${cal.name}`}
                title="Mudar cor"
              />

              {/* Nome do calendário — irmão do ci-box, não filho */}
              <span className="cal-item-name">
                {cal.name}
                {/*
                  Aviso de autenticação: aparece apenas na fonte "gcal" E quando o
                  status já foi carregado E a conexão falhou.
                  O tooltip (title) mostra o motivo técnico completo ao passar o mouse.
                */}
                {cal.id === 'gcal' && gcalStatus !== null && !gcalStatus.connected && (
                  <span
                    title={gcalStatus.reason ?? 'Google desconectado'}
                    style={{
                      marginLeft: 4,
                      fontSize: 11,
                      color: 'oklch(0.65 0.20 30)',  // laranja-aviso
                      cursor: 'help',
                      userSelect: 'none',
                    }}
                    aria-label="Google Calendar desconectado — reautorize"
                  >
                    ⚠️
                  </span>
                )}
              </span>

              {/* Botão de toggle de visibilidade */}
              <button
                onClick={() => toggleVisible(cal)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '2px 4px',
                  color: cal.visible ? 'var(--ink-3)' : 'var(--ink-5)',
                  lineHeight: 1,
                  flexShrink: 0,
                  fontSize: 13,
                }}
                aria-label={cal.visible ? `Ocultar ${cal.name}` : `Mostrar ${cal.name}`}
                title={cal.visible ? 'Ocultar' : 'Mostrar'}
              >
                {cal.visible ? '👁' : '·'}
              </button>

              {/* Paleta de cores (aparece ao clicar no dot de cor) */}
              {colorPickerId === cal.id && (
                <div
                  ref={colorPickerRef}
                  className="cal-colors"
                  role="listbox"
                  aria-label="Escolher cor"
                >
                  {CAL_SWATCHES.map((swatch) => (
                    <button
                      key={swatch}
                      role="option"
                      aria-selected={cal.color === swatch}
                      onClick={() => applyColor(cal, swatch)}
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: '50%',
                        background: swatch,
                        border: cal.color === swatch
                          ? '2px solid var(--ink-1)'
                          : '2px solid transparent',
                        cursor: 'pointer',
                        padding: 0,
                      }}
                      title={swatch}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </section>
      ))}

    </aside>
  )
}
