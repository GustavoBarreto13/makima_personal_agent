// Tela de detalhe de um filme.
// Exibe: backdrop hero + pôster | título + meta | nota/coração/status |
// sinopse | anotações | histórico de sessões | Cofre | Pessoas.

import { useState, useEffect } from 'react'
import { akaneApi } from '../akaneApi'
import type { MovieDetail } from '../types'
import { Stars } from '../components/Stars'

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
      </div>

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
              <div
                key={entry.id}
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
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Cofre de conteúdos ────────────────────────────────────────── */}
      {vault.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <SectionTitle>Cofre ({vault.length})</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
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
                {/* Tipo com ícone em texto */}
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
              </div>
            ))}
          </div>
        </div>
      )}

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
