// Modal de nova transação financeira.
// Abre quando o usuário clica em "Nova transação" ou pressiona A/+.
// Carrega a lista de categorias do backend na primeira abertura.

import { useState, useEffect, useRef } from 'react'
import { namiApi } from '../namiApi'
import type { Account, Card, Category } from '../types'

// Props recebidas do NamiShell
interface AddModalProps {
  open: boolean                                  // controla visibilidade
  accounts: Account[]                            // lista de contas para o seletor
  cards: Card[]                                  // lista de cartões para o seletor
  onClose: () => void                            // fecha sem salvar
  onSaved: (msg?: string) => Promise<void>       // chamada após salvar com sucesso
}

// Categorias organizadas por tipo (in/out) para exibição no seletor
type TipoTx = 'Despesa' | 'Receita'

/** Modal de criação de transação (FR-001, FR-002). */
export function AddModal({ open, accounts, cards, onClose, onSaved }: AddModalProps) {
  // Tipo da transação — alterna entre Despesa e Receita
  const [tipo, setTipo]         = useState<TipoTx>('Despesa')
  // Campos do formulário
  const [name, setName]         = useState('')
  const [valor, setValor]       = useState('')
  const [categoria, setCategoria] = useState('Inbox')
  // Fonte: conta bancária ou cartão de crédito
  const [fonte, setFonte]       = useState('') // "conta:nome" ou "card:id"
  const [data, setData]         = useState('')
  const [notes, setNotes]       = useState('')
  // Estado do formulário
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  // Categorias carregadas do backend
  const [categories, setCategories] = useState<Category[]>([])

  // Foco automático no campo nome ao abrir
  const nameRef = useRef<HTMLInputElement>(null)

  // Carrega categorias uma única vez
  useEffect(() => {
    if (categories.length === 0) {
      namiApi.getCategories()
        .then(cats => setCategories(cats))
        .catch(() => {
          // Fallback: usa lista mínima se o endpoint falhar
          setCategories([])
        })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Foca o input de nome quando o modal abre
  useEffect(() => {
    if (open) {
      setTimeout(() => nameRef.current?.focus(), 50)
    }
  }, [open])

  // Fecha ao pressionar Escape
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  // Filtra categorias por tipo selecionado
  const catsFiltered = categories.filter(c =>
    tipo === 'Despesa' ? c.kind === 'out' : c.kind === 'in'
  )
  // Se não há categorias carregadas, usa lista de fallback
  const catOptions = catsFiltered.length > 0
    ? catsFiltered.map(c => c.id)
    : tipo === 'Despesa'
      ? ['Alimentacao','Comer Fora','Saude','Lazer','Transporte','Moradia',
         'Roupas','Educacao','Assinaturas','Viagem','Presente','Beleza',
         'Academia','Farmacia','Supermercado','Eletronicos','Pet','Inbox']
      : ['Receita','Investimento']

  // Resolve conta/cartão a partir do seletor "fonte"
  function resolveFonte() {
    if (!fonte) return { conta: '', card_id: '' }
    const [kind, value] = fonte.split(':')
    if (kind === 'card') return { conta: '', card_id: value }
    return { conta: value, card_id: '' }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !valor || isNaN(Number(valor.replace(',', '.')))) {
      setError('Nome e valor são obrigatórios.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const { conta, card_id } = resolveFonte()
      await namiApi.createTransaction({
        name: name.trim(),
        valor: parseFloat(valor.replace(',', '.')),
        tipo,
        categoria,
        conta,
        card_id,
        data,
        notes,
      })
      // Reseta o formulário para próxima entrada rápida
      setName('')
      setValor('')
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

  // Estilos reutilizáveis
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '9px 11px',
    borderRadius: 'var(--r-sm)',
    border: '1.5px solid var(--line)',
    background: 'var(--paper)',
    color: 'var(--ink)',
    fontFamily: 'var(--sans)',
    fontSize: 13.5,
    outline: 'none',
    transition: 'border-color 0.15s',
    boxSizing: 'border-box',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--ink-3)',
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
    marginBottom: 4,
  }

  return (
    // Scrim: fundo semitransparente que fecha o modal ao clicar
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'oklch(0 0 0 / 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backdropFilter: 'blur(3px)',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Painel do modal */}
      <div style={{
        background: 'var(--card)',
        borderRadius: 'var(--r-lg)',
        boxShadow: 'var(--shadow-lg)',
        width: '100%',
        maxWidth: 440,
        margin: '0 16px',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}>

        {/* Cabeçalho */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 18, color: 'var(--ink)', margin: 0 }}>
            Nova transação
          </h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', padding: 4 }}
            aria-label="Fechar modal"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Seletor de tipo (Despesa / Receita) */}
        <div style={{ display: 'flex', gap: 8 }}>
          {(['Despesa', 'Receita'] as const).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTipo(t)
                // Reseta categoria ao trocar tipo para evitar categoria inválida
                setCategoria(t === 'Despesa' ? 'Inbox' : 'Receita')
              }}
              style={{
                flex: 1,
                padding: '9px',
                borderRadius: 'var(--r-sm)',
                border: `1.5px solid ${tipo === t
                  ? (t === 'Despesa' ? 'var(--out)' : 'var(--in)')
                  : 'var(--line)'}`,
                background: tipo === t
                  ? (t === 'Despesa' ? 'var(--out-tint)' : 'var(--in-tint)')
                  : 'transparent',
                color: tipo === t
                  ? (t === 'Despesa' ? 'var(--out)' : 'var(--in)')
                  : 'var(--ink-2)',
                fontWeight: tipo === t ? 600 : 400,
                fontSize: 13.5,
                cursor: 'pointer',
                fontFamily: 'var(--sans)',
              }}
            >
              {t === 'Despesa' ? '↓ Despesa' : '↑ Receita'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Nome */}
          <div>
            <label style={labelStyle}>Descrição</label>
            <input
              ref={nameRef}
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={tipo === 'Despesa' ? 'Ex.: Almoço, Uber, Netflix…' : 'Ex.: Salário, Freelance…'}
              style={inputStyle}
              required
            />
          </div>

          {/* Valor */}
          <div>
            <label style={labelStyle}>Valor (R$)</label>
            <input
              type="text"
              inputMode="decimal"
              value={valor}
              onChange={e => setValor(e.target.value.replace(/[^0-9.,]/g, ''))}
              placeholder="0,00"
              style={{ ...inputStyle, fontFamily: 'var(--mono)', fontSize: 16 }}
              required
            />
          </div>

          {/* Categoria */}
          <div>
            <label style={labelStyle}>Categoria</label>
            <select
              value={categoria}
              onChange={e => setCategoria(e.target.value)}
              style={inputStyle}
            >
              {catOptions.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Fonte (conta ou cartão) */}
          <div>
            <label style={labelStyle}>Conta / Cartão</label>
            <select
              value={fonte}
              onChange={e => setFonte(e.target.value)}
              style={inputStyle}
            >
              <option value="">— Automático —</option>
              {accounts.map(a => (
                <option key={a.id} value={`conta:${a.name}`}>{a.name}</option>
              ))}
              {cards.map(c => (
                <option key={c.id} value={`card:${c.id}`}>💳 {c.name}</option>
              ))}
            </select>
          </div>

          {/* Data */}
          <div>
            <label style={labelStyle}>Data (opcional)</label>
            <input
              type="date"
              value={data}
              onChange={e => setData(e.target.value)}
              style={inputStyle}
            />
          </div>

          {/* Notas */}
          <div>
            <label style={labelStyle}>Notas (opcional)</label>
            <input
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Observações…"
              style={inputStyle}
            />
          </div>

          {/* Erro */}
          {error && (
            <div style={{ fontSize: 12.5, color: 'var(--out)', padding: '6px 10px', background: 'var(--out-tint)', borderRadius: 'var(--r-sm)' }}>
              {error}
            </div>
          )}

          {/* Botão de salvar */}
          <button
            type="submit"
            disabled={saving}
            style={{
              padding: '10px',
              borderRadius: 'var(--r-md)',
              border: 'none',
              background: tipo === 'Despesa' ? 'var(--out)' : 'var(--in)',
              color: 'white',
              fontSize: 14,
              fontWeight: 600,
              cursor: saving ? 'wait' : 'pointer',
              opacity: saving ? 0.7 : 1,
              fontFamily: 'var(--sans)',
              transition: 'opacity 0.15s',
            }}
          >
            {saving ? 'Salvando…' : `Lançar ${tipo}`}
          </button>
        </form>
      </div>
    </div>
  )
}
