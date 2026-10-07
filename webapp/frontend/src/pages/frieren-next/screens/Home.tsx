// Início: a biblioteca de relance, no modelo da Akane.
//   Hero (saudação, livro atual, citação) → 3 cartões de número → registrar em uma linha →
//   [Favoritos + Lidos recentemente | Diário e Notas] → Lendo agora → mapa de calor do ano.
// Dados: home + diário + mapa de calor em paralelo; só o `home` é essencial: se os outros falham,
// o resto da tela continua de pé.

import { useState } from 'react'
import { Button, EmptyState, ErrorState, Heatmap, Hero, LoadingState, Page, SectionHeader } from '../../../design'
import { fmtNumber } from '../../../design/core/format'
import { DiaryPanel } from '../components/DiaryPanel'
import { FavoritesPicker } from '../components/FavoritesPicker'
import { LogCapture } from '../components/LogCapture'
import { FavoriteShelf, ReadingStrip, RecentShelf } from '../components/Shelves'
import { Spark, StatCard, Trend } from '../components/StatCard'
import { DEFAULT_PREFS, useFrieren } from '../context'
import { frierenApi } from '../frierenApi'
import { greeting } from '../lib/greeting'
import { useLoad } from '../lib/useLoad'
import type { Session } from '../types'

const QUOTE = '“A magia é a arte de imaginar o mundo. Os livros também — e a vantagem é que neles a gente nunca esquece.”'

// Limites do mapa de calor (páginas por dia), os mesmos níveis do shell antigo.
const HEAT: [number, number, number, number] = [1, 18, 38, 62]

export function Home() {
  const frieren = useFrieren()
  const year = Number(frieren.today.slice(0, 4))
  const [picking, setPicking] = useState(false)
  const { state, retry } = useLoad(async () => {
    const [home, sessions, heat] = await Promise.all([
      frierenApi.home(),
      frierenApi.sessions(30).catch(() => [] as Session[]),
      frierenApi.heatmap(year).catch(() => [] as { date: string; pages: number }[]),
    ])
    return { home, sessions, heat }
  }, [frieren.rev, year])

  if (state.status === 'loading') return <Page><LoadingState variant="stat" count={4} /></Page>
  if (state.status === 'error') return <Page><ErrorState onRetry={retry} /></Page>

  const { home, sessions, heat } = state.data
  const total = Object.values(home.counts).reduce((a, n) => a + (n ?? 0), 0)

  // Primeiro uso: nenhum livro na biblioteca.
  if (total === 0) {
    return (
      <Page>
        <EmptyState
          icon="book"
          title="Sua biblioteca começa aqui"
          hint="Adicione o livro que você está lendo (ou um que quer ler). A Frieren cuida do resto: capa, páginas, sessões e estatísticas."
          action={<Button variant="primary" icon="add" onClick={() => frieren.openAdd()}>Adicionar livro</Button>}
        />
      </Page>
    )
  }

  const goal = frieren.prefs.yearlyGoal > 0 ? frieren.prefs.yearlyGoal : DEFAULT_PREFS.yearlyGoal
  // O livro do hero: o que foi lido por último entre os que estão em leitura.
  const current = home.reading[0] ?? null
  const layout = frieren.prefs.heroLayout
  const yearPages = heat.reduce((a, d) => a + d.pages, 0)

  return (
    <Page>
      <Hero
        eyebrow="Biblioteca de Frieren"
        eyebrowIcon="library"
        title={`${greeting(new Date().getHours())}.`}
        compact={layout === 'editorial'}
        // "Galeria": a capa do livro atual no lugar do retrato (sem capa, fica o retrato da Frieren).
        portrait={layout === 'gallery' && current?.cover_url ? current.cover_url : '/frieren.png'}
        meta={
          <div className="fr-herometa">
            {current
              ? <p className="fr-heronow">No meio de <em>{current.title}</em>{current.total_pages ? ` · pág. ${current.current_page} de ${current.total_pages}` : ''}</p>
              : <p className="fr-heronow">Nenhum livro em leitura no momento.</p>}
            {layout !== 'editorial' && <blockquote className="fr-quote">{QUOTE}</blockquote>}
          </div>
        }
        actions={
          <>
            <Button variant="primary" icon="add" onClick={() => frieren.openLog()}>Registrar leitura</Button>
            {current
              ? <Button variant="ghost" icon="book" onClick={() => frieren.goto({ view: 'catalog', bookId: current.id })}>Continuar {current.title.length > 18 ? 'leitura' : current.title}</Button>
              : <Button variant="ghost" icon="days" onClick={() => frieren.goto('diary')}>Abrir diário</Button>}
          </>
        }
      />

      <div className="fr-stats">
        <StatCard
          icon="finished"
          label={`Livros · ${year}`}
          value={home.finished_year}
          unit="lidos"
          foot={<>Meta de {goal}: {home.finished_year >= goal ? <b>batida</b> : <>faltam <b>{goal - home.finished_year}</b></>}</>}
        />
        <StatCard icon="page" label="Páginas · 7 dias" value={fmtNumber(home.pages_7d)} foot={<Trend now={home.pages_7d} prev={home.pages_7d_prev} />}>
          <Spark data={home.spark.map((d) => d.value)} label={`Páginas lidas por dia nos últimos ${home.spark.length} dias`} />
        </StatCard>
        <StatCard
          icon="timer"
          label="Ritmo · 30 dias"
          value={fmtNumber(home.pages_30d / 30, 1)}
          unit="pág./dia"
          // ≈ 0,6 página por minuto: a mesma conta do shell antigo para "minutos de leitura".
          foot={<>≈ {Math.round(home.pages_30d / 30 / 0.6)} min de leitura por dia</>}
        />
        <StatCard
          icon="energy"
          label="Sequência"
          value={home.streak.current}
          unit={home.streak.current === 1 ? 'dia' : 'dias'}
          foot={<>Recorde: <b>{home.streak.best}</b> {home.streak.best === 1 ? 'dia seguido' : 'dias seguidos'}</>}
        />
      </div>

      <section aria-labelledby="fr-log">
        <SectionHeader title="Registrar" id="fr-log" mono="Enter salva · Shift+Enter abre o formulário" />
        <LogCapture />
      </section>

      <div className="fr-split">
        <div className="fr-main">
          <FavoriteShelf favorites={home.favorites} onPick={() => setPicking(true)} />
          <RecentShelf books={home.recent_finished} />
        </div>
        <DiaryPanel sessions={sessions} histogram={home.rating_histogram} />
      </div>

      <ReadingStrip reading={home.reading} />

      <section aria-labelledby="fr-heat">
        <SectionHeader title={`Páginas em ${year}`} id="fr-heat" mono={`${fmtNumber(yearPages)} páginas no ano`} />
        <div className="ds-card fr-pad">
          <Heatmap
            year={year}
            daily={heat.map((d) => ({ date: d.date, value: d.pages }))}
            today={frieren.today}
            thresholds={HEAT}
            formatValue={(v) => `${v} ${v === 1 ? 'página' : 'páginas'}`}
            label={`Páginas lidas por dia em ${year}, um bloco por mês`}
          />
        </div>
      </section>

      {picking && <FavoritesPicker current={home.favorites} onClose={() => setPicking(false)} />}
    </Page>
  )
}
