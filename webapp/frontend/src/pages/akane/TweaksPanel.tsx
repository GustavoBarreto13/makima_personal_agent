// Painel flutuante de tweaks da Akane — canto inferior direito.
// Substitui os controles improvisados que ficavam na sidebar, seguindo o
// padrão dos outros shells (Frieren) e as opções do design handoff §9:
// Tema · Cor de acento · Densidade · Estilo do pôster · Ordenação.

import { useState } from 'react'
import type { Tweaks } from './types'
import { Icon } from './ui/Icon'

interface TweaksPanelProps {
  /** Estado atual das preferências (persistido no localStorage pelo shell). */
  tweaks: Tweaks
  /** Atualiza uma preferência pelo nome da chave. */
  setTweak: <K extends keyof Tweaks>(key: K, value: Tweaks[K]) => void
}

// Opções de cada tweak: valor interno (salvo no localStorage) + rótulo humano.
// Os valores internos são os já usados hoje (não quebra preferências salvas).
const THEME_OPTS: { value: Tweaks['theme']; label: string }[] = [
  { value: 'dark',  label: 'Escuro' },
  { value: 'light', label: 'Claro'  },
]
const ACCENT_OPTS: { value: Tweaks['accent']; label: string }[] = [
  { value: '',       label: 'Rosa de palco' },
  { value: 'carmim', label: 'Carmim' },
  { value: 'ambar',  label: 'Âmbar' },
  { value: 'teal',   label: 'Verde-água' },
]
const DENSITY_OPTS: { value: Tweaks['density']; label: string }[] = [
  { value: 'large',   label: 'Grande' },
  { value: 'medium',  label: 'Médio' },
  { value: 'compact', label: 'Compacto' },
]
const POSTYLE_OPTS: { value: Tweaks['postyle']; label: string }[] = [
  { value: 'tipografico', label: 'Tipográfico' },
  { value: 'minimal',     label: 'Minimal' },
]
const SORT_OPTS: { value: Tweaks['sort']; label: string }[] = [
  { value: 'recent',   label: 'Recentes' },
  { value: 'rating',   label: 'Nota' },
  { value: 'title',    label: 'Título' },
  { value: 'director', label: 'Diretor' },
  { value: 'year',     label: 'Ano' },
  { value: 'runtime',  label: 'Duração' },
]

// Fileira de opções exclusivas (pills clicáveis)
function TweakRadio<T extends string>({ label, value, options, onChange }: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="tp-row">
      <span className="tp-label">{label}</span>
      <div className="tp-opts">
        {options.map(opt => (
          <button key={opt.value}
                  className={'tp-opt' + (opt.value === value ? ' sel' : '')}
                  onClick={() => onChange(opt.value)}>
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Painel flutuante de preferências visuais da Akane. */
export function TweaksPanel({ tweaks, setTweak }: TweaksPanelProps) {
  // Painel expandido ou só o botão de engrenagem
  const [open, setOpen] = useState(false)

  return (
    <div className="tweaks-panel" data-open={open ? 'true' : 'false'}>
      <button className="tp-toggle" onClick={() => setOpen(o => !o)}
              aria-label={open ? 'Fechar tweaks' : 'Abrir tweaks'} title="Ajustes visuais">
        <Icon name="gear" />
      </button>

      {open && (
        <div className="tp-body">
          <div className="tp-head">
            <span className="tp-title">Tweaks</span>
            <button className="tp-close" onClick={() => setOpen(false)} aria-label="Fechar">
              <Icon name="x" />
            </button>
          </div>

          <div className="tp-section">Aparência</div>
          <TweakRadio label="Tema" value={tweaks.theme} options={THEME_OPTS}
                      onChange={v => setTweak('theme', v)} />
          <TweakRadio label="Cor de acento" value={tweaks.accent} options={ACCENT_OPTS}
                      onChange={v => setTweak('accent', v)} />

          <div className="tp-section">Grade de filmes</div>
          <TweakRadio label="Densidade" value={tweaks.density} options={DENSITY_OPTS}
                      onChange={v => setTweak('density', v)} />
          <TweakRadio label="Estilo do pôster" value={tweaks.postyle} options={POSTYLE_OPTS}
                      onChange={v => setTweak('postyle', v)} />
          <div className="tp-row">
            <span className="tp-label">Ordenação</span>
            <select className="tp-select" value={tweaks.sort}
                    onChange={e => setTweak('sort', e.target.value as Tweaks['sort'])}>
              {SORT_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>
      )}
    </div>
  )
}
