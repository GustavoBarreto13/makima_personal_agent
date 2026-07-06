// Tela de Dashboard da seção Nami.
// Portada do handoff de referência (docs/.../nami/screens-dash.jsx).
// Layout: hero → QuickAdd → stat-row (4 cards) → grid-2 (fluxo+donut) →
//         grid-2 (contas+próximos vencimentos) → preview orçamentos → transações recentes.

import { useState, useEffect, useMemo } from 'react'
import { api } from '../../../lib/api'
import { namiApi } from '../namiApi'
import type { StatsResponse, Account, Card, Subscription, Category } from '../types'
import { QuickAdd } from '../components/QuickAdd'
import { TxList } from '../components/TxRow'
import { Icon } from '../icons'
import { DonutPanel, CashflowBars, BigMoney, Spark, greet, daysUntil, urgency, fmtMoney } from '../ui'
import { normalizeTx, buildCatMap, groupByDay } from '../lib'

interface DashboardProps {
  month: string
  stats: StatsResponse | null
  accounts: Account[]
  cards: Card[]
  subscriptions: Subscription[]
  onTransactionSaved: (msg?: string) => Promise<void>
  onToast: (msg: string) => void
  onNavigate: (view: string) => void
  onOpenAddModal: () => void
  searchQuery: string
}

/**
 * Tela de visão geral financeira do mês selecionado.
 * Exibe todos os KPIs principais, gráficos e atalhos de ação.
 */
export function Dashboard({
  month, stats, accounts, cards, subscriptions,
  onTransactionSaved, onToast, onNavigate, onOpenAddModal,
}: DashboardProps) {
  // Categorias — carregadas uma vez
  const [categories, setCategories] = useState<Category[]>([])
  // Transações recentes para o preview do dashboard
  const [recentTxs, setRecentTxs]   = useState<ReturnType<typeof normalizeTx>[]>([])
  const [deletingId, setDeletingId]  = useState<string | null>(null)
  const [loadingTxs, setLoadingTxs]  = useState(true)
  // Primeiro nome do usuário autenticado (vem do cookie de sessão via /auth/me)
  const [userName, setUserName]      = useState('')

  // Carrega categorias uma vez
  useEffect(() => {
    namiApi.getCategories()
      .then(cats => setCategories(cats))
      .catch(() => onToast('Erro ao carregar categorias'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Nome de quem está logado — nada de hardcode; falha vira saudação sem nome
  useEffect(() => {
    api.get<{ email: string; name?: string }>('/auth/me')
      .then(u => setUserName((u.name ?? '').split(' ')[0]))
      .catch(() => setUserName(''))
  }, [])

  // Carrega transações recentes para o preview (últimas 5)
  useEffect(() => {
    setLoadingTxs(true)
    namiApi.getTransactions(month)
      .then(r => {
        const normalized = (r.transactions ?? []).map(normalizeTx)
        // Ordena decrescente por data e pega as 5 mais recentes
        const sorted = normalized.sort((a, b) => b.date.localeCompare(a.date))
        setRecentTxs(sorted.slice(0, 5))
      })
      .catch(() => setRecentTxs([]))
      .finally(() => setLoadingTxs(false))
  }, [month])

  // Mapa de categorias para lookup
  const catMap = useMemo(() => buildCatMap(categories), [categories])

  // Remove uma transação do preview
  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      await namiApi.deleteTransaction(id)
      setRecentTxs(prev => prev.filter(tx => tx.id !== id))
      onToast('Transação removida')
      await onTransactionSaved()
    } catch {
      onToast('Erro ao remover')
    } finally {
      setDeletingId(null)
    }
  }

  // Extrai dados do stats (com defaults para o estado de carregamento)
  const income       = stats?.income       ?? 0
  const expense      = stats?.expense      ?? 0
  const net          = stats?.net          ?? 0
  const savingsRate  = stats?.savings_rate ?? 0
  const patrimonio   = stats?.patrimonio   ?? accounts.reduce((s, a) => s + (a.balance_inicial ?? 0), 0)
  const byCategory   = stats?.by_category  ?? []
  const cashflow     = stats?.cashflow     ?? []
  const dailySpend   = stats?.daily_spending?.map(d => d.expense) ?? []

  // Próximos vencimentos: cartões + assinaturas com next_billing_day / due_day
  const upcoming = useMemo(() => {
    const items: { name: string; amount: number; days: number; kind: string }[] = []

    // Cartões — vencimento da fatura
    cards.forEach(c => {
      if (c.due_day) {
        const d = daysUntil(c.due_day)
        if (d >= 0 && d <= 30) items.push({ name: c.name, amount: 0, days: d, kind: 'card' })
      }
    })

    // Assinaturas ativas com dia de cobrança
    subscriptions
      .filter(s => s.status === 'ativa' && s.next_billing_day)
      .forEach(s => {
        const d = daysUntil(s.next_billing_day!)
        if (d >= 0 && d <= 30) items.push({ name: s.name, amount: s.valor, days: d, kind: 'sub' })
      })

    // Ordena pelo mais próximo
    return items.sort((a, b) => a.days - b.days).slice(0, 5)
  }, [cards, subscriptions])

  // Agrupamento das transações recentes para o TxList
  const recentGroups = useMemo(() => groupByDay(recentTxs), [recentTxs])

  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <div className="hero">
        <div className="hero-copy">
          <div className="hero-eyebrow">Visão geral do mês</div>
          <div className="hero-greet">{greet()}{userName ? `, ${userName}` : ''}!</div>

          {/* Valor líquido do mês em destaque */}
          <div className="hero-net">
            <BigMoney value={net} className={net >= 0 ? 'in' : 'out'} />
          </div>
          <div className="hero-sub">
            Taxa de poupança: {(savingsRate * 100).toFixed(1)}%
            {income > 0 && ` · ${stats?.income_count ?? 0} receitas / ${stats?.expense_count ?? 0} despesas`}
          </div>

          <button className="hero-cta" onClick={onOpenAddModal}>
            <Icon name="plus" size={14} />
            Novo lançamento
          </button>
        </div>

        {/* Retrato da Nami com efeito de halo */}
        <div className="hero-portrait">
          <div className="halo">
            <img
              src="/nami-hero.png"
              alt="Nami"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          </div>
        </div>
      </div>

      {/* ── QuickAdd ─────────────────────────────────────────────────── */}
      <QuickAdd
        categories={categories}
        onSaved={async msg => { await onTransactionSaved(msg) }}
      />

      {/* ── Stat-row: 4 cards de KPI ─────────────────────────────────── */}
      <div className="stat-row">
        {/* Receitas */}
        <div className="stat-card">
          <div className="stat-label">Entrou</div>
          <div className="stat-val in">
            <span className="amount">{fmtMoney(income)}</span>
          </div>
          <div className="stat-detail">{stats?.income_count ?? 0} lançamentos</div>
        </div>

        {/* Despesas + sparkline */}
        <div className="stat-card">
          <div className="stat-label">Saiu</div>
          <div className="stat-val out">
            <span className="amount">{fmtMoney(expense)}</span>
          </div>
          {dailySpend.length > 1 && (
            <Spark data={dailySpend} color="var(--out)" />
          )}
        </div>

        {/* Saldo líquido + barra de meta */}
        <div className="stat-card">
          <div className="stat-label">Saldo do mês</div>
          <div className={`stat-val ${net >= 0 ? 'in' : 'out'}`}>
            <span className="amount">{fmtMoney(net)}</span>
          </div>
          <div className="goal-track">
            <div
              className="goal-fill"
              style={{ width: `${Math.min(savingsRate * 100, 100)}%` }}
            />
          </div>
        </div>

        {/* Patrimônio */}
        <div className="stat-card">
          <div className="stat-label">Patrimônio</div>
          <div className="stat-val">
            <span className="amount">{fmtMoney(patrimonio)}</span>
          </div>
          <div className="stat-detail">{accounts.length} conta{accounts.length !== 1 ? 's' : ''}</div>
        </div>
      </div>

      {/* ── Grid 2: fluxo de caixa + donut "Para onde foi" ───────────── */}
      <div className="grid-2">
        {/* Fluxo de caixa histórico (últimos 6 meses) */}
        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">Fluxo de caixa</span>
          </div>
          <div className="panel-body">
            {cashflow.length > 0
              ? <CashflowBars cashflow={cashflow} currentMonth={month} />
              : <div className="empty" style={{ padding: '24px 0' }}><p>Sem histórico</p></div>
            }
          </div>
        </div>

        {/* Donut: distribuição de gastos por categoria */}
        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">Para onde foi</span>
          </div>
          <div className="panel-body">
            {byCategory.length > 0
              ? <DonutPanel byCategory={byCategory} catMap={catMap} totalExpense={expense} />
              : <div className="empty" style={{ padding: '24px 0' }}><p>Sem gastos no período</p></div>
            }
          </div>
        </div>
      </div>

      {/* ── Grid 2: contas + próximos vencimentos ────────────────────── */}
      <div className="grid-2">
        {/* Contas */}
        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">Contas</span>
            <button className="panel-action" onClick={() => onNavigate('contas')}>
              Ver todas
            </button>
          </div>
          <div className="panel-body no-pad">
            {accounts.length === 0 ? (
              <div className="empty"><p>Nenhuma conta</p></div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {accounts.slice(0, 4).map(acc => (
                  <div
                    key={acc.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 16px',
                      borderBottom: '1px solid var(--line)',
                    }}
                  >
                    {/* Avatar da conta */}
                    <div style={{
                      width: 30,
                      height: 30,
                      borderRadius: 7,
                      background: acc.color ? acc.color.replace(')', ' / 0.15)') : 'var(--accent-t)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 10,
                      fontWeight: 700,
                      color: acc.color ?? 'var(--accent)',
                      fontFamily: 'var(--font-mono)',
                      overflow: 'hidden',
                      flexShrink: 0,
                    }}>
                      {acc.icon_url
                        ? <img src={acc.icon_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 7 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                        : (acc.short ?? acc.name.slice(0, 2).toUpperCase())
                      }
                    </div>
                    <span style={{ flex: 1, fontSize: 12.5, color: 'var(--ink)', fontWeight: 500 }}>{acc.name}</span>
                    <span className="amount" style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink)', fontWeight: 600 }}>
                      {fmtMoney(acc.balance_inicial ?? 0)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Próximos vencimentos */}
        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">Próximos vencimentos</span>
          </div>
          <div className="panel-body no-pad">
            {upcoming.length === 0 ? (
              <div className="empty"><p>Nenhum vencimento nos próximos 30 dias</p></div>
            ) : (
              <div className="upcoming-list">
                {upcoming.map((item, i) => {
                  const urg = urgency(item.days)
                  return (
                    <div key={i} className="upcoming-item">
                      <Icon name={item.kind === 'card' ? 'card' : 'repeat'} size={14} />
                      <span className="upcoming-name">{item.name}</span>
                      <span className={`upcoming-days ${urg}`}>
                        {item.days === 0 ? 'hoje' : `${item.days}d`}
                      </span>
                      {item.amount > 0 && (
                        <span className="upcoming-val amount">
                          {fmtMoney(item.amount)}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Transações recentes ───────────────────────────────────────── */}
      {!loadingTxs && recentTxs.length > 0 && (
        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">Transações recentes</span>
            <button className="panel-action" onClick={() => onNavigate('transacoes')}>
              Ver todas
            </button>
          </div>
          <div className="panel-body no-pad">
            <TxList
              groups={recentGroups}
              catMap={catMap}
              onDelete={handleDelete}
              deletingId={deletingId}
            />
          </div>
        </div>
      )}

      {/* ── CTA quando sem lançamentos ───────────────────────────────── */}
      {!stats && (
        <div className="loading">
          <Icon name="dashboard" size={24} />
          Carregando…
        </div>
      )}
    </>
  )
}
