// Captura universal: uma linha vira tarefa, gasto ou receita. A prévia é EDITÁVEL (tipo, descrição, valor, categoria,
// data): o que foi entendido errado se corrige ali, sem redigitar. Enter na linha entende; Enter na prévia salva;
// Esc cancela; todo registro tem Desfazer. Sem internet o pedido fica na fila do aparelho e sai quando a rede volta.

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Button, DatePicker, Field, Icon, Input, MoneyInput, SegmentedControl, Select, toast } from '../../../design'
import { useVoiceProvider } from '../../../design/headless/voice'
import { ApiError } from '../../../lib/api'
import { makimaApi } from '../makimaApi'
import type { CaptureKind, CapturePreview } from '../types'

export const FOCUS_CAPTURE_EVENT = 'makima:capture-focus'
const EXAMPLES = ['gastei 32 no ifood', 'recebi 500 de freela', 'ligar pro contador amanhã', 'comprar presente @Bia dia 20']

const KIND_OPTIONS: { value: CaptureKind; label: string; icon: 'task' | 'expense' | 'income' }[] = [
  { value: 'task', label: 'Tarefa', icon: 'task' },
  { value: 'expense', label: 'Gasto', icon: 'expense' },
  { value: 'income', label: 'Receita', icon: 'income' },
]

interface Draft {
  kind: CaptureKind
  title: string
  valor: number | null
  categoria: string
  data: string
}

type Errors = Partial<Record<'title' | 'valor', string>>

const isMoney = (k: CaptureKind) => k === 'expense' || k === 'income'

function draftFrom(p: CapturePreview): Draft {
  const f = p.fields
  return {
    kind: p.kind === 'empty' ? 'task' : p.kind,
    title: String(f.name ?? f.title ?? ''),
    valor: typeof f.valor === 'number' ? f.valor : null,
    categoria: String(f.categoria ?? 'Inbox'),
    data: String(f.data ?? f.due_date ?? ''),
  }
}

/** Campos no formato que `POST /api/hub/capture/commit` espera para cada tipo. */
export function fieldsFrom(d: Draft): Record<string, unknown> {
  if (isMoney(d.kind)) {
    return {
      name: d.title.trim(), valor: d.valor, tipo: d.kind === 'income' ? 'Receita' : 'Despesa',
      categoria: d.kind === 'income' ? 'Receita' : d.categoria || 'Inbox', ...(d.data ? { data: d.data } : {}),
    }
  }
  return { title: d.title.trim(), ...(d.data ? { due_date: d.data } : {}) }
}

export function validate(d: Draft): Errors {
  const e: Errors = {}
  if (!d.title.trim()) e.title = d.kind === 'task' ? 'Escreva o que precisa ser feito.' : 'Escreva uma descrição.'
  if (isMoney(d.kind) && (d.valor === null || !(d.valor > 0))) e.valor = 'Informe o valor.'
  return e
}

export function UniversalCapture({ onSaved }: { onSaved: () => void }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<CapturePreview | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [errors, setErrors] = useState<Errors>({})
  const [error, setError] = useState<string | null>(null)
  // Sem rede ao entender: oferece guardar a frase como tarefa na fila do aparelho.
  const [offline, setOffline] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const previewBox = useRef<HTMLFormElement>(null)
  const voice = useVoiceProvider()

  // O botão "Registrar" (FAB / sidebar) leva até o campo e abre o teclado, mesmo com a página rolada.
  useEffect(() => {
    const focus = () => {
      input.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
      input.current?.focus({ preventScroll: true })
    }
    window.addEventListener(FOCUS_CAPTURE_EVENT, focus)
    return () => window.removeEventListener(FOCUS_CAPTURE_EVENT, focus)
  }, [])

  // Depois de entender, o foco vai para "Salvar": Enter de novo confirma.
  useEffect(() => {
    if (preview) previewBox.current?.querySelector<HTMLButtonElement>('button[type="submit"]')?.focus()
  }, [preview])

  const reset = () => {
    setText(''); setPreview(null); setDraft(null); setErrors({}); setError(null); setOffline(false)
    input.current?.focus()
  }

  const patch = (p: Partial<Draft>) => {
    setDraft((d) => (d ? { ...d, ...p } : d))
    setErrors({})
  }

  const understand = async () => {
    if (!text.trim() || busy) return
    setBusy(true); setError(null); setOffline(false)
    try {
      const p = await makimaApi.captureParse(text)
      if (p.kind === 'empty') { setPreview(null); setDraft(null) } else { setPreview(p); setDraft(draftFrom(p)); setErrors({}) }
    } catch (e) {
      if (e instanceof ApiError) setError(e.message || 'Não consegui entender agora. Tente de novo.')
      else { setOffline(true); setError('Sem conexão para entender a frase.') }
    } finally {
      setBusy(false)
    }
  }

  /** Grava (ou enfileira). `d` é o rascunho já validado; `ids` as pessoas confirmadas pela prévia. */
  const commit = async (d: Draft, ids: string[]) => {
    setBusy(true); setError(null)
    try {
      const r = await makimaApi.captureCommit(d.kind, fieldsFrom(d), ids)
      if (r.queued) {
        // O aviso "Sem internet — salvo no aparelho" já foi mostrado pela fila; não há o que desfazer ainda.
        reset(); onSaved(); return
      }
      toast(r.data.summary, {
        tone: 'success',
        undo: () => { makimaApi.captureUndo(r.data.undo).then(onSaved).catch(() => toast('Não foi possível desfazer. Confira no agente.', { tone: 'error' })) },
      })
      reset(); onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar. O que você escreveu continua aqui; tente de novo.')
    } finally {
      setBusy(false)
    }
  }

  const save = (e: FormEvent) => {
    e.preventDefault()
    if (!draft || busy) return
    const errs = validate(draft)
    setErrors(errs)
    if (Object.keys(errs).length) return
    void commit(draft, preview?.people.map((p) => p.id) ?? [])
  }

  const saveOffline = () => {
    const title = text.trim()
    if (title) void commit({ kind: 'task', title, valor: null, categoria: 'Inbox', data: '' }, [])
  }

  const speak = async () => {
    if (!voice) return
    try {
      const said = (await voice()).trim()
      if (said) { setText((t) => (t ? `${t} ${said}` : said)); setPreview(null); setDraft(null) }
    } catch { /* o provedor já avisa o usuário */ }
  }

  const categories = preview?.options?.categories ?? []
  const lowConfidence = preview?.confidence === 'low' && draft?.kind === 'task'

  return (
    <section aria-label="Registrar qualquer coisa" className="mk-cap">
      <form onSubmit={(e) => { e.preventDefault(); void understand() }} className="mk-cap-form">
        <Icon name="sparkles" size={18} />
        <input
          ref={input}
          className="mk-cap-in"
          aria-label="Registrar qualquer coisa"
          placeholder="Registre qualquer coisa: gastei 32 no ifood…"
          autoComplete="off"
          enterKeyHint="go"
          value={text}
          onChange={(e) => { setText(e.target.value); setPreview(null); setDraft(null); setOffline(false); setError(null) }}
          onKeyDown={(e) => { if (e.key === 'Escape') reset() }}
        />
        {voice && <Button type="button" variant="ghost" size="sm" icon="mic" aria-label="Falar" onClick={() => void speak()} />}
        <Button type="submit" variant={preview ? 'default' : 'primary'} size="sm" disabled={busy || !text.trim()}>
          {busy && !preview ? 'Entendendo…' : 'Entender'}
        </Button>
      </form>

      {!text && !preview && (
        <div className="mk-cap-ex" aria-label="Exemplos">
          {EXAMPLES.map((ex) => <button key={ex} type="button" className="mk-cap-chip" onClick={() => { setText(ex); input.current?.focus() }}>{ex}</button>)}
        </div>
      )}

      {preview && draft && (
        <form ref={previewBox} className="mk-cap-prev" onSubmit={save} onKeyDown={(e) => { if (e.key === 'Escape') reset() }} aria-label="Revise antes de salvar" noValidate>
          <div className="mk-cap-prev-h">
            <p className="mk-label" style={{ margin: 0 }}>Entendi assim</p>
            <SegmentedControl<CaptureKind> label="Tipo do registro" value={draft.kind} options={KIND_OPTIONS} onChange={(kind) => patch({ kind })} />
          </div>

          {lowConfidence && <p className="mk-cap-note" role="status">Não vi um gasto nem uma data nessa frase, então guardo como tarefa. Mude o tipo se não for isso.</p>}

          <div className="mk-cap-grid">
            <Field label={draft.kind === 'task' ? 'O que fazer' : 'Descrição'} error={errors.title} className="mk-cap-wide">
              {(c) => <Input {...c} value={draft.title} autoComplete="off" onChange={(e) => patch({ title: e.target.value })} />}
            </Field>
            {isMoney(draft.kind) && (
              <Field label="Valor" error={errors.valor}>
                {(c) => <MoneyInput {...c} value={draft.valor} onChange={(valor) => patch({ valor })} />}
              </Field>
            )}
            {draft.kind === 'expense' && categories.length > 0 && (
              <Field label="Categoria">
                {(c) => (
                  <Select {...c} value={draft.categoria} onChange={(e) => patch({ categoria: e.target.value })}>
                    {(categories.includes(draft.categoria) ? categories : [draft.categoria, ...categories]).map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                  </Select>
                )}
              </Field>
            )}
            <Field label={draft.kind === 'task' ? 'Para quando (opcional)' : 'Quando'}>
              {(c) => (
                <div className="mk-cap-date">
                  <DatePicker {...c} value={draft.data} onChange={(data) => patch({ data })} />
                  {draft.kind === 'task' && draft.data && <Button type="button" variant="ghost" size="sm" onClick={() => patch({ data: '' })}>Sem data</Button>}
                </div>
              )}
            </Field>
          </div>

          {preview.people.length > 0 && <p className="mk-cap-note"><Icon name="person" size={14} /> Com {preview.people.map((p) => p.name).join(', ')}</p>}
          {preview.warnings.map((w) => <p key={w} className="mk-cap-note" role="status"><Icon name="warning" size={14} /> {w}</p>)}

          <div className="mk-cap-actions">
            <Button type="button" variant="ghost" onClick={reset}>Cancelar</Button>
            <Button type="submit" variant="primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</Button>
          </div>
        </form>
      )}

      {error && (
        <div className="mk-cap-err" role="alert">
          <p>{error}</p>
          {offline && <Button size="sm" onClick={saveOffline} disabled={busy}>Guardar como tarefa</Button>}
        </div>
      )}
    </section>
  )
}
