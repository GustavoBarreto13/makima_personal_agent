/**
 * HomeScreen.tsx — Yato · Viagens (fatia 066)
 *
 * "Estou pronto para essa viagem?" em um olhar: hero da próxima viagem +
 * prontidão do protocolo, 3 painéis (estratégia/orçamento/pendências), linha
 * do tempo do dia 1 e grade de outras viagens.
 */

import { useEffect, useState } from 'react'
import type { Trip, DossierResponse, MobilityStrategyResponse, BudgetResponse, TripChecklistItem, ItineraryDay } from '../types'
import { yatoApi } from '../yatoApi'
import { fmtRange, daysBetween, todayLocalISO, fmtBRfull, money, DOW, parseLocalDate } from '../dateUtils'
import { TripCard, PROFILE_LABEL, PROFILE_CLASS } from '../components/TripCard'
import { ReadinessMeter, ReadinessLine, checkedCount, pendingCount } from '../components/ReadinessMeter'
import { ItineraryItemRow } from '../components/ItineraryItem'
import { Icon } from '../components/Icon'
import { STRATEGY_LABEL } from '../steps'

interface HomeScreenProps {
  activeTrip: Trip | null
  otherTrips: Trip[]
  onNav: (view: string, param?: string) => void
  onNewTrip: () => void
}

export function HomeScreen({ activeTrip, otherTrips, onNav, onNewTrip }: HomeScreenProps) {
  const [dossier, setDossier] = useState<DossierResponse | null>(null)
  const [strategy, setStrategy] = useState<MobilityStrategyResponse | null>(null)
  const [budget, setBudget] = useState<BudgetResponse | null>(null)
  const [pendingItems, setPendingItems] = useState<TripChecklistItem[]>([])
  const [checklistTotal, setChecklistTotal] = useState(0)
  const [checklistDone, setChecklistDone] = useState(0)
  const [day1, setDay1] = useState<ItineraryDay | null>(null)

  useEffect(() => {
    if (!activeTrip) { setDossier(null); setStrategy(null); setBudget(null); setPendingItems([]); setDay1(null); return }
    yatoApi.getDossier(activeTrip.state_uf, activeTrip.city).then(setDossier).catch(() => setDossier(null))
    yatoApi.getStrategy(activeTrip.state_uf, activeTrip.city).then(setStrategy).catch(() => setStrategy(null))
    yatoApi.getBudget(activeTrip.id).then(setBudget).catch(() => setBudget(null))
    yatoApi.listChecklist(activeTrip.id).then(res => {
      setChecklistTotal(res.items.length)
      setChecklistDone(res.items.filter(i => i.done).length)
      setPendingItems(res.items.filter(i => !i.done).slice(0, 5))
    }).catch(() => { setChecklistTotal(0); setChecklistDone(0); setPendingItems([]) })
    yatoApi.listItinerary(activeTrip.id).then(res => setDay1(res.days[0] || null)).catch(() => setDay1(null))
  }, [activeTrip])

  if (!activeTrip) {
    return (
      <div className="page">
        <div className="card empty" style={{ marginTop: 40 }}>
          <span className="e-emoji">🎒</span>
          <span className="e-txt">Nenhuma viagem no horizonte. Cinco ienes e eu te levo pra qualquer lugar.</span>
          <button className="btn btn-primary" onClick={onNewTrip}><Icon name="plus" /> Nova viagem</button>
        </div>
      </div>
    )
  }

  const cd = daysBetween(todayLocalISO(), activeTrip.start_date)
  const strat = (strategy?.strategy && STRATEGY_LABEL[strategy.strategy]) || { txt: 'a definir', emoji: '•' }
  const checks = dossier?.checks
  const pctChk = checklistTotal ? Math.round((checklistDone / checklistTotal) * 100) : 0
  const totEst = budget?.total_estimated ?? 0
  const totAct = budget?.total_actual ?? 0
  const saldo = budget?.total_balance ?? 0
  const overCategory = budget?.items.find(i => i.over_budget)

  return (
    <div className="page">
      {/* ── HERO ── */}
      <div className="hero">
        <div className="hero-tex" />
        <div className="hero-inner">
          <div className="hero-copy">
            <div className="hero-eyebrow">caderno de bordo · próxima viagem</div>
            <h1 className="hero-city">{activeTrip.city}<span className="hc-uf">/{activeTrip.state_uf}</span></h1>
            <div className="hero-meta">
              <span>{fmtRange(activeTrip.start_date, activeTrip.end_date)}</span>
              <span className="sep" />
              <span>{daysBetween(activeTrip.start_date, activeTrip.end_date) + 1} dias</span>
              <span className="sep" />
              <span className={'chip chip-static ' + PROFILE_CLASS[activeTrip.profile]}>{PROFILE_LABEL[activeTrip.profile]}</span>
              {cd >= 0 && <span className="hero-count">{cd > 0 ? `faltam ${cd} dias` : 'é hoje'}</span>}
            </div>
            <p className="hero-quote">
              {dossier ? (dossier.dossier.summary || 'Protocolo em andamento — melhor saber como se locomover antes de comprar tudo.')
                       : 'Ainda não abri o dossiê dessa cidade. Cinco ienes e eu resolvo isso.'}
            </p>
            <div className="hero-cta">
              <button className="btn btn-primary" onClick={() => onNav('mobility')}>
                <Icon name="carimbo" /> Abrir dossiê
              </button>
              <button className="btn btn-kraft" onClick={() => onNav('trip', activeTrip.id)}>
                <Icon name="rota" /> Ver roteiro
              </button>
            </div>
          </div>
          <div className="hero-right">
            <div className="hero-ready">
              <div className="hr-k">prontidão do protocolo</div>
              <div className="hr-v">{checkedCount(checks)}<span style={{ fontSize: 15, color: 'var(--ink-3)' }}>/7</span></div>
              <ReadinessMeter checks={checks} size="lg" />
              <div className="hr-sub">checklist {pctChk}% · {pendingCount(checks)} passo pendente</div>
            </div>
            <div className="hero-portrait">
              <div className="halo" />
              <img src="/yato.png" alt="Yato" />
            </div>
          </div>
        </div>
      </div>

      {/* ── 3 painéis ── */}
      <div className="tri-grid">
        <div className="card panel">
          <div className="panel-head">
            <span className="panel-title">Estratégia de mobilidade</span>
            <button className="panel-link" onClick={() => onNav('mobility')}>abrir dossiê →</button>
          </div>
          <div className="strategy-big"><span className="strategy-emoji">{strat.emoji}</span>{strat.txt}</div>
          <ReadinessLine checks={checks} onClick={() => onNav('mobility')} />
          <p style={{ fontSize: 12.5, color: 'var(--ink-2)', textWrap: 'pretty' }}>
            {strategy?.rationale || dossier?.dossier.summary || 'Ainda não checamos nada dessa cidade. Vamos por partes.'}
          </p>
        </div>

        <div className="card panel">
          <div className="panel-head">
            <span className="panel-title">Orçamento</span>
            <button className="panel-link" onClick={() => onNav('budget')}>detalhar →</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'var(--display)', fontSize: 24, fontWeight: 700, whiteSpace: 'nowrap' }}>{money(totAct)}</span>
            <span className="dim mono" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>de {money(totEst)}</span>
          </div>
          <div className="prog-wide"><i style={{ width: (totEst ? Math.min(100, (totAct / totEst) * 100) : 0) + '%' }} /></div>
          <div className="kv"><span className="k">saldo</span>
            <span className="mono" style={{ color: saldo < 0 ? 'var(--budget-over)' : 'var(--budget-ok)', fontWeight: 600 }}>{money(saldo)}</span>
          </div>
          {overCategory && (
            <div className="kv"><span className="k">estouro</span><span>{overCategory.category} passou {money(overCategory.actual - overCategory.estimated)}</span></div>
          )}
        </div>

        <div className="card panel">
          <div className="panel-head">
            <span className="panel-title">Próximas pendências</span>
            <button className="panel-link" onClick={() => onNav('checklist')}>checklist →</button>
          </div>
          <div className="pend-list">
            {pendingItems.length === 0 && <span className="dim" style={{ fontSize: 12.5 }}>checklist zerado — pode embarcar.</span>}
            {pendingItems.map(c => (
              <div className="pend-row" key={c.id}>
                <span className="fb-box" />
                <span>{c.label}</span>
              </div>
            ))}
          </div>
          <div className="kv" style={{ marginTop: 'auto' }}><span className="k">feitos</span><span>{checklistDone} de {checklistTotal}</span></div>
        </div>
      </div>

      {/* ── dia 1 ── */}
      {day1 && day1.items.length > 0 && (
        <div className="section">
          <div className="section-head">
            <h2 className="section-title">Linha do tempo do dia 1</h2>
            <span className="section-sub">{fmtBRfull(day1.day_date)} · {DOW[parseLocalDate(day1.day_date).getDay()]}</span>
            <button className="section-link" onClick={() => onNav('trip', activeTrip.id)}>roteiro completo →</button>
          </div>
          <div className="card" style={{ padding: '10px 16px' }}>
            {day1.items.map((it, i) => (
              <ItineraryItemRow key={it.id} item={it} seam={i < day1.items.length - 1} />
            ))}
          </div>
        </div>
      )}

      {/* ── outras viagens ── */}
      {otherTrips.length > 0 && (
        <div className="section">
          <div className="section-head">
            <h2 className="section-title">Outras viagens</h2>
            <button className="section-link" onClick={() => onNav('trips')}>ver todas →</button>
          </div>
          <div className="trips-grid">
            {otherTrips.map(t => <TripCard key={t.id} trip={t} onClick={() => onNav('trip', t.id)} />)}
          </div>
        </div>
      )}
    </div>
  )
}
