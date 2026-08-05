/** Seletores reutilizáveis de acompanhantes e local de uma sessão da Akane.
 *
 * Reusa a linguagem visual da busca de filmes do LogModal (`.ak-film-search-bar`
 * / `.ak-fs-result`): a pessoa/local selecionado aparece como um chip com
 * avatar/ícone, e a lista de opções é uma linha com avatar + nome + metadado,
 * igual ao resultado de busca do TMDB, só que com um rosto no lugar do pôster.
 */

import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { api } from '../../../lib/api'
import { akaneApi } from '../akaneApi'
import type { WatchLocation } from '../types'
import { Icon } from '../ui/Icon'

/** Pessoa vinda de GET /api/people/ (Komi) — só os campos que este seletor usa. */
interface PersonOption {
  id: string
  name: string
  category?: string | null
  avatar_url?: string | null
}

interface SessionContextFieldsProps {
  companionIds: string[]
  onCompanionIdsChange: (ids: string[]) => void
  watchLocationId: string | null
  onWatchLocationIdChange: (id: string | null) => void
}

/** Categorias de pessoa aceitas pela Komi (mesmo vocabulário da tela de Pessoas). */
const PERSON_CATEGORIES: { value: string; label: string }[] = [
  { value: 'familia', label: 'Família' },
  { value: 'amigos', label: 'Amigos' },
  { value: 'trabalho', label: 'Trabalho' },
  { value: 'outros', label: 'Outros' },
]
const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  PERSON_CATEGORIES.map(c => [c.value, c.label])
)

/** Reduz um nome às iniciais (1 ou 2 letras) para o avatar sem foto. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/** Avatar redondo: foto se houver `avatarUrl`, senão as iniciais do nome. */
function ContextAvatar({ name, avatarUrl, size }: { name: string; avatarUrl?: string | null; size: number }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.42) }
  if (avatarUrl) {
    return (
      <span className="ak-context-av" style={style}>
        <img src={avatarUrl} alt="" />
      </span>
    )
  }
  return <span className="ak-context-av ak-context-av-fallback" style={style}>{initials(name)}</span>
}

/** Permitir escolher ou criar o contexto de uma sessão sem usar selects nativos. */
export function SessionContextFields({
  companionIds,
  onCompanionIdsChange,
  watchLocationId,
  onWatchLocationIdChange,
}: SessionContextFieldsProps) {
  const [people, setPeople] = useState<PersonOption[]>([])
  const [locations, setLocations] = useState<WatchLocation[]>([])
  const [peopleOpen, setPeopleOpen] = useState(false)
  const [locationOpen, setLocationOpen] = useState(false)
  const [personQuery, setPersonQuery] = useState('')
  const [locationQuery, setLocationQuery] = useState('')
  const [personCategory, setPersonCategory] = useState('amigos')
  const [locationKind, setLocationKind] = useState<WatchLocation['kind']>('streaming')
  const [creatingPerson, setCreatingPerson] = useState(false)
  const [creatingLocation, setCreatingLocation] = useState(false)
  // Índice da opção realçada por teclado (↑/↓) em cada menu — inclui a linha
  // de cadastro como "última opção" quando ela está visível.
  const [personActiveIndex, setPersonActiveIndex] = useState(0)
  const [locationActiveIndex, setLocationActiveIndex] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)

  const reloadPeople = async () => {
    const result = await api.get<{ people: PersonOption[] }>('/api/people/')
    setPeople(result.people ?? [])
  }

  const reloadLocations = async () => {
    const result = await akaneApi.watchLocations('')
    setLocations(result.locations ?? [])
  }

  useEffect(() => { reloadPeople().catch(() => setPeople([])); reloadLocations().catch(() => setLocations([])) }, [])

  useEffect(() => {
    const closeOnOutside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setPeopleOpen(false)
        setLocationOpen(false)
      }
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setPeopleOpen(false); setLocationOpen(false) }
    }
    document.addEventListener('mousedown', closeOnOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => { document.removeEventListener('mousedown', closeOnOutside); document.removeEventListener('keydown', closeOnEscape) }
  }, [])

  const selectedPeople = people.filter(person => companionIds.includes(person.id))
  const selectedLocation = locations.find(location => location.id === watchLocationId) ?? null
  const personMatches = people.filter(person => person.name.toLocaleLowerCase().includes(personQuery.toLocaleLowerCase()))
  const locationMatches = locations.filter(location => location.name.toLocaleLowerCase().includes(locationQuery.toLocaleLowerCase()))
  const hasExactPerson = people.some(person => person.name.trim().toLocaleLowerCase() === personQuery.trim().toLocaleLowerCase())
  const hasExactLocation = locations.some(location => location.name.trim().toLocaleLowerCase() === locationQuery.trim().toLocaleLowerCase())
  const showPersonCreate = personQuery.trim().length > 0 && !hasExactPerson
  const showLocationCreate = locationQuery.trim().length > 0 && !hasExactLocation
  // Total de linhas navegáveis por teclado (opções + a linha de cadastro, se visível).
  const personOptionCount = personMatches.length + (showPersonCreate ? 1 : 0)
  const locationOptionCount = locationMatches.length + (showLocationCreate ? 1 : 0)

  const togglePerson = (personId: string) => {
    onCompanionIdsChange(companionIds.includes(personId) ? companionIds.filter(id => id !== personId) : [...companionIds, personId])
  }

  const createPerson = async () => {
    if (!personQuery.trim() || creatingPerson) return
    setCreatingPerson(true)
    try {
      const result = await api.post<{ person: PersonOption }>('/api/people/', { name: personQuery.trim(), category: personCategory })
      await reloadPeople()
      onCompanionIdsChange([...new Set([...companionIds, result.person.id])])
      setPersonQuery('')
    } catch {
      await reloadPeople()
    } finally {
      setCreatingPerson(false)
    }
  }

  const createLocation = async () => {
    if (!locationQuery.trim() || creatingLocation) return
    setCreatingLocation(true)
    try {
      const result = await akaneApi.createWatchLocation(locationQuery.trim(), locationKind)
      await reloadLocations()
      onWatchLocationIdChange(result.location.id)
      setLocationQuery('')
      setLocationOpen(false)
    } finally {
      setCreatingLocation(false)
    }
  }

  /** Navegação por teclado do combobox de pessoas: ↑/↓ move, Enter seleciona/cria, Tab fecha. */
  const handlePersonKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (!peopleOpen) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setPersonActiveIndex(i => Math.min(i + 1, Math.max(personOptionCount - 1, 0)))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setPersonActiveIndex(i => Math.max(i - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (personActiveIndex < personMatches.length && personMatches[personActiveIndex]) {
        togglePerson(personMatches[personActiveIndex].id)
      } else if (showPersonCreate) {
        createPerson()
      }
    } else if (event.key === 'Tab') {
      setPeopleOpen(false)
    }
  }

  /** Navegação por teclado do combobox de local: mesmo padrão do de pessoas. */
  const handleLocationKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (!locationOpen) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setLocationActiveIndex(i => Math.min(i + 1, Math.max(locationOptionCount - 1, 0)))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setLocationActiveIndex(i => Math.max(i - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (locationActiveIndex < locationMatches.length && locationMatches[locationActiveIndex]) {
        const loc = locationMatches[locationActiveIndex]
        onWatchLocationIdChange(loc.id)
        setLocationQuery('')
        setLocationOpen(false)
      } else if (showLocationCreate) {
        createLocation()
      }
    } else if (event.key === 'Tab') {
      setLocationOpen(false)
    }
  }

  return (
    <div className="ak-session-context" ref={rootRef}>
      {/* ── Com quem você viu? (multi-seleção) ── */}
      <div className="ak-context-group">
        <label className="ak-modal-label" id="ak-ctx-people-label">Com quem você viu? <span className="ak-ml-hint">· opcional</span></label>
        <div className={'ak-context-combobox' + (peopleOpen ? ' ak-open' : '')}>
          <div className="ak-context-control" role="combobox" aria-expanded={peopleOpen} aria-haspopup="listbox"
               aria-controls="ak-ctx-people-menu" aria-labelledby="ak-ctx-people-label"
               onClick={() => { setPeopleOpen(true); setLocationOpen(false); setPersonActiveIndex(0) }}>
            <div className="ak-context-chips">
              {selectedPeople.map(person => (
                <span className="ak-context-chip" key={person.id}>
                  <ContextAvatar name={person.name} avatarUrl={person.avatar_url} size={18} />
                  {person.name}
                  <button type="button" className="ak-context-chip-remove" aria-label={`Remover ${person.name}`}
                          onClick={event => { event.stopPropagation(); togglePerson(person.id) }}>
                    <Icon name="x" />
                  </button>
                </span>
              ))}
              <input value={personQuery}
                     onFocus={() => { setPeopleOpen(true); setLocationOpen(false); setPersonActiveIndex(0) }}
                     onChange={event => { setPersonQuery(event.target.value); setPersonActiveIndex(0) }}
                     onKeyDown={handlePersonKeyDown}
                     aria-autocomplete="list"
                     placeholder={selectedPeople.length ? 'Adicionar mais' : 'Buscar ou cadastrar pessoa'} />
            </div>
            <span className="ak-context-arrow"><Icon name="chevDown" /></span>
          </div>
          {peopleOpen && (
            <div className="ak-context-menu" id="ak-ctx-people-menu" role="listbox">
              <div className="ak-context-list">
                {personMatches.length === 0 && !personQuery.trim() && (
                  <div className="ak-context-empty">Nenhuma pessoa cadastrada ainda. Digite um nome para criar a primeira.</div>
                )}
                {personMatches.length === 0 && personQuery.trim() && (
                  <div className="ak-context-empty">Nenhuma pessoa encontrada.</div>
                )}
                {personMatches.map((person, i) => (
                  <button type="button" role="option" aria-selected={companionIds.includes(person.id)} key={person.id}
                          className={'ak-context-option' + (companionIds.includes(person.id) ? ' ak-selected' : '') + (i === personActiveIndex ? ' ak-active' : '')}
                          onMouseEnter={() => setPersonActiveIndex(i)}
                          onClick={() => togglePerson(person.id)}>
                    <ContextAvatar name={person.name} avatarUrl={person.avatar_url} size={26} />
                    <span className="ak-context-option-name">{person.name}</span>
                    {person.category && <span className="ak-context-option-meta">{CATEGORY_LABELS[person.category] ?? person.category}</span>}
                    {companionIds.includes(person.id) && <span className="ak-context-option-check"><Icon name="check" /></span>}
                  </button>
                ))}
              </div>
              {showPersonCreate && (
                <div className="ak-context-create">
                  <div className="ak-context-create-row">
                    <span>Cadastrar “{personQuery.trim()}”</span>
                    <button type="button" onClick={createPerson} disabled={creatingPerson}>
                      <Icon name="plus" /> {creatingPerson ? 'Criando…' : 'Criar'}
                    </button>
                  </div>
                  <div className="ak-context-pills">
                    {PERSON_CATEGORIES.map(c => (
                      <button type="button" key={c.value}
                              className={'ak-toggle-pill ak-sm' + (personCategory === c.value ? ' ak-on' : '')}
                              onClick={() => setPersonCategory(c.value)}>
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Onde você viu? (seleção única) ── */}
      <div className="ak-context-group">
        <label className="ak-modal-label" id="ak-ctx-location-label">Onde você viu? <span className="ak-ml-hint">· opcional</span></label>
        <div className={'ak-context-combobox' + (locationOpen ? ' ak-open' : '')}>
          <div className="ak-context-control" role="combobox" aria-expanded={locationOpen} aria-haspopup="listbox"
               aria-controls="ak-ctx-location-menu" aria-labelledby="ak-ctx-location-label"
               onClick={() => { setLocationOpen(true); setPeopleOpen(false); setLocationActiveIndex(0) }}>
            <div className="ak-context-chips">
              {selectedLocation && (
                <span className="ak-context-chip" key={selectedLocation.id}>
                  <span className="ak-context-chip-icon"><Icon name={selectedLocation.kind === 'cinema' ? 'cinema' : 'streaming'} /></span>
                  {selectedLocation.name}
                  <button type="button" className="ak-context-chip-remove" aria-label={`Remover ${selectedLocation.name}`}
                          onClick={event => { event.stopPropagation(); onWatchLocationIdChange(null) }}>
                    <Icon name="x" />
                  </button>
                </span>
              )}
              <input value={locationQuery}
                     onFocus={() => { setLocationOpen(true); setPeopleOpen(false); setLocationActiveIndex(0) }}
                     onChange={event => { setLocationQuery(event.target.value); setLocationActiveIndex(0) }}
                     onKeyDown={handleLocationKeyDown}
                     aria-autocomplete="list"
                     placeholder={selectedLocation ? 'Trocar local' : 'Buscar ou cadastrar local'} />
            </div>
            <span className="ak-context-arrow"><Icon name="chevDown" /></span>
          </div>
          {locationOpen && (
            <div className="ak-context-menu" id="ak-ctx-location-menu" role="listbox">
              <div className="ak-context-list">
                {locationMatches.length === 0 && !locationQuery.trim() && (
                  <div className="ak-context-empty">Nenhum local cadastrado ainda. Digite um nome para criar o primeiro.</div>
                )}
                {locationMatches.length === 0 && locationQuery.trim() && (
                  <div className="ak-context-empty">Nenhum local encontrado.</div>
                )}
                {locationMatches.map((location, i) => (
                  <button type="button" role="option" aria-selected={location.id === watchLocationId} key={location.id}
                          className={'ak-context-option' + (location.id === watchLocationId ? ' ak-selected' : '') + (i === locationActiveIndex ? ' ak-active' : '')}
                          onMouseEnter={() => setLocationActiveIndex(i)}
                          onClick={() => { onWatchLocationIdChange(location.id); setLocationQuery(''); setLocationOpen(false) }}>
                    <span className="ak-context-option-icon"><Icon name={location.kind === 'cinema' ? 'cinema' : 'streaming'} /></span>
                    <span className="ak-context-option-name">{location.name}</span>
                    <span className="ak-context-option-meta">{location.kind === 'cinema' ? 'Cinema' : 'Streaming'}</span>
                    {location.id === watchLocationId && <span className="ak-context-option-check"><Icon name="check" /></span>}
                  </button>
                ))}
              </div>
              {showLocationCreate && (
                <div className="ak-context-create">
                  <div className="ak-context-create-row">
                    <span>Adicionar “{locationQuery.trim()}”</span>
                    <button type="button" onClick={createLocation} disabled={creatingLocation}>
                      <Icon name="plus" /> {creatingLocation ? 'Adicionando…' : 'Adicionar'}
                    </button>
                  </div>
                  <div className="ak-context-pills">
                    <button type="button" className={'ak-toggle-pill ak-sm' + (locationKind === 'cinema' ? ' ak-on' : '')}
                            onClick={() => setLocationKind('cinema')}>
                      <Icon name="cinema" /> Cinema
                    </button>
                    <button type="button" className={'ak-toggle-pill ak-sm' + (locationKind === 'streaming' ? ' ak-on' : '')}
                            onClick={() => setLocationKind('streaming')}>
                      <Icon name="streaming" /> Streaming
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
