// <QuickCapture> — captura rápida de uma linha (padrão do quick-add da Kaguya).
// Destaque ao vivo dos tokens, chips de prévia removíveis ("o que foi entendido"), Enter salva,
// Shift+Enter abre o formulário completo já preenchido. O motor é o core/capture.

import { useRef, type ReactNode } from 'react'
import type { CaptureKind, CaptureResult } from '../core/capture'
import { useCapture } from '../headless/useCapture'
import { Icon } from './Icon'
import type { IconName } from './icons'
import { Stars } from './rating'

const KIND_CLASS: Record<CaptureKind, string> = {
  place: 'ds-tk-place', person: 'ds-tk-person', tag: 'ds-tk-tag', priority: 'ds-tk-priority', date: 'ds-tk-date', recur: 'ds-tk-recur',
  rating: 'ds-tk-rate', amount: 'ds-tk-amount', progress: 'ds-tk-progress', quantity: 'ds-tk-load', duration: 'ds-tk-dur', installments: 'ds-tk-inst',
}

const KIND_ICON: Partial<Record<CaptureKind, IconName>> = {
  place: 'place', person: 'person', date: 'calendar', recur: 'habit', priority: 'flag', amount: 'money', progress: 'play', quantity: 'energy', duration: 'clock', installments: 'card',
}

export interface CaptureLegendItem {
  kind: CaptureKind
  /** Exemplo da sintaxe, ex.: "@local". */
  sample: string
}

export interface QuickCaptureProps {
  parser: (text: string) => CaptureResult
  placeholder: string
  /** Rótulo acessível do campo. */
  label: string
  /** Linhas de exemplo clicáveis. */
  examples?: string[]
  /** Sintaxe aceita neste domínio (aparece como legenda colorida). */
  legend?: CaptureLegendItem[]
  /** Salva. Devolva false para manter o texto (ex.: faltou o título). */
  onSubmit: (r: CaptureResult) => boolean | void
  /** Shift+Enter: abre o formulário completo com o que foi entendido. */
  onExpand?: (r: CaptureResult) => void
  /** Chips extras (ex.: "Tipo: Força, sugerido"), calculados pelo domínio. */
  extraChips?: (r: CaptureResult) => ReactNode
  today?: string
}

export function QuickCapture({ parser, placeholder, label, examples = [], legend = [], onSubmit, onExpand, extraChips, today }: QuickCaptureProps) {
  const cap = useCapture(parser, today)
  const mirror = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)

  const submit = (expand: boolean) => {
    if (!cap.text.trim()) return
    if (expand) { onExpand?.(cap.result); cap.reset(); return }
    if (onSubmit(cap.result) !== false) cap.reset()
  }

  return (
    <div className="ds-qc">
      <div className="ds-qc-box">
        <div className="ds-qc-mirror" ref={mirror} aria-hidden="true">
          {cap.result.segments.map((s, i) => (s.kind ? <span key={i} className={`ds-tk ${KIND_CLASS[s.kind]}`}>{s.text}</span> : <span key={i}>{s.text}</span>))}
        </div>
        <input
          ref={input}
          className="ds-qc-in"
          type="text"
          value={cap.text}
          placeholder={placeholder}
          aria-label={label}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => cap.setText(e.target.value)}
          onScroll={(e) => { if (mirror.current) mirror.current.scrollLeft = e.currentTarget.scrollLeft }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); submit(e.shiftKey) }
          }}
        />
      </div>
      <div className="ds-qc-chips" aria-live="polite">
        {extraChips?.(cap.result)}
        {cap.chips.map((c) => (
          <span key={c.id} className="ds-pchip">
            {KIND_ICON[c.kind] && <Icon name={KIND_ICON[c.kind] as IconName} size={12} />}
            {c.rating ? <Stars value={c.rating} /> : null}
            {c.label}
            {c.tokenIdx.length > 0 && (
              <button type="button" aria-label={`Remover ${c.label}`} onClick={() => { cap.removeChip(c); input.current?.focus() }}><Icon name="close" size={10} /></button>
            )}
          </span>
        ))}
        {!cap.chips.length && !extraChips && <span className="ds-hint">Digite para ver o que será entendido.</span>}
      </div>
      {examples.length > 0 && (
        <div className="ds-qc-help">
          <span className="ds-mono">Tente:</span>
          {examples.map((ex) => (
            <button key={ex} type="button" className="ds-chip" onClick={() => { cap.setText(ex); input.current?.focus() }}>
              {ex.length > 34 ? `${ex.slice(0, 32)}…` : ex}
            </button>
          ))}
        </div>
      )}
      {legend.length > 0 && (
        <div className="ds-qc-help">
          <span className="ds-mono">Sintaxe:</span>
          {legend.map((l) => <span key={l.kind + l.sample} className={`ds-tk ${KIND_CLASS[l.kind]}`}>{l.sample}</span>)}
        </div>
      )}
    </div>
  )
}
