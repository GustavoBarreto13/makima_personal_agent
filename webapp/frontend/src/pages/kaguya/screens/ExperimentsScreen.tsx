// ExperimentsScreen — a tela de Tiny Experiments (spec 029).
// Lista os experimentos ATIVOS/PAUSADOS como cartões (fórmula, prazo, barra de aderência,
// check-in rápido de hoje quando ainda não registrado) e, numa seção abaixo, os CONCLUÍDOS
// (US2) com o veredicto. Clicar no cartão abre o detalhe (tracker + revisão). "Novo
// experimento" abre o ExperimentModal (no shell).

import { useCallback, useEffect, useState } from 'react'
import type { Experiment } from '../types'
import { kaguyaApi } from '../kaguyaApi'
import { Icon } from '../ui/Icons'
import { todayISO } from '../lib/dateUtils'

interface ExperimentsScreenProps {
  reloadKey: number                       // muda → recarrega a lista (após salvar no modal)
  onNew: () => void                       // abre o ExperimentModal em modo criar
  onOpenDetail: (id: number) => void      // navega para o detalhe do experimento
  toast: (msg: string, kind?: 'ok' | 'err') => void
}

// Rótulo pt-BR da cadência.
function cadenceLabel(cadence: string): string {
  return cadence === 'weekly' ? 'Semanal' : 'Diária'
}

// Texto do prazo a partir dos campos derivados (dias restantes / atrasado).
function deadlineText(exp: Experiment): string {
  if (exp.is_overdue) return `atrasado ${Math.abs(exp.days_remaining)}d`
  if (exp.days_remaining === 0) return 'termina hoje'
  if (exp.days_remaining < 0) return 'encerrado'
  return `faltam ${exp.days_remaining}d`
}

// Rótulo pt-BR do veredicto (seção de concluídos).
const VERDICT_LABEL: Record<string, string> = {
  persist: 'Persistir', pause: 'Pausar', pivot: 'Pivotar',
}

export function ExperimentsScreen({ reloadKey, onNew, onOpenDetail, toast }: ExperimentsScreenProps) {
  const [experiments, setExperiments] = useState<Experiment[] | null>(null)

  // Carrega TODOS (include_completed=true) numa chamada e particiona ativos/pausados × concluídos.
  const load = useCallback(async () => {
    try { setExperiments(await kaguyaApi.experiments.list(true)) }
    catch { toast('Falha ao carregar os experimentos.', 'err') }
  }, [toast])
  useEffect(() => { load() }, [load, reloadKey])

  // Check-in rápido de hoje (fez = sim). O backend normaliza o período (segunda, se semanal).
  const quickCheckin = async (exp: Experiment) => {
    try {
      await kaguyaApi.experiments.log(exp.id, { period_date: todayISO(), done: true })
      toast('Check-in de hoje registrado.')
      load()
    } catch { toast('Não foi possível registrar o check-in.', 'err') }
  }

  if (experiments == null) {
    return <div className="kg-page"><div className="kg-page-sub">Carregando…</div></div>
  }

  const active = experiments.filter((e) => e.status !== 'completed')
  const completed = experiments.filter((e) => e.status === 'completed')

  return (
    <div className="kg-page">
      <div className="kg-exp-top">
        <div>
          <h1 className="kg-page-title"><Icon name="flask" size={22} /> Experimentos</h1>
          <div className="kg-page-sub">Testes com prazo — a aderência mede o esforço e perdoa uma falha isolada.</div>
        </div>
        <button className="kg-btn kg-btn-primary" onClick={onNew}>
          <Icon name="plus" size={15} style={{ verticalAlign: 'middle', marginRight: 6 }} />Novo experimento
        </button>
      </div>

      {active.length === 0 && completed.length === 0 ? (
        <div className="kg-empty">
          <div className="kg-empty-title">Nenhum experimento ainda</div>
          Crie o primeiro para testar uma mudança por um tempo definido.
        </div>
      ) : (
        <>
          {/* ── Ativos e pausados ── */}
          <div className="kg-exp-list">
            {active.map((exp) => (
              <div key={exp.id} className={`kg-exp-card${exp.status === 'paused' ? ' paused' : ''}`}>
                <div className="kg-exp-head">
                  <button className="kg-exp-title" onClick={() => onOpenDetail(exp.id)} title="Abrir detalhe">
                    {exp.title}
                  </button>
                  {exp.status === 'paused' && <span className="kg-exp-badge paused">⏸ Pausado</span>}
                  {exp.is_overdue && <span className="kg-exp-badge overdue">⚠ Atrasado</span>}
                </div>
                {exp.why && <div className="kg-exp-why">{exp.why}</div>}
                <div className="kg-exp-meta">
                  <span>{cadenceLabel(exp.cadence)}</span>
                  <span>·</span>
                  <span>{deadlineText(exp)}</span>
                </div>

                {/* Barra de aderência */}
                <div className="kg-exp-adh">
                  <div className="kg-exp-adh-label">
                    <span>Aderência</span>
                    <span><span className="kg-exp-adh-pct">{exp.adherence_pct}%</span> · {exp.periods_done}/{exp.periods_expected}</span>
                  </div>
                  <div className="kg-exp-adh-bar">
                    <div className="kg-exp-adh-fill" style={{ ['--pct' as string]: `${exp.adherence_pct}` }} />
                  </div>
                </div>

                {/* Check-in rápido de hoje (só quando ativo e sem check-in no período corrente) */}
                {exp.status === 'active' && !exp.logged_current && (
                  <div className="kg-exp-card-foot">
                    <button className="kg-checkbtn" onClick={() => quickCheckin(exp)}>
                      <Icon name="check" size={16} /> Fiz hoje
                    </button>
                    <button className="kg-btn kg-btn-ghost" onClick={() => onOpenDetail(exp.id)}>Detalhe</button>
                  </div>
                )}
                {exp.status === 'active' && exp.logged_current && (
                  <div className="kg-exp-card-foot">
                    <span className="kg-exp-badge done"><Icon name="check" size={13} /> Registrado no período</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* ── Concluídos (US2) ── */}
          {completed.length > 0 && (
            <>
              <div className="kg-page-sub" style={{ marginTop: 26 }}>Concluídos</div>
              <div className="kg-exp-list">
                {completed.map((exp) => (
                  <div key={exp.id} className="kg-exp-card completed">
                    <div className="kg-exp-head">
                      <button className="kg-exp-title" onClick={() => onOpenDetail(exp.id)}>{exp.title}</button>
                      {exp.verdict && <span className="kg-exp-badge done">{VERDICT_LABEL[exp.verdict] ?? exp.verdict}</span>}
                    </div>
                    <div className="kg-exp-meta">
                      <span>Aderência final {exp.adherence_pct}%</span>
                      <span>·</span>
                      <span>{cadenceLabel(exp.cadence)}</span>
                    </div>
                    {exp.review && <div className="kg-exp-why" style={{ marginTop: 8 }}>“{exp.review}”</div>}
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
