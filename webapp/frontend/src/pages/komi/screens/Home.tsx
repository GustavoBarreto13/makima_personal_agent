// Início: o caderno de relance.
//   Hero (aniversário de hoje ou o próximo, e quem pede um oi) → 4 cartões → registrar contato em uma linha →
//   [Próximas datas | Reconectar] → A acertar (Nami) → Parecem a mesma pessoa.
// Só as pessoas são essenciais: duplicadas são complemento e, se falharem, o resto da tela segue de pé.

import { useMemo, useState } from 'react'
import { Avatar, Button, EmptyState, ErrorState, Hero, LoadingState, Page, QuickCapture, SectionHeader, type CaptureLegendItem } from '../../../design'
import { fmtMoney, fmtNumber } from '../../../design/core/format'
import { greeting } from '../lib/greeting'
import { MergeDialog } from '../components/MergeDialog'
import { StatTile } from '../components/Tiles'
import { useKomi } from '../context'
import { komiApi } from '../komiApi'
import { contactParser, emptyContact } from '../lib/capture'
import { daysSince, inLabel, sinceLabel, upcomingDates } from '../lib/dates'
import { reconnectCandidates } from '../lib/people'
import { useLoad } from '../lib/useLoad'
import { DateRow } from './Dates'
import type { DuplicatePair } from '../types'

const EXAMPLES = ['+Bia café ontem', 'Caio ligação', 'Ana mensagem #trabalho', 'Marcos vídeo sexta']
const LEGEND: CaptureLegendItem[] = [
  { kind: 'person', sample: '+Bia (ou só o nome)' },
  { kind: 'date', sample: 'ontem · sexta · 12/09' },
  { kind: 'tag', sample: '#trabalho · #pessoal' },
]

const NO_PAIRS: DuplicatePair[] = []

export function Home() {
  const komi = useKomi()
  const [merging, setMerging] = useState<DuplicatePair | null>(null)
  const dup = useLoad(() => komiApi.duplicates().catch(() => NO_PAIRS), [komi.rev])

  const dates = useMemo(() => upcomingDates(komi.visible, komi.today, 60), [komi.visible, komi.today])
  const birthdays = dates.filter((d) => d.isBirthday)
  const reconnect = useMemo(() => reconnectCandidates(komi.visible, komi.today, komi.prefs.reconnectDays, false), [komi.visible, komi.today, komi.prefs.reconnectDays])
  const owing = useMemo(
    () => komi.visible.filter((p) => Math.abs(p.finance_net) >= 0.005).sort((a, b) => Math.abs(b.finance_net) - Math.abs(a.finance_net)).slice(0, 5),
    [komi.visible],
  )
  const recentContacts = komi.visible.filter((p) => {
    const d = daysSince(p.last_interaction?.date, komi.today)
    return d !== null && d <= 30
  }).length

  if (komi.peopleState.status === 'loading') return <Page><LoadingState variant="stat" count={4} /></Page>
  if (komi.peopleState.status === 'error') return <Page><ErrorState onRetry={komi.retryPeople} /></Page>

  // Primeiro uso: ninguém cadastrado.
  if (komi.people.length === 0) {
    return (
      <Page>
        <EmptyState
          icon="people"
          title="Seu caderno de pessoas começa aqui"
          hint="Cadastre quem importa. A Komi guarda os três nomes, o aniversário (com lembrete no calendário), anotações de presente e tudo que os outros agentes souberem sobre a pessoa."
          action={<Button variant="primary" icon="add" onClick={() => komi.openPerson()}>Nova pessoa</Button>}
        />
      </Page>
    )
  }

  const today = birthdays.filter((d) => d.inDays === 0)
  const next = birthdays[0] ?? null
  const mostStale = reconnect[0] ?? null
  const pairs = dup.state.status === 'ok' ? dup.state.data : NO_PAIRS
  const names = (list: { personName: string }[]) => list.map((d) => d.personName).join(' e ')

  return (
    <Page>
      <Hero
        eyebrow="Caderno de bilhetes"
        eyebrowIcon="people"
        title={today.length ? `Hoje é aniversário de ${names(today)}.` : `${greeting(new Date().getHours())}.`}
        meta={
          <div className="km-herometa">
            {next && !today.length && <p className="km-heronow">Próximo aniversário: <em>{next.personName}</em>, {inLabel(next.inDays)}{next.years ? ` (faz ${next.years})` : ''}.</p>}
            {mostStale && <p className="km-heronow">{mostStale.person.name} está {mostStale.days === null ? 'sem contato registrado' : `sem contato ${sinceLabel(mostStale.days)}`}.</p>}
            {!next && !mostStale && <p className="km-heronow">Tudo em dia por aqui.</p>}
          </div>
        }
        actions={
          <>
            <Button variant="primary" icon="phone" onClick={() => komi.openContact()}>Registrar contato</Button>
            <Button icon="add" onClick={() => komi.openPerson()}>Nova pessoa</Button>
            <Button variant="ghost" icon="days" onClick={() => komi.goto('dates')}>Ver datas</Button>
          </>
        }
      />

      <div className="km-stats">
        <StatTile icon="people" label="Pessoas" value={fmtNumber(komi.visible.length)} foot={komi.prefs.space === 'all' ? 'no caderno' : komi.prefs.space === 'work' ? 'em trabalho' : 'no pessoal'} />
        <StatTile
          icon="cake"
          label="Próximo aniversário"
          value={next ? (next.inDays === 0 ? 'hoje' : fmtNumber(next.inDays)) : '—'}
          unit={next && next.inDays > 0 ? (next.inDays === 1 ? 'dia' : 'dias') : undefined}
          foot={next ? next.personName : 'nenhum cadastrado'}
        />
        <StatTile icon="phone" label="Contatos · 30 dias" value={fmtNumber(recentContacts)} unit={recentContacts === 1 ? 'pessoa' : 'pessoas'} foot="com quem você falou" />
        <StatTile icon="history" label={`Sem contato · ${komi.prefs.reconnectDays}+ dias`} value={fmtNumber(reconnect.length)} unit={reconnect.length === 1 ? 'pessoa' : 'pessoas'} foot={reconnect.length ? 'pedindo um oi' : 'todo mundo em dia'} />
      </div>

      <section aria-labelledby="km-log">
        <SectionHeader title="Registrar contato" id="km-log" mono="Enter salva · Shift+Enter abre o formulário" />
        <QuickCapture
          parser={contactParser}
          label="Registrar contato em uma linha"
          placeholder="Ex.: +Bia café ontem"
          examples={EXAMPLES}
          legend={LEGEND}
          today={komi.today}
          onSubmit={komi.quickContact}
          onExpand={(r) => { komi.quickContact(r, true) }}
        />
      </section>

      <div className="km-split">
        <section aria-labelledby="km-dates" className="km-col">
          <SectionHeader title="Próximas datas" id="km-dates" action={<Button size="sm" variant="ghost" iconRight="forward" onClick={() => komi.goto('dates')}>Ver todas</Button>} />
          {dates.length === 0
            ? <p className="ds-hint">Nenhuma data nos próximos 60 dias.</p>
            : <div className="ds-card km-list">{dates.slice(0, 6).map((d) => <DateRow key={d.key} d={d} onOpen={() => komi.goto({ view: 'people', personId: d.personId, tab: 'dates' })} />)}</div>}
        </section>

        <section aria-labelledby="km-recon" className="km-col">
          <SectionHeader title="Reconectar" id="km-recon" mono={`sem contato há ${komi.prefs.reconnectDays}+ dias`} />
          {reconnect.length === 0
            ? <p className="ds-hint">Ninguém esquecido. Bom trabalho.</p>
            : (
              <div className="ds-card km-list">
                {reconnect.slice(0, 6).map(({ person, days }) => (
                  <div key={person.id} className="km-row km-row-static">
                    <Avatar name={person.name} src={person.avatar_url} size={40} />
                    <button type="button" className="km-link km-row-main" onClick={() => komi.goto({ view: 'people', personId: person.id })}>
                      <b className="km-name">{person.name}</b>
                      <span className="km-detail">{days === null ? 'sem contato registrado' : `último contato ${sinceLabel(days)}`}</span>
                    </button>
                    <Button size="sm" icon="phone" onClick={() => komi.openContact(emptyContact(komi.today, person.id, person.context === 'both' ? (komi.prefs.space === 'work' ? 'work' : null) : null))}>Registrar</Button>
                  </div>
                ))}
              </div>
            )}
        </section>
      </div>

      {owing.length > 0 && (
        <section aria-labelledby="km-owe">
          <SectionHeader title="A acertar" id="km-owe" mono="saldo das transações vinculadas na Nami" />
          <div className="ds-card km-list">
            {owing.map((p) => (
              <button key={p.id} type="button" className="km-row" onClick={() => komi.goto({ view: 'people', personId: p.id })}>
                <Avatar name={p.name} src={p.avatar_url} size={40} />
                <span className="km-row-main"><b className="km-name">{p.name}</b><span className="km-detail">{p.finance_net > 0 ? 'te deve' : 'você deve'}</span></span>
                <span className={`ds-num ${p.finance_net > 0 ? 'km-pos' : 'km-neg'}`}>{fmtMoney(Math.abs(p.finance_net))}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {pairs.length > 0 && (
        <section aria-labelledby="km-dup">
          <SectionHeader title="Parecem a mesma pessoa" id="km-dup" mono="confira e mescle" />
          <div className="ds-card km-list">
            {pairs.slice(0, 4).map((pair) => (
              <div key={`${pair.a.id}-${pair.b.id}`} className="km-row km-row-static">
                <span className="km-row-main">
                  <b className="km-name">{pair.a.name} <span className="km-detail">e</span> {pair.b.name}</b>
                  <span className="km-detail">{pair.reasons.join(' · ')}</span>
                </span>
                <Button size="sm" icon="merge" onClick={() => setMerging(pair)}>Mesclar…</Button>
              </div>
            ))}
          </div>
        </section>
      )}
      {merging && <MergeDialog firstId={merging.a.id} secondId={merging.b.id} onClose={() => setMerging(null)} />}
    </Page>
  )
}
