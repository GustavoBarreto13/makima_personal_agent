// Nami · Finanças — shell sobre o AppShell do Design System.
// Carrega contas, cartões e categorias uma vez, expõe as ações comuns pelo contexto (lançar, pagar,
// desfazer) e troca de tela por hash (/nami#cartoes), mantendo os atalhos antigos funcionando.

import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router-dom'
import '../../design'
import { fmtMoney, MONTHS_LONG, todayISO } from '../../design/core/format'
import { getAgent } from '../../design/core/agents'
import type { CaptureResult } from '../../design/core/capture'
import { confirm } from '../../design/headless/confirm'
import { toast } from '../../design/headless/toast'
import { usePrefs } from '../../design/headless/usePrefs'
import { AppShell, ErrorState, LoadingState, Page, SettingRow, Select, Toggle, type NavGroup } from '../../design'
import { EntryForm } from './components/EntryForm'
import { PayModal } from './components/PayModal'
import { NamiContext, type NamiCtx, type OpenEntry, type PayRequest, type ViewId } from './context'
import { applySuggestion, canSaveQuickly, draftFromCapture, emptyDraft, toSources, txToDraft, type EntryDraft, type Source } from './lib/entry'
import { VIEW_HASH, viewFromHash } from './lib/routes'
import { recreateTransaction, submitEntry, updateEntry } from './lib/submit'
import { namiApi } from './namiApi'
import { Accounts } from './screens/Accounts'
import { Budgets } from './screens/Budgets'
import { Cards } from './screens/Cards'
import { Home } from './screens/Home'
import { Installments } from './screens/Installments'
import { Loans } from './screens/Loans'
import { Recurring } from './screens/Recurring'
import { Shopping } from './screens/Shopping'
import { Summary } from './screens/Summary'
import { Transactions } from './screens/Transactions'
import type { Account, Card, Category, Transaction } from './types'
import './nami.css'

const AGENT = getAgent('nami')

const NAV: NavGroup[] = [
  {
    label: 'Dinheiro',
    items: [
      { id: 'home', label: 'Início', icon: 'home', key: 'h' },
      { id: 'transactions', label: 'Lançamentos', icon: 'list', key: 'l' },
      { id: 'cards', label: 'Cartões', icon: 'card', key: 'c' },
      { id: 'recurring', label: 'Recorrentes', icon: 'recurring', key: 'r' },
      { id: 'summary', label: 'Resumo', icon: 'stats', key: 's' },
    ],
  },
  {
    label: 'Mais',
    items: [
      { id: 'accounts', label: 'Contas', icon: 'bank' },
      { id: 'installments', label: 'Parcelamentos', icon: 'group' },
      { id: 'loans', label: 'Empréstimos', icon: 'loan' },
      { id: 'budgets', label: 'Orçamentos', icon: 'goal' },
      { id: 'shopping', label: 'Lista de compras', icon: 'cart' },
    ],
  },
]

const TITLES: Record<ViewId, string> = {
  home: 'Início', transactions: 'Lançamentos', cards: 'Cartões', recurring: 'Recorrentes', summary: 'Resumo',
  accounts: 'Contas', installments: 'Parcelamentos', loans: 'Empréstimos', budgets: 'Orçamentos', shopping: 'Lista de compras',
}

const ART_OPTIONS = [{ value: 'default', label: 'Padrão' }, { value: 'nautica', label: 'Carta náutica' }]
const keyOf = (s: Source | null) => (s ? `${s.kind}:${s.id}` : '')

export function NamiShell() {
  const navigate = useNavigate()
  const today = useMemo(() => todayISO(), [])
  const [prefs, setPrefs] = usePrefs('nami', { hide: false, lastSource: '', art: AGENT.art ?? 'nautica' })

  const [accounts, setAccounts] = useState<Account[]>([])
  const [cards, setCards] = useState<Card[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [boot, setBoot] = useState<'loading' | 'ok' | 'error'>('loading')
  const [tries, setTries] = useState(0)
  const [rev, setRev] = useState(0)
  const [view, setView] = useState<ViewId>(() => viewFromHash(window.location.hash))
  const [entry, setEntry] = useState<{ initial: EntryDraft; editing: Transaction | null } | null>(null)
  const [pay, setPay] = useState<PayRequest | null>(null)

  const reload = useCallback(() => setRev((n) => n + 1), [])

  // Contas e cartões recarregam a cada gravação (saldo e dívida mudam); categorias só uma vez.
  useEffect(() => {
    let live = true
    Promise.all([namiApi.getAccounts(), namiApi.getCards(), namiApi.getCategories()])
      .then(([a, c, cat]) => { if (!live) return; setAccounts(a.accounts); setCards(c.cards); setCategories(cat); setBoot('ok') })
      .catch(() => { if (live) setBoot((b) => (b === 'ok' ? b : 'error')) })
    return () => { live = false }
  }, [rev, tries])

  useEffect(() => {
    const onHash = () => setView(viewFromHash(window.location.hash))
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const sources = useMemo(() => toSources(accounts, cards), [accounts, cards])
  const defaultSource = useMemo<Source | null>(
    () => sources.find((s) => keyOf(s) === prefs.lastSource) ?? sources.find((s) => s.kind === 'account') ?? null,
    [sources, prefs.lastSource],
  )
  const money = useCallback((v: number) => fmtMoney(v, { mask: prefs.hide }), [prefs.hide])

  const goto = useCallback((v: ViewId) => {
    setView(v)
    window.history.replaceState(window.history.state, '', `${window.location.pathname}#${VIEW_HASH[v]}`)
  }, [])

  const openEntry = useCallback((open: OpenEntry = {}) => {
    if (open.edit) { setEntry({ initial: txToDraft(open.edit, sources), editing: open.edit }); return }
    const kind = open.kind ?? 'gasto'
    const source = kind === 'gasto' ? defaultSource : defaultSource?.kind === 'account' ? defaultSource : sources.find((s) => s.kind === 'account') ?? null
    setEntry({ initial: open.draft ?? emptyDraft(kind, source, today), editing: null })
  }, [sources, defaultSource, today])

  const save = useCallback(async (draft: EntryDraft, editing?: Transaction | null) => {
    const result = editing ? await updateEntry(editing, draft, namiApi, money) : await submitEntry(draft, namiApi, money)
    if (draft.kind === 'gasto' && draft.source) setPrefs({ lastSource: keyOf(draft.source) })
    reload()
    toast(result.message, {
      tone: 'success',
      undo: () => { result.undo().then(reload).catch(() => toast('Não foi possível desfazer. Confira em Lançamentos.', { tone: 'error' })) },
    })
  }, [money, reload, setPrefs])

  const quickCapture = useCallback((r: CaptureResult, forceForm = false): boolean => {
    const { draft, issues } = draftFromCapture(r, { sources, categories, defaultSource, today })
    if (forceForm || !canSaveQuickly(draft, issues)) {
      if (issues.place) toast(`Não achei a conta ou cartão “@${issues.place}”. Escolha no formulário.`)
      setEntry({ initial: draft, editing: null })
      return true
    }
    void (async () => {
      let d = draft
      try { d = applySuggestion(d, (await namiApi.suggestEntry(d.name)).suggestions, sources) } catch { /* sem sugestão: segue com o que foi digitado */ }
      await save(d)
    })().catch((e: unknown) => toast(e instanceof Error ? e.message : 'Não foi possível salvar.', { tone: 'error' }))
    return true
  }, [sources, categories, defaultSource, today, save])

  const remove = useCallback(async (tx: Transaction, siblings: Transaction[] = []): Promise<boolean> => {
    const isTransfer = tx.tipo === 'Transferencia'
    const ok = await confirm({
      title: isTransfer ? 'Excluir esta transferência?' : 'Excluir este lançamento?',
      body: isTransfer ? 'As duas pontas somem e os saldos voltam ao que eram. Você poderá desfazer logo depois.' : 'Ele sai das contas e dos resumos. Você poderá desfazer logo depois.',
      confirmLabel: 'Excluir',
      danger: true,
    })
    if (!ok) return false
    try {
      if (isTransfer && tx.transfer_id) {
        await namiApi.deleteTransfer(tx.transfer_id)
        const from = siblings.find((s) => s.valor < 0)
        const to = siblings.find((s) => s.valor > 0)
        toast('Transferência excluída', {
          undo: from && to
            ? () => { void namiApi.createTransfer({ from_account: from.conta, valor: Math.abs(from.valor), data: from.data, ...(to.card_id ? { to_card: to.conta } : { to_account: to.conta }) }).then(reload) }
            : undefined,
        })
      } else {
        await namiApi.deleteTransaction(tx.id)
        toast('Lançamento excluído', { undo: () => { void recreateTransaction(tx, namiApi).then(reload) } })
      }
      reload()
      return true
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível excluir.', { tone: 'error' })
      return false
    }
  }, [reload])

  const ctx = useMemo<NamiCtx>(() => ({
    accounts, cards, categories, sources, defaultSource, rev, reload, hide: prefs.hide, money, goto, openEntry,
    openPay: setPay, quickCapture, save, remove,
  }), [accounts, cards, categories, sources, defaultSource, rev, reload, prefs.hide, money, goto, openEntry, quickCapture, save, remove])

  const month = MONTHS_LONG[Number(today.slice(5, 7)) - 1]
  const SUBTITLE: Partial<Record<ViewId, string>> = {
    home: `${month} de ${today.slice(0, 4)}`, transactions: 'Tudo que entrou e saiu', cards: 'Faturas e limites', recurring: 'Todo mês', summary: 'Retrospectiva',
    accounts: 'Saldo real', installments: 'Compras parceladas', loans: 'Dívidas', budgets: 'Limites por categoria', shopping: 'Mercado e mais',
  }
  const subtitle = SUBTITLE[view] ?? 'Finanças'

  const SCREENS: Record<ViewId, () => ReactElement> = {
    home: () => <Home />, transactions: () => <Transactions />, cards: () => <Cards />, recurring: () => <Recurring />, summary: () => <Summary />,
    accounts: () => <Accounts />, installments: () => <Installments />, loans: () => <Loans />, budgets: () => <Budgets />, shopping: () => <Shopping />,
  }
  const body = boot === 'loading'
    ? <Page><LoadingState variant="stat" count={4} /></Page>
    : boot === 'error'
      ? <Page><ErrorState onRetry={() => { setBoot('loading'); setTries((n) => n + 1) }} /></Page>
      : SCREENS[view]()

  return (
    <NamiContext.Provider value={ctx}>
      <AppShell
        agent={{ id: 'nami', name: AGENT.name, subtitle: 'Finanças · Dinheiro', portrait: AGENT.portrait }}
        nav={NAV}
        active={view}
        onNavigate={(id) => goto(id as ViewId)}
        mobileTabs={['home', 'transactions', 'cards']}
        primary={{ label: 'Lançar', icon: 'add', key: 'n', onClick: () => openEntry() }}
        title={TITLES[view]}
        subtitle={subtitle}
        onGoAgent={(route) => navigate(route)}
        art={{ value: prefs.art, options: ART_OPTIONS, onChange: (art) => setPrefs({ art }) }}
        artValue={prefs.art}
        commands={[
          { id: 'nami.entry.gasto', label: 'Lançar um gasto', icon: 'expense', run: () => openEntry({ kind: 'gasto' }) },
          { id: 'nami.entry.entrada', label: 'Lançar uma entrada', icon: 'income', run: () => openEntry({ kind: 'entrada' }) },
          { id: 'nami.entry.transfer', label: 'Transferir entre contas ou pagar fatura', icon: 'transfer', keywords: 'pagar fatura cartão', run: () => openEntry({ kind: 'transferencia' }) },
        ]}
        preferences={
          <>
            <SettingRow title="Ocultar valores" help="Troca os valores por R$ ••••• nas telas (útil em público)."><Toggle label="Ocultar valores" checked={prefs.hide} onChange={(hide) => setPrefs({ hide })} /></SettingRow>
            <SettingRow title="Origem padrão" help="Conta ou cartão usado quando o lançamento não diz de onde saiu.">
              <Select aria-label="Origem padrão" value={keyOf(defaultSource)} onChange={(e) => setPrefs({ lastSource: e.target.value })}>
                {sources.map((s) => <option key={keyOf(s)} value={keyOf(s)}>{s.name}</option>)}
              </Select>
            </SettingRow>
          </>
        }
      >
        {body}
        {entry && <EntryForm key={entry.editing?.id ?? 'novo'} initial={entry.initial} editing={entry.editing} onClose={() => setEntry(null)} />}
        {pay && <PayModal req={pay} onClose={() => setPay(null)} />}
      </AppShell>
    </NamiContext.Provider>
  )
}
