// Estantes: coleções temáticas de livros. A grade mostra cada estante com até 5 capas sobrepostas, a faixa de
// cor, o nome, a descrição e quantos livros tem; a estante aberta mostra os livros, com adicionar e tirar.
// Criar, editar e excluir estantes; tirar um livro e excluir a estante pedem confirmação e têm "Desfazer".

import { useMemo, useState, type CSSProperties } from 'react'
import {
  Button, EmptyState, Field, Icon, IconButton, Input, Menu, Modal, Page, SectionHeader, Textarea, type MenuItem,
} from '../../../design'
import { confirm } from '../../../design/headless/confirm'
import { toast } from '../../../design/headless/toast'
import { cx } from '../../../design/ui/primitives'
import { BookCard } from '../components/BookCard'
import { BookCover } from '../components/BookCover'
import { useFrieren } from '../context'
import { frierenApi } from '../frierenApi'
import { norm } from '../lib/log'
import { shelfTone } from '../lib/normalize'
import type { Book, Shelf } from '../types'

/** As 8 cores do shell antigo, agora guardadas como matiz (ou "neutral" para o cinza). */
export const SHELF_COLORS: { value: string; label: string }[] = [
  { value: '195', label: 'Verde-água' },
  { value: '80', label: 'Dourado' },
  { value: '18', label: 'Granada' },
  { value: '250', label: 'Azul' },
  { value: '155', label: 'Verde' },
  { value: '300', label: 'Roxo' },
  { value: '350', label: 'Rosa' },
  { value: 'neutral', label: 'Cinza' },
]

/** Estilo de cor de uma estante: o matiz vai na variável --fr-sh (frieren.css monta a cor com o acento do DS). */
function toneStyle(accent: string): { style: CSSProperties; neutral: boolean } {
  const t = shelfTone(accent, 195)
  return { style: { '--fr-sh': t.hue } as CSSProperties, neutral: t.neutral }
}

/** Criar ou editar uma estante: nome (obrigatório), descrição e cor. */
function ShelfForm({ shelf, onClose }: { shelf: Shelf | null; onClose: () => void }) {
  const frieren = useFrieren()
  const [name, setName] = useState(shelf?.name ?? '')
  const [description, setDescription] = useState(shelf?.description ?? '')
  // Estante antiga com cor no formato velho: mostra a cor equivalente selecionada.
  const initialColor = (() => {
    if (!shelf) return '195'
    const t = shelfTone(shelf.accent, 195)
    return t.neutral ? 'neutral' : SHELF_COLORS.find((c) => c.value === String(Math.round(t.hue)))?.value ?? String(Math.round(t.hue))
  })()
  const [color, setColor] = useState(initialColor)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!name.trim()) { setError('Dê um nome à estante.'); return }
    setSaving(true)
    try {
      const body = { name: name.trim(), description: description.trim(), accent: color }
      if (shelf) await frierenApi.updateShelf(shelf.id, body)
      else await frierenApi.createShelf(body)
      frieren.reload()
      toast(shelf ? 'Estante atualizada' : 'Estante criada', { tone: 'success' })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar.')
      setSaving(false)
    }
  }

  return (
    <Modal
      title={shelf ? 'Editar estante' : 'Nova estante'}
      size="sm"
      dirty={name !== (shelf?.name ?? '') || description !== (shelf?.description ?? '') || color !== initialColor}
      onClose={onClose}
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" icon="check" disabled={saving} onClick={() => void save()}>Salvar</Button></>}
    >
      <div className="ds-stack" onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); void save() } }}>
        <Field label="Nome" error={error && !name.trim() ? error : null}>
          {(a) => <Input {...a} autoFocus value={name} placeholder="Ex.: Clássicos russos" onChange={(e) => { setName(e.target.value); setError('') }} />}
        </Field>
        <Field label="Descrição" hint="Opcional.">{(a) => <Textarea {...a} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />}</Field>
        <Field label="Cor">
          {() => (
            <div className="ds-inline fr-swatches" role="radiogroup" aria-label="Cor da estante">
              {SHELF_COLORS.map((c) => {
                const t = toneStyle(c.value)
                return (
                  <button
                    key={c.value}
                    type="button"
                    role="radio"
                    aria-checked={color === c.value}
                    aria-label={c.label}
                    title={c.label}
                    className={cx('fr-swatch fr-sh-swatch', t.neutral && 'fr-sh-neutral', color === c.value && 'fr-swatch-on')}
                    style={t.style}
                    onClick={() => setColor(c.value)}
                  />
                )
              })}
            </div>
          )}
        </Field>
        {error && name.trim() && <p className="ds-errmsg" role="alert">{error}</p>}
      </div>
    </Modal>
  )
}

/** Excluir estante: os livros continuam na biblioteca. "Desfazer" recria a estante com os mesmos livros. */
async function removeShelf(shelf: Shelf, books: Book[], reload: () => void, after?: () => void) {
  const ok = await confirm({
    title: `Excluir a estante “${shelf.name}”?`,
    body: 'Os livros continuam na biblioteca; só a estante some.',
    confirmLabel: 'Excluir estante',
    danger: true,
  })
  if (!ok) return
  const members = books.filter((b) => b.shelves.includes(shelf.id)).map((b) => b.id)
  try {
    await frierenApi.deleteShelf(shelf.id)
    reload()
    after?.()
    toast('Estante excluída', {
      undo: () => {
        void (async () => {
          const created = await frierenApi.createShelf({ name: shelf.name, description: shelf.description, accent: shelf.accent })
          for (const id of members) await frierenApi.addToShelf(created.id, id)
          reload()
        })().catch(() => toast('Não foi possível desfazer.', { tone: 'error' }))
      },
    })
  } catch { toast('Não foi possível excluir a estante.', { tone: 'error' }) }
}

function ShelfCard({ shelf, books, onEdit }: { shelf: Shelf; books: Book[]; onEdit: () => void }) {
  const frieren = useFrieren()
  const [menu, setMenu] = useState(false)
  const inside = books.filter((b) => b.shelves.includes(shelf.id))
  const t = toneStyle(shelf.accent)
  const items: MenuItem[] = [
    { id: 'edit', label: 'Editar estante', onSelect: onEdit },
    { id: 'delete', label: 'Excluir estante', onSelect: () => { void removeShelf(shelf, frieren.books, frieren.reload) } },
  ]
  return (
    <article className={cx('ds-card fr-shelf', t.neutral && 'fr-sh-neutral')} style={t.style}>
      <button type="button" className="fr-shelf-open" onClick={() => frieren.goto({ view: 'shelves', shelfId: shelf.id })} aria-label={`Abrir a estante ${shelf.name}`}>
        <span className="fr-stack" aria-hidden="true">
          {inside.slice(0, 5).map((b) => (
            <span key={b.id} className="fr-stack-i"><BookCover title={b.title} src={b.coverUrl} small titleOnCover={false} /></span>
          ))}
          {inside.length === 0 && <span className="fr-stack-empty"><Icon name="shelf" size={28} /></span>}
        </span>
        <span className="fr-shelf-bar" />
        <b className="fr-shelf-t">{shelf.name}</b>
        {shelf.description && <span className="fr-shelf-d">{shelf.description}</span>}
        <span className="ds-mono">{inside.length} {inside.length === 1 ? 'livro' : 'livros'}</span>
      </button>
      <span className="fr-menu fr-shelf-more">
        <IconButton icon="more" label={`Ações da estante ${shelf.name}`} size={16} onClick={() => setMenu((v) => !v)} />
        {menu && <Menu label="Ações da estante" items={items} onClose={() => setMenu(false)} />}
      </span>
    </article>
  )
}

export function Shelves() {
  const frieren = useFrieren()
  const [form, setForm] = useState<{ shelf: Shelf | null } | null>(null)
  const shelves = frieren.shelves

  return (
    <Page wide>
      <SectionHeader title="Suas estantes" action={<Button variant="primary" icon="add" onClick={() => setForm({ shelf: null })}>Nova estante</Button>} />
      {shelves.length === 0
        ? (
          <EmptyState
            icon="shelf"
            title="Nenhuma estante ainda"
            hint="Agrupe livros por tema: clássicos, releituras, presentes, a pilha das férias…"
            action={<Button variant="primary" icon="add" onClick={() => setForm({ shelf: null })}>Criar a primeira estante</Button>}
          />
        )
        : <div className="fr-shelves">{shelves.map((s) => <ShelfCard key={s.id} shelf={s} books={frieren.books} onEdit={() => setForm({ shelf: s })} />)}</div>}
      {form && <ShelfForm shelf={form.shelf} onClose={() => setForm(null)} />}
    </Page>
  )
}

/** Escolher livros para pôr na estante (um toque adiciona; a lista some com quem já entrou). */
function AddBooks({ shelf, onClose }: { shelf: Shelf; onClose: () => void }) {
  const frieren = useFrieren()
  const [q, setQ] = useState('')
  const [added, setAdded] = useState<string[]>([])
  const outside = useMemo(() => {
    const n = norm(q)
    return frieren.books
      .filter((b) => !b.shelves.includes(shelf.id) && !added.includes(b.id))
      .filter((b) => !n || norm(b.title).includes(n) || norm(b.author).includes(n))
  }, [frieren.books, shelf.id, added, q])

  const add = async (b: Book) => {
    try {
      await frierenApi.addToShelf(shelf.id, b.id)
      setAdded((cur) => [...cur, b.id])
      frieren.reload()
    } catch { toast('Não foi possível adicionar.', { tone: 'error' }) }
  }

  return (
    <Modal title={`Adicionar livros · ${shelf.name}`} onClose={onClose} footer={<Button variant="primary" onClick={onClose}>Pronto{added.length ? ` (${added.length})` : ''}</Button>}>
      <div className="ds-stack">
        <Input aria-label="Buscar livro" placeholder="Buscar por título ou autor" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="ds-list">
          {outside.map((b) => (
            <button key={b.id} type="button" className="ds-lrow" onClick={() => void add(b)}>
              <span className="ds-lead"><Icon name="add" size={18} /></span>
              <span className="ds-t"><b>{b.title}</b>{b.author && <span>{b.author}</span>}</span>
            </button>
          ))}
          {outside.length === 0 && <p className="ds-hint">{q ? 'Nada com esse título.' : 'Todos os livros já estão nesta estante.'}</p>}
        </div>
      </div>
    </Modal>
  )
}

export function ShelfView({ id }: { id: string }) {
  const frieren = useFrieren()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(false)
  const shelf = frieren.shelves.find((s) => s.id === id)

  // Estante que não existe (link velho, excluída): volta para a grade, como o shell antigo fazia.
  if (!shelf) {
    return (
      <Page>
        <EmptyState icon="shelf" title="Estante não encontrada" hint="Ela pode ter sido excluída." action={<Button icon="left" onClick={() => frieren.goto('shelves')}>Ver estantes</Button>} />
      </Page>
    )
  }

  const inside = frieren.books.filter((b) => b.shelves.includes(shelf.id))
  const t = toneStyle(shelf.accent)

  const takeOut = async (b: Book) => {
    const ok = await confirm({ title: `Tirar “${b.title}” desta estante?`, body: 'O livro continua na biblioteca.', confirmLabel: 'Tirar' })
    if (!ok) return
    try {
      await frierenApi.removeFromShelf(shelf.id, b.id)
      frieren.reload()
      toast(`Saiu de ${shelf.name}`, { undo: () => { frierenApi.addToShelf(shelf.id, b.id).then(frieren.reload).catch(() => toast('Não foi possível desfazer.', { tone: 'error' })) } })
    } catch { toast('Não foi possível tirar o livro.', { tone: 'error' }) }
  }

  return (
    <Page wide className={`fr-dens-${frieren.prefs.density}`}>
      <div className={cx('fr-shelfhead', t.neutral && 'fr-sh-neutral')} style={t.style}>
        <Button variant="ghost" size="sm" icon="left" onClick={() => frieren.goto('shelves')}>Estantes</Button>
        <span className="fr-shelf-bar" />
        <h2 className="fr-shelfname">{shelf.name}</h2>
        {shelf.description && <p className="fr-shelf-d">{shelf.description}</p>}
        <div className="ds-inline fr-wrap">
          <Button variant="primary" icon="add" onClick={() => setAdding(true)}>Adicionar livros</Button>
          <Button icon="edit" onClick={() => setEditing(true)}>Editar</Button>
          <Button icon="delete" onClick={() => void removeShelf(shelf, frieren.books, frieren.reload, () => frieren.goto('shelves'))}>Excluir</Button>
        </div>
      </div>
      {inside.length === 0
        ? <EmptyState icon="book" title="Estante vazia" hint="Adicione livros da sua biblioteca a esta estante." action={<Button variant="primary" icon="add" onClick={() => setAdding(true)}>Adicionar livros</Button>} />
        : (
          <div className="ds-grid-poster">
            {inside.map((b, i) => (
              <div key={b.id} className="fr-inshelf">
                <BookCard book={b} index={i} />
                <IconButton className="fr-takeout" icon="close" label={`Tirar ${b.title} da estante`} size={15} onClick={() => void takeOut(b)} />
              </div>
            ))}
          </div>
        )}
      {adding && <AddBooks shelf={shelf} onClose={() => setAdding(false)} />}
      {editing && <ShelfForm shelf={shelf} onClose={() => setEditing(false)} />}
    </Page>
  )
}
