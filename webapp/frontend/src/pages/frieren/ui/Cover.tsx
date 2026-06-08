// Componente de capa de livro — tipográfica (título + autor em fundo colorido)
// ou fotográfica (imagem real sobreposta quando coverUrl está disponível).
// Portado do protótipo ui.jsx.

import type { Book } from '../types'
import { COVER_PALETTES } from '../coverKey'

// Props do componente Cover
interface CoverProps {
  // Objeto completo do livro (título, autor, status, progresso, etc.)
  book: Book
  // Se true, exibe badge de status ("lendo" ou "quero ler") no canto da capa
  badge?: boolean
  // Se true, exibe barra de progresso na base da capa quando book.progress != null
  progress?: boolean
  // Callback opcional ao clicar na capa — navega para detalhes do livro
  onClick?: () => void
}

// Componente de capa de livro.
// Quando o livro possui coverUrl (imagem real do Google Books), exibe a imagem como overlay absoluto.
// Quando não há imagem, exibe uma capa tipográfica colorida com título e autor.
export function Cover({ book, badge, progress, onClick }: CoverProps) {
  // Obtém a paleta de cor correspondente à chave de capa do livro
  // A coverKey é derivada deterministicamente do ID do livro em coverKey.ts
  const c = COVER_PALETTES[book.coverKey]

  // Calcula o tamanho da fonte do título com base no comprimento do texto
  // Títulos longos recebem fonte menor para caber na área da capa
  const titleSize = book.title.length > 22 ? 16 : book.title.length > 13 ? 19 : 23

  // Verifica se o livro está sendo lido no momento — controla exibição do badge "lendo"
  const showReading = book.status === 'reading'

  return (
    // Container principal da capa — aplica cor de fundo e texto da paleta selecionada
    <div
      className="cover"
      style={{ background: c.bg, color: c.ink }}
      onClick={onClick}
    >
      {/* Filete decorativo interno — cria profundidade visual na capa tipográfica */}
      <div className="c-inner" />

      {/* Badge "lendo" — exibido somente quando badge=true e status=reading */}
      {badge && showReading && (
        <div className="c-badge reading">lendo</div>
      )}

      {/* Badge "quero ler" — exibido somente quando badge=true e status=wishlist */}
      {badge && book.status === 'wishlist' && (
        <div className="c-badge">quero ler</div>
      )}

      {/* Título do livro — tamanho de fonte adaptado ao comprimento do título */}
      <div className="c-title" style={{ fontSize: titleSize, color: c.ink }}>
        {book.title}
      </div>

      {/* Linha separadora entre título e autor */}
      <div className="c-rule" />

      {/* Nome do autor */}
      <div className="c-author" style={{ color: c.ink }}>
        {book.author}
      </div>

      {/* Barra de progresso na base da capa
          Exibida quando: prop progress=true OU livro está sendo lido, E book.progress != null
          A largura da barra interna (i) representa o percentual lido */}
      {(progress || showReading) && book.progress != null && (
        <div className="c-progress">
          <i style={{ width: (book.progress * 100) + '%' }} />
        </div>
      )}

      {/* Overlay de imagem real — cobre toda a capa tipográfica quando coverUrl está disponível
          Posicionamento absoluto para sobrepor todos os elementos tipográficos acima */}
      {book.coverUrl && (
        <img
          src={book.coverUrl}
          alt={book.title}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',  // Cobre o espaço sem distorcer a imagem
          }}
        />
      )}
    </div>
  )
}
