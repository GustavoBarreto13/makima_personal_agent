// GoalModal — criar/editar uma meta (Metas, spec 030).
// Campos: título, porquê/área/anti-metas/accountability (opcionais), métrica-alvo + unidade
// (opcionais), e o prazo (DatePicker). O VALOR ATUAL da métrica e os MARCOS são editados no
// detalhe da meta, não aqui. Em edição oferece EXCLUIR (hard delete — os itens vinculados são
// desvinculados, nunca apagados), com confirmação. Espelha o padrão do ExperimentModal.

import { useState } from 'react'
import type { Goal } from '../types'
import { kaguyaApi } from '../kaguyaApi'
import { Icon } from '../ui/Icons'
import { DatePicker } from '../components/DatePicker'
import { addDays, toISO } from '../lib/dateUtils'

interface GoalModalProps {
  mode: 'create' | 'edit'
  goal?: Goal
  onClose: () => void
  onSaved: () => void
  // Chamado após excluir — permite ao shell sair da tela de detalhe da meta apagada.
  onDeleted?: () => void
  toast: (msg: string, kind?: 'ok' | 'err') => void
}

export function GoalModal({ mode, goal, onClose, onSaved, onDeleted, toast }: GoalModalProps) {
  const [title, setTitle] = useState(goal?.title ?? '')
  const [why, setWhy] = useState(goal?.why ?? '')
  const [lifeArea, setLifeArea] = useState(goal?.life_area ?? '')
  // Mensurável: ligado quando a meta já tem métrica-alvo (na edição) ou quando o usuário marca.
  const [hasMetric, setHasMetric] = useState(goal?.metric_target != null)
  const [metricTarget, setMetricTarget] = useState<string>(goal?.metric_target != null ? String(goal.metric_target) : '')
  const [metricUnit, setMetricUnit] = useState(goal?.metric_unit ?? '')
  // Prazo padrão na criação: daqui a 90 dias (~um trimestre).
  const [deadline, setDeadline] = useState(goal?.deadline ?? toISO(addDays(new Date(), 90)))
  const [antiGoals, setAntiGoals] = useState(goal?.anti_goals ?? '')
  const [accountability, setAccountability] = useState(goal?.accountability ?? '')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!title.trim()) { toast('O título não pode ser vazio.', 'err'); return }
    if (!deadline) { toast('Informe o prazo.', 'err'); return }
    const mt = hasMetric && metricTarget.trim() ? Number(metricTarget) : null
    if (hasMetric && (mt == null || !(mt > 0))) {
      toast('Informe uma métrica-alvo maior que zero.', 'err'); return
    }

    setSaving(true)
    try {
      const common = {
        title: title.trim(), deadline,
        why: why.trim() || null, life_area: lifeArea.trim() || null,
        metric_target: mt, metric_unit: hasMetric ? (metricUnit.trim() || null) : null,
        anti_goals: antiGoals.trim() || null, accountability: accountability.trim() || null,
      }
      if (mode === 'create') {
        await kaguyaApi.goals.create(common)
        toast('Meta criada.')
      } else if (goal) {
        await kaguyaApi.goals.update(goal.id, common)
        toast('Meta atualizada.')
      }
      onSaved(); onClose()
    } catch { toast('Não foi possível salvar a meta.', 'err') }
    finally { setSaving(false) }
  }

  const del = async () => {
    if (!goal) return
    try {
      await kaguyaApi.goals.del(goal.id)
      toast('Meta excluída.')
      onSaved(); onDeleted?.(); onClose()
    } catch { toast('Não foi possível excluir a meta.', 'err') }
  }

  return (
    <div className="kg-scrim" onClick={onClose}>
      <div className="kg-modal" style={{ maxWidth: 500 }} onClick={(e) => e.stopPropagation()}>
        <div className="kg-modal-head">
          <h3>{mode === 'create' ? 'Nova meta' : 'Editar meta'}</h3>
          <button className="kg-icon-btn" onClick={onClose} aria-label="Fechar"><Icon name="x" /></button>
        </div>

        <div className="kg-modal-body">
          <div className="kg-field">
            <span className="kg-field-label">Título</span>
            <input className="kg-input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Ler 12 livros em 2026" />
          </div>

          <div className="kg-field">
            <span className="kg-field-label">Por quê? (opcional)</span>
            <input className="kg-input" value={why} onChange={(e) => setWhy(e.target.value)} placeholder="O valor por trás da meta" />
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <div className="kg-field" style={{ flex: 1 }}>
              <span className="kg-field-label">Área da vida (opcional)</span>
              <input className="kg-input" value={lifeArea} onChange={(e) => setLifeArea(e.target.value)} placeholder="Ex.: Saúde, Crescimento…" />
            </div>
            <div className="kg-field" style={{ flex: 1 }}>
              <span className="kg-field-label">Prazo</span>
              <DatePicker value={deadline} onChange={setDeadline} />
            </div>
          </div>

          {/* Métrica-alvo opcional */}
          <div className="kg-field">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={hasMetric} onChange={(e) => setHasMetric(e.target.checked)} />
              <span className="kg-field-label" style={{ margin: 0 }}>Medir por uma métrica numérica</span>
            </label>
            {hasMetric && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, color: 'var(--ink-2)' }}>
                <span>Alvo</span>
                <input className="kg-input" type="number" min={1} style={{ width: 90 }} value={metricTarget} onChange={(e) => setMetricTarget(e.target.value)} placeholder="12" />
                <input className="kg-input" style={{ width: 130 }} value={metricUnit} onChange={(e) => setMetricUnit(e.target.value)} placeholder="livros, kg, …" />
              </div>
            )}
          </div>

          <div className="kg-field">
            <span className="kg-field-label">Anti-metas (opcional)</span>
            <input className="kg-input" value={antiGoals} onChange={(e) => setAntiGoals(e.target.value)} placeholder="O que evitar no caminho" />
          </div>
          <div className="kg-field">
            <span className="kg-field-label">Accountability (opcional)</span>
            <input className="kg-input" value={accountability} onChange={(e) => setAccountability(e.target.value)} placeholder="Com quem/como se responsabilizar" />
          </div>

          {/* Excluir (só na edição) */}
          {mode === 'edit' && goal && (
            <div className="kg-field" style={{ borderTop: '1px solid var(--line-2)', paddingTop: 12 }}>
              {!confirmingDelete ? (
                <button className="kg-btn kg-btn-danger" onClick={() => setConfirmingDelete(true)}>
                  <Icon name="trash" size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />Excluir meta
                </button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <span className="kg-field-label">Excluir esta meta? Os itens vinculados são desvinculados (nunca apagados).</span>
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
