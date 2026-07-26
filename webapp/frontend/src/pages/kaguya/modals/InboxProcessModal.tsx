// InboxProcessModal — processamento guiado do Inbox, item a item (spec 034 / US1).
// Busca a fila (GET /inbox/queue) e apresenta uma tarefa por vez com as 6 decisões do
// GTD clarify: próxima ação, aguardando, algum dia, agendar, feito, lixo. Cada decisão
// chama POST /inbox/{id}/process e avança para o próximo item — fechar e reabrir
// simplesmente re-busca a fila (itens já processados nunca voltam, FR-004).

import { useEffect, useState } from 'react'
import type { InboxDecision, TaskContext } from '../types'
import { kaguyaApi } from '../kaguyaApi'
import { Icon } from '../ui/Icons'
import { DatePicker } from '../components/DatePicker'
import { todayISO } from '../lib/dateUtils'

interface InboxProcessModalProps {
  onClose: () => void
  onChanged: () => void       // pai re-busca sidebar/contadores após qualquer decisão
  toast: (msg: string, kind?: 'ok' | 'err') => void
  contexts?: TaskContext[]    // opcional (US4) — seletor de contexto no passo "próxima ação"
}

export function InboxProcessModal({ onClose, onChanged, toast, contexts = [] }: InboxProcessModalProps) {
  const [items, setItems] = useState<{ id: number; title: string; description: string | null }[] | null>(null)
  const [total, setTotal] = useState(0)
  const [done, setDone] = useState(0)   // quantos já processados nesta sessão de wizard
  const [busy, setBusy] = useState(false)

  // Estado dos formulários dos passos que pedem um campo extra.
  const [waitingNote, setWaitingNote] = useState('')
  const [scheduleDate, setScheduleDate] = useState(todayISO())
  const [contextId, setContextId] = useState<number | ''>('')
  const [step, setStep] = useState<'menu' | 'waiting' | 'schedule'>('menu')

  const load = async () => {
    const r = await kaguyaApi.inboxQueue()
    setItems(r.items)
    setTotal(r.total)
  }

  useEffect(() => { load() }, [])

  const current = items && items.length > 0 ? items[0] : null

  const resetStepState = () => {
    setStep('menu'); setWaitingNote(''); setScheduleDate(todayISO()); setContextId('')
  }

  const apply = async (decision: InboxDecision, extra: Record<string, unknown> = {}) => {
    if (!current) return
    setBusy(true)
    try {
      const r = await kaguyaApi.processInboxItem(current.id, { decision, ...extra })
      if (r.status === 'error') { toast(r.message ?? 'Falha ao processar o item.', 'err'); return }
      setDone((d) => d + 1)
      resetStepState()
      onChanged()
      await load()
    } catch {
      toast('Falha ao processar o item.', 'err')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="kg-scrim" onClick={onClose}>
      <div className="kg-modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="kg-modal-head">
          <h3>Processar o Inbox</h3>
          <button className="kg-icon-btn" onClick={onClose} aria-label="Fechar"><Icon name="x" /></button>
        </div>

        <div className="kg-modal-body">
          {items === null && <p>Carregando…</p>}

          {items !== null && !current && (
            <p>
              {done > 0
                ? `Fila esvaziada — ${done} item(ns) processado(s). Nada mais para clarificar no Inbox.`
                : 'O Inbox não tem itens pendentes de processamento.'}
            </p>
          )}

          {current && (
            <>
              <p className="kg-muted" style={{ marginBottom: 8 }}>
                {done + 1} de {done + total}
              </p>
              <h4 style={{ marginBottom: 4 }}>{current.title}</h4>
              {current.description && <p className="kg-muted">{current.description}</p>}

              {step === 'menu' && (
                <div className="kg-modal-foot" style={{ flexWrap: 'wrap', justifyContent: 'flex-start', gap: 8 }}>
                  <button className="kg-btn" disabled={busy} onClick={() => apply('next_action', contextId ? { context_id: contextId } : {})}>
                    <Icon name="zap" /> Próxima ação
                  </button>
                  <button className="kg-btn" disabled={busy} onClick={() => setStep('waiting')}>
                    <Icon name="clock" /> Aguardando
                  </button>
                  <button className="kg-btn" disabled={busy} onClick={() => apply('someday')}>
                    <Icon name="inbox" /> Algum dia
                  </button>
                  <button className="kg-btn" disabled={busy} onClick={() => setStep('schedule')}>
                    <Icon name="calendar" /> Agendar
                  </button>
                  <button className="kg-btn kg-btn-primary" disabled={busy} onClick={() => apply('done')}>
                    <Icon name="check" /> Feito agora
                  </button>
                  <button className="kg-btn kg-btn-ghost" disabled={busy} onClick={() => apply('trash')}>
                    <Icon name="trash" /> Lixo
                  </button>
                </div>
              )}

              {step === 'menu' && contexts.length > 0 && (
                <div className="kg-field" style={{ marginTop: 8 }}>
                  <span className="kg-field-label">Contexto (opcional, só para "próxima ação")</span>
                  <select
                    className="kg-select"
                    value={contextId}
                    onChange={(e) => setContextId(e.target.value ? Number(e.target.value) : '')}
                  >
                    <option value="">Sem contexto</option>
                    {contexts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}

              {step === 'waiting' && (
                <div className="kg-field" style={{ marginTop: 8 }}>
                  <span className="kg-field-label">Por quem/o quê espera (opcional)</span>
                  <input
                    className="kg-input"
                    autoFocus
                    value={waitingNote}
                    onChange={(e) => setWaitingNote(e.target.value)}
                    placeholder="Ex.: orçamento do João"
                  />
                  <div className="kg-modal-foot">
                    <button className="kg-btn kg-btn-ghost" onClick={() => setStep('menu')}>Voltar</button>
                    <button className="kg-btn kg-btn-primary" disabled={busy} onClick={() => apply('waiting', { waiting_note: waitingNote || null })}>
                      Confirmar
                    </button>
                  </div>
                </div>
              )}

              {step === 'schedule' && (
                <div className="kg-field" style={{ marginTop: 8 }}>
                  <span className="kg-field-label">Para quando?</span>
                  <DatePicker value={scheduleDate} onChange={setScheduleDate} />
                  <div className="kg-modal-foot">
                    <button className="kg-btn kg-btn-ghost" onClick={() => setStep('menu')}>Voltar</button>
                    <button className="kg-btn kg-btn-primary" disabled={busy || !scheduleDate} onClick={() => apply('schedule', { due_date: scheduleDate })}>
                      Confirmar
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {!current && (
          <div className="kg-modal-foot">
            <button className="kg-btn kg-btn-primary" onClick={onClose}>Fechar</button>
          </div>
        )}
      </div>
    </div>
  )
}
