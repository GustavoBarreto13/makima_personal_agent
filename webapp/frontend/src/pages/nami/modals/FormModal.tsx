// Modal genérico orientado a schema — permite criar qualquer formulário passando
// um array de campos tipados. Portado do handoff de referência (addmodal.jsx → FormModal).
// Usa as classes .modal / .modal-head / .modal-body / .modal-foot / .field / .money-field etc.

import { useState, useEffect, useRef, type ReactNode } from 'react'
import { IconField } from './IconField'
import { Icon } from '../icons'

// ── Tipos de campo suportados ─────────────────────────────────────────────────

type FieldType = 'text' | 'url' | 'number' | 'date' | 'money' | 'select' | 'segment' | 'color' | 'image'

interface FieldDef {
  key: string             // chave do valor no objeto de retorno
  label: string           // rótulo exibido acima do campo
  type: FieldType
  required?: boolean
  placeholder?: string
  min?: number            // para number/money
  max?: number
  options?: { value: string; label: string }[]  // para select/segment
  swatches?: string[]     // para color (oklch ou hex)
}

interface FormModalProps {
  title: string
  fields: FieldDef[]
  onSave: (values: Record<string, unknown>) => Promise<void> | void
  onClose: () => void
  saving?: boolean
  initialValues?: Record<string, unknown>
  saveLabel?: string
  children?: ReactNode     // conteúdo extra abaixo dos campos (raro)
}

// Swatches de cor padrão quando o campo não define os próprios
const DEFAULT_SWATCHES = [
  'oklch(0.685 0.176 52)',   // tangerina
  'oklch(0.56 0.104 234)',   // azul-maré
  'oklch(0.68 0.160 18)',    // coral
  'oklch(0.75 0.140 85)',    // ouro
  'oklch(0.60 0.14 148)',    // verde
  'oklch(0.62 0.16 26)',     // vermelho
  'oklch(0.60 0.15 290)',    // lilás
  'oklch(0.55 0.12 200)',    // ciano
  'oklch(0.65 0.14 320)',    // rosa
  'oklch(0.50 0.08 60)',     // marrom
]

/**
 * Modal genérico com campos tipados — criação/edição de qualquer entidade Nami.
 * Fecha com Esc, clique no scrim ou botão X.
 *
 * Args:
 *   title: título exibido no cabeçalho.
 *   fields: array de definições de campo (key, label, type, options, etc.).
 *   onSave: async callback com os valores preenchidos.
 *   onClose: fecha o modal.
 *   saving: exibe estado de carregamento no botão salvar.
 *   initialValues: valores iniciais dos campos (para edição).
 *   saveLabel: texto do botão de salvar (padrão: "Salvar").
 *   children: conteúdo extra renderizado abaixo dos campos.
 */
export function FormModal({
  title, fields, onSave, onClose, saving, initialValues, saveLabel = 'Salvar', children,
}: FormModalProps) {
  // Estado dos campos: string vazia por padrão, ou o valor de initialValues
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const init: Record<string, unknown> = {}
    fields.forEach(f => {
      init[f.key] = initialValues?.[f.key] ?? ''
    })
    return init
  })
  const [error, setError] = useState('')
  const firstRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null)

  // Foca o primeiro campo ao montar
  useEffect(() => {
    setTimeout(() => firstRef.current?.focus(), 80)
  }, [])

  // Esc fecha o modal
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function set(key: string, val: unknown) {
    setValues(prev => ({ ...prev, [key]: val }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    // Valida campos obrigatórios
    for (const f of fields) {
      if (f.required && !values[f.key]) {
        setError(`"${f.label}" é obrigatório`)
        return
      }
    }
    setError('')
    try {
      await onSave(values)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar')
    }
  }

  // Renderiza o input correto para cada tipo de campo
  function renderField(f: FieldDef, idx: number) {
    const val = values[f.key]

    // Referência para o primeiro campo (foco automático)
    const ref = idx === 0 ? (firstRef as React.RefObject<HTMLInputElement>) : undefined
    const refSel = idx === 0 ? (firstRef as React.RefObject<HTMLSelectElement>) : undefined

    switch (f.type) {

      // Select dropdown
      case 'select':
        return (
          <select
            ref={refSel}
            value={String(val ?? '')}
            onChange={e => set(f.key, e.target.value)}
          >
            <option value="">— selecione —</option>
            {f.options?.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        )

      // Botões de seleção exclusiva (radio visual)
      case 'segment':
        return (
          <div className="segment">
            {f.options?.map(o => (
              <button
                key={o.value}
                type="button"
                className={val === o.value ? 'active' : ''}
                onClick={() => set(f.key, o.value)}
              >
                {o.label}
              </button>
            ))}
          </div>
        )

      // Paleta de cor como círculos clicáveis
      case 'color': {
        const swatches = f.swatches ?? DEFAULT_SWATCHES
        return (
          <div className="swatch-row">
            {swatches.map(sw => (
              <button
                key={sw}
                type="button"
                className={`swatch-pick${val === sw ? ' active' : ''}`}
                style={{ background: sw }}
                onClick={() => set(f.key, sw)}
                aria-label={sw}
                title={sw}
              />
            ))}
          </div>
        )
      }

      // Upload/URL de ícone com preview
      case 'image':
        return (
          <IconField
            value={val as string | null}
            fallbackLabel={String(values[fields[0].key] ?? '?').slice(0, 2).toUpperCase()}
            onChange={url => set(f.key, url)}
          />
        )

      // Campo de valor monetário com prefixo R$
      case 'money':
        return (
          <div className="money-field">
            <span className="money-cur">R$</span>
            <input
              ref={ref}
              type="text"
              inputMode="decimal"
              value={String(val ?? '')}
              onChange={e => set(f.key, e.target.value.replace(/[^0-9.,]/g, ''))}
              placeholder={f.placeholder ?? '0,00'}
            />
          </div>
        )

      // Campos de texto, número e data
      default:
        return (
          <input
            ref={ref}
            type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
            inputMode={f.type === 'number' ? 'numeric' : undefined}
            value={String(val ?? '')}
            onChange={e => set(f.key, e.target.value)}
            placeholder={f.placeholder}
            min={f.min}
            max={f.max}
          />
        )
    }
  }

  return (
    // Scrim — clique fora fecha
    <div
      className="modal-scrim"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <form className="modal" onSubmit={handleSubmit} style={{ maxWidth: 480 }}>
        {/* Cabeçalho com título e botão X */}
        <div className="modal-head">
          <span className="modal-title">{title}</span>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Fechar"
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        {/* Corpo: campos do formulário */}
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {fields.map((f, idx) => (
            <div className="field" key={f.key}>
              <label>{f.label}{f.required && ' *'}</label>
              {renderField(f, idx)}
            </div>
          ))}
          {children}

          {/* Mensagem de erro inline */}
          {error && (
            <div style={{ fontSize: 12, color: 'var(--out)', padding: '6px 10px', background: 'var(--out-t)', borderRadius: 'var(--rad-sm)' }}>
              {error}
            </div>
          )}
        </div>

        {/* Rodapé: Cancelar + Salvar */}
        <div className="modal-foot">
          <div />
          <div className="modal-foot-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancelar
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={saving}
            >
              {saving ? 'Salvando…' : saveLabel}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
