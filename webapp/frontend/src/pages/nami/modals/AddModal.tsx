// Modal de nova transação financeira.
// Portado do handoff de referência (docs/.../nami/addmodal.jsx → AddModal).
// Abre quando o usuário clica em "Nova transação" ou pressiona A/+.

import { useState, useEffect, useRef } from 'react'
import { namiApi } from '../namiApi'
import type { Account, Card, Category } from '../types'
import { Icon, lucideToKey } from '../icons'

interface AddModalProps {
  /** Controla visibilidade */
  open: boolean
  /** Lista de contas para o seletor de fonte */
  accounts: Account[]
  /** Lista de cartões para o seletor de fonte */
  cards: Card[]
  /** Fecha sem salvar */
  onClose: () => void
  /** Chamada após salvar com sucesso */
  onSaved: (msg?: string) => Promise<void>
}

type TipoTx = 'Despesa' | 'Receita'

/**
 * Modal de criação de transação com categoria visual, campo de valor
 * em destaque e atalhos de teclado (Enter = salvar, Esc = fechar).
 * Usa as classes .modal-scrim / .modal / .type-toggle / .amt-field / .cat-grid.
 */
export function AddModal({ open, accounts, cards, onClose, onSaved }: AddModalProps) {
  const [tipo, setTipo]           = useState<TipoTx>('Despesa')
  const [name, setName]           = useState('')
  const [valor, setValor]         = useState('')
  const [catId, setCatId]         = useState('')
  const [fonte, setFonte]         = useState('')   // "conta:nome" ou "card:id"
  const [data, setData]           = useState('')
  const [notes, setNotes]         = useState('')
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [categories, setCategories] = useState<Category[]>([])

  // Foco automático no campo de valor ao abrir
  const valorRef = useRef<HTMLInputElement>(null)

  // Carrega categorias uma única vez (sem depender de reabrir o modal)
  useEffect(() => {
    if (categories.length === 0) {
      namiApi.getCategories()
        .then(cats => setCategories(cats))
        .catch(() => setCategories([]))
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Foca o valor ao abrir
  useEffect(() => {
    if (open) {
      setTimeout(() => valorRef.current?.focus(), 60)
    }
  }, [open])

  // Fecha ao pressionar Escape
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  // Filtra categorias pelo tipo (despesa = out, receita = in)
  const catsFiltered = categories.filter(c =>
    tipo === 'Despesa' ? c.kind === 'out' : c.kind === 'in'
  )

  // Resolve conta/cartão a partir do seletor de fonte
  function resolveFonte() {
    if (!fonte) return { conta: '', card_id: '' }
    const [kind, value] = fonte.split(':')
    if (kind === 'card') return { conta: '', card_id: value }
    return { conta: value, card_id: '' }
  }

  // Alterna tipo e reseta a categoria selecionada
  function changeTipo(t: TipoTx) {
    setTipo(t)
    setCatId('')   // categoria da Receita não faz sentido em Despesa e vice-versa
  }

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault()

    // Converte vírgula para ponto e valida
    const v = parseFloat(valor.replace(',', '.'))
    if (!name.trim() || !v || v <= 0) {
      setError('Descrição e valor são obrigatórios.')
      return
    }

    setSaving(true)
    setError('')

    try {
      const { conta, card_id } = resolveFonte()
      await namiApi.createTransaction({
        name: name.trim(),
        valor: v,
        tipo,
        categoria: catId || (tipo === 'Despesa' ? 'outros' : 'receita'),
        conta,
        card_id,
        data,
        notes,
      })
      // Reseta o formulário para próxima entrada rápida
      setName('')
      setValor('')
      setCatId('')
      setNotes('')
      setData('')

      await onSaved('Transação salva ✓')
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar transação.')
    } finally {
      setSaving(false)
    }
  }

  // Enter no campo de valor submete (sem precisar clicar no botão)
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    // Scrim: fundo semitransparente que fecha o modal ao clicar fora
    <div
      className="modal-scrim"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="modal">
        {/* Cabeçalho */}
        <div className="modal-head">
          <span className="modal-title">Nova transação</span>
          <button className="modal-close" onClick={onClose} aria-label="Fechar">
            <Icon name="x" size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {/* Toggle Despesa / Receita */}
            <div className="type-toggle">
              <button
                type="button"
                className={tipo === 'Despesa' ? 'active out' : ''}
                onClick={() => changeTipo('Despesa')}
              >
                ↓ Despesa
              </button>
              <button
                type="button"
                className={tipo === 'Receita' ? 'active in' : ''}
                onClick={() => changeTipo('Receita')}
              >
                ↑ Receita
              </button>
            </div>

            {/* Campo de valor em destaque */}
            <div className="amt-field">
              <span className="amt-cur">R$</span>
              <input
                ref={valorRef}
                className="amt-input"
                type="text"
                inputMode="decimal"
                value={valor}
                onChange={e => setValor(e.target.value.replace(/[^0-9.,]/g, ''))}
                onKeyDown={onKeyDown}
                placeholder="0,00"
                aria-label="Valor"
              />
            </div>

            {/* Campo de descrição */}
            <div className="field" style={{ marginBottom: 16 }}>
              <label>Descrição</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={tipo === 'Despesa' ? 'Ex.: Almoço, Uber, Netflix…' : 'Ex.: Salário, Freelance…'}
              />
            </div>

            {/* Grade de categorias — cards clicáveis com ícone + nome */}
            {catsFiltered.length > 0 && (
              <div className="cat-grid" style={{ marginBottom: 16 }}>
                {catsFiltered.map(cat => {
                  const iconKey = lucideToKey(cat.icon)
                  // Fundo translúcido com a cor da categoria
                  const iconBg = cat.color.replace(')', ' / 0.14)')
                  const isActive = catId === cat.id

                  return (
                    <button
                      key={cat.id}
                      type="button"
                      className={`cat-pick${isActive ? ' active' : ''}`}
                      onClick={() => setCatId(id => id === cat.id ? '' : cat.id)}
                    >
                      <div
                        className="cat-pick-ico"
                        style={{ background: isActive ? iconBg : 'var(--mist)', color: cat.color }}
                      >
                        <Icon name={iconKey} size={14} />
                      </div>
                      <span className="cat-pick-name">{cat.name}</span>
                    </button>
                  )
                })}
              </div>
            )}

            {/* Conta/Cartão + Data (linha dupla) */}
            <div className="row-2">
              <div className="field">
                <label>Conta / Cartão</label>
                <select value={fonte} onChange={e => setFonte(e.target.value)}>
                  <option value="">— Automático —</option>
                  {accounts.map(a => (
                    <option key={a.id} value={`conta:${a.name}`}>{a.name}</option>
                  ))}
                  {cards.map(c => (
                    <option key={c.id} value={`card:${c.id}`}>⬛ {c.name}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Data</label>
                <input
                  type="date"
                  value={data}
                  onChange={e => setData(e.target.value)}
                />
              </div>
            </div>

            {/* Notas opcionais */}
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Notas (opcional)</label>
              <input
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Observações…"
              />
            </div>

            {/* Mensagem de erro */}
            {error && (
              <div style={{ fontSize: 12, color: 'var(--out)', marginTop: 10, padding: '6px 10px', background: 'var(--out-t)', borderRadius: 'var(--rad-sm)' }}>
                {error}
              </div>
            )}
          </div>

          {/* Rodapé com dicas de teclado + botão de salvar */}
          <div className="modal-foot">
            <div className="modal-foot-hints">
              <kbd>↵</kbd> salvar
              <kbd>esc</kbd> fechar
            </div>
            <div className="modal-foot-actions">
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                Cancelar
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={saving}
                style={{ background: tipo === 'Despesa' ? 'var(--out)' : 'var(--in)' }}
              >
                {saving ? 'Salvando…' : `Lançar ${tipo}`}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
