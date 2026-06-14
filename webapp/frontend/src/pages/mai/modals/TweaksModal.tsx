// TweaksModal — painel de configurações visuais do shell Mai.
// Controla: tema (dark/light), acento (cor), densidade de grid.

import type { Tweaks, ThemeMode, Accent, Density } from '../types'
import { IconX } from '../components/MaiIcons'

interface Props {
  tweaks: Tweaks
  onChange: (tweaks: Tweaks) => void
  onClose: () => void
}

// Opções de acento com labels e cor de preview
const ACCENTS: { value: Accent; label: string; preview: string }[] = [
  { value: 'periwinkle', label: 'Periwinkle',   preview: 'oklch(0.66 0.17 270)' },
  { value: 'rosa',       label: 'Rosa',          preview: 'oklch(0.70 0.18 340)' },
  { value: 'ouro',       label: 'Dourado',       preview: 'oklch(0.78 0.16  80)' },
  { value: 'noir',       label: 'Noir',          preview: 'oklch(0.55 0     0)'   },
]

const THEMES: { value: ThemeMode; label: string; icon: string }[] = [
  { value: 'dark',  label: 'Escuro',  icon: '🌙' },
  { value: 'light', label: 'Claro',   icon: '☀️' },
]

const DENSITIES: { value: Density; label: string; icon: string; desc: string }[] = [
  { value: 'large',   label: 'Grande',   icon: '⬜', desc: 'Pôsteres 180px' },
  { value: 'medium',  label: 'Médio',    icon: '▫️', desc: 'Pôsteres 136px' },
  { value: 'compact', label: 'Compacto', icon: '▪️', desc: 'Pôsteres 96px'  },
]

/** TweaksModal — personalização visual do shell Mai. */
export function TweaksModal({ tweaks, onChange, onClose }: Props) {
  function set<K extends keyof Tweaks>(key: K, value: Tweaks[K]) {
    onChange({ ...tweaks, [key]: value })
  }

  return (
    <div className="modal-scrim" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal tweaks-modal">
        <div className="modal-head">
          <div className="modal-title">⚙️ Aparência</div>
          <button className="modal-x" onClick={onClose}><IconX /></button>
        </div>

        <div className="modal-body">
          {/* ── Tema ─────────────────────────────────────────────────── */}
          <div className="modal-field">
            <label className="modal-label">Tema</label>
            <div className="tw-row">
              {THEMES.map(t => (
                <button
                  key={t.value}
                  className={`tw-btn${tweaks.theme === t.value ? ' active' : ''}`}
                  onClick={() => set('theme', t.value)}
                >
                  <span className="tw-ico">{t.icon}</span>
                  <span>{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* ── Acento ────────────────────────────────────────────────── */}
          <div className="modal-field">
            <label className="modal-label">Cor de destaque</label>
            <div className="tw-row">
              {ACCENTS.map(a => (
                <button
                  key={a.value}
                  className={`tw-accent-btn${tweaks.accent === a.value ? ' active' : ''}`}
                  onClick={() => set('accent', a.value)}
                  title={a.label}
                >
                  <span
                    className="tw-swatch"
                    style={{ background: a.preview }}
                  />
                  <span className="tw-accent-label">{a.label}</span>
                  {tweaks.accent === a.value && <span className="tw-check">✓</span>}
                </button>
              ))}
            </div>
          </div>

          {/* ── Densidade ─────────────────────────────────────────────── */}
          <div className="modal-field">
            <label className="modal-label">Tamanho dos pôsteres</label>
            <div className="tw-row">
              {DENSITIES.map(d => (
                <button
                  key={d.value}
                  className={`tw-btn${tweaks.density === d.value ? ' active' : ''}`}
                  onClick={() => set('density', d.value)}
                  title={d.desc}
                >
                  <span className="tw-ico">{d.icon}</span>
                  <span>{d.label}</span>
                  <span style={{ fontSize: 10, opacity: 0.55, display: 'block' }}>{d.desc}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn btn-primary" onClick={onClose} style={{ marginLeft: 'auto' }}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
