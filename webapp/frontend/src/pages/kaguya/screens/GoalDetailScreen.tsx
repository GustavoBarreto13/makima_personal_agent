// GoalDetailScreen — detalhe de uma meta (Metas, spec 030).
// Cabeçalho + barra de progresso; edição do VALOR da métrica; CRUD de MARCOS; seção de
// MOVIMENTOS (experimentos/tarefas/hábitos vinculados, com status + desvincular + seletor de
// vínculo + "novo experimento já vinculado" — FR-011); e a REVISÃO de encerramento (US3).
// Segue o padrão de carregamento silencioso (firstLoad ref) por receber reloadKey do shell.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Goal, GoalOutcome, MovementType, LinkableItem } from '../types'
import { kaguyaApi } from '../kaguyaApi'
import { Icon } from '../ui/Icons'
import { fmtDateLabel } from '../lib/dateUtils'

interface GoalDetailScreenProps {
  goalId: number
  reloadKey: number
  onBack: () => void
  onEdit: (goal: Goal) => void
  // Abre o ExperimentModal já com o goalId (cria experimento vinculado — FR-011).
  onNewLinkedExperiment: (goalId: number) => void
  toast: (msg: string, kind?: 'ok' | 'err') => void
}

const OUTCOMES: { value: GoalOutcome; label: string }[] = [
  { value: 'achieved', label: 'Atingida' },
  { value: 'missed', label: 'Não atingida' },
  { value: 'revise', label: 'Revisar' },
]

const MOVEMENT_TYPES: { value: MovementType; label: string }[] = [
  { value: 'experiment', label: 'Experimento' },
  { value: 'task', label: 'Tarefa' },
  { value: 'habit', label: 'Hábito' },
]

export function GoalDetailScreen({ goalId, reloadKey, onBack, onEdit, onNewLinkedExperiment, toast }: GoalDetailScreenProps) {
  const [goal, setGoal] = useState<Goal | null>(null)
  const [loading, setLoading] = useState(true)
  const firstLoad = useRef(true)

  // Métrica
  const [metricInput, setMetricInput] = useState('')
  // Marcos
  const [newMilestone, setNewMilestone] = useState('')
  // Seletor de vínculo
  const [linkType, setLinkType] = useState<MovementType>('experiment')
  const [linkables, setLinkables] = useState<LinkableItem[]>([])
  const [linkItemId, setLinkItemId] = useState<number | ''>('')
  // Revisão
  const [outcome, setOutcome] = useState<GoalOutcome | null>(null)
  const [review, setReview] = useState('')
  const [reviewing, setReviewing] = useState(false)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const g = await kaguyaApi.goals.get(goalId)
      setGoal(g)
      setMetricInput(g.metric_current != null ? String(g.metric_current) : '')
    } catch {
      toast('Falha ao carregar a meta.', 'err')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [goalId, toast])

  useEffect(() => {
    const silent = !firstLoad.current
    firstLoad.current = false
    load(silent)
  }, [load, reloadKey])

  // Carrega os itens vinculáveis do tipo selecionado (para o seletor de vínculo).
  const loadLinkables = useCallback(async (type: MovementType) => {
    try { setLinkables(await kaguyaApi.goals.linkable(type)); setLinkItemId('') }
    catch { setLinkables([]) }
  }, [])
  useEffect(() => { loadLinkables(linkType) }, [linkType, loadLinkables, reloadKey])

  const saveMetric = async () => {
    const v = metricInput.trim() === '' ? 0 : Number(metricInput)
    if (isNaN(v)) { toast('Valor inválido.', 'err'); return }
    try { await kaguyaApi.goals.update(goalId, { metric_current: v }); toast('Métrica atualizada.'); load(true) }
    catch { toast('Não foi possível atualizar a métrica.', 'err') }
  }

  const addMilestone = async () => {
    const t = newMilestone.trim()
    if (!t) return
    try { await kaguyaApi.goals.addMilestone(goalId, t); setNewMilestone(''); toast('Marco adicionado.'); load(true) }
    catch { toast('Não foi possível adicionar o marco.', 'err') }
  }
  const toggleMilestone = async (mid: number, done: boolean) => {
    try { await kaguyaApi.goals.updateMilestone(goalId, mid, { done }); load(true) }
    catch { toast('Não foi possível atualizar o marco.', 'err') }
  }
  const removeMilestone = async (mid: number) => {
    try { await kaguyaApi.goals.delMilestone(goalId, mid); load(true) }
    catch { toast('Não foi possível remover o marco.', 'err') }
  }

  const linkItem = async () => {
    if (linkItemId === '') { toast('Escolha um item.', 'err'); return }
    try {
      await kaguyaApi.goals.link(goalId, linkType, Number(linkItemId))
      toast('Item vinculado.')
      load(true); loadLinkables(linkType)
    } catch { toast('Não foi possível vincular.', 'err') }
  }
  const unlinkItem = async (type: MovementType, itemId: number) => {
    try { await kaguyaApi.goals.unlink(goalId, type, itemId); toast('Item desvinculado.'); load(true); loadLinkables(linkType) }
    catch { toast('Não foi possível desvincular.', 'err') }
  }

  const submitReview = async () => {
    if (!outcome) { toast('Escolha um desfecho.', 'err'); return }
    if (!review.trim()) { toast('Escreva o aprendizado.', 'err'); return }
    setReviewing(true)
    try { await kaguyaApi.goals.review(goalId, { outcome, review: review.trim() }); toast('Meta encerrada.'); load(true) }
    catch { toast('Não foi possível encerrar.', 'err') }
    finally { setReviewing(false) }
  }

  if (loading) return <div className="kg-page"><div className="kg-empty">Carregando…</div></div>
  if (!goal) return <div className="kg-page"><div className="kg-empty">Meta não encontrada.</div></div>

  const closed = goal.status === 'closed'
  const mv = goal.movements ?? { experiments: [], tasks: [], habits: [] }
  const selectedLinkable = linkables.find((l) => l.id === linkItemId)

  return (
    <div className="kg-page">
      {/* Voltar + editar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <button className="kg-btn kg-btn-ghost" onClick={onBack}>
          <Icon name="back" size={15} style={{ verticalAlign: 'middle', marginRight: 4 }} />Metas
        </button>
        <span style={{ marginLeft: 'auto' }} />
        <button className="kg-icon-btn" onClick={() => onEdit(goal)} aria-label="Editar"><Icon name="settings" size={15} /></button>
      </div>

      <h1 className="kg-page-title">{goal.title}</h1>
      <div className="kg-goal-meta" style={{ marginBottom: 14 }}>
        {goal.life_area && <span className="kg-goal-badge">{goal.life_area}</span>}
        <span>prazo {fmtDateLabel(goal.deadline)}</span>
        {goal.is_overdue && <span className="kg-goal-badge overdue">⚠ Atrasada</span>}
        {closed && goal.outcome && <span className={`kg-goal-badge ${goal.outcome}`}>{OUTCOMES.find((o) => o.value === goal.outcome)?.label}</span>}
      </div>

      {goal.why && <div className="kg-goal-why" style={{ marginBottom: 6 }}><b>Por quê:</b> {goal.why}</div>}
      {goal.anti_goals && <div className="kg-goal-why" style={{ marginBottom: 6 }}><b>Anti-metas:</b> {goal.anti_goals}</div>}
      {goal.accountability && <div className="kg-goal-why" style={{ marginBottom: 6 }}><b>Accountability:</b> {goal.accountability}</div>}

      {/* Progresso combinado */}
      <div className="kg-goal-prog" style={{ maxWidth: 480, marginTop: 12 }}>
        <div className="kg-goal-prog-label">
          <span>Progresso</span>
          <span className="kg-goal-prog-pct">{goal.progress_pct == null ? '—' : `${goal.progress_pct}%`}</span>
        </div>
        <div className="kg-goal-prog-bar">
          <div className="kg-goal-prog-fill" style={{ ['--pct' as string]: `${goal.progress_pct ?? 0}` }} />
        </div>
      </div>

      {/* Métrica (só quando há métrica-alvo) */}
      {goal.metric_target != null && !closed && (
        <div className="kg-goal-section">
          <div className="kg-page-sub">Métrica</div>
          <div className="kg-goal-metric-row">
            <div className="kg-field" style={{ margin: 0 }}>
              <span className="kg-field-label">Valor atual (de {goal.metric_target}{goal.metric_unit ? ' ' + goal.metric_unit : ''})</span>
              <input className="kg-input" type="number" style={{ width: 120 }} value={metricInput} onChange={(e) => setMetricInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') saveMetric() }} />
            </div>
            <button className="kg-btn kg-btn-primary" onClick={saveMetric}>Salvar</button>
          </div>
        </div>
      )}

      {/* Marcos */}
      <div className="kg-goal-section">
        <div className="kg-page-sub">Marcos ({goal.milestones_done}/{goal.milestones_total})</div>
        <div className="kg-goal-ms">
          {(goal.milestones ?? []).map((m) => (
            <div key={m.id} className={`kg-goal-ms-row${m.done ? ' done' : ''}`}>
              <input type="checkbox" checked={m.done} disabled={closed} onChange={(e) => toggleMilestone(m.id, e.target.checked)} />
              <span className="kg-goal-ms-title">{m.title}</span>
              {!closed && <button className="kg-icon-btn" onClick={() => removeMilestone(m.id)} aria-label="Remover marco"><Icon name="trash" size={13} /></button>}
            </div>
          ))}
        </div>
        {!closed && (
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <input className="kg-input" value={newMilestone} onChange={(e) => setNewMilestone(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addMilestone() }} placeholder="Novo marco…" />
            <button className="kg-btn" onClick={addMilestone}><Icon name="plus" size={14} /></button>
          </div>
        )}
      </div>

      {/* Movimentos (US2) */}
      <div className="kg-goal-section">
        <div className="kg-page-sub">Movimentos</div>

        {mv.experiments.length > 0 && (
          <div className="kg-goal-mv-group">
            <div className="kg-goal-mv-group-title">🧪 Experimentos</div>
            {mv.experiments.map((e) => (
              <div key={e.id} className="kg-goal-mv-row">
                <span className="kg-goal-mv-title">{e.title}</span>
                <span className="kg-goal-mv-status">{e.status} · {e.adherence_pct}%</span>
                {!closed && <button className="kg-icon-btn" onClick={() => unlinkItem('experiment', e.id)} aria-label="Desvincular"><Icon name="x" size={13} /></button>}
              </div>
            ))}
          </div>
        )}
        {mv.tasks.length > 0 && (
          <div className="kg-goal-mv-group">
            <div className="kg-goal-mv-group-title">📋 Tarefas</div>
            {mv.tasks.map((t) => (
              <div key={t.id} className="kg-goal-mv-row">
                <span className="kg-goal-mv-title">{t.title}</span>
                <span className="kg-goal-mv-status">{t.completed ? 'concluída' : 'aberta'}</span>
                {!closed && <button className="kg-icon-btn" onClick={() => unlinkItem('task', t.id)} aria-label="Desvincular"><Icon name="x" size={13} /></button>}
              </div>
            ))}
          </div>
        )}
        {mv.habits.length > 0 && (
          <div className="kg-goal-mv-group">
            <div className="kg-goal-mv-group-title">🔁 Hábitos</div>
            {mv.habits.map((h) => (
              <div key={h.id} className="kg-goal-mv-row">
                <span className="kg-goal-mv-title">{h.name}</span>
                <span className="kg-goal-mv-status">consistência {h.consistency}</span>
                {!closed && <button className="kg-icon-btn" onClick={() => unlinkItem('habit', h.id)} aria-label="Desvincular"><Icon name="x" size={13} /></button>}
              </div>
            ))}
          </div>
        )}
        {mv.experiments.length === 0 && mv.tasks.length === 0 && mv.habits.length === 0 && (
          <div className="kg-goal-why">Nenhum movimento vinculado ainda.</div>
        )}

        {/* Seletor de vínculo (só quando ativa) */}
        {!closed && (
          <>
            <div className="kg-goal-link">
              <select className="kg-select" style={{ width: 'auto' }} value={linkType} onChange={(e) => setLinkType(e.target.value as MovementType)}>
                {MOVEMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <select className="kg-select" style={{ width: 'auto', minWidth: 180 }} value={linkItemId} onChange={(e) => setLinkItemId(e.target.value === '' ? '' : Number(e.target.value))}>
                <option value="">Escolher item…</option>
                {linkables.map((l) => <option key={l.id} value={l.id}>{l.label}{l.linked_goal_id != null ? ' (vinculado)' : ''}</option>)}
              </select>
              <button className="kg-btn kg-btn-primary" onClick={linkItem}>Vincular</button>
              {linkType === 'experiment' && (
                <button className="kg-btn" onClick={() => onNewLinkedExperiment(goalId)}>
                  <Icon name="plus" size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />Novo experimento
                </button>
              )}
            </div>
            {selectedLinkable?.linked_goal_id != null && selectedLinkable.linked_goal_id !== goalId && (
              <div className="kg-goal-link-warn">Este item já pertence a outra meta — vincular vai movê-lo para esta.</div>
            )}
          </>
        )}
      </div>

      {/* Revisão (US3) */}
      {closed ? (
        <div className="kg-goal-review">
          <div className="kg-page-sub">Revisão</div>
          <div className="kg-goal-meta">
            <span className={`kg-goal-badge ${goal.outcome ?? ''}`}>{OUTCOMES.find((o) => o.value === goal.outcome)?.label ?? goal.outcome}</span>
          </div>
          {goal.review && <div className="kg-goal-why" style={{ marginTop: 8 }}>“{goal.review}”</div>}
        </div>
      ) : (
        <div className="kg-goal-review">
          <div className="kg-page-sub">Encerrar com revisão</div>
          <div className="kg-goal-outcomes">
            {OUTCOMES.map((o) => (
              <button key={o.value} className={`kg-goal-outcome${outcome === o.value ? ' active' : ''}`} onClick={() => setOutcome(o.value)}>{o.label}</button>
            ))}
          </div>
          <textarea className="kg-textarea" rows={3} placeholder="O que você aprendeu com esta meta?" value={review} onChange={(e) => setReview(e.target.value)} />
          <div style={{ marginTop: 10 }}>
            <button className="kg-btn kg-btn-primary" onClick={submitReview} disabled={reviewing}>{reviewing ? 'Encerrando…' : 'Encerrar meta'}</button>
          </div>
        </div>
      )}
    </div>
  )
}
