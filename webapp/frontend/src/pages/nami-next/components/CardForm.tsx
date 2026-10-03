// Cartão em 5 campos: nome, conta que paga a fatura, limite, dia de fechamento e dia de vencimento.

import { useState } from 'react'
import { toast } from '../../../design/headless/toast'
import { useHotkeys } from '../../../design/headless/useHotkeys'
import { Button, Field, Input, Modal, MoneyInput, NumberInput, Select } from '../../../design'
import { useNami } from '../context'
import { namiApi } from '../namiApi'
import type { Card } from '../types'

interface Draft { name: string; account: string; limite: number | null; closing: number; due: number }

const inDay = (n: number) => Number.isInteger(n) && n >= 1 && n <= 31

export function CardForm({ card, onClose, onSaved }: { card: Card | null; onClose: () => void; onSaved?: () => void }) {
  const nami = useNami()
  const accounts = nami.sources.filter((s) => s.kind === 'account')
  const [d, setD] = useState<Draft>(() => ({
    name: card?.name ?? '',
    account: accounts.find((a) => a.id === card?.account_id)?.name ?? accounts[0]?.name ?? '',
    limite: card?.limite ?? null,
    closing: card?.closing_day ?? 6,
    due: card?.due_day ?? 13,
  }))
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({})
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const set = (patch: Partial<Draft>) => { setD((c) => ({ ...c, ...patch })); setDirty(true); setErrors({}) }

  const save = async () => {
    const e: Partial<Record<keyof Draft, string>> = {}
    if (!d.name.trim()) e.name = 'Dê um nome ao cartão (ex.: Nubank).'
    if (!card && !d.account) e.account = 'Escolha a conta que paga a fatura.'
    if (d.limite === null || !(d.limite > 0)) e.limite = 'Informe o limite do cartão.'
    if (!inDay(d.closing)) e.closing = 'Dia de 1 a 31.'
    if (!inDay(d.due)) e.due = 'Dia de 1 a 31.'
    if (Object.keys(e).length) { setErrors(e); return }
    setSaving(true)
    try {
      if (card) await namiApi.updateCard(card.id, { name: d.name.trim(), limite: d.limite as number, closing_day: d.closing, due_day: d.due })
      else await namiApi.createCard({ name: d.name.trim(), account_name: d.account, limite: d.limite as number, closing_day: d.closing, due_day: d.due })
      toast(card ? 'Cartão atualizado' : `Cartão ${d.name.trim()} cadastrado`, { tone: 'success' })
      setDirty(false)
      nami.reload()
      onSaved?.()
      onClose()
    } catch (err) {
      setErrors({ name: err instanceof Error ? err.message : 'Não foi possível salvar. Tente de novo.' })
    } finally {
      setSaving(false)
    }
  }
  useHotkeys([{ keys: 'mod+enter', global: true, handler: (ev) => { ev.preventDefault(); void save() } }])

  return (
    <Modal
      size="sm"
      title={card ? 'Editar cartão' : 'Novo cartão'}
      onClose={onClose}
      dirty={dirty}
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={() => void save()} disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</Button></>}
    >
      <Field label="Nome" error={errors.name}>{(a) => <Input {...a} data-autofocus="" value={d.name} placeholder="Ex.: Nubank" autoComplete="off" onChange={(e) => set({ name: e.target.value })} />}</Field>
      {!card && (
        <Field label="Conta que paga a fatura" error={errors.account}>
          {(a) => <Select {...a} value={d.account} onChange={(e) => set({ account: e.target.value })}>{accounts.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}</Select>}
        </Field>
      )}
      <Field label="Limite" error={errors.limite}>{(a) => <MoneyInput {...a} value={d.limite} onChange={(limite) => set({ limite })} />}</Field>
      <div className="ds-cols2" style={{ gap: 12 }}>
        <Field label="Fecha no dia" error={errors.closing} hint="Compras até este dia entram na fatura do mês.">
          {(a) => <NumberInput {...a} min={1} max={31} value={d.closing} onChange={(e) => set({ closing: Number(e.target.value) })} />}
        </Field>
        <Field label="Vence no dia" error={errors.due}>
          {(a) => <NumberInput {...a} min={1} max={31} value={d.due} onChange={(e) => set({ due: Number(e.target.value) })} />}
        </Field>
      </div>
    </Modal>
  )
}
