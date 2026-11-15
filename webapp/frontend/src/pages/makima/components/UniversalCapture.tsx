// Captura universal: uma linha vira gasto, receita ou tarefa. Sempre mostra a prévia do que foi entendido
// antes de gravar (Enter entende, Enter de novo salva), e todo registro tem Desfazer.

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Button, Icon, toast } from '../../../design'
import { useVoiceProvider } from '../../../design/headless/voice'
import { makimaApi } from '../makimaApi'
import type { CapturePreview } from '../types'

export const FOCUS_CAPTURE_EVENT = 'makima:capture-focus'
const EXAMPLES = ['gastei 32 no ifood', 'recebi 500 de freela', 'ligar pro contador amanhã', 'comprar presente @Bia dia 20']

function newKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function UniversalCapture({ onSaved }: { onSaved: () => void }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<CapturePreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  // A chave só muda quando a linha muda: reenviar o mesmo "Salvar" nunca duplica.
  const key = useRef(newKey())
  const voice = useVoiceProvider()

  useEffect(() => {
    const focus = () => input.current?.focus()
    window.addEventListener(FOCUS_CAPTURE_EVENT, focus)
    return () => window.removeEventListener(FOCUS_CAPTURE_EVENT, focus)
  }, [])

  const reset = () => { setText(''); setPreview(null); setError(null); key.current = newKey(); input.current?.focus() }

  const understand = async () => {
    if (!text.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const p = await makimaApi.captureParse(text)
      if (p.kind === 'empty') setPreview(null)
      else setPreview(p)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não consegui entender agora. Tente de novo.')
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    if (!preview || preview.kind === 'empty' || busy) return
    setBusy(true)
    setError(null)
    try {
      const r = await makimaApi.captureCommit(preview.kind, preview.fields, preview.people.map((p) => p.id), key.current)
      toast(r.summary, {
        tone: 'success',
        undo: () => { makimaApi.captureUndo(r.undo).then(onSaved).catch(() => toast('Não foi possível desfazer. Confira no agente.', { tone: 'error' })) },
      })
      reset()
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar. Seus dados continuam aqui; tente de novo.')
    } finally {
      setBusy(false)
    }
  }

  const submit = (e: FormEvent) => { e.preventDefault(); void (preview ? save() : understand()) }

  const speak = async () => {
    if (!voice) return
    try {
      const said = (await voice()).trim()
      if (said) { setText((t) => (t ? `${t} ${said}` : said)); setPreview(null) }
    } catch { /* o provedor já avisa o usuário */ }
  }

  return (
    <section aria-label="Registrar qualquer coisa" className="mk-cap">
      <form onSubmit={submit} className="mk-cap-form">
        <Icon name="sparkles" size={18} />
        <input
          ref={input}
          className="mk-cap-in"
          aria-label="Registrar qualquer coisa"
          placeholder="Registre qualquer coisa: gastei 32 no ifood…"
          autoComplete="off"
          value={text}
          onChange={(e) => { setText(e.target.value); setPreview(null); key.current = newKey() }}
          onKeyDown={(e) => { if (e.key === 'Escape') reset() }}
        />
        {voice && <Button type="button" variant="ghost" size="sm" icon="mic" aria-label="Falar" onClick={() => void speak()} />}
        <Button type="submit" variant="primary" size="sm" disabled={busy || !text.trim()}>{preview ? 'Salvar' : 'Entender'}</Button>
      </form>

      {!text && !preview && (
        <div className="mk-cap-ex" aria-label="Exemplos">
          {EXAMPLES.map((ex) => <button key={ex} type="button" className="mk-cap-chip" onClick={() => { setText(ex); input.current?.focus() }}>{ex}</button>)}
        </div>
      )}

      {preview && preview.kind !== 'empty' && (
        <div className="mk-cap-prev" role="status">
          <span className="mk-ic" data-tone={preview.kind === 'expense' ? 'warn' : undefined}><Icon name={preview.kind === 'task' ? 'task' : 'money'} size={18} /></span>
          <div className="mk-row-t">
            <strong>{preview.summary || 'Não entendi o que registrar'}</strong>
            {preview.people.length > 0 && <span>Com {preview.people.map((p) => p.name).join(', ')}</span>}
            {preview.confidence === 'low' && <span>Entendi como tarefa. Para um gasto, comece com “gastei 30 …”.</span>}
            {preview.warnings.map((w) => <span key={w}>{w}</span>)}
          </div>
          <Button size="sm" variant="ghost" onClick={reset}>Cancelar</Button>
        </div>
      )}
      {error && <p className="mk-cap-err" role="alert">{error}</p>}
    </section>
  )
}
