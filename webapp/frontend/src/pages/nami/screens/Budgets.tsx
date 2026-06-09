// Tela de Orçamentos da seção Nami.
// Portada do handoff de referência (docs/.../nami/screens-b.jsx → Orcamentos).
// Cada orçamento é um "envelope" mensal: ícone da categoria + barra de progresso.

import { useState, useEffect, useMemo } from 'react'
import { namiApi } from '../namiApi'
import type { Budget, Category } from '../types'
import { FormModal } from '../modals/FormModal'
import { Icon, lucideToKey } from '../icons'
import { fmtMoney } from '../ui'

interface BudgetsProps {
  month: string
  onToast: (msg: string) => void
  // Props do commonProps não usadas aqui
  stats?: unknown; accounts?: unknown; cards?: unknown; subscriptions?: unknown
  onTransactionSaved?: unknown; onNavigate?: unknown; onOpenAddModal?: unknown
}

export function Budgets({ month, onToast }: BudgetsProps) {
  const [budgets, setBudgets]       = useState<Budget[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading]       = useState(true)
  const [showForm, setShowForm]     = useState(false)
  const [saving, setSaving]         = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Carrega categorias uma vez (para ícone e cor nos envelopes)
  useEffect(() => {
    namiApi.getCategories()
      .then(cats => setCategories(cats))
      .catch(() => {})
  }, [])

  // Recarrega orçamentos quando o mês muda
  useEffect(() => {
    setLoading(true)
    namiApi.getBudgets(month)
      .then(r => setBudgets(r.budgets ?? []))
      .catch(() => setBudgets([]))
      .finally(() => setLoading(false))
  }, [month])

  // Mapa de categorias por nome, id e slug lowercase — para lookup nos envelopes
  const catByKey = useMemo(() => {
    const m: Record<string, Category> = {}
    categories.forEach(c => {
      m[c.id] = c
      m[c.name] = c
      m[c.name.toLowerCase()] = c
    })
    return m
  }, [categories])

  // Categorias de despesa que ainda não têm orçamento (opções do formulário)
  const freeCats = useMemo(() => {
    const usados = new Set(budgets.flatMap(b => [b.categoria, b.category_id].filter(Boolean) as string[]))
    return categories.filter(c => c.kind === 'out' && !usados.has(c.id) && !usados.has(c.name))
  }, [categories, budgets])

  // Totais para o painel de resumo
  const totalLimit = budgets.reduce((a, b) => a + (b.limit_amount ?? 0), 0)
  const totalSpent = budgets.reduce((a, b) => a + (b.spent ?? 0), 0)
  const totalPct   = totalLimit > 0 ? Math.min(100, Math.round(totalSpent / totalLimit * 100)) : 0

  async function handleSave(values: Record<string, unknown>) {
    setSaving(true)
    try {
      // Resolve o nome da categoria pelo ID selecionado no select
      const selectedCat = categories.find(c => c.id === String(values.catId ?? ''))
      await namiApi.createBudget({
        month,
        categoria: selectedCat?.name ?? String(values.catId ?? ''),
        limite: parseFloat(String(values.limite ?? '0').replace(',', '.')),
      })
      onToast('Orçamento criado ✓')
      setShowForm(false)
      const r = await namiApi.getBudgets(month)
      setBudgets(r.budgets ?? [])
    } catch (err: unknown) {
      throw err
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(b: Budget) {
    setDeletingId(b.id)
    try {
      const monthStr = b.month ? b.month.slice(0, 7) : month
      await namiApi.deleteBudget(monthStr, b.categoria ?? b.category_id)
      setBudgets(prev => prev.filter(x => x.id !== b.id))
      onToast('Orçamento removido')
    } catch {
      onToast('Erro ao remover orçamento')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <>
      {/* Cabeçalho da página */}
      <div className="page-head">
        <h2>Orçamentos</h2>
        {freeCats.length > 0 && (
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            <Icon name="plus" size={14} /> Novo orçamento
          </button>
        )}
      </div>

      {/* Painel de resumo total gasto vs orçado no mês */}
      {!loading && budgets.length > 0 && (
        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">Gasto / orçado no mês</span>
          </div>
          <div className="panel-body">
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1 }}>
                  <span className="amount" style={{ color: totalSpent > totalLimit ? 'var(--out)' : 'var(--ink)' }}>
                    {fmtMoney(totalSpent)}
                  </span>
                  <span style={{ fontSize: 16, color: 'var(--muted)', fontWeight: 600 }}>
                    {' '}/ <span className="amount">{fmtMoney(totalLimit)}</span>
                  </span>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: totalPct >= 100 ? 'var(--out)' : 'var(--accent)' }}>
                  {totalPct}%
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }} className="amount">
                  restam {fmtMoney(Math.max(0, totalLimit - totalSpent))}
                </div>
              </div>
            </div>
            {/* Barra de progresso geral */}
            <div style={{ height: 8, borderRadius: 4, background: 'var(--line)', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: totalPct + '%',
                borderRadius: 4,
                background: totalPct >= 100 ? 'var(--out)' : 'linear-gradient(90deg, var(--accent), var(--gold))',
                transition: 'width 0.4s ease',
              }} />
            </div>
          </div>
        </div>
      )}

      {/* Lista de envelopes */}
      {loading ? (
        <div className="loading">
          <Icon name="target" size={20} /> Carregando orçamentos…
        </div>
      ) : (
        <div className="panel">
          <div className="budget-list">
            {budgets.map(b => {
              const spent    = b.spent ?? 0
              const limit    = b.limit_amount ?? 0
              const pct      = limit > 0 ? Math.min(100, Math.round(spent / limit * 100)) : 0
              const over     = spent > limit
              const catKey   = b.categoria ?? b.category_id ?? ''
              // Lookup da categoria pelo nome, id ou slug para obter ícone e cor
              const cat      = catByKey[catKey] ?? catByKey[catKey.toLowerCase()]
              const iconKey  = cat ? lucideToKey(cat.icon) : 'tag'
              const catColor = cat?.color ?? 'var(--accent)'

              // Cor da barra: vermelho se estourou, âmbar se acima de 85%, acento se normal
              const barColor = over ? 'var(--out)' : (pct > 85 ? 'var(--gold)' : catColor)

              return (
                <div key={b.id} className="budget-row">
                  {/* Ícone da categoria com fundo translúcido na cor da categoria */}
                  <div className="budget-ico" style={{
                    background: catColor.replace(')', ' / 0.14)'),
                    color: catColor,
                  }}>
                    <Icon name={iconKey} size={14} />
                  </div>

                  {/* Corpo: nome + barra de progresso */}
                  <div className="budget-body">
                    <div className="budget-name">{b.categoria ?? b.category_id}</div>
                    <div className="budget-bar">
                      <div
                        className={`budget-fill${over ? ' over' : ''}`}
                        style={{ width: pct + '%', background: barColor }}
                      />
                    </div>
                  </div>

                  {/* Lado direito: valores + botão remover */}
                  <div className="budget-right">
                    <div className="budget-vals">
                      <div className="budget-spent amount" style={{ color: over ? 'var(--out)' : undefined }}>
                        {fmtMoney(spent)}
                      </div>
                      <div className="budget-limit amount">/ {fmtMoney(limit)}</div>
                    </div>
                    <button
                      className="budget-del"
                      title="Remover orçamento"
                      onClick={() => handleDelete(b)}
                      disabled={deletingId === b.id}
                      aria-label="Remover orçamento"
                    >
                      <Icon name="trash" size={12} />
                    </button>
                  </div>
                </div>
              )
            })}

            {/* Estado vazio */}
            {budgets.length === 0 && (
              <div className="empty">
                <Icon name="target" size={32} />
                <p>Nenhum orçamento definido para este mês</p>
                <button className="btn btn-primary" onClick={() => setShowForm(true)}>
                  <Icon name="plus" size={14} /> Criar envelope
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal de novo orçamento — categorias de despesa sem envelope ainda */}
      {showForm && (
        <FormModal
          title="Novo orçamento"
          saving={saving}
          onClose={() => setShowForm(false)}
          onSave={handleSave}
          saveLabel="Criar orçamento"
          fields={[
            {
              key: 'catId',
              label: 'Categoria',
              type: 'select',
              options: freeCats.map(c => ({ value: c.id, label: c.name })),
            },
            { key: 'limite', label: 'Limite mensal', type: 'money', required: true },
          ]}
        />
      )}
    </>
  )
}
