// Tela Listas (coleções curadas) — reescrita hi-fi conforme o handoff §7.6:
// grade de list-card com pilha de mini-pôsteres + barra de acento; ListView
// abre a coleção como poster-grid, com números de posição para listas ranked.
// CRUD real preservado: criar/editar/excluir lista, adicionar/remover filme.

import { useState, useEffect, useCallback } from 'react'
import { akaneApi } from '../akaneApi'
import type { MovieList, MovieListDetail } from '../types'
import { Icon } from '../ui/Icon'
import { Poster } from '../components/Poster'
import { Stars } from '../components/Stars'
import { matches } from '../searchUtils'

interface ListsScreenProps {
  onSelectMovie: (id: string) => void
  /** Busca contextual: filtra a grade de listas OU os filmes dentro do detalhe. */
  query: string
}

/** Paleta fixa de acentos para listas (spec 051, US1). */
const LIST_ACCENTS = [
  'oklch(0.655 0.205 357)',  // rosa (padrão do domínio)
  'oklch(0.66 0.115 196)',   // teal
  'oklch(0.605 0.215 22)',   // carmim
  'oklch(0.74 0.155 66)',    // âmbar
  'oklch(0.65 0.15 145)',    // verde
  'oklch(0.6 0.18 280)',     // roxo
]

export function ListsScreen({ onSelectMovie, query }: ListsScreenProps) {
  const [lists, setLists] = useState<MovieList[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [selectedList, setSelectedList] = useState<MovieListDetail | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [editingList, setEditingList] = useState<MovieListDetail['list'] | null>(null)

  const loadLists = useCallback(() => {
    setLoading(true)
    setLoadError(false)
    akaneApi.lists()
      .then(r => setLists(r.lists))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadLists() }, [loadLists])

  function openList(id: string) {
    akaneApi.listDetail(id).then(r => setSelectedList(r)).catch(() => {})
  }

  function closeDetail() {
    setSelectedList(null)
    loadLists()
  }

  // ── Detalhe de uma lista ──────────────────────────────────────────────────
  if (selectedList) {
    return (
      <>
        <ListDetailView
          list={selectedList}
          query={query}
          onBack={closeDetail}
          onSelectMovie={onSelectMovie}
          onDelete={async (id) => { await akaneApi.deleteList(id); closeDetail() }}
          onRemoveMovie={async (listId, movieId) => {
            await akaneApi.removeFromList(listId, movieId)
            openList(listId)
          }}
          onEdit={(list) => setEditingList(list)}
        />
        {editingList && (
          <CreateListModal
            initial={editingList}
            onClose={() => setEditingList(null)}
            onSave={async (name, description, ranked, accent) => {
              await akaneApi.updateList(editingList.id, { name, description, ranked, accent })
              setEditingList(null)
              openList(editingList.id)
            }}
          />
        )}
      </>
    )
  }

  // ── Grade de listas ────────────────────────────────────────────────────────
  const filteredLists = lists.filter(l => matches(query, l.name, l.description))

  return (
    <div className="ak-page">
      <div className="ak-section-head" style={{ marginTop: 32 }}>
        <h2 className="ak-section-title" style={{ fontSize: 30 }}>Listas</h2>
        <span className="ak-section-sub">coleções que você curou</span>
        <button className="ak-btn ak-btn-primary" style={{ marginLeft: 'auto' }} onClick={() => setShowCreate(true)}>
          <Icon name="plus" /> Nova lista
        </button>
      </div>

      {loading && <p className="ak-empty-state">Carregando listas…</p>}

      {!loading && loadError && (
        <p className="ak-empty-state">
          Não foi possível carregar as listas.{' '}
          <button className="ak-btn ak-btn-ghost" onClick={loadLists} style={{ marginLeft: 8 }}>Tentar novamente</button>
        </p>
      )}

      {!loading && !loadError && lists.length === 0 && (
        <p className="ak-empty-state">Nenhuma lista ainda — crie coleções temáticas para organizar seus filmes.</p>
      )}

      {!loading && !loadError && lists.length > 0 && filteredLists.length === 0 && query.trim() && (
        <p className="ak-empty-state">Nada encontrado para "{query}".</p>
      )}

      {!loading && !loadError && filteredLists.length > 0 && (
        <div className="ak-list-grid">
          {filteredLists.map(l => <ListCard key={l.id} list={l} onClick={() => openList(l.id)} />)}
        </div>
      )}

      {showCreate && (
        <CreateListModal
          onClose={() => setShowCreate(false)}
          onSave={async (name, description, ranked, accent) => {
            await akaneApi.createList({ name, description, ranked, accent })
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

/** Card de lista na grade — pilha de mini-pôsteres + barra de acento (handoff). */
function ListCard({ list, onClick }: { list: MovieList; onClick: () => void }) {
  const accentColor = list.accent || 'var(--rose)'
  // MovieList não carrega cover_movies — a pilha some quando não há capa
  // conhecida (placeholder de ícone no lugar, sem quebrar o layout).
  return (
    <div className="ak-list-card" onClick={onClick}>
      <div className="ak-list-spines">
        <div className="ak-list-spines-placeholder"><Icon name="listas" /></div>
      </div>
      <div className="ak-list-accent-bar" style={{ background: accentColor }} />
      <div className="ak-list-name">
        {list.name}
        {list.ranked && <span className="ak-list-ranked-badge">ranked</span>}
      </div>
      {list.description && <div className="ak-list-desc">{list.description}</div>}
      <div className="ak-list-count">{list.count} {list.count === 1 ? 'filme' : 'filmes'}</div>
    </div>
  )
}

/** Detalhe de uma lista — grade de pôsteres com número de posição (ranked). */
function ListDetailView({ list: detail, query, onBack, onSelectMovie, onDelete, onRemoveMovie, onEdit }: {
  list: MovieListDetail
  query: string
  onBack: () => void
  onSelectMovie: (id: string) => void
  onDelete: (id: string) => void
  onRemoveMovie: (listId: string, movieId: string) => void
  onEdit: (list: MovieListDetail['list']) => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const meta = detail.list
  const films = detail.films.filter(m => matches(query, m.title))

  return (
    <div className="ak-page">
      <button className="ak-detail-back" onClick={onBack}><Icon name="arrowLeft" /> Listas</button>

      <div style={{ marginTop: 18, display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div className="ak-list-accent-bar" style={{ background: meta.accent || 'var(--rose)', width: 44, height: 4 }} />
          <h1 className="ak-detail-title" style={{ fontSize: 40, marginTop: 8 }}>{meta.name}</h1>
          {meta.description && <p className="ak-list-desc" style={{ fontSize: 15, maxWidth: '56ch' }}>{meta.description}</p>}
          <div className="ak-list-count">{films.length} {films.length === 1 ? 'filme' : 'filmes'}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!confirmDelete && (
            <button className="ak-btn ak-btn-ghost" onClick={() => onEdit(meta)}><Icon name="pen" /> Editar</button>
          )}
          {!confirmDelete ? (
            <button className="ak-btn ak-btn-ghost" style={{ color: 'var(--heart)' }} onClick={() => setConfirmDelete(true)}>
              <Icon name="trash" /> Excluir
            </button>
          ) : (
            <>
              <button className="ak-btn ak-btn-ghost" onClick={() => setConfirmDelete(false)}>Cancelar</button>
              <button className="ak-btn ak-btn-primary" style={{ background: 'var(--heart)', borderColor: 'var(--heart)' }}
                      onClick={() => onDelete(meta.id)}>
                Confirmar exclusão
              </button>
            </>
          )}
        </div>
      </div>

      {films.length === 0 && query.trim() ? (
        <p className="ak-empty-state">Nada encontrado para "{query}".</p>
      ) : films.length === 0 ? (
        <p className="ak-empty-state">Lista vazia — adicione filmes a esta lista pelo detalhe do filme.</p>
      ) : (
        <div className="ak-poster-grid" style={{ marginTop: 28 }}>
          {films.map((movie, index) => (
            <div key={movie.id} className="ak-list-item-wrap">
              {meta.ranked && <div className="ak-list-rank-badge">{index + 1}</div>}
              <a className="ak-poster-link" onClick={() => onSelectMovie(movie.id)}>
                <Poster title={movie.title} posterUrl={movie.poster_url} palette={movie.poster_palette} year={movie.year} />
                <div className="ak-poster-meta">
                  <div className="ak-pm-title">{movie.title}</div>
                  <div className="ak-pm-row">
                    {movie.rating != null
                      ? <Stars value={movie.rating} />
                      : <span className="ak-result-count" style={{ color: 'var(--rose-deep)' }}>quero ver</span>}
                  </div>
                </div>
              </a>
              <button className="ak-list-item-remove" title="Remover da lista"
                      onClick={() => onRemoveMovie(meta.id, movie.id)}>
                <Icon name="x" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Modal de criação/edição de lista. */
function CreateListModal({ onClose, onSave, initial }: {
  onClose: () => void
  onSave: (name: string, description: string, ranked: boolean, accent?: string) => void
  initial?: MovieListDetail['list']
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [ranked, setRanked] = useState(initial?.ranked ?? false)
  const [accent, setAccent] = useState<string | null>(initial?.accent ?? null)

  function handleSave() {
    if (!name.trim()) return
    onSave(name.trim(), description.trim(), ranked, accent ?? undefined)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="ak-modal-scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="ak-modal" role="dialog" aria-label={initial ? 'Editar lista' : 'Nova lista'}>
        <div className="ak-modal-head">
          <span className="ak-modal-title">{initial ? 'Editar lista' : 'Nova lista'}</span>
          <button className="ak-modal-x" onClick={onClose} aria-label="Fechar"><Icon name="x" /></button>
        </div>
        <div className="ak-modal-body">
          <div className="ak-modal-field">
            <label className="ak-modal-label">Nome</label>
            <input className="ak-text-input" placeholder="Ex.: Filmes de Satoshi Kon" value={name}
                   onChange={e => setName(e.target.value)} autoFocus
                   onKeyDown={e => e.key === 'Enter' && handleSave()} />
          </div>

          <div className="ak-modal-field">
            <label className="ak-modal-label">Descrição <span className="ak-ml-hint">· opcional</span></label>
            <input className="ak-text-input" placeholder="Descrição da coleção" value={description}
                   onChange={e => setDescription(e.target.value)} />
          </div>

          <div className="ak-modal-field">
            <label className="ak-modal-label">Cor de destaque</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {LIST_ACCENTS.map(color => (
                <button key={color} onClick={() => setAccent(color)} title={color}
                        className={'ak-list-accent-swatch' + (accent === color ? ' ak-sel' : '')}
                        style={{ background: color }} />
              ))}
            </div>
          </div>

          <div className="ak-modal-field">
            <button className={'ak-toggle-pill' + (ranked ? ' ak-on ak-like' : '')} onClick={() => setRanked(v => !v)}>
              <Icon name="listas" /> Lista rankeada (ordem de posição)
            </button>
          </div>

          <div className="ak-modal-foot">
            <div className="ak-grow" />
            <button className="ak-btn ak-btn-ghost" onClick={onClose}>Cancelar</button>
            <button className="ak-btn ak-btn-primary" onClick={handleSave} disabled={!name.trim()}>
              <Icon name="check" /> {initial ? 'Salvar' : 'Criar lista'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
