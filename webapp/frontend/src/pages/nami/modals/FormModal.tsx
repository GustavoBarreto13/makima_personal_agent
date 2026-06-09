// Modal genérico orientado a schema — permite criar qualquer formulário passando
// um array de campos tipados. Usado pelas telas de Contas, Cartões e Assinaturas.
// Fecha com Esc, clique no scrim ou botão X. Salva com Enter (se não há textarea).

import { useState, useEffect, useRef, type ReactNode } from 'react'
import { IconField } from './IconField'

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
  swatches?: string[]     // para color
}

interface FormModalProps {
  title: string
  fields: FieldDef[]
  onSave: (values: Record<string, unknown>) => Promise<void> | void
  onClose: () => void
  saving?: boolean
  initialValues?: Record<string, unknown>
  saveLabel?: string
  children?: ReactNode   // conteúdo extra abaixo dos campos (rare)
}

// Swatches de cor padrão quando o campo não define os próprios
const DEFAULT_SWATCHES = [
  '#EF8B3D', '#3B82F6', '#10B981', '#8B5CF6', '#F97316',
  '#EC4899', '#14B8A6', '#E0524A', '#C9A227', '#6366F1',
]

/** Modal genérico com campos tipados — criação/edição de qualquer entidade Nami. */
export function FormModal({
  title, fields, onSave, onClose, saving, initialValues, saveLabel = 'Salvar', children,
}: FormModalProps) {
  // Estado inicial: string vazia para todos os campos (ou o valor passado em initialValues)
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const init: Record<string, unknown> = {}
    fields.forEach(f => {
      init[f.key] = initialValues?.[f.key] ?? ''
    })
    return init
  })
  const [error, setError] = useState('')
  const firstRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null)

  // Foca o primeiro campo ao abrir
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

  // Estilo base dos inputs
  const inputBase: React.CSSProperties = {
    width: '100%',
    padding: '8px 11px',
    borderRadius: 'var(--r-sm)',
    border: '1.5px solid var(--line)',
    background: 'var(--paper)',
    color: 'var(--ink)',
    fontFamily: 'var(--sans)',
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--ink-3)',
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
    display: 'block',
    marginBottom: 4,
  }

  // Renderiza um campo baseado no tipo
  function renderField(f: FieldDef, idx: number) {
    const val = values[f.key]
    const ref = idx === 0 ? (firstRef as React.RefObject<HTMLInputElement>) : undefined

    switch (f.type) {

      case 'select':
        return (
          <select
            ref={idx === 0 ? (firstRef as React.RefObject<HTMLSelectElement>) : undefined}
            value={String(val ?? '')}
            onChange={e => set(f.key, e.target.value)}
            style={{ ...inputBase }}
          >
            <option value="">— selecione —</option>
            {f.options?.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        )

      case 'segment':
        return (
          <div style={{ display: 'flex', gap: 6 }}>
            {f.options?.map(o => (
              <button
                key={o.value}
                type="button"
                onClick={() => set(f.key, o.value)}
                style={{
                  flex: 1,
                  padding: '7px 10px',
                  borderRadius: 'var(--r-sm)',
                  border: `1.5px solid ${val === o.value ? 'var(--tang)' : 'var(--line)'}`,
                  background: val === o.value ? 'var(--tang-tint)' : 'transparent',
                  color: val === o.value ? 'var(--tang-deep)' : 'var(--ink-2)',
                  fontFamily: 'var(--sans)',
                  fontSize: 12.5,
                  fontWeight: val === o.value ? 600 : 400,
                  cursor: 'pointer',
                }}
              >
                {o.label}
              </button>
            ))}
          </div>
        )

      case 'color': {
        const swatches = f.swatches ?? DEFAULT_SWATCHES
        return (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {swatches.map(sw => (
              <button
                key={sw}
                type="button"
                onClick={() => set(f.key, sw)}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 9,
                  background: sw,
                  border: `3px solid ${val === sw ? 'var(--ink)' : 'transparent'}`,
                  cursor: 'pointer',
                  outline: val === sw ? '2px solid var(--paper)' : 'none',
                  outlineOffset: -4,
                }}
                aria-label={sw}
              />
            ))}
          </div>
        )
      }

      case 'image':
        return (
          <IconField
            value={val as string | null}
            fallbackLabel={String(values[fields[0].key] ?? '?').slice(0, 2).toUpperCase()}
            onChange={url => set(f.key, url)}
          />
        )

      case 'money':
        return (
          <div style={{ position: 'relative' }}>
            <span style={{
              position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)',
              fontSize: 12, color: 'var(--ink-3)', pointerEvents: 'none', fontFamily: 'var(--mono)',
            }}>R$</span>
            <input
              ref={ref}
              type="text"
              inputMode="decimal"
              value={String(val ?? '')}
              onChange={e => set(f.key, e.target.value.replace(/[^0-9.,]/g, ''))}
              placeholder={f.placeholder ?? '0,00'}
              style={{ ...inputBase, paddingLeft: 32, fontFamily: 'var(--mono)' }}
            />
          </div>
        )

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
            style={inputBase}
          />
        )
    }
  }

  return (
    // Scrim — clique fora fecha
    <div
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.4)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
        padding: 24,
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          background: 'var(--card)',
          borderRadius: 'var(--r-lg)',
          padding: 24,
          width: '100%',
          maxWidth: 480,
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div style={{ fontFamily: 'var(--display, var(--sans))', fontSize: 20, fontWeight: 700, color: 'var(--ink)' }}>
            {title}
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--ink-3)', fontSize: 20, padding: '2px 6px',
              borderRadius: 'var(--r-sm)',
            }}
            aria-label="Fechar"
          >✕</button>
        </div>

        {/* Campos */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {fields.map((f, idx) => (
            <div key={f.key}>
              <label style={labelStyle}>{f.label}{f.required && ' *'}</label>
              {renderField(f, idx)}
            </div>
          ))}
          {children}
        </div>

        {/* Erro */}
        {error && (
          <div style={{ fontSize: 12, color: 'var(--out)', marginTop: -8 }}>{error}</div>
        )}

        {/* Botões */}
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 1, padding: '9px',
              borderRadius: 'var(--r-md)',
              border: '1.5px solid var(--line)',
              background: 'transparent',
              color: 'var(--ink-2)',
              fontFamily: 'var(--sans)', fontSize: 13.5, fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            style={{
              flex: 2, padding: '9px',
              borderRadius: 'var(--r-md)',
              border: 'none',
              background: 'var(--tang)',
              color: 'white',
              fontFamily: 'var(--sans)', fontSize: 13.5, fontWeight: 600,
              cursor: saving ? 'wait' : 'pointer',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Salvando…' : saveLabel}
          </button>
        </div>
      </form>
    </div>
  )
}
