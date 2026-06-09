// TweaksPanel — painel lateral de personalização com 4 grupos de controles.
// Persiste as preferências em localStorage via prop onTweaks.

import type { VioletPrefs } from './types'

interface TweaksPanelProps {
  tweaks: VioletPrefs
  onTweaks: (t: VioletPrefs) => void
  onClose: () => void
}

// Paletas de acento com swatch visual (cor de prévia)
const ACCENT_OPTIONS: Array<{ value: VioletPrefs['accent']; label: string; color: string }> = [
  { value: 'sapphire', label: 'Safira',   color: 'oklch(0.55 0.135 250)' },
  { value: 'gold',     label: 'Ouro',     color: 'oklch(0.625 0.105 78)'  },
  { value: 'emerald',  label: 'Esmeralda',color: 'oklch(0.585 0.105 165)' },
  { value: 'garnet',   label: 'Granada',  color: 'oklch(0.535 0.165 18)'  },
]

// Atalho para atualizar um único campo das preferências sem perder os outros
function update<K extends keyof VioletPrefs>(
  current: VioletPrefs,
  key: K,
  value: VioletPrefs[K],
  onTweaks: (t: VioletPrefs) => void,
) {
  onTweaks({ ...current, [key]: value })
}

export function TweaksPanel({ tweaks, onTweaks, onClose }: TweaksPanelProps) {
  return (
    <>
      {/* Fundo semi-transparente que fecha o painel ao clicar */}
      <div className="tweaks-backdrop" onClick={onClose} />

      <div className="tweaks-panel">
        {/* Cabeçalho */}
        <div className="tweaks-head">
          <span className="tweaks-title">Personalizar</span>
          <button className="tweaks-close" onClick={onClose} aria-label="Fechar">×</button>
        </div>

        {/* ── Grupo 1: Tema ── */}
        <div className="tweaks-group">
          <div className="tweaks-group-label">Tema</div>
          <div className="tweaks-row">
            {(['light', 'dark'] as const).map(t => (
              <button
                key={t}
                className={`tw-option ${tweaks.theme === t ? 'active' : ''}`}
                onClick={() => update(tweaks, 'theme', t, onTweaks)}
              >
                {t === 'light' ? 'Claro' : 'Escuro'}
              </button>
            ))}
          </div>
        </div>

        {/* ── Grupo 2: Acento ── */}
        <div className="tweaks-group">
          <div className="tweaks-group-label">Acento</div>
          <div className="tweaks-row">
            {ACCENT_OPTIONS.map(opt => (
              <button
                key={opt.value}
                className={`tw-swatch ${tweaks.accent === opt.value ? 'active' : ''}`}
                style={{ '--swatch-color': opt.color } as React.CSSProperties}
                onClick={() => update(tweaks, 'accent', opt.value, onTweaks)}
                title={opt.label}
              >
                <span className="swatch-dot" />
                <span className="swatch-label">{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Grupo 3: Modo ── */}
        <div className="tweaks-group">
          <div className="tweaks-group-label">Modo</div>
          <div className="tweaks-row">
            {([
              { value: 'normal', label: 'Normal' },
              { value: 'wide',   label: 'Amplo' },
              { value: 'focus',  label: 'Foco' },
            ] as const).map(m => (
              <button
                key={m.value}
                className={`tw-option ${tweaks.mode === m.value ? 'active' : ''}`}
                onClick={() => update(tweaks, 'mode', m.value, onTweaks)}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Grupo 4: Tipografia ── */}
        <div className="tweaks-group">
          <div className="tweaks-group-label">Tipografia</div>
          <div className="tweaks-row">
            {([
              { value: 'classic',   label: 'Clássica' },
              { value: 'technical', label: 'Técnica' },
            ] as const).map(ty => (
              <button
                key={ty.value}
                className={`tw-option ${tweaks.typography === ty.value ? 'active' : ''}`}
                onClick={() => update(tweaks, 'typography', ty.value, onTweaks)}
              >
                {ty.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
