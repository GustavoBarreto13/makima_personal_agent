/** Campos reutilizáveis do contexto de uma sessão da Akane. */

import { useEffect, useState } from 'react'
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

/** Permitir escolher pessoas Komi e um local reutilizável para uma sessão. */
export function SessionContextFields({
  companionIds,
  onCompanionIdsChange,
  watchLocationId,
  onWatchLocationIdChange,
}: SessionContextFieldsProps) {
  const [people, setPeople] = useState<PersonOption[]>([])
  const [locations, setLocations] = useState<WatchLocation[]>([])
  const [personName, setPersonName] = useState('')
  const [personCategory, setPersonCategory] = useState('amigos')
  const [locationName, setLocationName] = useState('')
  const [locationKind, setLocationKind] = useState<WatchLocation['kind']>('streaming')

  const reloadPeople = async () => {
    const result = await api.get<{ people: PersonOption[] }>('/api/people/')
    setPeople(result.people)
  }

  const reloadLocations = async () => {
    const result = await akaneApi.watchLocations(locationName)
    setLocations(result.locations)
  }

  useEffect(() => { reloadPeople().catch(() => setPeople([])) }, [])
  useEffect(() => { reloadLocations().catch(() => setLocations([])) }, [locationName])

  const createPerson = async () => {
    if (!personName.trim()) return
    try {
      const result = await api.post<{ person: PersonOption }>('/api/people/', {
        name: personName.trim(), category: personCategory,
      })
      await reloadPeople()
      onCompanionIdsChange([...new Set([...companionIds, result.person.id])])
      setPersonName('')
    } catch {
      // A Komi bloqueia duplicatas normalizadas; recarregar permite escolher a existente.
      await reloadPeople()
    }
  }

  const createLocation = async () => {
    if (!locationName.trim()) return
    const result = await akaneApi.createWatchLocation(locationName, locationKind)
    await reloadLocations()
    onWatchLocationIdChange(result.location.id)
    setLocationName('')
  }

  return (
    <>
      <div className="ak-modal-field">
        <label className="ak-modal-label">Com quem você viu? <span className="ak-ml-hint">· opcional</span></label>
        <select multiple value={companionIds} className="ak-text-input"
                onChange={event => onCompanionIdsChange(Array.from(event.currentTarget.selectedOptions, option => option.value))}>
          {people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <input className="ak-text-input" value={personName} onChange={event => setPersonName(event.target.value)} placeholder="Cadastrar pessoa" />
          <select className="ak-text-input" value={personCategory} onChange={event => setPersonCategory(event.target.value)}>
            <option value="familia">Família</option><option value="amigos">Amigos</option><option value="trabalho">Trabalho</option><option value="outros">Outros</option>
          </select>
          <button type="button" className="ak-btn ak-btn-ghost" onClick={createPerson}><Icon name="plus" /> Pessoa</button>
        </div>
      </div>

      <div className="ak-modal-field">
        <label className="ak-modal-label">Onde você viu? <span className="ak-ml-hint">· opcional</span></label>
        <select className="ak-text-input" value={watchLocationId ?? ''} onChange={event => onWatchLocationIdChange(event.target.value || null)}>
          <option value="">Sem local</option>
          {locations.map(location => <option key={location.id} value={location.id}>{location.kind === 'cinema' ? '▣' : '▶'} {location.name}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <input className="ak-text-input" value={locationName} onChange={event => setLocationName(event.target.value)} placeholder="Novo local: Mubi ou Cinemark" />
          <button type="button" className={'ak-toggle-pill' + (locationKind === 'cinema' ? ' ak-on' : '')} onClick={() => setLocationKind('cinema')}><Icon name="cinema" /> Cinema</button>
          <button type="button" className={'ak-toggle-pill' + (locationKind === 'streaming' ? ' ak-on' : '')} onClick={() => setLocationKind('streaming')}><Icon name="streaming" /> Streaming</button>
          <button type="button" className="ak-btn ak-btn-ghost" onClick={createLocation}><Icon name="plus" /> Local</button>
        </div>
      </div>
    </>
  )
}
