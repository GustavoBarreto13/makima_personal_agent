// CalendarScreen — view de calendário (fatia 013 / P3). Posiciona as tarefas datadas
// nos dias certos E projeta as próximas ocorrências das recorrentes (virtuais). Mês como
// view principal + alternância para semana. Navegar recalcula a janela (a projeção é
// sempre limitada ao período visível). Clicar num dia abre o detalhe do dia; clicar numa
// tarefa REAL abre o TaskModal (as virtuais são projeções, só leitura).

import { useEffect, useMemo, useState, useCallback } from 'react'
import type { Task } from '../types'
import { kaguyaApi } from '../kaguyaApi'
import { Icon } from '../ui/Icons'

interface CalendarScreenProps {
  reloadKey: number
  onOpenTask: (task: Task) => void
  toast: (msg: string, kind?: 'ok' | 'err') => void
}

// Nomes em pt-BR (o calendário começa no domingo, como é comum no Brasil).
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

// Formata uma Date local como "AAAA-MM-DD" (sem passar por UTC, que poderia trocar o dia).
function toISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

// Soma dias a uma Date (sem mutar a original).
function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

export function CalendarScreen({ reloadKey, onOpenTask, toast }: CalendarScreenProps) {
  const [mode, setMode] = useState<'month' | 'week'>('month')
  // `anchor` representa o período visível (qualquer dia dentro dele).
  const [anchor, setAnchor] = useState<Date>(() => new Date())
  const [items, setItems] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  // Calcula a grade de dias visível (e a janela [start, end] para a consulta).
  // Mês: 6 semanas (42 células) a partir do domingo da semana que contém o dia 1.
  // Semana: os 7 dias da semana que contém a âncora.
  const { days, windowStart, windowEnd, title } = useMemo(() => {
    if (mode === 'week') {
      const start = addDays(anchor, -anchor.getDay())     // domingo da semana
      const list = Array.from({ length: 7 }, (_, i) => addDays(start, i))
      const end = list[6]
      const t = `Semana de ${start.getDate()} ${MONTHS[start.getMonth()].slice(0, 3)} – ${end.getDate()} ${MONTHS[end.getMonth()].slice(0, 3)} ${end.getFullYear()}`
      return { days: list, windowStart: toISO(start), windowEnd: toISO(end), title: t }
    }
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
    const gridStart = addDays(first, -first.getDay())      // domingo antes/no dia 1
    const list = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
    return {
      days: list,
      windowStart: toISO(gridStart),
      windowEnd: toISO(list[41]),
      title: `${MONTHS[anchor.getMonth()]} de ${anchor.getFullYear()}`,
    }
  }, [anchor, mode])

  // Busca as tarefas/ocorrências da janela. Re-busca ao navegar (janela muda) ou após salvar.
  const load = useCallback(async () => {
    setLoading(true)
    try {
      setItems(await kaguyaApi.calendar(windowStart, windowEnd))
    } catch {
      toast('Falha ao carregar o calendário.', 'err')
    } finally {
      setLoading(false)
    }
  }, [windowStart, windowEnd, toast])

  useEffect(() => { load() }, [load, reloadKey])

  // Indexa as tarefas por dia (string ISO) para o lookup O(1) de cada célula.
  const byDay = useMemo(() => {
    const map: Record<string, Task[]> = {}
    for (const t of items) {
      if (!t.due_date) continue
      ;(map[t.due_date] ??= []).push(t)
    }
    return map
  }, [items])

  const todayISO = toISO(new Date())
  const currentMonth = anchor.getMonth()

  // Navegação: mês ⇄ mês (ou semana ⇄ semana); "hoje" volta ao período atual.
  const goPrev = () => setAnchor((a) => (mode === 'week' ? addDays(a, -7) : new Date(a.getFullYear(), a.getMonth() - 1, 1)))
  const goNext = () => setAnchor((a) => (mode === 'week' ? addDays(a, 7) : new Date(a.getFullYear(), a.getMonth() + 1, 1)))
  const goToday = () => { setAnchor(new Date()); setSelectedDay(toISO(new Date())) }

  // Uma "pílula" de tarefa dentro da célula do dia. Virtual = só leitura (projeção).
  const pill = (t: Task, key: string) => {
    const cls = `kg-cal-pill${t.is_virtual ? ' kg-cal-pill-virtual' : ''}${t.completed_at ? ' kg-cal-pill-done' : ''}`
    return (
      <button
        key={key}
        className={cls}
        title={t.is_virtual ? `${t.title} (ocorrência recorrente)` : t.title}
        onClick={(e) => { e.stopPropagation(); if (!t.is_virtual) onOpenTask(t) }}
      >
        {t.due_time && <span className="kg-cal-pill-time">{t.due_time}</span>}
        {t.title}
      </button>
    )
  }

  const selectedItems = selectedDay ? (byDay[selectedDay] ?? []) : []

  return (
    <div className="kg-page">
      {/* Cabeçalho: título do período + alternador mês/semana + navegação */}
      <div className="kg-cal-head">
        <h1 className="kg-page-title" style={{ margin: 0, textTransform: 'capitalize' }}>{title}</h1>
        <div className="kg-cal-controls">
          <div className="kg-segment" style={{ width: 150 }}>
            <button className={`kg-seg-opt${mode === 'month' ? ' active' : ''}`} onClick={() => setMode('month')}>Mês</button>
            <button className={`kg-seg-opt${mode === 'week' ? ' active' : ''}`} onClick={() => setMode('week')}>Semana</button>
          </div>
          <button className="kg-icon-btn" onClick={goPrev} aria-label="Anterior"><Icon name="back" size={16} /></button>
          <button className="kg-btn kg-btn-ghost" onClick={goToday}>Hoje</button>
          <button className="kg-icon-btn" onClick={goNext} aria-label="Próximo"><Icon name="chevron" size={16} /></button>
        </div>
      </div>

      {loading && <div className="kg-page-sub">Carregando…</div>}

      {/* Grade do calendário */}
      <div className={`kg-cal-grid${mode === 'week' ? ' kg-cal-week' : ''}`}>
        {WEEKDAYS.map((w) => <div key={w} className="kg-cal-weekday">{w}</div>)}
        {days.map((d) => {
          const iso = toISO(d)
          const dayItems = byDay[iso] ?? []
          const isOther = mode === 'month' && d.getMonth() !== currentMonth
          const cls = `kg-cal-cell${isOther ? ' kg-cal-other' : ''}${iso === todayISO ? ' kg-cal-today' : ''}${iso === selectedDay ? ' kg-cal-selected' : ''}`
          return (
            <div key={iso} className={cls} onClick={() => setSelectedDay(iso)}>
              <div className="kg-cal-daynum">{d.getDate()}</div>
              <div className="kg-cal-pills">
                {dayItems.slice(0, 3).map((t, idx) => pill(t, `${iso}-${t.id ?? 'v'}-${idx}`))}
                {dayItems.length > 3 && <span className="kg-cal-more">+{dayItems.length - 3}</span>}
              </div>
            </div>
          )
        })}
      </div>

      {/* Detalhe do dia selecionado (FR-016): lista as tarefas e abre uma tarefa real */}
      {selectedDay && (
        <div className="kg-cal-detail">
          <div className="kg-cal-detail-head">
            <strong>{selectedDay.split('-').reverse().join('/')}</strong>
            <button className="kg-icon-btn" onClick={() => setSelectedDay(null)} aria-label="Fechar"><Icon name="x" size={14} /></button>
          </div>
          {selectedItems.length === 0 ? (
            <div className="kg-empty" style={{ padding: 16 }}>Nenhuma tarefa neste dia.</div>
          ) : (
            <div className="kg-cal-detail-list">
              {selectedItems.map((t, idx) => (
                <button
                  key={`${t.id ?? 'v'}-${idx}`}
                  className={`kg-cal-detail-item${t.is_virtual ? ' kg-cal-pill-virtual' : ''}${t.completed_at ? ' kg-cal-pill-done' : ''}`}
                  onClick={() => { if (!t.is_virtual) onOpenTask(t) }}
                >
                  {t.due_time && <span className="kg-cal-pill-time">{t.due_time}</span>}
                  <span>{t.title}</span>
                  {t.is_virtual && <span className="kg-cal-recur"><Icon name="loop" size={12} /> recorrente</span>}
                  {t.project_name && <span className="kg-cal-detail-proj">{t.project_name}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
