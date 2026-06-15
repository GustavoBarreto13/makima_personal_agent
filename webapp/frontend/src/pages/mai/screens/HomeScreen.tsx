/**
 * HomeScreen — tela Início da Mai (versão com paridade ao design handoff).
 *
 * Seções (de cima para baixo):
 *  1. Hero — última série logada com gradiente de cor, eyebrow "Continue assistindo",
 *            linha de status/rede/sessão, CTAs "Logar sessão" / "Ver detalhe"
 *  2. stat-row — 3 cards: "Séries acompanhadas", "Episódios · 7 dias" + sparkline,
 *               "Nota média"
 *  3. profile-split — Favoritas (localStorage) + "Meu acervo" (ListStats)
 *  4. "Assistindo agora" — carrossel horizontal (row-scroll) de want-card
 *  5. home-split — "Em andamento" (watch-grid) à esquerda + painel lateral
 *               (atividade recente + próximos episódios) à direita
 *  6. "Esperando na fila" — carrossel de séries com status quero_assistir
 *
 * Dados carregados em paralelo via Promise.allSettled:
 *  - maiApi.list()     → catálogo completo (resolve IDs, watching, queue, acervo)
 *  - maiApi.stats()    → avg_rating, by_status, total_series, total_episodes
 *  - maiApi.upcoming() → próximos episódios (painel lateral)
 *  - maiApi.diary(21)  → hero + atividade recente + sparkline
 */

import { useState, useEffect, useMemo } from 'react'
import type { Series, WatchLog, UpcomingEpisode, Stats, MaiStatus } from '../types'
import { maiApi } from '../maiApi'
import { PosterCard } from '../components/PosterCard'
import { StatusChip } from '../components/StatusChip'
import { Stars } from '../components/Stars'
import { Spark } from '../components/Spark'
import { ListStats } from '../components/ListStats'
import { FavoriteSeries } from '../components/FavoriteSeries'

// ── Helpers de data pt-BR ────────────────────────────────────────────────────

/** Abreviações de meses em pt-BR para o painel de próximos episódios. */
const MESES_CURTO = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez']

/**
 * Converte data ISO em "X dias atrás" / "ontem" / "hoje".
 * Usado na linha "Última sessão" do hero e na atividade recente.
 */
function relDate(iso: string): string {
  const today = new Date().toISOString().slice(0, 10)
  if (iso === today) return 'hoje'
  const diff = Math.round(
    (new Date(today + 'T00:00:00').getTime() - new Date(iso + 'T00:00:00').getTime()) / 86400000
  )
  if (diff === 1) return 'ontem'
  if (diff < 7) return `${diff} dias atrás`
  const d = new Date(iso + 'T00:00:00')
  return `${d.getDate()} ${MESES_CURTO[d.getMonth()]}`
}

/**
 * Formata o range de episódios de um WatchLog em "T2E5" ou "T2E5–7".
 * Exibe apenas o temporada+episódio; omite se season_number ausente.
 */
function epLabel(log: WatchLog): string {
  if (!log.season_number) return ''
  const t = `T${log.season_number}`
  if (!log.ep_end) return t
  const range = log.ep_start && log.ep_start !== log.ep_end
    ? `${log.ep_start}–${log.ep_end}`
    : String(log.ep_end)
  return `${t}E${range}`
}

// ── Mini barra de progresso inline (evita componente extra) ─────────────────

/** Barra de progresso de episódios (classes mai.css: .ep-progress/.ep-bar/.ep-count). */
function EpProgress({ series }: { series: Series }) {
  const total   = series.episodes_count
  const watched = series.episodes_watched
  const done    = series.status === 'concluida' ||
                  (total != null && watched >= total && watched > 0)
  const pct     = total
    ? Math.min(100, (watched / total) * 100)
    : Math.min(100, ((watched % 12) / 12) * 100)

  return (
    <div className="ep-progress">
      <div className={`ep-bar${done ? ' done' : ''}`}>
        <i style={{ width: `${done ? 100 : pct}%` }} />
      </div>
      <div className={`ep-count${done ? ' done' : ''}`}>
        {done
          ? 'Concluída ✓'
          : <>{watched} / {total == null ? '?' : total} eps</>
        }
      </div>
    </div>
  )
}

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  /** Navega para outra tela da shell (view, param opcional). */
  onNav: (view: string, param?: string) => void
  /** Abre o modal de log de sessão. */
  onOpenLog: (seriesId?: string, title?: string) => void
}

// ── Componente principal ─────────────────────────────────────────────────────

/**
 * HomeScreen — tela Início com paridade total ao design handoff.
 *
 * Args:
 *   onNav: Callback de navegação interna (view, param?).
 *   onOpenLog: Abre o modal de registro de sessão.
 */
export function HomeScreen({ onNav, onOpenLog }: Props) {
  // ── Estado ─────────────────────────────────────────────────────────────────
  const [catalog,  setCatalog]  = useState<Series[]>([])
  const [stats,    setStats]    = useState<Stats | null>(null)
  const [upcoming, setUpcoming] = useState<UpcomingEpisode[]>([])
  const [diary,    setDiary]    = useState<WatchLog[]>([])
  const [loading,  setLoading]  = useState(true)

  // ── Carregamento paralelo de todos os dados da tela ────────────────────────
  useEffect(() => {
    Promise.allSettled([
      maiApi.list(),          // catálogo completo (todas as séries)
      maiApi.stats(),         // estatísticas anuais
      maiApi.upcoming(),      // próximos episódios agendados
      maiApi.diary(21),       // últimas 21 sessões para hero + sparkline
    ]).then(([catRes, statsRes, upRes, diaryRes]) => {
      if (catRes.status   === 'fulfilled') setCatalog((catRes.value   as any).series   ?? [])
      if (statsRes.status === 'fulfilled') setStats(statsRes.value as unknown as Stats)
      if (upRes.status    === 'fulfilled') setUpcoming((upRes.value   as any).upcoming ?? [])
      if (diaryRes.status === 'fulfilled') setDiary((diaryRes.value   as any).logs     ?? [])
    }).finally(() => setLoading(false))
  }, [])

  // ── Derivações ─────────────────────────────────────────────────────────────

  // Mapa ID → Series para resolver logs do diário rapidamente
  const catalogMap = useMemo(
    () => new Map(catalog.map(s => [s.id, s])),
    [catalog]
  )

  // Séries sendo assistidas ativamente
  const watching = catalog.filter(s => s.status === 'assistindo' && !s.deleted)
  // Séries na watchlist
  const queue    = catalog.filter(s => s.status === 'quero_assistir' && !s.deleted)

  // ── Hero: última série logada ──────────────────────────────────────────────
  // O primeiro log do diário é o mais recente; resolve a série pelo series_id
  const lastLog  = diary[0] ?? null
  const heroSeries = lastLog ? catalogMap.get(lastLog.series_id) ?? null : null

  // ── Sparkline: episódios por dia nos últimos 21 dias ──────────────────────
  // Cada barra = soma de episodes_count dos logs daquele dia
  const sparkData = useMemo(() => {
    const today  = new Date()
    const result: number[] = []

    // Itera dia a dia do mais antigo (21 atrás) para o mais recente (hoje)
    for (let i = 20; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(today.getDate() - i)
      const iso = d.toISOString().slice(0, 10)

      // Soma episodes_count de todos os logs desta data
      const total = diary
        .filter(log => log.watched_date === iso)
        .reduce((acc, log) => acc + (log.episodes_count ?? 1), 0)

      result.push(total)
    }
    return result
  }, [diary])

  // Total de episódios nos últimos 7 dias (barra sparkline "7 dias")
  const eps7d = sparkData.slice(-7).reduce((a, v) => a + v, 0)
  // Semana anterior (7 dias antes) para calcular delta %
  const eps7dPrev = sparkData.slice(-14, -7).reduce((a, v) => a + v, 0)
  const delta7d = eps7dPrev > 0
    ? Math.round(((eps7d - eps7dPrev) / eps7dPrev) * 100)
    : eps7d > 0 ? 100 : 0

  // Últimas 5 entradas do diário para o painel de atividade recente
  const recentLogs  = diary.slice(0, 5)
  // Próximos 4 episódios para o painel lateral
  const upcomingFew = upcoming.slice(0, 4)

  // Total de séries no acervo e nota média do stats
  const totalSeries = stats?.total_series ?? catalog.filter(s => !s.deleted).length
  const avgRating   = stats?.avg_rating ?? null

  // by_status do stats para o ListStats (ou derivado do catálogo como fallback)
  const byStatus: Record<MaiStatus, number> = stats?.by_status ?? {
    assistindo:     watching.length,
    concluida:      catalog.filter(s => s.status === 'concluida').length,
    quero_assistir: queue.length,
    pausada:        catalog.filter(s => s.status === 'pausada').length,
    abandonada:     catalog.filter(s => s.status === 'abandonada').length,
  }

  // ── Estado vazio ───────────────────────────────────────────────────────────
  if (!loading && catalog.length === 0) {
    return (
      <div className="page">
        <div className="hero">
          <div className="hero-bg" style={{ background: 'linear-gradient(135deg, var(--paper-2), var(--paper))' }} />
          <div className="hero-warmlight" />
          <div className="hero-portrait"><div className="halo" /><img src="/mai.png" alt="Mai Sakurajima" /></div>
          <div className="hero-inner">
            <div className="hero-eyebrow">🐰 Mai Sakurajima</div>
            <h1 className="hero-title">Sua cinemateca<br />de séries</h1>
            <div className="hero-cta">
              <button className="btn btn-primary" onClick={() => onNav('catalog')}>📺 Explorar catálogo</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="page">

      {/* ═══════════════════════════════════════════════════════════════════
          1. HERO — última série logada
         ═══════════════════════════════════════════════════════════════════ */}
      <div className="hero">
        {/* Fundo em gradiente da paleta da série (ou fallback neutro) */}
        <div
          className="hero-bg"
          style={{ background: 'linear-gradient(135deg, var(--paper-2), var(--paper))' }}
        />
        <div className="hero-warmlight" />

        {/* Retrato da Mai */}
        <div className="hero-portrait">
          <div className="halo" />
          <img src="/mai.png" alt="Mai Sakurajima" />
        </div>

        {/* Conteúdo do hero */}
        <div className="hero-inner">
          {heroSeries ? (
            // ── Modo "continue assistindo" — há série logada recentemente
            <>
              <div className="hero-eyebrow">🐰 Continue assistindo</div>
              <h1 className="hero-title">{heroSeries.title}</h1>
              <p className="hero-line">
                <StatusChip status={heroSeries.status} size="md" />
                {heroSeries.network && <span>{heroSeries.network}</span>}
                {lastLog && epLabel(lastLog) && (
                  <>
                    <span>·</span>
                    <span>Última sessão: <b>{epLabel(lastLog)}</b></span>
                  </>
                )}
                {lastLog?.watched_date && (
                  <span style={{ color: 'var(--ink-4)', fontSize: 12 }}>
                    ({relDate(lastLog.watched_date)})
                  </span>
                )}
                {heroSeries.rating && (
                  <Stars rating={heroSeries.rating} size="sm" showNum />
                )}
              </p>
              <div className="hero-cta">
                <button className="btn btn-primary" onClick={() => onOpenLog(heroSeries.id, heroSeries.title)}>
                  📺 Logar sessão
                </button>
                <button className="btn btn-ghost" onClick={() => onNav('detail', heroSeries.id)}>
                  Ver detalhe
                </button>
              </div>
            </>
          ) : (
            // ── Fallback — acervo existe mas nenhuma sessão registrada
            <>
              <div className="hero-eyebrow">🐰 Mai Sakurajima</div>
              <h1 className="hero-title">Sua cinemateca<br />de séries</h1>
              <div className="hero-line">
                {totalSeries > 0 && <span><b>{totalSeries}</b> séries</span>}
              </div>
              <div className="hero-cta">
                <button className="btn btn-primary" onClick={() => onOpenLog()}>
                  📺 Registrar sessão
                </button>
                <button className="btn btn-ghost" onClick={() => onNav('catalog')}>
                  Ver catálogo
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {loading && <div className="empty-state" style={{ marginTop: 48, padding: '0 8px' }}>Carregando…</div>}

      {!loading && (
        <>
          {/* ═══════════════════════════════════════════════════════════════
              2. STAT-ROW — 3 cards de métricas
             ═══════════════════════════════════════════════════════════════ */}
          <div className="stat-row">
            {/* Card 1: Total de séries acompanhadas */}
            <div className="stat-card" style={{ '--accent-bar': 'var(--mai)' } as React.CSSProperties}>
              <div className="stat-label"><span className="se">📺</span> Séries acompanhadas</div>
              <div className="stat-value">
                {totalSeries}
                <span className="unit">no acervo</span>
              </div>
              <div className="stat-foot">
                <span className="up">{byStatus.assistindo ?? 0} assistindo</span>
                {' · '}
                {byStatus.concluida ?? 0} concluídas
              </div>
            </div>

            {/* Card 2: Episódios nos últimos 7 dias + sparkline */}
            <div className="stat-card" style={{ '--accent-bar': 'var(--warm)' } as React.CSSProperties}>
              <div className="stat-label"><span className="se">🎬</span> Episódios · 7 dias</div>
              <div className="stat-value">{eps7d}</div>
              {/* Sparkline com os últimos 21 dias (1 barra por dia) */}
              <Spark data={sparkData} />
              <div className="stat-foot">
                {delta7d >= 0
                  ? <span className="up">↑ {delta7d}%</span>
                  : <span>↓ {Math.abs(delta7d)}%</span>
                }
                {' '} vs. semana anterior
              </div>
            </div>

            {/* Card 3: Nota média */}
            <div className="stat-card" style={{ '--accent-bar': 'var(--star)' } as React.CSSProperties}>
              <div className="stat-label"><span className="se">⭐</span> Nota média</div>
              <div className="stat-value">
                {avgRating ? avgRating.toFixed(1) : '—'}
                {avgRating && <span className="unit">/ 5</span>}
              </div>
              <div className="stat-foot">
                {stats?.total_episodes ?? 0} eps no total
              </div>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════════════
              3. PROFILE-SPLIT — Favoritas (esq.) + Meu acervo (dir.)
             ═══════════════════════════════════════════════════════════════ */}
          <div className="profile-split">
            {/* Bloco de favoritas (localStorage mai.favorites) */}
            <FavoriteSeries catalog={catalog} onNav={onNav} />

            {/* Meu acervo: barra empilhada + tabela de status */}
            <div className="mai-sec">
              <div className="mai-sec-head">
                <span className="t">🎭 Meu acervo</span>
                <span className="rule" />
                <span className="lnk" onClick={() => onNav('stats')}>Stats →</span>
              </div>
              <div className="mai-panel">
                <div className="mp-block">
                  <ListStats
                    byStatus={byStatus}
                    totalEpisodes={stats?.total_episodes ?? 0}
                    totalSeries={totalSeries}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════════════
              4. "ASSISTINDO AGORA" — carrossel horizontal
             ═══════════════════════════════════════════════════════════════ */}
          {watching.length > 0 && (
            <div className="section">
              <div className="mai-sec-head">
                <span className="t">📺 Assistindo agora</span>
                <span className="rule" />
                <span className="lnk" onClick={() => onNav('catalog')}>Catálogo →</span>
              </div>
              <div className="row-scroll">
                {watching.map(s => (
                  <div key={s.id} className="want-card" onClick={() => onNav('detail', s.id)}>
                    <PosterCard series={s} />
                    <div className="wc-title">{s.title}</div>
                    <div className="wc-sub">
                      {s.network ?? '—'}
                      {s.episodes_count != null && ` · ${s.episodes_count} eps`}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════
              5. HOME-SPLIT — "Em andamento" (watch-grid) + painel lateral
             ═══════════════════════════════════════════════════════════════ */}
          {(watching.length > 0 || recentLogs.length > 0 || upcomingFew.length > 0) && (
            <div className="home-split">
              {/* Coluna principal: grade de pôsteres "Em andamento" */}
              <div className="home-main">
                {watching.length > 0 && (
                  <div className="mai-sec">
                    <div className="mai-sec-head">
                      <span className="t">🎬 Em andamento</span>
                      <span className="rule" />
                    </div>
                    <div className="watch-grid">
                      {watching.map(s => (
                        <div key={s.id} className="watch-card" onClick={() => onNav('detail', s.id)}>
                          <PosterCard series={s} />
                          <div className="wm">
                            <div className="wm-title">{s.title}</div>
                            <div className="wm-prog">
                              <EpProgress series={s} />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Painel lateral: Atividade recente + Próximos episódios */}
              <div className="mai-panel">
                {/* ── Atividade recente ── */}
                {recentLogs.length > 0 && (
                  <div className="mp-block">
                    <div className="mp-head">
                      <span className="t">Atividade recente</span>
                      <span className="c">{diary.length}</span>
                    </div>
                    {recentLogs.map(log => {
                      // Resolve a série pelo ID (para pôster e navegação)
                      const s = catalogMap.get(log.series_id)
                      const title = s?.title ?? log.series_title ?? '—'
                      return (
                        <div
                          key={log.id}
                          className="act-row"
                          onClick={() => s && onNav('detail', s.id)}
                        >
                          {/* Mini pôster à esquerda */}
                          {s && (
                            <div className="ar-poster">
                              <PosterCard series={s} width={34} />
                            </div>
                          )}
                          {/* Título + data + episódio */}
                          <div className="ar-body">
                            <div className="ar-title">{title}</div>
                            <div className="ar-sub">
                              <span>{relDate(log.watched_date)}</span>
                              {epLabel(log) && <span>{epLabel(log)}</span>}
                            </div>
                          </div>
                          {/* Nota da sessão (se houver) */}
                          {log.rating && (
                            <span className="ar-score">
                              ⭐ {log.rating.toFixed(1)}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* ── Próximos episódios ── */}
                {upcomingFew.length > 0 && (
                  <div className="mp-block">
                    <div className="mp-head">
                      <span className="t">Próximos episódios</span>
                      <span className="c">{upcoming.length}</span>
                    </div>
                    {upcomingFew.map(ep => {
                      // Extrai dia e mês da data de exibição
                      const d = new Date(ep.air_date + 'T00:00:00')
                      return (
                        <div
                          key={`${ep.series_id}-${ep.season_number}-${ep.episode_number}`}
                          className="up-row"
                          onClick={() => onNav('upcoming')}
                        >
                          {/* Calendário: dia + mês */}
                          <div className="up-date">
                            <div className="ud-d">{d.getDate()}</div>
                            <div className="ud-m">{MESES_CURTO[d.getMonth()]}</div>
                          </div>
                          {/* Título da série + código do ep */}
                          <div className="up-body">
                            <div className="up-title">{ep.series_title}</div>
                            <div className="up-sub">
                              T{ep.season_number}E{String(ep.episode_number).padStart(2, '0')}
                              {ep.title && ` · ${ep.title}`}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                    {upcomingFew.length === 0 && (
                      <p className="detail-empty" style={{ padding: '8px 0' }}>
                        Nada agendado nos próximos dias.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════
              6. "ESPERANDO NA FILA" — carrossel de quero_assistir
             ═══════════════════════════════════════════════════════════════ */}
          {queue.length > 0 && (
            <div className="section">
              <div className="mai-sec-head">
                <span className="t">📋 Esperando na fila</span>
                <span className="rule" />
                <span className="lnk" onClick={() => onNav('watchlist')}>Ver tudo →</span>
              </div>
              <div className="row-scroll">
                {queue.slice(0, 12).map(s => (
                  <div key={s.id} className="want-card" onClick={() => onNav('detail', s.id)}>
                    <PosterCard series={s} />
                    <div className="wc-title">{s.title}</div>
                    <div className="wc-sub">
                      {s.network?.split(' · ')[0] ?? '—'}
                      {s.first_air_date && ` · ${new Date(s.first_air_date).getFullYear()}`}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
