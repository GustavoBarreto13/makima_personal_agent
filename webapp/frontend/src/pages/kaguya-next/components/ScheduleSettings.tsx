// Preferências → Agenda: expediente, almoço, acordar/dormir e as exceções por dia ("vou trabalhar neste sábado",
// "folga na terça"). Isso define os DOIS tempos livres do Meu Dia e quando o digest fala de trabalho. Cada mudança
// grava na hora (sem botão Salvar).

import { useState } from 'react'
import { Button, Chip, DatePicker, Field, IconButton, Input, Toggle, TimePicker, toast } from '../../../design'
import { fmtDate } from '../../../design/core/format'
import { kaguyaApi } from '../api'
import { useKaguya } from '../context'
import { useLoad } from '../lib/useLoad'
import type { SchedulePrefs } from '../types'

const DAYS: { iso: number; label: string }[] = [
  { iso: 1, label: 'Seg' }, { iso: 2, label: 'Ter' }, { iso: 3, label: 'Qua' }, { iso: 4, label: 'Qui' }, { iso: 5, label: 'Sex' }, { iso: 6, label: 'Sáb' }, { iso: 7, label: 'Dom' },
]

const reason = (e: unknown) => (e instanceof Error && e.message && !/^HTTP \d+$/.test(e.message) ? e.message : 'Não foi possível salvar.')

export function ScheduleSettings() {
  const k = useKaguya()
  const prefs = useLoad(() => kaguyaApi.schedule.get(), [k.rev])
  const overrides = useLoad(() => kaguyaApi.schedule.overrides(), [k.rev])
  const [day, setDay] = useState('')
  const [works, setWorks] = useState(true)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [note, setNote] = useState('')

  if (prefs.state.status !== 'ok') return <p className="ds-hint">{prefs.state.status === 'loading' ? 'Carregando a agenda…' : 'Não foi possível ler a agenda.'}</p>
  const p = prefs.state.data

  const patch = async (body: Partial<SchedulePrefs> & { clear_lunch?: boolean }) => {
    try { await kaguyaApi.schedule.update(body); k.reload() } catch (e) { toast(reason(e), { tone: 'error' }) }
  }
  const toggleDay = (iso: number) => {
    const next = p.work_days.includes(iso) ? p.work_days.filter((d) => d !== iso) : [...p.work_days, iso].sort()
    void patch({ work_days: next })
  }
  const addOverride = async () => {
    if (!day) { toast('Escolha o dia da exceção.', { tone: 'error' }); return }
    try {
      await kaguyaApi.schedule.setOverride(day, { works, work_start: works && from ? from : null, work_end: works && to ? to : null, note: note.trim() || null })
      setDay(''); setFrom(''); setTo(''); setNote('')
      k.reload()
      toast('Exceção salva.', { tone: 'success' })
    } catch (e) { toast(reason(e), { tone: 'error' }) }
  }

  return (
    <div className="kn-sched">
      <Field label="Dias de trabalho" hint="O digest e o tempo livre do trabalho só contam nesses dias.">{() => (
        <div className="kn-chips" role="group" aria-label="Dias de trabalho">
          {DAYS.map((d) => <Chip key={d.iso} on={p.work_days.includes(d.iso)} aria-pressed={p.work_days.includes(d.iso)} onClick={() => toggleDay(d.iso)}>{d.label}</Chip>)}
        </div>
      )}</Field>

      <div className="kn-props">
        <Field label="Começa">{(c) => <TimePicker id={c.id} value={p.work_start} onChange={(v) => void patch({ work_start: v })} />}</Field>
        <Field label="Termina">{(c) => <TimePicker id={c.id} value={p.work_end} onChange={(v) => void patch({ work_end: v })} />}</Field>
        <Field label="Acordo às">{(c) => <TimePicker id={c.id} value={p.wake_time} onChange={(v) => void patch({ wake_time: v })} />}</Field>
        <Field label="Durmo às" hint="Menor que a hora de acordar = depois da meia-noite.">{(c) => <TimePicker id={c.id} value={p.sleep_time} onChange={(v) => void patch({ sleep_time: v })} />}</Field>
      </div>

      <Field label="Almoço" hint="Dentro do expediente.">{() => (
        p.lunch_start && p.lunch_end ? (
          <div className="kn-quick-i">
            <TimePicker value={p.lunch_start} onChange={(v) => void patch({ lunch_start: v })} />
            <span>até</span>
            <TimePicker value={p.lunch_end} onChange={(v) => void patch({ lunch_end: v })} />
            <IconButton icon="close" label="Sem almoço" onClick={() => void patch({ clear_lunch: true })} />
          </div>
        ) : <Button size="sm" icon="lunch" onClick={() => void patch({ lunch_start: '12:00', lunch_end: '13:00' })}>Definir almoço</Button>
      )}</Field>
      {p.lunch_start && (
        <Toggle checked={p.lunch_is_free} onChange={(v) => void patch({ lunch_is_free: v })} label="O almoço conta como tempo livre" />
      )}

      <h3 className="kn-h3">Exceções por dia</h3>
      <ul className="kn-sublist" aria-label="Exceções">
        {overrides.state.status === 'ok' && overrides.state.data.map((o) => (
          <li key={o.day}>
            <span className="kn-title">{fmtDate(o.day)} — {o.works ? `trabalha${o.work_start ? ` ${o.work_start}–${o.work_end}` : ''}` : 'folga'}{o.note ? ` · ${o.note}` : ''}</span>
            <IconButton icon="delete" label={`Remover exceção de ${fmtDate(o.day)}`} onClick={() => void kaguyaApi.schedule.clearOverride(o.day).then(k.reload)} />
          </li>
        ))}
        {overrides.state.status === 'ok' && overrides.state.data.length === 0 && <li className="ds-hint">Nenhuma exceção. Use para um sábado trabalhado ou uma folga no meio da semana.</li>}
      </ul>
      <div className="kn-props">
        <Field label="Dia">{(c) => <DatePicker {...c} value={day} onChange={setDay} />}</Field>
        <Field label="Nesse dia">{() => (
          <div className="kn-chips" role="group" aria-label="Nesse dia">
            <Chip on={works} aria-pressed={works} onClick={() => setWorks(true)}>Trabalho</Chip>
            <Chip on={!works} aria-pressed={!works} onClick={() => setWorks(false)}>Folga</Chip>
          </div>
        )}</Field>
        {works && <Field label="Horário (opcional)">{() => (
          <div className="kn-quick-i"><TimePicker value={from || p.work_start} onChange={setFrom} /><span>até</span><TimePicker value={to || p.work_end} onChange={setTo} /></div>
        )}</Field>}
        <Field label="Observação">{(c) => <Input {...c} value={note} placeholder="plantão, feriado…" onChange={(e) => setNote(e.target.value)} />}</Field>
      </div>
      <Button icon="add" onClick={() => void addOverride()}>Adicionar exceção</Button>
    </div>
  )
}
