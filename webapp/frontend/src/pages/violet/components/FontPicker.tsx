// Escolha da fonte de escrita — cada opção aparece já na própria fonte, para escolher vendo.
// Usada no dia (barra de escrita e cabeçalho), nas cartas e nas preferências.

import { useState } from 'react'
import { Button, Menu } from '../../../design'
import { FONTS, fontClass, fontLabel } from '../lib/kinds'
import type { Font } from '../types'

/** Botão "Aa · Cursiva" que abre o menu das três fontes. */
export function FontMenuButton({ value, onChange, compact }: { value: Font; onChange: (f: Font) => void; compact?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="vl-fontmenu">
      <Button size="sm" variant="ghost" icon="font" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        title="Fonte da escrita">
        {compact ? null : fontLabel(value)}
      </Button>
      {open && (
        <Menu
          label="Fonte da escrita"
          onClose={() => setOpen(false)}
          items={FONTS.map((f) => ({ id: f.value, label: `${f.label} — ${f.hint}`, checked: f.value === value, onSelect: () => onChange(f.value) }))}
        />
      )}
    </span>
  )
}

/** As três fontes lado a lado, cada uma escrita nela mesma (cartas e preferências). */
export function FontChoice({ value, onChange, label = 'Fonte' }: { value: Font; onChange: (f: Font) => void; label?: string }) {
  return (
    <div className="vl-fontchoice" role="radiogroup" aria-label={label}>
      {FONTS.map((f) => (
        <button
          key={f.value}
          type="button"
          role="radio"
          aria-checked={f.value === value}
          className={`vl-fontopt ${fontClass(f.value)}${f.value === value ? ' vl-on' : ''}`}
          onClick={() => onChange(f.value)}
        >
          <span className="vl-fontopt-sample">Aa</span>
          <span className="vl-fontopt-name">{f.label}</span>
        </button>
      ))}
    </div>
  )
}
