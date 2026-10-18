// Pessoas: o diretório, em cartões ou lista. Busca por qualquer um dos nomes (Nome, Apelido, Nome completo, outras
// formas), cidade e grupo; facetas de relacionamento, espaço, grupo, aniversário e último contato; agrupar e ordenar.
// Respeita o espaço escolhido no topo e, se vier de um relacionamento do menu, já abre filtrado nele.

import { useEffect, useMemo, useState } from 'react'
import { Button, Chip, CollectionBody, CollectionMeta, CollectionToolbar, EmptyState, FilterSheet, Page } from '../../../design'
import { useCollection } from '../../../design/headless/useCollection'
import { PersonCard, PersonRowItem } from '../components/PersonCard'
import { useKomi } from '../context'
import { makePeopleSchema, toItem, type PersonItem } from '../lib/people'

const NOUN: [string, string] = ['pessoa', 'pessoas']

export function People() {
  const komi = useKomi()
  const { category } = komi.route
  // Um relacionamento escolhido no menu recorta a lista antes dos filtros (sem gravar nada nos filtros lembrados).
  const items = useMemo<PersonItem[]>(
    () => komi.visible.filter((p) => !category || p.category === category).map(toItem),
    [komi.visible, category],
  )
  const schema = useMemo(() => makePeopleSchema(komi.categories), [komi.categories])
  const c = useCollection(schema, items, { today: komi.today })
  const [filters, setFilters] = useState(false)
  const layout = komi.prefs.layout
  const categoryLabel = category ? komi.categories.find((x) => x.slug === category)?.label ?? category : null

  // Busca digitada no topo da página: aplica aqui e limpa (para não reaplicar ao voltar).
  const { topQuery, clearTopQuery } = komi
  const { setQ } = c
  useEffect(() => {
    if (topQuery) { setQ(topQuery); clearTopQuery() }
  }, [topQuery, clearTopQuery, setQ])

  const open = (id: string) => komi.goto({ view: 'people', personId: id })

  return (
    <Page wide>
      <CollectionToolbar
        schema={schema}
        c={c}
        onOpenFilters={() => setFilters(true)}
        view={layout}
        onView={(v) => komi.setPrefs({ layout: v })}
        searchPlaceholder="Buscar por nome, apelido, cidade ou grupo"
        extra={<Button variant="primary" size="sm" icon="add" onClick={() => komi.openPerson()}>Nova pessoa</Button>}
      />
      {categoryLabel && (
        <div className="ds-inline">
          <Chip on icon="close" onClick={() => komi.goto('people')} aria-label={`Tirar o filtro ${categoryLabel}`}>{categoryLabel}</Chip>
        </div>
      )}
      <CollectionMeta c={c} noun={NOUN} />
      <CollectionBody
        c={c}
        view={layout}
        gridClass="km-grid"
        renderCard={(p) => <PersonCard key={p.id} person={p} onOpen={() => open(p.id)} />}
        renderRow={(p) => <PersonRowItem key={p.id} person={p} onOpen={() => open(p.id)} />}
        loading={komi.peopleState.status === 'loading'}
        error={komi.peopleState.status === 'error'}
        onRetry={komi.retryPeople}
        emptyTitle="Ninguém com esses filtros"
        firstRun={
          <EmptyState
            icon="people"
            title={komi.people.length ? 'Ninguém neste espaço ainda' : 'Seu caderno de pessoas está vazio'}
            hint={komi.people.length ? 'Troque o espaço no topo ou cadastre alguém aqui.' : 'Cadastre quem importa: aniversário, anotações e tudo que os outros agentes souberem dela aparecem no perfil.'}
            action={<Button variant="primary" icon="add" onClick={() => komi.openPerson()}>Nova pessoa</Button>}
          />
        }
      />
      {filters && <FilterSheet schema={schema} c={c} items={items} onClose={() => setFilters(false)} noun={NOUN} />}
    </Page>
  )
}
