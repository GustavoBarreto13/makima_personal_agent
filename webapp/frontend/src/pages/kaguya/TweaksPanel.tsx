// Painel de Tweaks — preferências visuais do shell (guia §10):
// Tema · Acento · Densidade · Marca de prioridade · Animações.
// O estado vive no KaguyaShell e é persistido em localStorage.

import type { Tweaks } from './types'
import { Icon } from './ui/Icons'

interface TweaksPanelProps {
  tweaks: Tweaks
  onChange: (patch: Partial<Tweaks>) => void
  onClose: () => void
}

// Segmented control genérico (uma linha de opções mutuamente exclusivas).
function Seg<T extends string>({ value, options, onPick }: { value: T; options: { v: T; label: string }[]; onPick: (v: T) => void }) {
  return (
    <div className="kg-segment">
      {options.map((o) => (
        <button key={o.v} className={`kg-seg-opt${value === o.v ? ' active' : ''}`} onClick={() => onPick(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function TweaksPanel({ tweaks, onChange, onClose }: TweaksPanelProps) {
  return (
    <>
      {/* clicar fora fecha o painel */}
      <div className="kg-scrim" style={{ background: 'transparent', backdropFilter: 'none' }} onClick={onClose} />
      <aside className="kg-tweaks" role="dialog" aria-label="Ajustes">
        <div className="kg-modal-head">
          <h3>Ajustes</h3>
          <button className="kg-icon-btn" onClick={onClose} aria-label="Fechar"><Icon name="x" /></button>
        </div>

        <div className="kg-tweak-row">
          <span className="kg-field-label">Tema</span>
          <Seg value={tweaks.theme} onPick={(v) => onChange({ theme: v })}
            options={[{ v: 'light', label: 'Claro' }, { v: 'dark', label: 'Escuro' }]} />
        </div>

        <div className="kg-tweak-row">
          <span className="kg-field-label">Acento</span>
          <Seg value={tweaks.accent} onPick={(v) => onChange({ accent: v })}
            options={[
              { v: 'blue', label: 'Azul' }, { v: 'pink', label: 'Rosa' },
              { v: 'violet', label: 'Violeta' }, { v: 'gold', label: 'Dourado' },
            ]} />
        </div>

        <div className="kg-tweak-row">
          <span className="kg-field-label">Densidade</span>
          <Seg value={tweaks.density} onPick={(v) => onChange({ density: v })}
            options={[{ v: 'confortavel', label: 'Confortável' }, { v: 'compacta', label: 'Compacta' }]} />
        </div>

        <div className="kg-tweak-row">
          <span className="kg-field-label">Marca de prioridade</span>
          <Seg value={tweaks.pmark} onPick={(v) => onChange({ pmark: v })}
            options={[{ v: 'bar', label: 'Traço' }, { v: 'dot', label: 'Ponto' }, { v: 'fill', label: 'Fundo' }]} />
        </div>

        <div className="kg-tweak-row">
          <span className="kg-field-label">Animações</span>
          <Seg value={tweaks.anim} onPick={(v) => onChange({ anim: v })}
            options={[{ v: 'on', label: 'Ligadas' }, { v: 'off', label: 'Desligadas' }]} />
        </div>
      </aside>
    </>
  )
}
