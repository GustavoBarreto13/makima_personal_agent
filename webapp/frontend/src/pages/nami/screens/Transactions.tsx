// Lançamentos: todos os movimentos, com busca no servidor (nome e notas, em todos os meses) e filtros do
// padrão (tipo, conta/cartão, categoria, período). O período também decide a consulta: ampliar busca de novo.

import { useEffect, useMemo, useState } from 'react'
import { todayISO } from '../../../design/core/format'
import { useCollection } from '../../../design/headless/useCollection'
import { Button, CollectionBody, CollectionMeta, CollectionToolbar, EmptyState, FilterSheet, Icon, Modal, Page } from '../../../design'
import { TxRow } from '../components/TxRow'
import { useNami } from '../context'
import { makeTxSchema, windowFor } from '../lib/txSchema'
import { namiApi } from '../namiApi'
import type { Transaction } from '../types'

const PAGE = 500

export function Transactions() {
  const nami = useNami()
  const today = useMemo(() => todayISO(), [])
  const schema = useMemo(() => makeTxSchema(nami.categories, nami.sources, today), [nami.categories, nami.sources, today])
  const [items, setItems] = useState<Transaction[]>([])
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading')
  const [truncated, setTruncated] = useState(false)
  const [tries, setTries] = useState(0)
  const [filters, setFilters] = useState(false)
  const [transfer, setTransfer] = useState<Transaction | null>(null)
  const c = useCollection(schema, items, { today })

  // A busca vai ao servidor (todos os meses); sem busca, vale o período escolhido.
  const bucket = c.state.facets.date?.bucket ?? 'last30'
  const query = c.state.q.trim()
  const [debounced, setDebounced] = useState(query)
  useEffect(() => { const t = setTimeout(() => setDebounced(query), 300); return () => clearTimeout(t) }, [query])

  useEffect(() => {
    let live = true
    setStatus('loading')
    const w = windowFor(debounced.length >= 2 ? 'all' : bucket, today)
    namiApi.listTransactions({ ...w, q: debounced.length >= 2 ? debounced : undefined, limit: PAGE })
      .then((r) => { if (!live) return; setItems(r.transactions); setTruncated(!!r.has_more); setStatus('ok') })
      .catch(() => { if (live) setStatus('error') })
    return () => { live = false }
  }, [bucket, debounced, nami.rev, tries, today])

  const open = (tx: Transaction) => (tx.tipo === 'Transferencia' ? setTransfer(tx) : nami.openEntry({ edit: tx }))
  const csv = namiApi.exportTransactionsUrl(windowFor(bucket, today))
  const siblings = (tx: Transaction) => items.filter((x) => x.transfer_id && x.transfer_id === tx.transfer_id)

  return (
    <Page wide>
      <CollectionToolbar
        schema={schema}
        c={c}
        onOpenFilters={() => setFilters(true)}
        searchPlaceholder="Buscar lançamentos"
        extra={<a className="ds-btn ds-sm" href={csv} download><Icon name="download" size={14} /><span className="ds-lbl">CSV</span></a>}
      />
      <CollectionMeta c={c} noun={['lançamento', 'lançamentos']} />
      {truncated && <p className="nm-note">Mostrando os {PAGE} mais recentes. Use a busca ou um período menor para ver o resto.</p>}
      <CollectionBody
        c={c}
        view="list"
        renderCard={() => null}
        renderRow={(tx) => <TxRow key={tx.id} tx={tx} today={today} onOpen={() => open(tx)} />}
        loading={status === 'loading'}
        error={status === 'error'}
        onRetry={() => setTries((n) => n + 1)}
        emptyTitle="Nenhum lançamento com esses filtros"
        firstRun={
          <EmptyState
            icon="money"
            title="Nenhum lançamento neste período"
            hint="Lance o primeiro pelo botão abaixo, ou amplie o período nos filtros."
            action={<Button variant="primary" icon="add" onClick={() => nami.openEntry()}>Lançar</Button>}
          />
        }
      />
      {filters && <FilterSheet schema={schema} c={c} items={items} onClose={() => setFilters(false)} noun={['lançamento', 'lançamentos']} />}
      {transfer && <TransferInfo tx={transfer} siblings={siblings(transfer)} onClose={() => setTransfer(null)} />}
    </Page>
  )
}

/** Uma transferência é sempre um par: mostra de onde veio, para onde foi e apaga as duas pontas juntas. */
function TransferInfo({ tx, siblings, onClose }: { tx: Transaction; siblings: Transaction[]; onClose: () => void }) {
  const nami = useNami()
  const from = siblings.find((s) => s.valor < 0)
  const to = siblings.find((s) => s.valor > 0)
  const paying = !!to?.card_id
  return (
    <Modal
      size="sm"
      title={paying ? 'Pagamento de fatura' : 'Transferência'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Fechar</Button>
          <Button variant="danger" icon="delete" onClick={() => { void nami.remove(tx, siblings).then((deleted) => { if (deleted) onClose() }) }}>Excluir</Button>
        </>
      }
    >
      <p><b>{nami.money(Math.abs(tx.valor))}</b> em {tx.data.slice(8)}/{tx.data.slice(5, 7)}/{tx.data.slice(0, 4)}</p>
      <p className="nm-note">{from && to ? `${from.conta} → ${to.conta}` : tx.name}</p>
      <p className="ds-hint">Transferência não é gasto nem entrada: só move dinheiro. Excluir apaga as duas pontas.</p>
    </Modal>
  )
}
