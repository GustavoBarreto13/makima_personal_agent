// Metas: a direção com prazo. A lista agrupa as ATIVAS por área da vida (com contagem) e põe as encerradas num bloco à
// parte, com o desfecho. O detalhe (DetailPage do DS) tem o progresso (métrica + marcos), os movimentos vinculados
// (experimentos, tarefas, hábitos e itens de outros agentes) e a revisão de encerramento.

import { useCallback, useState } from 'react'
import {
  Button, Chip, DetailPage, EmptyState, ErrorState, Icon, IconButton, Input, LoadingState, NumberInput, Page, ProgressBar, SectionHeader, Select, Textarea, toast,
} from '../../../design'
import { getAgent } from '../../../design/core/agents'
import { fmtDate } from '../../../design/core/format'
import { kaguyaApi } from '../api'
import { ExperimentModal, GoalModal } from '../components/GoalModals'
import { useKaguya } from '../context'
import { useLoad } from '../lib/useLoad'
import type { Goal, GoalOutcome, LinkableItem, MovementType } from '../types'

const HUE = getAgent('kaguya').hue
const OUTCOMES: { value: GoalOutcome; label: string }[] = [{ value: 'achieved', label: 'Atingida' }, { value: 'missed', label: 'Não atingida' }, { value: 'revise', label: 'Revisar' }]
const OUTCOME_LABEL = Object.fromEntries(OUTCOMES.map((o) => [o.value, o.label])) as Record<GoalOutcome, string>
const MOVEMENTS: { value: MovementType; label: string }[] = [{ value: 'experiment', label: 'Experimento' }, { value: 'task', label: 'Tarefa' }, { value: 'habit', label: 'Hábito' }]
const reason = (e: unknown, fallback: string) => (e instanceof Error && e.message && !/^HTTP \d+$/.test(e.message) ? e.message : fallback)

export function deadlineText(g: Pick<Goal, 'is_overdue' | 'days_remaining'>): string {
  if (g.is_overdue) return `atrasada ${Math.abs(g.days_remaining)}d`
  if (g.days_remaining === 0) return 'vence hoje'
  if (g.days_remaining < 0) return 'encerrada'
  return `faltam ${g.days_remaining}d`
}

export function metricSummary(g: Pick<Goal, 'metric_target' | 'metric_current' | 'metric_unit' | 'milestones_total' | 'milestones_done'>): string {
  const parts: string[] = []
  if (g.metric_target != null) parts.push(`${g.metric_current ?? 0}/${g.metric_target}${g.metric_unit ? ` ${g.metric_unit}` : ''}`)
  if (g.milestones_total > 0) parts.push(`${g.milestones_done}/${g.milestones_total} marcos`)
  return parts.join(' · ')
}

function GoalCard({ goal, onOpen }: { goal: Goal; onOpen: (id: number) => void }) {
  const closed = goal.status === 'closed'
  return (
    <article className={`kn-goal${closed ? ' kn-goal-closed' : ''}`} aria-label={goal.title}>
      <div className="kn-goal-h">
        <button type="button" className="kn-goal-title" onClick={() => onOpen(goal.id)}>{goal.title}</button>
        {goal.is_overdue && <Chip on icon="warning">Atrasada</Chip>}
        {closed && goal.outcome && <Chip on>{OUTCOME_LABEL[goal.outcome]}</Chip>}
      </div>
      {goal.why && <p className="ds-hint">{goal.why}</p>}
      <p className="ds-mono kn-goal-meta">{[metricSummary(goal), !closed ? deadlineText(goal) : ''].filter(Boolean).join(' · ')}</p>
      <ProgressBar value={goal.progress_pct ?? 0} label={goal.progress_pct == null ? 'Meta sem progresso medido' : `Progresso de ${goal.title}: ${goal.progress_pct}%`} />
    </article>
  )
}

export function Goals() {
  const k = useKaguya()
  const { state, retry } = useLoad(() => kaguyaApi.goals.list(true), [k.rev])
  const [modal, setModal] = useState(false)
  const open = (id: number) => k.goto({ view: 'goals', id })

  return (
    <Page wide className="kn-page">
      <div className="kn-quick">
        <p className="ds-hint">A direção com prazo — poucas metas ativas por vez, cada uma com seus movimentos.</p>
        <Button variant="primary" icon="add" onClick={() => setModal(true)}>Nova meta</Button>
      </div>
      {state.status === 'loading' && <LoadingState variant="card" count={3} />}
      {state.status === 'error' && <ErrorState onRetry={retry} />}
      {state.status === 'ok' && (() => {
        const goals = state.data
        const active = goals.filter((g) => g.status === 'active')
        const closed = goals.filter((g) => g.status === 'closed')
        if (goals.length === 0) {
          return <EmptyState icon="goal" title="Nenhuma meta ainda" hint="Crie a primeira para dar direção aos seus experimentos, tarefas e hábitos." action={<Button variant="primary" icon="add" onClick={() => setModal(true)}>Nova meta</Button>} />
        }
        const byArea = new Map<string, Goal[]>()
        for (const g of active) byArea.set(g.life_area?.trim() || '', [...(byArea.get(g.life_area?.trim() || '') ?? []), g])
        // “Sem área” por último.
        const areas = [...byArea.keys()].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)))
        return (
          <>
            {areas.map((a) => (
              <section key={a || 'sem'} aria-label={a || 'Sem área'}>
                <SectionHeader title={a || 'Sem área'} mono={`${byArea.get(a)!.length} ativa(s)`} />
                <div className="kn-goals">{byArea.get(a)!.map((g) => <GoalCard key={g.id} goal={g} onOpen={open} />)}</div>
              </section>
            ))}
            {closed.length > 0 && (
              <section aria-label="Encerradas">
                <SectionHeader title="Encerradas" mono={`${closed.length}`} />
                <div className="kn-goals">{closed.map((g) => <GoalCard key={g.id} goal={g} onOpen={open} />)}</div>
              </section>
            )}
          </>
        )
      })()}
      {modal && <GoalModal onClose={() => setModal(false)} onSaved={k.reload} />}
    </Page>
  )
}

export function GoalDetail({ id }: { id: number }) {
  const k = useKaguya()
  const { state, retry } = useLoad(() => kaguyaApi.goals.get(id), [id, k.rev])
  const [tab, setTab] = useState('progresso')
  const [editing, setEditing] = useState(false)
  const [newExp, setNewExp] = useState(false)
  const [metric, setMetric] = useState<string | null>(null)
  const [milestone, setMilestone] = useState('')
  const [linkType, setLinkType] = useState<MovementType>('experiment')
  const [linkItem, setLinkItem] = useState('')
  const [outcome, setOutcome] = useState<GoalOutcome | null>(null)
  const [review, setReview] = useState('')
  const [extProvider, setExtProvider] = useState('')
  const [extQuery, setExtQuery] = useState('')
  const [extResults, setExtResults] = useState<{ id: string; label: string; sublabel?: string | null }[]>([])
  const [reviewing, setReviewing] = useState(false)
  const linkables = useLoad<LinkableItem[]>(() => kaguyaApi.goals.linkable(linkType), [linkType, k.rev])
  const providers = useLoad(() => kaguyaApi.goals.linkProviders(), [])

  const back = useCallback(() => k.goto({ view: 'goals' }), [k])
  const run = async (fn: () => Promise<unknown>, fallback: string, ok?: string) => {
    try { await fn(); if (ok) toast(ok, { tone: 'success' }); k.reload() } catch (e) { toast(reason(e, fallback), { tone: 'error' }) }
  }

  if (state.status === 'loading') return <Page wide><LoadingState variant="card" count={2} /></Page>
  if (state.status === 'error') return <Page wide><ErrorState onRetry={retry} /></Page>
  const goal = state.data
  const closed = goal.status === 'closed'
  const mv = goal.movements ?? { experiments: [], tasks: [], habits: [] }
  const external = Object.entries(mv.external ?? {})
  const picked = linkables.state.status === 'ok' ? linkables.state.data.find((l) => String(l.id) === linkItem) : undefined
  const metricValue = metric ?? (goal.metric_current != null ? String(goal.metric_current) : '')
  const providerId = extProvider || (providers.state.status === 'ok' ? providers.state.data[0]?.id ?? '' : '')

  const saveMetric = () => {
    const v = metricValue.trim() === '' ? 0 : Number(metricValue)
    if (Number.isNaN(v)) { toast('Valor inválido.', { tone: 'error' }); return }
    void run(() => kaguyaApi.goals.update(id, { metric_current: v }), 'Não foi possível atualizar a métrica.', 'Métrica atualizada.').then(() => setMetric(null))
  }
  const submitReview = async () => {
    if (!outcome) { toast('Escolha um desfecho.', { tone: 'error' }); return }
    if (!review.trim()) { toast('Escreva o aprendizado.', { tone: 'error' }); return }
    setReviewing(true)
    await run(() => kaguyaApi.goals.review(id, { outcome, review: review.trim() }), 'Não foi possível encerrar a meta.', 'Meta encerrada.')
    setReviewing(false)
  }

  const progresso = (
    <>
      <ProgressBar value={goal.progress_pct ?? 0} label={goal.progress_pct == null ? 'Meta sem progresso medido' : `Progresso: ${goal.progress_pct}%`} />
      {goal.why && <p><b>Por quê:</b> {goal.why}</p>}
      {goal.anti_goals && <p><b>Anti-metas:</b> {goal.anti_goals}</p>}
      {goal.accountability && <p><b>Accountability:</b> {goal.accountability}</p>}

      {goal.metric_target != null && !closed && (
        <section aria-label="Métrica">
          <SectionHeader title="Métrica" />
          <Button size="sm" icon={goal.metric_mode === 'auto' ? 'link' : 'edit'} title="Alternar entre valor manual e calculado a partir dos itens vinculados"
            onClick={() => void run(() => kaguyaApi.goals.setMetricMode(id, goal.metric_mode === 'auto' ? 'manual' : 'auto'), 'Não foi possível alternar o modo da métrica.')}>
            {goal.metric_mode === 'auto' ? 'Automática' : 'Manual'}
          </Button>
          {goal.metric_mode === 'auto' ? (
            <p className="ds-hint">Calculada a partir dos itens vinculados: <b>{goal.metric_current}</b> de {goal.metric_target}{goal.metric_unit ? ` ${goal.metric_unit}` : ''}.</p>
          ) : (
            <div className="kn-quick-i">
              <NumberInput aria-label={`Valor atual (de ${goal.metric_target}${goal.metric_unit ? ` ${goal.metric_unit}` : ''})`} value={metricValue} onChange={(e) => setMetric(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') saveMetric() }} />
              <span className="ds-hint">de {goal.metric_target}{goal.metric_unit ? ` ${goal.metric_unit}` : ''}</span>
              <Button variant="primary" onClick={saveMetric}>Salvar</Button>
            </div>
          )}
        </section>
      )}

      <section aria-label="Marcos">
        <SectionHeader title="Marcos" mono={`${goal.milestones_done}/${goal.milestones_total}`} />
        <ul className="kn-ms">
          {(goal.milestones ?? []).map((m) => (
            <li key={m.id} className={m.done ? 'kn-ms-done' : ''}>
              <button type="button" className={`kn-check kn-p1${m.done ? ' kn-checked' : ''}`} role="checkbox" aria-checked={m.done} aria-label={m.done ? `Reabrir o marco “${m.title}”` : `Concluir o marco “${m.title}”`} disabled={closed}
                onClick={() => void run(() => kaguyaApi.goals.updateMilestone(id, m.id, { done: !m.done }), 'Não foi possível atualizar o marco.')}>
                {m.done && <Icon name="check" size={12} strokeWidth={3} />}
              </button>
              <span className="kn-title">{m.title}</span>
              {!closed && <IconButton icon="delete" label={`Remover o marco “${m.title}”`} size={14} onClick={() => void run(() => kaguyaApi.goals.delMilestone(id, m.id), 'Não foi possível remover o marco.')} />}
            </li>
          ))}
        </ul>
        {!closed && (
          <div className="kn-quick-i">
            <Input aria-label="Novo marco" value={milestone} placeholder="Novo marco…" onChange={(e) => setMilestone(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && milestone.trim()) void run(() => kaguyaApi.goals.addMilestone(id, milestone.trim()), 'Não foi possível adicionar o marco.', 'Marco adicionado.').then(() => setMilestone('')) }} />
            <Button icon="add" disabled={!milestone.trim()} onClick={() => void run(() => kaguyaApi.goals.addMilestone(id, milestone.trim()), 'Não foi possível adicionar o marco.', 'Marco adicionado.').then(() => setMilestone(''))}>Adicionar</Button>
          </div>
        )}
      </section>
    </>
  )

  const unlink = (type: MovementType, itemId: number, label: string) =>
    <IconButton icon="close" label={`Desvincular ${label}`} size={14} onClick={() => void run(() => kaguyaApi.goals.unlink(id, type, itemId), 'Não foi possível desvincular.', 'Item desvinculado.')} />

  const movimentos = (
    <>
      {mv.experiments.length > 0 && (
        <section aria-label="Experimentos vinculados"><SectionHeader title="Experimentos" />
          <ul className="kn-sublist">{mv.experiments.map((e) => (
            <li key={e.id}><button type="button" className="kn-main" onClick={() => k.goto({ view: 'experiments', id: e.id })}><span className="kn-title">{e.title}</span></button><span className="ds-mono">{e.status} · {e.adherence_pct}%</span>{!closed && unlink('experiment', e.id, e.title)}</li>
          ))}</ul>
        </section>
      )}
      {mv.tasks.length > 0 && (
        <section aria-label="Tarefas vinculadas"><SectionHeader title="Tarefas" />
          <ul className="kn-sublist">{mv.tasks.map((t) => (
            <li key={t.id}><button type="button" className="kn-main" onClick={() => k.openTask(t.id)}><span className="kn-title">{t.title}</span></button><span className="ds-mono">{t.completed ? 'concluída' : 'aberta'}</span>{!closed && unlink('task', t.id, t.title)}</li>
          ))}</ul>
        </section>
      )}
      {mv.habits.length > 0 && (
        <section aria-label="Hábitos vinculados"><SectionHeader title="Hábitos" />
          <ul className="kn-sublist">{mv.habits.map((h) => (
            <li key={h.id}><span className="kn-title">{h.name}</span><span className="ds-mono">consistência {h.consistency}</span>{!closed && unlink('habit', h.id, h.name)}</li>
          ))}</ul>
        </section>
      )}
      {external.map(([pid, group]) => (
        <section key={pid} aria-label={group.provider_name}>
          <SectionHeader title={group.provider_name} mono={group.unavailable ? 'indisponível agora' : undefined} />
          <ul className="kn-sublist">{group.items.map((item) => (
            <li key={item.id}>
              {item.cover_url && <img src={item.cover_url} alt="" className="kn-cover" />}
              <span className="kn-title">{item.label}{item.sublabel ? ` — ${item.sublabel}` : ''}</span>
              <span className="ds-mono">{item.done ? 'concluído' : 'em andamento'}</span>
              {!closed && <IconButton icon="close" label={`Desvincular ${item.label}`} size={14} onClick={() => void run(() => kaguyaApi.goals.unlinkExternal(id, pid, item.id), 'Não foi possível desvincular.', 'Item desvinculado.')} />}
            </li>
          ))}</ul>
        </section>
      ))}
      {mv.experiments.length === 0 && mv.tasks.length === 0 && mv.habits.length === 0 && external.length === 0 && <p className="ds-hint">Nenhum movimento vinculado ainda.</p>}

      {!closed && (
        <section aria-label="Vincular">
          <SectionHeader title="Vincular movimento" />
          <div className="kn-quick">
            <Select aria-label="Tipo de movimento" value={linkType} onChange={(e) => { setLinkType(e.target.value as MovementType); setLinkItem('') }}>
              {MOVEMENTS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
            <Select aria-label="Item a vincular" value={linkItem} onChange={(e) => setLinkItem(e.target.value)}>
              <option value="">Escolher item…</option>
              {linkables.state.status === 'ok' && linkables.state.data.map((l) => <option key={l.id} value={l.id}>{l.label}{l.linked_goal_id != null ? ' (vinculado)' : ''}</option>)}
            </Select>
            <Button variant="primary" disabled={!linkItem} onClick={() => void run(() => kaguyaApi.goals.link(id, linkType, Number(linkItem)), 'Não foi possível vincular.', 'Item vinculado.').then(() => setLinkItem(''))}>Vincular</Button>
            {linkType === 'experiment' && <Button icon="add" onClick={() => setNewExp(true)}>Novo experimento</Button>}
          </div>
          {picked?.linked_goal_id != null && picked.linked_goal_id !== id && <p className="ds-hint">Este item já pertence a outra meta — vincular vai movê-lo para esta.</p>}

          {providers.state.status === 'ok' && providers.state.data.length > 0 && (
            <>
              <SectionHeader title="Itens de outros agentes" />
              <div className="kn-quick">
                <Select aria-label="Fonte" value={providerId} onChange={(e) => setExtProvider(e.target.value)}>
                  {providers.state.data.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
                <Input aria-label="Buscar item" placeholder="Buscar…" value={extQuery} onChange={(e) => setExtQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void kaguyaApi.goals.searchLinkItems(providerId, extQuery).then(setExtResults).catch(() => { setExtResults([]); toast('Não foi possível buscar.', { tone: 'error' }) }) }} />
                <Button onClick={() => void kaguyaApi.goals.searchLinkItems(providerId, extQuery).then(setExtResults).catch(() => { setExtResults([]); toast('Não foi possível buscar.', { tone: 'error' }) })}>Buscar</Button>
              </div>
              {extResults.length > 0 && (
                <ul className="kn-sublist" aria-label="Resultados da busca">
                  {extResults.map((r) => (
                    <li key={r.id}><span className="kn-title">{r.label}{r.sublabel ? ` — ${r.sublabel}` : ''}</span><Button size="sm" variant="primary" onClick={() => void run(() => kaguyaApi.goals.linkExternal(id, providerId, r.id), 'Não foi possível vincular.', 'Item vinculado.')}>Vincular</Button></li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      )}
    </>
  )

  const revisao = closed ? (
    <>
      {goal.outcome && <Chip on>{OUTCOME_LABEL[goal.outcome]}</Chip>}
      {goal.review ? <p>“{goal.review}”</p> : <p className="ds-hint">Sem texto de revisão.</p>}
    </>
  ) : (
    <>
      <p className="ds-hint">Encerrar a meta com um desfecho e o que você aprendeu.</p>
      <div className="kn-chips" role="group" aria-label="Desfecho">
        {OUTCOMES.map((o) => <Chip key={o.value} on={outcome === o.value} aria-pressed={outcome === o.value} onClick={() => setOutcome(o.value)}>{o.label}</Chip>)}
      </div>
      <Textarea aria-label="O que você aprendeu com esta meta?" rows={3} placeholder="O que você aprendeu com esta meta?" value={review} onChange={(e) => setReview(e.target.value)} />
      <div><Button variant="primary" disabled={reviewing} onClick={() => void submitReview()}>{reviewing ? 'Encerrando…' : 'Encerrar meta'}</Button></div>
    </>
  )

  return (
    <Page wide className="kn-page">
      <DetailPage
        backLabel="Metas"
        onBack={back}
        title={goal.title}
        subtitle={`Prazo ${fmtDate(goal.deadline)}${!closed ? ` · ${deadlineText(goal)}` : ''}`}
        chips={<>{goal.life_area && <Chip on>{goal.life_area}</Chip>}{goal.is_overdue && <Chip on icon="warning">Atrasada</Chip>}{closed && goal.outcome && <Chip on>{OUTCOME_LABEL[goal.outcome]}</Chip>}</>}
        icon="goal"
        hue={HUE}
        actions={<Button icon="edit" onClick={() => setEditing(true)}>Editar</Button>}
        tabs={[{ id: 'progresso', label: 'Progresso', content: progresso }, { id: 'movimentos', label: 'Movimentos', content: movimentos }, { id: 'revisao', label: 'Revisão', content: revisao }]}
        tab={tab}
        onTab={setTab}
      />
      {editing && <GoalModal goal={goal} onClose={() => setEditing(false)} onSaved={k.reload} onDeleted={back} />}
      {newExp && <ExperimentModal goalId={id} onClose={() => setNewExp(false)} onSaved={k.reload} />}
    </Page>
  )
}
