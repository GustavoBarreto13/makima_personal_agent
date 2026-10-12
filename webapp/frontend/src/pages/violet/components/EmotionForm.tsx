// Registro emocional (TCC) guiado — um passo por vez, bom de preencher no celular:
//   1. emoção + intensidade   2. situação   3. pensamento automático   4. resposta adaptativa + reavaliação
// Só o passo 1 é obrigatório; dá para salvar em qualquer passo e completar depois (preenchimento progressivo).
// A reavaliação só aparece com resposta adaptativa (mesma regra do backend).

import { useEffect, useState } from 'react'
import { Button, Chip, Field, Input, Modal, Textarea, toast } from '../../../design'
import { fmtDateLong } from '../../../design/core/format'
import { violetApi } from '../violetApi'
import type { Emotion, EmotionLog } from '../types'

interface Draft {
  emotion_id: number | null
  intensity: number
  situation: string
  automatic_thought: string
  adaptive_response: string
  reappraised_intensity: number | null
}

const STEPS = ['Emoção', 'Situação', 'Pensamento', 'Resposta']

export function IntensityPicker({ value, onChange, label }: { value: number | null; onChange: (v: number) => void; label: string }) {
  return (
    <div className="vl-intensity" role="radiogroup" aria-label={label}>
      {Array.from({ length: 11 }, (_, n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} className={value === n ? 'vl-on' : undefined}
          style={{ ['--vl-level' as string]: n / 10 }} onClick={() => onChange(n)}>{n}</button>
      ))}
    </div>
  )
}

export function EmotionForm({ date, log, onClose, onSaved }: {
  date: string
  log?: EmotionLog | null
  onClose: () => void
  onSaved: (log: EmotionLog) => void
}) {
  const [emotions, setEmotions] = useState<Emotion[]>([])
  const [step, setStep] = useState(0)
  const [custom, setCustom] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [d, setD] = useState<Draft>(() => ({
    emotion_id: log?.emotion_id ?? null,
    intensity: log?.intensity ?? 5,
    situation: log?.situation ?? '',
    automatic_thought: log?.automatic_thought ?? '',
    adaptive_response: log?.adaptive_response ?? '',
    reappraised_intensity: log?.reappraised_intensity ?? null,
  }))
  const dirty = !log ? d.emotion_id !== null || !!d.situation : true

  useEffect(() => { violetApi.listEmotions().then(setEmotions).catch(() => {}) }, [])

  async function addCustom() {
    const name = custom.trim()
    if (!name) return
    const r = await violetApi.createEmotion(name).catch(() => null)
    if (!r) { toast('Não consegui criar a emoção.', { tone: 'error' }); return }
    setEmotions(await violetApi.listEmotions().catch(() => emotions))
    setD({ ...d, emotion_id: r.emotion.id })
    setCustom('')
  }

  async function save() {
    if (d.emotion_id === null) { setError('Escolha a emoção.'); setStep(0); return }
    setSaving(true)
    const hasResponse = d.adaptive_response.trim().length > 0
    const body = {
      emotion_id: d.emotion_id,
      intensity: d.intensity,
      situation: d.situation.trim() || null,
      automatic_thought: d.automatic_thought.trim() || null,
      adaptive_response: d.adaptive_response.trim() || null,
      reappraised_intensity: hasResponse ? d.reappraised_intensity : null,
    }
    try {
      let saved: EmotionLog
      if (log) saved = (await violetApi.updateEmotionLog(log.id, body)).log
      else {
        const page = await violetApi.ensurePage(date)
        saved = (await violetApi.createEmotionLog({ page_id: page.page.id as number, ...body })).log
      }
      toast(log ? 'Registro atualizado.' : 'Registro salvo.', { tone: 'success' })
      onSaved({ ...saved, date })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não consegui salvar.')
    } finally {
      setSaving(false)
    }
  }

  const last = step === STEPS.length - 1
  return (
    <Modal
      title={log ? 'Editar registro emocional' : 'Como você está se sentindo?'}
      onClose={onClose}
      dirty={dirty}
      size="md"
      footer={
        <div className="vl-row vl-row-end">
          {step > 0 && <Button variant="ghost" icon="left" onClick={() => setStep(step - 1)}>Voltar</Button>}
          <span className="vl-spacer" />
          {!last && <Button variant="ghost" disabled={saving || d.emotion_id === null} onClick={() => void save()}>Salvar agora</Button>}
          {last
            ? <Button variant="primary" icon="check" disabled={saving} onClick={() => void save()}>{saving ? 'Salvando…' : 'Salvar registro'}</Button>
            : <Button variant="primary" iconRight="right" disabled={step === 0 && d.emotion_id === null} onClick={() => setStep(step + 1)}>Próximo</Button>}
        </div>
      }
    >
      <p className="vl-muted vl-steps" aria-live="polite">
        {fmtDateLong(date)} · passo {step + 1} de {STEPS.length}: <b>{STEPS[step]}</b>
      </p>
      <div className="vl-stepbar" aria-hidden="true">{STEPS.map((s, i) => <span key={s} className={i <= step ? 'vl-on' : undefined} />)}</div>
      {error && <p className="vl-error" role="alert">{error}</p>}

      {step === 0 && (
        <>
          <Field label="Emoção">
            {() => (<div className="vl-chips">
              {emotions.map((e) => (
                <Chip key={e.id} on={d.emotion_id === e.id} onClick={() => { setD({ ...d, emotion_id: e.id }); setError(null) }}>{e.name}</Chip>
              ))}
            </div>)}
          </Field>
          <div className="vl-row">
            <Input aria-label="Outra emoção" placeholder="Outra emoção…" value={custom} onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void addCustom() } }} />
            <Button icon="add" onClick={() => void addCustom()} disabled={!custom.trim()}>Adicionar</Button>
          </div>
          <Field label={`Intensidade: ${d.intensity}/10`}>
            {() => (<IntensityPicker label="Intensidade" value={d.intensity} onChange={(v) => setD({ ...d, intensity: v })} />)}
          </Field>
        </>
      )}
      {step === 1 && (
        <Field label="O que aconteceu?" hint="A situação ou o gatilho — onde, com quem, o quê.">
          {(c) => (<Textarea {...c} autoFocus rows={4} value={d.situation} onChange={(e) => setD({ ...d, situation: e.target.value })} placeholder="Ex.: reunião em que me cortaram na frente de todos" />)}
        </Field>
      )}
      {step === 2 && (
        <Field label="O que passou pela sua cabeça?" hint="O pensamento automático, do jeito que veio — sem filtrar.">
          {(c) => (<Textarea {...c} autoFocus rows={4} value={d.automatic_thought} onChange={(e) => setD({ ...d, automatic_thought: e.target.value })} placeholder="Ex.: ninguém me leva a sério" />)}
        </Field>
      )}
      {step === 3 && (
        <>
          <Field label="Uma resposta mais equilibrada" hint="O que você diria a um amigo nessa situação? Quais as evidências contra o pensamento?">
            {(c) => (<Textarea {...c} autoFocus rows={4} value={d.adaptive_response} onChange={(e) => setD({ ...d, adaptive_response: e.target.value })} />)}
          </Field>
          {d.adaptive_response.trim() && (
            <Field label={`E agora, qual a intensidade? ${d.reappraised_intensity ?? '—'}/10`}>
              {() => (<IntensityPicker label="Intensidade depois" value={d.reappraised_intensity} onChange={(v) => setD({ ...d, reappraised_intensity: v })} />)}
            </Field>
          )}
        </>
      )}
    </Modal>
  )
}
