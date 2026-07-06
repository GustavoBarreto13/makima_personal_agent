// Tela de estantes — exibe a grade de todas as estantes do usuário.
// Quando shelfParam está definido, exibe os livros de uma estante específica.
// Reutiliza o mesmo componente para as views "listas" e "estante" do shell.
//
// Gerenciamento (criar/editar/excluir estante + adicionar/remover livros) é feito
// aqui: o shell passa os callbacks e re-sincroniza os dados após cada mutação.

import { useState } from 'react'
import type { Book, Shelf } from '../types'
import { Icon } from '../ui/Icons'
import { Cover } from '../ui/Cover'
import { Stars } from '../ui/Stars'

// Props recebidas da FrierenShell
interface ShelvesProps {
  books: Book[]
  shelves: Shelf[]
  navigate: (view: string, param?: string | null) => void
  // ID da estante aberta, ou null para exibir a grade de todas as estantes
  shelfParam: string | null
  // Abre o modal de criação de estante
  onCreate: () => void
  // Abre o modal de edição de uma estante existente
  onEdit: (shelf: Shelf) => void
  // Exclui uma estante (backend + re-sync no shell)
  onDelete: (shelfId: string) => Promise<void>
  // Vincula um livro a uma estante
  onAddBook: (bookId: string, shelfId: string) => Promise<void>
  // Desvincula um livro de uma estante
  onRemoveBook: (bookId: string, shelfId: string) => Promise<void>
}

// ── GRADE DE ESTANTES ──────────────────────────────────────────────────────────
// Exibe todas as estantes em cartões com miniaturas de capas

function ShelfGrid({
  books,
  shelves,
  navigate,
  onCreate,
  onEdit,
  onDelete,
}: {
  books: Book[]
  shelves: Shelf[]
  navigate: (view: string, param?: string | null) => void
  onCreate: () => void
  onEdit: (shelf: Shelf) => void
  onDelete: (shelfId: string) => Promise<void>
}) {
  // ID da estante aguardando confirmação de exclusão (null = nenhuma)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  return (
    <div className="page">
      <div className="section-head" style={{ marginTop: 32 }}>
        <div>
          <h2 className="section-title" style={{ fontSize: 28 }}>Estantes</h2>
          <span className="section-sub">coleções que você organizou</span>
        </div>
        {/* Botão de criação — abre o modal de nova estante */}
        <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={onCreate}>
          <Icon name="plus" /> Nova estante
        </button>
      </div>

      {/* Grade responsiva de cartões de estante */}
      <div className="shelf-grid">
        {shelves.map(s => {
          // Livros desta estante — limitado a 5 para as miniaturas de capa
          const shelfBooks = books
            .filter(b => b.shelves.includes(s.id))
            .slice(0, 5)

          // Total real de livros (não truncado) para o contador
          const total = books.filter(b => b.shelves.includes(s.id)).length

          return (
            // Cartão clicável — abre a estante
            <div
              key={s.id}
              className="shelf-card"
              onClick={() => navigate('estante', s.id)}
            >
              {/* Ações de editar/excluir — aparecem no hover, no canto do card.
                  stopPropagation impede que o clique abra a estante. */}
              <div className="shelf-actions" onClick={e => e.stopPropagation()}>
                <button className="shelf-act" title="Editar" onClick={() => onEdit(s)}>
                  <Icon name="pencil" />
                </button>
                <button className="shelf-act" title="Excluir" onClick={() => setConfirmId(s.id)}>
                  <Icon name="trash" />
                </button>
              </div>

              {/* Miniaturas das capas — empilhadas horizontalmente com sobreposição */}
              <div className="shelf-spines">
                {shelfBooks.map((b, i) => (
                  <div
                    key={b.id}
                    style={{
                      // Sobreposição: cada capa desloca 22px à direita da anterior
                      marginRight: i < shelfBooks.length - 1 ? -22 : 0,
                      position: 'relative',
                      zIndex: shelfBooks.length - i,
                      // Tamanho fixo de 64px para as miniaturas da estante
                      width: 64,
                      flexShrink: 0,
                    }}
                  >
                    <Cover book={b} />
                  </div>
                ))}
              </div>

              {/* Barra colorida com a cor da estante — identidade visual */}
              <div
                className="shelf-accent-bar"
                style={{ background: s.accent, height: 3, marginTop: 12 }}
              />

              {/* Nome da estante em Newsreader */}
              <div className="shelf-name">{s.name}</div>

              {/* Descrição opcional da estante */}
              {s.desc && <div className="shelf-desc">{s.desc}</div>}

              {/* Contador de livros */}
              <div className="shelf-count">
                {total} {total === 1 ? 'livro' : 'livros'}
              </div>

              {/* Confirmação inline de exclusão */}
              {confirmId === s.id && (
                <div className="shelf-confirm" onClick={e => e.stopPropagation()}>
                  <span>Excluir "{s.name}"?</span>
                  <div className="shelf-confirm-actions">
                    <button className="btn btn-ghost" onClick={() => setConfirmId(null)}>Cancelar</button>
                    <button
                      className="btn btn-danger"
                      onClick={async () => { await onDelete(s.id); setConfirmId(null) }}
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {/* Estado vazio */}
        {shelves.length === 0 && (
          <p style={{
            color: 'var(--ink-3)',
            fontStyle: 'italic',
            fontFamily: 'var(--serif)',
            marginTop: 32,
          }}>
            Nenhuma estante criada ainda. Clique em "Nova estante" para começar.
          </p>
        )}
      </div>
    </div>
  )
}

// ── ESTANTE ABERTA ─────────────────────────────────────────────────────────────
// Exibe os livros de uma estante específica em grade de capas

function ShelfView({
  shelf,
  books,
  navigate,
  onEdit,
  onDelete,
  onAddBook,
  onRemoveBook,
}: {
  shelf: Shelf
  books: Book[]
  navigate: (view: string, param?: string | null) => void
  onEdit: (shelf: Shelf) => void
  onDelete: (shelfId: string) => Promise<void>
  onAddBook: (bookId: string, shelfId: string) => Promise<void>
  onRemoveBook: (bookId: string, shelfId: string) => Promise<void>
}) {
  // Controla o seletor de "adicionar livros" e a confirmação de exclusão da estante
  const [pickerOpen, setPickerOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Livros dentro e fora desta estante (o "fora" alimenta o seletor)
  const shelfBooks = books.filter(b => b.shelves.includes(shelf.id))
  const outsideBooks = books.filter(b => !b.shelves.includes(shelf.id))

  return (
    <div className="page">
      {/* Botão voltar para a grade de estantes */}
      <button className="detail-back" onClick={() => navigate('listas')}>
        <Icon name="arrowLeft" /> Estantes
      </button>

      {/* Cabeçalho da estante com barra de cor, nome e ações */}
      <div style={{ marginTop: 18 }}>
        {/* Barra colorida de identidade da estante */}
        <div
          className="shelf-accent-bar"
          style={{ background: shelf.accent, width: 40, height: 4 }}
        />

        {/* Linha do título + ações (editar/excluir a estante) */}
        <div className="shelf-view-head">
          <h1 className="detail-title" style={{ fontSize: 38, marginTop: 8 }}>
            {shelf.name}
          </h1>
          <div className="shelf-view-actions">
            <button className="btn btn-ghost" onClick={() => onEdit(shelf)}>
              <Icon name="pencil" /> Editar
            </button>
            {!confirmDelete ? (
              <button className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
                <Icon name="trash" /> Excluir
              </button>
            ) : (
              <>
                <button className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>Cancelar</button>
                <button className="btn btn-danger" onClick={() => onDelete(shelf.id)}>Confirmar</button>
              </>
            )}
          </div>
        </div>

        {/* Descrição da estante */}
        {shelf.desc && (
          <p className="shelf-desc" style={{ fontSize: 15, maxWidth: '54ch' }}>
            {shelf.desc}
          </p>
        )}

        {/* Contagem de livros + botão de adicionar */}
        <div className="shelf-view-meta">
          <div className="shelf-count">
            {shelfBooks.length} {shelfBooks.length === 1 ? 'livro' : 'livros'}
          </div>
          <button className="btn btn-primary" onClick={() => setPickerOpen(true)}>
            <Icon name="plus" /> Adicionar livros
          </button>
        </div>
      </div>

      {/* Grade de capas — mesma estrutura do Catalog, com botão de remover no hover */}
      <div className="cover-grid" style={{ marginTop: 28 }}>
        {shelfBooks.map(b => (
          <div key={b.id} className="shelf-book">
            {/* Botão remover da estante — sobre a capa, no hover */}
            <button
              className="shelf-remove"
              title="Remover da estante"
              onClick={(e) => { e.stopPropagation(); onRemoveBook(b.id, shelf.id) }}
            >
              <Icon name="x" />
            </button>

            <a
              className="cover-link"
              onClick={() => navigate('detalhe', b.id)}
              style={{ cursor: 'pointer', textDecoration: 'none' }}
            >
              <Cover book={b} badge />
              <div className="cover-meta">
                <div className="cm-title">{b.title}</div>
                <div className="cm-author">{b.author}</div>
                <div className="cm-row">
                  {b.rating != null ? (
                    <Stars value={b.rating} />
                  ) : b.status === 'reading' ? (
                    <span className="result-count" style={{ color: 'var(--teal-deep)' }}>
                      {b.progress != null ? Math.round(b.progress * 100) : 0}% lido
                    </span>
                  ) : (
                    <span className="result-count">na wishlist</span>
                  )}
                </div>
              </div>
            </a>
          </div>
        ))}
      </div>

      {/* Estado vazio da estante */}
      {shelfBooks.length === 0 && (
        <p style={{ color: 'var(--ink-3)', marginTop: 40, textAlign: 'center' }}>
          Nenhum livro nesta estante ainda. Use "Adicionar livros" para incluir.
        </p>
      )}

      {/* ── SELETOR DE LIVROS PARA ADICIONAR ── */}
      {pickerOpen && (
        <div
          className="modal-scrim"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setPickerOpen(false) }}
        >
          <div className="modal" role="dialog" aria-label="Adicionar livros à estante">
            <div className="modal-head">
              <span className="modal-title">Adicionar livros</span>
              <button className="modal-x" onClick={() => setPickerOpen(false)} aria-label="Fechar">
                <Icon name="x" />
              </button>
            </div>

            <div className="modal-body">
              <div className="shelf-picker-list">
                {outsideBooks.map(b => (
                  // Ao clicar, vincula o livro; o shell re-sincroniza e o item some da lista
                  <button
                    key={b.id}
                    className="shelf-picker-item"
                    onClick={() => onAddBook(b.id, shelf.id)}
                  >
                    <div style={{ width: 34, flexShrink: 0 }}>
                      <Cover book={b} />
                    </div>
                    <div className="spi-meta">
                      <div className="spi-title">{b.title}</div>
                      <div className="spi-author">{b.author}</div>
                    </div>
                    <Icon name="plus" />
                  </button>
                ))}

                {outsideBooks.length === 0 && (
                  <p style={{ color: 'var(--ink-3)', fontSize: 14, padding: '8px 2px' }}>
                    Todos os seus livros já estão nesta estante.
                  </p>
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setPickerOpen(false)}>Concluir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── COMPONENTE PRINCIPAL ───────────────────────────────────────────────────────
// Escolhe entre ShelfGrid e ShelfView com base no shelfParam

export function Shelves({
  books, shelves, navigate, shelfParam,
  onCreate, onEdit, onDelete, onAddBook, onRemoveBook,
}: ShelvesProps) {
  // Se shelfParam for null, exibe a grade de todas as estantes
  if (!shelfParam) {
    return (
      <ShelfGrid
        books={books}
        shelves={shelves}
        navigate={navigate}
        onCreate={onCreate}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    )
  }

  // Busca a estante pelo ID
  const shelf = shelves.find(s => s.id === shelfParam)

  // Se a estante não for encontrada (ID inválido), volta para a grade
  if (!shelf) {
    return (
      <ShelfGrid
        books={books}
        shelves={shelves}
        navigate={navigate}
        onCreate={onCreate}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    )
  }

  // Exibe os livros da estante selecionada
  return (
    <ShelfView
      shelf={shelf}
      books={books}
      navigate={navigate}
      onEdit={onEdit}
      onDelete={onDelete}
      onAddBook={onAddBook}
      onRemoveBook={onRemoveBook}
    />
  )
}
