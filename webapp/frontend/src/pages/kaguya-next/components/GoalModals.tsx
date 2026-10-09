// Criar/editar uma meta e um experimento. Meta: título, porquê, área, prazo, métrica numérica opcional (alvo + unidade),
// anti-metas e accountability — o VALOR ATUAL e os MARCOS ficam no detalhe. Experimento: fórmula, porquê, hipótese,
// cadência, início/fim e a meta a que pertence. Excluir pede confirmação e diz o que acontece com o que está vinculado.

import { useEffect, useState } from 'react'
import { Button, Chip, DatePicker, Field, Input, Modal, NumberInput, Select, Toggle, confirm, toast } from '../../../design'
import { addDaysISO } from '../../../design/core/format'
import { kaguyaApi } from '../api'
import { useKaguya } from '../context'
import type { Experiment, ExperimentCadence, Goal } from '../types'

const reason = (e: unknown, fallback: string) => (e instanceof Error && e.message && !/^HTTP \d+$/.test(e.message) ? e.message : fallback)

export function GoalModal({ goal, onClose, onSaved, onDeleted }: { goal?: Goal; onClose: () => void; onSaved: () => void; onDeleted?: () => void }) {
  const k = useKaguya()
  const [title, setTitle] = useState(goal?.title ?? '')
  const [why, setWhy] = useState(goal?.why ?? '')
  const [area, setArea] = useState(goal?.life_area ?? '')
  const [hasMetric, setHasMetric] = useState(goal?.metric_target != null)
  const [target, setTarget] = useState(goal?.metric_target != null ? String(goal.metric_target) : '')
  const [unit, setUnit] = useState(goal?.metric_unit ?? '')
  // Prazo padrão: daqui a 90 dias (um trimestre), contado do dia local.
  const [deadline, setDeadline] = useState(goal?.deadline ?? addDaysISO(k.today, 90))
  const [anti, setAnti] = useState(goal?.anti_goals ?? '')
  const [account, setAccount] = useState(goal?.accountability ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const save = async () => {
    if (!title.trim()) { setError('Dê um título à meta.'); return }
    if (!deadline) { setError('Informe o prazo.'); return }
    const mt = hasMetric && target.trim() ? Number(target) : null
    if (hasMetric && !(mt != null && mt > 0)) { setError('Informe uma métrica-alvo maior que zero.'); return }
    setSaving(true)
    try {
      const body = {
        title: title.trim(), deadline, why: why.trim() || null, life_area: area.trim() || null,
        metric_target: mt, metric_unit: hasMetric ? unit.trim() || null : null, anti_goals: anti.trim() || null, accountability: account.trim() || null,
      }
      if (goal) await kaguyaApi.goals.update(goal.id, body)
      else await kaguyaApi.goals.create(body)
      toast(goal ? 'Meta atualizada.' : 'Meta criada.', { tone: 'success' })
      onSaved()
      onClose()
    } catch (e) { setError(reason(e, 'Não foi possível salvar a meta.')) } finally { setSaving(false) }
  }

  const remove = async () => {
    if (!goal) return
    const ok = await confirm({ title: `Excluir a meta “${goal.title}”?`, body: 'Os itens vinculados são desvinculados, nunca apagados.', confirmLabel: 'Excluir meta', danger: true })
    if (!ok) return
    try { await kaguyaApi.goals.del(goal.id); toast('Meta excluída.', { tone: 'success' }); onSaved(); onDeleted?.(); onClose() }
    catch (e) { toast(reason(e, 'Não foi possível excluir a meta.'), { tone: 'error' }) }
  }

  return (
    <Modal
      title={goal ? 'Editar meta' : 'Nova meta'}
      size="md"
      dirty
      onClose={onClose}
      footer={(
        <>
          {goal && <Button variant="danger" icon="delete" onClick={() => void remove()}>Excluir meta</Button>}
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={saving} onClick={() => void save()}>{saving ? 'Salvando…' : 'Salvar'}</Button>
        </>
      )}
    >
      <Field label="Título" error={error || undefined}>{(c) => <Input {...c} autoFocus value={title} placeholder="Ex.: Ler 12 livros em 2026" onChange={(e) => { setTitle(e.target.value); setError('') }} />}</Field>
      <Field label="Por quê? (opcional)">{(c) => <Input {...c} value={why} placeholder="O valor por trás da meta" onChange={(e) => setWhy(e.target.value)} />}</Field>
      <div className="kn-props">
        <Field label="Área da vida (opcional)">{(c) => <Input {...c} value={area} placeholder="Ex.: Saúde, Crescimento…" onChange={(e) => setArea(e.target.value)} />}</Field>
        <Field label="Prazo">{(c) => <DatePicker id={c.id} value={deadline} onChange={setDeadline} />}</Field>
      </div>
      <Toggle checked={hasMetric} onChange={setHasMetric} label="Medir por uma métrica numérica" />
      {hasMetric && (
        <div className="kn-props">
          <Field label="Alvo">{(c) => <NumberInput {...c} min={1} value={target} placeholder="12" onChange={(e) => setTarget(e.target.value)} />}</Field>
          <Field label="Unidade">{(c) => <Input {...c} value={unit} placeholder="livros, kg…" onChange={(e) => setUnit(e.target.value)} />}</Field>
        </div>
      )}
      <Field label="Anti-metas (opcional)">{(c) => <Input {...c} value={anti} placeholder="O que evitar no caminho" onChange={(e) => setAnti(e.target.value)} />}</Field>
      <Field label="Accountability (opcional)">{(c) => <Input {...c} value={account} placeholder="Com quem/como se responsabilizar" onChange={(e) => setAccount(e.target.value)} />}</Field>
    </Modal>
  )
}

const CADENCES: { value: ExperimentCadence; label: string }[] = [{ value: 'daily', label: 'Diária' }, { value: 'weekly', label: 'Semanal' }]

export function ExperimentModal({ experiment, goalId, onClose, onSaved, onDeleted }: { experiment?: Experiment; goalId?: number; onClose: () => void; onSaved: () => void; onDeleted?: () => void }) {
  const k = useKaguya()
  const [title, setTitle] = useState(experiment?.title ?? '')
  const [why, setWhy] = useState(experiment?.why ?? '')
  const [hypothesis, setHypothesis] = useState(experiment?.hypothesis ?? '')
  const [cadence, setCadence] = useState<ExperimentCadence>(experiment?.cadence ?? 'daily')
  // Prazo padrão: do dia local até daqui a 14 dias.
  const [start, setStart] = useState(experiment?.start_date ?? k.today)
  const [end, setEnd] = useState(experiment?.end_date ?? addDaysISO(k.today, 14))
  const [goals, setGoals] = useState<Goal[]>([])
  const [goal, setGoal] = useState<number | null>(goalId ?? experiment?.goal_id ?? null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { kaguyaApi.goals.list(false).then(setGoals).catch(() => setGoals([])) }, [])

  const save = async () => {
    if (!title.trim()) { setError('Escreva a fórmula do experimento.'); return }
    if (!start || !end) { setError('Informe o início e o fim.'); return }
    if (end < start) { setError('O fim não pode ser antes do início.'); return }
    setSaving(true)
    try {
      const body = { title: title.trim(), start_date: start, end_date: end, why: why.trim() || null, hypothesis: hypothesis.trim() || null, cadence }
      if (!experiment) {
        const res = await kaguyaApi.experiments.create(body)
        // Nasce vinculado à meta escolhida (inclusive quando vem do fluxo “Novo experimento” da própria meta).
        if (goal != null && res.id != null) {
          try { await kaguyaApi.goals.link(goal, 'experiment', res.id) } catch { toast('Experimento criado, mas não foi possível vinculá-lo à meta.', { tone: 'error' }) }
        }
      } else {
        await kaguyaApi.experiments.update(experiment.id, body)
        const original = experiment.goal_id ?? null
        if (goal !== original) {
          try {
            if (goal != null) await kaguyaApi.goals.link(goal, 'experiment', experiment.id)
            else await kaguyaApi.goals.unlink(original!, 'experiment', experiment.id)
          } catch { toast('Experimento salvo, mas não foi possível atualizar a meta.', { tone: 'error' }) }
        }
      }
      toast(experiment ? 'Experimento atualizado.' : 'Experimento criado.', { tone: 'success' })
      onSaved()
      onClose()
    } catch (e) { setError(reason(e, 'Não foi possível salvar o experimento.')) } finally { setSaving(false) }
  }

  const remove = async () => {
    if (!experiment) return
    const ok = await confirm({ title: `Excluir “${experiment.title}”?`, body: 'Os check-ins são apagados junto e não dá para desfazer.', confirmLabel: 'Excluir experimento', danger: true })
    if (!ok) return
    try { await kaguyaApi.experiments.del(experiment.id); toast('Experimento excluído.', { tone: 'success' }); onSaved(); onDeleted?.(); onClose() }
    catch (e) { toast(reason(e, 'Não foi possível excluir o experimento.'), { tone: 'error' }) }
  }

  return (
    <Modal
      title={experiment ? 'Editar experimento' : 'Novo experimento'}
      size="md"
      dirty
      onClose={onClose}
      footer={(
        <>
          {experiment && <Button variant="danger" icon="delete" onClick={() => void remove()}>Excluir experimento</Button>}
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={saving} onClick={() => void save()}>{saving ? 'Salvando…' : 'Salvar'}</Button>
        </>
      )}
    >
      <Field label="Fórmula" error={error || undefined}>{(c) => <Input {...c} autoFocus value={title} placeholder="Ex.: Vou meditar 5 min por dia" onChange={(e) => { setTitle(e.target.value); setError('') }} />}</Field>
      <Field label="Por quê? (opcional)">{(c) => <Input {...c} value={why} placeholder="Ex.: ter mais foco" onChange={(e) => setWhy(e.target.value)} />}</Field>
      <Field label="Hipótese (opcional)">{(c) => <Input {...c} value={hypothesis} placeholder="Ex.: talvez se eu meditar de manhã, então rendo mais" onChange={(e) => setHypothesis(e.target.value)} />}</Field>
      <Field label="Cadência do check-in">{() => (
        <div className="kn-chips" role="group" aria-label="Cadência do check-in">
          {CADENCES.map((c) => <Chip key={c.value} on={cadence === c.value} aria-pressed={cadence === c.value} onClick={() => setCadence(c.value)}>{c.label}</Chip>)}
        </div>
      )}</Field>
      <div className="kn-props">
        <Field label="Início">{(c) => <DatePicker id={c.id} value={start} onChange={setStart} />}</Field>
        <Field label="Fim">{(c) => <DatePicker id={c.id} value={end} onChange={setEnd} />}</Field>
      </div>
      <Field label="Meta (opcional)">{(c) => (
        <Select {...c} value={goal ?? ''} onChange={(e) => setGoal(e.target.value ? Number(e.target.value) : null)}>
          <option value="">Nenhuma meta</option>
          {goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
        </Select>
      )}</Field>
    </Modal>
  )
}
