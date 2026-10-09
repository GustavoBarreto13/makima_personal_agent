// Hábitos: a consistência cresce com a repetição e perdoa uma falha isolada (modelo “caixa d'água”, nada de ofensiva).
// Cada cartão tem o anel de CONSISTÊNCIA (0–100), a TENDÊNCIA e o RECENTE (“5/6 nas últimas 2 semanas”), o check-in de
// hoje (mensurável pede o valor), focar, entrar no Meu Dia e o mapa de calor do ano. Hábitos arquivados ficam numa aba
// própria, de onde dá para restaurar (o histórico volta intacto).

import { useCallback, useState } from 'react'
import { Button, Chip, EmptyState, ErrorState, Heatmap, Icon, IconButton, Input, LoadingState, Page, ProgressRing, Tabs, toast } from '../../../design'
import { fmtDate } from '../../../design/core/format'
import { kaguyaApi } from '../api'
import { HabitModal } from '../components/HabitModal'
import { useKaguya } from '../context'
import { useLoad } from '../lib/useLoad'
import type { Habit, HabitHeatDay, HabitSchedule, HabitTrend } from '../types'

const TREND: Record<HabitTrend, { icon: 'trend-up' | 'trend-down' | 'forward'; label: string }> = {
  up: { icon: 'trend-up', label: 'subindo' }, down: { icon: 'trend-down', label: 'caindo' }, flat: { icon: 'forward', label: 'estável' },
}
const reason = (e: unknown, fallback: string) => (e instanceof Error && e.message && !/^HTTP \d+$/.test(e.message) ? e.message : fallback)

export function freqText(fn: number, fd: number): string {
  if (fd === 1 && fn === 1) return 'Todo dia'
  if (fd === 7) return `${fn}× por semana`
  if (fn === 1) return `1× a cada ${fd} dias`
  return `${fn}× a cada ${fd} dias`
}

const DAY_LABEL: Record<string, string> = { MO: 'seg', TU: 'ter', WE: 'qua', TH: 'qui', FR: 'sex', SA: 'sáb', SU: 'dom' }
const DAY_ORDER = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']

/** Resume os alertas agrupando os dias que dividem o horário (“seg/qua/sex 07:00, sáb dia todo”). */
export function scheduleText(list: HabitSchedule[]): string {
  const byTime = new Map<string, string[]>()
  for (const code of DAY_ORDER) {
    const s = list.find((x) => x.weekday === code)
    if (s) byTime.set(s.time ?? '', [...(byTime.get(s.time ?? '') ?? []), DAY_LABEL[code]])
  }
  return [...byTime.entries()].map(([t, days]) => `${days.join('/')} ${t || 'dia todo'}`).join(', ')
}

/** Dias do histórico → pontos do mapa de calor (0–100 % da meta; sim/não cumprido = 100). */
export function heatPoints(days: HabitHeatDay[], target: number | null) {
  return days.flatMap((d) => {
    const pct = target != null ? Math.round(((d.value ?? 0) / target) * 100) : d.done ? 100 : 0
    return pct > 0 ? [{ date: d.date, value: pct }] : d.done ? [{ date: d.date, value: 100 }] : []
  })
}

function History({ habit, year, today }: { habit: Habit; year: number; today: string }) {
  const { state } = useLoad(() => kaguyaApi.habitHistory(habit.id, year), [habit.id, year])
  if (state.status === 'loading') return <p className="ds-hint">Carregando histórico…</p>
  if (state.status === 'error') return <p className="ds-hint">Não foi possível carregar o histórico.</p>
  return <Heatmap year={year} daily={heatPoints(state.data, habit.target_value)} today={today} thresholds={[1, 34, 67, 100]} formatValue={(v) => `${v}% da meta`} label={`Check-ins de ${habit.name} em ${year}`} />
}

function HabitCard({ habit: h, onEdit, year, today, reload }: { habit: Habit; onEdit: (h: Habit) => void; year: number; today: string; reload: () => void }) {
  const k = useKaguya()
  const [value, setValue] = useState('')
  const [open, setOpen] = useState(false)
  const trend = TREND[h.trend]

  const run = async (fn: () => Promise<unknown>, fallback: string) => {
    try { await fn(); setValue(''); reload() } catch (e) { toast(reason(e, fallback), { tone: 'error' }) }
  }
  const submit = () => {
    const v = Number(value.trim())
    if (!value.trim() || !(v > 0)) { toast('Informe um valor maior que zero.', { tone: 'error' }); return }
    void run(() => kaguyaApi.checkin(h.id, { value: v }), 'Não foi possível registrar o check-in.')
  }

  return (
    <article className="kn-habit" aria-label={h.name}>
      <div className="kn-habit-main">
        <span title={`Consistência ${h.consistency}/100 · ${trend.label} · ${h.recent_done}/${h.recent_total} nas últimas 2 semanas`}>
          <ProgressRing value={h.consistency / 100} size={52} label={`Consistência de ${h.name}: ${h.consistency} de 100`} />
        </span>
        <div className="kn-habit-info">
          <button type="button" className="kn-habit-name" onClick={() => onEdit(h)} aria-label={`Editar ${h.name}`}>{h.name}</button>
          <p className="ds-hint">
            {freqText(h.freq_num, h.freq_den)}
            {h.target_value != null && ` · meta ${h.target_value}${h.unit ? ` ${h.unit}` : ''}`}
            {h.schedules.length > 0 && ` · alerta ${scheduleText(h.schedules)}`}
            {h.duration_min != null && h.schedules.length > 0 && ` · ${h.duration_min}min`}
          </p>
          <p className="kn-habit-score">
            <span className={`kn-trend kn-trend-${h.trend}`}><Icon name={trend.icon} size={14} />{trend.label}</span>
            <span className="ds-hint">{h.recent_done}/{h.recent_total} nas últimas 2 semanas</span>
            {h.done_today && (h.done_today_source === 'auto' || h.done_today_source === 'both') && <Chip on icon="link" title="O check-in de hoje veio da fonte automática">automático</Chip>}
          </p>
        </div>
        <div className="kn-habit-actions">
          {h.target_value != null && !h.done_today ? (
            <span className="kn-quick-i">
              <Input aria-label={`Valor de hoje para ${h.name}`} type="number" min={1} className="kn-habit-val" placeholder={String(h.target_value)} value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit() }} />
              <Button variant="primary" onClick={submit}>Marcar</Button>
            </span>
          ) : (
            <Button variant={h.done_today ? 'primary' : 'default'} icon="check" aria-pressed={h.done_today} title={h.done_today ? 'Cumprido hoje (clique para desfazer)' : 'Marcar como feito hoje'}
              onClick={() => void run(() => (h.done_today ? kaguyaApi.removeCheckin(h.id) : kaguyaApi.checkin(h.id, {})), 'Não foi possível registrar o check-in.')}>
              {h.done_today ? 'Feito hoje' : 'Hoje'}
            </Button>
          )}
          <IconButton icon="timer" label={`Focar em ${h.name}`} onClick={() => k.startFocus({ habitId: h.id })} />
          <IconButton icon="sun" label={h.in_my_day ? `Tirar ${h.name} do Meu Dia` : `Pôr ${h.name} no Meu Dia`} aria-pressed={h.in_my_day} primary={h.in_my_day}
            onClick={() => void run(() => (h.in_my_day ? kaguyaApi.removeHabitFromMyDay(h.id) : kaguyaApi.addHabitToMyDay(h.id)), 'Não foi possível atualizar o Meu Dia.')} />
          <IconButton icon={open ? 'up' : 'down'} label={open ? `Esconder histórico de ${h.name}` : `Ver histórico de ${h.name}`} aria-expanded={open} onClick={() => setOpen((o) => !o)} />
        </div>
      </div>
      {open && <div className="kn-habit-heat"><History habit={h} year={year} today={today} /></div>}
    </article>
  )
}

export function Habits() {
  const k = useKaguya()
  const [tab, setTab] = useState<'ativos' | 'arquivados'>('ativos')
  const [modal, setModal] = useState<{ habit?: Habit } | null>(null)
  const year = Number(k.today.slice(0, 4))
  const active = useLoad(() => kaguyaApi.listHabits(), [k.rev])
  const archived = useLoad(() => kaguyaApi.listArchivedHabits(), [k.rev])
  const done = useCallback(() => k.reload(), [k])

  const restore = async (id: number, name: string) => {
    try { await kaguyaApi.restoreHabit(id); k.reload(); toast(`“${name}” voltou aos hábitos.`, { tone: 'success' }) }
    catch (e) { toast(reason(e, 'Não foi possível restaurar o hábito.'), { tone: 'error' }) }
  }

  return (
    <Page wide className="kn-page">
      <div className="kn-quick">
        <Tabs label="Hábitos" value={tab} onChange={(t) => setTab(t as 'ativos' | 'arquivados')} tabs={[{ id: 'ativos', label: 'Ativos' }, { id: 'arquivados', label: 'Arquivados' }]} />
        <Button variant="primary" icon="add" onClick={() => setModal({})}>Novo hábito</Button>
      </div>
      <p className="ds-hint">A consistência cresce com o hábito e perdoa uma falha isolada — nada de ofensiva.</p>

      {tab === 'ativos' && (
        <>
          {active.state.status === 'loading' && <LoadingState variant="card" count={3} />}
          {active.state.status === 'error' && <ErrorState onRetry={active.retry} />}
          {active.state.status === 'ok' && (active.state.data.length === 0
            ? <EmptyState icon="habit" title="Nenhum hábito ainda" hint="Crie seu primeiro hábito para começar a construir consistência." action={<Button variant="primary" icon="add" onClick={() => setModal({})}>Novo hábito</Button>} />
            : <div className="kn-habits">{active.state.data.map((h) => <HabitCard key={h.id} habit={h} year={year} today={k.today} reload={done} onEdit={(x) => setModal({ habit: x })} />)}</div>)}
        </>
      )}

      {tab === 'arquivados' && (
        <>
          {archived.state.status === 'loading' && <LoadingState variant="row" count={3} />}
          {archived.state.status === 'error' && <ErrorState onRetry={archived.retry} />}
          {archived.state.status === 'ok' && (archived.state.data.length === 0
            ? <EmptyState icon="archive" title="Nenhum hábito arquivado" hint="Os hábitos que você arquivar ficam aqui, com o histórico, e podem voltar quando quiser." />
            : (
              <ul className="kn-sublist" aria-label="Hábitos arquivados">
                {archived.state.data.map((h) => (
                  <li key={h.id}>
                    <span className="kn-title">{h.name}</span>
                    <span className="ds-mono">arquivado em {fmtDate(h.archived_at.slice(0, 10))}</span>
                    <Button size="sm" icon="restore" onClick={() => void restore(h.id, h.name)}>Restaurar</Button>
                  </li>
                ))}
              </ul>
            ))}
        </>
      )}
      {modal && <HabitModal habit={modal.habit} onClose={() => setModal(null)} onSaved={k.reload} />}
    </Page>
  )
}
