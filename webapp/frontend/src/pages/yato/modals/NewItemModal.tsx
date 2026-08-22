/**
 * NewItemModal.tsx — Yato · Viagens (fatia 066)
 *
 * Dia (dentro do intervalo da viagem) · horário OPCIONAL · período · título ·
 * endereço · modal de deslocamento · custo estimado. ⌘/Ctrl+Enter salva.
 */

import { useEffect, useState } from 'react'
import { Modal } from './Modal'
import type { Period, TransportMode, Trip } from '../types'
import { dayList, fmtBR, DOW, parseLocalDate } from '../dateUtils'
import { MODE_EMOJI, MODE_LABEL, MODE_ORDER } from '../components/ItineraryItem'

export interface NewItemForm {
  day: string
  period: Period
  time: string
  title: string
  addr: string
  mode: TransportMode
  cost: string
}

interface NewItemModalProps {
  open: boolean
  trip: Trip | null
  preset: { day: string; period: Period } | null
  onClose: () => void
  onSave: (f: NewItemForm) => void
}

const PERIODS: [Period, string][] = [['manha', 'manhã'], ['tarde', 'tarde'], ['noite', 'noite']]

export function NewItemModal({ open, trip, preset, onClose, onSave }: NewItemModalProps) {
  const days = trip ? dayList(trip.start_date, trip.end_date) : []
  const [f, setF] = useState<NewItemForm>({ day: '', period: 'manha', time: '', title: '', addr: '', mode: 'a_pe', cost: '' })

  useEffect(() => {
    if (open) {
      setF({ day: preset?.day || days[0] || '', period: preset?.period || 'manha', time: '', title: '', addr: '', mode: 'a_pe', cost: '' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, preset])

  const set = <K extends keyof NewItemForm>(k: K, v: NewItemForm[K]) => setF(p => ({ ...p, [k]: v }))
  const ok = !!(f.title.trim() && f.day)

  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && ok) onSave(f) }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, f, ok, onSave])

  return (
    <Modal open={open} title="Novo item de roteiro" icon="rota" onClose={onClose}
      foot={<>
        <span className="m-note">⌘/Ctrl+Enter salva. Sem horário confirmado, deixa em branco — não invento hora.</span>
        <button className="btn btn-primary" style={{ marginLeft: 'auto' }} disabled={!ok} onClick={() => ok && onSave(f)}>Salvar item</button>
      </>}>
      <div className="row2">
        <div className="field"><label>dia</label>
          <select className="sel" value={f.day} onChange={e => set('day', e.target.value)}>
            {days.map(d => <option key={d} value={d}>{fmtBR(d)} · {DOW[parseLocalDate(d).getDay()]}</option>)}
          </select></div>
        <div className="field"><label>horário (opcional)</label>
          <input className="inp" type="time" value={f.time} onChange={e => set('time', e.target.value)} /></div>
      </div>
      <div className="field"><label>período</label>
        <div className="seg">
          {PERIODS.map(([k, l]) => (
            <button key={k} className={f.period === k ? 'on' : ''} onClick={() => set('period', k)}>{l}</button>
          ))}
        </div>
      </div>
      <div className="field"><label>título</label>
        <input className="inp" value={f.title} onChange={e => set('title', e.target.value)} placeholder="Igreja São Francisco de Assis" /></div>
      <div className="field"><label>endereço</label>
        <input className="inp" value={f.addr} onChange={e => set('addr', e.target.value)} placeholder="R. Padre Toledo, 71" /></div>
      <div className="row2">
        <div className="field"><label>como chega</label>
          <div className="mode-pick">
            {MODE_ORDER.map(m => (
              <button key={m} className={f.mode === m ? 'on' : ''} title={MODE_LABEL[m]} onClick={() => set('mode', m)}>{MODE_EMOJI[m]}</button>
            ))}
          </div></div>
        <div className="field"><label>custo estimado</label>
          <input className="inp" type="number" min="0" value={f.cost} onChange={e => set('cost', e.target.value)} placeholder="0" /></div>
      </div>
    </Modal>
  )
}
