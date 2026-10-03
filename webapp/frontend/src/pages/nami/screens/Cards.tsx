// Cartões, pensados como fatura: cada cartão mostra o limite usado e abre um detalhe com uma aba por fatura
// (a atual, as anteriores ainda em aberto e as próximas já comprometidas — parcelas caem na fatura certa).

import { useMemo, useState } from 'react'
import { fmtDate, MONTHS_SHORT, pluralize } from '../../../design/core/format'
import { confirm } from '../../../design/headless/confirm'
import { toast } from '../../../design/headless/toast'
import { Button, DetailPage, EmptyState, ErrorState, InfoRow, LoadingState, Page, ProgressBar, SectionHeader, StatusChip, type Status } from '../../../design'
import { CardForm } from '../components/CardForm'
import { useNami } from '../context'
import { useLoad } from '../lib/useLoad'
import { namiApi } from '../namiApi'
import type { Card, Invoice, InvoiceStatus } from '../types'

const STATUS: Record<InvoiceStatus, { status: Status; label: string }> = {
  paga: { status: 'done', label: 'Paga' },
  aberta: { status: 'planned', label: 'Aberta' },
  fechada: { status: 'paused', label: 'Fechada' },
  atrasada: { status: 'dropped', label: 'Atrasada' },
  futura: { status: 'planned', label: 'Futura' },
}

const tabLabel = (inv: Invoice) => {
  const month = MONTHS_SHORT[Number(inv.id.slice(5, 7)) - 1]
  return `${month[0].toUpperCase()}${month.slice(1)}/${inv.id.slice(2, 4)}${inv.status === 'aberta' ? ' · atual' : ''}`
}

export function Cards() {
  const nami = useNami()
  const [openId, setOpenId] = useState<string | null>(null)
  const [form, setForm] = useState<{ card: Card | null } | null>(null)
  const card = nami.cards.find((c) => c.id === openId) ?? null

  if (card) {
    return (
      <>
        <CardDetail card={card} onBack={() => setOpenId(null)} onEdit={() => setForm({ card })} />
        {form && <CardForm card={form.card} onClose={() => setForm(null)} />}
      </>
    )
  }
  return (
    <Page wide>
      <SectionHeader title="Seus cartões" action={<Button variant="primary" icon="add" onClick={() => setForm({ card: null })}>Novo cartão</Button>} />
      {nami.cards.length === 0 ? (
        <EmptyState
          icon="card"
          title="Nenhum cartão ainda"
          hint="Cadastre um cartão para ver a fatura de cada mês e saber quanto cada compra parcelada pesa."
          action={<Button variant="primary" icon="add" onClick={() => setForm({ card: null })}>Cadastrar cartão</Button>}
        />
      ) : (
        <div className="ds-grid">
          {nami.cards.map((c) => <CardTile key={c.id} card={c} onOpen={() => setOpenId(c.id)} />)}
        </div>
      )}
      {form && <CardForm card={form.card} onClose={() => setForm(null)} />}
    </Page>
  )
}

function CardTile({ card, onOpen }: { card: Card; onOpen: () => void }) {
  const { money } = useNami()
  const debt = card.divida_atual ?? 0
  return (
    <button type="button" className="ds-card nm-tile" onClick={onOpen} aria-label={`Abrir faturas do ${card.name}`}>
      <span className="ds-mono">{card.name}</span>
      <span className="ds-v nm-amt">{money(debt)}</span>
      <ProgressBar value={debt} max={card.limite || 1} label={`Limite usado do ${card.name}`} />
      <span className="ds-hint">Limite {money(card.limite)} · disponível {money(Math.max(0, card.limite - debt))}</span>
      <span className="ds-hint">Fecha dia {card.closing_day} · vence dia {card.due_day}</span>
    </button>
  )
}

function CardDetail({ card, onBack, onEdit }: { card: Card; onBack: () => void; onEdit: () => void }) {
  const nami = useNami()
  const { state, retry } = useLoad(() => namiApi.getCardInvoices(card.id, 3), [card.id, nami.rev])
  const [tab, setTab] = useState<string | null>(null)

  const invoices = state.status === 'ok' ? state.data.invoices : []
  // O que pagar primeiro: a fatura mais antiga ainda devendo (pagamento abate da mais antiga).
  const toPay = useMemo(() => invoices.find((i) => i.restante > 0 && i.status !== 'futura'), [invoices])
  const current = invoices.find((i) => i.status === 'aberta') ?? toPay ?? invoices[0]

  if (state.status === 'loading') return <Page><LoadingState variant="stat" count={3} /></Page>
  if (state.status === 'error') return <Page><ErrorState onRetry={retry} /></Page>

  const { card: info } = state.data
  const pay = () => nami.openPay({ kind: 'fatura', cardId: card.id, name: card.name, valor: toPay?.restante ?? info.divida_atual, invoice: toPay?.id })
  const remove = async () => {
    const ok = await confirm({ title: `Encerrar o cartão ${card.name}?`, body: 'Ele deixa de aparecer, mas os lançamentos antigos continuam nas contas e nos resumos.', confirmLabel: 'Encerrar', danger: true })
    if (!ok) return
    try { await namiApi.deleteCard(card.id); toast(`Cartão ${card.name} encerrado`); nami.reload(); onBack() }
    catch (e) { toast(e instanceof Error ? e.message : 'Não foi possível encerrar.', { tone: 'error' }) }
  }

  return (
    <Page wide>
      <DetailPage
        backLabel="Cartões"
        onBack={onBack}
        title={card.name}
        icon="card"
        hue={25}
        subtitle={`Limite ${nami.money(info.limite)} · disponível ${nami.money(info.limite_disponivel)} · fecha dia ${info.closing_day}, vence dia ${info.due_day}`}
        chips={current ? <StatusChip status={STATUS[current.status].status} label={`Fatura ${STATUS[current.status].label.toLowerCase()}`} /> : undefined}
        actions={
          <>
            <Button variant="primary" icon="invoice" onClick={pay} disabled={info.divida_atual <= 0}>Pagar fatura</Button>
            <Button icon="edit" onClick={onEdit}>Editar</Button>
            <Button variant="ghost" icon="delete" onClick={() => void remove()}>Encerrar</Button>
          </>
        }
        tab={tab ?? current?.id ?? ''}
        onTab={setTab}
        tabs={invoices.map((inv) => ({ id: inv.id, label: tabLabel(inv), content: <InvoiceView invoice={inv} /> }))}
      />
      {invoices.length === 0 && <EmptyState icon="invoice" title="Nenhuma fatura ainda" hint="Lance uma compra neste cartão para ver a fatura." />}
    </Page>
  )
}

function InvoiceView({ invoice }: { invoice: Invoice }) {
  const { money } = useNami()
  const st = STATUS[invoice.status]
  return (
    <>
      <div className="ds-kpis">
        <div className="ds-kpi ds-card"><span className="ds-mono">Total</span><span className="ds-v nm-amt">{money(invoice.total)}</span></div>
        <div className="ds-kpi ds-card"><span className="ds-mono">Pago</span><span className="ds-v nm-amt">{money(invoice.pago)}</span></div>
        <div className="ds-kpi ds-card"><span className="ds-mono">Falta pagar</span><span className="ds-v nm-amt">{money(invoice.restante)}</span></div>
        <div className="ds-kpi ds-card"><span className="ds-mono">Vence</span><span className="ds-v">{fmtDate(invoice.due)}</span><StatusChip status={st.status} label={st.label} /></div>
      </div>
      <p className="nm-note">
        Compras de {fmtDate(invoice.start)} a {fmtDate(invoice.closing)}. Pagamentos abatem da fatura mais antiga primeiro.
      </p>
      {invoice.items.length === 0
        ? <p className="nm-note">Sem compras nesta fatura.</p>
        : (
          <div>
            <h2 className="nm-sub">{pluralize(invoice.items.length, 'compra', 'compras')}</h2>
            <div className="ds-list">
              {invoice.items.map((it, i) => <InfoRow key={it.id ?? i} title={it.name} detail={`${fmtDate(it.data)}${it.parcelada ? ' · parcela' : ''}`} value={money(it.valor)} />)}
            </div>
          </div>
        )}
    </>
  )
}
