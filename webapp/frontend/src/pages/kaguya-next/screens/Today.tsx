// Meu Dia: o ritual do dia. Hero com os DOIS tempos livres (trabalho e geral, pela agenda real), plano (dividido em
// Trabalho | Pessoal ou único, conforme o espaço), pendências de ontem (Hoje · Amanhã · Depois), sugestões a puxar,
// follow-ups de "aguardando" que chegaram e o modo férias (que esconde o trabalho). Nada some em relação ao shell antigo.

import { useMemo } from 'react'
import { Button, EmptyState, ErrorState, Hero, Icon, LoadingState, Page, ProgressBar, SectionHeader, Toggle, toast } from '../../../design'
import { fmtDateLong } from '../../../design/core/format'
import { kaguyaApi } from '../api'
import { QuickAddBar } from '../components/QuickAddBar'
import { TaskRow } from '../components/TaskRow'
import { useKaguya } from '../context'
import * as act from '../lib/actions'
import { bucketView, showWorkBucket } from '../lib/freeTime'
import { fmtMinutes } from '../lib/taskView'
import { useLoad } from '../lib/useLoad'
import type { MyDayResponse, Task, TimeBucket } from '../types'

const greeting = (hour: number): string => (hour < 6 ? 'Boa madrugada' : hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite')

function Bucket({ label, icon, bucket }: { label: string; icon: 'work' | 'personal'; bucket: TimeBucket }) {
  const v = bucketView(bucket)
  return (
    <div className="kn-bucket" data-over={v.over || undefined}>
      <div className="kn-bucket-h"><Icon name={icon} size={14} /> <b>{label}</b> <span className="ds-mono">{v.line}</span></div>
      <ProgressBar value={v.pct} label={`${label}: ${v.line}`} />
      <p className="ds-hint">{v.note}</p>
    </div>
  )
}

export function Today() {
  const k = useKaguya()
  const { state, retry } = useLoad(() => kaguyaApi.myDay(), [k.rev])

  if (state.status === 'loading') return <Page wide><LoadingState variant="row" count={5} /></Page>
  if (state.status === 'error') return <Page wide><ErrorState onRetry={retry} /></Page>
  return <TodayBody data={state.data} />
}

function TodayBody({ data }: { data: MyDayResponse }) {
  const k = useKaguya()
  const deps = useMemo(() => ({ reload: k.reload }), [k.reload])
  const space = k.prefs.space
  const split = k.prefs.daySplit === 'split' && space === 'all' && !data.hide_work
  const ft = data.free_time

  // O que mostrar conforme o espaço escolhido: um bloco por espaço (dividido) ou a união (único).
  const pick = <T,>(work: T[], personal: T[], all: T[]): T[] => (space === 'work' ? work : space === 'personal' ? personal : all)
  const plano = pick(data.plano_work, data.plano_personal, data.plano)
  const pendencias = pick(data.pendencias_ontem_work, data.pendencias_ontem_personal, data.pendencias_ontem)
  const sugestoes = pick(data.sugestoes_work, data.sugestoes_personal, data.sugestoes)
  const eventos = space === 'all' ? data.eventos : data.eventos.filter((e) => e.context === space)
  const now = new Date()
  const total = data.capacity.no_plano

  const toggleVacation = async (on: boolean) => {
    try { await kaguyaApi.setMyDayPrefs(on); k.reload() } catch { toast('Não foi possível mudar o modo férias.', { tone: 'error' }) }
  }
  const move = (t: Task, when: 'today' | 'tomorrow' | 'later') =>
    kaguyaApi.reschedule(t.id, when).then(k.reload).catch(() => toast('Não foi possível mover a tarefa.', { tone: 'error' }))

  const rows = (tasks: Task[], opts: { pending?: boolean; suggestion?: boolean } = {}) => (
    <ul className="kn-rows">
      {tasks.map((t) => (
        <TaskRow
          key={t.id}
          task={t}
          today={k.today}
          showProject
          active={k.route.taskId === t.id}
          onToggle={() => void act.toggleComplete(deps, t)}
          onOpen={() => k.openTask(t.id)}
          menu={[
            { id: 'open', label: 'Abrir', onSelect: () => k.openTask(t.id) },
            ...(opts.suggestion ? [] : [{ id: 'out', label: 'Tirar do Meu Dia', onSelect: () => void act.removeFromMyDay(deps, [t.id]) }]),
            { id: 'del', label: 'Excluir', onSelect: () => void act.deleteTasks(deps, [t]) },
          ]}
          trailing={opts.pending ? (
            <span className="kn-trail">
              <Button size="sm" onClick={() => void move(t, 'today')}>Hoje</Button>
              <Button size="sm" onClick={() => void move(t, 'tomorrow')}>Amanhã</Button>
              <Button size="sm" variant="ghost" onClick={() => void move(t, 'later')}>Depois</Button>
            </span>
          ) : opts.suggestion ? (
            <Button size="sm" icon="add" onClick={() => void act.addToMyDay(deps, [t.id])}>Puxar</Button>
          ) : undefined}
        />
      ))}
    </ul>
  )

  return (
    <Page wide className="kn-page">
      <Hero
        eyebrow={fmtDateLong(k.today)}
        eyebrowIcon="sun"
        title={`${greeting(now.getHours())}!`}
        meta={
          <div className="kn-herometa">
            <p className="kn-now">
              {total === 0 ? <>Seu dia está <b>em branco</b>.</> : <><b>{total}</b> tarefa{total > 1 ? 's' : ''} no plano · <b>{fmtMinutes(data.capacity.estimado_min)}</b> estimados</>}
            </p>
            {ft ? (
              <div className="kn-buckets">
                {(space !== 'personal') && showWorkBucket(ft.works, ft.work) && <Bucket label="Trabalho" icon="work" bucket={ft.work} />}
                {(space !== 'work') && <Bucket label="Livre" icon="personal" bucket={ft.general} />}
              </div>
            ) : (
              <p className="kn-now">Livre hoje: <b>{fmtMinutes(Math.max(0, data.capacity.livre_min))}</b> · {data.capacity.excedeu ? 'plano acima do tempo' : `folga de ${fmtMinutes(Math.max(0, data.capacity.folga_min))}`}</p>
            )}
          </div>
        }
        actions={
          <Toggle checked={data.hide_work} onChange={(v) => void toggleVacation(v)} label="Modo férias (esconde o trabalho)" />
        }
      />

      <QuickAddBar due={k.today} myDay placeholder="Adicionar ao Meu Dia — Enter para criar" />

      {data.pendencias_ontem.length > 0 && pendencias.length > 0 && (
        <section aria-labelledby="kn-pend">
          <SectionHeader id="kn-pend" title="Pendências de ontem" mono={`${pendencias.length}`} />
          {rows(pendencias, { pending: true })}
        </section>
      )}

      <section aria-labelledby="kn-plano">
        <SectionHeader id="kn-plano" title="Plano de hoje" mono={`${plano.length}`} />
        {split ? (
          <div className="kn-cols">
            <div><h3 className="kn-h3"><Icon name="work" size={14} /> Trabalho</h3>{data.plano_work.length ? rows(data.plano_work) : <p className="ds-hint">Nada de trabalho planejado.</p>}</div>
            <div><h3 className="kn-h3"><Icon name="personal" size={14} /> Pessoal</h3>{data.plano_personal.length ? rows(data.plano_personal) : <p className="ds-hint">Nada pessoal planejado.</p>}</div>
          </div>
        ) : plano.length ? rows(plano) : (
          <EmptyState icon="sun" title="Nada planejado ainda" hint="Puxe uma sugestão abaixo ou adicione uma tarefa na barra. O que você colocar aqui entra na conta do tempo livre." />
        )}
      </section>

      {sugestoes.length > 0 && (
        <section aria-labelledby="kn-sug">
          <SectionHeader id="kn-sug" title="Sugestões" mono="vencem em até 7 dias, ou é hora de cobrar" />
          {rows(sugestoes, { suggestion: true })}
        </section>
      )}

      {data.habitos.length > 0 && (
        <section aria-labelledby="kn-hab">
          <SectionHeader id="kn-hab" title="Hábitos do dia" mono={`${data.habitos.length}`} />
          <div className="kn-chips">
            {data.habitos.map((h) => (
              <button key={h.id} type="button" className="ds-chip" onClick={() => k.goto({ view: 'habits' })}>
                <Icon name="habit" size={13} /> {h.name}{h.duration_min ? ` · ${fmtMinutes(h.duration_min)}` : ''}
              </button>
            ))}
          </div>
        </section>
      )}

      {eventos.length > 0 && (
        <section aria-labelledby="kn-ev">
          <SectionHeader id="kn-ev" title="Agenda" mono={`${eventos.length}`} />
          <ul className="kn-events">
            {eventos.map((e) => (
              <li key={e.id}>
                <span className="ds-mono">{e.all_day ? 'dia todo' : `${e.start?.slice(11, 16)}–${e.end?.slice(11, 16)}`}</span>
                <span>{e.title}</span>
                <span className="kn-proj">{e.calendar_name}{e.context === 'work' ? ' · trabalho' : ''}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Page>
  )
}
