// Modal de edição completa de um livro — permite alterar TODOS os campos da
// página do livro de uma vez (capa, título, autor, gênero, ano, páginas, ISBN,
// idioma, descrição, status, nota, datas de início/fim, resenha, link e preço).
//
// Ao abrir, busca o detalhe completo do livro (GET /api/books/{id}, que faz
// SELECT * e traz campos que a listagem não retorna — description, language,
// price). Ao salvar, envia só os campos alterados via PATCH /metadata e, se o
// status mudou, também PATCH /status (que preserva a lógica de date_started).

import { useState, useEffect, useCallback } from 'react'
import { booksApi } from '../../lib/api'
import type { ApiBookDetail } from '../../lib/api'
import { Icon } from './ui/Icons'

// ── Helper de data local (UTC-3) ──────────────────────────────────────────────
// Retorna hoje em YYYY-MM-DD usando horário LOCAL. Não usamos toISOString()
// porque ele retorna UTC — perto da meia-noite devolve o dia errado no Brasil.
function todayISO(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm   = String(d.getMonth() + 1).padStart(2, '0')
  const dd   = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

// Estrela preenchida do seletor de nota (mesmo path do StarShape do LogModal)
function StarShape() {
  return (
    <svg viewBox="0 0 24 24">
      <path
        d="M12 2.5l2.95 5.98 6.6.96-4.77 4.65 1.13 6.57L12 17.55l-5.9 3.1 1.13-6.57L2.46 9.44l6.6-.96z"
        fill="currentColor"
      />
    </svg>
  )
}

// Opções de status — value bate com o backend (pt-BR); label é o texto exibido.
const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'lendo',      label: 'Lendo agora' },
  { value: 'lido',       label: 'Lido' },
  { value: 'quero_ler',  label: 'Quero ler' },
  { value: 'pausado',    label: 'Pausado' },
  { value: 'abandonado', label: 'Abandonado' },
  { value: 'wishlist',   label: 'Wishlist' },
  { value: 'estante',    label: 'Estante' },
]

// Props do modal
interface EditBookModalProps {
  // ID do livro a editar (null = modal fechado)
  bookId: string | null
  // Fecha o modal sem salvar
  onClose: () => void
  // Chamado após salvar com sucesso — o shell re-sincroniza os dados e mostra toast
  onSaved: () => void | Promise<void>
}

// Estado do formulário — todos os campos como string para simplificar os inputs
// (a conversão para número/null acontece só no momento de montar o payload).
interface FormState {
  cover_url: string
  title: string
  author: string
  genre: string
  published_year: string
  total_pages: string
  isbn: string
  language: string
  description: string
  status: string
  rating: number | null
  date_started: string
  date_finished: string
  notes: string
  store_url: string
  price: string
}

// Converte o detalhe vindo do backend no estado do formulário (null → '').
function detailToForm(b: ApiBookDetail): FormState {
  return {
    cover_url:      b.cover_url ?? '',
    title:          b.title ?? '',
    author:         b.author ?? '',
    genre:          b.genre ?? '',
    published_year: b.published_year != null ? String(b.published_year) : '',
    total_pages:    b.total_pages != null ? String(b.total_pages) : '',
    isbn:           b.isbn ?? '',
    language:       b.language ?? '',
    description:    b.description ?? '',
    status:         b.status ?? 'quero_ler',
    rating:         b.rating,
    date_started:   b.date_started ?? '',
    date_finished:  b.date_finished ?? '',
    notes:          b.notes ?? '',
    store_url:      b.store_url ?? '',
    price:          b.price != null ? String(b.price) : '',
  }
}

/**
 * Modal de edição completa de um livro.
 */
export function EditBookModal({ bookId, onClose, onSaved }: EditBookModalProps) {
  // Detalhe original carregado do backend — base para detectar o que mudou
  const [orig, setOrig]     = useState<ApiBookDetail | null>(null)
  const [form, setForm]     = useState<FormState | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [erro, setErro]       = useState('')

  // Busca o detalhe do livro sempre que o modal abre com um bookId
  useEffect(() => {
    if (!bookId) { setOrig(null); setForm(null); setErro(''); return }
    let cancelado = false
    setLoading(true)
    setErro('')
    booksApi.getDetail(bookId)
      .then(res => {
        if (cancelado) return
        setOrig(res.book)
        setForm(detailToForm(res.book))
      })
      .catch(() => { if (!cancelado) setErro('Não foi possível carregar o livro.') })
      .finally(() => { if (!cancelado) setLoading(false) })
    // Cancela a atualização de estado se o modal fechar antes da resposta chegar
    return () => { cancelado = true }
  }, [bookId])

  // Esc fecha o modal (só quando aberto e não salvando)
  useEffect(() => {
    if (!bookId) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [bookId, saving, onClose])

  // Helper para atualizar um campo do formulário
  const set = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(prev => (prev ? { ...prev, [key]: value } : prev))
  }, [])

  // Monta o payload de metadados só com os campos que mudaram e salva
  const doSave = useCallback(async () => {
    if (!orig || !form) return

    // Título é obrigatório — não deixa salvar vazio
    if (!form.title.trim()) { setErro('O título não pode ficar vazio.'); return }

    // Normaliza strings numéricas/vazias para o tipo esperado pelo backend
    const num = (s: string): number | undefined => {
      const t = s.trim()
      if (t === '') return undefined
      const n = Number(t)
      return Number.isFinite(n) ? n : undefined
    }

    // payload de metadados: só inclui um campo se o novo valor difere do original
    const payload: Record<string, unknown> = {}
    const putStr = (key: keyof ApiBookDetail, value: string) => {
      const before = (orig[key] ?? '') as string | number
      if (String(before) !== value) payload[key] = value
    }

    putStr('title',       form.title.trim())
    putStr('author',      form.author.trim())
    putStr('genre',       form.genre.trim())
    putStr('isbn',        form.isbn.trim())
    putStr('language',    form.language.trim())
    putStr('description', form.description.trim())
    putStr('cover_url',   form.cover_url.trim())
    putStr('notes',       form.notes.trim())
    putStr('store_url',   form.store_url.trim())
    putStr('date_started',  form.date_started)
    putStr('date_finished', form.date_finished)

    // Campos numéricos — comparados como número; undefined = campo vazio (não envia)
    const py = num(form.published_year)
    if (py !== (orig.published_year ?? undefined)) { if (py !== undefined) payload.published_year = py }
    const tp = num(form.total_pages)
    if (tp !== (orig.total_pages ?? undefined)) { if (tp !== undefined) payload.total_pages = tp }
    const pr = num(form.price)
    if (pr !== (orig.price ?? undefined)) { if (pr !== undefined) payload.price = pr }

    // Nota (rating) — só envia se mudou e não for null (o backend não desfaz nota via metadata)
    if (form.rating != null && form.rating !== orig.rating) payload.rating = form.rating

    setSaving(true)
    setErro('')
    try {
      // 1. Metadados (tudo menos status) — só se houver algo para atualizar
      if (Object.keys(payload).length > 0) {
        await booksApi.updateMetadata(orig.id, payload)
      }
      // 2. Status usa o endpoint dedicado (preserva a lógica de date_started)
      if (form.status !== orig.status) {
        await booksApi.updateStatus(orig.id, form.status)
      }
      // Re-sincroniza no shell e fecha
      await onSaved()
      onClose()
    } catch (e) {
      // Mostra a mensagem de erro do backend (ex.: nota fora de 1–5) sem fechar o modal
      setErro(e instanceof Error ? e.message : 'Erro ao salvar as alterações.')
    } finally {
      setSaving(false)
    }
  }, [orig, form, onSaved, onClose])

  // Modal fechado
  if (!bookId) return null

  return (
    <div
      className="modal-scrim"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose() }}
    >
      <div className="modal modal-edit" role="dialog" aria-label="Editar livro">

        {/* Cabeçalho */}
        <div className="modal-head">
          <span className="modal-title">Editar livro</span>
          <button className="modal-x" onClick={onClose} aria-label="Fechar" disabled={saving}>
            <Icon name="x" />
          </button>
        </div>

        <div className="modal-body modal-edit-body">

          {/* Estado de carregamento / erro de carga */}
          {loading && <p style={{ color: 'var(--ink-3)' }}>Carregando…</p>}
          {!loading && erro && !form && <p style={{ color: 'oklch(0.55 0.18 25)' }}>{erro}</p>}

          {form && (
            <>
              {/* ── CAPA (URL + preview) ── */}
              <div className="modal-field">
                <label className="modal-label">Capa (URL da imagem)</label>
                <div className="edit-cover-row">
                  {/* Preview da capa — imagem real ou placeholder */}
                  {form.cover_url.trim() ? (
                    <img className="edit-cover-preview" src={form.cover_url} alt="Capa" />
                  ) : (
                    <div className="edit-cover-preview edit-cover-empty">sem capa</div>
                  )}
                  <input
                    className="book-search"
                    type="url"
                    placeholder="https://…"
                    value={form.cover_url}
                    onChange={e => set('cover_url', e.target.value)}
                    disabled={saving}
                  />
                </div>
              </div>

              {/* ── TÍTULO ── */}
              <div className="modal-field">
                <label className="modal-label">Título</label>
                <input className="book-search" type="text" value={form.title}
                  onChange={e => set('title', e.target.value)} disabled={saving} />
              </div>

              {/* ── AUTOR ── */}
              <div className="modal-field">
                <label className="modal-label">Autor</label>
                <input className="book-search" type="text" value={form.author}
                  onChange={e => set('author', e.target.value)} disabled={saving} />
              </div>

              {/* ── GÊNERO / ANO (lado a lado) ── */}
              <div className="edit-grid-2">
                <div className="modal-field">
                  <label className="modal-label">Gênero</label>
                  <input className="book-search" type="text" value={form.genre}
                    onChange={e => set('genre', e.target.value)} disabled={saving} />
                </div>
                <div className="modal-field">
                  <label className="modal-label">Ano de publicação</label>
                  <input className="book-search" type="number" value={form.published_year}
                    onChange={e => set('published_year', e.target.value)} disabled={saving} />
                </div>
              </div>

              {/* ── PÁGINAS / ISBN ── */}
              <div className="edit-grid-2">
                <div className="modal-field">
                  <label className="modal-label">Páginas</label>
                  <input className="book-search" type="number" min={0} value={form.total_pages}
                    onChange={e => set('total_pages', e.target.value)} disabled={saving} />
                </div>
                <div className="modal-field">
                  <label className="modal-label">ISBN</label>
                  <input className="book-search" type="text" value={form.isbn}
                    onChange={e => set('isbn', e.target.value)} disabled={saving} />
                </div>
              </div>

              {/* ── IDIOMA / STATUS ── */}
              <div className="edit-grid-2">
                <div className="modal-field">
                  <label className="modal-label">Idioma</label>
                  <input className="book-search" type="text" placeholder="pt, en…" value={form.language}
                    onChange={e => set('language', e.target.value)} disabled={saving} />
                </div>
                <div className="modal-field">
                  <label className="modal-label">Status</label>
                  <select className="book-search" value={form.status}
                    onChange={e => set('status', e.target.value)} disabled={saving}>
                    {STATUS_OPTIONS.map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* ── NOTA (estrelas 1–5) ── */}
              <div className="modal-field">
                <label className="modal-label">Sua nota</label>
                <div className="rate-pick">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button
                      key={n}
                      type="button"
                      className={'star-btn' + (form.rating != null && n <= form.rating ? ' on' : '')}
                      onClick={() => set('rating', n)}
                      disabled={saving}
                      aria-label={`${n} estrelas`}
                    >
                      <StarShape />
                    </button>
                  ))}
                </div>
              </div>

              {/* ── DATAS de início / fim ── */}
              <div className="edit-grid-2">
                <div className="modal-field">
                  <label className="modal-label">Início da leitura</label>
                  <input className="date-input" type="date" max={todayISO()} value={form.date_started}
                    onChange={e => set('date_started', e.target.value)} disabled={saving} />
                </div>
                <div className="modal-field">
                  <label className="modal-label">Fim da leitura</label>
                  <input className="date-input" type="date" max={todayISO()} value={form.date_finished}
                    onChange={e => set('date_finished', e.target.value)} disabled={saving} />
                </div>
              </div>

              {/* ── DESCRIÇÃO (sinopse) ── */}
              <div className="modal-field">
                <label className="modal-label">Descrição</label>
                <textarea className="note-input" value={form.description}
                  onChange={e => set('description', e.target.value)} disabled={saving}
                  placeholder="Sinopse do livro…" />
              </div>

              {/* ── RESENHA (notes) ── */}
              <div className="modal-field">
                <label className="modal-label">Sua resenha</label>
                <textarea className="note-input" value={form.notes}
                  onChange={e => set('notes', e.target.value)} disabled={saving}
                  placeholder="O que você achou do livro…" />
              </div>

              {/* ── LINK DA LOJA / PREÇO ── */}
              <div className="edit-grid-2">
                <div className="modal-field">
                  <label className="modal-label">Link da loja</label>
                  <input className="book-search" type="url" placeholder="https://…" value={form.store_url}
                    onChange={e => set('store_url', e.target.value)} disabled={saving} />
                </div>
                <div className="modal-field">
                  <label className="modal-label">Preço (R$)</label>
                  <input className="book-search" type="number" min={0} step="0.01" value={form.price}
                    onChange={e => set('price', e.target.value)} disabled={saving} />
                </div>
              </div>

              {/* Erro de salvamento (validação do backend) */}
              {erro && <p style={{ color: 'oklch(0.55 0.18 25)', marginTop: 14, fontSize: 13 }}>{erro}</p>}
            </>
          )}
        </div>

        {/* Rodapé */}
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn btn-primary" onClick={doSave} disabled={saving || !form}>
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>

      </div>
    </div>
  )
}
