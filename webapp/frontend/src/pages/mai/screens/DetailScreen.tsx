// DetailScreen — tela de detalhe de uma série.
// Layout: banner (backdrop + poster + info) + progress card + acordeão de temporadas + logs.
//
// Novidades:
//   - StatusChip clicável no banner (abre menu de 5 status sem precisar do painel Editar)
//   - Data do próximo episódio exibida no cartão de progresso
//   - SeasonAccordion com onProgressChange={load} para atualizar progresso após checkbox

import { useState, useEffect, useCallback } from 'react'
import type { SeriesDetail, MaiStatus } from '../types'
import { maiApi } from '../maiApi'
import { PosterCard } from '../components/PosterCard'
import { StatusChip } from '../components/StatusChip'
import { Stars, RateInput } from '../components/Stars'
import { SeasonAccordion } from '../components/SeasonAccordion'
import { IconArrowL, IconEdit, IconRefresh, IconTrash, IconCheck } from '../components/MaiIcons'

interface Props {
  seriesId: string
  onBack: () => void
  onOpenLog: (seriesId: string, title: string) => void
  onShowToast: (msg: string) => void
}

/** DetailScreen — tela completa de uma série com temporadas e logs. */
export function DetailScreen({ seriesId, onBack, onOpenLog, onShowToast }: Props) {
  const [detail,  setDetail]  = useState<SeriesDetail | null>(null)
  const [loading, setLoading] = useState(true)
  // Painel de edição inline (exibe apenas a avaliação — status agora vive no chip)
  const [editing, setEditing] = useState(false)

  /**
   * Recarrega os dados completos da série do backend.
   * Chamado no mount, após sync de metadados e após cada toggle de episódio
   * (via onProgressChange no SeasonAccordion) para manter a barra e watched_count atualizados.
   */
  const load = useCallback(() => {
    setLoading(true)
    maiApi.detail(seriesId)
      .then(res => setDetail(res as unknown as SeriesDetail))
      .catch(() => setDetail(null))
      .finally(() => setLoading(false))
  }, [seriesId])

  useEffect(() => { load() }, [load])

  /**
   * Altera o status da série via API.
   * Chamado pelo StatusChip interativo no banner (modo: chip clicável com menu).
   * Também atualiza o state local otimisticamente para resposta imediata.
   */
  async function handleStatusChange(status: MaiStatus) {
    if (!detail) return
    await maiApi.updateStatus(seriesId, { status })
    // Atualiza o estado local sem refetch completo (a barra de progresso não muda com status)
    setDetail(d => d ? { ...d, series: { ...d.series, status } } : d)
    onShowToast(`Status: ${status.replace(/_/g, ' ')}`)
  }

  /** Atualiza a nota da série e reflete localmente. */
  async function handleRate(rating: number | null) {
    if (!detail) return
    await maiApi.rate(seriesId, { rating })
    setDetail(d => d ? { ...d, series: { ...d.series, rating } } : d)
    onShowToast(rating ? `Nota: ${rating.toFixed(1)} ⭐` : 'Nota removida')
  }

  /** Aciona sincronização de metadados via TMDB e recarrega os dados. */
  async function handleSync() {
    onShowToast('Sincronizando metadados…')
    await maiApi.syncMetadata(seriesId)
    load()
    onShowToast('Metadados atualizados! 🐰')
  }

  /** Remove a série do catálogo com soft delete. */
  async function handleDelete() {
    if (!detail) return
    if (!window.confirm(`Remover "${detail.series.title}" do catálogo?`)) return
    await maiApi.delete(seriesId)
    onBack()
  }

  if (loading) {
    return (
      <div className="page" style={{ paddingTop: 48, textAlign: 'center', color: 'var(--ink-3)' }}>
        Carregando…
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="page" style={{ paddingTop: 48 }}>
        <button className="detail-back" onClick={onBack}><IconArrowL /> Voltar</button>
        <div className="empty-state" style={{ marginTop: 32 }}>Série não encontrada.</div>
      </div>
    )
  }

  const s = detail.series
  const year    = s.first_air_date ? new Date(s.first_air_date + 'T00:00:00').getFullYear() : null
  const endYear = s.last_air_date  ? new Date(s.last_air_date  + 'T00:00:00').getFullYear() : null
  const yearRange = endYear && endYear !== year ? `${year}–${endYear}` : String(year ?? '')

  // Cálculo de progresso para a barra de episódios
  const epTotal   = s.episodes_count   ?? 0
  const epWatched = s.episodes_watched ?? 0
  const progress  = epTotal > 0 ? Math.min(1, epWatched / epTotal) : 0

  // Data do próximo episódio formatada — exibida no cartão de progresso
  const nextEpDate = detail.next_episode?.air_date
    ? new Date(detail.next_episode.air_date + 'T00:00:00').toLocaleDateString('pt-BR', {
        day: 'numeric', month: 'short',
      })
    : null

  return (
    <div className="page">
      {/* ── Botão voltar ─────────────────────────────────────────────────── */}
      <button className="detail-back" onClick={onBack}>
        <IconArrowL /> Voltar
      </button>

      {/* ── Banner: backdrop + poster + info ─────────────────────────────── */}
      <div className="detail-banner">
        <div className="detail-banner-bg">
          {s.backdrop_url ? (
            <img src={s.backdrop_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, var(--paper-2), var(--card))' }} />
          )}
        </div>
        <div className="detail-warmlight" />
        <div className="detail-hero">
          {/* Pôster */}
          <div className="detail-poster-wrap">
            <PosterCard series={s} />
          </div>

          {/* Info: gêneros, título, rede/ano, status (clicável) + nota */}
          <div className="detail-info">
            {s.genres && s.genres.length > 0 && (
              <div className="detail-genre">{s.genres.slice(0, 2).join(' · ')}</div>
            )}
            <h1 className="detail-title">{s.title}</h1>
            <div className="detail-alt">
              {yearRange && <b>{yearRange}</b>}
              {s.network && <> · <i>{s.network}</i></>}
              {s.seasons_count && <> · {s.seasons_count} temporadas</>}
              {s.series_status && (
                <> · <span style={{ color: s.series_status === 'no_ar' ? 'var(--st-assistindo)' : 'var(--ink-3)' }}>
                  {s.series_status === 'no_ar' ? '● No ar' : s.series_status === 'finalizada' ? 'Finalizada' : s.series_status}
                </span></>
              )}
            </div>

            {/* Status (chip clicável — abre menu) + nota */}
            <div className="detail-rating-row">
              {/* StatusChip em modo interativo: onSelect dispara handleStatusChange */}
              <StatusChip status={s.status} size="md" onSelect={handleStatusChange} />
              {s.rating && <Stars rating={s.rating} size="md" showNum />}
            </div>
          </div>
        </div>
      </div>

      {/* ── Corpo ────────────────────────────────────────────────────────── */}
      <div className="detail-body">
        {/* ── Ações rápidas ──────────────────────────────────────────────── */}
        <div className="detail-actions">
          <button
            className="btn btn-primary"
            onClick={() => onOpenLog(seriesId, s.title)}
          >
            📺 Registrar sessão
          </button>
          {/* Botão Editar: abre painel com a avaliação (status agora fica no chip) */}
          <button className="btn btn-ghost icon-toggle" onClick={() => setEditing(e => !e)}>
            <IconEdit /> Editar
          </button>
          <button className="btn btn-ghost icon-toggle" onClick={handleSync} title="Sincronizar TMDB">
            <IconRefresh />
          </button>
          <button
            className="btn btn-ghost icon-toggle"
            onClick={handleDelete}
            style={{ marginLeft: 'auto', color: 'var(--st-abandonada)' }}
          >
            <IconTrash />
          </button>
        </div>

        {/* Painel de edição inline — agora só contém avaliação (status foi para o chip) */}
        {editing && (
          <div className="detail-progress-card" style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label className="modal-label">Avaliação</label>
                <RateInput value={s.rating ?? null} onChange={handleRate} />
              </div>
            </div>
          </div>
        )}

        {/* ── Cartão de progresso de episódios ─────────────────────────── */}
        {epTotal > 0 && (
          <div className="detail-progress-card">
            <div className="dpc-head">
              <span className="t">Progresso</span>
              {detail.next_episode && (
                // Exibe: "● Próximo: T1 E5 · Título · 20 jun" (data agora incluída)
                <span className="dpc-next">
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--warm)', display: 'inline-block' }} />
                  Próximo: T{detail.next_episode.season_number} E{detail.next_episode.episode_number}
                  {detail.next_episode.title && <b> · {detail.next_episode.title}</b>}
                  {/* Data de lançamento do próximo episódio — novo */}
                  {nextEpDate && <span className="dpc-next-date"> · {nextEpDate}</span>}
                </span>
              )}
            </div>
            {/* Barra de progresso */}
            <div style={{ height: 7, borderRadius: 999, background: 'var(--line)', overflow: 'hidden', marginBottom: 8 }}>
              <div style={{
                height: '100%', borderRadius: 999,
                width: `${progress * 100}%`,
                background: progress >= 1
                  ? 'linear-gradient(90deg, var(--st-concluida), oklch(0.82 0.14 150))'
                  : 'linear-gradient(90deg, var(--mai), var(--mai-bright))',
                transition: 'width 0.4s',
              }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--ink-3)', fontFamily: 'var(--mono)' }}>
              <span style={{ color: progress >= 1 ? 'var(--st-concluida)' : 'var(--mai-deep)' }}>
                {epWatched} de {epTotal} episódios
                {progress >= 1 && <> <IconCheck style={{ width: 13, height: 13, verticalAlign: 'middle' }} /></>}
              </span>
              <span>{Math.round(progress * 100)}%</span>
            </div>
          </div>
        )}

        {/* ── Grid: sinopse + metadados ─────────────────────────────────── */}
        <div className="detail-grid">
          {/* Sinopse + notas */}
          <div>
            <div className="detail-section-title">
              Sinopse <span className="st-line" />
            </div>
            {s.overview ? (
              <div className="detail-synopsis">{s.overview}</div>
            ) : (
              <div className="detail-empty">Sinopse não disponível.</div>
            )}

            {s.notes && (
              <div className="notes-block">
                <span className="nb-tag">🐰 Notas</span>
                {s.notes}
              </div>
            )}
          </div>

          {/* Metadados da série */}
          <div>
            <div className="detail-section-title">
              Informações <span className="st-line" />
            </div>
            <div className="detail-meta-grid">
              {s.network        && <div className="dm-cell"><div className="k">Rede</div><div className="v">{s.network}</div></div>}
              {yearRange        && <div className="dm-cell"><div className="k">Anos</div><div className="v">{yearRange}</div></div>}
              {s.seasons_count  && <div className="dm-cell"><div className="k">Temporadas</div><div className="v">{s.seasons_count}</div></div>}
              {s.episodes_count && <div className="dm-cell"><div className="k">Episódios</div><div className="v">{s.episodes_count}</div></div>}
              {s.date_started   && <div className="dm-cell"><div className="k">Início</div><div className="v">{new Date(s.date_started + 'T00:00:00').toLocaleDateString('pt-BR')}</div></div>}
              {s.date_finished  && <div className="dm-cell"><div className="k">Conclusão</div><div className="v">{new Date(s.date_finished + 'T00:00:00').toLocaleDateString('pt-BR')}</div></div>}
            </div>

            {/* Tags de gênero */}
            {s.genres && s.genres.length > 0 && (
              <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {s.genres.map(g => (
                  <span key={g} className="tag-chip">{g}</span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Acordeão de temporadas ────────────────────────────────────── */}
        {detail.seasons.length > 0 && (
          <div style={{ marginTop: 32 }}>
            <div className="detail-section-title" style={{ marginBottom: 18 }}>
              Temporadas <span className="st-line" />
            </div>
            <SeasonAccordion
              seriesId={seriesId}
              seasons={detail.seasons}
              /**
               * Após marcar/desmarcar um episódio pelo checkbox, o accordion
               * dispara onProgressChange para recarregar o detalhe completo:
               * barra de progresso, watched_count das temporadas e next_episode.
               */
              onProgressChange={load}
              /**
               * Mantido para compatibilidade: o botão "Registrar sessão" ainda
               * pode ser acessado via clique no episódio (legado — hoje o clique
               * expande a sinopse; o log rico é feito pelo botão "Registrar sessão").
               */
              onEpisodeToggle={() => onOpenLog(seriesId, s.title)}
            />
          </div>
        )}

        {/* ── Histórico de sessões ──────────────────────────────────────── */}
        {detail.recent_logs.length > 0 && (
          <div style={{ marginTop: 36 }}>
            <div className="detail-section-title" style={{ marginBottom: 18 }}>
              Sessões recentes <span className="st-line" />
            </div>
            <div className="sess-log">
              {detail.recent_logs.map(log => {
                let epsLabel = ''
                if (log.season_number && log.ep_start) {
                  const end = log.ep_end && log.ep_end !== log.ep_start ? `–E${log.ep_end}` : ''
                  epsLabel = `T${log.season_number} E${String(log.ep_start).padStart(2, '0')}${end}`
                } else if (log.episodes_count) {
                  epsLabel = `${log.episodes_count} eps`
                }
                return (
                  <div key={log.id} className="sess-item">
                    <div className="sess-date">
                      {new Date(log.watched_date + 'T00:00:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </div>
                    <div className="sess-row">
                      {epsLabel && <span className="sess-eps">{epsLabel}</span>}
                      {log.rating && <Stars rating={log.rating} size="sm" showNum />}
                    </div>
                    {log.review && <div className="sess-note">{log.review}</div>}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
