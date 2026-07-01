// ExperimentModal — criar/editar um experimento (Tiny Experiments, spec 029).
// Campos: fórmula ("Vou [ação] por [duração]"), why/hipótese (opcionais), cadência
// (diária/semanal) e o prazo (início + fim, via DatePicker). Em edição oferece EXCLUIR
// (hard delete — os check-ins vão junto), com confirmação. Espelha o padrão do HabitModal.

import { useEffect, useState } from 'react'
import type { Experiment, ExperimentCadence, Goal } from '../types'
import { kaguyaApi } from '../kaguyaApi'
import { Icon } from '../ui/Icons'
import { DatePicker } from '../components/DatePicker'
import { todayISO, addDays, toISO } from '../lib/dateUtils'

interface ExperimentModalProps {
  mode: 'create' | 'edit'
  experiment?: Experiment
  // Metas (spec 030, FR-011): quando presente no modo criar (fluxo "+ Novo experimento" a partir
  // da meta), pré-seleciona esta meta no seletor. O seletor continua editável.
  goalId?: number
  onClose: () => void
  onSaved: () => void
  // Chamado após excluir — permite ao shell sair da tela de detalhe do experimento apagado.
  onDeleted?: () => void
  toast: (msg: string, kind?: 'ok' | 'err') => void
}

// Opções de cadência com rótulo em pt-BR.
const CADENCES: { value: ExperimentCadence; label: string }[] = [
  { value: 'daily', label: 'Diária' },
  { value: 'weekly', label: 'Semanal' },
]

export function ExperimentModal({ mode, experiment, goalId, onClose, onSaved, onDeleted, toast }: ExperimentModalProps) {
  const [title, setTitle] = useState(experiment?.title ?? '')
  const [why, setWhy] = useState(experiment?.why ?? '')
  const [hypothesis, setHypothesis] = useState(experiment?.hypothesis ?? '')
  const [cadence, setCadence] = useState<ExperimentCadence>(experiment?.cadence ?? 'daily')
  // Prazo padrão na criação: hoje até daqui a 14 dias (~2 semanas, horizonte típico).
  const [startDate, setStartDate] = useState(experiment?.start_date ?? todayISO())
  const [endDate, setEndDate] = useState(experiment?.end_date ?? toISO(addDays(new Date(), 14)))
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [saving, setSaving] = useState(false)

  // Vínculo com uma Meta (spec 030) — opcional. Carrega as metas ativas para o seletor e começa
  // pré-selecionado: prop `goalId` (fluxo a partir da meta) > goal_id atual (edição) > nenhuma.
  const [goals, setGoals] = useState<Goal[]>([])
  const [selectedGoal, setSelectedGoal] = useState<number | null>(goalId ?? experiment?.goal_id ?? null)
  useEffect(() => {
    kaguyaApi.goals.list(false).then(setGoals).catch(() => setGoals([]))
  }, [])

  const save = async () => {
    if (!title.trim()) { toast('A fórmula não pode ser vazia.', 'err'); return }
    if (!startDate || !endDate) { toast('Informe o início e o fim.', 'err'); return }
    if (endDate < startDate) { toast('A data de fim não pode ser antes do início.', 'err'); return }

    setSaving(true)
    try {
      if (mode === 'create') {
        const res = await kaguyaApi.experiments.create({
          title: title.trim(), start_date: startDate, end_date: endDate,
          why: why.trim() || null, hypothesis: hypothesis.trim() || null, cadence,
        })
        // Nasce vinculado se uma meta estiver selecionada (FR-011 e seletor manual).
        if (selectedGoal != null && res.id != null) {
          try { await kaguyaApi.goals.link(selectedGoal, 'experiment', res.id) }
          catch { toast('Experimento criado, mas não foi possível vincular à meta.', 'err') }
        }
        toast('Experimento criado.')
      } else if (experiment) {
        await kaguyaApi.experiments.update(experiment.id, {
          title: title.trim(), start_date: startDate, end_date: endDate,
          why: why.trim() || null, hypothesis: hypothesis.trim() || null, cadence,
        })
        // Reconcilia o vínculo com a meta se ele mudou (vincular à nova, ou desvincular).
        const original = experiment.goal_id ?? null
        if (selectedGoal !== original) {
          try {
            if (selectedGoal != null) await kaguyaApi.goals.link(selectedGoal, 'experiment', experiment.id)
            else await kaguyaApi.goals.unlink(original!, 'experiment', experiment.id)
          } catch { toast('Experimento salvo, mas não foi possível atualizar a meta.', 'err') }
        }
        toast('Experimento atualizado.')
      }
      onSaved(); onClose()
    } catch { toast('Não foi possível salvar o experimento.', 'err') }
    finally { setSaving(false) }
  }

  // Exclui (hard delete) o experimento e seus check-ins.
  const del = async () => {
    if (!experiment) return
    try {
      await kaguyaApi.experiments.del(experiment.id)
      toast('Experimento excluído.')
      onSaved(); onDeleted?.(); onClose()
    } catch { toast('Não foi possível excluir o experimento.', 'err') }
  }

  return (
    <div className="kg-scrim" onClick={onClose}>
      <div className="kg-modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="kg-modal-head">
          <h3>{mode === 'create' ? 'Novo experimento' : 'Editar experimento'}</h3>
          <button className="kg-icon-btn" onClick={onClose} aria-label="Fechar"><Icon name="x" /></button>
        </div>

        <div className="kg-modal-body">
          <div className="kg-field">
            <span className="kg-field-label">Fórmula</span>
            <input className="kg-input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Vou meditar 5 min por dia" />
          </div>

          <div className="kg-field">
            <span className="kg-field-label">Por quê? (opcional)</span>
            <input className="kg-input" value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Ex.: ter mais foco" />
          </div>

          <div className="kg-field">
            <span className="kg-field-label">Hipótese (opcional)</span>
            <input className="kg-input" value={hypothesis} onChange={(e) => setHypothesis(e.target.value)} placeholder="Ex.: talvez se eu meditar de manhã, então rendo mais" />
          </div>

          <div className="kg-field">
            <span className="kg-field-label">Cadência do check-in</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {CADENCES.map((c) => (
                <button
                  key={c.value}
                  className={`kg-btn${cadence === c.value ? ' kg-btn-primary' : ''}`}
                  style={{ padding: '6px 14px' }}
                  onClick={() => setCadence(c.value)}
                >{c.label}</button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <div className="kg-field" style={{ flex: 1 }}>
              <span className="kg-field-label">Início</span>
              <DatePicker value={startDate} onChange={setStartDate} />
            </div>
            <div className="kg-field" style={{ flex: 1 }}>
              <span className="kg-field-label">Fim</span>
              <DatePicker value={endDate} onChange={setEndDate} />
            </div>
          </div>

          {/* Vínculo com uma Meta (opcional) — spec 030 */}
          <div className="kg-field">
            <span className="kg-field-label">Meta (opcional)</span>
            <select
              className="kg-input"
              value={selectedGoal ?? ''}
              onChange={(e) => setSelectedGoal(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Nenhuma meta</option>
              {goals.map((g) => (
                <option key={g.id} value={g.id}>{g.title}</option>
              ))}
            </select>
          </div>

          {/* Excluir (só na edição) */}
          {mode === 'edit' && experiment && (
            <div className="kg-field" style={{ borderTop: '1px solid var(--line-2)', paddingTop: 12 }}>
              {!confirmingDelete ? (
                <button className="kg-btn kg-btn-danger" onClick={() => setConfirmingDelete(true)}>
                  <Icon name="trash" size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />Excluir experimento
                </button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <span className="kg-field-label">Excluir este experimento? Os check-ins são apagados junto (sem desfazer).</span>
                  <button className="kg-btn kg-btn-danger" onClick={del}>Sim, excluir</button>
                  <button className="kg-btn kg-btn-ghost" onClick={() => setConfirmingDelete(false)}>Cancelar</button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="kg-modal-foot">
          <button className="kg-btn kg-btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="kg-btn kg-btn-primary" onClick={save} disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  )
}
