// Tela inicial da Akane — resumo da cinemateca pessoal.
// Exibe: favoritos editáveis, atividade recente, histograma de notas e watchlist.
// Todos os dados vêm de GET /api/movies/home numa única requisição (anti N+1).

import { useState, useEffect, useCallback } from 'react'
import { akaneApi } from '../akaneApi'
import type { HomeData, FavoriteFilm, DiaryEntry, Movie, Tweaks } from '../types'
import { Poster } from '../components/Poster'
import { Stars } from '../components/Stars'

// ── Props ────────────────────────────────────────────────────────────────────

interface HomeScreenProps {
  tweaks: Tweaks                          // Tweaks de aparência (reservado — FilmsScreen usa, HomeScreen ainda não)
  onSelectMovie: (id: string) => void     // Abre o detalhe de um filme
  onLog: (movieId?: string, title?: string) => void  // Abre o modal de log de sessão
  onToast: (msg: string) => void          // Exibe feedback via toast
}

// ── Componente principal ─────────────────────────────────────────────────────

export function HomeScreen({ tweaks: _tweaks, onSelectMovie, onLog: _onLog, onToast }: HomeScreenProps) {
  // _tweaks: reservado para futuro uso (densidade/ordenação na tela Início)
  // _onLog: reservado — a RecentActivity pode receber o modal de re-log futuramente
  // Estado principal: dados do Início
  const [home, setHome] = useState<HomeData | null>(null)
  const [loading, setLoading] = useState(true)

  // Estado de edição de favoritos
  const [editingFavs, setEditingFavs] = useState(false)

  // Busca os dados do Início no mount
  const loadHome = useCallback(() => {
    setLoading(true)
    akaneApi.home()
      .then(data => setHome(data))
      .catch(() => {})  // Erros de rede são silenciosos — exibe loading eterno
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadHome() }, [loadHome])

  // ── Loading e vazio ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="ak-empty">
        <span className="ak-empty-icon">◈</span>
        <p className="ak-empty-title">Carregando cinemateca…</p>
      </div>
    )
  }

  if (!home) {
    return (
      <div className="ak-empty">
        <span className="ak-empty-icon">◈</span>
        <p className="ak-empty-title">Bem-vinda à sua cinemateca</p>
        <p className="ak-empty-sub">Adicione e logue filmes para ver o resumo aqui.</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>

      {/* ── SEÇÃO: FAVORITOS ─────────────────────────────────────────────── */}
      {/* Vitrine de até 4 filmes favoritos (persistem no servidor) */}
      <FavoritesSection
        favorites={home.favorites}
        onSelectMovie={onSelectMovie}
        onEdit={() => setEditingFavs(true)}
      />

      {/* Picker de favoritos (sobrepõe a tela quando editingFavs=true) */}
      {editingFavs && (
        <FavPicker
          currentIds={home.favorites.map(f => f.id)}
          onSave={async (ids) => {
            try {
              await akaneApi.setFavorites(ids)
              onToast('Favoritos atualizados ✓')
              setEditingFavs(false)
              loadHome()  // Recarrega para refletir novos favoritos
            } catch {
              onToast('Erro ao salvar favoritos')
            }
          }}
          onCancel={() => setEditingFavs(false)}
        />
      )}

      {/* ── SEÇÃO: ESTATÍSTICAS RÁPIDAS ──────────────────────────────────── */}
      {/* HomeData.counts tem {films_watched, diary, watchlist}; sessions_7d = sessões da semana */}
      <QuickStats
        filmsWatched={home.counts.films_watched}
        diarySessions={home.counts.diary}
        watchlistCount={home.counts.watchlist}
        sessions7d={home.sessions_7d}
      />

      {/* ── SEÇÃO: HISTOGRAMA DE NOTAS ────────────────────────────────────── */}
      {/* Exibe a distribuição de notas do catálogo (LbPanel style) */}
      {home.rating_histogram && Object.keys(home.rating_histogram).length > 0 && (
        <RatingHistogram histogram={home.rating_histogram} />
      )}

      {/* ── SEÇÃO: ATIVIDADE RECENTE ─────────────────────────────────────── */}
      {/* recent_activity é DiaryEntry & { liked: boolean }[] — NÃO Movie[] */}
      {home.recent_activity.length > 0 && (
        <RecentActivity
          entries={home.recent_activity}
          onSelectMovie={onSelectMovie}
        />
      )}

      {/* ── SEÇÃO: PRÓXIMA SESSÃO (watchlist) ────────────────────────────── */}
      {/* home.counts.watchlist é a contagem correta — não existe home.watchlist_count */}
      {home.counts.watchlist > 0 && (
        <NextSessionHint count={home.counts.watchlist} />
      )}

    </div>
  )
}


// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENTES
// ─────────────────────────────────────────────────────────────────────────────

// ── Favoritos ───────────────────────────────────────────────────────────────

interface FavoritesSectionProps {
  favorites: FavoriteFilm[]
  onSelectMovie: (id: string) => void
  onEdit: () => void
}

function FavoritesSection({ favorites, onSelectMovie, onEdit }: FavoritesSectionProps) {
  return (
    <section>
      {/* Cabeçalho da seção */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: 2 }}>
          Favoritos
        </span>
        <button
          className="ak-btn"
          onClick={onEdit}
          style={{ fontSize: 11, padding: '3px 10px' }}
        >
          Editar
        </button>
      </div>

      {/* Grade de 4 pôsteres de favoritos */}
      {favorites.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {favorites.map(fav => (
            <button
              key={fav.id}
              onClick={() => onSelectMovie(fav.id)}
              style={{ all: 'unset', cursor: 'pointer', borderRadius: 8, overflow: 'hidden' }}
              title={fav.title}
            >
              {/* Pôster: 100% de largura, proporção 2:3.
                  FavoriteFilm não tem campo "year" — omitimos o prop year do Poster. */}
              <div style={{ aspectRatio: '2/3', position: 'relative' }}>
                <Poster
                  title={fav.title}
                  posterUrl={fav.poster_url}
                  palette={fav.poster_palette}
                  className="ak-poster-card"
                />
                {/* Overlay com coração (fixo, pois estes são favoritos) */}
                <div
                  style={{
                    position: 'absolute', bottom: 6, right: 6,
                    fontSize: 12, color: 'var(--heart)',
                    textShadow: '0 1px 4px rgba(0,0,0,0.8)',
                  }}
                >
                  ❤️
                </div>
              </div>
            </button>
          ))}
          {/* Espaços vazios para completar os 4 slots */}
          {Array.from({ length: Math.max(0, 4 - favorites.length) }).map((_, i) => (
            <div
              key={`empty-${i}`}
              style={{
                aspectRatio: '2/3',
                borderRadius: 8,
                background: 'var(--paper-2)',
                border: '1px dashed var(--line)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <span style={{ color: 'var(--ink-4)', fontSize: 20 }}>+</span>
            </div>
          ))}
        </div>
      ) : (
        <div
          style={{
            padding: '24px 16px',
            borderRadius: 12,
            background: 'var(--paper-2)',
            border: '1px dashed var(--line)',
            textAlign: 'center',
          }}
        >
          <p style={{ color: 'var(--ink-3)', fontSize: 13, margin: 0 }}>
            Nenhum favorito ainda — clique em <b>Editar</b> para escolher até 4 filmes.
          </p>
        </div>
      )}
    </section>
  )
}


// ── FavPicker — seletor de favoritos ────────────────────────────────────────
// Busca os filmes assistidos sozinho na montagem (não depende de prop Movie[]).

interface FavPickerProps {
  currentIds: string[]          // IDs já selecionados como favoritos
  onSave: (ids: string[]) => void
  onCancel: () => void
}

function FavPicker({ currentIds, onSave, onCancel }: FavPickerProps) {
  // IDs selecionados como favoritos (máximo 4)
  const [selected, setSelected] = useState<string[]>(currentIds)

  // Filmes assistidos carregados da API — começa vazio, busca ao montar
  const [watchedMovies, setWatchedMovies] = useState<Movie[]>([])
  const [loadingMovies, setLoadingMovies] = useState(true)

  // Busca somente filmes com status='watched' para o picker
  useEffect(() => {
    akaneApi.list({ status: 'watched' })
      .then(r => setWatchedMovies(r.movies))
      .catch(() => {})
      .finally(() => setLoadingMovies(false))
  }, [])

  function toggleFav(id: string) {
    setSelected(prev => {
      if (prev.includes(id)) {
        // Remove o filme dos favoritos
        return prev.filter(x => x !== id)
      }
      if (prev.length >= 4) {
        // Já tem 4 favoritos — não adiciona
        return prev
      }
      return [...prev, id]
    })
  }

  return (
    // Overlay escuro que cobre a tela inteira
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.7)',
        zIndex: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
      onClick={onCancel}  // Fecha ao clicar fora do modal
    >
      {/* Modal em si — stopPropagation para não fechar ao clicar dentro */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--paper)',
          borderRadius: 16,
          padding: 24,
          maxWidth: 560,
          width: '100%',
          maxHeight: '80vh',
          overflow: 'hidden',
          display: 'flex', flexDirection: 'column', gap: 16,
        }}
      >
        {/* Cabeçalho */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ margin: 0, fontFamily: 'var(--serif)', fontSize: 16, color: 'var(--ink)', fontWeight: 600 }}>
              Escolher favoritos
            </p>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>
              {selected.length}/4 selecionados — clique para (des)selecionar
            </p>
          </div>
          <button className="ak-btn" onClick={onCancel} style={{ fontSize: 12 }}>✕</button>
        </div>

        {/* Grade de filmes assistidos (apenas 'watched' pode ser favorito) */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {loadingMovies ? (
            <p style={{ color: 'var(--ink-3)', fontSize: 13, textAlign: 'center', padding: 24 }}>
              Carregando filmes…
            </p>
          ) : watchedMovies.length === 0 ? (
            <p style={{ color: 'var(--ink-3)', fontSize: 13, textAlign: 'center', padding: 24 }}>
              Nenhum filme assistido ainda.
            </p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 8 }}>
              {watchedMovies.map(movie => {
                const isSel = selected.includes(movie.id)
                return (
                  <button
                    key={movie.id}
                    onClick={() => toggleFav(movie.id)}
                    style={{
                      all: 'unset',
                      cursor: 'pointer',
                      borderRadius: 8,
                      overflow: 'hidden',
                      position: 'relative',
                      outline: isSel ? '2px solid var(--rose)' : '2px solid transparent',
                      transition: 'outline 0.1s',
                    }}
                    title={movie.title}
                  >
                    <Poster
                      title={movie.title}
                      posterUrl={movie.poster_url}
                      palette={movie.poster_palette}
                      year={movie.year}
                    />
                    {/* Indicador visual de seleção (número de posição) */}
                    {isSel && (
                      <div
                        style={{
                          position: 'absolute', top: 4, right: 4,
                          width: 20, height: 20,
                          background: 'var(--rose)',
                          borderRadius: '50%',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 12, color: '#fff',
                          fontWeight: 700,
                        }}
                      >
                        {selected.indexOf(movie.id) + 1}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Botões de ação */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="ak-btn" onClick={onCancel}>Cancelar</button>
          <button
            className="ak-btn-primary"
            onClick={() => onSave(selected)}
          >
            Salvar {selected.length > 0 ? `(${selected.length})` : ''}
          </button>
        </div>
      </div>
    </div>
  )
}


// ── Estatísticas rápidas (4 cards) ──────────────────────────────────────────
// HomeData expõe counts.{films_watched, diary, watchlist} e sessions_7d.
// Não há avg_rating nem rewatches no endpoint /home — esses ficam no /stats.

interface QuickStatsProps {
  filmsWatched: number    // Total de filmes assistidos (status='watched')
  diarySessions: number   // Total de entradas no diário
  watchlistCount: number  // Filmes na watchlist
  sessions7d: number      // Sessões nos últimos 7 dias
}

function QuickStats({ filmsWatched, diarySessions, watchlistCount, sessions7d }: QuickStatsProps) {
  const stats = [
    { icon: '◈', label: 'Filmes',     value: filmsWatched.toString() },
    { icon: '📽', label: 'Sessões',   value: diarySessions.toString() },
    { icon: '♦',  label: 'Watchlist', value: watchlistCount.toString() },
    { icon: '📅', label: 'Esta semana', value: sessions7d.toString() },
  ]

  return (
    <section>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        {stats.map(s => (
          <div
            key={s.label}
            className="ak-stat-card"
            style={{ textAlign: 'center', padding: '14px 10px' }}
          >
            <div style={{ fontSize: 18, marginBottom: 4 }}>{s.icon}</div>
            <div className="ak-stat-value">{s.value}</div>
            <div className="ak-stat-label">{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  )
}


// ── Histograma de notas ──────────────────────────────────────────────────────

interface RatingHistogramProps {
  histogram: Record<string, number>
}

function RatingHistogram({ histogram }: RatingHistogramProps) {
  // Ordena as notas de 0.5 a 5.0 em passos de 0.5
  const keys = ['0.5', '1', '1.5', '2', '2.5', '3', '3.5', '4', '4.5', '5']
  const values = keys.map(k => histogram[k] ?? 0)
  const maxVal = Math.max(...values, 1)  // Evita divisão por zero

  return (
    <section>
      {/* Título */}
      <p style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 12, margin: '0 0 12px' }}>
        Distribuição de notas
      </p>

      <div className="ak-histogram">
        {keys.map((k, i) => {
          const val = values[i]
          const height = (val / maxVal) * 60  // Altura máxima das barras: 60px
          return (
            <div key={k} className="ak-histogram-col">
              {/* Contagem acima da barra (só quando > 0) */}
              {val > 0 && (
                <span className="ak-histogram-count">{val}</span>
              )}
              {/* Barra com cor fixa --gold (verde Letterboxd, SC-006) */}
              <div
                className="ak-histogram-bar"
                style={{ height: `${Math.max(height, 2)}px` }}
              />
              {/* Rótulo da nota abaixo */}
              <span className="ak-histogram-label">{k}</span>
            </div>
          )
        })}
      </div>
    </section>
  )
}


// ── Atividade recente ────────────────────────────────────────────────────────
// recent_activity é DiaryEntry & { liked: boolean }[] — NÃO Movie[].
// DiaryEntry tem: id, movie_id, movie_title, poster_url, poster_palette,
//                 watched_date, rating, rewatch, review, tags.

interface RecentActivityProps {
  entries: Array<DiaryEntry & { liked: boolean }>  // Entradas do diário recentes
  onSelectMovie: (id: string) => void
  // onLog: reservado — futura ação "Logar novamente" em cada item
}

function RecentActivity({ entries, onSelectMovie }: RecentActivityProps) {
  // Exibe no máximo 8 entradas na seção de recentes
  const recent = entries.slice(0, 8)

  return (
    <section>
      <p style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 12, margin: '0 0 12px' }}>
        Assistidos recentemente
      </p>

      {/* Scroll horizontal de pôsteres miniatura */}
      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
        {recent.map(entry => (
          <div
            key={entry.id}
            style={{ flexShrink: 0, width: 80, cursor: 'pointer' }}
            onClick={() => onSelectMovie(entry.movie_id)}
          >
            {/* Pôster 80×120.
                DiaryEntry não tem "year" — prop year omitido. */}
            <div style={{ height: 120, borderRadius: 8, overflow: 'hidden', position: 'relative' }}>
              <Poster
                title={entry.movie_title ?? ''}
                posterUrl={entry.poster_url}
                palette={entry.poster_palette}
              />
              {/* Badge de rewatch — DiaryEntry.rewatch (boolean) */}
              {entry.rewatch && (
                <div
                  style={{
                    position: 'absolute', bottom: 3, left: 3,
                    background: 'rgba(0,0,0,0.7)',
                    color: 'var(--ink-3)',
                    fontSize: 9,
                    padding: '1px 4px',
                    borderRadius: 4,
                  }}
                >
                  🔁
                </div>
              )}
            </div>
            {/* Título truncado — movie_title é o campo desnormalizado no DiaryEntry */}
            <p
              style={{
                margin: '4px 0 0',
                fontSize: 10,
                color: 'var(--ink-3)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {entry.movie_title}
            </p>
            {/* Nota em estrelas (se houver) */}
            {entry.rating != null && (
              <Stars rating={entry.rating} size={10} />
            )}
          </div>
        ))}
      </div>
    </section>
  )
}


// ── Dica de próxima sessão (watchlist não vazia) ─────────────────────────────

function NextSessionHint({ count }: { count: number }) {
  return (
    <div
      style={{
        padding: '12px 16px',
        borderRadius: 10,
        background: 'var(--paper-2)',
        border: '1px solid var(--line)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}
    >
      <span style={{ fontSize: 16 }}>♦</span>
      <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>
        Você tem <b>{count}</b> {count === 1 ? 'filme' : 'filmes'} na watchlist.
      </span>
    </div>
  )
}
