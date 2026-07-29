// Tela de Listas — coleções personalizadas de animes (spec 054, FR-003).
// Grade de listas → clique abre o detalhe (grade de pôsteres da coleção).
// Porta do padrão já usado na Akane (ListsScreen.tsx), com os componentes e
// classes CSS próprios do shell da Marin.

import { useState, useEffect, useCallback } from 'react'
import { marinApi } from '../marinApi'
import type { AnimeList, AnimeListDetail } from '../types'
import { PosterCard } from '../components/PosterCard'
import { Icon } from '../components/Icon'

const LIST_ACCENTS = [
  'oklch(0.68 0.25 350)', // rosa-magenta (padrão do domínio)
  'oklch(0.60 0.20 210)', // cyan
  'oklch(0.58 0.20 155)', // emerald
  'oklch(0.72 0.20 75)',  // amber
  'oklch(0.50 0.24 265)', // indigo
  'oklch(0.62 0.26 10)',  // rose
]

interface ListsScreenProps {
  onSelectAnime: (id: string) => void
}

export function ListsScreen({ onSelectAnime }: ListsScreenProps) {
  const [lists, setLists] = useState<AnimeList[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [selected, setSelected] = useState<AnimeListDetail | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState<AnimeListDetail['list'] | null>(null)

  const loadLists = useCallback(() => {
    setLoading(true)
    setLoadError(false)
    marinApi.getLists()
      .then(r => setLists(r.lists ?? []))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadLists() }, [loadLists])

  function openList(id: string) {
    marinApi.getList(id).then(r => setSelected(r)).catch(() => {})
  }

  function closeDetail() {
    setSelected(null)
    loadLists()
  }

  if (selected) {
    return (
      <>
        <ListDetailView
          detail={selected}
          onBack={closeDetail}
          onSelectAnime={onSelectAnime}
          onDelete={async id => { await marinApi.deleteList(id); closeDetail() }}
          onRemoveAnime={async (listId, animeId) => {
            await marinApi.removeFromList(listId, animeId)
            openList(listId)
          }}
          onEdit={list => setEditing(list)}
        />
        {editing && (
          <CreateListModal
            initial={editing}
            onClose={() => setEditing(null)}
            onSave={async (name, description, ranked, accent) => {
              await marinApi.updateList(editing.id, { name, description, ranked, accent })
              setEditing(null)
              openList(editing.id)
            }}
          />
        )}
      </>
    )
  }

  return (
    <div className="mr-catalog">
      <div className="mr-catalog-header" style={{ marginTop: 22 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--serif, var(--sans))' }}>Listas</h1>
        <button className="mr-btn mr-btn--primary" style={{ marginLeft: 'auto' }} onClick={() => setShowCreate(true)}>
          <Icon name="plus" size={14} /> Nova lista
        </button>
      </div>

      {loading && <p style={{ color: 'var(--ink-4)', padding: '20px 0' }}>Carregando listas…</p>}

      {!loading && loadError && (
        <p style={{ color: 'var(--ink-4)', padding: '20px 0' }}>
          Não foi possível carregar as listas.{' '}
          <button className="mr-btn" onClick={loadLists} style={{ marginLeft: 8 }}>Tentar novamente</button>
        </p>
      )}

      {!loading && !loadError && lists.length === 0 && (
        <p style={{ color: 'var(--ink-4)', padding: '20px 0' }}>
          Nenhuma lista ainda — crie coleções temáticas para organizar seus animes.
        </p>
      )}

      {!loading && !loadError && lists.length > 0 && (
        <div className="mr-list-grid">
          {lists.map(l => (
            <div key={l.id} className="mr-list-card" onClick={() => openList(l.id)}>
              <div className="mr-list-accent-bar" style={{ background: l.accent || 'var(--marin)' }} />
              <div className="mr-list-name">
                {l.name}
                {l.ranked && <span className="mr-tag" style={{ marginLeft: 6, fontSize: 10 }}>ranked</span>}
              </div>
              {l.description && <div className="mr-list-desc">{l.description}</div>}
              <div className="mr-list-count">{l.count} {l.count === 1 ? 'anime' : 'animes'}</div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateListModal
          onClose={() => setShowCreate(false)}
          onSave={async (name, description, ranked, accent) => {
            await marinApi.createList({ name, description, ranked, accent })
            setShowCreate(false)
            loadLists()
          }}
        />
      )}
    </div>
  )
}

function ListDetailView({ detail, onBack, onSelectAnime, onDelete, onRemoveAnime, onEdit }: {
  detail: AnimeListDetail
  onBack: () => void
  onSelectAnime: (id: string) => void
  onDelete: (id: string) => void
  onRemoveAnime: (listId: string, animeId: string) => void
  onEdit: (list: AnimeListDetail['list']) => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const meta = detail.list
  const animes = detail.animes

  return (
    <div className="mr-catalog">
      <button className="mr-detail-back" onClick={onBack}>
        <Icon name="arrow-left" size={15} /> Listas
      </button>

      <div style={{ marginTop: 18, display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div className="mr-list-accent-bar" style={{ background: meta.accent || 'var(--marin)', width: 44, height: 4 }} />
          <h1 style={{ fontSize: 30, fontWeight: 800, marginTop: 8 }}>{meta.name}</h1>
          {meta.description && <p className="mr-list-desc" style={{ fontSize: 14, maxWidth: '56ch' }}>{meta.description}</p>}
          <div className="mr-list-count">{animes.length} {animes.length === 1 ? 'anime' : 'animes'}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!confirmDelete && (
            <button className="mr-btn" onClick={() => onEdit(meta)}>Editar</button>
          )}
          {!confirmDelete ? (
            <button className="mr-btn" style={{ color: 'var(--heart)' }} onClick={() => setConfirmDelete(true)}>
              <Icon name="delete" size={14} /> Excluir
            </button>
          ) : (
            <>
              <button className="mr-btn" onClick={() => setConfirmDelete(false)}>Cancelar</button>
              <button
                className="mr-btn mr-btn--primary"
                style={{ background: 'var(--heart)', borderColor: 'var(--heart)' }}
                onClick={() => onDelete(meta.id)}
              >
                Confirmar exclusão
              </button>
            </>
          )}
        </div>
      </div>

      {animes.length === 0 ? (
        <p style={{ color: 'var(--ink-4)', padding: '20px 0' }}>
          Lista vazia — adicione animes a esta lista pelo detalhe do anime.
        </p>
      ) : (
        <div className="mr-catalog-grid" style={{ marginTop: 24 }}>
          {animes.map((anime, index) => (
            <div key={anime.id} className="mr-catalog-item" style={{ position: 'relative' }}>
              {meta.ranked && <div className="mr-list-rank-badge">{index + 1}</div>}
              <PosterCard
                title={anime.title}
                posterUrl={anime.poster_url}
                posterKey={anime.poster_key}
                onClick={() => onSelectAnime(anime.id)}
              />
              <div className="mr-catalog-info">
                <p className="mr-catalog-title" onClick={() => onSelectAnime(anime.id)} style={{ cursor: 'pointer' }}>
                  {anime.title}
                </p>
              </div>
              <button
                className="mr-list-item-remove"
                title="Remover da lista"
                onClick={() => onRemoveAnime(meta.id, anime.id)}
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

function CreateListModal({ onClose, onSave, initial }: {
  onClose: () => void
  onSave: (name: string, description: string, ranked: boolean, accent?: string) => void
  initial?: AnimeListDetail['list']
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
    <div className="mr-modal-scrim" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="mr-modal" role="dialog" aria-label={initial ? 'Editar lista' : 'Nova lista'}>
        <div className="mr-modal-header">
          <h2 className="mr-modal-title">{initial ? 'Editar lista' : 'Nova lista'}</h2>
          <button className="mr-modal-close" onClick={onClose} aria-label="Fechar">✕</button>
        </div>
        <div className="mr-modal-body">
          <div className="mr-log-field">
            <label className="mr-label">Nome</label>
            <input
              className="mr-input" placeholder="Ex.: Isekai favoritos" value={name}
              onChange={e => setName(e.target.value)} autoFocus
              onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
            />
          </div>
          <div className="mr-log-field">
            <label className="mr-label">Descrição <span className="mr-label-hint">(opcional)</span></label>
            <input
              className="mr-input" placeholder="Descrição da coleção" value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>
          <div className="mr-log-field">
            <label className="mr-label">Cor de destaque</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {LIST_ACCENTS.map(color => (
                <button
                  key={color} onClick={() => setAccent(color)} title={color}
                  style={{
                    width: 26, height: 26, borderRadius: '50%', background: color, cursor: 'pointer',
                    border: accent === color ? '2px solid var(--ink)' : '2px solid transparent',
                  }}
                />
              ))}
            </div>
          </div>
          <div className="mr-log-field">
            <label className="mr-checkbox-row" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={ranked} onChange={e => setRanked(e.target.checked)} />
              Lista rankeada (ordem de posição)
            </label>
          </div>
        </div>
        <div className="mr-modal-footer">
          <button className="mr-btn" onClick={onClose}>Cancelar</button>
          <button className="mr-btn mr-btn--primary" onClick={handleSave} disabled={!name.trim()}>
            {initial ? 'Salvar' : 'Criar lista'}
          </button>
        </div>
      </div>
    </div>
  )
}
