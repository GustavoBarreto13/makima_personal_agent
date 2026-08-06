// Tela de detalhe do filme — reescrita hi-fi conforme o handoff §7.4:
// duas colunas — esquerda STICKY (pôster grande + ações) e direita com
// gênero (kicker), título Display, linha de nota (selo "via Letterboxd",
// status-pill), grade de metadados, "Sua review", "Anotações", Cofre,
// Etiquetas, Equipe e "Diário deste filme".
//
// Todos os extras do app real foram MANTIDOS e reestilizados no padrão:
// Adicionar a lista, Editar filme, Buscar Dados/Trocar filme (TMDB),
// Excluir filme, sinopse, edição/exclusão de sessões e CRUD do Cofre.

import { useState, useEffect } from 'react'
import { akaneApi } from '../akaneApi'
import type { MovieDetail, VaultType } from '../types'
import { Icon } from '../ui/Icon'
import { Heart } from '../ui/Heart'
import { Poster } from '../components/Poster'
import { Stars } from '../components/Stars'
import { RateInput } from '../components/RateInput'
import { SessionContextFields } from '../components/SessionContextFields'
import { AddToListModal } from '../modals/AddToListModal'
import { EditMovieModal } from '../modals/EditMovieModal'
import { TmdbCandidatesModal } from '../modals/TmdbCandidatesModal'
import { fmtDate, fmtRuntime } from '../dateUtils'

// Metadados visuais por tipo de item do Cofre (cores/ícones do handoff)
const VAULT_META: Record<VaultType, { label: string; icon: 'play' | 'doc' | 'quote' | 'star'; bg: string }> = {
  video:   { label: 'Vídeo',  icon: 'play',  bg: 'oklch(0.30 0.13 24)' },
  article: { label: 'Artigo', icon: 'doc',   bg: 'oklch(0.34 0.07 235)' },
  essay:   { label: 'Ensaio', icon: 'quote', bg: 'oklch(0.34 0.075 290)' },
  review:  { label: 'Review', icon: 'star',  bg: 'oklch(0.40 0.085 78)' },
}

interface MovieDetailScreenProps {
  movieId: string
  /** Volta ao catálogo. */
  onBack: () => void
  /** Abre o LogModal pré-preenchido com este filme. */
  onLog: (movieId: string, title: string) => void
  /** Exibe um toast. */
  onToast: (msg: string) => void
}

/** Detalhe completo do filme em duas colunas (handoff §7.4). */
export function MovieDetailScreen({ movieId, onBack, onLog, onToast }: MovieDetailScreenProps) {
  const [data, setData] = useState<MovieDetail | null>(null)
  const [loading, setLoading] = useState(true)

  // Modais e estados das ações extras (funcionalidades do app real)
  const [showAddToList, setShowAddToList] = useState(false)
  const [showEditMovie, setShowEditMovie] = useState(false)
  const [showTmdbCandidates, setShowTmdbCandidates] = useState(false)
  const [refreshingMetadata, setRefreshingMetadata] = useState(false)
  const [confirmDeleteMovie, setConfirmDeleteMovie] = useState(false)
  const [deletingMovie, setDeletingMovie] = useState(false)
  const [busyToggle, setBusyToggle] = useState(false)

  // Busca o detalhe na montagem (ou ao trocar movieId)
  useEffect(() => {
    setLoading(true)
    akaneApi.detail(movieId)
      .then(res => setData({ movie: res.movie, people: res.people, vault: res.vault, diary: res.diary }))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [movieId])

  if (loading) {
    return <p className="ak-empty-state">Carregando filme…</p>
  }

  if (!data) {
    return (
      <div className="ak-page">
        <button className="ak-detail-back" onClick={onBack} style={{ paddingTop: 20 }}>
          <Icon name="arrowLeft" /> Filmes
        </button>
        <p className="ak-empty-state">Filme não encontrado.</p>
      </div>
    )
  }

  const { movie, people, vault, diary } = data
  const seen = movie.status === 'watched'

  // "Sua review" = a resenha da sessão mais recente que tem texto
  const latestReview = diary.find(e => e.review)?.review ?? null

  // Etiquetas que são pessoas (batem com movie_people.is_person_tag)
  const personTagNames = new Set(people.filter(p => p.is_person_tag).map(p => p.name))

  // ── Ações ────────────────────────────────────────────────────────────────

  const toggleLike = async () => {
    if (busyToggle) return
    setBusyToggle(true)
    try {
      await akaneApi.like(movie.id, !movie.liked)
      setData(d => d ? { ...d, movie: { ...d.movie, liked: !movie.liked } } : d)
      onToast(movie.liked ? 'Coração removido.' : 'Curtido!')
    } catch {
      onToast('Erro ao atualizar.')
    } finally {
      setBusyToggle(false)
    }
  }

  const toggleWant = async () => {
    if (busyToggle) return
    setBusyToggle(true)
    const next = seen ? 'watchlist' : 'watched'
    try {
      await akaneApi.updateStatus(movie.id, next)
      setData(d => d ? { ...d, movie: { ...d.movie, status: next } } : d)
      onToast(next === 'watched' ? 'Marcado como visto.' : 'Movido para a watchlist.')
    } catch {
      onToast('Erro ao atualizar.')
    } finally {
      setBusyToggle(false)
    }
  }

  // Rebusca metadados no TMDB (usa o tmdb_id salvo ou o candidato escolhido)
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
    <div className="ak-page">
      <button className="ak-detail-back" onClick={onBack}><Icon name="arrowLeft" /> Filmes</button>

      <div className="ak-detail-hero">
        {/* ══ COLUNA ESQUERDA (sticky): pôster + ações ══ */}
        <div className="ak-detail-poster-wrap">
          <Poster
            title={movie.title}
            posterUrl={movie.poster_url}
            palette={movie.poster_palette}
            genre={movie.genres?.[0]}
            director={movie.director?.[0]}
            year={movie.year}
          />
          <div className="ak-detail-actions">
            <button className="ak-btn ak-btn-primary" style={{ justifyContent: 'center' }}
                    onClick={() => onLog(movie.id, movie.title)}>
              <Icon name="plus" /> Logar filme
            </button>
            <div className="ak-action-row">
              <button className={'ak-icon-toggle ak-like' + (movie.liked ? ' ak-on' : '')} onClick={toggleLike}>
                <Heart filled={movie.liked} /> {movie.liked ? 'Curtido' : 'Curtir'}
              </button>
              <button className={'ak-icon-toggle ak-want' + (!seen ? ' ak-on' : '')} onClick={toggleWant}>
                <Icon name="watchlist" /> {!seen ? 'Na lista' : 'Quero ver'}
              </button>
            </div>

            {/* Ações extras do app real, no mesmo ritmo visual da coluna */}
            <button className="ak-btn ak-btn-ghost" style={{ justifyContent: 'center' }}
                    onClick={() => setShowAddToList(true)}>
              <Icon name="listas" /> Adicionar a lista
            </button>
            <button className="ak-btn ak-btn-ghost" style={{ justifyContent: 'center' }}
                    onClick={() => setShowEditMovie(true)}>
              <Icon name="pen" /> Editar filme
            </button>
            <div className="ak-action-row">
              <button className="ak-icon-toggle" onClick={() => refreshMetadata()} disabled={refreshingMetadata}
                      title="Rebusca metadados no TMDB sem tocar em nota, coração ou sessões">
                <Icon name="sync" /> {refreshingMetadata ? 'Buscando…' : 'Buscar dados'}
              </button>
              <button className="ak-icon-toggle" onClick={() => setShowTmdbCandidates(true)} disabled={refreshingMetadata}
                      title="Associado ao título errado? Escolha o candidato correto do TMDB.">
                <Icon name="film" /> Trocar filme
              </button>
            </div>

            {/* Exclusão em duas etapas (evita clique acidental) */}
            {!confirmDeleteMovie ? (
              <button className="ak-btn ak-btn-ghost" style={{ justifyContent: 'center', color: 'var(--heart)' }}
                      onClick={() => setConfirmDeleteMovie(true)}>
                <Icon name="trash" /> Excluir filme
              </button>
            ) : (
              <div className="ak-action-row">
                <button className="ak-icon-toggle" onClick={() => setConfirmDeleteMovie(false)} disabled={deletingMovie}>
                  Cancelar
                </button>
                <button className="ak-icon-toggle ak-on ak-like" disabled={deletingMovie}
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
                        }}>
                  {deletingMovie ? 'Excluindo…' : 'Confirmar'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ══ COLUNA DIREITA: informações ══ */}
        <div className="ak-detail-info">
          <div className="ak-detail-genre">{(movie.genres ?? []).join(' · ')}</div>
          <h1 className="ak-detail-title">{movie.title}</h1>
          <p className="ak-detail-author">
            {movie.year && <>{movie.year} · </>}
            dirigido por <b>{(movie.director ?? []).join(', ') || '—'}</b>
            {movie.runtime && <> · {fmtRuntime(movie.runtime)}</>}
          </p>

          {/* Linha de nota */}
          <div className="ak-detail-rating-row">
            {movie.rating != null ? (
              <><Stars value={movie.rating} lg /><span className="ak-rating-num" style={{ fontSize: 14 }}>{movie.rating.toFixed(1)}</span></>
            ) : <span className="ak-detail-empty">Ainda sem nota</span>}
            {movie.liked && <Heart filled className="ak-heart-ico ak-lg" />}
            {movie.rating_source === 'letterboxd' && (
              <span className="ak-rating-source"><span className="ak-lb" /> via Letterboxd</span>
            )}
            <span className={'ak-status-pill ' + (seen ? 'ak-seen' : 'ak-want')}>{seen ? 'Visto' : 'Quero ver'}</span>
          </div>

          {/* Grade de metadados */}
          <div className="ak-detail-meta-grid">
            <div className="ak-dm-cell"><div className="ak-k">Direção</div><div className="ak-v" style={{ fontSize: 13 }}>{(movie.director ?? []).join(', ') || '—'}</div></div>
            <div className="ak-dm-cell"><div className="ak-k">Ano</div><div className="ak-v">{movie.year ?? '—'}</div></div>
            <div className="ak-dm-cell"><div className="ak-k">Duração</div><div className="ak-v" style={{ fontSize: 13 }}>{fmtRuntime(movie.runtime)}</div></div>
            <div className="ak-dm-cell"><div className="ak-k">Gênero</div><div className="ak-v" style={{ fontSize: 13 }}>{(movie.genres ?? []).slice(0, 2).join(' · ') || '—'}</div></div>
            <div className="ak-dm-cell"><div className="ak-k">Sessões</div><div className="ak-v">{diary.length || '—'}</div></div>
          </div>

          {/* Sinopse (extra do app real — TMDB) */}
          {movie.overview && (
            <>
              <div className="ak-detail-section-title">Sinopse <span className="ak-st-line" /></div>
              <p className="ak-detail-synopsis">{movie.overview}</p>
            </>
          )}

          {/* Sua review (a resenha da sessão mais recente) */}
          <div className="ak-detail-section-title">Sua review <span className="ak-st-line" /></div>
          {latestReview
            ? <p className="ak-detail-review">{latestReview}</p>
            : <p className="ak-detail-empty">
                Você ainda não escreveu sobre este filme. {seen ? 'Registre uma sessão para começar.' : 'Ele te espera na watchlist.'}
              </p>}

          {/* Anotações soltas (≠ review) — editor inline preservado */}
          <NotesEditor movieId={movie.id} initialNotes={movie.notes} onToast={onToast} />

          {/* Cofre de conteúdos (CRUD real) */}
          <VaultSection
            movieId={movie.id}
            vault={vault}
            onToast={onToast}
            onChange={(newVault) => setData(d => d ? { ...d, vault: newVault } : d)}
          />

          {/* Etiquetas */}
          {(movie.tags?.length ?? 0) > 0 && (
            <>
              <div className="ak-detail-section-title">Etiquetas <span className="ak-st-line" /></div>
              <div className="ak-chips">
                {movie.tags.map(t => (
                  <span key={t} className={'ak-tag-chip' + (personTagNames.has(t) ? ' ak-person' : '')}>
                    {personTagNames.has(t)
                      ? <Icon name="user" style={{ width: 13, height: 13, color: 'var(--rose)' }} />
                      : <span className="ak-t-hash">#</span>}
                    {t}
                  </span>
                ))}
              </div>
            </>
          )}

          {/* Equipe (elenco/direção — preparação para a base de pessoas) */}
          {people.length > 0 && (
            <>
              <div className="ak-detail-section-title">Elenco e equipe <span className="ak-st-line" /></div>
              <div className="ak-chips">
                {people.map(p => (
                  <span key={p.id} className={'ak-tag-chip' + (p.is_person_tag ? ' ak-person' : '')} title={p.role ?? undefined}>
                    <Icon name="user" style={{ width: 13, height: 13, color: p.is_person_tag ? 'var(--rose)' : 'var(--ink-4)' }} />
                    {p.name}
                    {p.role && <span className="ak-t-count">{p.role}</span>}
                  </span>
                ))}
              </div>
            </>
          )}

          {/* Diário deste filme (com editar/excluir sessão) */}
          {diary.length > 0 && (
            <>
              <div className="ak-detail-section-title">Diário deste filme <span className="ak-st-line" /></div>
              <div className="ak-film-log">
                {diary.map(e => (
                  <FilmLogItem
                    key={e.id}
                    entry={e}
                    onToast={onToast}
                    onDeleted={(id) => setData(d => d ? { ...d, diary: d.diary.filter(x => x.id !== id) } : d)}
                    onUpdated={(updated, movieAgg) => setData(d => d ? {
                      ...d,
                      diary: d.diary.map(x => x.id === updated.id ? updated : x),
                      movie: { ...d.movie, ...movieAgg },
                    } : d)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ══ MODAIS ══ */}
      {showAddToList && (
        <AddToListModal movieId={movie.id} onClose={() => setShowAddToList(false)} onToast={onToast} />
      )}
      {showEditMovie && (
        <EditMovieModal
          movie={movie}
          onClose={() => setShowEditMovie(false)}
          onToast={onToast}
          onSaved={(updated) => setData(d => d ? { ...d, movie: updated } : d)}
        />
      )}
      {showTmdbCandidates && (
        <TmdbCandidatesModal
          initialQuery={movie.title}
          onClose={() => setShowTmdbCandidates(false)}
          onSelect={(tmdbId) => refreshMetadata(tmdbId)}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENTES
// ─────────────────────────────────────────────────────────────────────────────

/** Editor inline de anotações soltas (bloco "caderno" do handoff). */
function NotesEditor({ movieId, initialNotes, onToast }: {
  movieId: string; initialNotes: string | null; onToast: (msg: string) => void
}) {
  const [notes, setNotes] = useState(initialNotes ?? '')
  const [saved, setSaved] = useState(initialNotes ?? '')
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    setBusy(true)
    try {
      await akaneApi.setNotes(movieId, notes)
      setSaved(notes)
      setEditing(false)
      onToast('Anotações salvas.')
    } catch {
      onToast('Erro ao salvar anotações.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="ak-detail-section-title">
        Anotações
        {!editing && (
          <button className="ak-section-link" style={{ border: 'none', background: 'none', padding: 0 }}
                  onClick={() => setEditing(true)}>
            {saved ? 'Editar' : '＋ Adicionar'}
          </button>
        )}
        <span className="ak-st-line" />
      </div>

      {editing ? (
        <div className="ak-modal-field" style={{ margin: '4px 0 8px' }}>
          <textarea className="ak-note-input" value={notes} onChange={e => setNotes(e.target.value)}
                    placeholder="Suas reflexões soltas sobre o filme…" autoFocus />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="ak-btn ak-btn-primary" onClick={save} disabled={busy}>
              <Icon name="check" /> {busy ? 'Salvando…' : 'Salvar'}
            </button>
            <button className="ak-btn ak-btn-ghost" onClick={() => { setEditing(false); setNotes(saved) }}>Cancelar</button>
          </div>
        </div>
      ) : saved ? (
        <div className="ak-notes-block"><span className="ak-nb-tag">caderno</span>{saved}</div>
      ) : (
        <p className="ak-detail-empty">Nenhuma anotação ainda.</p>
      )}
    </>
  )
}

/** Cofre de conteúdos — galeria de cards por tipo + adicionar/remover. */
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
    <>
      <div className="ak-detail-section-title">
        Cofre de conteúdos {vault.length > 0 && <span style={{ color: 'var(--ink-4)' }}>· {vault.length}</span>}
        <span className="ak-st-line" />
      </div>
      <div className="ak-vault-grid">
        {vault.map(v => {
          const m = VAULT_META[v.type] || VAULT_META.article
          return (
            <div key={v.id} className="ak-vault-card">
              <div className="ak-vault-thumb" style={{ background: m.bg }}>
                <span className="ak-vt-type">{m.label}</span>
                <Icon name={m.icon} />
                {/* Remover (extra do app real — CRUD do Cofre) */}
                <button className="ak-vc-remove" title="Remover do Cofre"
                        disabled={removingId === v.id}
                        onClick={() => remove(v.id)}>
                  {removingId === v.id ? '…' : <Icon name="x" />}
                </button>
              </div>
              <div className="ak-vc-title">{v.title}</div>
              <div className="ak-vc-foot">
                <Icon name="link" style={{ width: 11, height: 11 }} /> {v.source ?? '—'}
                {v.url && (
                  <a className="ak-open" href={v.url} target="_blank" rel="noopener noreferrer">abrir →</a>
                )}
              </div>
            </div>
          )
        })}
        {!adding && (
          <button className="ak-vault-add" onClick={() => setAdding(true)}><Icon name="plus" /> Salvar conteúdo</button>
        )}
      </div>

      {/* Formulário de novo item (inputs no padrão do modal do handoff) */}
      {adding && (
        <div className="ak-modal-field" style={{ margin: '12px 0 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <select className="ak-text-input" value={type} onChange={e => setType(e.target.value as VaultType)}>
            <option value="video">Vídeo</option>
            <option value="article">Artigo</option>
            <option value="essay">Ensaio</option>
            <option value="review">Review</option>
          </select>
          <input className="ak-text-input" placeholder="Título" value={title}
                 onChange={e => setTitle(e.target.value)} autoFocus />
          <input className="ak-text-input" placeholder="URL (opcional)" value={url}
                 onChange={e => setUrl(e.target.value)} />
          <input className="ak-text-input" placeholder="Fonte (opcional, ex.: youtube.com)" value={source}
                 onChange={e => setSource(e.target.value)} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="ak-btn ak-btn-primary" onClick={save} disabled={busy || !title.trim()}>
              <Icon name="check" /> {busy ? 'Salvando…' : 'Salvar'}
            </button>
            <button className="ak-btn ak-btn-ghost" onClick={() => { setAdding(false); setTitle(''); setUrl(''); setSource('') }}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </>
  )
}

/** Item do "Diário deste filme" — timeline fl-item com editar/excluir sessão. */
function FilmLogItem({ entry, onToast, onDeleted, onUpdated }: {
  entry: MovieDetail['diary'][number]
  onToast: (msg: string) => void
  onDeleted: (id: string) => void
  onUpdated: (entry: MovieDetail['diary'][number], movieAgg: { last_watched_date: string | null; times_watched: number }) => void
}) {
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Campos do formulário de edição (inicializados da sessão)
  const [watchedDate, setWatchedDate] = useState(entry.watched_date)
  const [rating, setRating] = useState<number>(entry.rating ?? 0)
  const [review, setReview] = useState(entry.review ?? '')
  const [tags, setTags] = useState((entry.tags ?? []).join(', '))
  const [rewatch, setRewatch] = useState(entry.rewatch)
  const [companionIds, setCompanionIds] = useState((entry.companions ?? []).map(person => person.id))
  const [watchLocationId, setWatchLocationId] = useState<string | null>(entry.watch_location?.id ?? null)
  const [saving, setSaving] = useState(false)

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

  const doSave = async () => {
    setSaving(true)
    try {
      const res = await akaneApi.updateDiaryEntry(entry.id, {
        watched_date: watchedDate,
        rating: rating || undefined,
        review: review.trim() || undefined,
        tags: tags.split(',').map(t => t.trim()).filter(Boolean),
        rewatch,
        companion_ids: companionIds,
        watch_location_id: watchLocationId,
      })
      onUpdated(res.entry, res.movie)
      onToast('Sessão atualizada.')
      setEditing(false)
    } catch {
      onToast('Erro ao salvar a sessão.')
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <div className="ak-fl-item">
        <div className="ak-modal-field" style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: 0 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <input className="ak-date-input" type="date" value={watchedDate}
                   onChange={e => setWatchedDate(e.target.value)} style={{ width: 150 }} />
            <RateInput value={rating} onChange={setRating} />
            <button className={'ak-toggle-pill ak-rw' + (rewatch ? ' ak-on' : '')} onClick={() => setRewatch(v => !v)}>
              <Icon name="rewatch" /> Revisão
            </button>
          </div>
          <textarea className="ak-note-input" rows={2} placeholder="Resenha (opcional)" value={review}
                    onChange={e => setReview(e.target.value)} />
          <input className="ak-text-input" placeholder="Etiquetas separadas por vírgula (opcional)" value={tags}
                 onChange={e => setTags(e.target.value)} />
          <SessionContextFields companionIds={companionIds} onCompanionIdsChange={setCompanionIds}
            watchLocationId={watchLocationId} onWatchLocationIdChange={setWatchLocationId} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="ak-btn ak-btn-primary" onClick={doSave} disabled={saving}>
              <Icon name="check" /> {saving ? 'Salvando…' : 'Salvar'}
            </button>
            <button className="ak-btn ak-btn-ghost" onClick={() => setEditing(false)} disabled={saving}>Cancelar</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="ak-fl-item">
      <div className="ak-fl-date">
        {fmtDate(entry.watched_date)} · {new Date(entry.watched_date + 'T00:00:00').getFullYear()}
      </div>
      <div className="ak-fl-row">
        {entry.rating != null && <Stars value={entry.rating} />}
        {entry.rewatch && <span className="ak-feed-tag ak-rw">revisão</span>}
        {/* Chip de local/pessoa — movido pra dentro do fl-row (que já é flex) em vez de
            ficar num bloco abaixo, que "caía" pra uma linha própria. */}
        {((entry.companions ?? []).length > 0 || entry.watch_location) && (
          <div className="ak-chips">
            {(entry.companions ?? []).map(person => <span className="ak-meta-chip ak-person" key={person.id}><Icon name="user" />{person.name}</span>)}
            {entry.watch_location && <span className="ak-meta-chip"><Icon name={entry.watch_location.kind === 'cinema' ? 'cinema' : 'streaming'} />{entry.watch_location.name}</span>}
          </div>
        )}
        {/* Ações da sessão (extras do app real): editar / excluir */}
        <span className="ak-fl-actions">
          <button title="Editar sessão" onClick={() => setEditing(true)}><Icon name="pen" /></button>
          {!confirming
            ? <button title="Excluir sessão" onClick={() => setConfirming(true)}><Icon name="x" /></button>
            : <>
                <button onClick={() => setConfirming(false)}>cancelar</button>
                <button className="ak-danger" onClick={doDelete} disabled={deleting}>{deleting ? '…' : 'confirmar'}</button>
              </>}
        </span>
      </div>
      {entry.review && <div className="ak-fl-note">"{entry.review}"</div>}
    </div>
  )
}
