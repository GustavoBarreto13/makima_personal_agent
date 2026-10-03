// Contas: saldo REAL de cada uma (saldo inicial + o que entrou − o que saiu, com transferências), o total e o
// patrimônio líquido (contas menos a dívida dos cartões).

import { useMemo, useState } from 'react'
import { Button, EmptyState, ErrorState, ListRow, LoadingState, Page, SectionHeader } from '../../../design'
import { cx } from '../../../design/ui/primitives'
import { AccountForm, ACCOUNT_TYPES } from '../components/AccountForm'
import { useNami } from '../context'
import { useLoad } from '../lib/useLoad'
import { namiApi } from '../namiApi'
import type { Account } from '../types'

export function Accounts() {
  const nami = useNami()
  const { state, retry } = useLoad(() => namiApi.getAccountsOverview(), [nami.rev])
  const [form, setForm] = useState<{ account: Account | null } | null>(null)
  const debt = useMemo(() => nami.cards.reduce((s, c) => s + (c.divida_atual ?? 0), 0), [nami.cards])

  if (state.status === 'loading') return <Page><LoadingState variant="stat" count={3} /></Page>
  if (state.status === 'error') return <Page><ErrorState onRetry={retry} /></Page>
  const { accounts, saldo_total } = state.data

  return (
    <Page wide>
      <div className="ds-kpis">
        <div className="ds-kpi ds-card"><span className="ds-mono">Saldo nas contas</span><span className="ds-v nm-amt">{nami.money(saldo_total)}</span></div>
        <div className="ds-kpi ds-card"><span className="ds-mono">Dívida nos cartões</span><span className="ds-v nm-amt">{nami.money(debt)}</span></div>
        <div className="ds-kpi ds-card"><span className="ds-mono">Patrimônio líquido</span><span className={cx('ds-v nm-amt', saldo_total - debt < 0 && 'nm-late')}>{nami.money(saldo_total - debt)}</span></div>
      </div>
      <SectionHeader
        title="Contas"
        action={
          <>
            <Button icon="transfer" onClick={() => nami.openEntry({ kind: 'transferencia' })} disabled={accounts.length < 2}>Transferir</Button>
            <Button variant="primary" icon="add" onClick={() => setForm({ account: null })}>Nova conta</Button>
          </>
        }
      />
      {accounts.length === 0 ? (
        <EmptyState icon="bank" title="Nenhuma conta ainda" hint="Cadastre as contas onde seu dinheiro fica (corrente, poupança, carteira)." action={<Button variant="primary" icon="add" onClick={() => setForm({ account: null })}>Cadastrar conta</Button>} />
      ) : (
        <div className="ds-list">
          {accounts.map((a) => (
            <ListRow
              key={a.id}
              title={a.name}
              meta={ACCOUNT_TYPES[a.type] ?? a.type}
              icon="bank"
              hue={25}
              trailing={<span className={cx('nm-amt', a.saldo_atual < 0 && 'nm-late')}>{nami.money(a.saldo_atual)}</span>}
              onOpen={() => setForm({ account: nami.accounts.find((x) => x.id === a.id) ?? null })}
            />
          ))}
        </div>
      )}
      {form && <AccountForm key={form.account?.id ?? 'nova'} account={form.account} onClose={() => setForm(null)} />}
    </Page>
  )
}
