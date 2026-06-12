// HabitModal — criar/editar um hábito (Fase 4 / fatia 014).
// Campos: nome, ícone (emoji), frequência (freq_num "x" a cada freq_den dias), e o tipo
// sim/não vs MENSURÁVEL (meta numérica + unidade). Em edição, oferece arquivar (soft delete)
// com confirmação. Espelha o padrão do ProjectModal.

import { useState } from 'react'
import type { Habit } from '../types'
import { kaguyaApi } from '../kaguyaApi'
import { Icon } from '../ui/Icons'

interface HabitModalProps {
  mode: 'create' | 'edit'
  habit?: Habit
  onClose: () => void
  onSaved: () => void
  toast: (msg: string, kind?: 'ok' | 'err') => void
}

// Emojis sugeridos para o hábito (atalho; o usuário pode digitar outro).
const ICONS = ['🧘', '📖', '🏃', '💧', '🥦', '🛌', '🦷', '💪', '🎸', '✍️', '🧹', '🌅']

// Atalhos de frequência comuns → [freq_num, freq_den]. "Personalizada" deixa os números livres.
const FREQ_PRESETS: { label: string; fn: number; fd: number }[] = [
  { label: 'Todo dia', fn: 1, fd: 1 },
  { label: '5x / semana', fn: 5, fd: 7 },
  { label: '3x / semana', fn: 3, fd: 7 },
  { label: 'Dia sim, dia não', fn: 1, fd: 2 },
]

export function HabitModal({ mode, habit, onClose, onSaved, toast }: HabitModalProps) {
  const [name, setName] = useState(habit?.name ?? '')
  const [icon, setIcon] = useState(habit?.icon ?? '')
  const [freqNum, setFreqNum] = useState(habit?.freq_num ?? 1)
  const [freqDen, setFreqDen] = useState(habit?.freq_den ?? 1)
  // Mensurável: ligado quando o hábito já tem meta (na edição) ou quando o usuário marca.
  const [measurable, setMeasurable] = useState(habit?.target_value != null)
  const [targetValue, setTargetValue] = useState<string>(habit?.target_value != null ? String(habit.target_value) : '')
  const [unit, setUnit] = useState(habit?.unit ?? '')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!name.trim()) { toast('O nome não pode ser vazio.', 'err'); return }
    // Valida a invariante da frequência (mesma do schema): 1 <= freq_num <= freq_den.
    if (!(freqNum >= 1 && freqDen >= 1 && freqNum <= freqDen)) {
      toast('Frequência inválida: "vezes" não pode passar de "a cada N dias".', 'err'); return
    }
    // Meta só vale quando mensurável e com número > 0.
    const tv = measurable && targetValue.trim() ? Number(targetValue) : null
    if (measurable && (tv == null || !(tv > 0))) {
      toast('Informe uma meta numérica maior que zero.', 'err'); return
    }

    setSaving(true)
    try {
      if (mode === 'create') {
        await kaguyaApi.createHabit({
          name: name.trim(), freq_num: freqNum, freq_den: freqDen,
          target_value: tv, unit: measurable ? (unit.trim() || null) : null,
          icon: icon || null,
        })
        toast('Hábito criado.')
      } else if (habit) {
        // clear_target zera a meta quando o usuário desligou o "mensurável" na edição.
        await kaguyaApi.updateHabit(habit.id, {
          name: name.trim(), freq_num: freqNum, freq_den: freqDen,
          icon: icon || null,
          ...(measurable
            ? { target_value: tv, unit: unit.trim() || null }
            : { clear_target: true }),
        })
        toast('Hábito atualizado.')
      }
      onSaved(); onClose()
    } catch { toast('Não foi possível salvar o hábito.', 'err') }
    finally { setSaving(false) }
  }

  // Arquiva (soft delete) o hábito.
  const del = async () => {
    if (!habit) return
    try {
      await kaguyaApi.deleteHabit(habit.id)
      toast('Hábito arquivado.'); onSaved(); onClose()
    } catch { toast('Não foi possível arquivar o hábito.', 'err') }
  }

  // Marca qual preset de frequência está ativo (para destacar o botão).
  const presetActive = (fn: number, fd: number) => freqNum === fn && freqDen === fd

  return (
    <div className="kg-scrim" onClick={onClose}>
      <div className="kg-modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <div className="kg-modal-head">
          <h3>{mode === 'create' ? 'Novo hábito' : 'Editar hábito'}</h3>
          <button className="kg-icon-btn" onClick={onClose} aria-label="Fechar"><Icon name="x" /></button>
        </div>

        <div className="kg-modal-body">
          <div className="kg-field">
            <span className="kg-field-label">Nome</span>
            <input className="kg-input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Meditar, Ler…" />
          </div>

          <div className="kg-field">
            <span className="kg-field-label">Ícone</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {ICONS.map((e) => (
                <button key={e} className={`kg-btn${icon === e ? ' kg-btn-primary' : ''}`} style={{ padding: '6px 10px' }} onClick={() => setIcon(e)}>{e}</button>
              ))}
            </div>
          </div>

          {/* Frequência alvo: presets + ajuste fino "N vezes a cada M dias" */}
          <div className="kg-field">
            <span className="kg-field-label">Frequência</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {FREQ_PRESETS.map((p) => (
                <button
                  key={p.label}
                  className={`kg-btn${presetActive(p.fn, p.fd) ? ' kg-btn-primary' : ''}`}
                  style={{ padding: '6px 10px' }}
                  onClick={() => { setFreqNum(p.fn); setFreqDen(p.fd) }}
                >{p.label}</button>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ink-2)' }}>
              <input className="kg-input" type="number" min={1} style={{ width: 64 }} value={freqNum} onChange={(e) => setFreqNum(Math.max(1, Number(e.target.value)))} />
              <span>vez(es) a cada</span>
              <input className="kg-input" type="number" min={1} style={{ width: 64 }} value={freqDen} onChange={(e) => setFreqDen(Math.max(1, Number(e.target.value)))} />
              <span>dia(s)</span>
            </div>
          </div>

          {/* Tipo: sim/não vs mensurável */}
          <div className="kg-field">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={measurable} onChange={(e) => setMeasurable(e.target.checked)} />
              <span className="kg-field-label" style={{ margin: 0 }}>Hábito mensurável (com meta numérica)</span>
            </label>
            {measurable && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, color: 'var(--ink-2)' }}>
                <span>Meta</span>
                <input className="kg-input" type="number" min={1} style={{ width: 90 }} value={targetValue} onChange={(e) => setTargetValue(e.target.value)} placeholder="20" />
                <input className="kg-input" style={{ width: 120 }} value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="páginas, min…" />
              </div>
            )}
          </div>

          {/* Arquivar (só na edição) */}
          {mode === 'edit' && habit && (
            <div className="kg-field" style={{ borderTop: '1px solid var(--line-2)', paddingTop: 12 }}>
              {!confirmingDelete ? (
                <button className="kg-btn kg-btn-danger" onClick={() => setConfirmingDelete(true)}>
                  <Icon name="trash" size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />Arquivar hábito
                </button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <span className="kg-field-label">Arquivar este hábito? O histórico é preservado.</span>
                  <button className="kg-btn kg-btn-danger" onClick={del}>Sim, arquivar</button>
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
