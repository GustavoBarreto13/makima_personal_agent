// Registro emocional — todos os registros num lugar e, principalmente, o que está acontecendo com eles (spec 076).
//   1. "Como você tem estado": intensidade dia a dia, emoções mais frequentes, alívio da reavaliação, horários.
//   2. Achados (camada 1, sem IA): gatilhos, quando acontece, tendências, reavaliação, distorções, ligação com
//      hábitos/foco/escrita e mudanças — cada um com a evidência (os registros que o sustentam).
//   3. A leitura da Violet (camada 2, sob demanda): padrões de pensamento, ciclos, o que funciona, valores e
//      experimentos, citando a sua base.
//   4. A lista de todos os registros, com filtros; tocar abre o registro completo.

import { useMemo, useState } from 'react'
import {
  Button, CollectionBody, CollectionMeta, CollectionToolbar, DetailPage, EmptyState, ErrorState, FilterSheet, Icon, LoadingState, Page,
  SectionHeader, SegmentedControl, Sheet, confirm, toast,
} from '../../../design'
import { addDaysISO, fmtDate, fmtDateLong, fmtNumber } from '../../../design/core/format'
import { useCollection } from '../../../design/headless/useCollection'
import { kaguyaApi } from '../../kaguya/api'
import { EmotionCard } from '../components/EmotionCard'
import { EmotionForm } from '../components/EmotionForm'
import { Essay } from '../components/Essay'
import { useViolet } from '../context'
import { DISTORTION_LABEL } from '../lib/emotions'
import { makeEmotionsSchema } from '../lib/schemas'
import { useLoad } from '../lib/useLoad'
import { violetApi } from '../violetApi'
import type { EmotionAnalysis, EmotionFinding, EmotionLog } from '../types'
import { MonthHeader } from './Archive'

const NONE: EmotionLog[] = []
type Period = '30' | '90' | '365'
const SEVERITY: Record<EmotionFinding['severity'], string> = { alta: 'Atenção', media: 'Vale olhar', baixa: 'Bom sinal' }

export function Emotions() {
  const v = useViolet()
  const [period, setPeriod] = useState<Period>('30')
  const since = addDaysISO(v.today, -(Number(period) - 1))
  const logsQ = useLoad(() => violetApi.allEmotionLogs({ limit: 1000 }), [v.rev])
  const patternsQ = useLoad(() => violetApi.emotionPatterns(since, v.today), [v.rev, since])
  const analysisQ = useLoad(() => violetApi.emotionAnalysis(since, v.today), [since])
  const [analysis, setAnalysis] = useState<EmotionAnalysis | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [evidence, setEvidence] = useState<{ title: string; logs: EmotionLog[] | null } | null>(null)
  const logs = logsQ.state.status === 'ok' ? logsQ.state.data : NONE
  const schema = useMemo(() => makeEmotionsSchema(logs), [logs])
  const c = useCollection(schema, logs, { today: v.today })
  const [filters, setFilters] = useState(false)

  if (v.route.emotionId) return <EmotionDetail id={v.route.emotionId} />

  const shownAnalysis = analysis !== undefined ? analysis : analysisQ.state.status === 'ok' ? analysisQ.state.data.analysis : null

  async function generate() {
    setBusy(true)
    try { setAnalysis((await violetApi.generateEmotionAnalysis(since, v.today)).analysis) }
    catch (e) { toast(e instanceof Error ? e.message : 'A Violet não conseguiu ler agora.', { tone: 'error' }) }
    setBusy(false)
  }

  function openEvidence(f: EmotionFinding) {
    setEvidence({ title: f.title, logs: null })
    violetApi.allEmotionLogs({ ids: f.evidence }).then((r) => setEvidence({ title: f.title, logs: r })).catch(() => setEvidence(null))
  }

  async function experimentToTask(e: { titulo: string; como: string; porque: string }) {
    try {
      await kaguyaApi.createTask({ title: `Experimento: ${e.titulo}`, description: `${e.como}\n\nPor quê: ${e.porque}` })
      toast('Virou tarefa na Kaguya.', { tone: 'success' })
    } catch { toast('Não consegui criar a tarefa.', { tone: 'error' }) }
  }

  const p = patternsQ.state.status === 'ok' ? patternsQ.state.data : null
  const maxCount = Math.max(1, ...(p?.summary.by_hour.map((h) => h.count) ?? [1]))

  return (
    <Page wide>
      <div className="vl-row vl-wrap">
        <SegmentedControl label="Período" value={period} onChange={setPeriod}
          options={[{ value: '30', label: '30 dias' }, { value: '90', label: '90 dias' }, { value: '365', label: '1 ano' }]} />
        <span className="vl-spacer" />
        <Button variant="primary" icon="add" onClick={() => v.openEmotion()}>Novo registro</Button>
      </div>

      <SectionHeader title="Como você tem estado" mono={`${fmtDate(since)} – hoje`} />
      {patternsQ.state.status === 'loading' && <LoadingState variant="stat" count={4} />}
      {patternsQ.state.status === 'error' && <ErrorState onRetry={patternsQ.retry} />}
      {p && p.summary.total === 0 && (
        <EmptyState icon="pulse" title="Nenhum registro neste período" hint="Registrar o que sente, o pensamento e uma resposta é o que permite ver padrões."
          action={<Button variant="primary" icon="add" onClick={() => v.openEmotion()}>Registrar agora</Button>} />
      )}
      {p && p.summary.total > 0 && (
        <>
          <div className="vl-kpis">
            <div className="vl-kpi"><b>{p.summary.total}</b><span>registros</span></div>
            <div className="vl-kpi"><b>{fmtNumber(p.summary.avg_intensity, 1)}</b><span>intensidade média</span></div>
            <div className="vl-kpi"><b>{p.summary.avg_relief == null ? '—' : `−${fmtNumber(p.summary.avg_relief, 1)}`}</b><span>alívio com a resposta</span></div>
            <div className="vl-kpi"><b>{p.summary.top_emotion ?? '—'}</b><span>mais frequente</span></div>
          </div>
          <div className="vl-card">
            <h4 className="vl-card-title">Intensidade média por dia</h4>
            <div className="vl-daybars" role="img" aria-label="Intensidade média por dia">
              {p.summary.series.map((d) => (
                <span key={d.date} title={d.value == null ? `${fmtDate(d.date)}: sem registro` : `${fmtDate(d.date)}: ${d.value} (${d.count})`}
                  className={d.value == null ? 'vl-empty' : undefined} style={{ ['--vl-level' as string]: (d.value ?? 0) / 10 }} />
              ))}
            </div>
            <div className="vl-twocol">
              <div>
                <h4 className="vl-card-title">Emoções</h4>
                {p.summary.by_emotion.slice(0, 6).map((e) => (
                  <div key={e.name} className="vl-rankrow"><span>{e.name}</span><span className="ds-mono">{e.count}× · média {fmtNumber(e.avg_intensity, 1)}</span></div>
                ))}
              </div>
              <div>
                <h4 className="vl-card-title">Quando aparecem</h4>
                {p.summary.by_hour.map((h) => (
                  <div key={h.bucket} className="vl-hourrow"><span>{h.bucket}</span><span className="vl-hourbar" style={{ ['--vl-level' as string]: h.count / maxCount }} /><span className="ds-mono">{h.count}</span></div>
                ))}
              </div>
            </div>
          </div>

          <SectionHeader title="O que está acontecendo" mono={`${p.findings.length} achados`} />
          {p.findings.length === 0 && <p className="vl-muted">Ainda não há padrão forte o bastante — continue registrando (com a situação e o pensamento) para eles aparecerem.</p>}
          <div className="vl-findings">
            {p.findings.map((f) => (
              <article key={f.id} className={`vl-finding vl-sev-${f.severity}`}>
                <span className="vl-pill">{SEVERITY[f.severity]}</span>
                <h4>{f.title}</h4>
                <p>{f.detail}</p>
                {f.evidence.length > 0 && <button type="button" className="vl-linklike" onClick={() => openEvidence(f)}>Ver os {f.evidence.length} registros</button>}
              </article>
            ))}
          </div>

          <SectionHeader title="A leitura da Violet" action={shownAnalysis ? <Button size="sm" variant="ghost" icon="refresh" disabled={busy} onClick={() => void generate()}>Ler de novo</Button> : undefined} />
          {busy && <p className="vl-counsel-step" role="status">A Violet está lendo seus registros e a sua base…</p>}
          {!busy && !shownAnalysis && (
            <div className="vl-card">
              <p className="vl-muted">A Violet lê os registros do período, os achados acima, seus valores e o que você estudou sobre TCC — e diz, sem rodeios, o que vê: padrões de pensamento, ciclos, o que funciona e o que fazer.</p>
              <Button variant="primary" icon="sparkles" disabled={p.summary.total < 2} onClick={() => void generate()}>Pedir a leitura</Button>
            </div>
          )}
          {!busy && shownAnalysis && (
            <div className="vl-card">
              <Essay markdown={shownAnalysis.essay_md} sources={shownAnalysis.sources} />
              {shownAnalysis.experiments.length > 0 && (
                <div className="vl-actions">
                  <h4>Experimentos</h4>
                  {shownAnalysis.experiments.map((e, i) => (
                    <div key={i} className="vl-action">
                      <div><b>{e.titulo}</b><small>{e.como}</small><small className="vl-muted">{e.porque}</small></div>
                      <Button size="sm" icon="experiment" onClick={() => void experimentToTask(e)}>Virar tarefa</Button>
                    </div>
                  ))}
                </div>
              )}
              <p className="vl-muted ds-mono vl-small">Lido em {shownAnalysis.created_at ? fmtDate(shownAnalysis.created_at.slice(0, 10)) : '—'} · {shownAnalysis.log_count} registros</p>
            </div>
          )}
        </>
      )}

      <SectionHeader title="Todos os registros" />
      <CollectionToolbar schema={schema} c={c} onOpenFilters={() => setFilters(true)} searchPlaceholder="Buscar na situação, no pensamento ou na resposta" />
      <CollectionMeta c={c} noun={['registro', 'registros']} />
      <CollectionBody
        c={c}
        view="list"
        renderCard={() => null}
        renderGroupHeader={(key, count) => (/^\d{4}-\d{2}-\d{2}$/.test(key)
          ? <div className="vl-monthhead"><span className="vl-month">{fmtDateLong(key)}</span><span className="vl-muted ds-mono">{count}</span></div>
          : <MonthHeader name={key} count={count} noun={['registro', 'registros']} />)}
        renderRow={(l) => <EmotionCard key={l.id} log={l} today={v.today} showDate onOpen={() => v.goto({ view: 'emotions', emotionId: l.id })} />}
        loading={logsQ.state.status === 'loading'}
        error={logsQ.state.status === 'error'}
        onRetry={logsQ.retry}
        emptyTitle="Nenhum registro com esses filtros"
        firstRun={<EmptyState icon="pulse" title="Nenhum registro emocional ainda" action={<Button variant="primary" icon="add" onClick={() => v.openEmotion()}>Registrar o primeiro</Button>} />}
      />
      {filters && <FilterSheet schema={schema} c={c} items={logs} onClose={() => setFilters(false)} noun={['registro', 'registros']} />}
      {evidence && (
        <Sheet title={evidence.title} onClose={() => setEvidence(null)}>
          {!evidence.logs ? <LoadingState count={3} /> : evidence.logs.map((l) => (
            <EmotionCard key={l.id} log={l} today={v.today} showDate onOpen={() => { setEvidence(null); v.goto({ view: 'emotions', emotionId: l.id }) }} />
          ))}
        </Sheet>
      )}
    </Page>
  )
}

function EmotionDetail({ id }: { id: number }) {
  const v = useViolet()
  const { state, retry } = useLoad(() => violetApi.emotionLog(id), [id, v.rev])
  const [editing, setEditing] = useState(false)
  if (state.status === 'loading') return <Page><LoadingState variant="card" count={1} /></Page>
  if (state.status === 'error') return <Page><ErrorState title="Não encontrei esse registro" onRetry={retry} /></Page>
  const l = state.data.log

  async function remove() {
    if (!await confirm({ title: 'Apagar este registro?', body: 'Ele sai do diário e das análises.', confirmLabel: 'Apagar', danger: true })) return
    try { await violetApi.deleteEmotionLog(l.id); toast('Registro apagado.'); v.reload(); v.goto('emotions') }
    catch { toast('Não consegui apagar.', { tone: 'error' }) }
  }

  const relief = l.reappraised_intensity != null ? l.intensity - l.reappraised_intensity : null
  const step = (title: string, text: string | null, hint: string) => (
    <div className="vl-tcc-step">
      <h4>{title}</h4>
      {text ? <p>{text}</p> : <p className="vl-muted">{hint}</p>}
    </div>
  )
  return (
    <Page>
      <DetailPage
        backLabel="Registro emocional"
        onBack={() => v.goto('emotions')}
        title={`${l.emotion_name} · ${l.intensity}/10`}
        subtitle={l.date ? fmtDateLong(l.date) : undefined}
        chips={<>
          {relief != null && <span className="vl-pill vl-pill-ok">alívio de {relief}</span>}
          {(l.distortions ?? []).map((d) => <span key={d} className="vl-pill">{DISTORTION_LABEL[d] ?? d}</span>)}
        </>}
        icon="pulse"
        hue={252}
        actions={<>
          <Button variant="primary" icon="edit" onClick={() => setEditing(true)}>{l.adaptive_response ? 'Editar' : 'Completar'}</Button>
          {l.date && <Button icon="journal" onClick={() => v.goto({ view: 'write', date: l.date })}>Ver o dia</Button>}
          <Button variant="ghost" icon="delete" onClick={() => void remove()}>Apagar</Button>
        </>}
        tabs={[{
          id: 'tcc', label: 'Registro',
          content: (
            <div className="vl-tcc">
              {step('Situação', l.situation, 'Sem situação registrada.')}
              {step('Pensamento automático', l.automatic_thought, 'Sem pensamento registrado.')}
              {step('Resposta adaptativa', l.adaptive_response, 'Ainda sem resposta — é onde a reavaliação acontece.')}
              {l.reappraised_intensity != null && (
                <div className="vl-tcc-step"><h4>Depois da resposta</h4><p><Icon name="trend-down" size={14} /> {l.intensity} → {l.reappraised_intensity}</p></div>
              )}
            </div>
          ),
        }]}
      />
      {editing && <EmotionForm date={l.date ?? v.today} log={l} onClose={() => setEditing(false)} onSaved={() => { v.reload(); retry() }} />}
    </Page>
  )
}
