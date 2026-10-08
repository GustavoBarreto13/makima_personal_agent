// Lançamentos: os próximos episódios dos animes que você está assistindo, dos próximos 14 dias, agrupados por
// dia. O episódio que vai ao ar hoje ganha o selo "Novo ep"; "Já vi" abre o formulário já nesse episódio.

import { fmtDateLong } from '../../../design/core/format'
import { Button, EmptyState, ErrorState, LoadingState, Page, SectionHeader } from '../../../design'
import { Poster } from '../components/Poster'
import { useMarin } from '../context'
import { useLoad } from '../lib/useLoad'
import { marinApi } from '../marinApi'
import type { ScheduleItem } from '../types'

/** "Hoje", "Amanhã" ou "quinta-feira, 19 de junho". */
function dayLabel(date: string, today: string): string {
  const diff = Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000)
  if (diff === 0) return 'Hoje'
  if (diff === 1) return 'Amanhã'
  return fmtDateLong(date)
}

/** Horário do episódio em Tóquio e em Brasília, quando o servidor trouxe hora (hoje só vem o dia). */
function airTimes(at: string | null): { jst: string; brt: string } | null {
  if (!at) return null
  const d = new Date(at)
  if (Number.isNaN(d.getTime())) return null
  const fmt = (timeZone: string) => d.toLocaleTimeString('pt-BR', { timeZone, hour: '2-digit', minute: '2-digit' })
  return { jst: fmt('Asia/Tokyo'), brt: fmt('America/Sao_Paulo') }
}

function ScheduleRow({ item }: { item: ScheduleItem }) {
  const marin = useMarin()
  const times = airTimes(item.at)
  const isNew = item.date === marin.today
  return (
    <div className="mr-row">
      <Poster title={item.title} src={item.poster} small onOpen={() => marin.goto({ view: 'catalog', animeId: item.animeId })} />
      <button type="button" className="mr-link mr-row-main" onClick={() => marin.goto({ view: 'catalog', animeId: item.animeId })}>
        <b className="mr-row-t">{item.title}</b>
        <span className="mr-row-s">Ep {item.episode}{item.episodeTitle ? ` · ${item.episodeTitle}` : ''}</span>
        {times && <span className="mr-row-s">{times.jst} JST · {times.brt} BRT</span>}
      </button>
      {isNew && <span className="mr-badge">Novo ep</span>}
      <Button size="sm" icon="check" onClick={() => marin.openLog({ animeId: item.animeId, episode: item.episode })}>Já vi</Button>
    </div>
  )
}

export function Schedule() {
  const marin = useMarin()
  const { state, retry } = useLoad(() => marinApi.schedule(14), [marin.rev])

  if (state.status === 'loading') return <Page><LoadingState variant="row" count={4} /></Page>
  if (state.status === 'error') return <Page><ErrorState onRetry={retry} /></Page>

  const items = state.data.filter((i) => i.date)
  if (items.length === 0) {
    return (
      <Page>
        <EmptyState
          icon="airing"
          title="Nenhum episódio nos próximos 14 dias"
          hint="Os animes que você está assistindo e ainda estão no ar aparecem aqui, com o dia de cada episódio novo."
          action={<Button icon="anime" onClick={() => marin.goto('catalog')}>Ver catálogo</Button>}
        />
      </Page>
    )
  }

  // Agrupa por dia (as datas ISO ordenam como texto).
  const byDay = new Map<string, ScheduleItem[]>()
  for (const i of items) byDay.set(i.date, [...(byDay.get(i.date) ?? []), i])
  const days = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b))

  return (
    <Page>
      {days.map(([date, list]) => (
        <section key={date} aria-label={dayLabel(date, marin.today)}>
          <SectionHeader title={dayLabel(date, marin.today)} mono={`${list.length} ${list.length === 1 ? 'ep' : 'eps'}`} />
          <div className="mr-rows">{list.map((i) => <ScheduleRow key={`${i.animeId}-${i.episode}`} item={i} />)}</div>
        </section>
      ))}
    </Page>
  )
}
