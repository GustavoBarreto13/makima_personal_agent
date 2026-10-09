// Lateral do calendário: mini-mês para navegar, as fontes (Kaguya, Google e os outros agentes) agrupadas por conta —
// ligar/desligar, recolorir e o contexto Trabalho/Pessoal dos calendários Google — o aviso de Google desconectado e as
// bandejas de tarefas arrastáveis: “Sem horário” (com data, sem hora) e “Sem data” (ainda sem vencimento). Arrastar uma
// tarefa para a grade (ou para um dia do mês) marca o horário/dia.

import { useMemo, useState, type CSSProperties } from 'react'
import { Icon, IconButton, MiniCalendar } from '../../../design'
import { isGcalId } from '../lib/calendar'
import { CAL_SWATCHES } from '../lib/calSwatches'
import type { Calendar, Task } from '../types'

export interface GcalStatus { connected: boolean; reason: string | null }

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
    <section className="kn-cside-sec" aria-label={title}>
      <h3 className="kn-h3">{title} <span className="ds-mono">{tasks.length}</span></h3>
      <ul className="kn-tray">
        {tasks.map((t) => (
          <li
            key={t.id}
            className="kn-tray-card"
            draggable
            onDragStart={(e) => { e.dataTransfer.setData('text/task-id', String(t.id)); e.dataTransfer.effectAllowed = 'move' }}
            title={`Arraste para o calendário: ${t.title}`}
          >
            <Icon name="drag" size={12} />
            <button type="button" className="kn-main" onClick={() => onOpenTask(t.id)}><span className="kn-title">{t.title}</span></button>
          </li>
        ))}
      </ul>
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
    <aside className="kn-cside" aria-label="Calendários">
      {/* `key` reinicia o mini-mês quando a navegação principal muda de mês. */}
      <MiniCalendar key={refDate.slice(0, 7)} value={refDate} onPick={onPick} today={today} />

      {Object.entries(byAccount).map(([account, list]) => (
        <section key={account} className="kn-cside-sec" aria-label={account === 'makima' ? 'Makima' : account}>
          <h3 className="kn-h3">{account === 'makima' ? 'Makima' : account}</h3>
          <ul className="kn-cals">
            {list.map((cal) => {
              const on = cal.visible !== false
              return (
                <li key={cal.id} className={on ? '' : 'kn-off'} style={{ '--kn-cc': cal.color || 'var(--ds-accent)' } as CSSProperties}>
                  <button type="button" className="kn-calbox" role="checkbox" aria-checked={on} aria-label={`${on ? 'Ocultar' : 'Mostrar'} ${cal.name}`} onClick={() => onToggle(cal)}>
                    {on && <Icon name="check" size={10} strokeWidth={3} />}
                  </button>
                  <span className="kn-calname">
                    {cal.name}
                    {cal.id === firstGcal && warn && <Icon name="warning" size={12} aria-label="Google Calendar desconectado" />}
                  </span>
                  {cal.id === 'kaguya' && <span className="ds-mono kn-caltag">padrão</span>}
                  {isGcalId(cal.id) && cal.kind === 'integration' && (
                    <IconButton icon={cal.context === 'work' ? 'work' : 'personal'} size={13} label={cal.context === 'work' ? `${cal.name}: Trabalho (clique para Pessoal)` : `${cal.name}: Pessoal (clique para Trabalho)`} onClick={() => onContext(cal)} />
                  )}
                  <IconButton icon="palette" size={13} label={`Mudar a cor de ${cal.name}`} aria-expanded={picker === cal.id} onClick={() => setPicker(picker === cal.id ? null : cal.id)} />
                  {picker === cal.id && (
                    <div className="kn-swatches" role="listbox" aria-label={`Cor de ${cal.name}`}>
                      {CAL_SWATCHES.map((s, i) => (
                        <button key={s} type="button" role="option" aria-selected={cal.color === s} aria-label={`Cor ${i + 1}`} className={`kn-sw-btn${cal.color === s ? ' kn-on' : ''}`} style={{ '--kn-cc': s } as CSSProperties} onClick={() => { setPicker(null); onColor(cal, s) }} />
                      ))}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      ))}
      {warn && !firstGcal && (
        <p className="ds-hint kn-cwarn" role="alert"><Icon name="warning" size={12} /> {gcal.reason ?? 'Google Calendar desconectado — reautorize'}</p>
      )}

      <Tray title="Sem horário" tasks={unscheduled} onOpenTask={onOpenTask} />
      <Tray title="Sem data" tasks={undated} onOpenTask={onOpenTask} />
    </aside>
  )
}
