// Barra inferior "Agora lendo" — exibe o livro em leitura atual com progresso
// e botão de registro rápido. Quando há mais de um livro sendo lido, setas
// permitem ciclar entre eles. Portado do protótipo logmodal.jsx.

import { useState } from 'react'
import type { Book } from './types'
import { Cover } from './ui/Cover'
import { ProgressBar } from './ui/ProgressBar'
import { Icon } from './ui/Icons'

// Props da barra de leitura atual
interface NowBarProps {
  // Livro exibido atualmente na barra (pré-selecionado pelo shell)
  book: Book
  // Lista completa de livros — usada para filtrar os que estão sendo lidos
  books: Book[]
  // Função de navegação interna do shell
  navigate: (view: string, param?: string | null) => void
  // Abre o modal de registro, com o livro pré-selecionado
  openLog: (bookId?: string | null) => void
}

/**
 * Barra fixa na base da tela com informações do livro sendo lido no momento.
 * Mostra capa, título, autor, progresso em páginas e barra visual.
 * Permite trocar de livro quando há múltiplos em leitura simultânea.
 */
export function NowBar({ book, books, navigate, openLog }: NowBarProps) {
  // Filtra apenas os livros com status "lendo" — esses aparecem na barra
  const reading = books.filter(b => b.status === 'reading')

  // Índice do livro atualmente exibido na barra (controla as setas de navegação)
  const [idx, setIdx] = useState(0)

  // Determina qual livro mostrar: usa o índice se houver múltiplos, senão usa o prop book
  const current = reading.length > 0 ? reading[idx % reading.length] : book

  // Se não há livro sendo lido, não renderiza a barra
  if (!current) return null

  // Percentual de progresso para a barra visual (0–1)
  const pct = current.progress ?? 0

  return (
    // Barra horizontal fixa na base — classe CSS do design system
    <div className="nowbar">

      {/* Miniatura da capa — clica para ir ao detalhe do livro */}
      <div
        className="nowbar-cover"
        onClick={() => navigate('detalhe', current.id)}
        style={{ cursor: 'pointer', width: 44, flexShrink: 0 }}
      >
        <Cover book={current} />
      </div>

      {/* Título e autor — clica para ir ao detalhe */}
      <div className="nowbar-info">
        <div
          className="nowbar-title"
          onClick={() => navigate('detalhe', current.id)}
          style={{ cursor: 'pointer' }}
        >
          {current.title}
        </div>
        <div className="nowbar-author">{current.author}</div>
      </div>

      {/* Progresso: página atual → barra → total de páginas */}
      <div className="nowbar-prog">
        {/* Página atual lida */}
        <span className="pg">{current.page ?? '—'}</span>

        {/* Barra de progresso visual */}
        <ProgressBar value={pct} />

        {/* Total de páginas do livro */}
        <span className="pg">{current.pages ?? '—'}</span>
      </div>

      {/* Setas para trocar de livro — só aparecem quando há mais de um em leitura */}
      {reading.length > 1 && (
        <div className="nowbar-switch">
          {/* Seta esquerda: livro anterior na lista */}
          <button
            onClick={() => setIdx(i => (i - 1 + reading.length) % reading.length)}
            aria-label="Livro anterior"
          >
            <Icon name="chevL" />
          </button>
          {/* Seta direita: próximo livro na lista */}
          <button
            onClick={() => setIdx(i => (i + 1) % reading.length)}
            aria-label="Próximo livro"
          >
            <Icon name="chevR" />
          </button>
        </div>
      )}

      {/* Botão de registro rápido — abre o modal com o livro atual pré-selecionado */}
      <div className="nowbar-actions">
        <button
          className="btn btn-primary"
          onClick={() => openLog(current.id)}
          style={{ padding: '9px 16px' }}
        >
          <Icon name="plus" /> Registrar
        </button>
      </div>
    </div>
  )
}
