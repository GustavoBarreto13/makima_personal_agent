// Lateral do calendário, com o markup do shell antigo: mini-mês (faixa da semana selecionada), busca, as fontes (Kaguya,
// Google e os outros agentes) agrupadas por conta — caixinha colorida para ligar/desligar, contexto Trabalho/Pessoal dos
// calendários Google, paleta de cores —, o aviso de Google desconectado e as bandejas de tarefas arrastáveis: “Sem horário”
// (com data, sem hora) e “Sem data”. Arrastar uma tarefa para a grade (ou para um dia do mês) marca o horário/dia.

import { useMemo, useState, type CSSProperties } from 'react'
import { Icon } from '../../../design'
import { isoDate, MONTHS_SHORT, parseISODate } from '../../../design/core/format'
import { isGcalId } from '../lib/calendar'
import { CAL_SWATCHES } from '../lib/calSwatches'
import type { Calendar, Task } from '../types'

export interface GcalStatus { connected: boolean; reason: string | null }

const WEEKDAY_1 = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

const addDays = (d: Date, n: number): Date => { const r = new Date(d); r.setDate(r.getDate() + n); return r }

/** Mini-mês: navega por conta própria; a semana da data selecionada ganha a faixa arredondada. */
function MiniMonth({ refDate, today, onPick }: { refDate: string; today: string; onPick: (iso: string) => void }) {
  const sel = parseISODate(refDate)
  const [anchor, setAnchor] = useState(() => new Date(sel.getFullYear(), sel.getMonth(), 1))
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  const start = addDays(first, -first.getDay())
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i))
  const sun = addDays(sel, -sel.getDay())
  const week = new Set(Array.from({ length: 7 }, (_, i) => isoDate(addDays(sun, i))))
  const sunISO = isoDate(sun)
  const satISO = isoDate(addDays(sun, 6))
  const nav = (delta: number) => setAnchor((a) => new Date(a.getFullYear(), a.getMonth() + delta, 1))

  return (
    <div className="mini">
      <div className="mini-head">
        <span className="mini-title">{MONTHS_SHORT[anchor.getMonth()]} {anchor.getFullYear()}</span>
        <div className="mini-nav">
          <button type="button" onClick={() => nav(-1)} aria-label="Mês anterior"><Icon name="left" size={12} /></button>
          <button type="button" onClick={() => nav(1)} aria-label="Próximo mês"><Icon name="right" size={12} /></button>
        </div>
      </div>
      <div className="mini-grid">
        {WEEKDAY_1.map((l, i) => <div key={i} className="mini-dow">{l}</div>)}
        {days.map((d) => {
          const iso = isoDate(d)
          const isSel = iso === refDate
          const inWeek = week.has(iso) && !isSel
          const classes = ['mini-day', iso === today && 'today', isSel && 'sel', inWeek && 'in-week', inWeek && iso === sunISO && 'wk-start', inWeek && iso === satISO && 'wk-end', d.getMonth() !== anchor.getMonth() && 'dim'].filter(Boolean).join(' ')
          return (
            <div key={iso} className={classes} role="button" tabIndex={0} aria-label={`Dia ${d.getDate()}`} aria-pressed={isSel} onClick={() => onPick(iso)} onKeyDown={(e) => { if (e.key === 'Enter') onPick(iso) }}>
              {d.getDate()}
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface Props {
  refDate: string
  today: string
  onPick: (iso: string) => void
  cals: Calendar[]
  gcal: GcalStatus | null
  onToggle: (cal: Calendar) => void
  onContext: (cal: Calendar) => void
  onColor: (cal: Calendar, color: string) => void
  unscheduled: Task[]
  undated: Task[]
  onOpenTask: (id: number) => void
}

function Tray({ title, tasks, onOpenTask }: { title: string; tasks: Task[]; onOpenTask: (id: number) => void }) {
  if (tasks.length === 0) return null
  return (
    <section className="cal-aside-sec cal-tray" aria-label={title}>
      <div className="cal-aside-head">{title}</div>
      {tasks.map((t) => (
        <div
          key={t.id}
          className="cal-tray-card"
          draggable
          onDragStart={(e) => { e.dataTransfer.setData('text/task-id', String(t.id)); e.dataTransfer.effectAllowed = 'move' }}
          title={`Arraste para o calendário: ${t.title}`}
        >
          <div className="tc-bar" style={{ '--cc': 'var(--kg)' } as CSSProperties} />
          <button type="button" className="tc-name tc-open" onClick={() => onOpenTask(t.id)}>{t.title}</button>
          {t.due_date && <span className="tc-est">{t.due_date.slice(8)}/{t.due_date.slice(5, 7)}</span>}
        </div>
      ))}
    </section>
  )
}

export function CalendarSide({ refDate, today, onPick, cals, gcal, onToggle, onContext, onColor, unscheduled, undated, onOpenTask }: Props) {
  const [picker, setPicker] = useState<string | null>(null)
  const byAccount = useMemo(() => {
    const out: Record<string, Calendar[]> = {}
    for (const c of cals) (out[c.account] ??= []).push(c)
    return out
  }, [cals])
  // O aviso de desconexão aparece uma vez, no primeiro calendário Google de integração (ou sozinho, sem nenhum).
  const firstGcal = cals.find((c) => isGcalId(c.id) && c.kind === 'integration')?.id
  const warn = gcal && !gcal.connected && gcal.reason !== 'GOOGLE_CALENDAR_REFRESH_TOKEN não configurado'

  return (
    <aside className="cal-aside" aria-label="Calendários">
      <div className="cal-aside-scroll">
        {/* `key` reinicia o mini-mês quando a navegação principal muda de mês. */}
        <MiniMonth key={refDate.slice(0, 7)} refDate={refDate} today={today} onPick={onPick} />

        {Object.entries(byAccount).map(([account, list]) => (
          <section key={account} className="cal-aside-sec" aria-label={account === 'makima' ? 'Makima' : account}>
            <div className="cal-aside-head">{account === 'makima' ? 'Makima' : account}</div>
            {list.map((cal) => {
              const on = cal.visible !== false
              return (
                <div key={cal.id} className={`cal-item${on ? '' : ' off'}`} style={{ '--cc': cal.color || 'var(--kg)' } as CSSProperties}>
                  <div className="ci-box" role="checkbox" tabIndex={0} aria-checked={on} aria-label={`${on ? 'Ocultar' : 'Mostrar'} ${cal.name}`} title={on ? 'Ocultar' : 'Mostrar'} onClick={() => onToggle(cal)} onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onToggle(cal) } }}>
                    {on && <Icon name="check" size={9} />}
                  </div>
                  <span className="ci-name">
                    {cal.name}
                    {cal.id === firstGcal && warn && <Icon name="warning" size={12} label="Google Calendar desconectado" />}
                  </span>
                  {cal.id === 'kaguya' && <span className="ci-tag">padrão</span>}
                  {isGcalId(cal.id) && cal.kind === 'integration' && (
                    <button type="button" className="ci-eye" onClick={() => onContext(cal)} title={cal.context === 'work' ? 'Trabalho — clique para marcar Pessoal' : 'Pessoal — clique para marcar Trabalho'} aria-label={cal.context === 'work' ? `${cal.name}: Trabalho (clique para Pessoal)` : `${cal.name}: Pessoal (clique para Trabalho)`}>
                      <Icon name={cal.context === 'work' ? 'work' : 'personal'} size={13} />
                    </button>
                  )}
                  <button type="button" className="ci-eye" onClick={() => setPicker(picker === cal.id ? null : cal.id)} title={`Mudar cor de ${cal.name}`} aria-label={`Mudar a cor de ${cal.name}`} aria-expanded={picker === cal.id}>
                    <Icon name="palette" size={13} />
                  </button>
                  <button type="button" className="ci-eye" onClick={() => onToggle(cal)} title={on ? `Ocultar ${cal.name}` : `Mostrar ${cal.name}`} aria-label={on ? `Esconder ${cal.name}` : `Exibir ${cal.name}`}>
                    <Icon name={on ? 'eye' : 'eye-off'} size={13} />
                  </button>
                  {picker === cal.id && (
                    <div className="cal-colors" role="listbox" aria-label={`Cor de ${cal.name}`}>
                      {CAL_SWATCHES.map((s, i) => (
                        <button key={s} type="button" role="option" aria-selected={cal.color === s} aria-label={`Cor ${i + 1}`} className={`cal-sw${cal.color === s ? ' sel' : ''}`} style={{ background: s } as CSSProperties} onClick={() => { setPicker(null); onColor(cal, s) }} />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </section>
        ))}
        {warn && !firstGcal && (
          <section className="cal-aside-sec">
            <div className="cal-aside-head">Google</div>
            <div role="alert" style={{ padding: '6px 12px 8px', fontSize: 11, color: 'var(--p-high)', lineHeight: 1.5 }} title={gcal.reason ?? 'Google desconectado — reautorize'}>
              <Icon name="warning" size={12} /> {gcal.reason ?? 'Google Calendar desconectado — reautorize'}
            </div>
          </section>
        )}

        <Tray title="Sem horário" tasks={unscheduled} onOpenTask={onOpenTask} />
        <Tray title="Sem data" tasks={undated} onOpenTask={onOpenTask} />
      </div>
    </aside>
  )
}
