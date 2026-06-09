// Barra de lançamento rápido de transação — aparece no topo do Dashboard e de Transactions.
// Portada do handoff de referência (docs/.../nami/addmodal.jsx → QuickAdd).
// Permite criar despesa ou receita sem abrir o modal completo.

import { useState, useRef, useEffect } from 'react'
import { namiApi } from '../namiApi'
import type { Category } from '../types'
import { Icon, lucideToKey } from '../icons'

interface QuickAddProps {
  /** Categorias carregadas da API (usadas para os chips de categoria rápida) */
  categories: Category[]
  /** Chamado com mensagem de sucesso após salvar */
  onSaved: (msg?: string) => void
}

/**
 * Barra de entrada rápida de transações sem abrir o modal.
 * Usa as classes .quick-add / .qa-type / .qa-amt / .qa-cats / .qa-save.
 *
 * Args:
 *   categories: lista de categorias da API (com icon, color, kind).
 *   onSaved: callback disparado após salvar com sucesso.
 */
export function QuickAdd({ categories, onSaved }: QuickAddProps) {
  // Tipo da transação: "out" (despesa, padrão) ou "in" (receita)
  const [type, setType]           = useState<'out' | 'in'>('out')
  const [valor, setValor]         = useState('')
  const [nome, setNome]           = useState('')
  const [catId, setCatId]         = useState('')
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')

  // Ref para retornar o foco ao campo de valor após salvar
  const valorRef = useRef<HTMLInputElement>(null)

  // Filtra categorias pelo tipo selecionado (in/out)
  // Pega as 6 primeiras para não poluir a barra
  const catChips = categories
    .filter(c => c.kind === type)
    .slice(0, 6)

  // Limpa a categoria quando o tipo muda (evita categoria "out" quando tipo é "in")
  useEffect(() => { setCatId('') }, [type])

  /** Salva a transação na API */
  async function handleSave() {
    // Valida o valor: substitui vírgula por ponto e verifica se é número positivo
    const v = parseFloat(valor.replace(',', '.'))
    if (!v || v <= 0) {
      setError('Informe um valor válido')
      return
    }

    setSaving(true)
    setError('')

    try {
      // Categoria padrão se nenhuma foi selecionada
      const categoriaDefault = type === 'out' ? 'outros' : 'receita'

      await namiApi.createTransaction({
        name:      nome.trim() || (catId ? catId : (type === 'out' ? 'Despesa' : 'Receita')),
        valor:     v,
        tipo:      type === 'out' ? 'Despesa' : 'Receita',
        categoria: catId || categoriaDefault,
      })

      // Limpa e retorna foco ao campo de valor
      setValor('')
      setNome('')
      setCatId('')
      valorRef.current?.focus()
      onSaved(type === 'out' ? 'Despesa lançada ✓' : 'Receita lançada ✓')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  /** Enter em qualquer campo dispara o save */
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); handleSave() }
  }

  return (
    <div className="quick-add">
      {/* Toggle Despesa / Receita */}
      <div className="qa-type">
        <button
          type="button"
          className={type === 'out' ? 'active out' : ''}
          onClick={() => setType('out')}
        >
          ↓ Saiu
        </button>
        <button
          type="button"
          className={type === 'in' ? 'active in' : ''}
          onClick={() => setType('in')}
        >
          ↑ Entrou
        </button>
      </div>

      {/* Prefixo R$ */}
      <span className="qa-cur">R$</span>

      {/* Campo de valor */}
      <input
        ref={valorRef}
        className="qa-amt"
        type="text"
        inputMode="decimal"
        value={valor}
        onChange={e => setValor(e.target.value.replace(/[^0-9.,]/g, ''))}
        onKeyDown={onKeyDown}
        placeholder="0,00"
        aria-label="Valor"
      />

      {/* Divisor visual */}
      <div className="qa-sep" />

      {/* Campo de descrição */}
      <input
        className="qa-desc"
        type="text"
        value={nome}
        onChange={e => setNome(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Descrição (opcional)"
        aria-label="Descrição"
      />

      {/* Chips de categoria — mostram ícone + nome da categoria */}
      {catChips.length > 0 && (
        <div className="qa-cats">
          {catChips.map(cat => (
            <button
              key={cat.id}
              type="button"
              className={`qa-cat${catId === cat.id ? ' active' : ''}`}
              onClick={() => setCatId(id => id === cat.id ? '' : cat.id)}
              title={cat.name}
            >
              <Icon name={lucideToKey(cat.icon)} size={11} />
              {cat.name}
            </button>
          ))}
        </div>
      )}

      {/* Mensagem de erro inline */}
      {error && (
        <span style={{ fontSize: 11, color: 'var(--out)' }}>{error}</span>
      )}

      {/* Botão Lançar */}
      <button
        type="button"
        className="qa-save"
        onClick={handleSave}
        disabled={saving || !valor}
      >
        <Icon name="check" size={13} />
        {saving ? '…' : 'Lançar'}
      </button>
    </div>
  )
}
