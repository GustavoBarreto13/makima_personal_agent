// Tela de Dashboard da seção Nami.
// Exibe resumo financeiro do mês: entradas, saídas, saldo líquido,
// taxa de poupança e breakdown de gastos por categoria.

import type { StatsResponse, Account } from '../types'

// Props recebidas do NamiShell via commonProps + searchQuery
interface DashboardProps {
  month: string
  stats: StatsResponse | null
  accounts: Account[]
  onOpenAddModal: () => void
  searchQuery: string
  // Props extras do commonProps — não usadas aqui, aceitas como unknown para evitar conflito de tipo
  cards?: unknown
  subscriptions?: unknown
  onTransactionSaved?: unknown
  onToast?: unknown
  onNavigate?: unknown
}

/** Formata número como reais sem símbolo (usa classe .amount para privacidade). */
function fmt(v: number): string {
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(v)
}

/** Formata percentual com uma casa decimal. */
function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`
}

/** Tela de visão geral financeira do mês selecionado. */
export function Dashboard({ stats, accounts, onOpenAddModal }: DashboardProps) {
  // Se ainda não há dados, mostra estado de carregamento
  if (!stats) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--ink-3)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>⊞</div>
          <div style={{ fontSize: 14 }}>Carregando…</div>
        </div>
      </div>
    )
  }

  const income  = stats.income ?? 0
  const expense = stats.expense ?? 0
  const net     = stats.net ?? 0
  const savingsRate = stats.savings_rate ?? 0

  // Calcula patrimônio total a partir das contas (snapshot)
  const patrimonio = accounts.reduce((s, a) => s + (a.balance_inicial ?? 0), 0)

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 860 }}>

      {/* ── Cards de resumo do mês ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>

        {/* Entradas */}
        <div style={{
          background: 'var(--in-tint)',
          borderRadius: 'var(--r-md)',
          padding: '16px 18px',
          border: '1px solid var(--line)',
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--in)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
            Entrou
          </div>
          <div className="amount" style={{ fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 500, color: 'var(--in)' }}>
            R$ {fmt(income)}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 4 }}>
            {stats.income_count} lançamentos
          </div>
        </div>

        {/* Saídas */}
        <div style={{
          background: 'var(--out-tint)',
          borderRadius: 'var(--r-md)',
          padding: '16px 18px',
          border: '1px solid var(--line)',
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--out)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
            Saiu
          </div>
          <div className="amount" style={{ fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 500, color: 'var(--out)' }}>
            R$ {fmt(expense)}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 4 }}>
            {stats.expense_count} lançamentos
          </div>
        </div>

        {/* Saldo do mês */}
        <div style={{
          background: net >= 0 ? 'var(--in-tint)' : 'var(--out-tint)',
          borderRadius: 'var(--r-md)',
          padding: '16px 18px',
          border: '1px solid var(--line)',
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: net >= 0 ? 'var(--in)' : 'var(--out)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
            Saldo do mês
          </div>
          <div className="amount" style={{ fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 500, color: net >= 0 ? 'var(--in)' : 'var(--out)' }}>
            R$ {fmt(Math.abs(net))}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 4 }}>
            Taxa de poupança: {pct(savingsRate)}
          </div>
        </div>
      </div>

      {/* ── Segunda linha: Patrimônio e Gastos por categoria ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* Patrimônio total */}
        <div style={{
          background: 'var(--card)',
          borderRadius: 'var(--r-md)',
          padding: '18px',
          border: '1px solid var(--line)',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-3)', marginBottom: 12 }}>
            PATRIMÔNIO
          </div>

          {/* Patrimônio total */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--ink-4)', marginBottom: 2 }}>Total (contas)</div>
            <div className="amount" style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 600, color: 'var(--ink)' }}>
              R$ {fmt(patrimonio)}
            </div>
          </div>

          {/* Contas */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {accounts.slice(0, 4).map(acc => (
              <div key={acc.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {/* Avatar da conta (sigla ou ícone) */}
                  <div style={{
                    width: 26,
                    height: 26,
                    borderRadius: 6,
                    background: acc.color ?? 'var(--tang-tint)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 10,
                    fontWeight: 700,
                    color: 'var(--tang-deep)',
                    fontFamily: 'var(--mono)',
                  }}>
                    {acc.short ?? acc.name.slice(0, 2).toUpperCase()}
                  </div>
                  <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>{acc.name}</span>
                </div>
                <span className="amount" style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ink)' }}>
                  R$ {fmt(acc.balance_inicial ?? 0)}
                </span>
              </div>
            ))}
            {accounts.length === 0 && (
              <div style={{ fontSize: 12.5, color: 'var(--ink-4)', textAlign: 'center', padding: '8px 0' }}>
                Nenhuma conta cadastrada
              </div>
            )}
          </div>
        </div>

        {/* Gastos por categoria */}
        <div style={{
          background: 'var(--card)',
          borderRadius: 'var(--r-md)',
          padding: '18px',
          border: '1px solid var(--line)',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-3)', marginBottom: 12 }}>
            GASTOS POR CATEGORIA
          </div>

          {stats.by_category && stats.by_category.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {stats.by_category.slice(0, 6).map(cat => (
                <div key={cat.categoria}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>{cat.categoria}</span>
                    <span className="amount" style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ink)' }}>
                      R$ {fmt(cat.total)}
                    </span>
                  </div>
                  {/* Barra de progresso */}
                  <div style={{ height: 4, borderRadius: 2, background: 'var(--line)', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${Math.min(cat.pct, 100)}%`,
                      background: 'var(--tang)',
                      borderRadius: 2,
                      transition: 'width 0.4s ease',
                    }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12.5, color: 'var(--ink-4)', textAlign: 'center', padding: '16px 0' }}>
              Sem gastos neste mês
            </div>
          )}
        </div>
      </div>

      {/* ── Fluxo de caixa histórico ── */}
      {stats.cashflow && stats.cashflow.length > 0 && (
        <div style={{
          background: 'var(--card)',
          borderRadius: 'var(--r-md)',
          padding: '18px',
          border: '1px solid var(--line)',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-3)', marginBottom: 14 }}>
            HISTÓRICO (ÚLTIMOS MESES)
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', height: 80 }}>
            {stats.cashflow.slice(-6).map(entry => {
              // Encontra o máximo para escalar as barras
              const maxVal = Math.max(...stats.cashflow.map(e => Math.max(e.income, e.expense)))
              const inH = maxVal > 0 ? (entry.income / maxVal) * 100 : 0
              const outH = maxVal > 0 ? (entry.expense / maxVal) * 100 : 0
              return (
                <div key={entry.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 60 }}>
                    {/* Barra de entradas */}
                    <div style={{ width: 10, height: `${inH}%`, minHeight: 2, background: 'var(--in)', borderRadius: '2px 2px 0 0' }} />
                    {/* Barra de saídas */}
                    <div style={{ width: 10, height: `${outH}%`, minHeight: 2, background: 'var(--out)', borderRadius: '2px 2px 0 0' }} />
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--ink-4)', fontFamily: 'var(--mono)' }}>
                    {entry.month.slice(5)}
                  </div>
                </div>
              )
            })}
          </div>
          {/* Legenda */}
          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--ink-3)' }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--in)', display: 'inline-block' }} />
              Entradas
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--ink-3)' }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--out)', display: 'inline-block' }} />
              Saídas
            </div>
          </div>
        </div>
      )}

      {/* ── CTA quando não há lançamentos ── */}
      {income === 0 && expense === 0 && (
        <div style={{ textAlign: 'center', padding: '32px 0' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📊</div>
          <div style={{ fontSize: 15, color: 'var(--ink-2)', marginBottom: 12 }}>
            Nenhum lançamento este mês
          </div>
          <button
            onClick={onOpenAddModal}
            style={{
              padding: '10px 20px',
              borderRadius: 'var(--r-md)',
              border: 'none',
              background: 'var(--tang)',
              color: 'white',
              fontSize: 13.5,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'var(--sans)',
            }}
          >
            + Primeiro lançamento
          </button>
        </div>
      )}
    </div>
  )
}
