// Conversa sobre o Conselho do Dia: você responde, a Violet responde de volta — mesmo tom, contexto do conselho e
// citações [N] da sua base (validadas no servidor, agents/kurisu/counsel_chat.py). Um fio por dia; regerar o
// conselho mantém o fio com uma divisória. A sua mensagem aparece na hora; se a Violet falhar, o texto volta ao campo.

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Button, Field, Textarea, toast } from '../../../design'
import { violetApi } from '../violetApi'
import type { CounselMessage } from '../types'
import { Essay } from './Essay'

const fmtTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : ''

export function CounselThread({ date, messages, onChange }: {
  date: string
  messages: CounselMessage[]
  onChange: (messages: CounselMessage[]) => void
}) {
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const area = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    const el = area.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [draft])

  async function send(e?: FormEvent) {
    e?.preventDefault()
    const text = draft.trim()
    if (!text || pending) return
    setPending(text); setDraft('')
    try {
      const r = await violetApi.replyCounsel(date, text)
      onChange([...messages, ...r.messages])
    } catch (err) {
      setDraft(text)
      toast(err instanceof Error && err.message ? err.message : 'A Violet não conseguiu responder agora.', { tone: 'error' })
    } finally {
      setPending(null)
    }
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void send() }
  }

  return (
    <section className="vl-thread" aria-label="Conversa com a Violet">
      <h4>{messages.length || pending ? 'Conversa' : 'Quer responder?'}</h4>
      {(messages.length > 0 || pending) && (
        <ol className="vl-thread-list">
          {messages.map((m) => m.role === 'marker' ? (
            <li key={m.id} className="vl-msg-marker"><span>Conselho regerado{m.created_at ? ` · ${fmtTime(m.created_at)}` : ''}</span></li>
          ) : m.role === 'user' ? (
            <li key={m.id} className="vl-msg vl-msg-user">
              <span className="vl-msg-who">Você</span>
              <p>{m.content_md}</p>
            </li>
          ) : (
            <li key={m.id} className="vl-msg vl-msg-violet">
              <span className="vl-msg-who">Violet</span>
              <Essay markdown={m.content_md} sources={m.sources} className="vl-essay-reply" />
            </li>
          ))}
          {pending && (
            <>
              <li className="vl-msg vl-msg-user"><span className="vl-msg-who">Você</span><p>{pending}</p></li>
              <li className="vl-msg vl-msg-violet vl-msg-pending" role="status" aria-live="polite">A Violet está escrevendo…</li>
            </>
          )}
        </ol>
      )}
      <form className="vl-thread-compose" onSubmit={(e) => void send(e)}>
        <Field label="Responder à Violet" hint="Ctrl+Enter envia">
          {(c) => (
            <Textarea
              {...c}
              ref={area}
              rows={2}
              value={draft}
              disabled={!!pending}
              maxLength={4000}
              placeholder="Concorde, discorde ou conte o que ela não sabe…"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKey}
            />
          )}
        </Field>
        <Button type="submit" variant="primary" icon="send" disabled={!draft.trim() || !!pending}>Enviar</Button>
      </form>
    </section>
  )
}
