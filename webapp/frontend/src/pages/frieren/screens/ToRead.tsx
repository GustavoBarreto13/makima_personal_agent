// Tela "Quero ler" — lista os livros com status "owned" (já comprado, aguardando leitura).
// Cada item exibe capa, título, autor, gênero e botão para iniciar a leitura.

import React from 'react'
import type { Book } from '../types'
import { Icon } from '../ui/Icons'
import { Cover } from '../ui/Cover'

// Props recebidas da FrierenShell
interface ToReadProps {
  books: Book[]
  navigate: (view: string, param?: string | null) => void
  openLog: (bookId?: string | null) => void
}

// Componente principal da tela "Quero ler"
export function ToRead({ books, navigate, openLog }: ToReadProps) {
  // Filtra apenas os livros que estão na pilha "owned" (comprado, não lido ainda)
  const owned = books.filter(b => b.status === 'owned')

  return (
    <div className="page">

      {/* ── CABEÇALHO ── */}
      <div className="section-head" style={{ marginTop: 32, marginBottom: 0 }}>
        <h2 className="section-title" style={{ fontSize: 28 }}>Quero ler</h2>
        <span className="section-sub">{owned.length} livros na pilha</span>
      </div>

      {/* ── LISTA DE LIVROS ── */}
      <div className="wl-list">
        {owned.map(b => (
          <div key={b.id} className="wl-item">

            {/* Capa clicável — navega para o detalhe do livro */}
            <div
              style={{ flexShrink: 0, cursor: 'pointer' }}
              onClick={() => navigate('detalhe', b.id)}
            >
              <Cover book={b} />
            </div>

            {/* Informações do livro: título, autor + ano, gênero */}
            <div className="wl-info">
              <div
                className="wl-title"
                onClick={() => navigate('detalhe', b.id)}
                style={{ cursor: 'pointer' }}
              >
                {b.title}
              </div>
              <div className="wl-author">
                {b.author}{b.year != null ? ` · ${b.year}` : ''}
              </div>
              {/* Chip de gênero */}
              {b.genre && <span className="wl-genre">{b.genre}</span>}
            </div>

            {/* Ação: iniciar leitura — abre o modal com o livro pré-selecionado */}
            <div className="wl-right" style={{ justifyContent: 'center' }}>
              <button
                className="btn btn-primary"
                style={{ fontSize: 12.5, padding: '9px 18px' }}
                onClick={() => openLog(b.id)}
              >
                <Icon name="open" /> Começar a ler
              </button>
            </div>
          </div>
        ))}

        {/* Estado vazio — mensagem encorajadora quando a pilha está zerada */}
        {owned.length === 0 && (
          <p style={{
            color: 'var(--ink-4)',
            textAlign: 'center',
            padding: '60px 0',
            fontStyle: 'italic',
            fontFamily: 'var(--serif)',
            fontSize: 18,
          }}>
            Sem livros na pilha ainda.
          </p>
        )}
      </div>
    </div>
  )
}
