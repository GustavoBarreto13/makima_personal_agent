// AnimeDetail.tsx — Tela de detalhe de anime (Fase 4 — pixel-perfect).
// Implementa o layout fiel ao protótipo screens-a.jsx / 03-detalhe.png:
//   1. Banner (imagem real ou gradiente de paleta) + overlay escuro + hero com pôster flutuante
//   2. Barra de gêneros + informações + rating row (Stars + coração) + select de status
//   3. Barra de ações: logar, favoritar, remover
//   4. Progresso de episódios + próximo ep
//   5. Grid 2 colunas: esquerda (sinopse + caderno + episódios) | direita (ficha + gêneros + histórico)
// Dados: marinApi.detail(id) + marinApi.episodes(id, page) para paginação.

import { useState, useEffect } from 'react'
import { marinApi }            from './marinApi'
import type { AnimeDetail as AnimeDetailData, Episode, Status } from './types'
import { PosterCard }          from './components/PosterCard'
import { StatusChip }          from './components/StatusChip'
import { Score }               from './components/Score'
import { EpisodeProgress }     from './components/EpisodeProgress'
import { EpisodeLine }         from './components/EpisodeLine'
import { Stars }               from './components/Stars'
import { Icon }                from './components/Icon'

// ── Paletas do pôster tipográfico (12 opções, mesmas do PosterCard e HomeScreen) ──
// Usadas para gerar o gradiente do banner quando banner_url é null.
const POSTER_PALETTES: Record<string, { a: string; b: string; ink: string }> = {
  magenta: { a: 'oklch(0.55 0.28 330)', b: 'oklch(0.38 0.20 310)', ink: 'oklch(0.97 0.01 300)' },
  violet:  { a: 'oklch(0.52 0.26 280)', b: 'oklch(0.36 0.18 265)', ink: 'oklch(0.97 0.01 300)' },
  cyan:    { a: 'oklch(0.60 0.20 210)', b: 'oklch(0.40 0.16 225)', ink: 'oklch(0.97 0.01 300)' },
  emerald: { a: 'oklch(0.58 0.20 155)', b: 'oklch(0.38 0.16 165)', ink: 'oklch(0.97 0.01 300)' },
  amber:   { a: 'oklch(0.72 0.20 75)',  b: 'oklch(0.50 0.18 55)',  ink: 'oklch(0.14 0.018 300)' },
  sunset:  { a: 'oklch(0.65 0.24 40)',  b: 'oklch(0.42 0.20 25)',  ink: 'oklch(0.97 0.01 300)' },
  indigo:  { a: 'oklch(0.50 0.24 265)', b: 'oklch(0.33 0.18 280)', ink: 'oklch(0.97 0.01 300)' },
  rose:    { a: 'oklch(0.62 0.26 10)',  b: 'oklch(0.42 0.20 350)', ink: 'oklch(0.97 0.01 300)' },
  teal:    { a: 'oklch(0.58 0.18 185)', b: 'oklch(0.38 0.14 195)', ink: 'oklch(0.97 0.01 300)' },
  lime:    { a: 'oklch(0.72 0.22 125)', b: 'oklch(0.50 0.18 135)', ink: 'oklch(0.14 0.018 300)' },
  plum:    { a: 'oklch(0.48 0.22 310)', b: 'oklch(0.32 0.16 295)', ink: 'oklch(0.97 0.01 300)' },
  sky:     { a: 'oklch(0.65 0.18 225)', b: 'oklch(0.44 0.14 240)', ink: 'oklch(0.97 0.01 300)' },
}

// Chave usada para armazenar favoritos no localStorage
const FAVORITES_KEY = 'marin.favorites'

// Lê o array de IDs favoritos do localStorage
function readFavorites(): string[] {
  try {
    const stored = localStorage.getItem(FAVORITES_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      // Garante que é um array de strings
      if (Array.isArray(parsed)) return parsed.filter((x: unknown) => typeof x === 'string')
    }
  } catch {
    // Ignora erro de JSON inválido
  }
  return []
}

// Grava o array de IDs favoritos no localStorage
function writeFavorites(ids: string[]) {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(ids))
  } catch {
    // Ignora erro de localStorage cheio
  }
}

// Props da tela de detalhe — injetadas pelo MarinShell
interface AnimeDetailProps {
  // ID do anime no banco (UUID)
  animeId: string
  // Callback para voltar à tela anterior
  onBack: () => void
  // Callback para abrir o modal de log (ep opcional = logar sessão livre)
  onLog: (animeId: string, epNumber?: number) => void
  // Callback para exibir toast de notificação temporária
  onToast: (msg: string) => void
}

/**
 * Tela de detalhe de anime — pixel-perfect vs. protótipo 03-detalhe.png.
 *
 * Carrega dados do backend e exibe banner de fundo, pôster flutuante,
 * metadados, rating com estrelas, progresso, episódios paginados,
 * caderno da Marin, ficha técnica e histórico de sessões.
 */
export function AnimeDetail({ animeId, onBack, onLog, onToast }: AnimeDetailProps) {
  // Dados completos do detalhe (anime + próximo ep + logs)
  const [detail, setDetail]         = useState<AnimeDetailData | null>(null)
  // Estado de carregamento inicial
  const [loading, setLoading]       = useState(true)
  // Episódios carregados no momento (acumulam ao paginar)
  const [episodes, setEpisodes]     = useState<Episode[]>([])
  // Página atual de episódios
  const [epPage, setEpPage]         = useState(1)
  // Indica se há mais episódios para carregar
  const [hasMoreEps, setHasMoreEps] = useState(false)
  // Status local — atualizado optimisticamente sem refetch
  const [localStatus, setLocalStatus] = useState<Status | null>(null)
  // Nota local — atualizada optimisticamente
  const [localScore, setLocalScore]   = useState<number | null | undefined>(undefined)
  // Favorito — lido do localStorage e atualizado ao clicar no coração
  const [isFavorite, setIsFavorite]   = useState(false)
  // Controle do diálogo de confirmação de exclusão
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Busca os dados do detalhe + primeiros 12 episódios ao montar
  useEffect(() => {
    // Flag para evitar atualizar o estado se o componente for desmontado
    // ou se animeId mudar antes da resposta chegar (corrida de requisições)
    let ignorar = false

    setLoading(true)
    // Verifica se o anime já está nos favoritos do localStorage
    setIsFavorite(readFavorites().includes(animeId))

    marinApi.detail(animeId)
      .then(d => {
        if (ignorar) return  // Descarta resposta se componente já desmontou ou animeId mudou
        setDetail(d)
        // Inicializa o status e nota locais com os valores do banco
        setLocalStatus(d.anime?.status ?? null)
        setLocalScore(d.anime?.score ?? null)
        // Usa os episódios que já vieram embutidos na resposta de detalhe
        setEpisodes(d.episodes ?? [])
        // Determina se há mais episódios além dos primeiros 12
        setHasMoreEps((d.episodes ?? []).length < (d.episodes_total_cached ?? 0))
        setEpPage(1)
      })
      .catch(() => {
        if (ignorar) return  // Descarta erro se componente já desmontou
        onToast('Erro ao carregar o anime.')
      })
      .finally(() => {
        // Só atualiza o loading se o efeito ainda for válido
        if (!ignorar) setLoading(false)
      })

    // Função de cleanup: marca como ignorar quando o efeito é reexecutado ou componente desmonta
    return () => { ignorar = true }
  }, [animeId])

  // Carrega a próxima página de episódios e acumula no estado
  function loadMoreEps() {
    const nextPage = epPage + 1
    marinApi.episodes(animeId, nextPage)
      .then(res => {
        // Usa o updater funcional do setEpisodes para obter o array atual
        // e calcula hasMoreEps a partir do resultado real, não da closure
        setEpisodes(prev => {
          // Concatena os episódios novos com os já carregados
          const atualizado = [...prev, ...res.episodes]
          // Atualiza hasMoreEps aqui, após ter o array correto
          setHasMoreEps(atualizado.length < res.total)
          return atualizado
        })
        setEpPage(nextPage)
      })
      .catch(() => onToast('Erro ao carregar episódios.'))
  }

  // Altera o status do anime e atualiza localmente (sem refetch)
  function handleStatusChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newStatus = e.target.value as Status
    marinApi.updateStatus(animeId, { status: newStatus })
      .then(() => {
        setLocalStatus(newStatus)
        onToast(`Status atualizado para "${newStatus}".`)
      })
      .catch(() => onToast('Erro ao atualizar status.'))
  }

  // Alterna o estado de favorito no localStorage e na UI
  function toggleFavorite() {
    const favs = readFavorites()
    const idx = favs.indexOf(animeId)
    let updated: string[]
    if (idx === -1) {
      // Adiciona ao favoritos
      updated = [...favs, animeId]
      setIsFavorite(true)
      onToast('Adicionado aos favoritos! 💖')
    } else {
      // Remove dos favoritos
      updated = favs.filter(id => id !== animeId)
      setIsFavorite(false)
      onToast('Removido dos favoritos.')
    }
    writeFavorites(updated)
  }

  // Remove o anime do catálogo (soft delete) e volta para a tela anterior
  function handleDelete() {
    marinApi.deleteAnime(animeId)
      .then(() => {
        onToast('Anime removido.')
        onBack()
      })
      .catch(() => {
        onToast('Erro ao remover anime.')
        setShowDeleteConfirm(false)
      })
  }

  // Estado de carregamento: spinner centralizado
  if (loading) {
    return (
      <div className="mr-detail-loading">
        <div className="mr-spinner" />
      </div>
    )
  }

  // Erro ou anime não encontrado
  if (!detail) {
    return (
      <div className="mr-detail-error">
        <p>Anime não encontrado.</p>
        <button className="mr-btn" onClick={onBack}>← Voltar</button>
      </div>
    )
  }

  // Desestrutura os dados do detalhe
  const { anime, next_episode, recent_logs } = detail

  // Usa o status e nota locais se disponíveis (atualização optimista)
  const status = (localStatus ?? anime.status) as Status
  const score  = localScore !== undefined ? localScore : anime.score

  // Determina a paleta de cor do banner a partir do poster_key do anime
  const palette = POSTER_PALETTES[anime.poster_key ?? 'cyan'] ?? POSTER_PALETTES.cyan

  // Estilo do banner: imagem real se disponível, gradiente de paleta como fallback
  const bannerStyle: React.CSSProperties = anime.banner_url
    ? { backgroundImage: `url(${anime.banner_url})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { background: `linear-gradient(155deg, ${palette.a}, ${palette.b})` }

  return (
    <div className="mr-detail">

      {/* ── Botão de voltar ──────────────────────────────────────────────────── */}
      <button className="mr-detail-back" onClick={onBack}>
        <Icon name="arrow-left" size={15} /> Voltar
      </button>

      {/* ── Banner: imagem/gradiente + overlay escuro + hero com pôster ─────── */}
      <div className="mr-detail-banner" style={bannerStyle}>
        {/* Overlay: gradiente escuro da esquerda para a direita */}
        <div className="mr-detail-banner-overlay" />

        {/* Hero: pôster flutuante + info do anime à direita */}
        <div className="mr-detail-hero">

          {/* Pôster flutuante com badge de favorito */}
          <div className="mr-detail-poster-wrap">
            <PosterCard
              title={anime.title}
              posterUrl={anime.poster_url}
              posterKey={anime.poster_key}
            >
              {/* Badge de coração no topo do pôster */}
              <button
                className="mr-detail-fav-badge"
                onClick={toggleFavorite}
                aria-label="Favoritar"
              >
                <Icon
                  name="heart"
                  size={16}
                  style={{
                    // Coração preenchido se favorito, contorno se não
                    fill:        isFavorite ? 'var(--heart)' : 'none',
                    stroke:      'var(--heart)',
                    strokeWidth: 1.8,
                    color:       'var(--heart)',
                  }}
                />
              </button>
            </PosterCard>
          </div>

          {/* Informações do anime: barra de gêneros, título, subtítulo, rating, status */}
          <div className="mr-detail-info">
            {/* Barra de gêneros — dentro da coluna de info, acima do título */}
            {(anime.genres ?? []).length > 0 && (
              <p className="mr-detail-genres-bar">
                {anime.genres.slice(0, 3).map(g => g.toUpperCase()).join(' · ')}
              </p>
            )}
            <h1 className="mr-detail-title">{anime.title}</h1>

            {/* Subtítulo: título japonês · estúdio · temporada · tipo de mídia */}
            <p className="mr-detail-subtitle">
              {[
                anime.title_japanese,
                anime.studio,
                anime.season,
                anime.media_type?.toUpperCase(),
              ].filter(Boolean).join(' · ')}
            </p>

            {/* Linha de rating: estrelas + nota numérica + coração + chip de status */}
            <div className="mr-detail-rating-row">
              {/* 10 estrelas representando a nota MAL */}
              <Stars score={score} size={18} />
              {/* Nota numérica (ex.: "7.5 / 10") */}
              <span className="mr-detail-score-num">
                {score != null && score > 0 ? `${score} / 10` : '— / 10'}
              </span>
              {/* Botão de coração inline (alternativo ao do pôster) */}
              <button
                className="mr-detail-heart"
                onClick={toggleFavorite}
                aria-label="Favoritar"
              >
                <Icon
                  name="heart"
                  size={18}
                  style={{
                    fill:  isFavorite ? 'var(--heart)' : 'none',
                    color: 'var(--heart)',
                  }}
                />
              </button>
              {/* Chip de status colorido por estado */}
              <StatusChip status={status} />
            </div>

            {/* Select de status — permite troca direta sem abrir modal */}
            <select
              className="mr-select mr-detail-status-select"
              value={status}
              onChange={handleStatusChange}
              aria-label="Status do anime"
            >
              <option value="assistindo">Assistindo</option>
              <option value="quero_assistir">Quero assistir</option>
              <option value="completo">Completo</option>
              <option value="pausado">Pausado</option>
              <option value="abandonado">Abandonado</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── Barra de ações ─────────────────────────────────────────────────────── */}
      <div className="mr-detail-actions">
        {/* Logar próximo ep ou sessão livre */}
        <button
          className="mr-btn mr-btn--primary"
          onClick={() => onLog(animeId, next_episode?.number)}
        >
          {next_episode ? `▶ Logar ep ${next_episode.number}` : '▶ Logar sessão'}
        </button>

        {/* Botão de favoritar — ativo quando já favoritado */}
        <button
          className={`mr-btn mr-detail-fav-btn${isFavorite ? ' active' : ''}`}
          onClick={toggleFavorite}
        >
          <Icon
            name="heart"
            size={16}
            style={{ fill: isFavorite ? 'var(--heart)' : 'none', color: 'var(--heart)' }}
          />
          {isFavorite ? 'Favoritado' : 'Favoritar'}
        </button>

        {/* Botão de remover do catálogo */}
        <button
          className="mr-btn mr-detail-delete-btn"
          onClick={() => setShowDeleteConfirm(true)}
        >
          <Icon name="delete" size={16} /> Remover
        </button>
      </div>

      {/* ── Confirmação de exclusão (inline) ──────────────────────────────────── */}
      {showDeleteConfirm && (
        <div className="mr-detail-delete-confirm">
          <p>Remover este anime do catálogo?</p>
          <button className="mr-btn mr-btn--primary" onClick={handleDelete}>
            Confirmar
          </button>
          <button className="mr-btn" onClick={() => setShowDeleteConfirm(false)}>
            Cancelar
          </button>
        </div>
      )}

      {/* ── Card de progresso de episódios + próximo ep ────────────────────────── */}
      <div className="mr-detail-progress-card">
        {/* Barra de progresso com número de eps assistidos/total */}
        <EpisodeProgress
          watched={anime.episodes_watched ?? 0}
          total={anime.episodes_total}
        />
        {/* Informação do próximo episódio (se existir) */}
        {next_episode && (
          <p className="mr-detail-next-ep">
            Próximo: Ep {next_episode.number}
            {next_episode.title ? ` · ${next_episode.title}` : ''}
            {next_episode.aired && ` · ${new Date(next_episode.aired + 'T12:00:00').toLocaleDateString('pt-BR')}`}
          </p>
        )}
      </div>

      {/* ── Grid de 2 colunas: esquerda + direita ─────────────────────────────── */}
      <div className="mr-detail-grid">

        {/* COLUNA ESQUERDA: sinopse, caderno, lista de episódios */}
        <div className="mr-detail-col-left">

          {/* Sinopse do anime */}
          {anime.overview && (
            <section className="mr-detail-section">
              <h2 className="mr-detail-section-title">Sinopse</h2>
              <p className="mr-detail-overview">{anime.overview}</p>
            </section>
          )}

          {/* Caderno da Marin — notas pessoais do usuário */}
          {anime.notes && (
            <section className="mr-detail-section mr-notes-block">
              <h2 className="mr-detail-section-title">caderno da Marin ✨</h2>
              <p className="mr-detail-notes">{anime.notes}</p>
            </section>
          )}

          {/* Lista de episódios com paginação */}
          <section className="mr-detail-section">
            <h2 className="mr-detail-section-title">
              Episódios · {anime.episodes_total ?? '?'}
            </h2>
            <div className="mr-ep-list" role="list">
              {episodes.map(ep => (
                <EpisodeLine
                  key={ep.id}
                  episode={ep}
                  // Só exibe botão de logar se o ep ainda não foi assistido
                  onLog={!ep.watched ? (e) => onLog(animeId, e.number) : undefined}
                />
              ))}
              {/* Estado vazio: sem episódios no cache */}
              {episodes.length === 0 && (
                <p style={{ fontSize: 13, color: 'var(--ink-4)', padding: '12px 0', fontStyle: 'italic' }}>
                  Nenhum episódio no cache ainda.
                </p>
              )}
            </div>
            {/* Botão de carregar mais episódios */}
            {hasMoreEps && (
              <button
                className="mr-btn mr-load-more"
                onClick={loadMoreEps}
                style={{ marginTop: 10, width: '100%' }}
              >
                Carregar mais
              </button>
            )}
          </section>
        </div>

        {/* COLUNA DIREITA: ficha técnica, gêneros, histórico de sessões */}
        <div className="mr-detail-col-right">

          {/* Ficha técnica: grade 2×3 com metadados do anime */}
          <section className="mr-detail-section">
            <h2 className="mr-detail-section-title">Ficha</h2>
            <div className="mr-detail-meta-grid">
              <div className="mr-meta-cell">
                <span className="mr-meta-label">Estúdio</span>
                <span className="mr-meta-value">{anime.studio ?? '—'}</span>
              </div>
              <div className="mr-meta-cell">
                <span className="mr-meta-label">Temporada</span>
                <span className="mr-meta-value">{anime.season ?? '—'}</span>
              </div>
              <div className="mr-meta-cell">
                <span className="mr-meta-label">Formato</span>
                <span className="mr-meta-value">{anime.media_type?.toUpperCase() ?? '—'}</span>
              </div>
              <div className="mr-meta-cell">
                <span className="mr-meta-label">Episódios</span>
                <span className="mr-meta-value">
                  {anime.episodes_total ?? 'Em exibição'}
                </span>
              </div>
              <div className="mr-meta-cell">
                <span className="mr-meta-label">Progresso</span>
                <span className="mr-meta-value">
                  {anime.episodes_watched}/{anime.episodes_total ?? '?'}
                </span>
              </div>
              <div className="mr-meta-cell">
                <span className="mr-meta-label">Sessões</span>
                <span className="mr-meta-value">
                  {(recent_logs ?? []).length || '0'}
                </span>
              </div>
            </div>
          </section>

          {/* Gêneros do anime em chips */}
          {(anime.genres ?? []).length > 0 && (
            <section className="mr-detail-section">
              <h2 className="mr-detail-section-title">Gêneros</h2>
              <div className="mr-detail-genres-chips">
                {anime.genres.map(g => (
                  <span key={g} className="mr-tag">{g}</span>
                ))}
                {/* Chip de favorito — aparece quando isFavorite é true */}
                {isFavorite && (
                  <span className="mr-tag mr-tag-fav">💖 Favorito</span>
                )}
              </div>
            </section>
          )}

          {/* Histórico de sessões — lista cronológica de logs */}
          {(recent_logs ?? []).length > 0 && (
            <section className="mr-detail-section">
              <h2 className="mr-detail-section-title">Histórico de sessões</h2>
              <div className="mr-sess-log">
                {recent_logs.map(log => (
                  <div key={log.id} className="mr-sess-item">
                    {/* Data da sessão formatada em pt-BR */}
                    <div className="mr-sess-date">
                      {new Date(log.watched_date + 'T12:00:00').toLocaleDateString('pt-BR', {
                        day:   '2-digit',
                        month: 'short',
                        year:  '2-digit',
                      })}
                    </div>
                    {/* Episódios assistidos (ex.: "Ep 3–5") */}
                    <div className="mr-sess-eps">
                      {log.ep_start != null
                        ? `Ep ${log.ep_start}${log.ep_end != null && log.ep_end !== log.ep_start ? `–${log.ep_end}` : ''}`
                        : ''}
                    </div>
                    {/* Nota da sessão — usa o Score component */}
                    {log.rating != null && <Score score={log.rating} />}
                    {/* Observações da sessão (italicizado) */}
                    {log.notes && (
                      <p className="mr-sess-note">{log.notes}</p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
