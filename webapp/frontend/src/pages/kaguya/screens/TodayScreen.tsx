// TodayScreen — Meu Dia (Fase 3 / fatia 016).
// Substitui a versão MVP simples ("Hoje + Vencidas").
// Ritual: hero → pendências de ontem → plano de hoje → sugestões | capacity + timeline.

import { useEffect, useState, useCallback } from 'react'
import type { Task, Project, MyDayResponse } from '../types'
import { kaguyaApi } from '../kaguyaApi'
import { QuickAdd } from '../components/QuickAdd'
import { DayHero } from '../components/DayHero'
import { ReviewCard } from '../components/ReviewCard'
import { PlanCard } from '../components/PlanCard'
import { CapacityBar } from '../components/CapacityBar'
import { DayTimeline } from '../components/DayTimeline'

// Capacity vazia para o estado inicial (antes do fetch).
const EMPTY_CAP = {
  no_plano: 0, estimado_min: 0, agenda_min: 0,
  livre_min: 840, folga_min: 840, excedeu: false, calendar_ok: true,
}

interface TodayScreenProps {
  projects: Project[]
  reloadKey: number
  onChanged: () => void
  onOpenTask: (task: Task) => void
  toast: (msg: string, kind?: 'ok' | 'err') => void
}

export function TodayScreen({ projects, reloadKey, onChanged, onOpenTask, toast }: TodayScreenProps) {
  const [data, setData] = useState<MyDayResponse | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await kaguyaApi.myDay()
      setData(r)
    } catch {
      toast('Falha ao carregar o Meu Dia.', 'err')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { load() }, [load, reloadKey])

  if (loading) return <div className="kg-page"><div className="kg-empty">Carregando…</div></div>

  const plano = data?.plano ?? []
  const pendencias = data?.pendencias_ontem ?? []
  const sugestoes = data?.sugestoes ?? []
  const capacity = data?.capacity ?? EMPTY_CAP

  return (
    <div className="kg-page">
      {/* Hero: saudação + data + 3 stats + retrato */}
      <DayHero capacity={capacity} />

      {/* Layout de duas colunas */}
      <div className="kg-day-grid">
        {/* ── Coluna esquerda: ritual ── */}
        <div>
          {/* Pendências de ontem (só se houver) */}
          {pendencias.length > 0 && (
            <div className="kg-day-section">
              <div className="kg-day-section-head pending">
                ↩ Pendências de ontem ({pendencias.length})
              </div>
              {pendencias.map(t => (
                <ReviewCard key={t.id} task={t} onDone={load} toast={toast} />
              ))}
            </div>
          )}

          {/* Quick-add direto no Meu Dia */}
          <QuickAdd
            projects={projects}
            onCreated={async (id) => {
              // Adiciona automaticamente ao Meu Dia após criar.
              if (id) { try { await kaguyaApi.addToMyDay(id) } catch { /* silencioso */ } }
              load(); onChanged()
            }}
            toast={toast}
            placeholder="Adicionar ao dia…"
          />

          {/* Plano de hoje */}
          <div className="kg-day-section" style={{ marginTop: 16 }}>
            <div className="kg-day-section-head">
              📋 No plano de hoje ({plano.length})
            </div>
            {plano.length === 0 ? (
              <div className="kg-day-empty">Nada planejado ainda. Arraste sugestões ou adicione acima.</div>
            ) : (
              plano.map(t => (
                <PlanCard
                  key={t.id}
                  task={t}
                  onChanged={load}
                  onOpen={onOpenTask}
                  toast={toast}
                />
              ))
            )}
          </div>

          {/* Sugestões (vence em ≤7 dias, fora do plano) */}
          {sugestoes.length > 0 && (
            <div className="kg-day-section">
              <div className="kg-day-section-head">
                💡 Sugestões — vence em breve
              </div>
              {sugestoes.map(t => (
                <PlanCard
                  key={t.id}
                  task={t}
                  isSuggestion
                  onChanged={load}
                  onOpen={onOpenTask}
                  toast={toast}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Coluna direita: capacity + timeline (sticky) ── */}
        <div>
          <CapacityBar capacity={capacity} />
          <DayTimeline plano={plano} onChanged={load} onOpen={onOpenTask} toast={toast} />
        </div>
      </div>
    </div>
  )
}
