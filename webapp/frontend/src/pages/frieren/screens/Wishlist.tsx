// Tela Wishlist — lista os livros desejados (status "wishlist") com suporte a
// salvar/editar links de loja (Amazon, Estante Virtual, etc.) para cada livro.

import React, { useState } from 'react'
import type { Book } from '../types'
import { Icon } from '../ui/Icons'
import { Cover } from '../ui/Cover'
import { booksApi } from '../../lib/api'

// Props recebidas da FrierenShell
interface WishlistProps {
  books: Book[]
  navigate: (view: string, param?: string | null) => void
  openLog: (bookId?: string | null) => void
  // Callback para exibir mensagem de feedback (toast) no shell principal
  onToast: (msg: string) => void
}

// Extrai o domínio de uma URL para exibição compacta (ex.: "amazon.com.br")
function extractDomain(url: string): string {
  try {
    return new URL(url.startsWith('http') ? url : 'https://' + url)
      .hostname.replace('www.', '')
  } catch {
    // Se a URL for inválida, trunca para não ocupar muito espaço
    return url.slice(0, 28)
  }
}

// Normaliza uma URL adicionando "https://" se não tiver protocolo
function normalizeUrl(url: string): string {
  return url.startsWith('http') ? url : 'https://' + url
}

// Componente principal da tela Wishlist
export function Wishlist({ books, navigate, openLog, onToast }: WishlistProps) {
  // Filtra apenas os livros da wishlist
  const wishlist = books.filter(b => b.status === 'wishlist')

  // Estado dos links de loja: mapa bookId → URL salva
  // Inicializado com os links que já vêm do backend
  const [links, setLinks] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {}
    wishlist.forEach(b => {
      if (b.storeLink) m[b.id] = b.storeLink
    })
    return m
  })

  // ID do livro atualmente sendo editado (null = nenhum)
  const [editingId, setEditingId] = useState<string | null>(null)

  // Rascunhos dos inputs de URL enquanto o usuário digita
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  // Inicia edição do link de um livro — abre o input com o valor atual (se houver)
  function startEdit(id: string) {
    setEditingId(id)
    setDrafts(prev => ({ ...prev, [id]: links[id] ?? '' }))
  }

  // Salva o link editado: chama a API e atualiza o estado local
  async function saveLink(id: string) {
    const url = (drafts[id] ?? '').trim()

    try {
      // Envia o novo link para o backend via PATCH
      await booksApi.updateMetadata(id, {
        store_url: url ? normalizeUrl(url) : undefined,
      })

      // Atualiza o estado local com o novo link (ou remove se vazio)
      setLinks(prev => {
        if (!url) {
          // Remove a chave do mapa se o usuário apagou o link
          const next = { ...prev }
          delete next[id]
          return next
        }
        return { ...prev, [id]: normalizeUrl(url) }
      })

      // Fecha o input de edição
      setEditingId(null)

      // Mostra feedback ao usuário
      onToast(url ? 'Link da loja salvo' : 'Link removido')
    } catch {
      // Em caso de erro de rede, mantém o estado anterior silenciosamente
      setEditingId(null)
    }
  }

  return (
    <div className="page">

      {/* ── CABEÇALHO ── */}
      <div className="section-head" style={{ marginTop: 32, marginBottom: 0 }}>
        <h2 className="section-title" style={{ fontSize: 28 }}>Wishlist</h2>
        <span className="section-sub">{wishlist.length} livros pra comprar</span>
      </div>

      {/* ── LISTA DE LIVROS ── */}
      <div className="wl-list">
        {wishlist.map(b => {
          // Link de loja salvo para este livro (se houver)
          const link = links[b.id]
          // Se este livro está com o input de edição aberto
          const isEditing = editingId === b.id

          return (
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
                {b.genre && <span className="wl-genre">{b.genre}</span>}
              </div>

              {/* Coluna direita: gerenciamento de link de loja + botão de leitura */}
              <div className="wl-right">

                {/* ── ESTADO 1: editando o link ── */}
                {isEditing ? (
                  <div className="wl-input-row">
                    <input
                      className="wl-input"
                      type="url"
                      placeholder="amazon.com.br/… ou cole qualquer link"
                      value={drafts[b.id] ?? ''}
                      autoFocus
                      onChange={e =>
                        setDrafts(prev => ({ ...prev, [b.id]: e.target.value }))
                      }
                      onKeyDown={e => {
                        // Enter salva, Escape cancela
                        if (e.key === 'Enter') saveLink(b.id)
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                    />
                    <button className="wl-save-btn" onClick={() => saveLink(b.id)}>
                      Salvar
                    </button>
                    {/* Botão X cancela sem salvar */}
                    <button className="wl-cancel-btn" onClick={() => setEditingId(null)}>
                      ✕
                    </button>
                  </div>

                ) : link ? (
                  /* ── ESTADO 2: link salvo — exibe domínio + ações ── */
                  <div className="wl-link-saved">
                    {/* Domínio extraído da URL para exibição compacta */}
                    <span className="wl-domain">{extractDomain(link)}</span>
                    {/* Link externo para abrir a loja */}
                    <a
                      className="wl-open"
                      href={normalizeUrl(link)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Abrir →
                    </a>
                    {/* Botão para editar o link existente */}
                    <button
                      className="wl-edit-btn"
                      title="Editar link"
                      onClick={() => startEdit(b.id)}
                    >
                      ✎
                    </button>
                  </div>

                ) : (
                  /* ── ESTADO 3: sem link — botão para adicionar ── */
                  <button className="wl-add-link" onClick={() => startEdit(b.id)}>
                    <Icon name="plus" style={{ width: 13, height: 13 }} /> Link da loja
                  </button>
                )}

                {/* Botão secundário para iniciar a leitura do livro da wishlist */}
                <button
                  className="btn btn-ghost"
                  style={{
                    fontSize: 12,
                    padding: '7px 14px',
                    marginTop: 10,
                    width: '100%',
                    justifyContent: 'center',
                  }}
                  onClick={() => openLog(b.id)}
                >
                  Começar a ler
                </button>
              </div>
            </div>
          )
        })}

        {/* Estado vazio */}
        {wishlist.length === 0 && (
          <p style={{
            color: 'var(--ink-4)',
            textAlign: 'center',
            padding: '60px 0',
            fontStyle: 'italic',
            fontFamily: 'var(--serif)',
            fontSize: 18,
          }}>
            Sua lista está vazia — adicione livros pelo catálogo.
          </p>
        )}
      </div>
    </div>
  )
}
