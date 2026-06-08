// Tela de resenhas — exibe todos os livros que têm texto de resenha.
// Cada cartão mostra capa, título, avaliação e trecho da resenha.

import type { Book } from '../types'
import { Cover } from '../ui/Cover'
import { Stars } from '../ui/Stars'

// Props recebidas da FrierenShell
interface ReviewsProps {
  books: Book[]
  navigate: (view: string, param?: string | null) => void
}

// Componente principal da tela de resenhas
export function Reviews({ books, navigate }: ReviewsProps) {
  // Filtra apenas os livros que têm texto de resenha (não nulo e não vazio)
  // e os ordena do mais recentemente terminado ao mais antigo
  const reviewed = books
    .filter(b => b.review && b.review.trim().length > 0)
    .sort((a, b) => (b.finished ?? '').localeCompare(a.finished ?? ''))

  return (
    <div className="page">

      {/* ── CABEÇALHO ── */}
      <div className="section-head" style={{ marginTop: 32 }}>
        <h2 className="section-title" style={{ fontSize: 28 }}>Resenhas</h2>
        <span className="section-sub">
          {reviewed.length} {reviewed.length === 1 ? 'livro com nota sua' : 'livros com notas suas'}
        </span>
      </div>

      {/* ── GRADE DE CARTÕES DE RESENHA ── */}
      {/* Cada cartão é clicável e navega para o detalhe do livro */}
      <div className="review-grid">
        {reviewed.map(b => (
          <div
            key={b.id}
            className="review-card"
            onClick={() => navigate('detalhe', b.id)}
            style={{ cursor: 'pointer' }}
          >
            {/* Capa menor do livro no lado esquerdo do cartão */}
            <Cover book={b} />

            {/* Corpo direito: título, avaliação e texto da resenha */}
            <div className="review-body">
              {/* Título em Newsreader */}
              <div className="review-title">{b.title}</div>

              {/* Linha de avaliação: estrelas + número */}
              {b.rating != null && (
                <div className="cm-row" style={{
                  marginTop: 6,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}>
                  <Stars value={b.rating} />
                  <span className="rating-num">{b.rating.toFixed(1)}</span>
                </div>
              )}

              {/* Trecho da resenha em itálico */}
              {/* O texto é truncado visualmente pelo CSS (line-clamp ou overflow) */}
              <p className="review-text">"{b.review}"</p>
            </div>
          </div>
        ))}
      </div>

      {/* Estado vazio — quando nenhum livro tem resenha */}
      {reviewed.length === 0 && (
        <p style={{
          color: 'var(--ink-3)',
          fontStyle: 'italic',
          fontFamily: 'var(--serif)',
          marginTop: 40,
          textAlign: 'center',
          fontSize: 18,
        }}>
          Nenhuma resenha ainda — registre uma leitura e deixe sua nota.
        </p>
      )}
    </div>
  )
}
