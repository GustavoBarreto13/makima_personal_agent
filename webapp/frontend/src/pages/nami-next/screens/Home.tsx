// Início: responde "quanto ainda posso gastar?" em dois segundos.
//   Hero com o livre do mês → como o mês está dividido → captura rápida → a pagar → pra onde foi → últimos.

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { addDaysISO, fmtRelative, MONTHS_LONG, todayISO } from '../../../design/core/format'
import { Button, EmptyState, ErrorState, Hero, Icon, IconButton, InfoRow, LoadingState, Page, SectionHeader, StatusChip } from '../../../design'
import { cx } from '../../../design/ui/primitives'
import { EntryCapture } from '../components/EntryCapture'
import { TxRow } from '../components/TxRow'
import { useNami } from '../context'
import { categoryHue } from '../lib/categories'
import { namiApi } from '../namiApi'
import type { Plan, PlanPayable, Transaction } from '../types'

type State = { status: 'loading' } | { status: 'error' } | { status: 'ok'; plan: Plan; recent: Transaction[] }

const monthLabel = (ym: string) => `${MONTHS_LONG[Number(ym.slice(5, 7)) - 1]} de ${ym.slice(0, 4)}`

function shiftMonth(ym: string, delta: number): string {
  const idx = Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1 + delta
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`
}

export function Home() {
  const nami = useNami()
  const today = useMemo(() => todayISO(), [])
  const [month, setMonth] = useState(today.slice(0, 7))
  const [tries, setTries] = useState(0)
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    let live = true
    setState({ status: 'loading' })
    Promise.all([namiApi.getPlan(month), namiApi.listTransactions({ start: addDaysISO(today, -60), end: today, limit: 5 })])
      .then(([plan, tx]) => { if (live) setState({ status: 'ok', plan, recent: tx.transactions }) })
      .catch(() => { if (live) setState({ status: 'error' }) })
    return () => { live = false }
  }, [month, nami.rev, tries, today])

  if (nami.accounts.length === 0 && nami.cards.length === 0) {
    return (
      <Page>
        <EmptyState
          icon="bank"
          title="Comece cadastrando uma conta"
          hint="A Nami precisa saber de onde o dinheiro sai e entra. Cadastre sua primeira conta e já dá para lançar."
          action={<Button variant="primary" icon="add" onClick={() => nami.goto('accounts')}>Cadastrar conta</Button>}
        />
      </Page>
    )
  }
  if (state.status === 'loading') return <Page><LoadingState variant="stat" count={4} /></Page>
  if (state.status === 'error') return <Page><ErrorState onRetry={() => setTries((n) => n + 1)} /></Page>

  const { plan, recent } = state
  const isCurrent = plan.is_current
  const shown = nami.money
  const name = (id: string) => nami.categories.find((c) => c.id === id)?.name ?? id

  const meta = plan.estourou
    ? <span>Já passou {shown(-plan.livre)} do que entra neste mês.</span>
    : isCurrent && plan.livre_por_dia !== null
      ? <span>≈ {shown(plan.livre_por_dia)} por dia nos próximos {plan.dias_restantes} dias</span>
      : <span>{isCurrent ? 'Fim do mês.' : monthLabel(plan.month)}</span>

  const base = Math.max(plan.renda_total, plan.barra.gasto + plan.barra.a_sair)
  const segs = [
    { key: 'gasto', label: 'Já gastou', value: plan.barra.gasto, cls: 'nm-seg-gasto' },
    { key: 'asair', label: 'Ainda vai sair', value: plan.barra.a_sair, cls: 'nm-seg-asair' },
    { key: 'livre', label: 'Livre', value: plan.barra.livre, cls: 'nm-seg-livre' },
  ]

  return (
    <Page>
      <Hero
        eyebrow={`Livre pra gastar · ${MONTHS_LONG[Number(plan.month.slice(5, 7)) - 1]}`}
        eyebrowIcon="savings"
        title={<span className={cx(plan.estourou && 'nm-late')}>{plan.estourou ? '− ' : ''}{shown(Math.abs(plan.livre))}</span>}
        meta={<>{meta}{plan.saldo_contas !== null && isCurrent && <><span>·</span><span>Saldo nas contas {shown(plan.saldo_contas)}</span></>}</>}
      />

      <section aria-labelledby="nm-mes">
        <SectionHeader
          title="Como o mês está dividido"
          id="nm-mes"
          action={
            <div className="nm-month">
              <IconButton icon="left" label="Mês anterior" onClick={() => setMonth((m) => shiftMonth(m, -1))} />
              <span className="ds-mono">{monthLabel(month)}</span>
              <IconButton icon="right" label="Próximo mês" onClick={() => setMonth((m) => shiftMonth(m, 1))} />
            </div>
          }
        />
        <div className="ds-card" style={{ padding: 18 }}>
          <div className="nm-bar" role="img" aria-label={`Renda ${shown(plan.renda_total)}: ${segs.map((s) => `${s.label.toLowerCase()} ${shown(s.value)}`).join(', ')}`}>
            {base > 0 && segs.filter((s) => s.value > 0).map((s) => <span key={s.key} className={cx('nm-seg', s.cls)} style={{ flex: s.value / base }} />)}
          </div>
          <ul className="nm-legend">
            {segs.map((s) => <li key={s.key}><i className={cx('nm-sw', s.cls)} /> {s.label} <b>{shown(s.value)}</b></li>)}
          </ul>
          <p className="nm-note">
            Renda do mês: {shown(plan.renda_total)}
            {plan.renda_pendente > 0 && ` (${shown(plan.renda_recebida)} já entrou, ${shown(plan.renda_pendente)} ainda vai entrar)`}.
            Compras no cartão já contam; pagar a fatura não é gasto.
          </p>
        </div>
      </section>

      <section aria-labelledby="nm-cap">
        <SectionHeader title="Lançar" id="nm-cap" mono="Enter salva · Shift+Enter abre o formulário" />
        <EntryCapture />
      </section>

      {isCurrent && (
        <section aria-labelledby="nm-pagar">
          <SectionHeader title="A pagar" id="nm-pagar" mono="próximos 10 dias" action={<Button variant="ghost" size="sm" iconRight="right" onClick={() => nami.goto('recurring')}>Ver recorrentes</Button>} />
          {plan.a_pagar.length === 0
            ? <p className="nm-note">Nada vence nos próximos 10 dias.</p>
            : <div className="ds-list">{plan.a_pagar.map((p) => <PayRow key={`${p.kind}-${p.id}-${p.invoice ?? ''}`} item={p} today={today} />)}</div>}
        </section>
      )}

      <div className="ds-cols2">
        <section aria-labelledby="nm-onde">
          <SectionHeader title="Pra onde foi" id="nm-onde" mono={monthLabel(month)} />
          {plan.top_categorias.length === 0
            ? <p className="nm-note">Nenhum gasto neste mês até agora.</p>
            : <div className="ds-list">{plan.top_categorias.map((c) => <InfoRow key={c.categoria} title={name(c.categoria)} detail={`${Math.round(c.pct)}% do gasto`} value={shown(c.total)} />)}</div>}
        </section>
        <section aria-labelledby="nm-ult">
          <SectionHeader title="Últimos lançamentos" id="nm-ult" action={<Button variant="ghost" size="sm" iconRight="right" onClick={() => nami.goto('transactions')}>Ver todos</Button>} />
          {recent.length === 0
            ? <p className="nm-note">Ainda não há lançamentos. Experimente a linha acima: “45 ifood @{nami.sources[0]?.name.toLowerCase().replace(/\s+/g, '-') ?? 'conta'}”.</p>
            : <div className="ds-list">{recent.map((tx) => <TxRow key={tx.id} tx={tx} today={today} onOpen={() => (tx.tipo === 'Transferencia' ? nami.goto('transactions') : nami.openEntry({ edit: tx }))} />)}</div>}
        </section>
      </div>
    </Page>
  )
}

function PayRow({ item, today }: { item: PlanPayable; today: string }) {
  const nami = useNami()
  const late = item.status === 'atrasada'
  const open = () => nami.openPay(item.kind === 'fatura'
    ? { kind: 'fatura', cardId: item.id, name: item.name.replace(/^Fatura /, ''), valor: item.valor, invoice: item.invoice }
    : { kind: item.kind, id: item.id, name: item.name, valor: item.valor })
  const icon = item.kind === 'fatura' ? 'card' : item.kind === 'assinatura' ? 'recurring' : 'invoice'
  return (
    <div className="ds-lrow nm-act" style={{ '--ds-ch': categoryHue(item.kind) } as CSSProperties}>
      <span className="ds-lead"><Icon name={icon} size={18} /></span>
      <span className="ds-t"><b>{item.name}</b><span>vence {fmtRelative(item.due, today)}</span></span>
      <StatusChip status={late ? 'dropped' : 'planned'} label={late ? 'Atrasada' : 'Pendente'} />
      <span className={cx('nm-amt', late && 'nm-late')}>{nami.money(item.valor)}</span>
      <Button size="sm" variant="primary" onClick={open}>{item.kind === 'fatura' ? 'Pagar' : 'Paguei'}</Button>
    </div>
  )
}
