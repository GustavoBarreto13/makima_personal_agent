/**
 * NewTripModal.tsx — Yato · Viagens (fatia 066)
 *
 * Cidade + UF (obrigatória — evita cidades homônimas), datas, perfil, título.
 * Se cidade+UF já têm dossiê COM checagem real (last_checked_at != null),
 * mostra aviso positivo — sem criar dossiê vazio por digitação (debounce +
 * só dispara com os dois campos preenchidos).
 */

import { useEffect, useState } from 'react'
import { Modal } from './Modal'
import type { TripProfile } from '../types'
import { daysBetween, fmtBRfull, isoDateOnly } from '../dateUtils'
import { yatoApi } from '../yatoApi'

const UFS = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT',
  'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO']

export interface NewTripForm {
  city: string
  uf: string
  start: string
  end: string
  profile: TripProfile
  title: string
}

interface NewTripModalProps {
  open: boolean
  onClose: () => void
  onSave: (f: NewTripForm) => void
}

const EMPTY: NewTripForm = { city: '', uf: '', start: '', end: '', profile: 'economia', title: '' }

export function NewTripModal({ open, onClose, onSave }: NewTripModalProps) {
  const [f, setF] = useState<NewTripForm>(EMPTY)
  const [known, setKnown] = useState<{ city: string; uf: string; last: string } | null>(null)

  useEffect(() => { if (open) { setF(EMPTY); setKnown(null) } }, [open])

  const set = <K extends keyof NewTripForm>(k: K, v: NewTripForm[K]) => setF(p => ({ ...p, [k]: v }))

  // Verifica (com debounce) se já existe dossiê com checagem real para a cidade+UF digitada.
  useEffect(() => {
    if (!open || !f.city.trim() || !f.uf) { setKnown(null); return }
    const city = f.city.trim()
    const uf = f.uf
    const id = setTimeout(() => {
      yatoApi.getDossier(uf, city)
        .then(res => {
          if (res.dossier.last_checked_at) setKnown({ city: res.dossier.city, uf: res.dossier.state_uf, last: res.dossier.last_checked_at as string })
          else setKnown(null)
        })
        .catch(() => setKnown(null))
    }, 500)
    return () => clearTimeout(id)
  }, [open, f.city, f.uf])

  const errs: string[] = []
  if (f.start && f.end && f.end < f.start) errs.push('A volta não pode ser antes da ida.')
  if (f.start && f.end && daysBetween(f.start, f.end) > 60) errs.push('Intervalo maior que 60 dias — quebre em duas viagens.')
  const ok = !!(f.city.trim() && f.uf && f.start && f.end && errs.length === 0)

  return (
    <Modal open={open} title="Nova viagem" icon="mochila" onClose={onClose}
      foot={<>
        <span className="m-note">UF é obrigatória — tem muita cidade com o mesmo nome nesse país.</span>
        <button className="btn btn-primary" style={{ marginLeft: 'auto' }} disabled={!ok}
                onClick={() => ok && onSave(f)}>Criar viagem</button>
      </>}>
      <div className="row2">
        <div className="field"><label>cidade</label>
          <input className="inp" value={f.city} onChange={e => set('city', e.target.value)} placeholder="Tiradentes" /></div>
        <div className="field"><label>uf</label>
          <select className="sel" value={f.uf} onChange={e => set('uf', e.target.value)}>
            <option value="">—</option>
            {UFS.map(u => <option key={u} value={u}>{u}</option>)}
          </select></div>
      </div>
      <div className="row2">
        <div className="field"><label>ida</label><input className="inp" type="date" value={f.start} onChange={e => set('start', e.target.value)} /></div>
        <div className="field"><label>volta</label><input className="inp" type="date" value={f.end} onChange={e => set('end', e.target.value)} /></div>
      </div>
      <div className="field"><label>perfil</label>
        <div className="seg">
          {(['economia', 'equilibrado', 'conforto'] as TripProfile[]).map(p => (
            <button key={p} className={f.profile === p ? 'on' : ''} onClick={() => set('profile', p)}>{p}</button>
          ))}
        </div>
      </div>
      <div className="field"><label>título (opcional)</label>
        <input className="inp" value={f.title} onChange={e => set('title', e.target.value)} placeholder="Barroco a pé" /></div>
      {errs.map(e => <div className="err" key={e}>{e}</div>)}
      {known && (
        <div className="banner positivo">
          <span className="b-sym">●</span>
          <span>Já temos dossiê de {known.city}/{known.uf}, checado em {fmtBRfull(isoDateOnly(known.last))}. Sai na frente.</span>
        </div>
      )}
    </Modal>
  )
}
