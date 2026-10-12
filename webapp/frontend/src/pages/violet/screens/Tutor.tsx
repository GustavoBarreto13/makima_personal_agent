// Tutor de Idiomas (spec 031 — persona Kurisu): nível estimado (CEFR), próximo foco sugerido, guia de estudo,
// maestria por conceito e as análises recentes. A análise em si é pedida no menu ⋯ de cada momento, no Escrever.

import { useState } from 'react'
import { Button, Chip, EmptyState, ErrorState, Field, Icon, LoadingState, Page, ProgressBar, SectionHeader, Textarea, confirm, toast } from '../../../design'
import { fmtDate } from '../../../design/core/format'
import { useViolet } from '../context'
import { useLoad } from '../lib/useLoad'
import { violetApi } from '../violetApi'

const TREND = { up: 'trend-up', down: 'trend-down', flat: 'minus' } as const

export function Tutor() {
  const v = useViolet()
  const { state, retry } = useLoad(() => Promise.all([violetApi.tutorProgress(), violetApi.tutorAnalyses(), violetApi.tutorConcepts()]), [v.rev])
  const [editing, setEditing] = useState<{ description: string; targets: string[] } | null>(null)
  const [saving, setSaving] = useState(false)

  if (state.status === 'loading') return <Page><LoadingState count={4} /></Page>
  if (state.status === 'error') return <Page><ErrorState onRetry={retry} /></Page>
  const [progress, analyses, concepts] = state.data
  const label = (slug: string) => concepts.find((c) => c.slug === slug)?.label ?? slug

  async function saveGuide() {
    if (!editing?.description.trim()) return
    setSaving(true)
    try { await violetApi.saveTutorGuide({ description: editing.description.trim(), target_concepts: editing.targets }); setEditing(null); retry() }
    catch { toast('Não consegui salvar o guia.', { tone: 'error' }) }
    setSaving(false)
  }

  async function removeGuide() {
    if (!await confirm({ title: 'Remover o guia de estudo?', body: 'Isso não afeta as análises já feitas.', confirmLabel: 'Remover', danger: true })) return
    await violetApi.deleteTutorGuide().catch(() => toast('Não consegui remover.', { tone: 'error' }))
    retry()
  }

  if (!progress.skills.length && !analyses.length) {
    return (
      <Page>
        <EmptyState icon="school" title="Nenhuma análise ainda" hint="Escreva um momento em inglês e, no menu ⋯ dele, peça uma análise à Kurisu."
          action={<Button variant="primary" icon="edit" onClick={() => v.goto('write')}>Escrever</Button>} />
      </Page>
    )
  }

  return (
    <Page>
      <div className="vl-twocol">
        {progress.level.level && (
          <section className="vl-card vl-level">
            <b className="vl-level-badge">{progress.level.level}</b>
            <div><h4>Nível estimado (CEFR)</h4>{progress.level.preliminary && <p className="vl-muted">Estimativa preliminar — poucas análises ainda.</p>}</div>
          </section>
        )}
        {progress.next_focus && (
          <section className="vl-card">
            <h4 className="vl-card-title">A Kurisu sugere focar em</h4>
            <p className="vl-strong">{progress.next_focus.concept_label}</p>
            <p className="vl-muted">{progress.next_focus.reason}</p>
          </section>
        )}
      </div>

      <SectionHeader title="Guia de estudo" />
      {editing ? (
        <section className="vl-card">
          <Field label="O que você está estudando" hint="Livro, método ou foco — a Kurisu dá ênfase a isso nas próximas análises.">
            {(c) => (<Textarea {...c} rows={2} value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} placeholder="Ex.: English Grammar in Use — capítulo 4 (passado simples)" />)}
          </Field>
          <div className="vl-chips">
            {concepts.map((c) => (
              <Chip key={c.slug} on={editing.targets.includes(c.slug)}
                onClick={() => setEditing({ ...editing, targets: editing.targets.includes(c.slug) ? editing.targets.filter((s) => s !== c.slug) : [...editing.targets, c.slug] })}>{c.label}</Chip>
            ))}
          </div>
          <div className="vl-row vl-row-end"><Button variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button><Button variant="primary" disabled={saving || !editing.description.trim()} onClick={() => void saveGuide()}>Salvar guia</Button></div>
        </section>
      ) : progress.active_guide ? (
        <section className="vl-card">
          <p>{progress.active_guide.description}</p>
          <div className="vl-chips">{progress.active_guide.target_concepts.map((s) => <span key={s} className="vl-pill">{label(s)}</span>)}</div>
          <div className="vl-row"><Button size="sm" icon="edit" onClick={() => setEditing({ description: progress.active_guide!.description, targets: progress.active_guide!.target_concepts })}>Editar</Button>
            <Button size="sm" variant="ghost" icon="delete" onClick={() => void removeGuide()}>Remover</Button></div>
        </section>
      ) : (
        <button type="button" className="vl-addline" onClick={() => setEditing({ description: '', targets: [] })}><Icon name="school" size={14} />Definir um guia de estudo</button>
      )}

      {progress.skills.length > 0 && (
        <>
          <SectionHeader title="Progresso por conceito" />
          <div className="vl-card vl-skills">
            {progress.skills.map((s) => (
              <div key={s.concept_slug} className={`vl-skill${s.is_target ? ' vl-on' : ''}`}>
                <span>{s.concept_label}</span>
                <ProgressBar value={s.mastery_pct} label={`${s.concept_label}: ${s.mastery_pct}%`} />
                <span className="ds-mono">{s.mastery_pct}%</span>
                {s.trend ? <Icon name={TREND[s.trend]} size={14} label={s.trend} /> : <span className="vl-muted vl-small">poucos dados</span>}
              </div>
            ))}
          </div>
        </>
      )}

      {analyses.length > 0 && (
        <>
          <SectionHeader title="Análises recentes" />
          <div className="vl-card">
            {analyses.map((a) => (
              <div key={a.id} className="vl-rankrow"><b className="ds-mono">{a.score}</b><span>{a.summary}</span><span className="vl-muted ds-mono">{fmtDate(a.created_at.slice(0, 10))}</span></div>
            ))}
          </div>
        </>
      )}
    </Page>
  )
}
