// HabitsScreen — a tela de Hábitos (Fase 4 / fatia 014).
// Lista cartões de hábito com o score "caixa d'água" em 3 dimensões: ANEL DE CONSISTÊNCIA
// (0–100, calculada na leitura), TENDÊNCIA (📈/📉/➡️) e RECENTE ("5/6 nas últimas 2 semanas").
// Cada cartão tem o check-in de hoje (toggle; mensurável abre um campo de valor) e pode expandir
// o HEATMAP anual de check-ins. "Novo hábito" e editar abrem o HabitModal (no shell).

import { useCallback, useEffect, useState } from 'react'
import type { Habit, HabitHeatDay, HabitTrend } from '../types'
import { kaguyaApi } from '../kaguyaApi'
import { Icon } from '../ui/Icons'
import { HabitHeatmap } from '../ui/HabitHeatmap'

interface HabitsScreenProps {
  reloadKey: number                       // muda → recarrega a lista (após salvar no modal)
  onNewHabit: () => void                  // abre o HabitModal em modo criar
  onEditHabit: (h: Habit) => void         // abre o HabitModal em modo editar
  toast: (msg: string, kind?: 'ok' | 'err') => void
}

// Rótulo + emoji de cada tendência (a setinha subindo dá o "empurrão de dopamina").
const TREND_LABEL: Record<HabitTrend, { icon: string; label: string }> = {
  up: { icon: '📈', label: 'subindo' },
  down: { icon: '📉', label: 'caindo' },
  flat: { icon: '➡️', label: 'estável' },
}

// Descreve a frequência alvo em português a partir de freq_num/freq_den.
function freqText(fn: number, fd: number): string {
  if (fd === 1 && fn === 1) return 'Todo dia'
  if (fd === 7) return `${fn}× por semana`
  if (fn === 1) return `1× a cada ${fd} dias`
  return `${fn}× a cada ${fd} dias`
}

export function HabitsScreen({ reloadKey, onNewHabit, onEditHabit, toast }: HabitsScreenProps) {
  const [habits, setHabits] = useState<Habit[] | null>(null)
  // Hábito mensurável com o campo de valor aberto (id → texto digitado).
  const [valueInput, setValueInput] = useState<Record<number, string>>({})
  // Hábitos com o heatmap expandido + cache do histórico carregado (id → dias).
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [histories, setHistories] = useState<Record<number, HabitHeatDay[]>>({})

  const year = new Date().getFullYear()

  // Carrega a lista de hábitos (com força/aderência/estado de hoje já calculados no backend).
  const load = useCallback(async () => {
    try { setHabits(await kaguyaApi.listHabits()) }
    catch { toast('Falha ao carregar os hábitos.', 'err') }
  }, [toast])
  useEffect(() => { load() }, [load, reloadKey])

  // Faz (ou desfaz) o check-in de hoje de um hábito.
  const toggleToday = async (h: Habit, value?: number) => {
    try {
      if (h.done_today) {
        await kaguyaApi.removeCheckin(h.id)        // desfaz o cumprimento de hoje
      } else {
        await kaguyaApi.checkin(h.id, value != null ? { value } : {})
      }
      // Limpa o campo de valor desse hábito e recarrega (a força recalcula no backend).
      setValueInput((m) => ({ ...m, [h.id]: '' }))
      // Se o heatmap está aberto, recarrega o histórico desse hábito também.
      if (expanded.has(h.id)) await loadHistory(h.id)
      await load()
    } catch { toast('Não foi possível registrar o check-in.', 'err') }
  }

  // Confirma o check-in de um hábito mensurável usando o valor digitado.
  const submitValue = (h: Habit) => {
    const raw = (valueInput[h.id] ?? '').trim()
    const v = Number(raw)
    if (!raw || !(v > 0)) { toast('Informe um valor maior que zero.', 'err'); return }
    toggleToday(h, v)
  }

  // Carrega o histórico anual de um hábito (para o heatmap).
  const loadHistory = async (id: number) => {
    try {
      const hist = await kaguyaApi.habitHistory(id, year)
      setHistories((m) => ({ ...m, [id]: hist }))
    } catch { toast('Falha ao carregar o histórico.', 'err') }
  }

  // Abre/fecha o heatmap de um hábito (carrega o histórico na primeira abertura).
  const toggleHeatmap = async (id: number) => {
    const next = new Set(expanded)
    if (next.has(id)) { next.delete(id) }
    else { next.add(id); if (!histories[id]) await loadHistory(id) }
    setExpanded(next)
  }

  if (habits == null) {
    return <div className="kg-page"><div className="kg-page-sub">Carregando…</div></div>
  }

  return (
    <div className="kg-page">
      <div className="kg-habits-top">
        <div>
          <h1 className="kg-page-title"><Icon name="flame" size={22} /> Hábitos</h1>
          <div className="kg-page-sub">A consistência cresce com o hábito e perdoa uma falha isolada — nada de ofensiva.</div>
        </div>
        <button className="kg-btn kg-btn-primary" onClick={onNewHabit}>
          <Icon name="plus" size={15} style={{ verticalAlign: 'middle', marginRight: 6 }} />Novo hábito
        </button>
      </div>

      {habits.length === 0 ? (
        <div className="kg-empty">
          <div className="kg-empty-title">Nenhum hábito ainda</div>
          Crie seu primeiro hábito para começar a construir consistência.
        </div>
      ) : (
        <div className="kg-habit-list">
          {habits.map((h) => {
            // Consistência (0–100) é a "nota" do hábito — vai no anel.
            const cons = h.consistency
            // Tendência → emoji + rótulo (a régua já contou os dias de folga; subir/descer
            // só muda quando o padrão real muda).
            const trend = TREND_LABEL[h.trend]
            const isOpen = expanded.has(h.id)
            return (
              <div key={h.id} className="kg-habit-card">
                <div className="kg-habit-main">
                  {/* Anel de consistência: conic-gradient preenchido até a % da nota. */}
                  <div
                    className="kg-strength-ring"
                    style={{ ['--pct' as string]: `${cons}` }}
                    title={`Consistência: ${cons}/100 · ${trend.label} · ${h.recent_done}/${h.recent_total} nas últimas 2 semanas`}
                  >
                    <span className="kg-strength-pct">{cons}</span>
                  </div>

                  <div className="kg-habit-info">
                    <button className="kg-habit-name" onClick={() => onEditHabit(h)} title="Editar hábito">
                      <span className="kg-habit-emoji">{h.icon ?? '🔁'}</span>
                      {h.name}
                    </button>
                    <div className="kg-habit-meta">
                      {freqText(h.freq_num, h.freq_den)}
                      {h.target_value != null && ` · meta ${h.target_value}${h.unit ? ' ' + h.unit : ''}`}
                    </div>
                    {/* Tendência + recente (o dado cru que prova o esforço). */}
                    <div className="kg-habit-score">
                      <span className={`kg-trend kg-trend-${h.trend}`}>{trend.icon} {trend.label}</span>
                      <span className="kg-habit-recent">{h.recent_done}/{h.recent_total} nas últimas 2 semanas</span>
                    </div>
                  </div>

                  {/* Ações: check-in de hoje + abrir heatmap */}
                  <div className="kg-habit-actions">
                    {h.target_value != null && !h.done_today ? (
                      // Mensurável e ainda não feito: campo de valor + confirmar.
                      <div className="kg-habit-measure">
                        <input
                          className="kg-input"
                          type="number"
                          min={1}
                          style={{ width: 72 }}
                          placeholder={String(h.target_value)}
                          value={valueInput[h.id] ?? ''}
                          onChange={(e) => setValueInput((m) => ({ ...m, [h.id]: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === 'Enter') submitValue(h) }}
                        />
                        <button className="kg-btn kg-btn-primary" onClick={() => submitValue(h)}>Marcar</button>
                      </div>
                    ) : (
                      // Sim/não, ou já cumprido: botão toggle.
                      <button
                        className={`kg-checkbtn${h.done_today ? ' done' : ''}`}
                        onClick={() => toggleToday(h)}
                        aria-pressed={h.done_today}
                        title={h.done_today ? 'Cumprido hoje (clique para desfazer)' : 'Marcar como feito hoje'}
                      >
                        <Icon name="check" size={16} />
                        {h.done_today ? 'Feito hoje' : 'Hoje'}
                      </button>
                    )}
                    <button className="kg-icon-btn" onClick={() => toggleHeatmap(h.id)} aria-label="Histórico" title="Histórico anual">
                      <Icon name={isOpen ? 'chevronDown' : 'chevron'} size={16} />
                    </button>
                  </div>
                </div>

                {/* Heatmap anual (expansível) */}
                {isOpen && (
                  <div className="kg-habit-heat">
                    {histories[h.id]
                      ? <HabitHeatmap data={histories[h.id]} year={year} target={h.target_value} unit={h.unit} />
                      : <div className="kg-page-sub">Carregando histórico…</div>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
