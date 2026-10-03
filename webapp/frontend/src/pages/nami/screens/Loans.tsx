// Empréstimos: contratos com o banco (saldo devedor, simuladores, qual atacar primeiro) e empréstimos entre
// pessoas (quem me deve, a quem devo). Duas abas, uma tela.

import { useState } from 'react'
import { fmtPercent } from '../../../design/core/format'
import { toast } from '../../../design/headless/toast'
import { Button, EmptyState, ErrorState, IconButton, InfoRow, LoadingState, Page, ProgressBar, SectionHeader, StatusChip, Tabs } from '../../../design'
import { LOAN_TYPES, LoanForm, PersonalLoanForm, SimulatorModal } from '../components/LoanForms'
import { useNami } from '../context'
import { useLoad } from '../lib/useLoad'
import { namiApi } from '../namiApi'
import type { BankLoan, PersonalLoan } from '../types'

export function Loans() {
  const [tab, setTab] = useState('bank')
  return (
    <Page wide>
      <Tabs label="Tipo de empréstimo" value={tab} onChange={setTab} tabs={[{ id: 'bank', label: 'Com o banco' }, { id: 'people', label: 'Entre pessoas' }]} />
      {tab === 'bank' ? <BankLoans /> : <PeopleLoans />}
    </Page>
  )
}

function BankLoans() {
  const nami = useNami()
  const { state, retry } = useLoad(async () => ({ loans: (await namiApi.getLoans('ativo')).loans, priority: await namiApi.getPayoffPriority() }), [nami.rev])
  const [form, setForm] = useState<{ loan: BankLoan | null } | null>(null)
  const [sim, setSim] = useState<BankLoan | null>(null)

  if (state.status === 'loading') return <LoadingState variant="row" count={3} />
  if (state.status === 'error') return <ErrorState onRetry={retry} />
  const { loans, priority } = state.data

  const payInstallment = async (l: BankLoan) => {
    try { const r = await namiApi.payLoanInstallment(l.id); toast(r.message, { tone: 'success' }); nami.reload() }
    catch (e) { toast(e instanceof Error ? e.message : 'Não foi possível registrar a parcela.', { tone: 'error' }) }
  }

  return (
    <>
      <SectionHeader title="Contratos" mono={`${loans.length} ativos`} action={<Button variant="primary" icon="add" onClick={() => setForm({ loan: null })}>Novo empréstimo</Button>} />
      {loans.length === 0 ? (
        <EmptyState icon="loan" title="Nenhum empréstimo ou financiamento" hint="Cadastre os contratos com o banco para ver o saldo devedor e simular quitação." action={<Button variant="primary" icon="add" onClick={() => setForm({ loan: null })}>Cadastrar</Button>} />
      ) : (
        <div className="ds-list">
          {loans.map((l) => (
            <div key={l.id} className="ds-lrow nm-act nm-budget" style={{ cursor: 'default' }}>
              <span className="ds-t">
                <b>{l.name}</b>
                <span>{LOAN_TYPES[l.tipo] ?? l.tipo} · {l.sistema_amortizacao} · {fmtPercent(l.taxa_juros_mensal, 2)} ao mês · {l.parcelas_pagas} de {l.num_parcelas_total} parcelas</span>
                <ProgressBar value={l.parcelas_pagas} max={l.num_parcelas_total || 1} label={`${l.name}: ${l.parcelas_pagas} de ${l.num_parcelas_total} parcelas pagas`} />
              </span>
              <span className="nm-amt">{nami.money(l.saldo_devedor)}</span>
              <Button size="sm" onClick={() => setSim(l)}>Simular</Button>
              <Button size="sm" variant="primary" onClick={() => void payInstallment(l)}>Paguei a parcela</Button>
              <IconButton icon="edit" label={`Editar ${l.name}`} onClick={() => setForm({ loan: l })} />
            </div>
          ))}
        </div>
      )}
      {priority.priority.length > 0 && (
        <section aria-labelledby="nm-prio">
          <SectionHeader title="Qual dívida atacar primeiro" id="nm-prio" mono="maior juros primeiro" />
          <p className="nm-note">{priority.recomendacao}</p>
          <div className="ds-list">
            {priority.priority.map((p, i) => <InfoRow key={`${p.tipo}-${p.name}`} title={`${i + 1}. ${p.name}`} detail={`${p.tipo === 'cartao' ? 'Cartão' : 'Empréstimo'} · ${fmtPercent(p.taxa_juros_anual, 1)} ao ano`} value={nami.money(p.saldo_devedor)} />)}
          </div>
        </section>
      )}
      {form && <LoanForm key={form.loan?.id ?? 'novo'} loan={form.loan} onClose={() => setForm(null)} />}
      {sim && <SimulatorModal loan={sim} onClose={() => setSim(null)} />}
    </>
  )
}

function PeopleLoans() {
  const nami = useNami()
  const { state, retry } = useLoad(() => namiApi.getPersonalLoans(), [nami.rev])
  const [form, setForm] = useState<{ loan: PersonalLoan | null } | null>(null)

  if (state.status === 'loading') return <LoadingState variant="row" count={3} />
  if (state.status === 'error') return <ErrorState onRetry={retry} />
  const loans = state.data.loans

  const remaining = (l: PersonalLoan) => (l.total_amount / (l.installments || 1)) * Math.max(0, l.installments - l.paid_installments)
  const owedToMe = loans.filter((l) => l.direction === 'lent').reduce((s, l) => s + remaining(l), 0)
  const iOwe = loans.filter((l) => l.direction === 'borrowed').reduce((s, l) => s + remaining(l), 0)

  const pay = async (l: PersonalLoan) => {
    try { await namiApi.payPersonalLoanInstallment(l.id); toast(`Parcela de ${l.person_name} registrada`, { tone: 'success' }); nami.reload() }
    catch (e) { toast(e instanceof Error ? e.message : 'Não foi possível registrar.', { tone: 'error' }) }
  }

  return (
    <>
      <div className="ds-kpis">
        <div className="ds-kpi ds-card"><span className="ds-mono">Me devem</span><span className="ds-v nm-amt nm-in">{nami.money(owedToMe)}</span></div>
        <div className="ds-kpi ds-card"><span className="ds-mono">Eu devo</span><span className="ds-v nm-amt">{nami.money(iOwe)}</span></div>
      </div>
      <SectionHeader title="Empréstimos entre pessoas" action={<Button variant="primary" icon="add" onClick={() => setForm({ loan: null })}>Novo</Button>} />
      {loans.length === 0 ? (
        <EmptyState icon="people" title="Ninguém te deve, e você não deve a ninguém" hint="Registre quando emprestar ou pegar dinheiro emprestado, para não esquecer." action={<Button variant="primary" icon="add" onClick={() => setForm({ loan: null })}>Registrar</Button>} />
      ) : (
        <div className="ds-list">
          {loans.map((l) => {
            const done = l.paid_installments >= l.installments
            return (
              <div key={l.id} className="ds-lrow nm-act nm-budget" style={{ cursor: 'default' }}>
                <span className="ds-t">
                  <b>{l.person_name}</b>
                  <span>{l.installments > 1 ? `${l.paid_installments} de ${l.installments} parcelas` : 'À vista'}{l.next_due_day ? ` · dia ${l.next_due_day}` : ''}{l.note ? ` · ${l.note}` : ''}</span>
                  <ProgressBar value={l.paid_installments} max={l.installments || 1} label={`${l.person_name}: ${l.paid_installments} de ${l.installments}`} />
                </span>
                <StatusChip status={done ? 'done' : l.direction === 'lent' ? 'planned' : 'paused'} label={done ? 'Quitado' : l.direction === 'lent' ? 'Emprestei' : 'Peguei'} />
                <span className="nm-amt">{nami.money(l.total_amount)}</span>
                {!done && <Button size="sm" variant="primary" onClick={() => void pay(l)}>{l.direction === 'lent' ? 'Recebi parcela' : 'Paguei parcela'}</Button>}
                <IconButton icon="edit" label={`Editar empréstimo com ${l.person_name}`} onClick={() => setForm({ loan: l })} />
              </div>
            )
          })}
        </div>
      )}
      {form && <PersonalLoanForm key={form.loan?.id ?? 'novo'} loan={form.loan} onClose={() => setForm(null)} />}
    </>
  )
}
