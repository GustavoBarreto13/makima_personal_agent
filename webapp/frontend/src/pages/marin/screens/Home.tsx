// Início: o catálogo de relance.
//   Hero (continue assistindo) → 3 cartões de número → logar em uma linha →
//   [Favoritos + Assistindo agora | Atividade recente, Próximos episódios e Acervo] → fila "Quero assistir".
// Dados: home + diário (mini-gráfico) + estatísticas do ano (nota média) em paralelo; só o `home` é essencial:
// se os outros falham, o resto da tela continua de pé.

import { useState } from 'react'
import { addDaysISO, fmtNumber } from '../../../design/core/format'
import { Button, EmptyState, ErrorState, Hero, LoadingState, Page, SectionHeader, hueFromName } from '../../../design'
import { FavoritesPicker } from '../components/FavoritesPicker'
import { LogCapture } from '../components/LogCapture'
import { FavoriteShelf, QueueStrip, RecentPanel, StatusPanel, UpcomingPanel, WatchingShelf } from '../components/Shelves'
import { Spark, StatCard, Trend } from '../components/StatCard'
import { useMarin } from '../context'
import { greeting } from '../lib/greeting'
import { useLoad } from '../lib/useLoad'
import { marinApi } from '../marinApi'
import type { Session } from '../types'

const SPARK_DAYS = 21

/** Episódios por dia nos últimos `days` dias (a partir das sessões do diário). */
function episodesPerDay(sessions: Session[], today: string, days: number): number[] {
  const byDay = new Map<string, number>()
  for (const s of sessions) byDay.set(s.date, (byDay.get(s.date) ?? 0) + s.count)
  return Array.from({ length: days }, (_, i) => byDay.get(addDaysISO(today, i - (days - 1))) ?? 0)
}

export function Home() {
  const marin = useMarin()
  const year = Number(marin.today.slice(0, 4))
  const [picking, setPicking] = useState(false)
  const { state, retry } = useLoad(async () => {
    const [home, diary, stats] = await Promise.all([
      marinApi.home(),
      marinApi.diary(120).catch(() => [] as Session[]),
      marinApi.statsPayload(year).catch(() => null),
    ])
    const avg = stats ? stats.kpis.find((k) => k.key === 'avg_rating')?.value ?? 0 : 0
    const eps = stats ? stats.kpis.find((k) => k.key === 'episodes')?.value ?? null : null
    return { home, diary, avg, eps }
  }, [marin.rev, year])

  if (state.status === 'loading') return <Page><LoadingState variant="stat" count={4} /></Page>
  if (state.status === 'error') return <Page><ErrorState onRetry={retry} /></Page>

  const { home, diary, avg, eps } = state.data
  const total = Object.values(home.counts).reduce((n, c) => n + c, 0)
  if (total === 0 && home.recent.length === 0) {
    return (
      <Page>
        <EmptyState
          icon="anime"
          title="Seu catálogo começa aqui"
          hint="Adicione o primeiro anime (a Marin busca pôster, estúdio e episódios sozinha) ou sincronize com o MyAnimeList."
          action={<Button variant="primary" icon="add" onClick={() => marin.openAdd()}>Adicionar anime</Button>}
        />
      </Page>
    )
  }

  const last = home.last
  const next = last?.next
  const followed = home.counts.assistindo + home.counts.completo
  const spark = episodesPerDay(diary, marin.today, SPARK_DAYS)

  return (
    <Page>
      <Hero
        eyebrow={`${greeting(new Date().getHours())} · Catálogo da Marin`}
        eyebrowIcon="anime"
        title={last ? `Continue ${last.anime.title}` : 'Seu catálogo de animes'}
        tone={last ? { hue: hueFromName(last.anime.title) } : undefined}
        meta={
          <div className="mr-herometa">
            {last
              ? <p className="mr-now">{last.anime.total ? `Ep ${last.anime.watched} de ${last.anime.total}` : `Ep ${last.anime.watched}`}{next ? <> · próximo: <b>ep {next.number}{next.title ? ` · ${next.title}` : ''}</b></> : null}{last.anime.rating ? <em> · {last.anime.rating.toFixed(1)} ★</em> : null}</p>
              : <p className="mr-now">Nenhuma sessão registrada ainda: <em>o primeiro episódio te espera</em>.</p>}
          </div>
        }
        actions={
          <>
            <Button variant="primary" icon="episode" onClick={() => marin.openLog(last ? { animeId: last.anime.id, episode: next?.number } : {})}>
              {next ? `Logar ep ${next.number}` : 'Logar episódio'}
            </Button>
            {last && <Button variant="ghost" icon="anime" onClick={() => marin.goto({ view: 'catalog', animeId: last.anime.id })}>Ver detalhe</Button>}
          </>
        }
      />

      <div className="mr-stats">
        <StatCard icon="anime" label="Acompanhados" value={followed} unit={followed === 1 ? 'anime' : 'animes'} foot={<>{home.counts.assistindo} assistindo · {home.counts.completo} completos</>} />
        <StatCard icon="episode" label="Episódios · 7 dias" value={home.episodes7d} foot={<Trend now={home.episodes7d} prev={home.episodes7dPrev} />}>
          <Spark data={spark} label={`Episódios nos últimos ${SPARK_DAYS} dias`} />
        </StatCard>
        <StatCard
          icon="star"
          label={`Nota média · ${year}`}
          value={avg > 0 ? fmtNumber(avg, 1) : '—'}
          unit={avg > 0 ? '/5' : undefined}
          foot={eps !== null ? <>{fmtNumber(eps)} {eps === 1 ? 'episódio' : 'episódios'} no ano</> : undefined}
        />
      </div>

      <section aria-labelledby="mr-log">
        <SectionHeader title="Logar" id="mr-log" mono="Enter salva · Shift+Enter abre o formulário" />
        <LogCapture />
      </section>

      <div className="mr-split">
        <div className="mr-main">
          <FavoriteShelf favorites={home.favorites} onPick={() => setPicking(true)} />
          <WatchingShelf animes={home.watching} />
        </div>
        <div className="mr-side">
          <RecentPanel sessions={home.recent} />
          <UpcomingPanel items={home.upcoming} />
          <StatusPanel counts={home.counts} />
        </div>
      </div>

      <QueueStrip items={home.queue} />

      {picking && <FavoritesPicker current={home.favorites} onClose={() => setPicking(false)} />}
    </Page>
  )
}

