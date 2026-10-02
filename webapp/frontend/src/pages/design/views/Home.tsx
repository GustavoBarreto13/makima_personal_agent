// Início do agente de exemplo: Hero (próximo treino) → captura rápida → semana → recentes.

import { fmtDuration, fmtRelative, fmtDateLong, todayISO } from '../../../design/core/format'
import { computeStreaks } from '../../../design/core/stats'
import { toast } from '../../../design/headless/toast'
import { Button, CountUp, Hero, ListRow, Page, ProgressBar, QuickCapture, SectionHeader, Stars, type CaptureLegendItem } from '../../../design'
import type { CaptureResult } from '../../../design/core/capture'
import { fmtWorkoutMeta, TYPE_META, weekSummary, workoutParser, type Workout } from '../demoData'

const EXAMPLES = ['Supino 4x8 80kg @Smart-Fit #peito ★4.5 hoje 18h', 'Rodagem leve 6km 38min @Ibirapuera ontem 4/5', 'Yoga flow 25min @casa #recuperação sexta']
const LEGEND: CaptureLegendItem[] = [
  { kind: 'place', sample: '@local' }, { kind: 'tag', sample: '#etiqueta' }, { kind: 'rating', sample: '★4.5' },
  { kind: 'quantity', sample: '4x8 · 80kg · 6km' }, { kind: 'duration', sample: '45min' }, { kind: 'date', sample: 'hoje · sexta · 12/09 · 18h' },
]

export interface HomeViewProps {
  workouts: Workout[]
  today: string
  onOpen: (id: number) => void
  onGoStats: () => void
  onGoList: () => void
  onCapture: (r: CaptureResult) => boolean
  onExpand: (r: CaptureResult) => void
}

export function HomeView({ workouts, today, onOpen, onGoStats, onGoList, onCapture, onExpand }: HomeViewProps) {
  const done = workouts.filter((w) => w.status === 'done')
  const next = [...workouts].reverse().find((w) => w.status === 'planned' && w.date >= today)
  const hero = next ?? done[0]
  const week = weekSummary(workouts, today)
  const streak = computeStreaks(done.map((w) => w.date), today)
  const month = done.filter((w) => w.date.slice(0, 7) === today.slice(0, 7)).reduce((s, w) => s + w.mins, 0) / 60
  const last30 = done.filter((w) => w.rating && Date.parse(today) - Date.parse(w.date) <= 30 * 864e5)
  const avg = last30.length ? last30.reduce((s, w) => s + w.rating, 0) / last30.length : 0
  return (
    <Page>
      {hero && (
        <Hero
          eyebrow={`${next ? 'Próximo treino' : 'Último treino'} · ${fmtDateLong(todayISO()).split(',')[0]}`}
          eyebrowIcon="hiit"
          title={hero.title}
          meta={<><span className="ds-chipg">{hero.type}</span><span>{fmtDuration(hero.mins)}</span><span>·</span><span>{hero.place}</span><span>·</span><span>{fmtRelative(hero.date, today)}</span></>}
          actions={<><Button variant="primary" icon="play" onClick={() => toast('Cronômetro iniciado (exemplo)')}>Iniciar treino</Button><Button variant="ghost" onClick={() => onOpen(hero.id)}>Ver detalhes</Button></>}
        />
      )}
      <section aria-labelledby="qct">
        <SectionHeader title="Captura rápida" id="qct" mono="Enter salva · Shift+Enter abre o formulário" />
        <QuickCapture
          parser={workoutParser}
          label="Registrar um treino em uma linha"
          placeholder="Ex.: Supino 4x8 80kg @Smart-Fit #peito ★4.5 hoje 18h"
          examples={EXAMPLES}
          legend={LEGEND}
          onSubmit={onCapture}
          onExpand={onExpand}
          today={today}
        />
      </section>
      <section aria-labelledby="k1">
        <SectionHeader title="Esta semana" id="k1" action={<Button variant="ghost" size="sm" iconRight="right" onClick={onGoStats}>Ver estatísticas</Button>} />
        <div className="ds-kpis">
          <div className="ds-kpi ds-card"><span className="ds-mono">Treinos</span><span className="ds-v"><CountUp value={week.count} /><small>/ {week.goal}</small></span><ProgressBar value={week.count} max={week.goal} label="Meta da semana" /></div>
          <div className="ds-kpi ds-card"><span className="ds-mono">Sequência atual</span><span className="ds-v"><CountUp value={streak.current} /><small>dias</small></span><span className="ds-hint">Recorde: {streak.best} dias</span></div>
          <div className="ds-kpi ds-card"><span className="ds-mono">Horas no mês</span><span className="ds-v"><CountUp value={month} decimals={1} /><small>h</small></span></div>
          <div className="ds-kpi ds-card"><span className="ds-mono">Nota média · 30 dias</span><span className="ds-v"><CountUp value={avg} decimals={1} /></span><Stars value={avg} /></div>
        </div>
      </section>
      <section aria-labelledby="rc">
        <SectionHeader title="Recentes" id="rc" action={<Button variant="ghost" size="sm" iconRight="right" onClick={onGoList}>Ver todos</Button>} />
        <div className="ds-list">
          {done.slice(0, 5).map((w) => (
            <ListRow key={w.id} title={w.title} meta={`${w.place} · ${fmtRelative(w.date, today)} · ${fmtWorkoutMeta(w)}`} icon={TYPE_META[w.type].icon} hue={TYPE_META[w.type].hue} rating={w.rating} onOpen={() => onOpen(w.id)} />
          ))}
        </div>
      </section>
    </Page>
  )
}
