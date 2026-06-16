// PersonPicker.tsx — Combobox reutilizável para buscar e selecionar uma pessoa.
// Exportado para outros shells (Nami, Kaguya, Frieren, Journal) plugarem quando
// quiserem vincular um item a uma pessoa da Komi.
//
// Comportamento smart-match:
//   0 resultados → oferece "Cadastrar [nome]" (abre modal de criação)
//   1 resultado  → confirma "Encontrei [Nome]" e chama onSelect
//   2+ resultados → lista para o usuário escolher (disambiguação)
//
// Uso:
//   import { PersonPicker } from '../komi/components/PersonPicker'
//   <PersonPicker onSelect={(id, name) => console.log(id, name)} />

import { useState, useEffect, useRef } from 'react'
import { Icon } from '../icons'
import { Avatar } from '../icons'
import { komiApi } from '../komiApi'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface PersonResult {
  id: string
  name: string
  relationship: string
}

interface PersonPickerProps {
  /** Chamado quando o usuário confirma a seleção de uma pessoa. */
  onSelect: (id: string, name: string) => void
  /** Chamado quando o usuário quer cadastrar alguém novo (recebe o nome digitado). */
  onCreateNew?: (name: string) => void
  /** Placeholder do campo de busca (default: "Buscar pessoa…"). */
  placeholder?: string
  /** Exibe o picker em modo compacto (sem bordas externas). */
  compact?: boolean
}

// Tempo de espera (ms) antes de disparar a busca após o usuário parar de digitar
const DEBOUNCE_MS = 300

/**
 * Combobox reutilizável de busca de pessoas da Komi.
 * Aplica smart-match (0/1/N resultados) via komiApi.search().
 * Pode ser importado por qualquer outro shell para criar vínculos com pessoas.
 */
export function PersonPicker({ onSelect, onCreateNew, placeholder = 'Buscar pessoa…', compact = false }: PersonPickerProps) {
  const [query, setQuery] = useState('')           // texto digitado pelo usuário
  const [results, setResults] = useState<PersonResult[]>([])  // resultados da busca
  const [loading, setLoading] = useState(false)    // indica busca em andamento
  const [confirmed, setConfirmed] = useState<PersonResult | null>(null)  // pessoa confirmada (1 resultado)
  const [error, setError] = useState<string | null>(null)  // mensagem de erro
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)  // ref do timer de debounce
  const inputRef = useRef<HTMLInputElement>(null)   // ref do input para focar

  // Debounce: espera o usuário parar de digitar antes de buscar
  // Isso evita muitas chamadas à API enquanto o usuário ainda está digitando
  useEffect(() => {
    // Cancela o timer anterior se o usuário continuou digitando
    if (timerRef.current) clearTimeout(timerRef.current)

    const q = query.trim()

    // Reseta o estado quando o campo está vazio
    if (!q) {
      setResults([])
      setConfirmed(null)
      setError(null)
      return
    }

    // Espera DEBOUNCE_MS ms antes de disparar a busca
    timerRef.current = setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        // Chama o endpoint de busca com smart-match
        const data = await komiApi.search(q)
        const matches = data.matches || []

        if (matches.length === 1) {
          // 1 resultado: confirma automaticamente (smart-match direto)
          setConfirmed(matches[0])
          setResults([])
        } else {
          // 0 ou N resultados: exibe lista ou estado "não encontrado"
          setConfirmed(null)
          setResults(matches)
        }
      } catch (err) {
        // Erro de rede ou API: exibe mensagem e limpa resultados
        setError('Erro ao buscar. Tente novamente.')
        setResults([])
      } finally {
        setLoading(false)
      }
    }, DEBOUNCE_MS)

    // Limpa o timer quando o componente desmonta ou query muda
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [query])

  /** Seleciona uma pessoa e notifica o pai. */
  function select(person: PersonResult) {
    setQuery('')
    setResults([])
    setConfirmed(null)
    onSelect(person.id, person.name)
  }

  /** Solicita criação de nova pessoa com o nome digitado. */
  function requestCreate() {
    if (onCreateNew) {
      onCreateNew(query.trim())
    }
    setQuery('')
    setResults([])
  }

  const hasQuery = query.trim().length > 0

  return (
    <div className={'person-picker' + (compact ? ' compact' : '')}>
      {/* Campo de busca */}
      <div className="pp-input-wrap">
        <Icon name="search" />
        <input
          ref={inputRef}
          className="pp-input"
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          // Esc limpa o campo
          onKeyDown={(e) => { if (e.key === 'Escape') { setQuery(''); setResults([]); setConfirmed(null) } }}
          autoComplete="off"
        />
        {/* Spinner durante a busca */}
        {loading && <span className="pp-spinner" />}
        {/* Limpar o campo */}
        {hasQuery && !loading && (
          <button className="pp-clear" onClick={() => { setQuery(''); inputRef.current?.focus() }}>
            <Icon name="x" />
          </button>
        )}
      </div>

      {/* Estado: pessoa confirmada por smart-match (1 resultado) */}
      {confirmed && (
        <div className="pp-confirmed">
          <span className="pp-confirm-text">
            Encontrei <b>{confirmed.name}</b> ({confirmed.relationship})
          </span>
          <button className="pp-confirm-btn" onClick={() => select(confirmed)}>
            <Icon name="check" />Usar
          </button>
          <button className="pp-cancel-btn" onClick={() => { setConfirmed(null); setQuery(''); }}>
            <Icon name="x" />
          </button>
        </div>
      )}

      {/* Lista de resultados para disambiguação (N > 1 resultados) */}
      {results.length > 0 && (
        <div className="pp-results">
          {results.map(r => (
            <button key={r.id} className="pp-result-item" onClick={() => select(r)}>
              {/* Avatar miniatura com iniciais */}
              <Avatar person={{ name: r.name, avatar_url: null }} size={28} />
              <div className="pp-result-body">
                <div className="pp-result-name">{r.name}</div>
                <div className="pp-result-rel">{r.relationship}</div>
              </div>
              <Icon name="chevL" style={{ transform: 'rotate(180deg)' }} />
            </button>
          ))}
        </div>
      )}

      {/* Estado: 0 resultados — oferece cadastrar como nova pessoa */}
      {hasQuery && !loading && !confirmed && results.length === 0 && query.trim().length > 1 && (
        <div className="pp-empty">
          <span className="pp-empty-text">Nenhuma pessoa encontrada com "{query.trim()}"</span>
          {onCreateNew && (
            <button className="pp-create-btn" onClick={requestCreate}>
              <Icon name="plus" />Cadastrar como nova pessoa
            </button>
          )}
        </div>
      )}

      {/* Mensagem de erro */}
      {error && (
        <div className="pp-error">{error}</div>
      )}
    </div>
  )
}
