// Tela de Orçamentos da seção Nami.
// Portada do handoff de referência (docs/.../nami/screens-b.jsx → Orcamentos).
// Cada orçamento é um "envelope" mensal: ícone da categoria + barra de progresso.

import { useState, useEffect, useMemo } from 'react'
import { namiApi } from '../namiApi'
import type { Budget, Category } from '../types'
import { FormModal } from '../modals/FormModal'
import { ConfirmDialog } from '../modals/ConfirmDialog'
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
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null)
  const [saving, setSaving]         = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Budget | null>(null)

  // Carrega categorias uma vez (para ícone e cor nos envelopes)
  useEffect(() => {
    namiApi.getCategories()
      .then(cats => setCategories(cats))
      .catch(() => onToast('Erro ao carregar categorias'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      // Modo edição: categoria já é fixa (envelope existente) — só o limite muda.
      // `createBudget` (POST /budgets) é upsert no backend (set_budget), então
      // reenviar a mesma categoria atualiza o limite em vez de duplicar o envelope.
      const categoria = editingBudget
        ? (editingBudget.categoria ?? editingBudget.category_id)
        : (categories.find(c => c.id === String(values.catId ?? ''))?.name ?? String(values.catId ?? ''))
      await namiApi.createBudget({
        month,
        categoria,
        limite: parseFloat(String(values.limite ?? '0').replace(',', '.')),
      })
      onToast(editingBudget ? 'Orçamento atualizado ✓' : 'Orçamento criado ✓')
      setShowForm(false)
      setEditingBudget(null)
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
      setConfirmDelete(null)
    }
  }

  return (
    <>
      {/* Cabeçalho da página */}
      <div className="page-head">
        <h2>Orçamentos</h2>
        {freeCats.length > 0 && (
          <button className="btn btn-primary" onClick={() => { setEditingBudget(null); setShowForm(true) }}>
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
                      title="Editar orçamento"
                      onClick={() => { setEditingBudget(b); setShowForm(true) }}
                      aria-label="Editar orçamento"
                    >
                      <Icon name="edit" size={12} />
                    </button>
                    <button
                      className="budget-del"
                      title="Remover orçamento"
                      onClick={() => setConfirmDelete(b)}
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
                {/* Bug corrigido: antes aparecia mesmo com freeCats vazio, abrindo um
                    formulário com o seletor de categoria sem nenhuma opção. */}
                {freeCats.length > 0 && (
                  <button className="btn btn-primary" onClick={() => { setEditingBudget(null); setShowForm(true) }}>
                    <Icon name="plus" size={14} /> Criar envelope
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal de novo orçamento / edição — categoria é fixa em modo edição */}
      {showForm && (
        <FormModal
          title={editingBudget ? `Editar orçamento — ${editingBudget.categoria ?? editingBudget.category_id}` : 'Novo orçamento'}
          saving={saving}
          onClose={() => { setShowForm(false); setEditingBudget(null) }}
          onSave={handleSave}
          saveLabel={editingBudget ? 'Salvar alterações' : 'Criar orçamento'}
          initialValues={editingBudget ? { limite: String(editingBudget.limit_amount ?? 0) } : undefined}
          fields={editingBudget ? [
            { key: 'limite', label: 'Limite mensal', type: 'money', required: true },
          ] : [
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

      {/* Confirmação de exclusão */}
      {confirmDelete && (
        <ConfirmDialog
          title="Excluir orçamento"
          message={`Remover o envelope de "${confirmDelete.categoria ?? confirmDelete.category_id}"? O limite definido para este mês será apagado.`}
          busy={deletingId === confirmDelete.id}
          onConfirm={() => handleDelete(confirmDelete)}
          onClose={() => setConfirmDelete(null)}
        />
      )}
    </>
  )
}
