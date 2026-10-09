// Criar e editar um hábito: nome, frequência (N vezes a cada M dias), tipo sim/não ou mensurável (meta + unidade), fonte
// automática de check-in e os alertas no Google Calendar (7 dias, cada um com horário opcional; dia marcado sem
// horário vira evento de dia inteiro, sem push). Os alertas são INDEPENDENTES da frequência: nunca mudam a consistência.
// Em edição oferece arquivar (o histórico fica) com confirmação.

import { useEffect, useState } from 'react'
import { Button, Chip, Field, Input, Modal, NumberInput, Select, Toggle, confirm, toast } from '../../../design'
import { kaguyaApi } from '../api'
import type { Habit, HabitSourceProvider } from '../types'

const FREQ_PRESETS = [
  { label: 'Todo dia', fn: 1, fd: 1 }, { label: '5x / semana', fn: 5, fd: 7 }, { label: '3x / semana', fn: 3, fd: 7 }, { label: 'Dia sim, dia não', fn: 1, fd: 2 },
]
// Códigos iCal (a convenção do backend), de segunda a domingo.
const WEEKDAYS: { code: string; label: string }[] = [
  { code: 'MO', label: 'Seg' }, { code: 'TU', label: 'Ter' }, { code: 'WE', label: 'Qua' }, { code: 'TH', label: 'Qui' },
  { code: 'FR', label: 'Sex' }, { code: 'SA', label: 'Sáb' }, { code: 'SU', label: 'Dom' },
]
const SLOTS = Array.from({ length: 96 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`)
const reason = (e: unknown, fallback: string) => (e instanceof Error && e.message && !/^HTTP \d+$/.test(e.message) ? e.message : fallback)

export function HabitModal({ habit, onClose, onSaved }: { habit?: Habit; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(habit?.name ?? '')
  const [freqNum, setFreqNum] = useState(habit?.freq_num ?? 1)
  const [freqDen, setFreqDen] = useState(habit?.freq_den ?? 1)
  const [measurable, setMeasurable] = useState(habit?.target_value != null)
  const [target, setTarget] = useState(habit?.target_value != null ? String(habit.target_value) : '')
  const [unit, setUnit] = useState(habit?.unit ?? '')
  const [providers, setProviders] = useState<HabitSourceProvider[]>([])
  const [providerId, setProviderId] = useState(habit?.source_provider_id ?? '')
  // weekday → "HH:MM" ("" = dia inteiro). A PRESENÇA da chave marca o dia como ativo.
  const [schedules, setSchedules] = useState<Record<string, string>>(() => Object.fromEntries((habit?.schedules ?? []).map((s) => [s.weekday, s.time ?? ''])))
  const [duration, setDuration] = useState(habit?.duration_min != null ? String(habit.duration_min) : '')
  const [lead, setLead] = useState(habit?.reminder_lead_min ?? 0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { kaguyaApi.listHabitSourceProviders().then(setProviders).catch(() => setProviders([])) }, [])

  const toggleDay = (code: string) => setSchedules((prev) => {
    const next = { ...prev }
    if (code in next) delete next[code]; else next[code] = ''
    return next
  })

  const save = async () => {
    if (!name.trim()) { setError('Dê um nome ao hábito.'); return }
    if (!(freqNum >= 1 && freqDen >= 1 && freqNum <= freqDen)) { setError('Frequência inválida: “vezes” não pode passar de “a cada N dias”.'); return }
    const tv = measurable && target.trim() ? Number(target) : null
    if (measurable && !(tv != null && tv > 0)) { setError('Informe uma meta numérica maior que zero.'); return }
    const dur = duration.trim() ? Number(duration) : null
    if (duration.trim() && !(dur != null && dur > 0)) { setError('A duração precisa ser maior que zero.'); return }
    const list = Object.entries(schedules).map(([weekday, time]) => ({ weekday, time: time || null }))
    setSaving(true)
    try {
      if (!habit) {
        await kaguyaApi.createHabit({
          name: name.trim(), freq_num: freqNum, freq_den: freqDen, target_value: tv, unit: measurable ? unit.trim() || null : null,
          source_provider_id: providerId || null, schedules: list, reminder_lead_min: lead, duration_min: dur,
        })
      } else {
        // `schedules` sempre viaja (semântica de conjunto): o modal é a fonte da verdade, inclusive para esvaziá-lo.
        await kaguyaApi.updateHabit(habit.id, {
          name: name.trim(), freq_num: freqNum, freq_den: freqDen,
          ...(measurable ? { target_value: tv, unit: unit.trim() || null } : { clear_target: true }),
          ...(providerId ? { source_provider_id: providerId } : { clear_source: true }),
          schedules: list, reminder_lead_min: lead,
          ...(dur != null ? { duration_min: dur } : { clear_duration: true }),
        })
      }
      toast(habit ? 'Hábito atualizado.' : 'Hábito criado.', { tone: 'success' })
      onSaved()
      onClose()
    } catch (e) { setError(reason(e, 'Não foi possível salvar o hábito.')) } finally { setSaving(false) }
  }

  const archive = async () => {
    if (!habit) return
    if (!(await confirm({ title: `Arquivar “${habit.name}”?`, body: 'O histórico é preservado e você pode restaurar o hábito depois.', confirmLabel: 'Arquivar', danger: true }))) return
    try { await kaguyaApi.deleteHabit(habit.id); toast('Hábito arquivado.', { tone: 'success' }); onSaved(); onClose() }
    catch (e) { toast(reason(e, 'Não foi possível arquivar o hábito.'), { tone: 'error' }) }
  }

  return (
    <Modal
      title={habit ? 'Editar hábito' : 'Novo hábito'}
      size="md"
      dirty
      onClose={onClose}
      footer={(
        <>
          {habit && <Button variant="danger" icon="archive" onClick={() => void archive()}>Arquivar</Button>}
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={saving} onClick={() => void save()}>{saving ? 'Salvando…' : 'Salvar'}</Button>
        </>
      )}
    >
      <Field label="Nome" error={error || undefined}>{(c) => <Input {...c} autoFocus value={name} placeholder="Ex.: Meditar, Ler…" onChange={(e) => { setName(e.target.value); setError('') }} />}</Field>

      <Field label="Frequência" hint="Quantas vezes, a cada quantos dias.">{() => (
        <>
          <div className="kn-chips" role="group" aria-label="Frequência">
            {FREQ_PRESETS.map((p) => (
              <Chip key={p.label} on={freqNum === p.fn && freqDen === p.fd} aria-pressed={freqNum === p.fn && freqDen === p.fd} onClick={() => { setFreqNum(p.fn); setFreqDen(p.fd) }}>{p.label}</Chip>
            ))}
          </div>
          <div className="kn-quick-i">
            <NumberInput aria-label="Vezes" min={1} value={freqNum} onChange={(e) => setFreqNum(Math.max(1, Number(e.target.value)))} />
            <span>vez(es) a cada</span>
            <NumberInput aria-label="A cada quantos dias" min={1} value={freqDen} onChange={(e) => setFreqDen(Math.max(1, Number(e.target.value)))} />
            <span>dia(s)</span>
          </div>
        </>
      )}</Field>

      <Toggle checked={measurable} onChange={setMeasurable} label="Hábito mensurável (com meta numérica)" />
      {measurable && (
        <div className="kn-props">
          <Field label="Meta">{(c) => <NumberInput {...c} min={1} value={target} placeholder="20" onChange={(e) => setTarget(e.target.value)} />}</Field>
          <Field label="Unidade">{(c) => <Input {...c} value={unit} placeholder="páginas, min…" onChange={(e) => setUnit(e.target.value)} />}</Field>
        </div>
      )}

      <Field label="Fonte automática">{(c) => (
        <Select {...c} value={providerId} onChange={(e) => setProviderId(e.target.value)}>
          <option value="">Nenhuma (check-in manual)</option>
          {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      )}</Field>

      <Field label="Alertas no Google Calendar" hint="Dia marcado sem horário vira um evento de dia inteiro: aparece na agenda, mas NÃO notifica no celular (limitação do Google Calendar).">{() => (
        <div className="kn-habit-days">
          {WEEKDAYS.map((d) => {
            const active = d.code in schedules
            return (
              <div key={d.code} className="kn-quick-i">
                <Chip on={active} aria-pressed={active} aria-label={`Alerta na ${d.label}`} onClick={() => toggleDay(d.code)}>{d.label}</Chip>
                {active && (
                  <Select aria-label={`Horário na ${d.label}`} className="ds-num" value={schedules[d.code]} onChange={(e) => setSchedules((prev) => ({ ...prev, [d.code]: e.target.value }))}>
                    <option value="">Dia inteiro</option>
                    {schedules[d.code] && !SLOTS.includes(schedules[d.code]) && <option value={schedules[d.code]}>{schedules[d.code]}</option>}
                    {SLOTS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </Select>
                )}
              </div>
            )
          })}
        </div>
      )}</Field>
      <div className="kn-props">
        <Field label="Duração do evento (min)">{(c) => <NumberInput {...c} min={1} value={duration} placeholder="30" onChange={(e) => setDuration(e.target.value)} />}</Field>
        <Field label="Avisar antes (min)">{(c) => <NumberInput {...c} min={0} value={lead} onChange={(e) => setLead(Math.max(0, Number(e.target.value)))} />}</Field>
      </div>
    </Modal>
  )
}
