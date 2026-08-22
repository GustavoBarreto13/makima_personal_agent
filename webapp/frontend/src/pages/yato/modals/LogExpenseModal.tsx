/**
 * LogExpenseModal.tsx — Yato · Viagens (fatia 066)
 *
 * Categoria · valor · descrição · data. Aviso PERMANENTE (FR-021): lança na
 * Nami no ato — falha não salva nada dos dois lados.
 */

import { useEffect, useState } from 'react'
import { Modal } from './Modal'
import type { BudgetCategory } from '../types'
import { CAT_LABEL } from '../components/BudgetBar'
import { todayLocalISO } from '../dateUtils'

export interface LogExpenseForm {
  cat: BudgetCategory
  v: string
  desc: string
  date: string
}

const CATEGORIES: BudgetCategory[] = [
  'transporte_ida', 'transporte_volta', 'hospedagem', 'alimentacao', 'mobilidade_local', 'passeios', 'outros',
]

interface LogExpenseModalProps {
  open: boolean
  onClose: () => void
  onSave: (f: LogExpenseForm) => void
}

export function LogExpenseModal({ open, onClose, onSave }: LogExpenseModalProps) {
  const [f, setF] = useState<LogExpenseForm>({ cat: 'alimentacao', v: '', desc: '', date: todayLocalISO() })
  useEffect(() => { if (open) setF({ cat: 'alimentacao', v: '', desc: '', date: todayLocalISO() }) }, [open])
  const set = <K extends keyof LogExpenseForm>(k: K, x: LogExpenseForm[K]) => setF(p => ({ ...p, [k]: x }))
  const ok = Number(f.v) > 0 && f.desc.trim().length > 0

  return (
    <Modal open={open} title="Registrar gasto" icon="cifrao" onClose={onClose}
      foot={<>
        <span className="m-note">Lança nas finanças no ato — uma despesa por gasto. Se falhar, nada é salvo dos dois lados.</span>
        <button className="btn btn-primary" style={{ marginLeft: 'auto' }} disabled={!ok} onClick={() => ok && onSave(f)}>Registrar</button>
      </>}>
      <div className="row2">
        <div className="field"><label>categoria</label>
          <select className="sel" value={f.cat} onChange={e => set('cat', e.target.value as BudgetCategory)}>
            {CATEGORIES.map(c => <option key={c} value={c}>{CAT_LABEL[c]}</option>)}
          </select></div>
        <div className="field"><label>valor (R$)</label>
          <input className="inp" type="number" min="0" step="0.01" value={f.v} onChange={e => set('v', e.target.value)} placeholder="0,00" /></div>
      </div>
      <div className="field"><label>descrição</label>
        <input className="inp" value={f.desc} onChange={e => set('desc', e.target.value)} placeholder="Mototáxi até a trilha" /></div>
      <div className="field"><label>data</label>
        <input className="inp" type="date" value={f.date} onChange={e => set('date', e.target.value)} /></div>
    </Modal>
  )
}
