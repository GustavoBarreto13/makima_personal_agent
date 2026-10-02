// Lista de treinos (coleção completa) e detalhe. O componente fica montado também no detalhe,
// então o "‹ Treinos" volta com os mesmos filtros, ordenação e agrupamento.

import { useEffect, useState } from 'react'
import { fmtDate, fmtDateLong, fmtDuration, fmtNumber, fmtRelative } from '../../../design/core/format'
import { useCollection } from '../../../design/headless/useCollection'
import { usePrefs } from '../../../design/headless/usePrefs'
import {
  Button, CollectionBody, CollectionMeta, CollectionToolbar, DetailPage, EmptyState, FilterSheet, InfoRow, ListRow, MediaCard, Page, StatusChip, Tag, Timeline,
  type CollectionView,
} from '../../../design'
import { fmtWorkoutMeta, TYPE_META, workoutBlocks, workoutSchema, type Workout } from '../demoData'

let seenOnce = false

export interface WorkoutsViewProps {
  workouts: Workout[]
  today: string
  detailId: number | null
  tab: string
  onTab: (t: string) => void
  onOpen: (id: number) => void
  onBack: () => void
  onNew: () => void
  onEdit: (w: Workout) => void
  onDelete: (w: Workout) => void
  onStart: (w: Workout) => void
  showPR: boolean
  showKcal: boolean
  /** Busca vinda da barra superior. */
  externalQuery: { q: string; nonce: number } | null
}

export function WorkoutsView({ workouts, today, detailId, tab, onTab, onOpen, onBack, onNew, onEdit, onDelete, onStart, showPR, showKcal, externalQuery }: WorkoutsViewProps) {
  const c = useCollection(workoutSchema, workouts, { today })
  const [ui, setUi] = usePrefs<{ view: CollectionView }>('hayate-ui', { view: 'grid' })
  const [filters, setFilters] = useState(false)
  const [loading, setLoading] = useState(!seenOnce)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!loading) return
    const t = setTimeout(() => { seenOnce = true; setLoading(false) }, 650)
    return () => clearTimeout(t)
  }, [loading])
  useEffect(() => { if (externalQuery) c.setQ(externalQuery.q) }, [externalQuery?.nonce]) // eslint-disable-line react-hooks/exhaustive-deps

  const detail = detailId !== null ? workouts.find((w) => w.id === detailId) : undefined
  if (detail) return <Page><WorkoutDetail w={detail} today={today} tab={tab} onTab={onTab} onBack={onBack} onEdit={onEdit} onDelete={onDelete} onStart={onStart} /></Page>

  const card = (w: Workout, i: number) => (
    <MediaCard
      key={w.id}
      index={i}
      title={w.title}
      subtitle={`${w.type} · ${w.place}`}
      icon={TYPE_META[w.type].icon}
      hue={TYPE_META[w.type].hue}
      rating={w.rating}
      status={w.status}
      badge={w.pr && showPR ? <Tag pr>PR</Tag> : undefined}
      metaRight={<span>{fmtRelative(w.date, today)}</span>}
      meta={<><span>{fmtWorkoutMeta(w)}</span>{showKcal && <span>{w.kcal} kcal</span>}</>}
      onOpen={() => onOpen(w.id)}
    />
  )
  const row = (w: Workout) => (
    <ListRow key={w.id} title={w.title} meta={`${w.place} · ${fmtRelative(w.date, today)} · ${fmtDuration(w.mins)}`} icon={TYPE_META[w.type].icon} hue={TYPE_META[w.type].hue} rating={w.rating} trailing={w.pr && showPR ? <Tag pr>PR</Tag> : undefined} onOpen={() => onOpen(w.id)} />
  )

  return (
    <Page wide>
      <div>
        <CollectionToolbar schema={workoutSchema} c={c} onOpenFilters={() => setFilters(true)} view={ui.view} onView={(view) => setUi({ view })} searchPlaceholder="Buscar por título ou local" />
        <CollectionMeta c={c} noun={['treino', 'treinos']} />
        <CollectionBody
          c={c}
          view={ui.view}
          renderCard={card}
          renderRow={row}
          loading={loading}
          error={failed}
          onRetry={() => { setFailed(false); setLoading(true) }}
          emptyTitle="Nenhum treino com esses filtros"
          firstRun={<EmptyState icon="workout" title="Nenhum treino ainda" hint="Registre o primeiro pela captura rápida ou pelo botão abaixo." action={<Button variant="primary" icon="add" onClick={onNew}>Registrar treino</Button>} />}
        />
      </div>
      {filters && <FilterSheet schema={workoutSchema} c={c} items={workouts} onClose={() => setFilters(false)} noun={['treino', 'treinos']} />}
    </Page>
  )
}

function WorkoutDetail({ w, today, tab, onTab, onBack, onEdit, onDelete, onStart }: { w: Workout; today: string; tab: string; onTab: (t: string) => void; onBack: () => void; onEdit: (w: Workout) => void; onDelete: (w: Workout) => void; onStart: (w: Workout) => void }) {
  const t = TYPE_META[w.type]
  const blocks = workoutBlocks(w)
  const label = w.type === 'Corrida' ? 'Parciais' : w.type === 'Força' ? 'Exercícios' : 'Blocos'
  return (
    <DetailPage
      backLabel="Treinos"
      onBack={onBack}
      title={w.title}
      icon={t.icon}
      hue={t.hue}
      rating={w.rating}
      chips={<><StatusChip status={w.status} /><Tag>{w.type}</Tag>{w.pr && <Tag pr>PR</Tag>}</>}
      subtitle={`${w.place} · ${fmtRelative(w.date, today)}, ${fmtDateLong(w.date).split(',')[0]}`}
      actions={<><Button variant="primary" icon="play" onClick={() => onStart(w)}>Repetir treino</Button><Button icon="edit" onClick={() => onEdit(w)}>Editar</Button><Button variant="ghost" icon="delete" onClick={() => onDelete(w)}>Excluir</Button></>}
      tab={tab}
      onTab={onTab}
      tabs={[
        {
          id: 'overview', label: 'Visão geral',
          content: (
            <>
              <div className="ds-kpis">
                <div className="ds-kpi ds-card"><span className="ds-mono">Duração</span><span className="ds-v">{fmtDuration(w.mins)}</span></div>
                <div className="ds-kpi ds-card"><span className="ds-mono">{w.dist ? 'Distância' : 'Carga total'}</span><span className="ds-v">{w.dist ? <>{fmtNumber(w.dist, 1)}<small>km</small></> : w.vol ? <>{fmtNumber(w.vol / 1000, 1)}<small>t</small></> : '—'}</span></div>
                <div className="ds-kpi ds-card"><span className="ds-mono">Esforço (RPE)</span><span className="ds-v">{w.rpe}<small>/10</small></span></div>
                <div className="ds-kpi ds-card"><span className="ds-mono">Energia</span><span className="ds-v">{w.kcal}<small>kcal</small></span></div>
              </div>
              <div>
                <h2 style={{ marginBottom: 12, fontFamily: 'var(--ds-font-display)', fontWeight: 800, fontSize: 17 }}>{label}</h2>
                <div className="ds-list">{blocks.map((b) => <InfoRow key={b[0]} title={b[0]} detail={b[2]} value={b[1]} />)}</div>
              </div>
            </>
          ),
        },
        {
          id: 'activity', label: 'Atividade',
          content: (
            <Timeline entries={[
              { title: 'Treino concluído', detail: `${fmtRelative(w.date, today)} às 19:${String(10 + (w.id % 40)).padStart(2, '0')}` },
              ...(w.rating ? [{ title: `Nota ${w.rating.toFixed(1)} registrada`, detail: 'logo após o treino' }] : []),
              ...(w.pr ? [{ title: 'Recorde pessoal marcado', detail: `em ${blocks[0][0]}` }] : []),
              { title: 'Registrado pela captura rápida', detail: fmtDate(w.date) },
            ]} />
          ),
        },
        {
          id: 'notes', label: 'Notas',
          content: (
            <div className="ds-card" style={{ padding: 18 }}>
              <p>{w.rating >= 4.5 ? 'Sessão forte. A carga subiu sem perder a técnica e o descanso entre séries ficou em 90 s.' : w.rating && w.rating <= 3 ? 'Dia pesado. Dormi mal e cortei o último bloco.' : 'Treino dentro do plano, sem intercorrências.'}</p>
              <p className="ds-hint" style={{ marginTop: 8 }}>Exemplo de nota livre do treino.</p>
            </div>
          ),
        },
      ]}
    />
  )
}
