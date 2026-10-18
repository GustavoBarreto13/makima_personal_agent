// Estatísticas: o ano em contatos. Tudo vem do backend no contrato StatsPayload (GET /api/people/stats):
// contatos por mês e por dia, pessoas contatadas, aniversários do ano, quem está sem contato e onde as pessoas
// aparecem nos outros agentes (menções cruzadas).

import { useState } from 'react'
import { ErrorState, LoadingState, Page, StatsPage } from '../../../design'
import { fmtNumber } from '../../../design/core/format'
import { useKomi } from '../context'
import { komiApi } from '../komiApi'
import { useLoad } from '../lib/useLoad'

export function Stats() {
  const komi = useKomi()
  const maxYear = Number(komi.today.slice(0, 4))
  const [year, setYear] = useState(maxYear)
  const { state, retry } = useLoad(() => komiApi.stats(year), [year, komi.rev])

  if (state.status === 'loading') return <Page wide><LoadingState variant="stat" count={4} /></Page>
  if (state.status === 'error') return <Page wide><ErrorState onRetry={retry} /></Page>

  const p = state.data
  const kpi = (key: string) => p.kpis.find((k) => k.key === key)?.value ?? 0
  const total = kpi('interactions')

  const summary = (
    <>
      <span>{fmtNumber(total)} {total === 1 ? 'contato registrado' : 'contatos registrados'}</span>
      <span>·</span>
      <span>{fmtNumber(kpi('people_contacted'))} {kpi('people_contacted') === 1 ? 'pessoa' : 'pessoas'}</span>
      {kpi('no_contact') > 0 && <><span>·</span><span>{fmtNumber(kpi('no_contact'))} sem contato há mais de 30 dias</span></>}
    </>
  )

  return (
    <StatsPage
      payload={p}
      hero={{ eyebrow: 'Seu ano em contatos', summary }}
      minYear={p.first_year}
      maxYear={maxYear}
      onYear={setYear}
      today={komi.today}
      // Quantos contatos num dia: 1, 2, 3 e 4 ou mais.
      heatThresholds={[1, 2, 3, 4]}
      formatDaily={(v) => `${v} ${v === 1 ? 'contato' : 'contatos'}`}
      heatmapTitle="Dias com contato"
      monthlyTitle="Contatos por mês"
      emptyHint="Registre um contato neste ano para ver as estatísticas."
    />
  )
}
