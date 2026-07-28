// Tela Início da Akane — reescrita hi-fi conforme o design handoff §7.1:
//   1. Hero com eyebrow, saudação, última sessão, citação, CTAs e retrato.
//   2. Dois stat cards: "Filmes · ano" (com meta) e "Sessões · 7 dias" (spark).
//   3. home-split: FavoriteFilms + RecentActivity | LbPanel (Diário + Notas).
//   4. Watchlist em destaque (carrossel horizontal).
// Dados: GET /home + GET /heatmap + GET /diary em paralelo (erros isolados —
// o hero e os cards funcionam mesmo se o heatmap ou o diário falharem).

import { useState, useEffect, useCallback } from 'react'
import { akaneApi } from '../akaneApi'
import type { AkaneView, DiaryEntry, HeatmapDay, HomeData, Tweaks } from '../types'
import { Icon } from '../ui/Icon'
import { Poster } from '../components/Poster'
import { Spark } from '../components/Spark'
import { FavoriteFilms } from '../components/FavoriteFilms'
import { RecentActivity } from '../components/RecentActivity'
import { LbPanel } from '../components/LbPanel'
import { saudacao, todayLocalISO, fmtRuntime } from '../dateUtils'

// Citação da Akane no hero (texto do design handoff)
const AKANE_QUOTE =
  '"Para interpretar alguém, primeiro é preciso assistir o mundo inteiro com atenção. O cinema é onde eu treino o olhar."'

// Meta anual de filmes exibida no primeiro stat card (valor do handoff)
const META_ANUAL = 60

interface HomeScreenProps {
  tweaks: Tweaks                                       // Reservado (padrão das telas)
  onSelectMovie: (id: string) => void                  // Abre o detalhe de um filme
  onLog: (movieId?: string, title?: string) => void    // Log pré-preenchido
  onToast: (msg: string) => void                       // Feedback via toast
  onOpenLog: () => void                                // CTA "Logar filme" do hero
  onGoToView: (view: AkaneView) => void                // Navegação (diário/watchlist)
}

/** Tela Início — perfil Letterboxd da cinemateca. */
export function HomeScreen({ tweaks: _tweaks, onSelectMovie, onLog: _onLog, onToast, onOpenLog, onGoToView }: HomeScreenProps) {
  const [home, setHome] = useState<HomeData | null>(null)
  const [heatmap, setHeatmap] = useState<HeatmapDay[]>([])
  const [diary, setDiary] = useState<DiaryEntry[]>([])
  const [loading, setLoading] = useState(true)
  // /home é vazio-seguro (SC-006): null aqui significa falha de rede/servidor
  const [loadError, setLoadError] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    setLoadError(false)
    const year = new Date().getFullYear()
    // O /home é o dado essencial; heatmap e diário só enriquecem (erro → vazio)
    Promise.all([
      akaneApi.home(),
      akaneApi.heatmap(year).catch(() => ({ days: [] as HeatmapDay[] })),
      akaneApi.diary(30).catch(() => ({ entries: [] as DiaryEntry[] })),
    ])
      .then(([h, hm, d]) => {
        setHome(h)
        setHeatmap(hm.days ?? [])
        setDiary(d.entries ?? [])
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  // ── Loading / erro ────────────────────────────────────────────────────────

  if (loading) {
    return <p className="empty-state">Carregando cinemateca…</p>
  }

  if (loadError || !home) {
    return (
      <div className="page">
        <p className="empty-state">
          Não foi possível carregar o Início.{' '}
          <button className="btn btn-ghost" onClick={load} style={{ marginLeft: 8 }}>Tentar novamente</button>
        </p>
      </div>
    )
  }

  // ── Derivados para o hero e os stat cards ─────────────────────────────────

  // Sparkline: sessões dos últimos 21 dias (densifica o heatmap esparso)
  const countByDate = new Map(heatmap.map(d => [d.date, d.count]))
  const spark: number[] = []
  const cursor = new Date(todayLocalISO() + 'T00:00:00')
  cursor.setDate(cursor.getDate() - 20)
  for (let i = 0; i < 21; i++) {
    const y = cursor.getFullYear()
    const m = String(cursor.getMonth() + 1).padStart(2, '0')
    const dd = String(cursor.getDate()).padStart(2, '0')
    spark.push(countByDate.get(`${y}-${m}-${dd}`) ?? 0)
    cursor.setDate(cursor.getDate() + 1)
  }

  // Variação percentual vs. semana anterior (regra do handoff)
  const wk = home.sessions_7d
  const prevWk = home.sessions_7d_prev
  const delta = prevWk ? Math.round(((wk - prevWk) / prevWk) * 100) : (wk > 0 ? 100 : 0)

  const year = new Date().getFullYear()

  return (
    <div className="page">
      {/* ── HERO ── */}
      <div className="hero">
        <div className="hero-grain" />
        <div className="hero-inner">
          <div className="hero-copy">
            <div className="hero-eyebrow">Cinemateca de Akane</div>
            <h1 className="hero-greet">{saudacao()}.</h1>
            {home.last_session ? (
              <p className="hero-now">
                Última sessão · <b>{home.last_session.title}</b>
                {home.last_session.rating != null && <em> · {home.last_session.rating.toFixed(1)}★</em>}
              </p>
            ) : (
              <p className="hero-now">Nenhuma sessão registrada ainda — <em>o primeiro filme te espera</em>.</p>
            )}
            <p className="hero-quote">{AKANE_QUOTE}</p>
            <div className="hero-cta">
              <button className="btn btn-primary" onClick={onOpenLog}><Icon name="plus" /> Logar filme</button>
              <button className="btn btn-ghost" onClick={() => onGoToView('diary')}><Icon name="diario" /> Abrir diário</button>
            </div>
          </div>
          <div className="hero-portrait">
            <div className="halo" />
            <img src="/akane-hero.png" alt="Akane Kurokawa"
                 onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
          </div>
        </div>
      </div>

      {/* ── STAT CARDS ── */}
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label"><Icon name="filmes" style={{ width: 12, height: 12 }} /> Filmes · {year}</div>
          <div className="stat-value">{home.counts.films_watched}<span className="unit">vistos</span></div>
          <div className="stat-foot" style={{ marginTop: 14 }}>
            Meta de {META_ANUAL} — faltam <b>{Math.max(0, META_ANUAL - home.counts.films_watched)}</b>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label"><Icon name="diario" style={{ width: 12, height: 12 }} /> Sessões · 7 dias</div>
          <div className="stat-value">{wk}</div>
          <Spark data={spark} />
          <div className="stat-foot">
            {delta >= 0 ? <span className="up">↑ {delta}%</span> : <span>↓ {Math.abs(delta)}%</span>} vs. semana anterior
          </div>
        </div>
      </div>

      {/* ── FAVORITOS + DIÁRIO RECENTE | PAINEL ── */}
      <div className="home-split">
        <div className="home-main">
          <FavoriteFilms
            favorites={home.favorites}
            onSelectMovie={onSelectMovie}
            onSave={async (ids) => {
              try {
                await akaneApi.setFavorites(ids)
                onToast('Favoritos atualizados')
                load()
              } catch {
                onToast('Erro ao salvar favoritos')
              }
            }}
          />
          {home.recent_activity.length > 0 && (
            <RecentActivity
              entries={home.recent_activity}
              onSelectMovie={onSelectMovie}
              onGoDiary={() => onGoToView('diary')}
            />
          )}
        </div>
        <LbPanel
          diary={diary}
          totalDiary={home.counts.diary}
          histogram={home.rating_histogram}
          onSelectMovie={onSelectMovie}
        />
      </div>

      {/* ── WATCHLIST EM DESTAQUE ── */}
      {home.watchlist_highlight.length > 0 && (
        <div className="section">
          <div className="section-head">
            <h2 className="section-title">Esperando na watchlist</h2>
            <span className="section-link" onClick={() => onGoToView('watchlist')}>Ver tudo →</span>
          </div>
          <div className="row-scroll">
            {home.watchlist_highlight.map(f => (
              <div key={f.id} className="want-card" onClick={() => onSelectMovie(f.id)}>
                <Poster title={f.title} posterUrl={f.poster_url} palette={f.poster_palette}
                        director={f.director[0]} year={f.year} status="watchlist" badge />
                <div className="wc-title">{f.title}</div>
                <div className="wc-sub">
                  {[f.director[0], f.runtime ? fmtRuntime(f.runtime) : null].filter(Boolean).join(' · ')}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
