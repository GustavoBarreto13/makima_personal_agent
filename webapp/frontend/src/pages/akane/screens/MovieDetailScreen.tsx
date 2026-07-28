// Tela de detalhe de um filme.
// Exibe: backdrop hero + pôster | título + meta | nota/coração/status |
// sinopse | anotações | histórico de sessões | Cofre | Pessoas.

import { useState, useEffect } from 'react'
import { akaneApi } from '../akaneApi'
import type { MovieDetail, VaultType } from '../types'
import { Stars } from '../components/Stars'
import { AddToListModal } from '../modals/AddToListModal'
import { EditMovieModal } from '../modals/EditMovieModal'
import { TmdbCandidatesModal } from '../modals/TmdbCandidatesModal'
import { StarRateInput } from '../modals/LogModal'

interface MovieDetailScreenProps {
  movieId: string
  /** Callback para voltar ao catálogo/diário. */
  onBack: () => void
  /** Callback para abrir o LogModal pré-preenchido com este filme. */
  onLog: (movieId: string, title: string) => void
  /** Callback para exibir um toast. */
  onToast: (msg: string) => void
}

/**
 * Detalhe completo de um filme: backdrop hero + dados + sessões + cofre + pessoas.
 */
export function MovieDetailScreen({ movieId, onBack, onLog, onToast }: MovieDetailScreenProps) {
  const [data, setData] = useState<MovieDetail | null>(null)
  const [loading, setLoading] = useState(true)

  // Modal "Adicionar a lista" (US1)
  const [showAddToList, setShowAddToList] = useState(false)

  // Confirmação de exclusão do filme (US5) — duas etapas, mesmo padrão de ListDetailView
  const [confirmDeleteMovie, setConfirmDeleteMovie] = useState(false)
  const [deletingMovie, setDeletingMovie] = useState(false)

  // "Buscar Dados" / trocar filme (spec 050, US4)
  const [refreshingMetadata, setRefreshingMetadata] = useState(false)
  const [showTmdbCandidates, setShowTmdbCandidates] = useState(false)

  // "Editar filme" (spec 050, US5)
  const [showEditMovie, setShowEditMovie] = useState(false)

  // Busca o detalhe na montagem (ou ao trocar movieId)
  useEffect(() => {
    setLoading(true)
    akaneApi.detail(movieId)
      .then(res => setData({ movie: res.movie, people: res.people, vault: res.vault, diary: res.diary }))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [movieId])

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
        <div style={{
          width: 36, height: 36,
          border: '2px solid var(--line)',
          borderTopColor: 'var(--rose)',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="ak-empty">
        <p className="ak-empty-title">Filme não encontrado</p>
        <button className="ak-btn" onClick={onBack} style={{ marginTop: 12 }}>
          ← Voltar
        </button>
      </div>
    )
  }

  const { movie, people, vault, diary } = data

  // Rebusca metadados no TMDB — usa o tmdb_id já salvo (ou busca por título+ano)
  const refreshMetadata = async (tmdbId?: number) => {
    setRefreshingMetadata(true)
    try {
      const res = await akaneApi.refreshMetadata(movie.id, tmdbId)
      setData(d => d ? { ...d, movie: res.movie } : d)
      onToast('Metadados atualizados.')
      setShowTmdbCandidates(false)
    } catch {
      onToast('Não foi possível buscar metadados no TMDB — o filme não foi alterado.')
    } finally {
      setRefreshingMetadata(false)
    }
  }

  return (
    <div>
      {/* ── Botão voltar ─────────────────────────────────────────────── */}
      <button
        className="ak-btn"
        onClick={onBack}
        style={{ marginBottom: 16, fontSize: 12 }}
      >
        ← Voltar
      </button>

      {/* ── Hero com backdrop ─────────────────────────────────────────── */}
      <div className="ak-hero" style={{ borderRadius: 'var(--r-lg)', overflow: 'hidden', marginBottom: 24 }}>
        {movie.backdrop_url ? (
          <img
            src={movie.backdrop_url}
            alt={`Backdrop de ${movie.title}`}
            className="ak-hero-img"
          />
        ) : (
          // Fallback: fundo sólido com a cor de paleta do pôster tipográfico
          <div
            style={{ width: '100%', height: '100%', background: 'var(--mist)' }}
          />
        )}
        {/* Gradiente de baixo para cima para o conteúdo se sobrepor ao backdrop */}
        <div className="ak-hero-gradient" />

        {/* Conteúdo sobreposto ao hero: pôster + título + meta */}
        <div className="ak-hero-content">
          {/* Pôster do detalhe (90×135px) */}
          <div className="ak-detail-poster">
            {movie.poster_url ? (
              <img src={movie.poster_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div className="ak-typo-poster" data-palette={movie.poster_palette} style={{ fontSize: 10 }}>
                <p className="ak-typo-title" style={{ fontSize: 12 }}>{movie.title}</p>
              </div>
            )}
          </div>

          {/* Informações do filme */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 className="ak-detail-title">{movie.title}</h1>
            <div className="ak-detail-meta">
              {movie.year && <span>{movie.year}</span>}
              {movie.director?.[0] && <span>Dir. {movie.director.join(', ')}</span>}
              {movie.runtime && <span>{movie.runtime} min</span>}
              {movie.genres?.slice(0, 3).map(g => <span key={g}>{g}</span>)}
            </div>
            {/* Nota + coração */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
              <Stars rating={movie.rating} size={14} showNumber />
              {movie.liked && <span style={{ color: 'var(--heart)', fontSize: 16 }}>♥</span>}
              {/* Selo "via Letterboxd" */}
              {movie.rating_source === 'letterboxd' && (
                <span className="ak-lb-badge">via Letterboxd</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Ações ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        <button
          className="ak-btn ak-btn-primary"
          onClick={() => onLog(movie.id, movie.title)}
        >
          ▶ Logar sessão
        </button>
        <LikeButton
          movieId={movie.id}
          liked={movie.liked}
          onToast={onToast}
          onToggle={(v) => setData(d => d ? { ...d, movie: { ...d.movie, liked: v } } : d)}
        />
        <StatusToggle
          movieId={movie.id}
          status={movie.status}
          onToast={onToast}
          onToggle={(s) => setData(d => d ? { ...d, movie: { ...d.movie, status: s } } : d)}
        />
        <button
          className="ak-btn"
          onClick={() => setShowAddToList(true)}
        >
          + Adicionar a lista
        </button>
        <button
          className="ak-btn"
          onClick={() => setShowEditMovie(true)}
        >
          ✎ Editar filme
        </button>

        {/* "Buscar Dados" — rebusca metadados no TMDB (spec 050, US4) */}
        <button
          className="ak-btn"
          onClick={() => refreshMetadata()}
          disabled={refreshingMetadata}
          title="Rebuscar metadados no TMDB — corrige idioma e dados desatualizados sem tocar em nota, coração, anotações ou sessões"
        >
          {refreshingMetadata ? 'Buscando…' : '🔎 Buscar Dados'}
        </button>
        <button
          className="ak-btn"
          onClick={() => setShowTmdbCandidates(true)}
          disabled={refreshingMetadata}
          style={{ fontSize: 11 }}
          title="O filme foi associado ao título errado? Escolha o candidato correto."
        >
          Trocar filme
        </button>

        {/* Excluir filme — confirmação em duas etapas (spec 051, US5) */}
        {!confirmDeleteMovie ? (
          <button
            className="ak-btn"
            onClick={() => setConfirmDeleteMovie(true)}
            style={{ color: 'var(--heart)', marginLeft: 'auto' }}
          >
            Excluir filme
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
            <button className="ak-btn" onClick={() => setConfirmDeleteMovie(false)} disabled={deletingMovie}>
              Cancelar
            </button>
            <button
              onClick={async () => {
                setDeletingMovie(true)
                try {
                  await akaneApi.delete(movie.id)
                  onToast('Filme excluído.')
                  onBack()
                } catch {
                  onToast('Erro ao excluir o filme.')
                  setDeletingMovie(false)
                }
              }}
              disabled={deletingMovie}
              style={{
                all: 'unset', cursor: 'pointer', fontSize: 13, padding: '6px 14px',
                background: 'var(--heart)', color: '#fff', borderRadius: 8,
              }}
            >
              {deletingMovie ? 'Excluindo…' : 'Confirmar exclusão'}
            </button>
          </div>
        )}
      </div>

      {/* Modal "Adicionar a lista" */}
      {showAddToList && (
        <AddToListModal
          movieId={movie.id}
          onClose={() => setShowAddToList(false)}
          onToast={onToast}
        />
      )}

      {/* Modal "Editar filme" (spec 050, US5) */}
      {showEditMovie && (
        <EditMovieModal
          movie={movie}
          onClose={() => setShowEditMovie(false)}
          onToast={onToast}
          onSaved={(updated) => setData(d => d ? { ...d, movie: updated } : d)}
        />
      )}

      {/* Modal "Trocar filme" — candidatos do TMDB (spec 050, US4) */}
      {showTmdbCandidates && (
        <TmdbCandidatesModal
          initialQuery={movie.title}
          onClose={() => setShowTmdbCandidates(false)}
          onSelect={(tmdbId) => refreshMetadata(tmdbId)}
        />
      )}

      {/* ── Sinopse ───────────────────────────────────────────────────── */}
      {movie.overview && (
        <div style={{ marginBottom: 24 }}>
          <SectionTitle>Sinopse</SectionTitle>
          <p style={{
            fontFamily: 'var(--serif)',
            fontStyle: 'italic',
            fontSize: 14,
            lineHeight: 1.65,
            color: 'var(--ink-3)',
          }}>
            {movie.overview}
          </p>
        </div>
      )}

      {/* ── Anotações soltas ──────────────────────────────────────────── */}
      <NotesEditor
        movieId={movie.id}
        initialNotes={movie.notes}
        onToast={onToast}
      />

      {/* ── Histórico de sessões ──────────────────────────────────────── */}
      {diary.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <SectionTitle>Histórico ({diary.length})</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {diary.map(entry => (
              <DiaryEntryRow
                key={entry.id}
                entry={entry}
                onToast={onToast}
                onDeleted={(id) => setData(d => d ? { ...d, diary: d.diary.filter(e => e.id !== id) } : d)}
                onUpdated={(updated, movieAgg) => setData(d => d ? {
                  ...d,
                  diary: d.diary.map(e => e.id === updated.id ? updated : e),
                  movie: { ...d.movie, ...movieAgg },
                } : d)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Cofre de conteúdos ────────────────────────────────────────── */}
      <VaultSection
        movieId={movie.id}
        vault={vault}
        onToast={onToast}
        onChange={(newVault) => setData(d => d ? { ...d, vault: newVault } : d)}
      />

      {/* ── Pessoas ───────────────────────────────────────────────────── */}
      {people.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <SectionTitle>Equipe</SectionTitle>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {people.map(p => (
              <div
                key={p.id}
                style={{
                  padding: '6px 12px',
                  background: 'var(--card)',
                  border: '1px solid var(--line)',
                  borderRadius: 'var(--r-sm)',
                }}
              >
                <p style={{ fontFamily: 'var(--sans)', fontSize: 13, color: 'var(--ink)' }}>
                  {p.name}
                  {p.is_person_tag && (
                    <span style={{ color: 'var(--rose)', marginLeft: 4 }}>•</span>
                  )}
                </p>
                {p.role && (
                  <p style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-4)', marginTop: 2 }}>
                    {p.role}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Subcomponentes ────────────────────────────────────────────────────────────

/** Título de seção padronizado. */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.08em',
      textTransform: 'uppercase', color: 'var(--ink-4)',
      marginBottom: 10, paddingBottom: 6,
      borderBottom: '1px solid var(--line-2)',
    }}>
      {children}
    </p>
  )
}

/** Botão de curtir (coração) com toggle imediato. */
function LikeButton({ movieId, liked, onToast, onToggle }: {
  movieId: string; liked: boolean
  onToast: (msg: string) => void; onToggle: (v: boolean) => void
}) {
  const [busy, setBusy] = useState(false)

  const toggle = async () => {
    if (busy) return
    setBusy(true)
    try {
      await akaneApi.like(movieId, !liked)
      onToggle(!liked)
      onToast(liked ? 'Coração removido.' : '♥ Curtido!')
    } catch {
      onToast('Erro ao atualizar.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      className={`ak-btn ak-heart${liked ? ' liked' : ''}`}
      onClick={toggle}
      disabled={busy}
      style={{ fontSize: 18, padding: '6px 14px' }}
      title={liked ? 'Descurtir' : 'Curtir'}
    >
      {liked ? '♥' : '♡'}
    </button>
  )
}

/** Toggle de status (watched ↔ watchlist). */
function StatusToggle({ movieId, status, onToast, onToggle }: {
  movieId: string; status: string
  onToast: (msg: string) => void; onToggle: (s: 'watched' | 'watchlist') => void
}) {
  const [busy, setBusy] = useState(false)
  const next = status === 'watched' ? 'watchlist' : 'watched'

  const toggle = async () => {
    if (busy) return
    setBusy(true)
    try {
      await akaneApi.updateStatus(movieId, next)
      onToggle(next)
      onToast(next === 'watched' ? 'Marcado como assistido.' : 'Movido para watchlist.')
    } catch {
      onToast('Erro ao atualizar.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <button className="ak-btn" onClick={toggle} disabled={busy}>
      {status === 'watched' ? '↩ Mover para watchlist' : '✓ Marcar como assistido'}
    </button>
  )
}

/** Editor inline de anotações soltas. */
function NotesEditor({ movieId, initialNotes, onToast }: {
  movieId: string; initialNotes: string | null; onToast: (msg: string) => void
}) {
  const [notes, setNotes] = useState(initialNotes ?? '')
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    setBusy(true)
    try {
      await akaneApi.setNotes(movieId, notes)
      setEditing(false)
      onToast('Anotações salvas.')
    } catch {
      onToast('Erro ao salvar anotações.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <SectionTitle>Anotações</SectionTitle>
        {!editing && (
          <button
            className="ak-btn"
            style={{ fontSize: 11, padding: '3px 8px', marginTop: -6 }}
            onClick={() => setEditing(true)}
          >
            {notes ? 'Editar' : '+ Adicionar'}
          </button>
        )}
      </div>

      {editing ? (
        <div>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="ak-input"
            rows={4}
            placeholder="Suas reflexões sobre o filme..."
            style={{ resize: 'vertical' }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="ak-btn ak-btn-primary" onClick={save} disabled={busy}>
              {busy ? 'Salvando...' : 'Salvar'}
            </button>
            <button className="ak-btn" onClick={() => { setEditing(false); setNotes(initialNotes ?? '') }}>
              Cancelar
            </button>
          </div>
        </div>
      ) : notes ? (
        <p style={{
          fontFamily: 'var(--serif)', fontStyle: 'italic',
          fontSize: 13.5, lineHeight: 1.65, color: 'var(--ink-3)',
          whiteSpace: 'pre-wrap',
        }}>
          {notes}
        </p>
      ) : null}
    </div>
  )
}

/** Linha do histórico de sessões — exclusão (spec 051, US5) e edição (spec 050, US5). */
function DiaryEntryRow({ entry, onToast, onDeleted, onUpdated }: {
  entry: MovieDetail['diary'][number]
  onToast: (msg: string) => void
  onDeleted: (id: string) => void
  onUpdated: (entry: MovieDetail['diary'][number], movieAgg: { last_watched_date: string | null; times_watched: number }) => void
}) {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [editing, setEditing] = useState(false)

  const doDelete = async () => {
    setDeleting(true)
    try {
      await akaneApi.deleteDiary(entry.id)
      onDeleted(entry.id)
      onToast('Sessão excluída.')
    } catch {
      onToast('Erro ao excluir a sessão.')
      setDeleting(false)
    }
  }

  if (editing) {
    return (
      <DiaryEntryEditForm
        entry={entry}
        onCancel={() => setEditing(false)}
        onToast={onToast}
        onSaved={(updated, movieAgg) => {
          onUpdated(updated, movieAgg)
          setEditing(false)
        }}
      />
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 12px',
        background: 'var(--card)',
        borderRadius: 'var(--r-sm)',
        border: '1px solid var(--line-2)',
      }}
    >
      <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ink-4)' }}>
        {entry.watched_date}
      </span>
      {entry.rewatch && <span className="ak-rewatch-badge">Revisão</span>}
      <Stars rating={entry.rating} size={11} />
      {entry.review && (
        <span style={{
          fontFamily: 'var(--serif)', fontStyle: 'italic',
          fontSize: 12, color: 'var(--ink-3)',
          flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {entry.review}
        </span>
      )}
      {/* Editar sessão (spec 050, US5) */}
      <button
        onClick={() => setEditing(true)}
        title="Editar sessão"
        style={{
          all: 'unset', cursor: 'pointer', fontSize: 12, color: 'var(--ink-4)',
          marginLeft: entry.review ? 0 : 'auto', flexShrink: 0, padding: '2px 6px',
        }}
      >
        ✎
      </button>
      {/* Exclusão em duas etapas para evitar clique acidental */}
      {!confirming ? (
        <button
          onClick={() => setConfirming(true)}
          title="Excluir sessão"
          style={{
            all: 'unset', cursor: 'pointer', fontSize: 12, color: 'var(--ink-4)',
            flexShrink: 0, padding: '2px 6px',
          }}
        >
          ✕
        </button>
      ) : (
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          <button
            onClick={() => setConfirming(false)}
            style={{ all: 'unset', cursor: 'pointer', fontSize: 11, color: 'var(--ink-4)', padding: '2px 6px' }}
          >
            Cancelar
          </button>
          <button
            onClick={doDelete}
            disabled={deleting}
            style={{
              all: 'unset', cursor: 'pointer', fontSize: 11, padding: '2px 8px',
              background: 'var(--heart)', color: '#fff', borderRadius: 5,
            }}
          >
            {deleting ? '…' : 'Confirmar'}
          </button>
        </div>
      )}
    </div>
  )
}

/** Form inline de edição de uma sessão (spec 050, US5/FR-009). */
function DiaryEntryEditForm({ entry, onCancel, onToast, onSaved }: {
  entry: MovieDetail['diary'][number]
  onCancel: () => void
  onToast: (msg: string) => void
  onSaved: (entry: MovieDetail['diary'][number], movieAgg: { last_watched_date: string | null; times_watched: number }) => void
}) {
  const [watchedDate, setWatchedDate] = useState(entry.watched_date)
  const [rating, setRating] = useState<number | null>(entry.rating)
  const [review, setReview] = useState(entry.review ?? '')
  const [tags, setTags] = useState(entry.tags.join(', '))
  const [rewatch, setRewatch] = useState(entry.rewatch)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      const res = await akaneApi.updateDiaryEntry(entry.id, {
        watched_date: watchedDate,
        rating: rating ?? undefined,
        review: review.trim() || undefined,
        tags: tags.split(',').map(t => t.trim()).filter(Boolean),
        rewatch,
      })
      onSaved(res.entry, res.movie)
      onToast('Sessão atualizada.')
    } catch {
      onToast('Erro ao salvar a sessão.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', gap: 8,
        padding: '10px 12px',
        background: 'var(--card)', borderRadius: 'var(--r-sm)',
        border: '1px solid var(--line-2)',
      }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          className="ak-input"
          type="date"
          value={watchedDate}
          onChange={e => setWatchedDate(e.target.value)}
          style={{ width: 150 }}
        />
        <StarRateInput rating={rating} onChange={setRating} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--ink-3)' }}>
          <input type="checkbox" checked={rewatch} onChange={e => setRewatch(e.target.checked)} />
          Revisão
        </label>
      </div>
      <textarea
        className="ak-input"
        rows={2}
        placeholder="Resenha (opcional)"
        value={review}
        onChange={e => setReview(e.target.value)}
        style={{ resize: 'vertical' }}
      />
      <input
        className="ak-input"
        placeholder="Etiquetas separadas por vírgula (opcional)"
        value={tags}
        onChange={e => setTags(e.target.value)}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="ak-btn ak-btn-primary" onClick={save} disabled={saving}>
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
        <button className="ak-btn" onClick={onCancel} disabled={saving}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

/** Seção do Cofre — adiciona e remove itens sem sair do detalhe (spec 051, US2). */
function VaultSection({ movieId, vault, onToast, onChange }: {
  movieId: string
  vault: MovieDetail['vault']
  onToast: (msg: string) => void
  onChange: (newVault: MovieDetail['vault']) => void
}) {
  const [adding, setAdding] = useState(false)
  const [type, setType] = useState<VaultType>('video')
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [source, setSource] = useState('')
  const [busy, setBusy] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)

  const save = async () => {
    if (!title.trim()) return
    setBusy(true)
    try {
      const res = await akaneApi.addVault(movieId, {
        type,
        title: title.trim(),
        url: url.trim() || undefined,
        source: source.trim() || undefined,
      })
      const newId = (res as { id?: string }).id
      onChange([...vault, { id: newId ?? crypto.randomUUID(), type, title: title.trim(), url: url.trim() || null, source: source.trim() || null }])
      onToast('Item adicionado ao Cofre.')
      setTitle(''); setUrl(''); setSource(''); setAdding(false)
    } catch {
      onToast('Erro ao adicionar ao Cofre.')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: string) => {
    setRemovingId(id)
    try {
      await akaneApi.deleteVault(id)
      onChange(vault.filter(v => v.id !== id))
      onToast('Item removido do Cofre.')
    } catch {
      onToast('Erro ao remover do Cofre.')
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <SectionTitle>Cofre ({vault.length})</SectionTitle>
        {!adding && (
          <button
            className="ak-btn"
            style={{ fontSize: 11, padding: '3px 8px', marginTop: -6 }}
            onClick={() => setAdding(true)}
          >
            + Adicionar
          </button>
        )}
      </div>

      {vault.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: adding ? 10 : 0 }}>
          {vault.map(item => (
            <div
              key={item.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 12px',
                background: 'var(--card)', borderRadius: 'var(--r-sm)',
                border: '1px solid var(--line-2)',
              }}
            >
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--rose)', textTransform: 'uppercase' }}>
                {item.type}
              </span>
              {item.url ? (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontFamily: 'var(--sans)', fontSize: 13, color: 'var(--ink)', textDecoration: 'none', flex: 1 }}
                >
                  {item.title}
                </a>
              ) : (
                <span style={{ fontFamily: 'var(--sans)', fontSize: 13, color: 'var(--ink)', flex: 1 }}>
                  {item.title}
                </span>
              )}
              {item.source && (
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-4)' }}>
                  {item.source}
                </span>
              )}
              <button
                onClick={() => remove(item.id)}
                disabled={removingId === item.id}
                title="Remover do Cofre"
                style={{ all: 'unset', cursor: 'pointer', fontSize: 12, color: 'var(--ink-4)', flexShrink: 0, padding: '2px 6px' }}
              >
                {removingId === item.id ? '…' : '✕'}
              </button>
            </div>
          ))}
        </div>
      )}

      {adding && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', background: 'var(--card)', borderRadius: 'var(--r-sm)', border: '1px solid var(--line-2)' }}>
          <select
            className="ak-input"
            value={type}
            onChange={e => setType(e.target.value as VaultType)}
          >
            <option value="video">Vídeo</option>
            <option value="article">Artigo</option>
            <option value="essay">Ensaio</option>
            <option value="review">Review</option>
          </select>
          <input
            className="ak-input"
            placeholder="Título"
            value={title}
            onChange={e => setTitle(e.target.value)}
            autoFocus
          />
          <input
            className="ak-input"
            placeholder="URL (opcional)"
            value={url}
            onChange={e => setUrl(e.target.value)}
          />
          <input
            className="ak-input"
            placeholder="Fonte (opcional, ex.: youtube.com)"
            value={source}
            onChange={e => setSource(e.target.value)}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="ak-btn ak-btn-primary" onClick={save} disabled={busy || !title.trim()}>
              {busy ? 'Salvando…' : 'Salvar'}
            </button>
            <button className="ak-btn" onClick={() => { setAdding(false); setTitle(''); setUrl(''); setSource('') }}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
