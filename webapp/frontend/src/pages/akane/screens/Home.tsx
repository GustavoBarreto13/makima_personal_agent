// Início: a cinemateca de relance, com os blocos de sempre.
//   Hero (saudação, última sessão, citação) → 2 cartões de número → logar em uma linha →
//   [Favoritos + Atividade recente | Diário e Notas] → Quero ver em destaque.
// Dados: home + heatmap (mini-gráfico) + diário (painel) + estatísticas do ano (filmes no ano) em paralelo; só o
// `home` é essencial: se os outros falham, o resto da tela continua de pé.

import { useState } from 'react'
import { addDaysISO } from '../../../design/core/format'
import { Button, EmptyState, ErrorState, Hero, LoadingState, Page, SectionHeader } from '../../../design'
import { akaneApi } from '../akaneApi'
import { DiaryPanel } from '../components/DiaryPanel'
import { FavoritesPicker } from '../components/FavoritesPicker'
import { LogCapture } from '../components/LogCapture'
import { FavoriteShelf, RecentShelf, WatchlistStrip } from '../components/Shelves'
import { Spark, StatCard } from '../components/StatCard'
import { useAkane } from '../context'
import { greeting } from '../lib/greeting'
import { useLoad } from '../lib/useLoad'
import type { DiaryEntry, HeatmapDay } from '../types'

const QUOTE = '“Para interpretar alguém, primeiro é preciso assistir o mundo inteiro com atenção. O cinema é onde eu treino o olhar.”'
const DEFAULT_GOAL = 60
const SPARK_DAYS = 21

export function Home() {
  const akane = useAkane()
  const year = Number(akane.today.slice(0, 4))
  const [picking, setPicking] = useState(false)
  const { state, retry } = useLoad(async () => {
    const [home, heat, diary, stats] = await Promise.all([
      akaneApi.home(),
      akaneApi.heatmap(year).catch(() => ({ days: [] as HeatmapDay[] })),
      akaneApi.diary(30).catch(() => ({ entries: [] as DiaryEntry[] })),
      akaneApi.statsPayload(year).catch(() => null),
    ])
    const filmsYear = stats ? stats.kpis.find((k) => k.key === 'films')?.value ?? null : null
    return { home, days: heat.days ?? [], diary: diary.entries ?? [], filmsYear }
  }, [akane.rev, year])

  if (state.status === 'loading') return <Page><LoadingState variant="stat" count={4} /></Page>
  if (state.status === 'error') return <Page><ErrorState onRetry={retry} /></Page>

  const { home, days, diary, filmsYear } = state.data
  if (home.counts.films_watched === 0 && home.counts.diary === 0 && home.counts.watchlist === 0) {
    return (
      <Page>
        <EmptyState
          icon="movie"
          title="Sua cinemateca começa aqui"
          hint="Logue o primeiro filme que você viu, ou guarde um que quer ver. A Akane cuida do resto: pôster, diretor, notas e estatísticas."
          action={<Button variant="primary" icon="add" onClick={() => akane.openLog()}>Logar filme</Button>}
        />
      </Page>
    )
  }

  // mini-gráfico: sessões por dia nos últimos 21 dias (o mapa do servidor só traz os dias do ano)
  const byDay = new Map(days.map((d) => [d.date, d.count]))
  const spark = Array.from({ length: SPARK_DAYS }, (_, i) => byDay.get(addDaysISO(akane.today, i - (SPARK_DAYS - 1))) ?? 0)
  const week = home.sessions_7d
  const prev = home.sessions_7d_prev
  const delta = prev ? Math.round(((week - prev) / prev) * 100) : week > 0 ? 100 : 0
  const goal = akane.prefs.yearlyGoal > 0 ? akane.prefs.yearlyGoal : DEFAULT_GOAL
  const last = home.last_session

  return (
    <Page>
      <Hero
        eyebrow="Cinemateca de Akane"
        eyebrowIcon="movie"
        title={`${greeting(new Date().getHours())}.`}
        portrait="/akane-hero.png"
        meta={
          <div className="ax-herometa">
            {last
              ? <p className="ax-now">Última sessão · <b>{last.title}</b>{last.rating != null && <em> · {last.rating.toFixed(1)} ★</em>}</p>
              : <p className="ax-now">Nenhuma sessão registrada ainda: <em>o primeiro filme te espera</em>.</p>}
            <blockquote className="ax-quote">{QUOTE}</blockquote>
          </div>
        }
        actions={
          <>
            <Button variant="primary" icon="add" onClick={() => akane.openLog()}>Logar filme</Button>
            <Button variant="ghost" icon="days" onClick={() => akane.goto('diary')}>Abrir diário</Button>
          </>
        }
      />

      <div className="ax-stats">
        <StatCard
          icon="movie"
          label={filmsYear !== null ? `Filmes · ${year}` : 'Filmes vistos'}
          value={filmsYear ?? home.counts.films_watched}
          unit="vistos"
          foot={filmsYear !== null ? <>Meta de {goal}: faltam <b>{Math.max(0, goal - filmsYear)}</b></> : undefined}
        />
        <StatCard
          icon="days"
          label="Sessões · 7 dias"
          value={week}
          foot={<>{delta >= 0 ? <span className="ax-up">↑ {delta}%</span> : <span>↓ {Math.abs(delta)}%</span>} vs. semana anterior</>}
        >
          <Spark data={spark} />
        </StatCard>
      </div>

      <section aria-labelledby="ax-log">
        <SectionHeader title="Logar" id="ax-log" mono="Enter salva · Shift+Enter abre o formulário" />
        <LogCapture />
      </section>

      <div className="ax-split">
        <div className="ax-main">
          <FavoriteShelf favorites={home.favorites} onPick={() => setPicking(true)} />
          <RecentShelf entries={home.recent_activity} />
        </div>
        <DiaryPanel diary={diary} totalDiary={home.counts.diary} histogram={home.rating_histogram} />
      </div>

      <WatchlistStrip items={home.watchlist_highlight} />

      {picking && <FavoritesPicker current={home.favorites} onClose={() => setPicking(false)} />}
    </Page>
  )
}
