// Painel de preferências da Marin (Tweaks).
// Persiste em localStorage 'mr-tweaks'. Alterações aplicam imediatamente via data-* attrs.
// Controla: Tema, Acento, Densidade, Ordenação.

import type { Tweaks } from '../types'

interface MarinTweaksProps {
  tweaks: Tweaks
  onChange: (tweaks: Tweaks) => void
  onClose: () => void
}

// Opções disponíveis para cada dimensão de tweaks
const TEMAS = ['Escuro', 'Claro'] as const
const ACENTOS = ['Neon', 'Rosa-Magenta', 'Sakura', 'Gold'] as const
const DENSIDADES = ['Grande', 'Médio', 'Compacto'] as const
const ORDENACOES = ['Atualizado', 'Adicionado', 'Nota', 'Título', 'Progresso'] as const

// Preview visual de cada acento (cor OKLCH aproximada)
const ACCENT_COLORS: Record<string, string> = {
  'Neon':         'oklch(0.77 0.20 200)',   // cyan
  'Rosa-Magenta': 'oklch(0.65 0.25 345)',   // magenta
  'Sakura':       'oklch(0.78 0.15 360)',   // rosa pastel
  'Gold':         'oklch(0.82 0.18 85)',    // dourado
}

interface TweakRadioProps<T extends string> {
  label: string
  options: readonly T[]
  value: T
  renderOption?: (opt: T) => React.ReactNode
  onChange: (v: T) => void
}

/**
 * TweakRadio — grupo de botões radio estilo chip para seleção de tweak.
 */
function TweakRadio<T extends string>({
  label,
  options,
  value,
  renderOption,
  onChange,
}: TweakRadioProps<T>) {
  return (
    <div className="mr-tweak-row">
      <label className="mr-tweak-label">{label}</label>
      <div className="mr-tweak-options" role="radiogroup" aria-label={label}>
        {options.map(opt => (
          <button
            key={opt}
            role="radio"
            aria-checked={value === opt}
            className={`mr-tweak-btn${value === opt ? ' mr-tweak-btn--active' : ''}`}
            onClick={() => onChange(opt)}
          >
            {renderOption ? renderOption(opt) : opt}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * MarinTweaks — painel de configurações visuais da Marin.
 * Alterações propagam imediatamente para o Shell via onChange.
 */
export function MarinTweaks({ tweaks, onChange, onClose }: MarinTweaksProps) {
  function update<K extends keyof Tweaks>(key: K, value: Tweaks[K]) {
    const next = { ...tweaks, [key]: value }
    onChange(next)
    // Persiste no localStorage
    try {
      localStorage.setItem('mr-tweaks', JSON.stringify(next))
    } catch {}
  }

  return (
    <div
      className="mr-modal-scrim"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal
      aria-label="Configurações da Marin"
    >
      <div className="mr-modal mr-tweaks-modal">
        {/* Cabeçalho */}
        <div className="mr-modal-header">
          <h2 className="mr-modal-title">Configurações</h2>
          <button className="mr-modal-close" onClick={onClose} aria-label="Fechar">✕</button>
        </div>

        <div className="mr-modal-body">
          {/* Tema: Escuro / Claro */}
          <TweakRadio
            label="Tema"
            options={TEMAS}
            value={tweaks.tema as typeof TEMAS[number]}
            onChange={v => update('tema', v)}
          />

          {/* Acento: bolinha colorida + nome */}
          <TweakRadio
            label="Cor de destaque"
            options={ACENTOS}
            value={tweaks.acento as typeof ACENTOS[number]}
            onChange={v => update('acento', v)}
            renderOption={opt => (
              <span className="mr-tweak-acento">
                <span
                  className="mr-tweak-acento-dot"
                  style={{ background: ACCENT_COLORS[opt] ?? 'var(--marin)' }}
                />
                {opt}
              </span>
            )}
          />

          {/* Densidade */}
          <TweakRadio
            label="Densidade"
            options={DENSIDADES}
            value={tweaks.densidade as typeof DENSIDADES[number]}
            onChange={v => update('densidade', v)}
          />

          {/* Ordenação padrão do catálogo */}
          <TweakRadio
            label="Ordenação padrão"
            options={ORDENACOES}
            value={tweaks.ordenacao as typeof ORDENACOES[number]}
            onChange={v => update('ordenacao', v)}
          />
        </div>

        <div className="mr-modal-footer">
          <button className="mr-btn mr-btn--primary" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
