// Formulário de registrar leitura (o "Mais detalhes" da linha rápida; substitui o LogModal do shell antigo).
// Escolher o livro (busca + carrossel de capas), a página onde parou (+10/+25/+50/terminei, com a % ao vivo),
// o dia, uma linha sobre hoje e, se terminou, a nota de meia a cinco estrelas. Ctrl+Enter salva.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, DatePicker, Field, Input, Modal, NumberInput, RateInput, Textarea, Toggle } from '../../../design'
import { useFrieren } from '../context'
import { searchBooks, validateDraft, type LogDraft } from '../lib/log'
import { STATUS } from '../lib/status'
import { BookCover } from './BookCover'

const STEPS = [10, 25, 50]

export function LogForm({ initial, onClose }: { initial: LogDraft; onClose: () => void }) {
  const frieren = useFrieren()
  const [d, setD] = useState<LogDraft>(initial)
  // A busca começa com o que foi digitado na linha rápida quando o livro não foi reconhecido.
  const [query, setQuery] = useState(initial.bookId ? '' : initial.title)
  const [error, setError] = useState<{ field: string; message: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const stripRef = useRef<HTMLDivElement>(null)

  const book = frieren.books.find((b) => b.id === d.bookId) ?? null
  const set = (patch: Partial<LogDraft>) => { setD((cur) => ({ ...cur, ...patch })); setError(null) }

  // Carrossel: resultados da busca (ou os candidatos), com o livro escolhido sempre visível no começo.
  const list = useMemo(() => {
    const found = searchBooks(query, frieren.books).slice(0, 30)
    return book && !found.some((b) => b.id === book.id) ? [book, ...found] : found
  }, [query, frieren.books, book])

  // A roda do mouse rola o carrossel na horizontal (sem isso, só trackpad/toque rolariam).
  // O listener precisa ser "não passivo" para poder impedir a página de rolar junto.
  useEffect(() => {
    const el = stripRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (e.deltaX !== 0 || el.scrollWidth <= el.clientWidth) return
      e.preventDefault()
      el.scrollLeft += e.deltaY
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // Trocar de livro pré-preenche a página com a atual dele (fica fácil só somar).
  const choose = (id: string) => {
    const b = frieren.books.find((x) => x.id === id)
    set({ bookId: id, page: b ? b.page : null, finished: false, rating: null })
  }

  const total = book?.pages ?? 0
  const bump = (n: number) => set({ page: Math.min(total || Infinity, Math.max(0, (d.page ?? book?.page ?? 0) + n)) })
  const pct = total && d.page !== null ? Math.round((d.page / total) * 100) : null

  const dirty = JSON.stringify(d) !== JSON.stringify(initial)
  const err = (field: string) => (error?.field === field ? error.message : null)

  const submit = async () => {
    const bad = validateDraft(d, book, frieren.today)
    if (bad) { setError(bad); return }
    setSaving(true)
    try {
      await frieren.saveLog(d)
      onClose()
    } catch (e) {
      setError({ field: 'form', message: e instanceof Error ? e.message : 'Não foi possível salvar. Tente de novo.' })
      setSaving(false)
    }
  }

  return (
    <Modal
      title="Registrar leitura"
      size="lg"
      dirty={dirty}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" icon="check" kbd="Ctrl+↵" disabled={saving} onClick={() => void submit()}>Salvar</Button>
        </>
      }
    >
      <div className="ds-stack" onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); void submit() } }}>
        <Field label="Qual livro?" error={err('book')} hint={book ? `${book.title}${book.author ? ` · ${book.author}` : ''} · ${STATUS[book.status].label}` : 'Busque pelo título ou autor e toque na capa.'}>
          {(a) => <Input {...a} value={query} placeholder="Buscar por título ou autor…" autoComplete="off" onChange={(e) => setQuery(e.target.value)} />}
        </Field>
        <div className="fr-pick" ref={stripRef} role="listbox" aria-label="Livros">
          {list.map((b) => (
            <div key={b.id} className="fr-pick-i" role="option" aria-selected={b.id === d.bookId}>
              <BookCover title={b.title} src={b.coverUrl} small={false} titleOnCover selected={b.id === d.bookId} label={`Escolher ${b.title}`} onOpen={() => choose(b.id)} />
            </div>
          ))}
          {list.length === 0 && <p className="ds-hint">Nenhum livro encontrado. Adicione-o à biblioteca primeiro.</p>}
        </div>

        <Field label="Você parou na página…" error={err('page')} hint={total ? `de ${total}${pct !== null ? ` · ${pct}%` : ''}` : 'O livro não tem total de páginas cadastrado.'}>
          {(a) => (
            <div className="ds-inline fr-pagerow">
              <NumberInput {...a} min={0} max={total || undefined} value={d.page ?? ''} onChange={(e) => set({ page: e.target.value === '' ? null : Math.round(Number(e.target.value)) })} />
              {STEPS.map((n) => <Button key={n} size="sm" disabled={!book} onClick={() => bump(n)}>+{n}</Button>)}
              <Button size="sm" icon="finished" disabled={!book} onClick={() => set({ page: total || d.page, finished: true })}>terminei</Button>
            </div>
          )}
        </Field>

        <div className="ds-cols2">
          <Field label="Quando você leu?" error={err('date')}>{(a) => <DatePicker {...a} value={d.date} onChange={(date) => set({ date })} />}</Field>
          <Field label="Terminei este livro">
            {() => <Toggle checked={d.finished} label="Terminei este livro" onChange={(finished) => set({ finished, rating: finished ? d.rating : null })} />}
          </Field>
        </div>

        {d.finished && (
          <Field label="Sua nota" error={err('rating')} hint="De meia a cinco estrelas. Opcional.">
            {() => (
              <div className="ds-inline">
                <RateInput value={d.rating ?? 0} onChange={(v) => set({ rating: v || null })} />
                {d.rating !== null && <Button size="sm" variant="ghost" onClick={() => set({ rating: null })}>limpar</Button>}
              </div>
            )}
          </Field>
        )}

        <Field label="Uma linha sobre hoje" hint="Opcional.">
          {(a) => <Textarea {...a} rows={2} value={d.note} placeholder="O que ficou de hoje?" onChange={(e) => set({ note: e.target.value })} />}
        </Field>

        {error?.field === 'form' && <p className="ds-errmsg" role="alert">{error.message}</p>}
      </div>
    </Modal>
  )
}
