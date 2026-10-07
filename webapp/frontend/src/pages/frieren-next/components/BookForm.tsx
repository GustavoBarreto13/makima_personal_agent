// Editar livro (o EditBookModal do shell antigo): capa (com prévia), título, autor, gênero, ano, páginas, ISBN,
// idioma, situação (os 7 status), nota com meia estrela, início e término, sinopse, resenha, link e preço da loja.
// Só os campos alterados vão para o servidor; esvaziar um campo opcional apaga o valor (antes não havia como
// tirar uma nota ou uma data). Ctrl+Enter salva.

import { useState } from 'react'
import { Button, DatePicker, Field, Icon, Img, Input, Modal, NumberInput, RateInput, Select, Textarea } from '../../../design'
import { toast } from '../../../design/headless/toast'
import { useFrieren } from '../context'
import { frierenApi, type MetadataPatch } from '../frierenApi'
import { normalizeUrl } from '../lib/normalize'
import { STATUS, STATUS_ORDER } from '../lib/status'
import type { ApiBookDetail, BookStatus } from '../types'

/** Formulário em texto (o que está nos campos); vira o patch na hora de salvar. */
interface FormState {
  title: string
  author: string
  cover_url: string
  genre: string
  published_year: string
  total_pages: string
  isbn: string
  language: string
  status: BookStatus
  rating: number | null
  date_started: string
  date_finished: string
  description: string
  notes: string
  store_url: string
  price: string
}

const fromDetail = (b: ApiBookDetail): FormState => ({
  title: b.title ?? '',
  author: b.author ?? '',
  cover_url: b.cover_url ?? '',
  genre: b.genre ?? '',
  published_year: b.published_year != null ? String(b.published_year) : '',
  total_pages: b.total_pages != null ? String(b.total_pages) : '',
  isbn: b.isbn ?? '',
  language: b.language ?? '',
  status: (STATUS_ORDER as string[]).includes(b.status) ? (b.status as BookStatus) : 'quero_ler',
  rating: b.rating ?? null,
  date_started: b.date_started ? b.date_started.slice(0, 10) : '',
  date_finished: b.date_finished ? b.date_finished.slice(0, 10) : '',
  description: b.description ?? '',
  notes: b.notes ?? '',
  store_url: b.store_url ?? '',
  price: b.price != null ? String(b.price) : '',
})

// Campos de texto livre e como cada um vai para o servidor.
const TEXT = ['author', 'cover_url', 'genre', 'isbn', 'language', 'description', 'notes'] as const
const NUMS = ['published_year', 'total_pages'] as const

/** Monta o patch só com o que mudou. Campo opcional esvaziado entra em `clear`. Pura (testável). */
export function buildPatch(before: FormState, after: FormState): MetadataPatch {
  const patch: MetadataPatch = {}
  const clear: string[] = []
  if (after.title.trim() !== before.title.trim()) patch.title = after.title.trim()
  for (const k of TEXT) {
    const v = after[k].trim()
    if (v === before[k].trim()) continue
    if (v) patch[k] = v
    else clear.push(k)
  }
  for (const k of NUMS) {
    if (after[k].trim() === before[k].trim()) continue
    if (after[k].trim()) patch[k] = Math.round(Number(after[k]))
    else clear.push(k)
  }
  if (after.store_url.trim() !== before.store_url.trim()) {
    if (after.store_url.trim()) patch.store_url = normalizeUrl(after.store_url)
    else clear.push('store_url')
  }
  if (after.price.trim() !== before.price.trim()) {
    if (after.price.trim()) patch.price = Number(after.price.replace(',', '.'))
    else clear.push('price')
  }
  if (after.rating !== before.rating) {
    if (after.rating) patch.rating = after.rating
    else clear.push('rating')
  }
  for (const k of ['date_started', 'date_finished'] as const) {
    if (after[k] === before[k]) continue
    if (after[k]) patch[k] = after[k]
    else clear.push(k)
  }
  if (clear.length) patch.clear = clear
  return patch
}

/** Erros de validação por campo (vazio = pode salvar). Pura (testável). */
export function validateForm(f: FormState, today: string): Record<string, string> {
  const e: Record<string, string> = {}
  if (!f.title.trim()) e.title = 'O título é obrigatório.'
  if (f.total_pages.trim() && !(Number(f.total_pages) > 0)) e.total_pages = 'Use um número maior que zero.'
  if (f.published_year.trim() && !/^\d{1,4}$/.test(f.published_year.trim())) e.published_year = 'Ano com até 4 dígitos.'
  if (f.price.trim() && !(Number(f.price.replace(',', '.')) >= 0)) e.price = 'Preço inválido.'
  if (f.date_started && f.date_started > today) e.date_started = 'O início não pode ser no futuro.'
  if (f.date_finished && f.date_finished > today) e.date_finished = 'O término não pode ser no futuro.'
  if (f.date_started && f.date_finished && f.date_finished < f.date_started) e.date_finished = 'O término não pode vir antes do início.'
  return e
}

export function BookForm({ book, onClose }: { book: ApiBookDetail; onClose: () => void }) {
  const frieren = useFrieren()
  const initial = fromDetail(book)
  const [f, setF] = useState<FormState>(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const set = (patch: Partial<FormState>) => { setF((cur) => ({ ...cur, ...patch })); setErrors({}) }

  const dirty = JSON.stringify(f) !== JSON.stringify(initial)

  const submit = async () => {
    const e = validateForm(f, frieren.today)
    setErrors(e)
    if (Object.keys(e).length) return
    setSaving(true)
    try {
      const patch = buildPatch(initial, f)
      if (Object.keys(patch).length) await frierenApi.updateMetadata(book.id, patch)
      // O status vai à parte: o servidor ajusta as datas junto (início ao ler, data do abandono…).
      if (f.status !== initial.status) await frierenApi.setStatus(book.id, f.status)
      frieren.reload()
      toast('Livro atualizado', { tone: 'success' })
      onClose()
    } catch (err) {
      setErrors({ form: err instanceof Error ? err.message : 'Não foi possível salvar. Tente de novo.' })
      setSaving(false)
    }
  }

  // Campo de texto simples ligado ao formulário (sem repetir o mesmo código 10 vezes).
  const text = (k: keyof FormState, label: string, placeholder?: string, hint?: string) => (
    <Field label={label} error={errors[k]} hint={hint}>
      {(a) => <Input {...a} value={f[k] as string} placeholder={placeholder} onChange={(e) => set({ [k]: e.target.value } as Partial<FormState>)} />}
    </Field>
  )

  return (
    <Modal
      title="Editar livro"
      size="lg"
      dirty={dirty}
      onClose={onClose}
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" icon="check" kbd="Ctrl+↵" disabled={saving} onClick={() => void submit()}>Salvar</Button></>}
    >
      <div className="ds-stack" onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); void submit() } }}>
        <div className="fr-coveredit">
          <Img src={f.cover_url.trim() || null} ratio="poster" className="fr-coverprev" alt="Prévia da capa" fallback={<Icon name="book" size={28} />} />
          <div className="ds-stack fr-grow">
            {text('cover_url', 'URL da capa', 'https://…', 'Cole o endereço de uma imagem.')}
            {text('title', 'Título')}
            {text('author', 'Autor')}
          </div>
        </div>

        <div className="ds-cols2">
          {text('genre', 'Gênero', 'Ex.: Fantasia, Aventura', 'Separe vários com vírgula.')}
          {text('language', 'Idioma', 'Ex.: pt, en')}
          <Field label="Ano de publicação" error={errors.published_year}>{(a) => <NumberInput {...a} value={f.published_year} onChange={(e) => set({ published_year: e.target.value })} />}</Field>
          <Field label="Páginas" error={errors.total_pages}>{(a) => <NumberInput {...a} min={1} value={f.total_pages} onChange={(e) => set({ total_pages: e.target.value })} />}</Field>
          {text('isbn', 'ISBN')}
          <Field label="Situação">
            {(a) => (
              <Select {...a} value={f.status} onChange={(e) => set({ status: e.target.value as BookStatus })}>
                {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}
              </Select>
            )}
          </Field>
        </div>

        <Field label="Nota" hint="De meia a cinco estrelas.">
          {() => (
            <div className="ds-inline">
              <RateInput value={f.rating ?? 0} onChange={(v) => set({ rating: v || null })} />
              {f.rating !== null && <Button size="sm" variant="ghost" onClick={() => set({ rating: null })}>limpar</Button>}
            </div>
          )}
        </Field>

        <div className="ds-cols2">
          {(['date_started', 'date_finished'] as const).map((k) => (
            <Field key={k} label={k === 'date_started' ? 'Comecei em' : 'Terminei em'} error={errors[k]}>
              {(a) => (
                <div className="ds-inline">
                  <DatePicker {...a} value={f[k]} onChange={(v) => set({ [k]: v } as Partial<FormState>)} />
                  {f[k] && <Button size="sm" variant="ghost" onClick={() => set({ [k]: '' } as Partial<FormState>)}>limpar</Button>}
                </div>
              )}
            </Field>
          ))}
        </div>

        <Field label="Sinopse">{(a) => <Textarea {...a} rows={3} value={f.description} onChange={(e) => set({ description: e.target.value })} />}</Field>
        <Field label="Resenha">{(a) => <Textarea {...a} rows={4} value={f.notes} onChange={(e) => set({ notes: e.target.value })} />}</Field>

        <div className="ds-cols2">
          {text('store_url', 'Link da loja', 'amazon.com.br/…')}
          <Field label="Preço" error={errors.price}>{(a) => <Input {...a} inputMode="decimal" value={f.price} placeholder="Ex.: 49,90" onChange={(e) => set({ price: e.target.value })} />}</Field>
        </div>

        {errors.form && <p className="ds-errmsg" role="alert">{errors.form}</p>}
      </div>
    </Modal>
  )
}
