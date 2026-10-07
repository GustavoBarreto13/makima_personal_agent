// Página do livro (DetailPage do DS). Cabeçalho com capa, situação, gênero e nota; ações: registrar leitura,
// curtir, trocar a situação (os 7 status, com "Desfazer"), estantes, e o menu ⋯ (editar, vitrine, excluir).
// Abas: Visão geral (sinopse, resenha editável na própria página, ficha), Diário (as sessões deste livro,
// com editar/excluir) e Marcações (trechos coloridos).

import { useState } from 'react'
import {
  Button, Chip, DetailPage, EmptyState, ErrorState, Field, hueFromName, Icon, IconButton, InfoRow, LoadingState, Menu, Page,
  ProgressBar, SectionHeader, StatusChip, Tag, Textarea, type MenuItem,
} from '../../../design'
import { fmtDate, fmtMoney } from '../../../design/core/format'
import { confirm } from '../../../design/headless/confirm'
import { toast } from '../../../design/headless/toast'
import { BookForm } from '../components/BookForm'
import { BookMarks } from '../components/BookMarks'
import { SessionEditor } from '../components/SessionEditor'
import { ShelfPicker } from '../components/ShelfPicker'
import { useFrieren } from '../context'
import { frierenApi } from '../frierenApi'
import { domainOf, normalizeBook, normalizeUrl } from '../lib/normalize'
import { deleteSession } from '../lib/sessions'
import { STATUS, STATUS_ORDER } from '../lib/status'
import { useLoad } from '../lib/useLoad'
import type { ApiHistoryLog, Book, BookStatus, Session } from '../types'

const MAX_FAVORITES = 4

/** Sessões do histórico no formato do Diário (para reaproveitar o editor e o excluir com "Desfazer"). */
export function toSessions(logs: ApiHistoryLog[], book: Book): Session[] {
  return [...logs].reverse().map((l) => {
    const page = l.page_end ?? 0
    const kind: Session['kind'] = book.finished && l.date.slice(0, 10) === book.finished ? 'finished' : (l.page_start ?? 0) <= 1 ? 'started' : 'progress'
    return { id: l.id, date: l.date.slice(0, 10), bookId: book.id, title: book.title, author: book.author, pages: l.pages_read ?? 0, page, note: l.session_notes ?? '', kind }
  })
}

/** Resenha editável na própria página (o editor inline do shell antigo): Ctrl+Enter salva, Esc cancela. */
function Review({ book }: { book: Book }) {
  const frieren = useFrieren()
  const [draft, setDraft] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (draft === null) return
    setSaving(true)
    try {
      // Esvaziar apaga a resenha (antes um texto vazio não tinha como ser gravado).
      await frierenApi.updateMetadata(book.id, draft.trim() ? { notes: draft.trim() } : { clear: ['notes'] })
      frieren.reload()
      toast(draft.trim() ? 'Resenha salva' : 'Resenha apagada', { tone: 'success' })
      setDraft(null)
    } catch { toast('Não foi possível salvar a resenha.', { tone: 'error' }) }
    setSaving(false)
  }

  if (draft !== null) {
    return (
      <div className="ds-stack" onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); void save() }
        if (e.key === 'Escape') { e.preventDefault(); setDraft(null) }
      }}>
        <Field label="Resenha" hint="Ctrl+Enter salva · Esc cancela">
          {(a) => <Textarea {...a} rows={8} autoFocus value={draft} placeholder="O que esse livro deixou em você?" onChange={(e) => setDraft(e.target.value)} />}
        </Field>
        <div className="ds-inline">
          <Button variant="primary" icon="check" kbd="Ctrl+↵" disabled={saving} onClick={() => void save()}>Salvar resenha</Button>
          <Button variant="ghost" onClick={() => setDraft(null)}>Cancelar</Button>
        </div>
      </div>
    )
  }
  if (!book.review) {
    return (
      <button type="button" className="fr-review-empty" onClick={() => setDraft('')}>
        <Icon name="review" size={18} /> Escrever uma resenha
      </button>
    )
  }
  return (
    <div className="ds-stack">
      <button type="button" className="fr-review" title="Clique para editar" onClick={() => setDraft(book.review)}>{book.review}</button>
      <div><Button size="sm" variant="ghost" icon="edit" onClick={() => setDraft(book.review)}>Editar resenha</Button></div>
    </div>
  )
}

export function BookDetail({ id }: { id: string }) {
  const frieren = useFrieren()
  const { state, retry } = useLoad(async () => {
    const [detail, logs, favorites] = await Promise.all([
      frierenApi.detail(id),
      frierenApi.history(id).catch(() => [] as ApiHistoryLog[]),
      frierenApi.favorites().catch(() => null),
    ])
    return { detail, logs, favorites }
  }, [id, frieren.rev])
  const [tab, setTab] = useState('geral')
  const [menu, setMenu] = useState<'more' | 'status' | null>(null)
  const [dialog, setDialog] = useState<'edit' | 'shelves' | null>(null)
  const [editing, setEditing] = useState<Session | null>(null)

  const back = () => frieren.goto('catalog')
  if (state.status === 'loading') return <Page><LoadingState variant="card" count={2} /></Page>
  if (state.status === 'error') {
    return (
      <Page>
        <ErrorState title="Não foi possível abrir o livro" hint="Ele pode ter sido excluído, ou a conexão falhou." onRetry={retry} />
        <div><Button icon="left" onClick={back}>Voltar para a Biblioteca</Button></div>
      </Page>
    )
  }

  const { detail, logs, favorites } = state.data
  // O catálogo do shell traz a última leitura; o detalhe traz a sinopse. Junta os dois.
  const listed = frieren.books.find((b) => b.id === id)
  const book: Book = { ...normalizeBook({ ...detail, last_read: listed?.lastRead ?? null }), page: listed?.page ?? detail.current_page ?? 0, progress: listed?.progress ?? null }
  const sessions = toSessions(logs, book)
  const favIds = favorites?.map((f) => f.id) ?? []
  const isFav = favIds.includes(book.id)
  const meta = STATUS[book.status]

  const changeStatus = async (next: BookStatus) => {
    if (next === book.status) return
    const prev = book.status
    try {
      await frierenApi.setStatus(book.id, next)
      frieren.reload()
      toast(`${book.title}: ${STATUS[next].label}`, {
        tone: 'success',
        undo: () => { frierenApi.setStatus(book.id, prev).then(frieren.reload).catch(() => toast('Não foi possível desfazer.', { tone: 'error' })) },
      })
    } catch { toast('Não foi possível mudar a situação.', { tone: 'error' }) }
  }

  const toggleLike = async () => {
    const next = !book.liked
    try {
      await frierenApi.like(book.id, next)
      frieren.reload()
      toast(next ? 'Curtido' : 'Curtida removida', { undo: () => { void frierenApi.like(book.id, !next).then(frieren.reload) } })
    } catch { toast('Não foi possível curtir agora.', { tone: 'error' }) }
  }

  const toggleFavorite = async () => {
    if (!favorites) return
    if (!isFav && favIds.length >= MAX_FAVORITES) { toast(`A vitrine já tem ${MAX_FAVORITES} livros. Tire um no Início para abrir espaço.`); return }
    const next = isFav ? favIds.filter((x) => x !== book.id) : [...favIds, book.id]
    try {
      await frierenApi.setFavorites(next)
      frieren.reload()
      toast(isFav ? 'Saiu da vitrine' : 'Entrou na vitrine de favoritos', { tone: 'success', undo: () => { void frierenApi.setFavorites(favIds).then(frieren.reload) } })
    } catch { toast('Não foi possível mudar a vitrine.', { tone: 'error' }) }
  }

  const remove = async () => {
    const ok = await confirm({
      title: `Excluir “${book.title}”?`,
      body: 'O livro sai da biblioteca, das estantes e das estatísticas. Você pode desfazer logo em seguida.',
      confirmLabel: 'Excluir',
      danger: true,
    })
    if (!ok) return
    try {
      await frierenApi.delete(book.id)
      frieren.reload()
      back()
      toast('Livro excluído', { undo: () => { frierenApi.restore(book.id).then(frieren.reload).catch(() => toast('Não foi possível desfazer.', { tone: 'error' })) } })
    } catch { toast('Não foi possível excluir o livro.', { tone: 'error' }) }
  }

  const moreItems: MenuItem[] = [
    { id: 'edit', label: 'Editar dados', onSelect: () => setDialog('edit') },
    { id: 'fav', label: isFav ? 'Tirar da vitrine de favoritos' : 'Pôr na vitrine de favoritos', disabled: !favorites, onSelect: () => { void toggleFavorite() } },
    { id: 'delete', label: 'Excluir livro', onSelect: () => { void remove() } },
  ]
  const statusItems: MenuItem[] = STATUS_ORDER.map((s) => ({ id: s, label: STATUS[s].label, checked: s === book.status, onSelect: () => { void changeStatus(s) } }))

  const bookShelves = frieren.shelves.filter((s) => book.shelves.includes(s.id))
  // Ficha do livro: só as linhas que têm valor.
  const facts = [
    book.pages ? { title: 'Páginas', value: book.page ? `${book.page} de ${book.pages}` : String(book.pages) } : null,
    book.started ? { title: 'Comecei em', value: fmtDate(book.started) } : null,
    book.finished ? { title: 'Terminei em', value: fmtDate(book.finished) } : null,
    book.abandoned ? { title: 'Abandonei em', value: fmtDate(book.abandoned) } : null,
    book.addedAt ? { title: 'Na biblioteca desde', value: fmtDate(book.addedAt) } : null,
    book.genres.length ? { title: book.genres.length > 1 ? 'Gêneros' : 'Gênero', value: book.genres.join(', ') } : null,
    book.language ? { title: 'Idioma', value: book.language } : null,
    book.year ? { title: 'Publicado em', value: String(book.year) } : null,
    book.isbn ? { title: 'ISBN', value: book.isbn } : null,
    book.price != null ? { title: 'Preço', value: fmtMoney(book.price) } : null,
  ].filter((x): x is { title: string; value: string } => !!x)

  return (
    <Page>
      <DetailPage
        backLabel="Biblioteca"
        onBack={back}
        title={book.title}
        subtitle={[book.author, book.year].filter(Boolean).join(' · ') || undefined}
        chips={
          <>
            {meta.tone ? <StatusChip status={meta.tone} label={meta.label} /> : <Tag>{meta.label}</Tag>}
            {book.genres.slice(0, 3).map((g) => <Tag key={g}>{g}</Tag>)}
          </>
        }
        rating={book.status === 'lido' ? book.rating : undefined}
        image={book.coverUrl}
        icon="book"
        hue={hueFromName(book.title)}
        tab={tab}
        onTab={setTab}
        actions={
          <>
            <Button variant="primary" icon="add" onClick={() => frieren.openLog({ bookId: book.id })}>Registrar leitura</Button>
            <Chip on={book.liked} icon="heart" aria-pressed={book.liked} onClick={() => void toggleLike()}>Curti</Chip>
            <span className="fr-menu">
              <Button icon={meta.icon} iconRight="down" aria-haspopup="menu" aria-expanded={menu === 'status'} onClick={() => setMenu(menu === 'status' ? null : 'status')}>{meta.label}</Button>
              {menu === 'status' && <Menu label="Mudar a situação" items={statusItems} onClose={() => setMenu(null)} />}
            </span>
            <Button icon="shelf" onClick={() => setDialog('shelves')}>Estantes</Button>
            <span className="fr-menu">
              <IconButton icon="more" label="Mais ações do livro" onClick={() => setMenu(menu === 'more' ? null : 'more')} />
              {menu === 'more' && <Menu label="Ações do livro" items={moreItems} onClose={() => setMenu(null)} />}
            </span>
          </>
        }
        tabs={[
          {
            id: 'geral', label: 'Visão geral',
            content: (
              <>
                {book.status === 'lendo' && book.progress !== null && (
                  <section className="ds-card fr-pad">
                    <ProgressBar value={book.progress * 100} label={`${Math.round(book.progress * 100)}% lido · página ${book.page} de ${book.pages}`} />
                  </section>
                )}
                <section className="ds-card fr-pad"><p className="fr-synopsis">{detail.description || 'Sem sinopse. Use “Editar dados” para escrever uma.'}</p></section>
                <div className="fr-split">
                  <section aria-labelledby="fr-resenha">
                    <SectionHeader title="Resenha" id="fr-resenha" />
                    <Review book={book} />
                  </section>
                  <section aria-labelledby="fr-ficha">
                    <SectionHeader title="Ficha" id="fr-ficha" />
                    <div className="ds-list">{facts.map((f) => <InfoRow key={f.title} title={f.title} value={f.value} />)}</div>
                    {book.storeUrl && (
                      <a className="fr-store fr-store-block" href={normalizeUrl(book.storeUrl)} target="_blank" rel="noopener noreferrer">
                        <Icon name="store" size={14} /> Comprar em {domainOf(book.storeUrl)} <Icon name="forward" size={13} />
                      </a>
                    )}
                    <div className="ds-inline fr-wrap fr-shelfchips">
                      {bookShelves.map((s) => (
                        <Chip key={s.id} icon="shelf" onClick={() => frieren.goto({ view: 'shelves', shelfId: s.id })}>{s.name}</Chip>
                      ))}
                      <Chip icon="add" onClick={() => setDialog('shelves')}>{bookShelves.length ? 'Estantes' : 'Pôr numa estante'}</Chip>
                    </div>
                  </section>
                </div>
              </>
            ),
          },
          {
            id: 'diario', label: `Diário${sessions.length ? ` (${sessions.length})` : ''}`,
            content: sessions.length === 0
              ? <EmptyState icon="days" title="Nenhuma sessão ainda" hint="Registre até onde você leu para acompanhar o ritmo deste livro." action={<Button variant="primary" icon="add" onClick={() => frieren.openLog({ bookId: book.id })}>Registrar leitura</Button>} />
              : (
                <div className="ds-list">
                  {sessions.map((s) => (
                    <div key={s.id} className="ds-lrow fr-srow">
                      <span className="ds-lead"><Icon name={s.kind === 'finished' ? 'finished' : s.kind === 'started' ? 'book' : 'page'} size={18} /></span>
                      <span className="ds-t">
                        <b>{fmtDate(s.date)}</b>
                        <span>{s.kind === 'finished' ? 'Terminou' : `+${s.pages} ${s.pages === 1 ? 'página' : 'páginas'}`} · até a página {s.page}</span>
                        {s.note && <span className="fr-srev">{s.note}</span>}
                      </span>
                      <span className="fr-sact">
                        <IconButton icon="edit" label={`Editar sessão de ${fmtDate(s.date)}`} size={16} onClick={() => setEditing(s)} />
                        <IconButton icon="delete" label={`Excluir sessão de ${fmtDate(s.date)}`} size={16} onClick={() => void deleteSession(s, frieren.reload)} />
                      </span>
                    </div>
                  ))}
                </div>
              ),
          },
          { id: 'marcas', label: 'Marcações', content: <BookMarks bookId={book.id} /> },
        ]}
      />
      {dialog === 'edit' && <BookForm book={detail} onClose={() => setDialog(null)} />}
      {dialog === 'shelves' && <ShelfPicker book={book} onClose={() => setDialog(null)} />}
      {editing && <SessionEditor key={editing.id} session={editing} onClose={() => setEditing(null)} />}
    </Page>
  )
}
