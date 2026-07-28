// Tela de Lista de Compras da Nami (spec 045) — mobile-first.
// Uso duplo: webapp (no mercado, pelo celular) e Telegram via Makima.
// Quick-add com Enter, checkbox grande com risco, contador X/N no carrinho,
// total estimado, itens frequentes com re-adição em 1 toque, múltiplas listas,
// "Finalizar compra" que lança a despesa e arquiva a lista (atômico).

import { useState, useEffect, useCallback, useRef } from 'react'
import { namiApi } from '../namiApi'
import type { Account, Card, ShoppingList, ShoppingListDetail, FrequentItem } from '../types'
import { FormModal } from '../modals/FormModal'
import { Icon } from '../icons'
import { fmtMoney } from '../ui'

interface ShoppingProps {
  accounts: Account[]
  cards: Card[]
  onToast: (msg: string) => void
  // Props do commonProps não usadas aqui
  month?: string; stats?: unknown; subscriptions?: unknown
  onTransactionSaved?: unknown; onNavigate?: unknown; onOpenAddModal?: unknown
}

/**
 * Tela de Lista de Compras — mobile-first (spec 045).
 *
 * A lista ativa padrão "Mercado" é criada sob demanda na primeira visita
 * (nenhuma lista ativa ainda). O contador e o total estimado recalculam a
 * partir do `detail` recarregado após cada ação — sem estado otimista, para
 * manter uma única fonte de verdade com o Telegram (SC-004).
 */
export function Shopping({ accounts, cards, onToast }: ShoppingProps) {
  const [lists, setLists]           = useState<ShoppingList[]>([])
  const [activeListId, setActiveListId] = useState<string>('')
  const [detail, setDetail]         = useState<ShoppingListDetail | null>(null)
  const [frequent, setFrequent]     = useState<FrequentItem[]>([])
  const [loading, setLoading]       = useState(true)
  const [quickAdd, setQuickAdd]     = useState('')
  const [adding, setAdding]         = useState(false)
  const [showNewList, setShowNewList] = useState(false)
  const [showFinish, setShowFinish] = useState(false)
  const [saving, setSaving]         = useState(false)
  const [busyItemId, setBusyItemId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const fonteOptions = [
    ...accounts.map(a => ({ value: `conta:${a.name}`, label: a.name })),
    ...cards.map(c => ({ value: `card:${c.id}`, label: `⬛ ${c.name}` })),
  ]

  const loadDetail = useCallback(async (listId: string) => {
    if (!listId) { setDetail(null); return }
    try {
      const d = await namiApi.getShoppingList(listId)
      setDetail(d)
    } catch {
      onToast('Erro ao carregar a lista')
    }
  }, [onToast])

  const loadFrequent = useCallback(() => {
    namiApi.getFrequentItems(8).then(r => setFrequent(r.items ?? [])).catch(() => {})
  }, [])

  const loadLists = useCallback(async () => {
    setLoading(true)
    try {
      let r = await namiApi.getShoppingLists('ativa')
      let allLists = r.lists ?? []
      // Nenhuma lista ativa ainda — cria a lista padrão "Mercado" (FR-001).
      if (allLists.length === 0) {
        await namiApi.createShoppingList('Mercado')
        r = await namiApi.getShoppingLists('ativa')
        allLists = r.lists ?? []
      }
      setLists(allLists)
      const stillActive = allLists.some(l => l.id === activeListId)
      const nextId = stillActive ? activeListId : (allLists.find(l => l.name === 'Mercado')?.id ?? allLists[0]?.id ?? '')
      setActiveListId(nextId)
      await loadDetail(nextId)
    } catch {
      onToast('Erro ao carregar listas de compras')
    } finally {
      setLoading(false)
    }
    // activeListId intencionalmente fora das deps — só usado para decidir se preserva a seleção
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadDetail, onToast])

  useEffect(() => { loadLists() }, [loadLists])
  useEffect(() => { loadFrequent() }, [loadFrequent])

  async function handleSwitchList(listId: string) {
    setActiveListId(listId)
    await loadDetail(listId)
  }

  async function handleQuickAddSubmit(e: React.FormEvent) {
    e.preventDefault()
    const text = quickAdd.trim()
    if (!text || !activeListId) return
    setAdding(true)
    try {
      await namiApi.addShoppingItems(activeListId, text)
      setQuickAdd('')
      await loadDetail(activeListId)
    } catch {
      onToast('Erro ao adicionar item')
    } finally {
      setAdding(false)
      inputRef.current?.focus()
    }
  }

  async function handleToggle(itemId: string, checked: boolean) {
    setBusyItemId(itemId)
    try {
      await namiApi.updateShoppingItem(itemId, { checked })
      await loadDetail(activeListId)
    } catch {
      onToast('Erro ao atualizar item')
    } finally {
      setBusyItemId(null)
    }
  }

  async function handleRemove(itemId: string) {
    setBusyItemId(itemId)
    try {
      await namiApi.deleteShoppingItem(itemId)
      await loadDetail(activeListId)
    } catch {
      onToast('Erro ao remover item')
    } finally {
      setBusyItemId(null)
    }
  }

  async function handleAddFrequent(name: string) {
    if (!activeListId) return
    try {
      await namiApi.addShoppingItems(activeListId, name)
      await loadDetail(activeListId)
    } catch {
      onToast('Erro ao adicionar item')
    }
  }

  async function handleCreateList(values: Record<string, unknown>) {
    setSaving(true)
    try {
      const name = String(values.name ?? '').trim()
      if (!name) throw new Error('Informe um nome para a lista')
      const r = await namiApi.createShoppingList(name)
      setShowNewList(false)
      await loadLists()
      setActiveListId(r.id)
      await loadDetail(r.id)
      onToast(`Lista "${name}" criada ✓`)
    } catch (err: unknown) {
      throw err
    } finally {
      setSaving(false)
    }
  }

  function resolveFonte(fonte: string) {
    if (!fonte) return { conta: '', card_id: '' }
    const [kind, value] = fonte.split(':')
    return kind === 'card' ? { conta: '', card_id: value } : { conta: value, card_id: '' }
  }

  async function handleFinish(values: Record<string, unknown>) {
    setSaving(true)
    try {
      const valor_total = parseFloat(String(values.valor ?? '0').replace(',', '.'))
      if (!valor_total || valor_total <= 0) throw new Error('Informe o valor total da compra')
      const { conta, card_id } = resolveFonte(String(values.fonte ?? ''))
      const r = await namiApi.finishShopping(activeListId, { valor_total, conta: conta || undefined, card_id: card_id || undefined })
      onToast(`Compra de ${fmtMoney(valor_total)} finalizada ✓`)
      setShowFinish(false)
      const listsR = await namiApi.getShoppingLists('ativa')
      setLists(listsR.lists ?? [])
      setActiveListId(r.new_list_id)
      await loadDetail(r.new_list_id)
      loadFrequent()
    } catch (err: unknown) {
      throw err
    } finally {
      setSaving(false)
    }
  }

  const items = detail?.items ?? []
  const activeList = lists.find(l => l.id === activeListId)

  if (loading) {
    return <div className="loading"><Icon name="cart" size={20} /> Carregando lista de compras…</div>
  }

  return (
    <div className="shop-screen">
      <div className="page-head">
        <h2>Lista de Compras</h2>
      </div>

      {/* Seletor de listas ativas + nova lista */}
      <div className="shop-list-switch">
        <select
          className="shop-list-select"
          value={activeListId}
          onChange={e => handleSwitchList(e.target.value)}
          aria-label="Escolher lista ativa"
        >
          {lists.map(l => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
        <button className="btn btn-ghost" onClick={() => setShowNewList(true)}>
          <Icon name="plus" size={14} /> Nova lista
        </button>
      </div>

      {/* Quick-add — Enter adiciona */}
      <form className="shop-quickadd" onSubmit={handleQuickAddSubmit}>
        <Icon name="plus" size={16} />
        <input
          ref={inputRef}
          type="text"
          value={quickAdd}
          onChange={e => setQuickAdd(e.target.value)}
          placeholder="Adicionar item (ex.: arroz, feijão 2kg, leite)…"
          disabled={adding}
        />
        <button type="submit" className="btn btn-primary" disabled={adding || !quickAdd.trim()}>
          Adicionar
        </button>
      </form>

      {/* Contador + total estimado + finalizar */}
      {detail && (
        <div className="shop-summary">
          <span className="shop-counter">
            {detail.checked_count}/{items.length} no carrinho
          </span>
          {detail.total_estimado > 0 && (
            <span className="shop-total">Estimado: {fmtMoney(detail.total_estimado)}</span>
          )}
          <span className="shop-spacer" />
          <button
            className="btn btn-primary"
            disabled={items.length === 0}
            onClick={() => setShowFinish(true)}
          >
            <Icon name="check" size={14} /> Finalizar compra
          </button>
        </div>
      )}

      {/* Lista de itens */}
      {items.length === 0 ? (
        <div className="empty">
          <Icon name="cart" size={32} />
          <p>Nenhum item em {activeList?.name ?? 'lista'}. Adicione algo acima.</p>
        </div>
      ) : (
        <div className="panel shop-items">
          {items.map(item => (
            <div key={item.id} className={`shop-item${item.checked ? ' checked' : ''}`}>
              <button
                type="button"
                className="shop-checkbox"
                role="checkbox"
                aria-checked={item.checked}
                aria-label={item.checked ? `Desmarcar ${item.name}` : `Marcar ${item.name}`}
                disabled={busyItemId === item.id}
                onClick={() => handleToggle(item.id, !item.checked)}
              >
                {item.checked && <Icon name="check" size={16} />}
              </button>
              <div className="shop-item-body">
                <span className="shop-item-name">{item.name}</span>
                {(item.quantidade || item.preco_estimado) && (
                  <span className="shop-item-meta">
                    {item.quantidade}
                    {item.quantidade && item.preco_estimado ? ' · ' : ''}
                    {item.preco_estimado ? fmtMoney(item.preco_estimado) : ''}
                  </span>
                )}
              </div>
              <button
                type="button"
                className="shop-remove"
                aria-label={`Remover ${item.name}`}
                disabled={busyItemId === item.id}
                onClick={() => handleRemove(item.id)}
              >
                <Icon name="x" size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Itens frequentes */}
      {frequent.length > 0 && (
        <div className="shop-freq">
          <div className="shop-freq-label">Frequentes</div>
          <div className="shop-freq-chips">
            {frequent.map(f => (
              <button key={f.name} className="chip" onClick={() => handleAddFrequent(f.name)}>
                <Icon name="plus" size={11} /> {f.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Modal: nova lista */}
      {showNewList && (
        <FormModal
          title="Nova lista de compras"
          saving={saving}
          onClose={() => setShowNewList(false)}
          onSave={handleCreateList}
          saveLabel="Criar lista"
          fields={[
            { key: 'name', label: 'Nome', type: 'text', required: true, placeholder: 'Ex.: Farmácia, Petshop…' },
          ]}
        />
      )}

      {/* Modal: finalizar compra */}
      {showFinish && (
        <FormModal
          title={`Finalizar compra — ${activeList?.name ?? ''}`}
          saving={saving}
          onClose={() => setShowFinish(false)}
          onSave={handleFinish}
          saveLabel="Confirmar e lançar despesa"
          fields={[
            { key: 'valor', label: 'Valor total real', type: 'money', required: true },
            { key: 'fonte', label: 'Pagar com', type: 'select', options: fonteOptions },
          ]}
        >
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            Categoria: Supermercado · Itens não marcados continuam na próxima lista.
          </div>
        </FormModal>
      )}
    </div>
  )
}
