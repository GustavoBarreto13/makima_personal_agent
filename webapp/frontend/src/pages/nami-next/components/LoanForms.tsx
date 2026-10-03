// Formulários de dívida: empréstimo/financiamento bancário (PRICE/SAC), empréstimo entre pessoas e o simulador.

import { useState } from 'react'
import { fmtPercent } from '../../../design/core/format'
import { confirm } from '../../../design/headless/confirm'
import { toast } from '../../../design/headless/toast'
import { useHotkeys } from '../../../design/headless/useHotkeys'
import { Button, Field, Input, Modal, MoneyInput, NumberInput, SegmentedControl, Select, Tabs, Textarea } from '../../../design'
import { useNami } from '../context'
import { namiApi } from '../namiApi'
import type { BankLoan, PersonalLoan } from '../types'

export const LOAN_TYPES: Record<string, string> = { veiculo: 'Veículo', consignado: 'Consignado', pessoal: 'Pessoal', imobiliario: 'Imobiliário', outro: 'Outro' }

// ── empréstimo bancário ──────────────────────────────────────────────────────

interface LoanDraft { nome: string; tipo: string; sistema: 'PRICE' | 'SAC'; original: number | null; parcela: number | null; prazo: number; pagas: number; taxa: number; conta: string }
type LoanErrors = Partial<Record<keyof LoanDraft, string>>

export function LoanForm({ loan, onClose }: { loan: BankLoan | null; onClose: () => void }) {
  const nami = useNami()
  const accounts = nami.sources.filter((s) => s.kind === 'account')
  const [d, setD] = useState<LoanDraft>(() => ({
    nome: loan?.name ?? '', tipo: loan?.tipo ?? 'pessoal', sistema: loan?.sistema_amortizacao ?? 'PRICE', original: loan?.valor_original ?? null,
    parcela: loan?.valor_parcela ?? null, prazo: loan?.num_parcelas_total ?? 12, pagas: loan?.parcelas_pagas ?? 0,
    taxa: loan ? Math.round(loan.taxa_juros_mensal * 10000) / 100 : 1.5, conta: loan?.conta ?? accounts[0]?.name ?? '',
  }))
  const [errors, setErrors] = useState<LoanErrors>({})
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const set = (patch: Partial<LoanDraft>) => { setD((c) => ({ ...c, ...patch })); setDirty(true); setErrors({}) }

  const save = async () => {
    const e: LoanErrors = {}
    if (!d.nome.trim()) e.nome = 'Dê um nome (ex.: Carro Onix).'
    if (!loan) {
      if (d.original === null || !(d.original > 0)) e.original = 'Informe o valor financiado.'
      if (d.parcela === null || !(d.parcela > 0)) e.parcela = 'Informe o valor da parcela.'
      if (!(d.prazo >= 1)) e.prazo = 'Informe o número de parcelas.'
      if (d.pagas < 0 || d.pagas > d.prazo) e.pagas = 'Entre 0 e o total de parcelas.'
      if (!d.conta) e.conta = 'Escolha a conta que paga.'
    } else if (d.pagas < 0 || d.pagas > loan.num_parcelas_total) e.pagas = 'Entre 0 e o total de parcelas.'
    if (Object.keys(e).length) { setErrors(e); return }
    setSaving(true)
    try {
      if (loan) await namiApi.updateLoan(loan.id, { name: d.nome.trim(), parcelas_pagas: d.pagas })
      else {
        await namiApi.registerLoan({
          nome: d.nome.trim(), tipo: d.tipo, sistema: d.sistema, valor_original: d.original as number, taxa_juros_mensal: d.taxa / 100,
          prazo_meses: d.prazo, parcelas_pagas: d.pagas, valor_parcela: d.parcela as number, conta: d.conta,
        })
      }
      toast(loan ? 'Empréstimo atualizado' : `${d.nome.trim()} cadastrado`, { tone: 'success' })
      setDirty(false)
      nami.reload()
      onClose()
    } catch (err) { setErrors({ nome: err instanceof Error ? err.message : 'Não foi possível salvar. Tente de novo.' }) }
    finally { setSaving(false) }
  }

  const remove = async () => {
    if (!loan) return
    const ok = await confirm({ title: `Apagar ${loan.name}?`, body: 'O contrato sai da lista. Lançamentos de parcelas já pagas continuam nas contas.', confirmLabel: 'Apagar', danger: true })
    if (!ok) return
    try { await namiApi.deleteLoan(loan.id); toast(`${loan.name} apagado`); nami.reload(); setDirty(false); onClose() }
    catch (e) { toast(e instanceof Error ? e.message : 'Não foi possível apagar.', { tone: 'error' }) }
  }
  useHotkeys([{ keys: 'mod+enter', global: true, handler: (ev) => { ev.preventDefault(); void save() } }])

  return (
    <Modal
      title={loan ? 'Editar empréstimo' : 'Novo empréstimo'}
      onClose={onClose}
      dirty={dirty}
      footer={
        <>
          {loan && <Button variant="ghost" icon="delete" onClick={() => void remove()} disabled={saving}>Apagar</Button>}
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={() => void save()} disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</Button>
        </>
      }
    >
      <Field label="Nome" error={errors.nome}>{(a) => <Input {...a} data-autofocus="" value={d.nome} placeholder="Ex.: Carro Onix" autoComplete="off" onChange={(e) => set({ nome: e.target.value })} />}</Field>
      {!loan && (
        <>
          <div className="ds-cols2" style={{ gap: 12 }}>
            <Field label="Tipo">{(a) => <Select {...a} value={d.tipo} onChange={(e) => set({ tipo: e.target.value })}>{Object.entries(LOAN_TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>}</Field>
            <Field label="Conta que paga" error={errors.conta}>{(a) => <Select {...a} value={d.conta} onChange={(e) => set({ conta: e.target.value })}>{accounts.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}</Select>}</Field>
          </div>
          <div className="ds-cols2" style={{ gap: 12 }}>
            <Field label="Valor financiado" error={errors.original}>{(a) => <MoneyInput {...a} value={d.original} onChange={(original) => set({ original })} />}</Field>
            <Field label="Valor da parcela" error={errors.parcela}>{(a) => <MoneyInput {...a} value={d.parcela} onChange={(parcela) => set({ parcela })} />}</Field>
          </div>
          <div className="ds-cols2" style={{ gap: 12 }}>
            <Field label="Parcelas no contrato" error={errors.prazo}>{(a) => <NumberInput {...a} min={1} max={480} value={d.prazo} onChange={(e) => set({ prazo: Number(e.target.value) })} />}</Field>
            <Field label="Taxa ao mês (%)" hint="Está no contrato (ex.: 1,5).">{(a) => <NumberInput {...a} min={0} step={0.01} value={d.taxa} onChange={(e) => set({ taxa: Number(e.target.value) })} />}</Field>
          </div>
        </>
      )}
      <Field label="Parcelas já pagas" error={errors.pagas}>{(a) => <NumberInput {...a} min={0} max={loan?.num_parcelas_total ?? d.prazo} value={d.pagas} onChange={(e) => set({ pagas: Number(e.target.value) })} />}</Field>
      {!loan && (
        <div className="ds-field">
          <span className="ds-lbl-f">Sistema de amortização</span>
          <SegmentedControl label="Sistema de amortização" value={d.sistema} onChange={(sistema) => set({ sistema })} options={[{ value: 'PRICE', label: 'PRICE (parcela fixa)' }, { value: 'SAC', label: 'SAC (parcela cai)' }]} />
        </div>
      )}
    </Modal>
  )
}

// ── simulador ────────────────────────────────────────────────────────────────

export function SimulatorModal({ loan, onClose }: { loan: BankLoan; onClose: () => void }) {
  const nami = useNami()
  const [tab, setTab] = useState('payoff')
  const [extra, setExtra] = useState<number | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const run = async () => {
    setBusy(true)
    try {
      const r = tab === 'payoff' ? await namiApi.simulatePayoff(loan.id)
        : tab === 'amort' ? await namiApi.simulateAmortization(loan.id, extra ?? 0)
          : await namiApi.simulateAccelerated(loan.id, extra ?? 0)
      setResult(r.message)
    } catch (e) { setResult(e instanceof Error ? e.message : 'Não foi possível simular.') }
    finally { setBusy(false) }
  }

  return (
    <Modal size="md" title={`Simular: ${loan.name}`} onClose={onClose} footer={<Button variant="primary" onClick={onClose}>Fechar</Button>}>
      <p className="nm-note">Saldo devedor {nami.money(loan.saldo_devedor)} · {loan.parcelas_restantes} parcelas restantes · taxa {fmtPercent(loan.taxa_juros_mensal, 2)} ao mês</p>
      <Tabs label="Tipo de simulação" value={tab} onChange={(t) => { setTab(t); setResult(null) }} tabs={[{ id: 'payoff', label: 'Quitar agora' }, { id: 'amort', label: 'Pagar a mais, uma vez' }, { id: 'accel', label: 'Parcela maior' }]} />
      {tab !== 'payoff' && (
        <Field label={tab === 'amort' ? 'Quanto pagaria a mais, de uma vez' : 'Quanto a mais por mês'}>{(a) => <MoneyInput {...a} value={extra} onChange={setExtra} />}</Field>
      )}
      <div><Button variant="primary" icon="stats" onClick={() => void run()} disabled={busy || (tab !== 'payoff' && !(extra && extra > 0))}>{busy ? 'Calculando…' : 'Simular'}</Button></div>
      {result && <div className="ds-card nm-result" role="status">{result}</div>}
    </Modal>
  )
}

// ── empréstimo entre pessoas ─────────────────────────────────────────────────

export function PersonalLoanForm({ loan, onClose }: { loan: PersonalLoan | null; onClose: () => void }) {
  const nami = useNami()
  const [direction, setDirection] = useState<'lent' | 'borrowed'>(loan?.direction ?? 'lent')
  const [person, setPerson] = useState(loan?.person_name ?? '')
  const [total, setTotal] = useState<number | null>(loan?.total_amount ?? null)
  const [parcelas, setParcelas] = useState(loan?.installments ?? 1)
  const [pagas, setPagas] = useState(loan?.paid_installments ?? 0)
  const [day, setDay] = useState(loan?.next_due_day ?? 5)
  const [note, setNote] = useState(loan?.note ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!person.trim()) { setError('Quem é a pessoa?'); return }
    if (total === null || !(total > 0)) { setError('Informe o valor total.'); return }
    if (pagas > parcelas) { setError('Parcelas pagas não podem passar do total.'); return }
    setSaving(true)
    try {
      if (loan) await namiApi.updatePersonalLoan(loan.id, { person_name: person.trim(), total_amount: total, installments: parcelas, paid_installments: pagas, next_due_day: day, note })
      else await namiApi.createPersonalLoan({ direction, person_name: person.trim(), total_amount: total, installments: parcelas, paid_installments: pagas, next_due_day: day, note })
      toast(loan ? 'Empréstimo atualizado' : 'Empréstimo registrado', { tone: 'success' })
      nami.reload()
      onClose()
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível salvar.') }
    finally { setSaving(false) }
  }

  const remove = async () => {
    if (!loan) return
    const ok = await confirm({ title: `Remover o empréstimo com ${loan.person_name}?`, confirmLabel: 'Remover', danger: true })
    if (!ok) return
    try { await namiApi.deletePersonalLoan(loan.id); toast('Empréstimo removido'); nami.reload(); onClose() }
    catch (e) { toast(e instanceof Error ? e.message : 'Não foi possível remover.', { tone: 'error' }) }
  }
  useHotkeys([{ keys: 'mod+enter', global: true, handler: (ev) => { ev.preventDefault(); void save() } }])

  return (
    <Modal
      size="sm"
      title={loan ? 'Editar empréstimo' : 'Novo empréstimo entre pessoas'}
      onClose={onClose}
      footer={
        <>
          {loan && <Button variant="ghost" icon="delete" onClick={() => void remove()} disabled={saving}>Remover</Button>}
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={() => void save()} disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</Button>
        </>
      }
    >
      {!loan && <SegmentedControl label="Direção" value={direction} onChange={setDirection} options={[{ value: 'lent', label: 'Emprestei' }, { value: 'borrowed', label: 'Peguei emprestado' }]} />}
      <Field label="Pessoa" error={error}>{(a) => <Input {...a} data-autofocus="" value={person} placeholder="Ex.: Ana" autoComplete="off" onChange={(e) => { setPerson(e.target.value); setError(null) }} />}</Field>
      <Field label="Valor total">{(a) => <MoneyInput {...a} value={total} onChange={setTotal} />}</Field>
      <div className="ds-cols2" style={{ gap: 12 }}>
        <Field label="Parcelas">{(a) => <NumberInput {...a} min={1} value={parcelas} onChange={(e) => setParcelas(Number(e.target.value))} />}</Field>
        <Field label="Já pagas">{(a) => <NumberInput {...a} min={0} value={pagas} onChange={(e) => setPagas(Number(e.target.value))} />}</Field>
      </div>
      <Field label="Dia do mês da parcela" hint="Sem juros: é um acordo informal.">{(a) => <NumberInput {...a} min={1} max={28} value={day} onChange={(e) => setDay(Number(e.target.value))} />}</Field>
      <Field label="Observação">{(a) => <Textarea {...a} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
    </Modal>
  )
}
