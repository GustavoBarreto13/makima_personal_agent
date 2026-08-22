/**
 * TripsScreen.tsx — Yato · Viagens (fatia 066)
 *
 * Grade ⇄ lista de viagens, com filtro por status e ordenação (tweak
 * `ordenacao`, ecoada em mono). Busca da topbar filtra cidade/UF/título.
 */

import { useEffect, useMemo, useState } from 'react'
import type { Trip, MobilityCheck } from '../types'
import { yatoApi } from '../yatoApi'
import { fmtRange } from '../dateUtils'
import { TripCard, PROFILE_LABEL, PROFILE_CLASS, STATUS_LABEL } from '../components/TripCard'
import { ReadinessLine, checkedCount } from '../components/ReadinessMeter'
import { Icon } from '../components/Icon'

const STATUS_FILTERS: [string, string][] = [
  ['todas', 'todas'], ['planejando', 'planejando'], ['confirmada', 'confirmada'],
  ['em_curso', 'em curso'], ['concluida', 'concluída'], ['cancelada', 'cancelada'],
]

interface TripsScreenProps {
  trips: Trip[]
  query: string
  sort: string
  onNav: (view: string, param?: string) => void
  onNewTrip: () => void
}

export function TripsScreen({ trips, query, sort, onNav, onNewTrip }: TripsScreenProps) {
  const [status, setStatus] = useState('todas')
  const [view, setView] = useState<'grid' | 'lista'>('grid')
  const [checksByTrip, setChecksByTrip] = useState<Record<string, MobilityCheck[]>>({})

  useEffect(() => {
    Promise.all(trips.map(t =>
      yatoApi.getDossier(t.state_uf, t.city).then(res => [t.id, res.checks] as const).catch(() => [t.id, null] as const)
    )).then(pairs => {
      const map: Record<string, MobilityCheck[]> = {}
      for (const [id, checks] of pairs) if (checks) map[id] = checks
      setChecksByTrip(map)
    })
  }, [trips])

  let list = trips.filter(t => status === 'todas' || t.status === status)
  if (query) {
    const q = query.toLowerCase()
    list = list.filter(t => (t.city + t.state_uf + (t.title || '')).toLowerCase().includes(q))
  }

  const sorted = useMemo(() => {
    const arr = [...list]
    if (sort === 'Criada') return arr // sem created_at no contrato — mantém ordem da API (recent)
    if (sort === 'Prontidão') {
      return arr.sort((a, b) => checkedCount(checksByTrip[b.id]) - checkedCount(checksByTrip[a.id]))
    }
    if (sort === 'Orçamento') return arr // orçamento por viagem exige fetch extra — mantém ordem da API
    // 'Data de ida' (default)
    return arr.sort((a, b) => a.start_date.localeCompare(b.start_date))
  }, [list, sort, checksByTrip])

  return (
    <div className="page">
      <div className="section-head" style={{ marginTop: 4 }}>
        <h2 className="section-title">Viagens</h2>
        <span className="section-sub">{sorted.length} de {trips.length}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 7 }}>
          <button className={'chip' + (view === 'grid' ? ' on' : '')} onClick={() => setView('grid')}>grade</button>
          <button className={'chip' + (view === 'lista' ? ' on' : '')} onClick={() => setView('lista')}>lista</button>
        </div>
      </div>
      <div className="filters" style={{ marginBottom: 16 }}>
        {STATUS_FILTERS.map(([k, l]) => (
          <button key={k} className={'chip' + (status === k ? ' on' : '')} onClick={() => setStatus(k)}>{l}</button>
        ))}
        <span className="dim mono" style={{ fontSize: 11, marginLeft: 'auto' }}>ordenado por {sort.toLowerCase()}</span>
      </div>

      {sorted.length === 0 && (
        <div className="card empty">
          <span className="e-emoji">🎒</span>
          <span className="e-txt">Nenhuma viagem no horizonte. Cinco ienes e eu te levo pra qualquer lugar.</span>
          <button className="btn btn-primary" onClick={onNewTrip}><Icon name="plus" /> Nova viagem</button>
        </div>
      )}

      {view === 'grid' && sorted.length > 0 && (
        <div className="trips-grid">
          {sorted.map(t => <TripCard key={t.id} trip={t} checks={checksByTrip[t.id]} onClick={() => onNav('trip', t.id)} />)}
        </div>
      )}

      {view === 'lista' && sorted.length > 0 && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table className="trip-table">
            <thead><tr>
              <th>cidade/uf</th><th>datas</th><th>perfil</th><th>prontidão</th><th>status</th>
            </tr></thead>
            <tbody>
              {sorted.map(t => (
                <tr key={t.id} onClick={() => onNav('trip', t.id)}>
                  <td className="city">{t.city}/{t.state_uf}</td>
                  <td className="mono">{fmtRange(t.start_date, t.end_date)}</td>
                  <td><span className={'chip chip-static ' + PROFILE_CLASS[t.profile]}>{PROFILE_LABEL[t.profile]}</span></td>
                  <td style={{ width: 150 }}><ReadinessLine checks={checksByTrip[t.id]} /></td>
                  <td>{STATUS_LABEL[t.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
