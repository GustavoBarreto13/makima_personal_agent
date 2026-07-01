// ExperimentDetailScreen — detalhe de um experimento (Tiny Experiments, spec 029).
// Mostra: cabeçalho (fórmula, why/hipótese, cadência, prazo, barra de aderência), botões de
// PAUSAR/RETOMAR e EDITAR, o TRACKER (tabela de check-ins por período, com backfill/edição via
// formulário) e, ao encerrar, a REVISÃO (veredicto + aprendizado — US2). Segue o padrão de
// carregamento silencioso (firstLoad ref) por receber reloadKey do shell.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Experiment, ExperimentLog, ExperimentVerdict } from '../types'
import { kaguyaApi } from '../kaguyaApi'
import { Icon } from '../ui/Icons'
import { DatePicker } from '../components/DatePicker'
import { todayISO, fmtDateLabel } from '../lib/dateUtils'

interface ExperimentDetailScreenProps {
  experimentId: number
  reloadKey: number
  onBack: () => void                       // volta para a lista de experimentos
  onEdit: (exp: Experiment) => void        // abre o ExperimentModal em modo editar
  toast: (msg: string, kind?: 'ok' | 'err') => void
}

// Opções de veredicto da revisão (US2) com rótulo pt-BR.
const VERDICTS: { value: ExperimentVerdict; label: string }[] = [
  { value: 'persist', label: 'Persistir' },
  { value: 'pause', label: 'Pausar' },
  { value: 'pivot', label: 'Pivotar' },
]

// Sensação como estrelinhas/pontos 1–5.
function feelingDots(feeling: number | null): string {
  if (feeling == null) return '—'
  return '●'.repeat(feeling) + '○'.repeat(5 - feeling)
}

export function ExperimentDetailScreen({ experimentId, reloadKey, onBack, onEdit, toast }: ExperimentDetailScreenProps) {
  const [exp, setExp] = useState<Experiment | null>(null)
  const [loading, setLoading] = useState(true)
  const firstLoad = useRef(true)

  // ── Formulário de check-in / backfill ──
  const [formDate, setFormDate] = useState(todayISO())
  const [formDone, setFormDone] = useState(true)
  const [formFeeling, setFormFeeling] = useState<number | null>(null)
  const [formNote, setFormNote] = useState('')

  // ── Formulário de revisão (US2) ──
  const [verdict, setVerdict] = useState<ExperimentVerdict | null>(null)
  const [review, setReview] = useState('')
  const [reviewing, setReviewing] = useState(false)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const r = await kaguyaApi.experiments.get(experimentId)
      setExp(r)
    } catch {
      toast('Falha ao carregar o experimento.', 'err')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [experimentId, toast])

  // Spinner só no mount; bumps do reloadKey são silenciosos.
  useEffect(() => {
    const silent = !firstLoad.current
    firstLoad.current = false
    load(silent)
  }, [load, reloadKey])

  // Registra/atualiza o check-in do período escolhido no formulário (upsert).
  const submitCheckin = async () => {
    if (!formDate) { toast('Escolha uma data.', 'err'); return }
    try {
      await kaguyaApi.experiments.log(experimentId, {
        period_date: formDate, done: formDone,
        feeling: formFeeling, note: formNote.trim() || null,
      })
      toast('Check-in registrado.')
      // Limpa o formulário (mantém a data em hoje) e recarrega silenciosamente.
      setFormFeeling(null); setFormNote(''); setFormDone(true)
      load(true)
    } catch { toast('Não foi possível registrar o check-in.', 'err') }
  }

  // Carrega um log existente no formulário para edição.
  // O período é grampeado em [start, end]: na cadência semanal o period_date armazenado é a
  // segunda-feira, que pode ser ANTES do start (semana parcial) — reenviá-la seria rejeitado
  // pelo backend. Grampear para start_date mantém a mesma semana (normaliza para a mesma segunda).
  const editLog = (log: ExperimentLog) => {
    const clamped =
      exp && log.period_date < exp.start_date ? exp.start_date
      : exp && log.period_date > exp.end_date ? exp.end_date
      : log.period_date
    setFormDate(clamped)
    setFormDone(log.done)
    setFormFeeling(log.feeling)
    setFormNote(log.note ?? '')
  }

  const removeLog = async (log: ExperimentLog) => {
    try {
      await kaguyaApi.experiments.removeLog(experimentId, log.period_date)
      toast('Check-in removido.')
      load(true)
    } catch { toast('Não foi possível remover o check-in.', 'err') }
  }

  const pause = async () => {
    try { await kaguyaApi.experiments.pause(experimentId); toast('Experimento pausado.'); load(true) }
    catch { toast('Não foi possível pausar.', 'err') }
  }
  const resume = async () => {
    try { await kaguyaApi.experiments.resume(experimentId); toast('Experimento retomado.'); load(true) }
    catch { toast('Não foi possível retomar.', 'err') }
  }

  const submitReview = async () => {
    if (!verdict) { toast('Escolha um veredicto.', 'err'); return }
    if (!review.trim()) { toast('Escreva o aprendizado.', 'err'); return }
    setReviewing(true)
    try {
      await kaguyaApi.experiments.review(experimentId, { verdict, review: review.trim() })
      toast('Experimento concluído.')
      load(true)
    } catch { toast('Não foi possível concluir.', 'err') }
    finally { setReviewing(false) }
  }

  if (loading) return <div className="kg-page"><div className="kg-empty">Carregando…</div></div>
  if (!exp) return <div className="kg-page"><div className="kg-empty">Experimento não encontrado.</div></div>

  const logs = exp.logs ?? []
  const isCompleted = exp.status === 'completed'

  return (
    <div className="kg-page">
      {/* Voltar + editar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <button className="kg-btn kg-btn-ghost" onClick={onBack}>
          <Icon name="back" size={15} style={{ verticalAlign: 'middle', marginRight: 4 }} />Experimentos
        </button>
        <span style={{ marginLeft: 'auto' }} />
        {!isCompleted && (
          exp.status === 'paused'
            ? <button className="kg-btn" onClick={resume}>▶ Retomar</button>
            : <button className="kg-btn" onClick={pause}>⏸ Pausar</button>
        )}
        <button className="kg-icon-btn" onClick={() => onEdit(exp)} aria-label="Editar"><Icon name="settings" size={15} /></button>
      </div>

      <h1 className="kg-page-title">{exp.title}</h1>
      <div className="kg-exp-meta" style={{ marginBottom: 14 }}>
        <span>{exp.cadence === 'weekly' ? 'Semanal' : 'Diária'}</span>
        <span>·</span>
        <span>{fmtDateLabel(exp.start_date)} → {fmtDateLabel(exp.end_date)}</span>
        {exp.status === 'paused' && <span className="kg-exp-badge paused">⏸ Pausado</span>}
        {exp.is_overdue && <span className="kg-exp-badge overdue">⚠ Atrasado</span>}
        {isCompleted && <span className="kg-exp-badge done">Concluído</span>}
      </div>

      {(exp.why || exp.hypothesis) && (
        <div className="kg-exp-why" style={{ marginBottom: 14 }}>
          {exp.why && <div><b>Por quê:</b> {exp.why}</div>}
          {exp.hypothesis && <div><b>Hipótese:</b> {exp.hypothesis}</div>}
        </div>
      )}

      {/* Barra de aderência */}
      <div className="kg-exp-adh" style={{ maxWidth: 480 }}>
        <div className="kg-exp-adh-label">
          <span>Aderência</span>
          <span><span className="kg-exp-adh-pct">{exp.adherence_pct}%</span> · {exp.periods_done}/{exp.periods_expected} períodos</span>
        </div>
        <div className="kg-exp-adh-bar">
          <div className="kg-exp-adh-fill" style={{ ['--pct' as string]: `${exp.adherence_pct}` }} />
        </div>
      </div>

      {/* ── Revisão (US2): concluído mostra read-only; ativo/pausado mostra o formulário ── */}
      {isCompleted ? (
        <div className="kg-exp-review">
          <div className="kg-page-sub">Revisão</div>
          <div className="kg-exp-meta">
            <span className="kg-exp-badge done">{VERDICTS.find((v) => v.value === exp.verdict)?.label ?? exp.verdict}</span>
          </div>
          {exp.review && <div className="kg-exp-why" style={{ marginTop: 8 }}>“{exp.review}”</div>}
        </div>
      ) : (
        <div className="kg-exp-review">
          <div className="kg-page-sub">Encerrar com revisão</div>
          <div className="kg-exp-verdicts">
            {VERDICTS.map((v) => (
              <button
                key={v.value}
                className={`kg-exp-verdict${verdict === v.value ? ' active' : ''}`}
                onClick={() => setVerdict(v.value)}
              >{v.label}</button>
            ))}
          </div>
          <textarea
            className="kg-textarea"
            rows={3}
            placeholder="O que você aprendeu com este experimento?"
            value={review}
            onChange={(e) => setReview(e.target.value)}
          />
          <div style={{ marginTop: 10 }}>
            <button className="kg-btn kg-btn-primary" onClick={submitReview} disabled={reviewing}>
              {reviewing ? 'Concluindo…' : 'Concluir experimento'}
            </button>
          </div>
        </div>
      )}

      {/* ── Tracker: check-ins registrados ── */}
      <div className="kg-page-sub" style={{ marginTop: 26 }}>Tracker</div>
      {logs.length === 0 ? (
        <div className="kg-exp-why">Nenhum check-in ainda.</div>
      ) : (
        <table className="kg-exp-tracker">
          <thead>
            <tr>
              <th>Período</th>
              <th className="center">Fez?</th>
              <th className="center">Sensação</th>
              <th>Nota</th>
              <th className="center"></th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td>{fmtDateLabel(log.period_date)}</td>
                <td className="center">{log.done ? '✅' : '❌'}</td>
                <td className="center kg-exp-feeling">{feelingDots(log.feeling)}</td>
                <td className="kg-exp-note">{log.note ?? '—'}</td>
                <td className="center">
                  {!isCompleted && (
                    <span style={{ display: 'inline-flex', gap: 4 }}>
                      <button className="kg-icon-btn" onClick={() => editLog(log)} aria-label="Editar check-in"><Icon name="settings" size={13} /></button>
                      <button className="kg-icon-btn" onClick={() => removeLog(log)} aria-label="Remover check-in"><Icon name="trash" size={13} /></button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ── Formulário de check-in / backfill (some quando concluído) ── */}
      {!isCompleted && (
        <div className="kg-exp-review">
          <div className="kg-page-sub">Registrar / corrigir check-in</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12 }}>
            <div className="kg-field" style={{ margin: 0 }}>
              <span className="kg-field-label">Dia</span>
              <DatePicker value={formDate} onChange={setFormDate} />
            </div>
            <div className="kg-field" style={{ margin: 0 }}>
              <span className="kg-field-label">Fez?</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className={`kg-btn${formDone ? ' kg-btn-primary' : ''}`} style={{ padding: '6px 12px' }} onClick={() => setFormDone(true)}>Sim</button>
                <button className={`kg-btn${!formDone ? ' kg-btn-primary' : ''}`} style={{ padding: '6px 12px' }} onClick={() => setFormDone(false)}>Não</button>
              </div>
            </div>
            <div className="kg-field" style={{ margin: 0 }}>
              <span className="kg-field-label">Sensação</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    className={`kg-btn${formFeeling === n ? ' kg-btn-primary' : ''}`}
                    style={{ padding: '6px 10px' }}
                    onClick={() => setFormFeeling(formFeeling === n ? null : n)}
                  >{n}</button>
                ))}
              </div>
            </div>
          </div>
          <div className="kg-field" style={{ marginTop: 10 }}>
            <span className="kg-field-label">Nota (opcional)</span>
            <input className="kg-input" value={formNote} onChange={(e) => setFormNote(e.target.value)} placeholder="Como foi?" />
          </div>
          <div style={{ marginTop: 10 }}>
            <button className="kg-btn kg-btn-primary" onClick={submitCheckin}>Salvar check-in</button>
          </div>
        </div>
      )}
    </div>
  )
}
