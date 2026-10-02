// "Paguei": confirma uma conta fixa/assinatura com o valor REAL, ou paga a fatura de um cartão.
// Os dois abrem o mesmo modal, com o valor já preenchido, a data de hoje e a conta que paga.

import { useMemo, useState } from 'react'
import { todayISO } from '../../../design/core/format'
import { toast } from '../../../design/headless/toast'
import { useHotkeys } from '../../../design/headless/useHotkeys'
import { Button, DatePicker, Field, Modal, MoneyInput, Select } from '../../../design'
import { useNami, type PayRequest } from '../context'
import { namiApi } from '../namiApi'

export function PayModal({ req, onClose }: { req: PayRequest; onClose: () => void }) {
  const nami = useNami()
  const accounts = nami.sources.filter((s) => s.kind === 'account')
  const isInvoice = req.kind === 'fatura'

  // Fatura: a conta vinculada ao cartão. Conta fixa/assinatura: vazio = a conta já cadastrada nela.
  const linked = useMemo(() => {
    if (req.kind !== 'fatura') return ''
    const card = nami.cards.find((c) => c.id === req.cardId)
    return accounts.find((a) => a.id === card?.account_id)?.name ?? ''
  }, [req, nami.cards, accounts])

  const [valor, setValor] = useState<number | null>(req.valor)
  const [date, setDate] = useState(todayISO())
  const [from, setFrom] = useState(linked)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    try { await action(); nami.reload(); onClose() }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível concluir. Tente de novo.') }
    finally { setBusy(false) }
  }

  const confirmPay = () => {
    if (valor === null || !(valor > 0)) { setError('Informe o valor pago.'); return }
    void run(async () => {
      if (req.kind === 'fatura') {
        const r = await namiApi.payCardBill(req.cardId, valor, { data: date, fromAccount: from || undefined })
        toast(`Fatura do ${req.name}: ${nami.money(valor)} paga`, { tone: 'success', undo: () => { void namiApi.deleteTransfer(r.transfer_id).then(nami.reload) } })
      } else {
        await namiApi.paySubscription(req.id, { valor, data: date, conta: from || undefined })
        toast(`${req.name}: ${nami.money(valor)} lançado`, { tone: 'success' })
      }
    })
  }
  const skip = () => {
    if (req.kind === 'fatura') return
    void run(async () => { await namiApi.skipSubscriptionCycle(req.id); toast(`${req.name}: este mês foi pulado`) })
  }
  useHotkeys([{ keys: 'mod+enter', global: true, handler: (e) => { e.preventDefault(); confirmPay() } }])

  return (
    <Modal
      size="sm"
      title={isInvoice ? `Pagar fatura do ${req.name}` : `Confirmar ${req.name}`}
      onClose={onClose}
      footer={
        <>
          {!isInvoice && <Button variant="ghost" onClick={skip} disabled={busy}>Pular este mês</Button>}
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={confirmPay} disabled={busy}>{busy ? 'Salvando…' : isInvoice ? 'Pagar' : 'Confirmar'}</Button>
        </>
      }
    >
      <Field label={isInvoice ? 'Valor pago' : 'Valor real'} hint={isInvoice ? 'Pode ser a fatura toda ou só uma parte.' : 'Pode ser diferente do esperado (conta de luz, por exemplo).'} error={error}>
        {(a) => <MoneyInput {...a} value={valor} onChange={(v) => { setValor(v); setError(null) }} />}
      </Field>
      <Field label="Data">{(a) => <DatePicker {...a} value={date} onChange={setDate} />}</Field>
      <Field label="Pago com" hint={isInvoice ? 'Sai desta conta e abate a dívida do cartão.' : undefined}>
        {(a) => (
          <Select {...a} value={from} onChange={(e) => setFrom(e.target.value)}>
            {!isInvoice && <option value="">A conta cadastrada nele</option>}
            {accounts.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
          </Select>
        )}
      </Field>
    </Modal>
  )
}
