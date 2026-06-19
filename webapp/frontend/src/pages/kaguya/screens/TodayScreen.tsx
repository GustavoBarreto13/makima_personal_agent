// TodayScreen — Meu Dia (Fase 3 / fatia 016).
// Substitui a versão MVP simples ("Hoje + Vencidas").
// Ritual: hero → pendências de ontem → plano de hoje → sugestões | capacity + timeline.
//
// DnD via @dnd-kit (migrado do HTML5 nativo):
//   • DndContext aqui (pai): cobre tanto os PlanCards (fontes de drag) quanto
//     a DayTimeline (zona de drop), que ficam em colunas separadas do grid.
//   • onDragEnd: constrói start_at no fuso local + optimistic update + reload silencioso.
//   • PlanCard usa useDraggable; DayTimeline usa useDroppable por hora.
//   • Conserta o bug anterior: o arrasto não funcionava pois onDragStart não era
//     passado ao PlanCard (o dataTransfer ficava vazio). Com @dnd-kit, active.id
//     resolve o id diretamente, sem prop extra.

import { useEffect, useState, useCallback } from 'react'
import type { Task, Project, MyDayResponse } from '../types'
import { kaguyaApi } from '../kaguyaApi'
import { QuickAdd } from '../components/QuickAdd'
import { DayHero } from '../components/DayHero'
import { ReviewCard } from '../components/ReviewCard'
import { PlanCard } from '../components/PlanCard'
import { CapacityBar } from '../components/CapacityBar'
import { DayTimeline } from '../components/DayTimeline'
import {
  DndContext,
  DragOverlay,
  closestCenter,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
// Sensor centralizado (PointerSensor 5px) compartilhado com Kanban, Eisenhower e Lista.
import { useDndSensors } from '../lib/dnd'

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
  // loading: só true no 1º carregamento. Soltar um card NÃO ativa o spinner.
  const [loading, setLoading] = useState(true)
  // activeId: id do card de plano em arraste (null = nenhum drag ativo).
  const [activeId, setActiveId] = useState<number | null>(null)

  // Sensor centralizado: PointerSensor com 5px de ativação.
  const sensors = useDndSensors()

  // Carrega (ou recarrega) o Meu Dia.
  // O parâmetro `silent` evita piscar o "Carregando…" após um drop:
  //   - false (padrão): mostra o spinner (1º carregamento ou reloadKey).
  //   - true           : re-busca em background, sem alterar `loading`.
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const r = await kaguyaApi.myDay()
      setData(r)
    } catch {
      toast('Falha ao carregar o Meu Dia.', 'err')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [toast])

  useEffect(() => { load() }, [load, reloadKey])

  // ── Handlers de DnD ──────────────────────────────────────────────────────────
  // IMPORTANTE: todos os hooks (useCallback) precisam ser declarados ANTES de qualquer
  // early return, ou o React lança "Rendered more hooks than during the previous render"
  // (Rules of Hooks: sempre o mesmo número e ordem de hooks por render).

  // Início do drag: registra qual PlanCard está no cursor.
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as number)
  }, [])

  // Fim do drag: constrói start_at, aplica optimistic update e persiste via API.
  // Acessa `data` via closure — o useCallback captura o valor mais recente de `data`
  // porque `data` está listado nas dependências.
  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event

    // Limpa o estado de drag.
    setActiveId(null)

    // Sem destino válido (solto fora de qualquer HourSlot) → cancela.
    if (!over) return

    const taskId  = active.id as number
    // Lê o plano atual do `data` (não da variável `plano` que só existe após o early return).
    const planoAtual = data?.plano ?? []
    const task    = planoAtual.find(t => t.id === taskId)
    if (!task) return

    // O id do droppable tem o formato "hour:<h>" (definido em DayTimeline → HourSlot).
    if (typeof over.id !== 'string' || !over.id.startsWith('hour:')) return
    const hour = parseInt(over.id.replace('hour:', ''), 10)
    if (isNaN(hour)) return

    // ── Construção do start_at no fuso local ────────────────────────────────
    // Usamos as partes locais da data de hoje para montar o horário correto em UTC-3.
    // Nunca usamos toISOString() diretamente — ela retorna UTC e pode gerar o dia errado
    // após as 21h local (bug de fuso documentado no CLAUDE.md do projeto).
    const today = new Date()
    today.setHours(hour, 0, 0, 0)
    const offset = -today.getTimezoneOffset()
    const sign   = offset >= 0 ? '+' : '-'
    const hh     = String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0')
    const mm     = String(Math.abs(offset) % 60).padStart(2, '0')
    const startAt = today.toISOString().slice(0, 16) + `:00${sign}${hh}:${mm}`

    // ── Optimistic update ───────────────────────────────────────────────────
    // 1. Salva snapshot para rollback em caso de erro de rede.
    const snapshot = data ? { ...data, plano: [...planoAtual] } : null

    // 2. Aplica o start_at localmente: o bloco aparece na timeline IMEDIATAMENTE.
    setData(prev => {
      if (!prev) return prev
      return {
        ...prev,
        plano: prev.plano.map(t =>
          t.id === taskId ? { ...t, start_at: startAt } : t
        ),
      }
    })

    try {
      // 3. Persiste no backend (POST /api/tasks/{id}/time-block).
      await kaguyaApi.setTimeBlock(task.id, {
        start_at: startAt,
        duration_min: task.duration_min || 30,
      })
      toast(`${task.title.slice(0, 30)} bloqueada às ${hour}h.`)
      // 4. Reload silencioso: sincroniza com o estado real sem piscar o spinner.
      load(true)
    } catch {
      // 5. Rollback: restaura o estado anterior ao drag.
      if (snapshot) setData(snapshot)
      toast('Não foi possível bloquear o horário.', 'err')
    }
  }, [data, load, toast])

  // Spinner apenas no 1º carregamento — early return DEPOIS de todos os hooks.
  if (loading) return <div className="kg-page"><div className="kg-empty">Carregando…</div></div>

  const plano      = data?.plano ?? []
  const pendencias = data?.pendencias_ontem ?? []
  const sugestoes  = data?.sugestoes ?? []
  const capacity   = data?.capacity ?? EMPTY_CAP

  // Tarefa ativa no drag (para o DragOverlay seguir o cursor).
  const activeTask = activeId != null ? plano.find(t => t.id === activeId) ?? null : null

  return (
    // DndContext: cobre TODA a tela (colunas esquerda e direita).
    // É necessário estar no nível do grid porque os PlanCards (coluna esq.)
    // são arrastados para a DayTimeline (coluna dir.).
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
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
                    // isBeingDragged: este card está no cursor → slot original fica semi-transparente.
                    isBeingDragged={activeId === t.id}
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
            {/* DayTimeline usa HourSlots droppables; lógica de drop está no onDragEnd acima. */}
            <DayTimeline plano={plano} onChanged={load} onOpen={onOpenTask} toast={toast} />
          </div>
        </div>
      </div>

      {/* DragOverlay: cópia do PlanCard que segue o cursor durante o drag.
          dropAnimation={null} = sem animação de "retorno" ao soltar. */}
      <DragOverlay dropAnimation={null}>
        {activeTask ? (
          <div className="kg-drag-overlay">
            <PlanCard
              task={activeTask}
              onChanged={load}
              onOpen={onOpenTask}
              toast={toast}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
