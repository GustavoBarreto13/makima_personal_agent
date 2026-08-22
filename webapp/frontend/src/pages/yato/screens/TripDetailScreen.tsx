/**
 * TripDetailScreen.tsx — Yato · Viagens (fatia 066)
 *
 * A tela mais densa: cabeçalho com datas editáveis + 4 KPIs, board de dias em
 * colunas (manhã/tarde/noite) e a régua de conforto do trecho no rodapé.
 * Faixa âmbar de itens órfãos ao mudar datas — nunca some com item calado
 * (FR-005).
 */

import { useEffect, useState } from 'react'
import type { Trip, ItineraryDay, Period, DossierResponse, ComfortResponse, BudgetResponse } from '../types'
import { yatoApi } from '../yatoApi'
import { money, dayList } from '../dateUtils'
import { PROFILE_LABEL, PROFILE_CLASS, STATUS_LABEL } from '../components/TripCard'
import { ReadinessLine, checkedCount, pendingCount } from '../components/ReadinessMeter'
import { DayColumn } from '../components/DayColumn'
import { ComfortMatrix } from '../components/ComfortMatrix'
import { Icon } from '../components/Icon'

interface TripDetailScreenProps {
  tripId: string
  onNav: (view: string, param?: string) => void
  onAddItem: (tripId: string, day: string, period: Period) => void
  onShowToast: (msg: string) => void
  reloadKey: number
  onChanged: () => void
}

export function TripDetailScreen({ tripId, onNav, onAddItem, onShowToast, reloadKey, onChanged }: TripDetailScreenProps) {
  const [trip, setTrip] = useState<Trip | null>(null)
  const [days, setDays] = useState<ItineraryDay[]>([])
  const [dossier, setDossier] = useState<DossierResponse | null>(null)
  const [budget, setBudget] = useState<BudgetResponse | null>(null)
  const [orphans, setOrphans] = useState<{ count: number; ids: string[] } | null>(null)
  const [pendingDate, setPendingDate] = useState<{ which: 'start_date' | 'end_date'; value: string } | null>(null)
  const [comfortHours, setComfortHours] = useState(11)
  const [comfortNight, setComfortNight] = useState(true)
  const [comfort, setComfort] = useState<ComfortResponse | null>(null)

  const load = () => {
    yatoApi.getTrip(tripId).then(setTrip).catch(() => setTrip(null))
    yatoApi.listItinerary(tripId).then(res => setDays(res.days)).catch(() => setDays([]))
    yatoApi.getBudget(tripId).then(setBudget).catch(() => setBudget(null))
  }

  useEffect(load, [tripId, reloadKey])

  useEffect(() => {
    if (!trip) return
    yatoApi.getDossier(trip.state_uf, trip.city).then(setDossier).catch(() => setDossier(null))
  }, [trip?.state_uf, trip?.city])

  useEffect(() => {
    if (!trip) return
    const hasRideApp = dossier?.checks.some(c => ['uber', '99', 'indrive'].includes(c.check_key) && c.verdict === 'confirmado') ?? false
    yatoApi.getComfort({ hours: comfortHours, night: comfortNight, profile: trip.profile, has_ride_app: hasRideApp })
      .then(setComfort).catch(() => setComfort(null))
  }, [trip, dossier, comfortHours, comfortNight])

  if (!trip) {
    return <div className="page"><p className="dim">Carregando viagem…</p></div>
  }

  // list_itinerary só devolve dias que já têm item — para o board sempre mostrar
  // uma coluna por dia da viagem (mesmo vazia, com o "+ adicionar"), completa com
  // o intervalo real [start_date, end_date] e mescla os itens vindos da API.
  const itemsByDay = new Map(days.map(d => [d.day_date, d.items]))
  const allDays: ItineraryDay[] = dayList(trip.start_date, trip.end_date)
    .map(day_date => ({ day_date, items: itemsByDay.get(day_date) || [] }))
  const itemCount = allDays.reduce((a, d) => a + d.items.length, 0)
  const withTime = allDays.reduce((a, d) => a + d.items.filter(i => i.start_time).length, 0)
  const checks = dossier?.checks

  const changeDate = async (which: 'start_date' | 'end_date', value: string) => {
    if (!value) return
    const res = await yatoApi.updateTrip(tripId, { [which]: value } as Record<string, string>)
    if ('orphan_count' in res) {
      setOrphans({ count: res.orphan_count, ids: res.orphan_item_ids })
      setPendingDate({ which, value })
      onShowToast(res.message)
    } else {
      setOrphans(null)
      setPendingDate(null)
      load()
    }
  }

  const resolveOrphans = async (action: 'move' | 'remove') => {
    if (!orphans) return
    // "Mover" leva os itens para o último dia do intervalo — se a mudança pendente
    // é o próprio end_date, o novo último dia é o valor pendente; senão, o
    // end_date atual da viagem (só o início está mudando).
    const lastDay = pendingDate?.which === 'end_date' ? pendingDate.value : trip.end_date
    await yatoApi.resolveOrphans(tripId, {
      action, item_ids: orphans.ids, new_day_date: action === 'move' ? lastDay : undefined,
    })
    onShowToast(action === 'move' ? `${orphans.count} itens movidos para o último dia.` : `${orphans.count} itens removidos.`)
    setOrphans(null)
    // Reaplica a mudança de data que tinha ficado pendente — agora sem órfãos.
    if (pendingDate) {
      const p = pendingDate
      setPendingDate(null)
      await changeDate(p.which, p.value)
    } else {
      load()
    }
  }

  const handleDeleteTrip = async () => {
    if (!window.confirm(`Excluir a viagem "${trip.title || trip.city + '/' + trip.state_uf}"? O roteiro, checklist e orçamento ficam preservados no histórico, mas a viagem some das suas listagens.`)) return
    await yatoApi.deleteTrip(tripId)
    onShowToast('Viagem excluída.')
    onChanged()
    onNav('trips')
  }

  const handleDeleteItem = async (itemId: string) => {
    if (!window.confirm('Remover este item do roteiro?')) return
    await yatoApi.deleteItineraryItem(itemId)
    onChanged()
    load()
  }

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <button className="btn btn-sm" onClick={() => onNav('trips')}><Icon name="arrowL" /> Viagens</button>
        <button className="btn btn-sm" style={{ marginLeft: 'auto', color: 'var(--verdict-none)' }} onClick={handleDeleteTrip}>
          <Icon name="x" /> Excluir viagem
        </button>
      </div>

      {orphans && orphans.count > 0 && (
        <div className="banner" style={{ marginBottom: 14 }}>
          <span className="b-sym">◐</span>
          <span><b>{orphans.count} itens</b> ficaram fora das novas datas. Nada foi apagado — decide você.</span>
          <span className="b-acts">
            <button className="btn btn-sm" onClick={() => resolveOrphans('move')}>Mover</button>
            <button className="btn btn-sm" onClick={() => resolveOrphans('remove')}>Remover</button>
          </span>
        </div>
      )}

      <div className="section-head" style={{ alignItems: 'flex-end' }}>
        <div>
          <div className="eyebrow">{trip.title || 'viagem'}</div>
          <h2 className="hero-city" style={{ fontSize: 34 }}>{trip.city}<span className="hc-uf">/{trip.state_uf}</span></h2>
          <div className="hero-meta" style={{ marginTop: 6 }}>
            <input className="inp mono" type="date" value={trip.start_date} style={{ padding: '4px 7px' }}
                   onChange={e => changeDate('start_date', e.target.value)} />
            <span className="sep" />
            <input className="inp mono" type="date" value={trip.end_date} style={{ padding: '4px 7px' }}
                   onChange={e => changeDate('end_date', e.target.value)} />
            <span className="sep" />
            <span className={'chip chip-static ' + PROFILE_CLASS[trip.profile]}>{PROFILE_LABEL[trip.profile]}</span>
            <span className="chip chip-static">{STATUS_LABEL[trip.status]}</span>
          </div>
        </div>
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <div className="dos-foot-k" style={{ marginBottom: 6 }}>dossiê</div>
          <ReadinessLine checks={checks} size="md" onClick={() => onNav('mobility')} />
        </div>
      </div>

      <div className="kpi-row" style={{ marginTop: 6 }}>
        <div className="card kpi"><div className="kk">dias</div><div className="kv2 mono">{allDays.length}</div><div className="ks">{allDays.length} colunas no roteiro</div></div>
        <div className="card kpi"><div className="kk">itens de roteiro</div><div className="kv2 mono">{itemCount}</div><div className="ks">{withTime} com horário marcado</div></div>
        <div className="card kpi"><div className="kk">prontidão</div><div className="kv2 mono">{checkedCount(checks)}/7</div><div className="ks">{pendingCount(checks)} passo pendente</div></div>
        <div className="card kpi"><div className="kk">orçamento</div><div className="kv2 mono">{money(budget?.total_actual ?? 0)}</div><div className="ks">de {money(budget?.total_estimated ?? 0)} estimado</div></div>
      </div>

      <div className="section">
        <div className="section-head">
          <h2 className="section-title">Roteiro</h2>
          <span className="section-sub">manhã · tarde · noite — horário só quando existe</span>
          {allDays[0] && (
            <button className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={() => onAddItem(tripId, allDays[0].day_date, 'manha')}>
              <Icon name="plus" /> Novo item
            </button>
          )}
        </div>
        <div className="board">
          {allDays.map(d => (
            <DayColumn key={d.day_date} date={d.day_date} items={d.items}
                       onAdd={(date, period) => onAddItem(tripId, date, period)}
                       onDeleteItem={handleDeleteItem} />
          ))}
        </div>
      </div>

      <div className="section">
        <div className="filters" style={{ marginBottom: 10 }}>
          <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-3)' }}>duração do trecho (h)</span>
            <input className="inp" type="number" min={1} max={30} step={0.5} style={{ width: 70 }}
                   value={comfortHours} onChange={e => setComfortHours(Number(e.target.value) || 1)} />
          </label>
          <button className={'chip' + (comfortNight ? ' on' : '')} onClick={() => setComfortNight(v => !v)}>noturno</button>
        </div>
        {comfort && <ComfortMatrix data={comfort} hours={comfortHours} night={comfortNight} />}
      </div>
    </div>
  )
}
