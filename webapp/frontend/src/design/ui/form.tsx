// Formulários do padrão: Field, Input, Textarea, Select, NumberInput, MoneyInput, TagInput,
// DatePicker (+ MiniCalendar), TimePicker e PersonPicker.
// Regras: nunca <input type="date|time"> (o popup do sistema ignora os tokens); validação inline
// embaixo do campo, nunca em alert; toda mensagem de erro diz o que fazer.

import { useEffect, useMemo, useRef, useState, type InputHTMLAttributes, type KeyboardEvent, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { fmtDate, fmtNumber, isoDate, MONTHS_LONG, parseISODate, todayISO, WEEKDAYS_SHORT } from '../core/format'
import { useDismissable } from '../headless/overlay'
import { Avatar, cx, useFieldId } from './primitives'
import { Icon } from './Icon'

// ── Field ────────────────────────────────────────────────────────────────────

export interface FieldControlProps {
  id: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean
}

export interface FieldProps {
  label: string
  hint?: ReactNode
  /** Mensagem de erro. Aparece embaixo do campo, em vermelho. */
  error?: string | null
  className?: string
  children: (control: FieldControlProps) => ReactNode
}

export function Field({ label, hint, error, className, children }: FieldProps) {
  const id = useFieldId()
  const descId = `${id}-d`
  const control: FieldControlProps = { id, 'aria-describedby': error || hint ? descId : undefined, 'aria-invalid': error ? true : undefined }
  return (
    <div className={cx('ds-field', error && 'ds-err', className)}>
      <label htmlFor={id}>{label}</label>
      {children(control)}
      {error ? (
        <span id={descId} className="ds-errmsg" role="alert">{error}</span>
      ) : hint ? (
        <span id={descId} className="ds-hint">{hint}</span>
      ) : null}
    </div>
  )
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx('ds-input', className)} {...rest} />
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx('ds-textarea', className)} {...rest} />
}

export function Select({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx('ds-select', className)} {...rest} />
}

export function NumberInput({ className, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  return <input type="number" inputMode="decimal" className={cx('ds-input ds-num', className)} {...rest} />
}

// ── MoneyInput (R$) ──────────────────────────────────────────────────────────

export interface MoneyInputProps {
  value: number | null
  onChange: (v: number | null) => void
  id?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean
  placeholder?: string
}

function parseMoney(text: string): number | null {
  const clean = text.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')
  if (!clean || clean === '-' || clean === '.') return null
  const n = parseFloat(clean)
  return Number.isFinite(n) ? n : null
}

export function MoneyInput({ value, onChange, placeholder = '0,00', ...a11y }: MoneyInputProps) {
  const [text, setText] = useState(value === null ? '' : fmtNumber(value, 2))
  const focused = useRef(false)
  useEffect(() => {
    if (!focused.current) setText(value === null ? '' : fmtNumber(value, 2))
  }, [value])
  return (
    <div className="ds-money">
      <span aria-hidden="true">R$</span>
      <input
        {...a11y}
        inputMode="decimal"
        placeholder={placeholder}
        value={text}
        onFocus={() => { focused.current = true }}
        onChange={(e) => { setText(e.target.value); onChange(parseMoney(e.target.value)) }}
        onBlur={() => { focused.current = false; setText(value === null ? '' : fmtNumber(value, 2)) }}
      />
    </div>
  )
}

// ── TagInput ─────────────────────────────────────────────────────────────────

export interface TagInputProps {
  value: string[]
  onChange: (tags: string[]) => void
  id?: string
  placeholder?: string
}

export function TagInput({ value, onChange, id, placeholder = 'Enter para adicionar' }: TagInputProps) {
  const [draft, setDraft] = useState('')
  const add = () => {
    const t = draft.trim().replace(/^#/, '').toLowerCase()
    if (t && !value.includes(t)) onChange([...value, t])
    setDraft('')
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add() }
    else if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1))
  }
  return (
    <div className="ds-taginput">
      {value.map((t) => (
        <span key={t} className="ds-fchip">
          #{t}
          <button type="button" aria-label={`Remover ${t}`} onClick={() => onChange(value.filter((x) => x !== t))}><Icon name="close" size={10} /></button>
        </span>
      ))}
      <input id={id} value={draft} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey} onBlur={add} />
    </div>
  )
}

// ── MiniCalendar + DatePicker ────────────────────────────────────────────────

export function MiniCalendar({ value, onPick, today = todayISO() }: { value: string; onPick: (iso: string) => void; today?: string }) {
  const base = parseISODate(value || today)
  const [view, setView] = useState({ y: base.getFullYear(), m: base.getMonth() })
  const first = new Date(view.y, view.m, 1).getDay()
  const days = new Date(view.y, view.m + 1, 0).getDate()
  const move = (d: number) => setView(({ y, m }) => {
    const n = m + d
    return n < 0 ? { y: y - 1, m: 11 } : n > 11 ? { y: y + 1, m: 0 } : { y, m: n }
  })
  const cells: ReactNode[] = []
  for (let i = 0; i < first; i++) cells.push(<span key={`b${i}`} />)
  for (let d = 1; d <= days; d++) {
    const iso = isoDate(new Date(view.y, view.m, d))
    cells.push(
      <button key={iso} type="button" className={iso === value ? 'ds-sel' : iso === today ? 'ds-td' : undefined} onClick={() => onPick(iso)} aria-pressed={iso === value}>
        {d}
      </button>,
    )
  }
  return (
    <div role="dialog" aria-label="Escolher data">
      <div className="ds-dp-h">
        <button type="button" className="ds-iconbtn" aria-label="Mês anterior" onClick={() => move(-1)}><Icon name="left" size={16} /></button>
        <span>{MONTHS_LONG[view.m]} de {view.y}</span>
        <button type="button" className="ds-iconbtn" aria-label="Próximo mês" onClick={() => move(1)}><Icon name="right" size={16} /></button>
      </div>
      <div className="ds-dp-g">
        {WEEKDAYS_SHORT.map((d) => <span key={d}>{d[0].toUpperCase()}</span>)}
        {cells}
      </div>
    </div>
  )
}

export interface DatePickerProps {
  value: string
  onChange: (iso: string) => void
  id?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean
}

export function DatePicker({ value, onChange, ...a11y }: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useDismissable(ref, () => setOpen(false), open)
  return (
    <div className="ds-anchor" ref={ref}>
      <button type="button" className="ds-input ds-datebtn" {...a11y} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span>{value ? fmtDate(value) : 'Escolher data'}</span>
        <Icon name="calendar" size={16} />
      </button>
      {open && (
        <div className="ds-dp">
          <MiniCalendar value={value} onPick={(iso) => { onChange(iso); setOpen(false) }} />
        </div>
      )}
    </div>
  )
}

// ── TimePicker (slots de 15 minutos) ─────────────────────────────────────────

const SLOTS = Array.from({ length: 96 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`)

export function TimePicker({ value, onChange, id }: { value: string; onChange: (hhmm: string) => void; id?: string }) {
  return (
    <select id={id} className="ds-select ds-num" value={value} onChange={(e) => onChange(e.target.value)}>
      {value && !SLOTS.includes(value) && <option value={value}>{value}</option>}
      {SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}
    </select>
  )
}

// ── PersonPicker (smart-match da Komi: 0 → cadastrar; 1 → confirmar; 2+ → escolher) ─────

export interface PersonOption {
  id: string
  name: string
  hint?: string
  avatar?: string | null
}

export interface PersonPickerProps {
  value: PersonOption[]
  onChange: (people: PersonOption[]) => void
  /** Busca na Komi (síncrona ou assíncrona). */
  search: (query: string) => PersonOption[] | Promise<PersonOption[]>
  /** Cadastra uma pessoa nova (a Komi é dona da identidade). */
  onCreate?: (name: string) => Promise<PersonOption> | PersonOption
  id?: string
}

export function PersonPicker({ value, onChange, search, onCreate, id }: PersonPickerProps) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<PersonOption[] | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  useDismissable(ref, () => setResults(null), results !== null)

  useEffect(() => {
    let live = true
    if (!q.trim()) { setResults(null); return }
    Promise.resolve(search(q.trim())).then((r) => { if (live) setResults(r.filter((p) => !value.some((v) => v.id === p.id))) })
    return () => { live = false }
  }, [q, search, value])

  const pick = (p: PersonOption) => { onChange([...value, p]); setQ(''); setResults(null) }
  const create = async () => { if (onCreate) pick(await onCreate(q.trim())) }
  const message = useMemo(() => {
    if (results === null) return ''
    if (results.length === 0) return 'Nenhuma pessoa encontrada.'
    if (results.length === 1) return `Encontrei ${results[0].name}.`
    return `${results.length} pessoas parecidas. Escolha uma.`
  }, [results])

  return (
    <div className="ds-combo" ref={ref}>
      <div className="ds-taginput">
        {value.map((p) => (
          <span key={p.id} className="ds-fchip">
            {p.name}
            <button type="button" aria-label={`Remover ${p.name}`} onClick={() => onChange(value.filter((x) => x.id !== p.id))}><Icon name="close" size={10} /></button>
          </span>
        ))}
        <input id={id} value={q} placeholder="Buscar pessoa…" onChange={(e) => setQ(e.target.value)} autoComplete="off" aria-label="Buscar pessoa" />
      </div>
      {results !== null && (
        <div className="ds-combo-list" role="listbox" aria-label="Pessoas">
          <p className="ds-hint" aria-live="polite" style={{ padding: '4px 8px' }}>{message}</p>
          {results.map((p) => (
            <button key={p.id} type="button" role="option" aria-selected={false} className="ds-combo-item" onClick={() => pick(p)}>
              <Avatar name={p.name} src={p.avatar} size={28} />
              <span><b>{p.name}</b>{p.hint && <small>{p.hint}</small>}</span>
            </button>
          ))}
          {results.length === 0 && onCreate && (
            <button type="button" className="ds-combo-item" onClick={create}>
              <Icon name="add" size={16} />
              <span><b>Cadastrar “{q.trim()}”</b></span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
