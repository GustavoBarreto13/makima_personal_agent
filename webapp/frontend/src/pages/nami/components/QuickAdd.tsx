// Barra de lançamento rápido de transação — aparece no topo do Dashboard e de Transactions.
// Permite criar despesa ou receita sem abrir o modal completo.
// Usa categorias rápidas (chips) e salva com Enter ou clicando em "Lançar".

import { useState, useRef } from 'react'
import { namiApi } from '../namiApi'

interface QuickAddProps {
  // Chamado com mensagem de sucesso após salvar (ex: "Despesa lançada ✓")
  onSaved: (msg?: string) => void
}

// Categorias rápidas por tipo (5 despesa, 4 receita)
const QUICK_DESPESA = ['Alimentacao', 'Comer Fora', 'Transporte', 'Supermercado', 'Assinaturas']
const QUICK_RECEITA = ['Receita', 'Investimento', 'Presente', 'Inbox']

/** Barra de entrada rápida de transações sem abrir o modal. */
export function QuickAdd({ onSaved }: QuickAddProps) {
  // Tipo da transação: Despesa (padrão) ou Receita
  const [tipo, setTipo]           = useState<'Despesa' | 'Receita'>('Despesa')
  const [valor, setValor]         = useState('')
  const [nome, setNome]           = useState('')
  const [categoria, setCategoria] = useState('')
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')

  // Ref para retornar o foco ao campo de valor após salvar
  const valorRef = useRef<HTMLInputElement>(null)

  const chips = tipo === 'Despesa' ? QUICK_DESPESA : QUICK_RECEITA

  // Salva quando o valor é positivo
  async function handleSave() {
    const v = parseFloat(valor.replace(',', '.'))
    if (!v || v <= 0) { setError('Valor inválido'); return }
    setSaving(true)
    setError('')
    try {
      await namiApi.createTransaction({
        name: nome.trim() || categoria || tipo,
        valor: v,
        tipo,
        categoria: categoria || (tipo === 'Despesa' ? 'Inbox' : 'Receita'),
      })
      // Limpa o formulário e retorna o foco ao valor
      setValor(''); setNome(''); setCategoria('')
      valorRef.current?.focus()
      onSaved(`${tipo} lançada ✓`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  // Enter em qualquer campo dispara o save
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); handleSave() }
  }

  const isTangerina = tipo === 'Despesa'
  const accent      = isTangerina ? 'var(--out)' : 'var(--in)'
  const accentTint  = isTangerina ? 'var(--out-tint)' : 'var(--in-tint)'

  const inputStyle: React.CSSProperties = {
    padding: '7px 10px',
    borderRadius: 'var(--r-sm)',
    border: '1.5px solid var(--line)',
    background: 'var(--paper)',
    color: 'var(--ink)',
    fontFamily: 'var(--sans)',
    fontSize: 13,
    outline: 'none',
  }

  return (
    <div style={{
      background: 'var(--card)',
      borderRadius: 'var(--r-md)',
      border: `1.5px solid ${accent}`,
      padding: '14px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
    }}>
      {/* Linha principal: tipo + valor + nome + botão */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {/* Toggle Despesa / Receita */}
        <button
          type="button"
          onClick={() => { setTipo(t => t === 'Despesa' ? 'Receita' : 'Despesa'); setCategoria('') }}
          style={{
            padding: '6px 10px',
            borderRadius: 'var(--r-sm)',
            border: 'none',
            background: accentTint,
            color: accent,
            fontFamily: 'var(--mono)',
            fontSize: 11,
            fontWeight: 700,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            letterSpacing: '0.05em',
          }}
        >
          {tipo === 'Despesa' ? '▼ Saiu' : '▲ Entrou'}
        </button>

        {/* Campo de valor com prefixo R$ */}
        <div style={{ position: 'relative', width: 110, flexShrink: 0 }}>
          <span style={{
            position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
            fontSize: 12, color: 'var(--ink-3)', pointerEvents: 'none',
            fontFamily: 'var(--mono)',
          }}>R$</span>
          <input
            ref={valorRef}
            type="text"
            inputMode="decimal"
            value={valor}
            onChange={e => setValor(e.target.value.replace(/[^0-9.,]/g, ''))}
            onKeyDown={onKeyDown}
            placeholder="0,00"
            style={{ ...inputStyle, width: '100%', paddingLeft: 28, fontFamily: 'var(--mono)', boxSizing: 'border-box' }}
          />
        </div>

        {/* Campo de descrição */}
        <input
          type="text"
          value={nome}
          onChange={e => setNome(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Descrição (opcional)"
          style={{ ...inputStyle, flex: 1 }}
        />

        {/* Botão Lançar */}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !valor}
          style={{
            padding: '7px 14px',
            borderRadius: 'var(--r-sm)',
            border: 'none',
            background: valor ? accent : 'var(--line)',
            color: valor ? 'white' : 'var(--ink-4)',
            fontFamily: 'var(--sans)',
            fontSize: 13,
            fontWeight: 600,
            cursor: saving || !valor ? 'default' : 'pointer',
            whiteSpace: 'nowrap',
            transition: 'background 0.2s',
          }}
        >
          {saving ? '…' : 'Lançar'}
        </button>
      </div>

      {/* Chips de categoria rápida */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {chips.map(cat => (
          <button
            key={cat}
            type="button"
            onClick={() => setCategoria(c => c === cat ? '' : cat)}
            style={{
              padding: '3px 9px',
              borderRadius: 999,
              border: `1.5px solid ${categoria === cat ? accent : 'var(--line)'}`,
              background: categoria === cat ? accentTint : 'transparent',
              color: categoria === cat ? accent : 'var(--ink-3)',
              fontFamily: 'var(--sans)',
              fontSize: 11.5,
              fontWeight: categoria === cat ? 600 : 400,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Mensagem de erro inline */}
      {error && (
        <div style={{ fontSize: 11.5, color: 'var(--out)', marginTop: -4 }}>{error}</div>
      )}
    </div>
  )
}
