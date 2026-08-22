/**
 * TweaksPanel.tsx — Yato · Viagens (fatia 066)
 *
 * Painel de preferências client-only (tema, acento, densidade, textura,
 * ordenação) — persistido em localStorage['yato-tweaks'], aplicado como
 * data-* no .yato-shell (design-guide.md §8).
 */

import { Modal } from './modals/Modal'
import type { Tweaks } from './types'

interface TweaksPanelProps {
  open: boolean
  tweaks: Tweaks
  onChange: (t: Tweaks) => void
  onClose: () => void
}

function Seg<T extends string>({ options, value, onChange }: { options: readonly T[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map(o => (
        <button key={o} className={value === o ? 'on' : ''} onClick={() => onChange(o)}>{o}</button>
      ))}
    </div>
  )
}

export function TweaksPanel({ open, tweaks, onChange, onClose }: TweaksPanelProps) {
  const set = <K extends keyof Tweaks>(k: K, v: Tweaks[K]) => onChange({ ...tweaks, [k]: v })

  return (
    <Modal open={open} title="Preferências" icon="gear" onClose={onClose}>
      <div className="field"><label>tema</label>
        <Seg options={['Escuro', 'Claro'] as const} value={tweaks.tema} onChange={v => set('tema', v)} /></div>
      <div className="field"><label>acento</label>
        <Seg options={['Azul-cachecol', 'Ouro', 'Carmim', 'Musgo'] as const} value={tweaks.acento} onChange={v => set('acento', v)} /></div>
      <div className="field"><label>densidade</label>
        <Seg options={['Grande', 'Médio', 'Compacto'] as const} value={tweaks.densidade} onChange={v => set('densidade', v)} /></div>
      <div className="field"><label>textura de mapa</label>
        <Seg options={['Ligada', 'Desligada'] as const} value={tweaks.textura ? 'Ligada' : 'Desligada'}
             onChange={v => set('textura', v === 'Ligada')} /></div>
      <div className="field"><label>ordenação (Viagens)</label>
        <Seg options={['Data de ida', 'Criada', 'Prontidão', 'Orçamento'] as const}
             value={tweaks.ordenacao} onChange={v => set('ordenacao', v)} /></div>
    </Modal>
  )
}
