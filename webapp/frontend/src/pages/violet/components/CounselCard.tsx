// Conselho do Dia (spec 061, reescrito na 076): a Violet lê o dia, os últimos 7 conselhos, seus valores, a
// Kaguya e a sua base de conhecimento, e escreve um conselho franco, com as notas citadas. Sob demanda (é uma
// chamada longa). O espelho aparece logo; o texto inteiro abre em "Ler o conselho". As ações viram tarefa.

import { useEffect, useRef, useState } from 'react'
import { Button, Icon, IconButton, Sheet, toast } from '../../../design'
import { fmtDate } from '../../../design/core/format'
import { kaguyaApi } from '../../kaguya/api'
import { useViolet } from '../context'
import { violetApi } from '../violetApi'
import type { Counsel, CounselHistoryItem } from '../types'
import { Essay } from './Essay'

const STEPS = ['Lendo o seu dia…', 'Relendo os últimos conselhos…', 'Procurando na sua base…', 'Cruzando as notas…', 'Escrevendo o conselho…']

export function CounselCard({ date, hasContent }: { date: string; hasContent: boolean }) {
  const { goto } = useViolet()
  const [counsel, setCounsel] = useState<Counsel | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState(0)
  const [open, setOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [history, setHistory] = useState<CounselHistoryItem[] | null>(null)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    let live = true
    setLoading(true); setCounsel(null); setOpen(false)
    violetApi.getCounsel(date).then((r) => { if (live) setCounsel(r.counsel) }).catch(() => {}).finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [date])

  useEffect(() => () => { if (timer.current) window.clearInterval(timer.current) }, [])

  async function generate() {
    setBusy(true); setStep(0)
    timer.current = window.setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 9000)
    try {
      const r = await violetApi.generateCounsel(date)
      setCounsel(r.counsel); setOpen(true); setCollapsed(false)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não consegui gerar o conselho agora.', { tone: 'error' })
    } finally {
      if (timer.current) window.clearInterval(timer.current)
      setBusy(false)
    }
  }

  async function toTask(i: number) {
    if (!counsel) return
    const a = counsel.actions[i]
    try {
      const t = await kaguyaApi.createTask({ title: a.texto, description: `Do Conselho do Dia (${fmtDate(counsel.date)}): ${a.motivo}` })
      if (!t.id) throw new Error()
      const r = await violetApi.markActionAsTask(counsel.page_id, i, t.id)
      setCounsel(r.counsel)
      toast('Virou tarefa na Kaguya.', { tone: 'success' })
    } catch { toast('Não consegui criar a tarefa.', { tone: 'error' }) }
  }

  if (loading) return null

  if (busy) {
    return (
      <section className="vl-card vl-counsel" aria-busy="true">
        <header className="vl-card-head"><Icon name="sparkles" size={16} /><h3>Conselho do Dia</h3></header>
        <p className="vl-counsel-step" role="status">{STEPS[step]}</p>
        <p className="vl-muted">Leva cerca de um minuto — pode continuar escrevendo.</p>
      </section>
    )
  }

  if (!counsel) {
    return (
      <section className="vl-card vl-counsel vl-counsel-empty">
        <header className="vl-card-head"><Icon name="sparkles" size={16} /><h3>Conselho do Dia</h3></header>
        <p className="vl-muted">
          {hasContent
            ? 'A Violet lê o seu dia, os últimos conselhos, seus valores e a sua base — e escreve sem rodeios.'
            : 'Escreva algo hoje primeiro: o conselho parte do que você registrou.'}
        </p>
        <div className="vl-row">
          <Button variant="primary" icon="sparkles" disabled={!hasContent} onClick={() => void generate()}>Pedir conselho</Button>
          <Button variant="ghost" icon="values" onClick={() => goto('values')}>Seus valores</Button>
        </div>
      </section>
    )
  }

  const isNew = !!counsel.essay_md
  return (
    <section className="vl-card vl-counsel">
      <header className="vl-card-head">
        <Icon name="sparkles" size={16} />
        <h3>Conselho do Dia</h3>
        {counsel.digest?.humor && <span className="vl-pill">{counsel.digest.humor}</span>}
        <span className="vl-spacer" />
        <IconButton icon={collapsed ? 'down' : 'up'} label={collapsed ? 'Mostrar conselho' : 'Recolher conselho'} size={16} onClick={() => setCollapsed((c) => !c)} />
      </header>
      {!collapsed && (
        <>
          <p className="vl-counsel-mirror">{counsel.mirror}</p>
          {isNew ? (
            open
              ? <Essay markdown={counsel.essay_md ?? ''} sources={counsel.sources} />
              : <Button variant="default" icon="journal" onClick={() => setOpen(true)}>Ler o conselho</Button>
          ) : (
            <div className="vl-toolkit">
              {counsel.toolkit.map((t, i) => (
                <article key={i} className="vl-toolkit-item">
                  <h4>{t.titulo}</h4>
                  <p>{t.porque}</p>
                  <p><b>Como:</b> {t.como}</p>
                  <p><b>Hoje:</b> {t.exemplo_hoje}</p>
                  <p className="vl-muted">{t.fonte}</p>
                </article>
              ))}
            </div>
          )}
          {counsel.actions.length > 0 && (
            <div className="vl-actions">
              <h4>Para fazer</h4>
              {counsel.actions.map((a, i) => (
                <div key={i} className="vl-action">
                  <div><b>{a.texto}</b><small>{a.motivo}</small></div>
                  {a.task_id
                    ? <span className="vl-pill vl-pill-ok"><Icon name="check" size={12} />Na Kaguya</span>
                    : <Button size="sm" icon="task" onClick={() => void toTask(i)}>Virar tarefa</Button>}
                </div>
              ))}
            </div>
          )}
          <footer className="vl-card-foot">
            <Button size="sm" variant="ghost" icon="refresh" onClick={() => void generate()}>Regerar</Button>
            <Button size="sm" variant="ghost" icon="history" onClick={() => { setHistory([]); violetApi.counselHistory(14).then((r) => setHistory(r.items)).catch(() => setHistory(null)) }}>Trajetória</Button>
            <Button size="sm" variant="ghost" icon="values" onClick={() => goto('values')}>Valores</Button>
            {counsel.tokens_in != null && <span className="vl-muted ds-mono vl-tokens">{counsel.tokens_in + (counsel.tokens_out ?? 0)} tokens</span>}
          </footer>
        </>
      )}
      {history && (
        <Sheet title="Trajetória dos conselhos" onClose={() => setHistory(null)}>
          {history.length === 0 && <p className="vl-muted">Carregando…</p>}
          <ol className="vl-trail">
            {history.map((h) => (
              <li key={h.page_id}>
                <button type="button" className="vl-linklike" onClick={() => { setHistory(null); goto({ view: 'write', date: h.date }) }}>{fmtDate(h.date)}</button>
                {h.humor && <span className="vl-pill">{h.humor}</span>}
                {h.principios.length > 0 && <small>{h.principios.join(' · ')}</small>}
              </li>
            ))}
          </ol>
        </Sheet>
      )}
    </section>
  )
}
