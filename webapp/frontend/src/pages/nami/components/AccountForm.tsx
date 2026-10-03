// Conta em 3 campos: nome, tipo e saldo inicial. (Cor, sigla e ícone do cadastro antigo saíram: eram enfeite.)

import { useState } from 'react'
import { toast } from '../../../design/headless/toast'
import { confirm } from '../../../design/headless/confirm'
import { useHotkeys } from '../../../design/headless/useHotkeys'
import { Button, Field, Input, Modal, MoneyInput, Select } from '../../../design'
import { useNami } from '../context'
import { namiApi } from '../namiApi'
import type { Account } from '../types'

export const ACCOUNT_TYPES: Record<string, string> = { corrente: 'Conta corrente', poupanca: 'Poupança', dinheiro: 'Dinheiro', investimento: 'Investimento' }

export function AccountForm({ account, onClose }: { account: Account | null; onClose: () => void }) {
  const nami = useNami()
  const [name, setName] = useState(account?.name ?? '')
  const [type, setType] = useState(account?.type ?? 'corrente')
  const [balance, setBalance] = useState<number | null>(account ? account.balance_inicial : null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  const save = async () => {
    if (!name.trim()) { setError('Dê um nome à conta (ex.: Itaú, Carteira).'); return }
    setSaving(true)
    try {
      if (account) await namiApi.updateAccount(account.id, { name: name.trim(), balance_inicial: balance ?? 0 })
      else await namiApi.createAccount({ name: name.trim(), type, balance_inicial: balance ?? 0 })
      toast(account ? 'Conta atualizada' : `Conta ${name.trim()} cadastrada`, { tone: 'success' })
      setDirty(false)
      nami.reload()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar. Tente de novo.')
    } finally {
      setSaving(false)
    }
  }

  const close = async () => {
    if (!account) return
    const ok = await confirm({ title: `Encerrar a conta ${account.name}?`, body: 'Ela deixa de aparecer nas escolhas, mas os lançamentos antigos continuam nos resumos.', confirmLabel: 'Encerrar', danger: true })
    if (!ok) return
    try { await namiApi.deleteAccount(account.id); toast(`Conta ${account.name} encerrada`); nami.reload(); setDirty(false); onClose() }
    catch (e) { toast(e instanceof Error ? e.message : 'Não foi possível encerrar.', { tone: 'error' }) }
  }
  useHotkeys([{ keys: 'mod+enter', global: true, handler: (ev) => { ev.preventDefault(); void save() } }])

  return (
    <Modal
      size="sm"
      title={account ? 'Editar conta' : 'Nova conta'}
      onClose={onClose}
      dirty={dirty}
      footer={
        <>
          {account && <Button variant="ghost" icon="delete" onClick={() => void close()} disabled={saving}>Encerrar</Button>}
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={() => void save()} disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</Button>
        </>
      }
    >
      <Field label="Nome" error={error}>{(a) => <Input {...a} data-autofocus="" value={name} placeholder="Ex.: Itaú" autoComplete="off" onChange={(e) => { setName(e.target.value); setDirty(true); setError(null) }} />}</Field>
      {!account && (
        <Field label="Tipo">
          {(a) => <Select {...a} value={type} onChange={(e) => { setType(e.target.value); setDirty(true) }}>{Object.entries(ACCOUNT_TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>}
        </Field>
      )}
      <Field label="Saldo inicial" hint="Quanto havia na conta quando você começou a usar a Nami. Os lançamentos somam e subtraem a partir daí.">
        {(a) => <MoneyInput {...a} value={balance} onChange={(v) => { setBalance(v); setDirty(true) }} />}
      </Field>
    </Modal>
  )
}
