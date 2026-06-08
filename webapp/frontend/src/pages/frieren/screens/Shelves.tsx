// Tela de estantes — exibe a grade de todas as estantes do usuário.
// Quando shelfParam está definido, exibe os livros de uma estante específica.
// Reutiliza o mesmo componente para as views "listas" e "estante" do shell.

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
}

// ── GRADE DE ESTANTES ──────────────────────────────────────────────────────────
// Exibe todas as estantes em cartões com miniaturas de capas

function ShelfGrid({
  books,
  shelves,
  navigate,
}: {
  books: Book[]
  shelves: Shelf[]
  navigate: (view: string, param?: string | null) => void
}) {
  return (
    <div className="page">
      <div className="section-head" style={{ marginTop: 32 }}>
        <h2 className="section-title" style={{ fontSize: 28 }}>Estantes</h2>
        <span className="section-sub">coleções que você organizou</span>
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
            Nenhuma estante criada ainda.
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
}: {
  shelf: Shelf
  books: Book[]
  navigate: (view: string, param?: string | null) => void
}) {
  // Filtra os livros que pertencem a esta estante
  const shelfBooks = books.filter(b => b.shelves.includes(shelf.id))

  return (
    <div className="page">
      {/* Botão voltar para a grade de estantes */}
      <button className="detail-back" onClick={() => navigate('listas')}>
        <Icon name="arrowLeft" /> Estantes
      </button>

      {/* Cabeçalho da estante com barra de cor e nome */}
      <div style={{ marginTop: 18 }}>
        {/* Barra colorida de identidade da estante */}
        <div
          className="shelf-accent-bar"
          style={{ background: shelf.accent, width: 40, height: 4 }}
        />

        {/* Nome da estante em Newsreader grande */}
        <h1 className="detail-title" style={{ fontSize: 38, marginTop: 8 }}>
          {shelf.name}
        </h1>

        {/* Descrição da estante */}
        {shelf.desc && (
          <p className="shelf-desc" style={{ fontSize: 15, maxWidth: '54ch' }}>
            {shelf.desc}
          </p>
        )}

        {/* Contagem de livros */}
        <div className="shelf-count">
          {shelfBooks.length} {shelfBooks.length === 1 ? 'livro' : 'livros'}
        </div>
      </div>

      {/* Grade de capas — mesma estrutura do Catalog */}
      <div className="cover-grid" style={{ marginTop: 28 }}>
        {shelfBooks.map(b => (
          <a
            key={b.id}
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
        ))}
      </div>

      {/* Estado vazio da estante */}
      {shelfBooks.length === 0 && (
        <p style={{ color: 'var(--ink-3)', marginTop: 40, textAlign: 'center' }}>
          Nenhum livro nesta estante ainda.
        </p>
      )}
    </div>
  )
}

// ── COMPONENTE PRINCIPAL ───────────────────────────────────────────────────────
// Escolhe entre ShelfGrid e ShelfView com base no shelfParam

export function Shelves({ books, shelves, navigate, shelfParam }: ShelvesProps) {
  // Se shelfParam for null, exibe a grade de todas as estantes
  if (!shelfParam) {
    return <ShelfGrid books={books} shelves={shelves} navigate={navigate} />
  }

  // Busca a estante pelo ID
  const shelf = shelves.find(s => s.id === shelfParam)

  // Se a estante não for encontrada (ID inválido), volta para a grade
  if (!shelf) {
    return <ShelfGrid books={books} shelves={shelves} navigate={navigate} />
  }

  // Exibe os livros da estante selecionada
  return <ShelfView shelf={shelf} books={books} navigate={navigate} />
}
