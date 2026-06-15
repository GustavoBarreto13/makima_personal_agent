// HomeScreen.tsx — Tela inicial da Marin (Fase 2 — pixel-perfect).
// Implementa os 5 blocos do protótipo screens-a.jsx na ordem correta:
//   1. Hero "Continue assistindo" (gradiente da paleta do último anime + portrait)
//   2. 3 Stat Cards (acompanhados, episódios 7 dias + spark, nota média)
//   3. Profile Split (Favoritos | MAL stats)
//   4. Home Split (Assistindo agora | Atividade recente + Próximos episódios)
//   5. Carrossel "Esperando na fila"
// Dados: marinApi.home() → um único fetch que popula todos os blocos.

import { useState, useEffect } from 'react'
import { marinApi }          from '../marinApi'
import type { HomeData, Tweaks } from '../types'
import { PosterCard }        from '../components/PosterCard'
import { EpisodeProgress }   from '../components/EpisodeProgress'
import { MalStats }          from '../components/MalStats'
import { FavoriteAnimes }    from '../components/FavoriteAnimes'
import { Score }             from '../components/Score'
import { StatusChip }        from '../components/StatusChip'
import { Spark }             from '../components/Spark'

// ── Paletas do pôster tipográfico (12 opções, mesmas do PosterCard) ─────────
// Usadas aqui para extrair as cores do hero a partir do poster_key do último anime.
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

// Props da tela — callbacks injetados pelo MarinShell
interface HomeScreenProps {
  tweaks: Tweaks
  onSelectAnime: (id: string) => void
  onLog: (animeId?: string, ep?: number) => void
  onNav: (screen: string) => void
  onToast: (msg: string) => void
}

/**
 * HomeScreen — dashboard principal da Marin.
 * Layout fiel ao protótipo screens-a.jsx / 01-inicio.png.
 */
export function HomeScreen({ onSelectAnime, onLog, onNav, onToast }: HomeScreenProps) {
  // Estado de dados e loading da tela
  const [data, setData]       = useState<HomeData | null>(null)
  const [loading, setLoading] = useState(true)

  // Carrega os dados agrupados da home em um único request
  useEffect(() => {
    marinApi.home()
      .then(r  => { setData(r); setLoading(false) })
      .catch(() => { setLoading(false); onToast('Erro ao carregar dados da home.') })
  }, [])

  // Estado de loading — spinner centralizado
  if (loading) {
    return (
      <div className="mr-home-loading">
        <div className="mr-spinner" />
      </div>
    )
  }

  // Dados ainda ausentes (erro silencioso)
  if (!data) return null

  // ── Bloco 1: Hero — último anime assistido ────────────────────────────────
  // hero.poster_key determina a paleta de gradiente do fundo do hero
  const hero     = data.last_session?.anime
  const heroKey  = hero?.poster_key ?? 'cyan'
  const palette  = POSTER_PALETTES[heroKey] ?? POSTER_PALETTES.cyan
  const heroBg   = `linear-gradient(155deg, ${palette.a}, ${palette.b})`

  // ── Bloco 2: Stat Cards ───────────────────────────────────────────────────
  const counts   = data.counts ?? {}
  const watching  = counts.assistindo ?? 0
  const completed = counts.completo   ?? 0
  const eps7d     = data.episodes_7d     ?? 0
  const eps7dPrev = data.episodes_7d_prev ?? 0
  const avgScore  = data.avg_score_year

  // Variação percentual de episódios vs. semana anterior
  const epsDelta = eps7dPrev > 0
    ? Math.round(((eps7d - eps7dPrev) / eps7dPrev) * 100)
    : 0
  const epsArrow = epsDelta > 0 ? '↑' : epsDelta < 0 ? '↓' : '→'

  // Dados mínimos para o sparkline (semana atual vs. semana anterior)
  const sparkData = [eps7dPrev, eps7d]

  return (
    <div className="mr-home">

      {/* ═══════════════════════════════════════════════════════════════════
          BLOCO 1 — Hero "Continue assistindo"
          Fundo com gradiente da paleta do último anime + portrait da Marin.
          Ao contrário do hero estático anterior, este reflete o último anime.
          ═══════════════════════════════════════════════════════════════════ */}
      <section className="mr-hero" style={{ background: heroBg }}>
        {/* Overlay escuro da esquerda — garante leitura do texto sobre o gradiente */}
        <div className="mr-hero-bg" />
        {/* Padrão de pontos brilhantes — sparkle kawaii sobre o fundo colorido */}
        <div className="mr-hero-spark" />

        {/* Texto à esquerda */}
        <div className="mr-hero-inner">
          {/* Eyebrow em caps mono — chamada de ação */}
          <p className="mr-hero-eyebrow">✨ CONTINUE ASSISTINDO</p>

          {/* Título do último anime (ou estado vazio) */}
          <h1 className="mr-hero-title">
            {hero?.title ?? 'Nenhum anime ainda'}
          </h1>

          {/* Linha de metadados: status chip + progresso + nota */}
          {hero && data.last_session && (
            <div className="mr-hero-line">
              <StatusChip status={hero.status} />
              <span className="mr-hero-meta">
                Último: Ep {data.last_session.log.ep_end ?? '?'} / {hero.episodes_total ?? '?'}
              </span>
              {hero.score != null && <Score score={hero.score} />}
            </div>
          )}

          {/* CTAs: logar e ver detalhe */}
          <div className="mr-hero-cta">
            <button
              className="mr-btn mr-btn--primary"
              onClick={() => hero ? onLog(hero.id) : onLog()}
            >
              + Logar episódio
            </button>
            {hero && (
              <button
                className="mr-btn mr-btn-ghost"
                onClick={() => onSelectAnime(hero.id)}
              >
                📺 Ver detalhe
              </button>
            )}
          </div>
        </div>

        {/* Portrait da Marin com halo de néon — ancorado à direita na base */}
        <div className="mr-hero-portrait-wrap">
          {/* Brilho radial atrás do portrait — efeito de aura néon */}
          <div className="mr-halo" />
          <img src="/marin.png" alt="Marin" className="mr-hero-portrait" />
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          BLOCO 2 — 3 Stat Cards (com barra colorida por --accent-bar)
          ═══════════════════════════════════════════════════════════════════ */}
      <section className="mr-stat-row">

        {/* Card 1: animes acompanhados (rosa-magenta) */}
        <div
          className="mr-stat-card"
          style={{ '--accent-bar': 'var(--marin)' } as React.CSSProperties}
        >
          <div className="mr-stat-label">📺 Animes acompanhados</div>
          <div className="mr-stat-value">
            {watching + completed}
            <span className="mr-stat-unit">no acervo</span>
          </div>
          <div className="mr-stat-foot">
            {watching} assistindo · {completed} completos
          </div>
        </div>

        {/* Card 2: episódios nos últimos 7 dias (cyan) */}
        <div
          className="mr-stat-card"
          style={{ '--accent-bar': 'var(--cyan)' } as React.CSSProperties}
        >
          <div className="mr-stat-label">🎌 Episódios · 7 dias</div>
          <div className="mr-stat-value">{eps7d}</div>
          {/* Sparkline de barras — tendência dos episódios */}
          <Spark data={sparkData} maxHeight={28} barWidth={7} gap={3} />
          <div
            className="mr-stat-foot"
            style={{ color: epsDelta >= 0 ? 'var(--marin)' : 'var(--ink-3)' }}
          >
            {epsArrow} {Math.abs(epsDelta)}% vs semana anterior
          </div>
        </div>

        {/* Card 3: nota média do ano (dourado de estrelas) */}
        <div
          className="mr-stat-card"
          style={{ '--accent-bar': 'var(--star)' } as React.CSSProperties}
        >
          <div className="mr-stat-label">⭐ Nota média</div>
          <div className="mr-stat-value">
            {avgScore ? avgScore.toFixed(1) : '—'}
            <span className="mr-stat-unit">/ 10</span>
          </div>
          <div className="mr-stat-foot">💖 favoritos</div>
        </div>

      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          BLOCO 3 — Profile Split: Favoritos | MAL Stats
          Grade 2 colunas que colapsa para 1 em telas estreitas.
          ═══════════════════════════════════════════════════════════════════ */}
      <section className="mr-profile-split">

        {/* Coluna esquerda: grid de 4 favoritos (editável) */}
        <div className="mr-profile-col">
          <FavoriteAnimes onSelectAnime={onSelectAnime} />
        </div>

        {/* Coluna direita: visão geral da lista MAL (barra + contagens) */}
        <div className="mr-profile-col">
          <div className="mr-sec-head">
            <h3 className="mr-sec-title">🎌 Minha lista no MAL</h3>
            {/* Regra horizontal entre título e link */}
            <span className="mr-sec-rule" />
            <button className="mr-sec-link" onClick={() => onNav('stats')}>
              Stats →
            </button>
          </div>
          <MalStats counts={data.counts ?? {}} avgScore={data.avg_score_year} />
        </div>

      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          BLOCO 4 — Home Split
          Esquerda: grade "Assistindo agora" (pôsteres com progresso)
          Direita: painel (Atividade recente + Próximos episódios)
          ═══════════════════════════════════════════════════════════════════ */}
      <section className="mr-home-split">

        {/* ── Esquerda: Assistindo agora ─────────────────────────────────── */}
        <div className="mr-home-main">
          <div className="mr-sec-head">
            <h3 className="mr-sec-title">📺 Assistindo agora</h3>
            <span className="mr-sec-rule" />
            <button className="mr-sec-link" onClick={() => onNav('catalogo')}>
              Catálogo →
            </button>
          </div>

          {/* Grade de pôsteres dos animes em andamento (máx. 6) */}
          <div className="mr-watch-grid">
            {(data.currently_watching ?? []).slice(0, 6).map(anime => (
              <div
                key={anime.id}
                className="mr-watch-card"
                onClick={() => onSelectAnime(anime.id)}
                role="button"
                tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter') onSelectAnime(anime.id) }}
              >
                {/* Pôster 2:3 — imagem ou tipográfico */}
                <PosterCard
                  title={anime.title}
                  posterUrl={anime.poster_url}
                  posterKey={anime.poster_key}
                  className="mr-watch-poster"
                />
                {/* Título truncado em 1 linha */}
                <p className="mr-wm-title">{anime.title}</p>
                {/* Progresso de episódios (apenas texto, sem barra) */}
                <EpisodeProgress
                  watched={anime.episodes_watched ?? 0}
                  total={anime.episodes_total}
                  showBar={false}
                />
              </div>
            ))}
          </div>
        </div>

        {/* ── Direita: painel com 2 blocos empilhados ──────────────────── */}
        <div className="mr-side-panel">

          {/* Bloco A: Atividade recente — últimas sessões do diário */}
          <div className="mr-mp-block">
            <div className="mr-sec-head mr-mp-head">
              <span className="mr-mp-head-title">Atividade recente</span>
              <span className="mr-mp-head-count">{data.recent_logs?.length ?? 0}</span>
            </div>

            {(data.recent_logs ?? []).slice(0, 5).map(log => (
              <div
                key={log.id}
                className="mr-act-row"
                onClick={() => onSelectAnime(log.anime_id)}
                role="button"
                tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter') onSelectAnime(log.anime_id) }}
              >
                {/* Miniatura do pôster (34px) */}
                <PosterCard
                  title={log.anime_title ?? ''}
                  posterUrl={log.poster_url}
                  posterKey={log.poster_key}
                  className="mr-act-poster"
                />
                {/* Título + episódios da sessão */}
                <div className="mr-act-info">
                  <p className="mr-act-title">{log.anime_title}</p>
                  {log.ep_start != null && (
                    <p className="mr-act-eps">
                      Ep {log.ep_start}
                      {log.ep_end != null && log.ep_end !== log.ep_start
                        ? `–${log.ep_end}`
                        : ''}
                    </p>
                  )}
                </div>
                {/* Nota da sessão (se existir) */}
                {log.rating != null && (
                  <Score score={log.rating} className="mr-act-score" />
                )}
              </div>
            ))}
          </div>

          {/* Bloco B: Próximos episódios — schedule de lançamentos */}
          <div className="mr-mp-block">
            <div className="mr-sec-head mr-mp-head">
              <span className="mr-mp-head-title">Próximos episódios</span>
              <span className="mr-mp-head-count">{data.upcoming_episodes?.length ?? 0}</span>
            </div>

            {/* Estado vazio */}
            {(data.upcoming_episodes ?? []).length === 0 ? (
              <p className="mr-detail-empty" style={{ padding: '8px 0', fontSize: 13 }}>
                Nada agendado nos próximos dias.
              </p>
            ) : (
              /* Até 4 itens com mini-calendário à esquerda */
              (data.upcoming_episodes ?? []).slice(0, 4).map((ep, i) => {
                // Parseamos com T12:00:00 para evitar fuso UTC errado
                const date = new Date(ep.aired + 'T12:00:00')
                const day   = date.getDate()
                const month = date.toLocaleString('pt-BR', { month: 'short' }).replace('.', '')
                return (
                  <div
                    key={i}
                    className="mr-up-row"
                    onClick={() => onSelectAnime(ep.anime_id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => { if (e.key === 'Enter') onSelectAnime(ep.anime_id) }}
                  >
                    {/* Calendário mini: dia e mês */}
                    <div className="mr-up-date">
                      <span className="mr-up-day">{day}</span>
                      <span className="mr-up-month">{month}</span>
                    </div>
                    {/* Título e número do episódio */}
                    <div className="mr-up-info">
                      <p className="mr-up-title">{ep.anime_title}</p>
                      <p className="mr-up-ep">Ep {ep.episode_number}</p>
                    </div>
                  </div>
                )
              })
            )}
          </div>

        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          BLOCO 5 — Carrossel "Esperando na fila" (quero_assistir)
          Scroll horizontal com pôsteres menores (132px).
          ═══════════════════════════════════════════════════════════════════ */}
      {(data.watchlist_preview ?? []).length > 0 && (
        <section className="mr-section">
          <div className="mr-sec-head">
            <h3 className="mr-sec-title">Esperando na fila</h3>
            <span className="mr-sec-rule" />
            <button className="mr-sec-link" onClick={() => onNav('watchlist')}>
              Ver tudo →
            </button>
          </div>

          {/* Carrossel com scroll horizontal — sem scrollbar visível */}
          <div className="mr-row-scroll">
            {(data.watchlist_preview ?? []).map(anime => (
              <div
                key={anime.id}
                className="mr-want-card"
                onClick={() => onSelectAnime(anime.id)}
                role="button"
                tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter') onSelectAnime(anime.id) }}
              >
                {/* Pôster 132px */}
                <PosterCard
                  title={anime.title}
                  posterUrl={anime.poster_url}
                  posterKey={anime.poster_key}
                  className="mr-want-poster"
                />
                {/* Título truncado em 2 linhas */}
                <p className="mr-want-title">{anime.title}</p>
              </div>
            ))}
          </div>
        </section>
      )}

    </div>
  )
}
