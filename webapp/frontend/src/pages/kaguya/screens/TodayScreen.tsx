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

import { useEffect, useRef, useState, useCallback } from 'react'
import type { Task, Project, MyDayResponse, Calendar, ExperimentDue } from '../types'
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
// Helpers canônicos de data (nunca toISOString — usa partes locais do navegador).
import { toISO, localISO, todayISO } from '../lib/dateUtils'
import { Icon } from '../ui/Icons'

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
  // gcalSources: fontes do Google Calendar (gcal:*) com visibilidade/cor do usuário.
  // Compartilham calendar_prefs com a tela de Calendário — toggle aqui reflete lá.
  const [gcalSources, setGcalSources] = useState<Calendar[]>([])
  // dueExperiments: experimentos ativos do dia sem check-in (US3, spec 029). Seção desacoplada
  // — não passa pelo motor de capacity/plan_my_day; some da lista após o check-in de 1 toque.
  const [dueExperiments, setDueExperiments] = useState<ExperimentDue[]>([])

  // Sensor centralizado: PointerSensor com 5px de ativação.
  const sensors = useDndSensors()

  // Carrega os "experimentos de hoje" no mount e a cada bump do reloadKey. Silencioso em falha.
  const loadDue = useCallback(async () => {
    try { setDueExperiments(await kaguyaApi.experiments.dueToday()) }
    catch { /* sem experimentos ou falha — seção some */ setDueExperiments([]) }
  }, [])
  useEffect(() => { loadDue() }, [loadDue, reloadKey])

  // Check-in de 1 toque de um experimento (fez = sim, hoje). Some da seção ao registrar.
  const checkinExperiment = async (id: number) => {
    try {
      await kaguyaApi.experiments.log(id, { period_date: todayISO(), done: true })
      toast('Experimento registrado.')
      loadDue()
    } catch { toast('Não foi possível registrar o experimento.', 'err') }
  }

  // firstLoad: verdadeiro apenas no mount. Controla se o load mostra o spinner.
  // Usando ref (não state) para não causar re-render ao setar.
  const firstLoad = useRef(true)

  // Carrega as fontes do Google Calendar no mount para popular o toggle da timeline.
  // Silencioso em caso de falha (Google pode não estar configurado).
  useEffect(() => {
    kaguyaApi.calendarSources()
      .then((sources) => {
        setGcalSources(sources.filter((s) => s.id.startsWith('gcal:')))
      })
      .catch(() => { /* sem credencial gcal — lista vazia, toggle não aparece */ })
  }, [])

  // Carrega (ou recarrega) o Meu Dia.
  // O parâmetro `silent` evita piscar o "Carregando…":
  //   - false: mostra o spinner (só no mount).
  //   - true : re-busca em background (após drag, modal salvo, reloadKey bump).
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

  // Spinner só no mount; bumps de reloadKey (incluindo os vindos do onChanged após
  // um drop) são sempre silenciosos — nunca piscam o "Carregando…" na tela.
  useEffect(() => {
    const silent = !firstLoad.current
    firstLoad.current = false
    load(silent)
  }, [load, reloadKey])

  // ── Handler de toggle de calendário na timeline ──────────────────────────────
  // Liga/desliga a visibilidade de um calendário Google na timeline do Meu Dia.
  // Usa as mesmas calendar_prefs da CalendarScreen — toggle aqui reflete lá e vice-versa.
  const handleToggleCalendar = useCallback(async (sourceId: string, visible: boolean) => {
    // Optimistic update: reflete imediatamente no toggle sem esperar o servidor
    setGcalSources((prev) =>
      prev.map((s) => s.id === sourceId ? { ...s, visible } : s)
    )
    try {
      await kaguyaApi.setCalendarPref(sourceId, { visible })
      // Reload silencioso: backend recomputa eventos + capacity com a nova pref
      load(true)
    } catch {
      // Rollback em caso de erro de rede
      setGcalSources((prev) =>
        prev.map((s) => s.id === sourceId ? { ...s, visible: !visible } : s)
      )
    }
  }, [load])

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
    // `localISO` (lib/dateUtils) monta a string sem passar por toISOString() — ver
    // comentário no helper para entender por que isso é necessário (fuso UTC-3).
    const today = new Date()
    const startAt = localISO(toISO(today), hour * 60)  // hour * 60 = minuto do dia

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

            {/* Experimentos de hoje (US3 — só se houver algum ativo pendente no período) */}
            {dueExperiments.length > 0 && (
              <div className="kg-day-section">
                <div className="kg-day-section-head">
                  🧪 Experimentos de hoje ({dueExperiments.length})
                </div>
                <div className="kg-exp-due-list">
                  {dueExperiments.map((exp) => (
                    <div key={exp.id} className="kg-exp-due-row">
                      <span className="kg-exp-due-title">{exp.title}</span>
                      <span className="kg-exp-due-cadence">{exp.cadence === 'weekly' ? 'semanal' : 'diário'}</span>
                      <button className="kg-checkbtn" onClick={() => checkinExperiment(exp.id)}>
                        <Icon name="check" size={15} /> Fiz
                      </button>
                    </div>
                  ))}
                </div>
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
            {/* DayTimeline usa HourSlots droppables; lógica de drop está no onDragEnd acima.
                eventos + sources: Google Calendar do dia, já filtrados por visibilidade.
                onToggleCalendar: persiste pref e dispara reload silencioso (via handleToggleCalendar). */}
            <DayTimeline
              plano={plano}
              eventos={data?.eventos ?? []}
              sources={gcalSources}
              onToggleCalendar={handleToggleCalendar}
              onChanged={load}
              onOpen={onOpenTask}
              toast={toast}
            />
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
