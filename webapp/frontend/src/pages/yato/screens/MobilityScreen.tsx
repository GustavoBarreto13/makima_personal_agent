/**
 * MobilityScreen.tsx — Yato · Viagens (fatia 066)
 *
 * O dossiê de mobilidade completo (⭐ MobilityDossier) + coluna lateral com
 * estratégia recomendada e apps regionais sugeridos. Sem "contatos locais" —
 * a spec/schema não tem essa entidade (nada de inventar dado que a tool não
 * devolve).
 */

import { useEffect, useState } from 'react'
import type { Trip, DossierResponse, MobilityStrategyResponse, MobilityApp, CheckKey } from '../types'
import { yatoApi } from '../yatoApi'
import { MobilityDossier } from '../components/MobilityDossier'
import { AppSuggestionCard } from '../components/AppSuggestionCard'
import { STRATEGY_LABEL } from '../steps'

interface MobilityScreenProps {
  activeTrip: Trip | null
  onCheck: (uf: string, city: string, key: CheckKey) => void
  onStart: (uf: string, city: string) => void
  reloadKey: number
}

export function MobilityScreen({ activeTrip, onCheck, onStart, reloadKey }: MobilityScreenProps) {
  const [city, setCity] = useState(activeTrip?.city || '')
  const [uf, setUf] = useState(activeTrip?.state_uf || '')
  const [dossier, setDossier] = useState<DossierResponse | null>(null)
  const [strategy, setStrategy] = useState<MobilityStrategyResponse | null>(null)
  const [apps, setApps] = useState<MobilityApp[]>([])

  useEffect(() => {
    if (activeTrip) { setCity(activeTrip.city); setUf(activeTrip.state_uf) }
  }, [activeTrip?.id])

  const load = () => {
    if (!city.trim() || !uf) { setDossier(null); setStrategy(null); setApps([]); return }
    yatoApi.getDossier(uf, city).then(setDossier).catch(() => setDossier(null))
    yatoApi.getStrategy(uf, city).then(setStrategy).catch(() => setStrategy(null))
    yatoApi.suggestApps({ uf, city }).then(res => setApps(res.apps)).catch(() => setApps([]))
  }

  useEffect(load, [city, uf, reloadKey])

  const strat = (strategy?.strategy && STRATEGY_LABEL[strategy.strategy]) || { txt: 'a definir', emoji: '•' }

  return (
    <div className="page">
      <div className="section-head" style={{ marginTop: 4 }}>
        <h2 className="section-title">Dossiê de mobilidade</h2>
        <span className="section-sub">o protocolo dos 7 passos</span>
        <div className="filters" style={{ marginLeft: 'auto' }}>
          <input className="inp" style={{ width: 140 }} placeholder="cidade" value={city} onChange={e => setCity(e.target.value)} />
          <input className="inp" style={{ width: 56 }} placeholder="UF" maxLength={2} value={uf}
                 onChange={e => setUf(e.target.value.toUpperCase())} />
        </div>
      </div>

      <div className="dos-layout">
        <MobilityDossier
          data={dossier}
          strategy={strategy}
          onCheck={key => city.trim() && uf && onCheck(uf, city, key)}
          onStart={() => city.trim() && uf && onStart(uf, city)}
        />

        <div className="stack">
          <div className="card panel">
            <div className="panel-head"><span className="panel-title">Estratégia recomendada</span></div>
            <div className="strategy-big"><span className="strategy-emoji">{strat.emoji}</span>{strat.txt}</div>
            {dossier
              ? <p style={{ fontSize: 12.5, color: 'var(--ink-2)', textWrap: 'pretty' }}>
                  {(strategy?.pending_checks?.length ?? 0) > 0
                    ? `Ainda com ${strategy?.pending_checks.length} passo pendente — trato isso como hipótese, não como resposta.`
                    : 'Protocolo fechado. Pode confiar nisso.'}
                </p>
              : <p style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>Sem dossiê, sem estratégia. Não invento o que não checei.</p>}
          </div>

          <div className="card panel">
            <div className="panel-head">
              <span className="panel-title">Apps sugeridos</span>
              {uf && <span className="dim mono" style={{ fontSize: 10.5, marginLeft: 'auto' }}>{uf}</span>}
            </div>
            <div className="stack">
              {apps.length === 0 && <span className="dim" style={{ fontSize: 12.5 }}>Informe cidade e UF para ver sugestões.</span>}
              {apps.map(a => <AppSuggestionCard key={a.name} app={a} />)}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
