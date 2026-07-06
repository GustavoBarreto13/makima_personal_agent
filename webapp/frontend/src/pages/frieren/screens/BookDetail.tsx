// Tela de detalhe de um livro — exibe todas as informações do livro:
// capa, metadados, resenha, estantes e diário de leitura específico deste livro.
// Layout em duas colunas: capa fixa à esquerda, informações scrolláveis à direita.

import { useState, useEffect, useCallback } from 'react'
import type { Book, ActivityEntry, Shelf, BulletColor } from '../types'
import { BULLET_COLOR_META } from '../types'
import { Icon } from '../ui/Icons'
import { Cover } from '../ui/Cover'
import { Stars } from '../ui/Stars'
import { ProgressBar } from '../ui/ProgressBar'
// Componente de botões editar/apagar para cada entrada do diário
import { LogActions } from '../ui/LogActions'
import { booksApi } from '../../../lib/api'
import type { ApiBookBullet } from '../../../lib/api'

// Props recebidas da FrierenShell
interface BookDetailProps {
  // ID do livro a exibir
  bookId: string
  books: Book[]
  activity: ActivityEntry[]
  shelves: Shelf[]
  navigate: (view: string, param?: string | null) => void
  openLog: (bookId?: string | null) => void
  // Abre o modal de edição completa do livro (chama o shell)
  onEdit: (bookId: string) => void
  // Remove o livro do catálogo (chama o backend e re-sincroniza no shell)
  onDelete: (bookId: string) => Promise<void>
  // Abre o modal de edição para uma entrada específica do diário
  onEditLog: (entry: ActivityEntry) => void
  // Remove uma entrada do diário (chama o backend e re-sincroniza no shell)
  onDeleteLog: (entry: ActivityEntry) => Promise<void>
}

// Formata data ISO em texto legível (ex.: "3 de Mar 2026")
function fmtDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
                 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  return `${d.getDate()} de ${MESES[d.getMonth()]} ${d.getFullYear()}`
}

// Retorna tempo relativo legível (ex.: "hoje", "ontem", "há 3 dias")
function relDate(iso: string): string {
  const hoje = new Date().toISOString().slice(0, 10)
  if (iso === hoje) return 'hoje'
  const diff = Math.round(
    (new Date(hoje).getTime() - new Date(iso + 'T00:00:00').getTime()) / 86400000
  )
  if (diff === 1) return 'ontem'
  if (diff < 7) return `há ${diff} dias`
  return fmtDate(iso)
}

// Componente principal do detalhe do livro
export function BookDetail({ bookId, books, activity, shelves, navigate, openLog, onEdit, onDelete, onEditLog, onDeleteLog }: BookDetailProps) {
  // Controla a confirmação inline de remoção (dois passos: mostrar → confirmar)
  const [confirmando, setConfirmando] = useState(false)
  // Spinner durante a chamada de remoção ao backend
  const [removendo,   setRemovendo]   = useState(false)

  // Busca o livro pelo ID na lista carregada pelo shell
  const book = books.find(b => b.id === bookId)

  // Estado de erro: livro não encontrado (ID inválido ou removido)
  if (!book) {
    return (
      <div className="page">
        <p style={{ marginTop: 40, color: 'var(--ink-3)' }}>Livro não encontrado.</p>
      </div>
    )
  }

  // Filtra as entradas de atividade específicas deste livro (diário do livro)
  const bookActivity = activity.filter(a => a.bookId === book.id)

  // Estantes que contêm este livro — usadas para exibir chips de estante
  const bookShelves = shelves.filter(s => book.shelves.includes(s.id))

  // Rótulo de status legível para o chip no cabeçalho
  const statusLabel: Record<string, string> = {
    reading:  'Lendo agora',
    read:     'Lido',
    owned:    'Quero ler',
    wishlist: 'Wishlist',
  }

  // Cor do chip de status — verde para lendo, dourado para lido, neutro para os demais
  const statusBg = {
    reading:  'var(--teal)',
    read:     'var(--gold-deep)',
    owned:    'var(--card)',
    wishlist: 'var(--card)',
  }[book.status] ?? 'var(--card)'

  return (
    <div className="page">

      {/* ── BOTÃO VOLTAR ── */}
      <button className="detail-back" onClick={() => navigate('catalogo')}>
        <Icon name="arrowLeft" /> Biblioteca
      </button>

      {/* ── LAYOUT DE DUAS COLUNAS ── */}
      {/* Coluna esquerda: capa sticky + ações | Coluna direita: informações scrolláveis */}
      <div className="detail-hero">

        {/* ── COLUNA ESQUERDA: CAPA E AÇÕES ── */}
        <div className="detail-cover-wrap">
          {/* Capa do livro em tamanho maior */}
          <Cover book={book} />

          {/* Barra de progresso — exibida apenas se o livro estiver sendo lido */}
          {book.status === 'reading' && book.progress != null && (
            <div>
              <div className="rc-prog-meta" style={{ marginBottom: 6 }}>
                <span>pág. {book.page} de {book.pages}</span>
                <span>{Math.round(book.progress * 100)}%</span>
              </div>
              <ProgressBar value={book.progress} />
            </div>
          )}

          {/* Botão principal de registro de leitura */}
          <button
            className="btn btn-primary"
            style={{ justifyContent: 'center' }}
            onClick={() => openLog(book.id)}
          >
            <Icon name="plus" /> Registrar leitura
          </button>

          {/* Edição completa do livro — abre o modal com todos os campos */}
          <button
            className="btn btn-ghost"
            style={{ justifyContent: 'center' }}
            onClick={() => onEdit(book.id)}
          >
            <Icon name="pencil" /> Editar livro
          </button>

          {/* Remoção do livro — confirmação inline em dois passos */}
          {!confirmando ? (
            <button
              className="btn btn-danger"
              style={{ justifyContent: 'center' }}
              onClick={() => setConfirmando(true)}
            >
              <Icon name="x" /> Remover livro
            </button>
          ) : (
            <div className="detail-confirm">
              <span>Remover "{book.title}"?</span>
              <div className="detail-confirm-actions">
                <button
                  className="btn btn-ghost"
                  onClick={() => setConfirmando(false)}
                  disabled={removendo}
                >
                  Cancelar
                </button>
                <button
                  className="btn btn-danger"
                  disabled={removendo}
                  onClick={async () => {
                    setRemovendo(true)
                    try {
                      await onDelete(book.id)  // shell navega para catalogo após remover
                    } finally {
                      setRemovendo(false)
                      setConfirmando(false)
                    }
                  }}
                >
                  {removendo ? 'Removendo…' : 'Confirmar'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── COLUNA DIREITA: INFORMAÇÕES ── */}
        <div className="detail-info">

          {/* Gênero em fonte mono — destaque sutil acima do título */}
          {book.genre && (
            <div className="detail-genre">{book.genre}</div>
          )}

          {/* Título principal em Newsreader (serif) */}
          <h1 className="detail-title">{book.title}</h1>

          {/* Autor e ano de publicação */}
          <p className="detail-author">
            de <b>{book.author}</b>
            {book.year != null && ` · ${book.year}`}
          </p>

          {/* Linha de avaliação: estrelas + número + chip de status */}
          <div className="detail-rating-row">
            {book.rating != null ? (
              <>
                <Stars value={book.rating} lg />
                <span className="rating-num" style={{ fontSize: 14 }}>
                  {book.rating.toFixed(1)}
                </span>
              </>
            ) : (
              <span style={{
                color: 'var(--ink-3)',
                fontStyle: 'italic',
                fontFamily: 'var(--serif)',
              }}>
                Ainda sem nota
              </span>
            )}

            {/* Chip de status com cor contextual */}
            <span
              className="chip active"
              style={{
                cursor: 'default',
                background: statusBg,
                borderColor: ['owned', 'wishlist'].includes(book.status)
                  ? 'var(--line)'
                  : 'transparent',
                color: ['owned', 'wishlist'].includes(book.status) ? 'var(--ink-2)' : '#fff',
              }}
            >
              {statusLabel[book.status] ?? book.status}
            </span>
          </div>

          {/* Grade de metadados: páginas, publicação, gênero, data de término */}
          <div className="detail-meta-grid">
            {book.pages != null && (
              <div className="dm-cell">
                <div className="k">Páginas</div>
                <div className="v">{book.pages}</div>
              </div>
            )}
            {book.year != null && (
              <div className="dm-cell">
                <div className="k">Publicado</div>
                <div className="v">{book.year}</div>
              </div>
            )}
            {book.genre && (
              <div className="dm-cell">
                <div className="k">Gênero</div>
                <div className="v" style={{ fontSize: 13 }}>{book.genre}</div>
              </div>
            )}
            {book.started && (
              <div className="dm-cell">
                <div className="k">Início</div>
                <div className="v" style={{ fontSize: 13 }}>{fmtDate(book.started)}</div>
              </div>
            )}
            {book.finished && (
              <div className="dm-cell">
                <div className="k">Terminado</div>
                <div className="v" style={{ fontSize: 13 }}>{fmtDate(book.finished)}</div>
              </div>
            )}
            {book.status === 'reading' && book.progress != null && (
              <div className="dm-cell">
                <div className="k">Progresso</div>
                <div className="v">{Math.round(book.progress * 100)}%</div>
              </div>
            )}
          </div>

          {/* ── RESENHA PESSOAL ── */}
          <div className="detail-section-title">Sua resenha</div>
          {book.review ? (
            // Texto da resenha em itálico e fonte serif
            <p className="detail-review">{book.review}</p>
          ) : (
            // Estado vazio — mensagem contextual por status
            <p className="detail-empty-review">
              {book.status === 'wishlist'
                ? 'Ele te espera na wishlist.'
                : 'Você ainda não escreveu sobre este livro. Registre uma leitura para começar.'}
            </p>
          )}

          {/* ── MINHAS MARCAÇÕES ── */}
          <BookMarks bookId={book.id} />

          {/* ── ESTANTES ── */}
          {/* Só exibe se o livro pertencer a pelo menos uma estante */}
          {bookShelves.length > 0 && (
            <>
              <div className="detail-section-title">Nas estantes</div>
              <div className="chips">
                {bookShelves.map(s => (
                  // Chip clicável navega para a estante correspondente
                  <button
                    key={s.id}
                    className="chip"
                    onClick={() => navigate('estante', s.id)}
                  >
                    {/* Ponto colorido com a cor da estante */}
                    <span style={{
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      background: s.accent,
                      display: 'inline-block',
                      marginRight: 6,
                    }} />
                    {s.name}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* ── DIÁRIO DESTE LIVRO ── */}
          {/* Histórico de sessões de leitura específicas deste livro */}
          {bookActivity.length > 0 && (
            <>
              <div className="detail-section-title">Diário deste livro</div>
              <div className="feed">
                {bookActivity.map(a => (
                  <div key={a.id} className="feed-item" style={{ paddingLeft: 0 }}>
                    {/* Linha vertical lateral indicando sequência do diário */}
                    <div className="feed-body" style={{
                      borderLeft: '2px solid var(--line)',
                      paddingLeft: 16,
                    }}>
                      <div className="feed-line">
                        {/* Texto descritivo por tipo de entrada */}
                        {a.type === 'finished' ? (
                          <b>Terminou o livro</b>
                        ) : a.type === 'started' ? (
                          <b>Começou a ler</b>
                        ) : (
                          <>
                            <b>+{a.pages} páginas</b>
                            {a.page != null && (
                              <span className="verb"> — até a pág. {a.page}</span>
                            )}
                          </>
                        )}
                      </div>

                      {/* Nota pessoal da sessão, se houver */}
                      {a.note && <div className="feed-note">"{a.note}"</div>}

                      <div className="feed-meta">
                        <span>{relDate(a.date)}</span>
                        {/* Estrelas de avaliação se a entrada tiver nota */}
                        {a.rating != null && <Stars value={a.rating} />}
                      </div>
                    </div>

                    {/* Botões de editar e apagar — aparecem discretamente à direita da entrada */}
                    <LogActions
                      entry={a}
                      onEdit={onEditLog}
                      onDelete={onDeleteLog}
                    />
                  </div>
                ))}
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════════════════
// Seção "Minhas marcações" — bullets coloridos ancorados a um livro
// ═══════════════════════════════════════════════════════════════════════════

// Componente autônomo: carrega as marcações do livro no mount (por bookId),
// permite adicionar (texto + cor + página opcional), editar e apagar.
function BookMarks({ bookId }: { bookId: string }) {
  // Lista de marcações carregadas do backend
  const [bullets, setBullets] = useState<ApiBookBullet[]>([])
  const [loading, setLoading] = useState(true)

  // ── Estado do formulário de nova marcação ────────────────────────────────
  const [newText,  setNewText]  = useState('')
  const [newColor, setNewColor] = useState<BulletColor>('rosa')
  const [newPage,  setNewPage]  = useState('')       // string p/ o input; '' = sem página
  const [adding,   setAdding]   = useState(false)

  // ── Estado de edição inline de uma marcação existente ────────────────────
  const [editId,    setEditId]    = useState<string | null>(null)
  const [editText,  setEditText]  = useState('')
  const [editColor, setEditColor] = useState<BulletColor>('rosa')
  const [editPage,  setEditPage]  = useState('')

  // Carrega as marcações sempre que o livro muda
  useEffect(() => {
    let cancelado = false
    setLoading(true)
    booksApi.listBullets(bookId)
      .then(res => { if (!cancelado) setBullets(res.bullets ?? []) })
      .catch(() => { if (!cancelado) setBullets([]) })
      .finally(() => { if (!cancelado) setLoading(false) })
    return () => { cancelado = true }
  }, [bookId])

  // Converte a string do input de página para número|null
  const pageValue = (s: string): number | null => {
    const t = s.trim()
    if (t === '') return null
    const n = Number(t)
    return Number.isFinite(n) ? n : null
  }

  // ── Adicionar marcação ───────────────────────────────────────────────────
  const addBullet = useCallback(async () => {
    const content = newText.trim()
    if (!content) return
    setAdding(true)
    try {
      const res = await booksApi.createBullet(bookId, {
        content,
        color: newColor,
        page_number: pageValue(newPage),
      })
      // Anexa a marcação retornada e limpa o formulário
      setBullets(prev => [...prev, res.bullet])
      setNewText('')
      setNewPage('')
    } catch {
      // Silencioso — mantém o texto digitado para o usuário tentar de novo
    } finally {
      setAdding(false)
    }
  }, [bookId, newText, newColor, newPage])

  // ── Abrir edição de uma marcação ─────────────────────────────────────────
  const startEdit = (b: ApiBookBullet) => {
    setEditId(b.id)
    setEditText(b.content)
    setEditColor(b.color)
    setEditPage(b.page_number != null ? String(b.page_number) : '')
  }

  // ── Salvar edição ────────────────────────────────────────────────────────
  const saveEdit = useCallback(async () => {
    if (!editId) return
    const content = editText.trim()
    if (!content) return
    try {
      const res = await booksApi.updateBullet(editId, {
        content,
        color: editColor,
        page_number: pageValue(editPage),
      })
      setBullets(prev => prev.map(b => (b.id === editId ? res.bullet : b)))
      setEditId(null)
    } catch {
      // Mantém o editor aberto em caso de falha
    }
  }, [editId, editText, editColor, editPage])

  // ── Apagar marcação (otimista com rollback) ──────────────────────────────
  const removeBullet = useCallback(async (id: string) => {
    const anterior = bullets
    setBullets(prev => prev.filter(b => b.id !== id))
    try {
      await booksApi.deleteBullet(id)
    } catch {
      setBullets(anterior)   // desfaz se o backend falhar
    }
  }, [bullets])

  // Seletor de cores reutilizável (usado no form de adicionar e no de editar)
  const ColorSwatches = ({ value, onPick }: { value: BulletColor; onPick: (c: BulletColor) => void }) => (
    <div className="mk-swatches">
      {BULLET_COLOR_META.map(c => (
        <button
          key={c.key}
          type="button"
          className={'mk-swatch mk-swatch--' + c.key + (value === c.key ? ' sel' : '')}
          title={c.label}
          aria-label={c.label}
          onClick={() => onPick(c.key)}
        />
      ))}
    </div>
  )

  return (
    <>
      <div className="detail-section-title">Minhas marcações</div>

      {/* Lista de marcações existentes */}
      {!loading && bullets.length > 0 && (
        <div className="mk-list">
          {bullets.map(b => (
            editId === b.id ? (
              // ── Modo edição ──
              <div key={b.id} className="mk-edit">
                <textarea
                  className="note-input"
                  value={editText}
                  onChange={e => setEditText(e.target.value)}
                  autoFocus
                />
                <div className="mk-edit-row">
                  <ColorSwatches value={editColor} onPick={setEditColor} />
                  <input
                    className="mk-page-input"
                    type="number"
                    min={0}
                    placeholder="pág."
                    value={editPage}
                    onChange={e => setEditPage(e.target.value)}
                  />
                  <div className="mk-edit-actions">
                    <button className="btn btn-ghost" onClick={() => setEditId(null)}>Cancelar</button>
                    <button className="btn btn-primary" onClick={saveEdit}>Salvar</button>
                  </div>
                </div>
              </div>
            ) : (
              // ── Modo leitura ──
              <div key={b.id} className={'mk-item mk-item--' + b.color}>
                <div className="mk-item-body">
                  <span className="mk-text">{b.content}</span>
                  {b.page_number != null && <span className="mk-page">p. {b.page_number}</span>}
                </div>
                <div className="mk-item-actions">
                  <button className="mk-act" title="Editar" onClick={() => startEdit(b)}>
                    <Icon name="pencil" />
                  </button>
                  <button className="mk-act" title="Apagar" onClick={() => removeBullet(b.id)}>
                    <Icon name="trash" />
                  </button>
                </div>
              </div>
            )
          ))}
        </div>
      )}

      {/* Estado vazio */}
      {!loading && bullets.length === 0 && (
        <p className="detail-empty-review" style={{ marginBottom: 4 }}>
          Nenhuma marcação ainda. Salve seus trechos e anotações abaixo.
        </p>
      )}

      {/* Formulário de nova marcação */}
      <div className="mk-add">
        <textarea
          className="note-input"
          placeholder="Escreva uma marcação, citação ou anotação…"
          value={newText}
          onChange={e => setNewText(e.target.value)}
          onKeyDown={e => {
            // Ctrl/Cmd+Enter adiciona rapidamente
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addBullet()
          }}
        />
        <div className="mk-add-row">
          <ColorSwatches value={newColor} onPick={setNewColor} />
          <input
            className="mk-page-input"
            type="number"
            min={0}
            placeholder="pág."
            value={newPage}
            onChange={e => setNewPage(e.target.value)}
          />
          <button
            className="btn btn-primary"
            style={{ marginLeft: 'auto' }}
            onClick={addBullet}
            disabled={adding || !newText.trim()}
          >
            <Icon name="plus" /> {adding ? 'Salvando…' : 'Adicionar'}
          </button>
        </div>
      </div>
    </>
  )
}
