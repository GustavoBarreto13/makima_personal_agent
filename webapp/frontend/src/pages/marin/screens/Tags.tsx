// Etiquetas: a nuvem das etiquetas dos animes. Escolher uma mostra os animes dela logo abaixo.

import { useState } from 'react'
import { Chip, EmptyState, ErrorState, LoadingState, Page, SectionHeader } from '../../../design'
import { AnimeCard } from '../components/AnimeCard'
import { useMarin } from '../context'
import { useLoad } from '../lib/useLoad'
import { marinApi } from '../marinApi'

export function Tags() {
  const marin = useMarin()
  const { state, retry } = useLoad(() => marinApi.tags(), [marin.rev])
  const [picked, setPicked] = useState<string | null>(null)

  if (state.status === 'loading') return <Page><LoadingState variant="row" count={4} /></Page>
  if (state.status === 'error') return <Page><ErrorState onRetry={retry} /></Page>

  const tags = state.data
  if (tags.length === 0) {
    return <Page><EmptyState icon="tag" title="Nenhuma etiqueta ainda" hint="Abra um anime e adicione etiquetas (isekai, comfort, ver-com-a-família). Elas aparecem aqui." /></Page>
  }
  // O catálogo já está carregado no shell: filtra aqui, sem outra consulta.
  const shown = picked ? marin.animes.filter((a) => a.tags.includes(picked)) : []

  return (
    <Page>
      <section aria-labelledby="mr-tags">
        <SectionHeader title="Todas as etiquetas" id="mr-tags" mono={`${tags.length}`} />
        <div className="ds-inline mr-cloud">
          {tags.map((t) => (
            <Chip key={t.name} on={picked === t.name} icon="tag" aria-pressed={picked === t.name} onClick={() => setPicked((cur) => (cur === t.name ? null : t.name))}>
              {t.name} · {t.count}
            </Chip>
          ))}
        </div>
      </section>
      {picked && (
        <section aria-labelledby="mr-tag-animes">
          <SectionHeader title={`Animes com “${picked}”`} id="mr-tag-animes" mono={`${shown.length}`} />
          {shown.length === 0
            ? <p className="ds-hint">Nenhum anime do catálogo tem essa etiqueta agora.</p>
            : <div className="ds-grid-poster">{shown.map((a, i) => <AnimeCard key={a.id} anime={a} index={i} />)}</div>}
        </section>
      )}
    </Page>
  )
}
