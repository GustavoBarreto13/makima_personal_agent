// Etiquetas: a nuvem das etiquetas dos filmes. Escolher uma mostra os filmes dela logo abaixo.

import { useState } from 'react'
import { Chip, EmptyState, ErrorState, LoadingState, Page, SectionHeader } from '../../../design'
import { akaneApi } from '../akaneApi'
import { FilmCard } from '../components/FilmCard'
import { useAkane } from '../context'
import { useLoad } from '../lib/useLoad'

export function Tags() {
  const akane = useAkane()
  const { state, retry } = useLoad(async () => {
    const [tags, films] = await Promise.all([akaneApi.tags(), akaneApi.list()])
    return { tags: tags.tags, movies: films.movies }
  }, [akane.rev])
  const [picked, setPicked] = useState<string | null>(null)

  if (state.status === 'loading') return <Page><LoadingState variant="row" count={4} /></Page>
  if (state.status === 'error') return <Page><ErrorState onRetry={retry} /></Page>

  const { tags, movies } = state.data
  if (tags.length === 0) {
    return <Page><EmptyState icon="tag" title="Nenhuma etiqueta ainda" hint="Ao logar um filme, adicione etiquetas (#coreano, #com-a-família). Elas aparecem aqui." /></Page>
  }
  const shown = picked ? movies.filter((m) => m.tags.includes(picked)) : []

  return (
    <Page>
      <section aria-labelledby="ax-tags">
        <SectionHeader title="Todas as etiquetas" id="ax-tags" mono={`${tags.length}`} />
        <div className="ds-inline ax-cloud">
          {tags.map((t) => (
            <Chip key={t.name} on={picked === t.name} icon={t.person ? 'person' : 'tag'} aria-pressed={picked === t.name} onClick={() => setPicked((cur) => (cur === t.name ? null : t.name))}>
              {t.name} · {t.count}
            </Chip>
          ))}
        </div>
      </section>
      {picked && (
        <section aria-labelledby="ax-tag-films">
          <SectionHeader title={`Filmes com “${picked}”`} id="ax-tag-films" mono={`${shown.length}`} />
          {shown.length === 0
            ? <p className="ds-hint">Nenhum filme do catálogo tem essa etiqueta agora (ela pode estar só em sessões).</p>
            : <div className="ds-grid">{shown.map((m, i) => <FilmCard key={m.id} movie={m} index={i} />)}</div>}
        </section>
      )}
    </Page>
  )
}
