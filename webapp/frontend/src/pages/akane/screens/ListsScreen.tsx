// Tela de Listas/Coleções — Onda 5 (US5).
// Exibe a grade de coleções com pilha de mini-pôsteres e cor de acento.
// Permite criar, editar, deletar listas e visualizar o detalhe de cada uma.

import { useState, useEffect, useCallback } from 'react'
import { akaneApi } from '../akaneApi'
import type { MovieList, MovieListDetail } from '../types'
// Movie não é usado após refatoração — ListDetailView acessa filmes via MovieListDetail.films
import { Poster } from '../components/Poster'
import { Stars } from '../components/Stars'

// ── Props ────────────────────────────────────────────────────────────────────

interface ListsScreenProps {
  onSelectMovie: (id: string) => void  // Abre detalhe de um filme
}

// ── Componente principal ─────────────────────────────────────────────────────

export function ListsScreen({ onSelectMovie }: ListsScreenProps) {
  const [lists, setLists] = useState<MovieList[]>([])
  const [loading, setLoading] = useState(true)

  // Detalhe da lista selecionada (null = exibe a grade de listas)
  const [selectedList, setSelectedList] = useState<MovieListDetail | null>(null)

  // Estado do modal de criação/edição de lista
  const [showCreate, setShowCreate] = useState(false)

  const loadLists = useCallback(() => {
    setLoading(true)
    akaneApi.lists()
      .then(r => setLists(r.lists))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadLists() }, [loadLists])

  // Abre o detalhe de uma lista (busca os filmes da lista no servidor)
  function openList(id: string) {
    akaneApi.listDetail(id)
      .then(r => setSelectedList(r))
      .catch(() => {})
  }

  // Volta para a grade de listas
  function closeDetail() {
    setSelectedList(null)
    loadLists()  // Recarrega para refletir eventuais edições
  }

  // ── Detalhe de uma lista ────────────────────────────────────────────────────

  if (selectedList) {
    return (
      <ListDetailView
        list={selectedList}
        onBack={closeDetail}
        onSelectMovie={onSelectMovie}
        onDelete={async (id) => {
          await akaneApi.deleteList(id)
          closeDetail()
        }}
        onRemoveMovie={async (listId, movieId) => {
          await akaneApi.removeFromList(listId, movieId)
          openList(listId)  // Recarrega o detalhe da lista
        }}
      />
    )
  }

  // ── Grade de listas ─────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Barra de ações */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: 2 }}>
          {lists.length} {lists.length === 1 ? 'lista' : 'listas'}
        </span>
        <button
          className="ak-btn-primary"
          onClick={() => setShowCreate(true)}
          style={{ fontSize: 12, padding: '6px 14px' }}
        >
          + Nova lista
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="ak-empty">
          <span className="ak-empty-icon">⊟</span>
          <p className="ak-empty-title">Carregando listas…</p>
        </div>
      )}

      {/* Grade vazia */}
      {!loading && lists.length === 0 && (
        <div className="ak-empty">
          <span className="ak-empty-icon">⊟</span>
          <p className="ak-empty-title">Nenhuma lista ainda</p>
          <p className="ak-empty-sub">Crie coleções temáticas para organizar seus filmes.</p>
        </div>
      )}

      {/* Grade de listas */}
      {!loading && lists.length > 0 && (
        <div className="ak-grid">
          {lists.map(list => (
            <ListCard
              key={list.id}
              list={list}
              onClick={() => openList(list.id)}
            />
          ))}
        </div>
      )}

      {/* Modal de criação de lista */}
      {showCreate && (
        <CreateListModal
          onClose={() => setShowCreate(false)}
          onSave={async (name, description, ranked) => {
            await akaneApi.createList({ name, description, ranked })
            setShowCreate(false)
            loadLists()
          }}
        />
      )}

    </div>
  )
}


// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENTES
// ─────────────────────────────────────────────────────────────────────────────

// ── Card de lista na grade ──────────────────────────────────────────────────

interface ListCardProps {
  list: MovieList
  onClick: () => void
}

function ListCard({ list, onClick }: ListCardProps) {
  // Cor de acento da lista (fallback: cor base do domínio)
  const accentColor = list.accent || 'var(--rose)'

  return (
    <button
      className="ak-poster-card"
      onClick={onClick}
      style={{
        all: 'unset',
        cursor: 'pointer',
        borderRadius: 12,
        overflow: 'hidden',
        background: 'var(--paper-2)',
        border: '1px solid var(--line)',
        display: 'flex', flexDirection: 'column',
        transition: 'transform 0.1s, box-shadow 0.1s',
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLElement
        el.style.transform = 'translateY(-2px)'
        el.style.boxShadow = '0 8px 24px rgba(0,0,0,0.3)'
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLElement
        el.style.transform = ''
        el.style.boxShadow = ''
      }}
    >
      {/* Faixa de acento no topo */}
      <div style={{ height: 4, background: accentColor }} />

      {/* Placeholder visual — cover_movies não existe em MovieList (a query de lista não
          carrega pôsteres dos filmes; isso exigiria uma subquery por lista). Quando
          for implementado, adicionar cover_movies?: Pick<Movie,'id'|'title'|...>[] ao tipo. */}
      <div style={{ padding: '12px 12px 0', display: 'flex', gap: 4, height: 80 }}>
        <div
          style={{
            flex: 1,
            borderRadius: 4,
            background: 'var(--paper-3, var(--paper))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--ink-4)', fontSize: 20,
          }}
        >
          ⊟
        </div>
      </div>

      {/* Informações da lista */}
      <div style={{ padding: '10px 12px 12px' }}>
        <p style={{ margin: 0, fontFamily: 'var(--serif)', fontSize: 14, color: 'var(--ink)', fontWeight: 600, lineHeight: 1.3 }}>
          {list.name}
          {list.ranked && (
            <span style={{ marginLeft: 6, fontSize: 10, color: accentColor, fontFamily: 'var(--mono)', background: 'color-mix(in srgb, var(--rose) 15%, transparent)', padding: '1px 5px', borderRadius: 4 }}>
              ranked
            </span>
          )}
        </p>
        {list.description && (
          <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--ink-3)', lineClamp: 2, overflow: 'hidden', display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2 }}>
            {list.description}
          </p>
        )}
        {/* MovieList.count é o campo correto — não film_count (ver types.ts) */}
        <p style={{ margin: '6px 0 0', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-4)' }}>
          {list.count} {list.count === 1 ? 'filme' : 'filmes'}
        </p>
      </div>
    </button>
  )
}


// ── Detalhe de uma lista ────────────────────────────────────────────────────

interface ListDetailViewProps {
  list: MovieListDetail
  onBack: () => void
  onSelectMovie: (id: string) => void
  onDelete: (id: string) => void
  onRemoveMovie: (listId: string, movieId: string) => void
}

function ListDetailView({ list: detail, onBack, onSelectMovie, onDelete, onRemoveMovie }: ListDetailViewProps) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  // MovieListDetail tem forma aninhada: { list: {id, name, description, accent, ranked}, films: [...] }
  // Extraímos os metadados da lista e os filmes separadamente
  const meta  = detail.list   // Metadados: id, name, description, accent, ranked
  const films = detail.films  // Filmes: Pick<Movie, 'id'|'title'|'year'|...>[]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <button
          className="ak-btn"
          onClick={onBack}
          style={{ fontSize: 12, flexShrink: 0 }}
        >
          ← Voltar
        </button>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, fontFamily: 'var(--serif)', fontSize: 20, color: 'var(--ink)' }}>
            {meta.name}
          </h2>
          {meta.description && (
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ink-3)' }}>{meta.description}</p>
          )}
          <p style={{ margin: '4px 0 0', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-4)' }}>
            {films.length} {films.length === 1 ? 'filme' : 'filmes'}
          </p>
        </div>
        {/* Botão de deletar a lista */}
        {!confirmDelete ? (
          <button
            className="ak-btn"
            onClick={() => setConfirmDelete(true)}
            style={{ fontSize: 11, color: 'var(--heart)' }}
          >
            Excluir
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              className="ak-btn"
              onClick={() => setConfirmDelete(false)}
              style={{ fontSize: 11 }}
            >
              Cancelar
            </button>
            <button
              onClick={() => onDelete(meta.id)}
              style={{
                all: 'unset', cursor: 'pointer', fontSize: 11, padding: '4px 10px',
                background: 'var(--heart)', color: '#fff', borderRadius: 6,
              }}
            >
              Confirmar exclusão
            </button>
          </div>
        )}
      </div>

      {/* Grade de filmes da lista */}
      {films.length === 0 ? (
        <div className="ak-empty">
          <span className="ak-empty-icon">⊟</span>
          <p className="ak-empty-title">Lista vazia</p>
          <p className="ak-empty-sub">Adicione filmes a esta lista pelo detalhe do filme.</p>
        </div>
      ) : (
        <div className="ak-grid">
          {films.map((movie, index) => (
            <div key={movie.id} style={{ position: 'relative' }}>
              {/* Número da posição (para listas ranked) */}
              {meta.ranked && (
                <div
                  style={{
                    position: 'absolute', top: 6, left: 6,
                    background: 'var(--rose)',
                    color: '#fff',
                    borderRadius: '50%',
                    width: 22, height: 22,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700,
                    zIndex: 10,
                  }}
                >
                  {index + 1}
                </div>
              )}
              <button
                className="ak-poster-card"
                onClick={() => onSelectMovie(movie.id)}
                style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%' }}
              >
                <Poster
                  title={movie.title}
                  posterUrl={movie.poster_url}
                  palette={movie.poster_palette}
                  year={movie.year}
                />
                <div style={{ padding: '6px 4px' }}>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {movie.title}
                  </p>
                  {movie.rating != null && <Stars rating={movie.rating} size={10} />}
                </div>
              </button>
              {/* Botão de remover da lista */}
              <button
                onClick={() => onRemoveMovie(meta.id, movie.id)}
                style={{
                  position: 'absolute', top: 6, right: 6,
                  background: 'rgba(0,0,0,0.6)',
                  border: 'none', color: '#fff',
                  borderRadius: '50%',
                  width: 22, height: 22,
                  cursor: 'pointer',
                  fontSize: 12,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                title="Remover da lista"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

    </div>
  )
}


// ── Modal de criação de lista ────────────────────────────────────────────────

interface CreateListModalProps {
  onClose: () => void
  onSave: (name: string, description: string, ranked: boolean) => void
}

function CreateListModal({ onClose, onSave }: CreateListModalProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [ranked, setRanked] = useState(false)

  function handleSave() {
    if (!name.trim()) return
    onSave(name.trim(), description.trim(), ranked)
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.7)',
        zIndex: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--paper)',
          borderRadius: 16,
          padding: 24,
          maxWidth: 400,
          width: '100%',
          display: 'flex', flexDirection: 'column', gap: 14,
        }}
      >
        <h3 style={{ margin: 0, fontFamily: 'var(--serif)', fontSize: 18, color: 'var(--ink)' }}>
          Nova lista
        </h3>

        {/* Campo nome */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: 1 }}>
            Nome *
          </label>
          <input
            className="ak-input"
            placeholder="Ex.: Filmes de Satoshi Kon"
            value={name}
            onChange={e => setName(e.target.value)}
            autoFocus
            onKeyDown={e => e.key === 'Enter' && handleSave()}
          />
        </div>

        {/* Campo descrição */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: 1 }}>
            Descrição
          </label>
          <input
            className="ak-input"
            placeholder="Descrição opcional"
            value={description}
            onChange={e => setDescription(e.target.value)}
          />
        </div>

        {/* Toggle de lista rankeada */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--ink-3)' }}>
          <input
            type="checkbox"
            checked={ranked}
            onChange={e => setRanked(e.target.checked)}
            style={{ accentColor: 'var(--rose)' }}
          />
          Lista rankeada (filmes em ordem de posição)
        </label>

        {/* Botões */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <button className="ak-btn" onClick={onClose}>Cancelar</button>
          <button
            className="ak-btn-primary"
            onClick={handleSave}
            disabled={!name.trim()}
          >
            Criar lista
          </button>
        </div>
      </div>
    </div>
  )
}
