/**
 * ProtocolWizard.tsx — Yato · Viagens (fatia 066)
 *
 * ⭐ Um passo do protocolo por vez — NUNCA os 7 de uma vez (FR-009). Os três
 * vereditos (Confirmado/Ausente/Inconclusivo) têm o MESMO peso visual — dúvida
 * é resultado legítimo, não desistência.
 */

import { useEffect, useState } from 'react'
import { Modal } from './Modal'
import type { CheckKey, CheckSource, DossierResponse } from '../types'
import { VerdictChip } from '../components/VerdictChip'
import { Icon } from '../components/Icon'
import { STEPS, SOURCES } from '../steps'
import { fmtBR, isoDateOnly } from '../dateUtils'

interface ProtocolWizardProps {
  open: boolean
  dossier: DossierResponse | null
  startKey: CheckKey | null
  onClose: () => void
  onSave: (key: CheckKey, verdict: 'confirmado' | 'ausente' | 'inconclusivo', evidence: string, source: CheckSource) => void
  onSkip: (key: CheckKey) => void
}

export function ProtocolWizard({ open, dossier, startKey, onClose, onSave, onSkip }: ProtocolWizardProps) {
  const idx0 = Math.max(0, STEPS.findIndex(s => s.key === startKey))
  const [i, setI] = useState(idx0)
  const [ev, setEv] = useState('')
  const [src, setSrc] = useState<CheckSource>('simulacao_in_app')

  useEffect(() => {
    if (open) {
      setI(Math.max(0, STEPS.findIndex(s => s.key === startKey)))
      setEv('')
      setSrc('simulacao_in_app')
    }
  }, [open, startKey])

  if (!open) return null

  const step = STEPS[i]
  const cur = dossier?.checks.find(c => c.check_key === step.key)
  const go = (n: number) => { setI(Math.min(STEPS.length - 1, Math.max(0, n))); setEv('') }

  const saveVerdict = (v: 'confirmado' | 'ausente' | 'inconclusivo') => {
    onSave(step.key, v, ev, src)
    if (i < STEPS.length - 1) go(i + 1); else onClose()
  }
  const skip = () => {
    onSkip(step.key)
    if (i < STEPS.length - 1) go(i + 1); else onClose()
  }

  return (
    <Modal open={open} wide title={'Protocolo de mobilidade' + (dossier ? ' · ' + dossier.dossier.city + '/' + dossier.dossier.state_uf : '')}
      icon="carimbo" onClose={onClose}
      foot={<>
        <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>passo {i + 1} de {STEPS.length}</span>
        <button className="btn btn-sm" onClick={skip}>Pular por ora</button>
        <div className="wiz-nav">
          <button onClick={() => go(i - 1)} disabled={i === 0}><Icon name="chevL" style={{ width: 14, height: 14 }} /></button>
          <button onClick={() => go(i + 1)} disabled={i === STEPS.length - 1}><Icon name="chevR" style={{ width: 14, height: 14 }} /></button>
        </div>
      </>}>
      <div>
        <div className="wiz-step">passo {step.n} de 7</div>
        <div className="dos-title" style={{ marginTop: 4 }}>{step.name}</div>
        {cur && cur.verdict !== 'pendente' && (
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 9 }}>
            <VerdictChip v={cur.verdict} />
            <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>
              já registrado {cur.checked_at ? 'em ' + fmtBR(isoDateOnly(cur.checked_at)) : ''}
            </span>
          </div>
        )}
      </div>
      <div className="wiz-instr"><span className="wi-k">o que fazer, literalmente</span>{step.instr}</div>
      <div className="field"><label>evidência</label>
        <textarea className="inp" rows={3} value={ev} onChange={e => setEv(e.target.value)}
                  placeholder="O que você viu, com número e endereço quando der." /></div>
      <div className="field"><label>fonte</label>
        <select className="sel" value={src} onChange={e => setSrc(e.target.value as CheckSource)}>
          {SOURCES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select></div>
      <div className="wiz-verdicts">
        <button className="wv v-ok" onClick={() => saveVerdict('confirmado')}><span className="wv-sym">●</span>confirmado</button>
        <button className="wv v-none" onClick={() => saveVerdict('ausente')}><span className="wv-sym">⊖</span>ausente</button>
        <button className="wv v-unknown" onClick={() => saveVerdict('inconclusivo')}><span className="wv-sym">◐</span>inconclusivo</button>
      </div>
      <span className="m-note">Registrar dúvida é resultado, não desistência. Inconclusivo vale tanto quanto os outros dois.</span>
    </Modal>
  )
}
