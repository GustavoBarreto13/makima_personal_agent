// Recorrente: UM formulário para conta fixa, assinatura e entrada (salário). Mesmos campos, tipo diferente.

import { useState } from 'react'
import { todayISO } from '../../../design/core/format'
import { confirm } from '../../../design/headless/confirm'
import { toast } from '../../../design/headless/toast'
import { useHotkeys } from '../../../design/headless/useHotkeys'
import { Button, Field, Input, Modal, MoneyInput, NumberInput, SegmentedControl, SettingRow, Select, Toggle } from '../../../design'
import { useNami } from '../context'
import { dueDay, KIND_ONE, kindOf, nextBillingDate } from '../lib/recurring'
import { namiApi } from '../namiApi'
import type { RecurringKind, RecurringStatusItem } from '../types'

interface Draft { name: string; kind: RecurringKind; valor: number | null; day: number; ciclo: 'mensal' | 'anual'; conta: string; categoria: string; auto: boolean }
type Errors = Partial<Record<'name' | 'valor' | 'day' | 'conta', string>>

const DEFAULT_CATEGORY: Record<RecurringKind, string> = { assinatura: 'Assinaturas', conta_fixa: 'Moradia', renda: 'Receita' }

export function RecurringForm({ item, onClose }: { item: RecurringStatusItem | null; onClose: () => void }) {
  const nami = useNami()
  const today = todayISO()
  const [d, setD] = useState<Draft>(() => {
    const kind = item ? kindOf(item) : 'conta_fixa'
    return {
      name: item?.name ?? '', kind, valor: item?.valor ?? null, day: item ? dueDay(item) : Number(today.slice(8)),
      ciclo: (item?.ciclo as 'mensal' | 'anual') ?? 'mensal', conta: item?.conta ?? nami.defaultSource?.name ?? '',
      categoria: item?.categoria ?? DEFAULT_CATEGORY[kind], auto: item?.auto_lancar ?? kind === 'assinatura',
    }
  })
  const [errors, setErrors] = useState<Errors>({})
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const set = (patch: Partial<Draft>) => { setD((c) => ({ ...c, ...patch })); setDirty(true); setErrors({}) }

  // Entrada cai numa conta; despesa pode sair de conta ou cartão.
  const options = nami.sources.filter((s) => d.kind !== 'renda' || s.kind === 'account')
  const categories = nami.categories.filter((c) => (d.kind === 'renda' ? c.kind === 'in' : c.kind === 'out'))

  const changeKind = (kind: RecurringKind) => set({ kind, categoria: DEFAULT_CATEGORY[kind], auto: kind === 'assinatura', conta: kind === 'renda' && nami.sources.find((s) => s.name === d.conta)?.kind === 'card' ? '' : d.conta })

  const save = async () => {
    const e: Errors = {}
    if (!d.name.trim()) e.name = 'Dê um nome (ex.: Luz, Netflix, Salário).'
    if (d.valor === null || !(d.valor > 0)) e.valor = 'Informe o valor.'
    if (!Number.isInteger(d.day) || d.day < 1 || d.day > 31) e.day = 'Dia de 1 a 31.'
    if (!d.conta) e.conta = d.kind === 'renda' ? 'Escolha a conta que recebe.' : 'Escolha a conta ou o cartão.'
    if (Object.keys(e).length) { setErrors(e); return }
    setSaving(true)
    try {
      const body = { name: d.name.trim(), valor: d.valor as number, ciclo: d.ciclo, conta: d.conta, kind: d.kind, auto_lancar: d.auto, next_billing_day: d.day }
      if (item) {
        await namiApi.updateSubscription(item.id, { ...body, ...(d.day !== dueDay(item) ? { next_billing: nextBillingDate(d.day, today) } : {}) })
      } else {
        await namiApi.createSubscription({ ...body, categoria: d.categoria, next_billing: nextBillingDate(d.day, today) })
      }
      toast(item ? 'Recorrente atualizado' : `${KIND_ONE[d.kind]} cadastrada: ${d.name.trim()}`, { tone: 'success' })
      setDirty(false)
      nami.reload()
      onClose()
    } catch (err) {
      setErrors({ name: err instanceof Error ? err.message : 'Não foi possível salvar. Tente de novo.' })
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!item) return
    const ok = await confirm({ title: `Remover ${item.name}?`, body: 'Ele sai da lista e do plano do mês. Você poderá desfazer logo depois.', confirmLabel: 'Remover', danger: true })
    if (!ok) return
    try {
      await namiApi.deleteSubscription(item.id)
      nami.reload()
      toast(`${item.name} removido`, {
        undo: () => {
          void namiApi.createSubscription({
            name: item.name, valor: item.valor, ciclo: item.ciclo, conta: item.conta, kind: kindOf(item), categoria: item.categoria,
            auto_lancar: item.auto_lancar, next_billing: item.next_billing, next_billing_day: dueDay(item),
          }).then(nami.reload)
        },
      })
      setDirty(false)
      onClose()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Não foi possível remover.', { tone: 'error' })
    }
  }
  useHotkeys([{ keys: 'mod+enter', global: true, handler: (ev) => { ev.preventDefault(); void save() } }])

  return (
    <Modal
      title={item ? `Editar ${item.name}` : 'Novo recorrente'}
      onClose={onClose}
      dirty={dirty}
      footer={
        <>
          {item && <Button variant="ghost" icon="delete" onClick={() => void remove()} disabled={saving}>Remover</Button>}
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={() => void save()} disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</Button>
        </>
      }
    >
      <SegmentedControl
        label="Tipo"
        value={d.kind}
        onChange={changeKind}
        options={[{ value: 'conta_fixa', label: 'Conta fixa', icon: 'invoice' }, { value: 'assinatura', label: 'Assinatura', icon: 'recurring' }, { value: 'renda', label: 'Entrada', icon: 'income' }]}
      />
      <Field label="Nome" error={errors.name}>{(a) => <Input {...a} data-autofocus="" value={d.name} placeholder={d.kind === 'renda' ? 'Ex.: Salário' : d.kind === 'assinatura' ? 'Ex.: Netflix' : 'Ex.: Luz'} autoComplete="off" onChange={(e) => set({ name: e.target.value })} />}</Field>
      <div className="ds-cols2" style={{ gap: 12 }}>
        <Field label={d.kind === 'conta_fixa' ? 'Valor esperado' : 'Valor'} hint={d.kind === 'conta_fixa' ? 'Você confirma o valor real quando pagar.' : undefined} error={errors.valor}>
          {(a) => <MoneyInput {...a} value={d.valor} onChange={(valor) => set({ valor })} />}
        </Field>
        <Field label="Dia do mês" error={errors.day}>{(a) => <NumberInput {...a} min={1} max={31} value={d.day} onChange={(e) => set({ day: Number(e.target.value) })} />}</Field>
      </div>
      <div className="ds-cols2" style={{ gap: 12 }}>
        <Field label={d.kind === 'renda' ? 'Cai em' : 'Paga com'} error={errors.conta}>
          {(a) => (
            <Select {...a} value={d.conta} onChange={(e) => set({ conta: e.target.value })}>
              <option value="">Escolha…</option>
              {options.map((s) => <option key={`${s.kind}${s.id}`} value={s.name}>{s.name}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Repete">
          {(a) => <Select {...a} value={d.ciclo} onChange={(e) => set({ ciclo: e.target.value as 'mensal' | 'anual' })}><option value="mensal">Todo mês</option><option value="anual">Todo ano</option></Select>}
        </Field>
      </div>
      {!item && (
        <Field label="Categoria">
          {(a) => <Select {...a} value={d.categoria} onChange={(e) => set({ categoria: e.target.value })}>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>}
        </Field>
      )}
      <SettingRow title="Lançar sozinho no vencimento" help={d.kind === 'assinatura' ? 'Valor fixo: a Nami lança no dia, sem perguntar.' : 'Desligado: você confirma o valor quando chegar o dia.'}>
        <Toggle label="Lançar sozinho no vencimento" checked={d.auto} onChange={(auto) => set({ auto })} />
      </SettingRow>
    </Modal>
  )
}
