/** Seletores reutilizáveis de acompanhantes e local de uma sessão da Akane. */

import { useEffect, useRef, useState } from 'react'
import { api } from '../../../lib/api'
import { akaneApi } from '../akaneApi'
import type { WatchLocation } from '../types'
import { Icon } from '../ui/Icon'

interface PersonOption { id: string; name: string }

interface SessionContextFieldsProps {
  companionIds: string[]
  onCompanionIdsChange: (ids: string[]) => void
  watchLocationId: string | null
  onWatchLocationIdChange: (id: string | null) => void
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

  return (
    <div className="ak-session-context" ref={rootRef}>
      <div className="ak-context-group">
        <label className="ak-modal-label">Com quem você viu? <span className="ak-ml-hint">· opcional</span></label>
        <div className={'ak-context-combobox' + (peopleOpen ? ' ak-open' : '')}>
          <div className="ak-context-control" onClick={() => { setPeopleOpen(true); setLocationOpen(false) }}>
            <Icon name="user" />
            <div className="ak-context-chips">
              {selectedPeople.map(person => <button type="button" className="ak-context-chip" key={person.id} onClick={event => { event.stopPropagation(); togglePerson(person.id) }}>{person.name}<Icon name="x" /></button>)}
              <input value={personQuery} onFocus={() => setPeopleOpen(true)} onChange={event => setPersonQuery(event.target.value)} placeholder={selectedPeople.length ? 'Adicionar mais' : 'Adicionar pessoas'} />
            </div>
            <span className="ak-context-arrow">⌄</span>
          </div>
          {peopleOpen && <div className="ak-context-menu">
            {personMatches.map(person => <button type="button" className={'ak-context-option' + (companionIds.includes(person.id) ? ' ak-selected' : '')} key={person.id} onClick={() => togglePerson(person.id)}><span className="ak-context-check">{companionIds.includes(person.id) && <Icon name="check" />}</span>{person.name}</button>)}
            {!personMatches.length && personQuery.trim() && <div className="ak-context-empty">Nenhuma pessoa encontrada.</div>}
            {personQuery.trim() && !hasExactPerson && <div className="ak-context-create"><span>Cadastrar “{personQuery.trim()}”</span><select value={personCategory} onChange={event => setPersonCategory(event.target.value)}><option value="familia">Família</option><option value="amigos">Amigos</option><option value="trabalho">Trabalho</option><option value="outros">Outros</option></select><button type="button" onClick={createPerson} disabled={creatingPerson}><Icon name="plus" /> {creatingPerson ? 'Criando…' : 'Criar'}</button></div>}
          </div>}
        </div>
      </div>

      <div className="ak-context-group">
        <label className="ak-modal-label">Onde você viu? <span className="ak-ml-hint">· opcional</span></label>
        <div className={'ak-context-combobox' + (locationOpen ? ' ak-open' : '')}>
          <div className="ak-context-control" onClick={() => { setLocationOpen(true); setPeopleOpen(false) }}>
            <Icon name={selectedLocation?.kind === 'cinema' ? 'cinema' : 'streaming'} />
            <input value={locationOpen ? locationQuery : (selectedLocation?.name ?? '')} onFocus={() => setLocationOpen(true)} onChange={event => { setLocationQuery(event.target.value); setLocationOpen(true) }} placeholder="Escolher cinema ou streaming" />
            {selectedLocation && <button type="button" className="ak-context-clear" onClick={event => { event.stopPropagation(); onWatchLocationIdChange(null); setLocationQuery('') }} aria-label="Remover local"><Icon name="x" /></button>}
            <span className="ak-context-arrow">⌄</span>
          </div>
          {locationOpen && <div className="ak-context-menu">
            {locationMatches.map(location => <button type="button" className={'ak-context-option' + (location.id === watchLocationId ? ' ak-selected' : '')} key={location.id} onClick={() => { onWatchLocationIdChange(location.id); setLocationQuery(''); setLocationOpen(false) }}><Icon name={location.kind === 'cinema' ? 'cinema' : 'streaming'} />{location.name}<span>{location.kind === 'cinema' ? 'Cinema' : 'Streaming'}</span></button>)}
            {!locationMatches.length && locationQuery.trim() && <div className="ak-context-empty">Nenhum local encontrado.</div>}
            {locationQuery.trim() && !hasExactLocation && <div className="ak-context-create"><span>Adicionar “{locationQuery.trim()}”</span><div className="ak-context-kind"><button type="button" className={locationKind === 'cinema' ? 'ak-active' : ''} onClick={() => setLocationKind('cinema')}><Icon name="cinema" /> Cinema</button><button type="button" className={locationKind === 'streaming' ? 'ak-active' : ''} onClick={() => setLocationKind('streaming')}><Icon name="streaming" /> Streaming</button></div><button type="button" onClick={createLocation} disabled={creatingLocation}><Icon name="plus" /> {creatingLocation ? 'Adicionando…' : 'Adicionar'}</button></div>}
          </div>}
        </div>
      </div>
    </div>
  )
}
