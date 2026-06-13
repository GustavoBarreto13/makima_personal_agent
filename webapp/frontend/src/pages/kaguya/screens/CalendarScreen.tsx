// CalendarScreen (CalendarPro) — orquestra as três visões do Calendar Hub (fatia 019, T014).
// Substitui a tela de calendário anterior (013) por uma que delega para subcomponentes
// especializados: CalNavBar (navegação), TimeGrid (dia/semana), MonthGrid (mês) e CalendarsAside.
//
// Fluxo principal:
//   1. Estado: view (dia/semana/mês), refDate (data âncora), tasks (tarefas carregadas)
//   2. useMemo calcula a janela visível (windowStart, windowEnd, days) a partir de view+refDate
//   3. useEffect chama kaguyaApi.calendar() sempre que a janela muda ou reloadKey muda
//   4. tasks são mapeadas para CalEvent[] (formato normalizado dos subcomponentes)
//   5. Renderiza CalNavBar + (TimeGrid OU MonthGrid) + CalendarsAside lado a lado

import { useEffect, useMemo, useState } from 'react'
import type { Task, CalEvent } from '../types'
import { kaguyaApi } from '../kaguyaApi'
import { CalNavBar } from '../components/CalNavBar'
import { TimeGrid } from '../components/TimeGrid'
import { MonthGrid } from '../components/MonthGrid'
import { CalendarsAside } from '../components/CalendarsAside'

// ── Props ────────────────────────────────────────────────────────────────────

// Interface idêntica à CalendarScreen anterior — KaguyaShell não precisa mudar.
interface CalendarProProps {
  // Incrementado pelo Shell quando uma tarefa é criada/editada fora deste componente;
  // dispara o recarregamento das tarefas.
  reloadKey: number
  // Callback para abrir o TaskModal quando o usuário clica numa tarefa.
  onOpenTask: (task: Task) => void
  // Callback para exibir uma notificação toast (sucesso ou erro).
  toast: (msg: string, kind?: 'ok' | 'err') => void
}

// ── Helpers de data ──────────────────────────────────────────────────────────

// Formata uma Date local como "AAAA-MM-DD" sem converter para UTC.
// Usar a data local evita que datas próximas à meia-noite sejam empurradas para o dia anterior.
function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Retorna uma nova Date com `n` dias somados (sem mutar a original).
function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

// ── Componente ───────────────────────────────────────────────────────────────

// Exporta com o mesmo nome anterior (CalendarScreen) para que KaguyaShell.tsx
// não precise mudar nenhuma linha de import.
export function CalendarScreen({ reloadKey, onOpenTask, toast }: CalendarProProps) {
  // Visão ativa: "day" = grade de 24h com 1 coluna; "week" = 7 colunas; "month" = grade 6×7
  const [view, setView] = useState<'day' | 'week' | 'month'>('week')

  // Data âncora: qualquer dia dentro do período visível; navegar muda este valor.
  const [refDate, setRefDate] = useState<Date>(() => new Date())

  // Tarefas carregadas da API para a janela visível atual.
  const [tasks, setTasks] = useState<Task[]>([])

  // Indica se o carregamento inicial ainda está em curso.
  const [loading, setLoading] = useState(true)

  // Controla a visibilidade da dica de uso mostrada por ~4,2 s no primeiro render.
  const [hintVisible, setHintVisible] = useState(false)

  // ── Janela visível ────────────────────────────────────────────────────────

  // Calcula windowStart, windowEnd (strings ISO para a API) e days (strings ISO das colunas
  // para TimeGrid). O cálculo é derivado de view + refDate, sem efeito colateral.
  const { windowStart, windowEnd, days } = useMemo(() => {
    if (view === 'day') {
      // Dia: janela de 1 único dia; days tem exatamente 1 elemento.
      const iso = toISO(refDate)
      return { windowStart: iso, windowEnd: iso, days: [iso] }
    }

    if (view === 'week') {
      // Semana: de domingo (dow=0) até sábado (dow=6) da semana que contém refDate.
      const sunday = addDays(refDate, -refDate.getDay())
      const dayList = Array.from({ length: 7 }, (_, i) => toISO(addDays(sunday, i)))
      return { windowStart: dayList[0], windowEnd: dayList[6], days: dayList }
    }

    // Mês: grade de 42 células (6 semanas) a partir do domingo da semana que contém o dia 1.
    // Isso garante que o primeiro dia do mês nunca fique no meio da grade.
    const firstOfMonth = new Date(refDate.getFullYear(), refDate.getMonth(), 1)
    const gridStart = addDays(firstOfMonth, -firstOfMonth.getDay())
    const dayList = Array.from({ length: 42 }, (_, i) => toISO(addDays(gridStart, i)))
    return { windowStart: dayList[0], windowEnd: dayList[41], days: dayList }
  }, [view, refDate])

  // ── Carregamento das tarefas ──────────────────────────────────────────────

  // Re-busca sempre que a janela muda (navegação) ou reloadKey é incrementado (edição externa).
  useEffect(() => {
    let cancelled = false   // evita atualizar state se o componente foi desmontado antes

    const load = async () => {
      setLoading(true)
      try {
        // kaguyaApi.calendar retorna Task[] com ocorrências virtuais de recorrentes expandidas.
        const result = await kaguyaApi.calendar(windowStart, windowEnd)
        if (!cancelled) setTasks(result)
      } catch {
        if (!cancelled) toast('Falha ao carregar o calendário.', 'err')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [windowStart, windowEnd, reloadKey, toast])

  // ── Dica de uso (hint) ────────────────────────────────────────────────────

  // Exibe a dica na primeira montagem e a esconde após 4,2 s.
  useEffect(() => {
    setHintVisible(true)
    const t = setTimeout(() => setHintVisible(false), 4200)
    return () => clearTimeout(t)
  }, [])   // [] = só roda na montagem; nunca mais

  // ── Mapeamento Task → CalEvent ────────────────────────────────────────────

  // Converte uma Task para o formato normalizado CalEvent usado pelos subcomponentes.
  // Retorna null se a tarefa não tiver data suficiente para posicionar no calendário.
  function taskToCalEvent(t: Task): CalEvent | null {
    if (t.start_at) {
      // Tarefa com horário de início: evento temporizado (allDay=false).
      // O dia é extraído do start_at (primeiro 10 caracteres = "AAAA-MM-DD").
      return {
        id: String(t.id),
        cal: 'kaguya',           // identifica a origem para resolução de cor
        day: t.start_at.slice(0, 10),
        start: t.start_at,
        end: t.end_at ?? null,
        allDay: false,
        color: null,             // usa a cor padrão do calendário "kaguya"
        kind: 'task',
        title: t.title,
        taskId: t.id,            // permite abrir o TaskModal ao clicar
      }
    }

    if (t.due_date) {
      // Tarefa com só due_date: evento de dia inteiro (allDay=true).
      return {
        id: String(t.id),
        cal: 'kaguya',
        day: t.due_date,
        start: null,
        end: null,
        allDay: true,
        color: null,
        kind: 'task',
        title: t.title,
        taskId: t.id,
      }
    }

    // Sem data alguma: não exibir no calendário.
    return null
  }

  // Aplica o mapeamento em todas as tasks e remove os nulos (tarefas sem data).
  const calEvents: CalEvent[] = useMemo(
    () => tasks.flatMap((t) => { const e = taskToCalEvent(t); return e ? [e] : [] }),
    [tasks],
  )

  // ── Navegação ─────────────────────────────────────────────────────────────

  // Avança (+1) ou recua (-1) no período atual: 1 dia, 7 dias ou 1 mês.
  const handleNav = (delta: 1 | -1) => {
    setRefDate((prev) => {
      if (view === 'day') return addDays(prev, delta)
      if (view === 'week') return addDays(prev, delta * 7)
      // Mês: soma/subtrai 1 mês preservando o dia (ou o último dia do mês destino).
      const m = new Date(prev)
      m.setMonth(m.getMonth() + delta)
      return m
    })
  }

  // Volta o período para o dia de hoje.
  const handleToday = () => setRefDate(new Date())

  // ── Clique em evento ──────────────────────────────────────────────────────

  // Ao clicar num evento do grid:
  // - Se for uma tarefa Kaguya: abre o TaskModal.
  // - Se tiver deepLink (cross-agent): navega para aquela rota.
  const handleEventClick = (ev: CalEvent) => {
    if (ev.taskId) {
      const t = tasks.find((t) => t.id === ev.taskId)
      if (t) onOpenTask(t)
    } else if (ev.deepLink) {
      window.location.href = ev.deepLink
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    // Container raiz ocupa 100% da altura disponível e empilha verticalmente:
    // CalNavBar (topo fixo) → conteúdo (flex: 1, overflow oculto) → hint (rodapé)
    <div className="calx" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Barra de navegação: título, alternador Dia/Semana/Mês, botões ‹ Hoje › */}
      <CalNavBar
        view={view}
        refDate={refDate}
        onViewChange={setView}
        onNav={handleNav}
        onToday={handleToday}
      />

      {/* Área de conteúdo: grid principal à esquerda + sidebar de calendários à direita */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Coluna do grid: cresce para preencher o espaço restante */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

          {/* Indicador de carregamento — exibido apenas enquanto a API responde */}
          {loading && (
            <div style={{ padding: 16, color: 'var(--ink-4)', fontSize: 13 }}>
              Carregando…
            </div>
          )}

          {/* Grid do período: MonthGrid para mês, TimeGrid para dia/semana */}
          {!loading && (view === 'month'
            ? (
              // MonthGrid: grade 6×7; clicar num dia muda para a view de dia naquela data.
              <MonthGrid
                refDate={refDate}
                events={calEvents}
                cals={[]}   // calendários carregados na T022; por ora vazio
                onDayClick={(d) => {
                  // Seta refDate como meio-dia para evitar problemas de fuso horário
                  setRefDate(new Date(d + 'T12:00:00'))
                  setView('day')
                }}
              />
            )
            : (
              // TimeGrid: colunas de 24h; `days` tem 1 (dia) ou 7 (semana) strings ISO
              <TimeGrid
                days={days}
                events={calEvents}
                cals={[]}   // calendários carregados na T022
                onEventClick={handleEventClick}
              />
            )
          )}
        </div>

        {/* Sidebar direita: mini-calendário de navegação + lista de fontes (placeholder T022) */}
        <CalendarsAside
          refDate={refDate}
          selectedDate={toISO(refDate)}
          onDayClick={(d) => {
            // Clicar no mini-mês move o calendário principal para aquela data
            setRefDate(new Date(d + 'T12:00:00'))
          }}
        />
      </div>

      {/* Dica de uso: aparece na montagem e some após 4,2 s via CSS transition.
          A classe "visible" controla o opacity (definida em kaguya.css). */}
      <div className={`cal-hint${hintVisible ? ' visible' : ''}`}>
        Clique em um horário vazio para criar • Arraste para mover
      </div>
    </div>
  )
}
