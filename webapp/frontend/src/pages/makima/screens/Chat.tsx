// Aba "Conversar": chat com a Makima (Hermes). Conversa própria do app, resposta em streaming,
// cartões do que os agentes fizeram e tentar de novo quando falha. A memória do Hermes é a mesma do WhatsApp.

import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Button, EmptyState, ErrorState, Icon, LoadingState, Page, confirm, toast } from '../../../design'
import { getAgent, type AgentId } from '../../../design/core/agents'
import { useVoiceProvider } from '../../../design/headless/voice'
import { makimaApi } from '../makimaApi'
import { QUICK_ACTIONS, useLoad } from '../lib'
import type { ChatAction, ChatMessage } from '../types'

const SUGGESTIONS = ['O que eu tenho hoje?', 'Quanto posso gastar este mês?', 'Resumo da minha semana']

export function Chat({ go }: { go: (href: string) => void }) {
  const { state, retry } = useLoad(async () => {
    const [status, hist] = await Promise.all([makimaApi.chatStatus(), makimaApi.chatHistory()])
    return { enabled: status.enabled, messages: hist.messages }
  })
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [failed, setFailed] = useState<{ text: string; message: string } | null>(null)
  const end = useRef<HTMLDivElement>(null)
  const abort = useRef<AbortController | null>(null)
  const voice = useVoiceProvider()

  useEffect(() => { if (state.status === 'ok') setMessages(state.data.messages) }, [state])
  useEffect(() => { end.current?.scrollIntoView?.({ block: 'end' }) }, [messages])
  useEffect(() => () => abort.current?.abort(), [])

  const send = useCallback(async (raw: string) => {
    const msg = raw.trim()
    if (!msg || sending) return
    setFailed(null)
    setSending(true)
    setText('')
    const stamp = Date.now()
    setMessages((m) => [...m, { id: `u${stamp}`, role: 'user', content: msg, actions: [] }, { id: `a${stamp}`, role: 'assistant', content: '', actions: [] }])
    const patchLast = (fn: (m: ChatMessage) => ChatMessage) => setMessages((all) => all.map((m) => (m.id === `a${stamp}` ? fn(m) : m)))
    abort.current = new AbortController()
    try {
      await makimaApi.chatStream(msg, {
        onDelta: (t) => patchLast((m) => ({ ...m, content: m.content + t })),
        onAction: (a) => patchLast((m) => ({ ...m, actions: [...m.actions, a] })),
        onDone: () => undefined,
        onError: (message) => { setFailed({ text: msg, message }); setMessages((all) => all.filter((m) => m.id !== `a${stamp}` || m.content)) },
      }, abort.current.signal)
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      setFailed({ text: msg, message: e instanceof Error ? e.message : 'Não consegui falar com a Makima agora.' })
      setMessages((all) => all.filter((m) => m.id !== `a${stamp}` || m.content))
    } finally {
      setSending(false)
    }
  }, [sending])

  const clear = async () => {
    const ok = await confirm({ title: 'Limpar a conversa do app?', body: 'O histórico daqui será apagado. O que a Makima sabe sobre você continua com ela.', confirmLabel: 'Limpar', danger: true })
    if (!ok) return
    try {
      await makimaApi.chatClear()
      setMessages([])
      toast('Conversa limpa', { tone: 'success' })
    } catch {
      toast('Não foi possível limpar agora. Tente de novo.', { tone: 'error' })
    }
  }

  const speak = async () => {
    if (!voice) return
    try { const said = (await voice()).trim(); if (said) setText((t) => (t ? `${t} ${said}` : said)) } catch { /* o provedor já avisa */ }
  }
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(text) } }
  const submit = (e: FormEvent) => { e.preventDefault(); void send(text) }

  if (state.status === 'loading') return <Page><LoadingState variant="row" count={4} label="Abrindo a conversa…" /></Page>
  if (state.status === 'error') return <Page><ErrorState onRetry={retry} /></Page>
  if (!state.data.enabled) {
    return <Page><EmptyState icon="journal" title="O chat ainda não está ligado" hint="Falta ligar o servidor do chat com a Makima. Enquanto isso, ela continua no Telegram, WhatsApp e Discord." /></Page>
  }

  return (
    <Page>
      <div className="mk-chat">
        <div className="mk-chat-log" role="log" aria-live="polite" aria-label="Conversa com a Makima">
          {messages.length === 0 && (
            <div className="mk-chat-empty">
              <EmptyState portrait={getAgent('makima').portrait ?? undefined} title="Fale com a Makima" hint="Peça, pergunte ou registre. Ela usa os mesmos dados do app." />
              <div className="mk-cap-ex">{SUGGESTIONS.map((s) => <button key={s} type="button" className="mk-cap-chip" onClick={() => void send(s)}>{s}</button>)}</div>
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className="mk-msg" data-role={m.role}>
              {m.content ? <p>{m.content}</p> : <p className="mk-agent-k"><Icon name="timer" size={14} /> Pensando…</p>}
              {m.actions.length > 0 && <div className="mk-list">{m.actions.map((a, i) => <ActionCard key={`${a.tool}-${i}`} action={a} go={go} />)}</div>}
            </div>
          ))}
          {failed && (
            <div className="mk-msg" data-role="error" role="alert">
              <p>{failed.message}</p>
              <Button size="sm" onClick={() => void send(failed.text)}>Tentar de novo</Button>
            </div>
          )}
          <div ref={end} />
        </div>

        <form className="mk-chat-bar" onSubmit={submit}>
          <textarea
            className="mk-chat-in"
            aria-label="Mensagem para a Makima"
            placeholder="Mensagem…"
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKey}
          />
          {voice && <Button type="button" variant="ghost" icon="mic" aria-label="Falar" onClick={() => void speak()} />}
          <Button type="submit" variant="primary" icon="send" aria-label="Enviar" disabled={sending || !text.trim()} />
          {messages.length > 0 && <Button type="button" variant="ghost" icon="delete" aria-label="Limpar conversa" onClick={() => void clear()} />}
        </form>
      </div>
    </Page>
  )
}

function ActionCard({ action, go }: { action: ChatAction; go: (href: string) => void }) {
  const agent = action.agent ? getAgent(action.agent as AgentId) : null
  const quick = agent ? QUICK_ACTIONS[agent.id] : undefined
  return (
    <button type="button" className="mk-row" data-agent={agent?.id} onClick={() => go(agent?.route ?? '/')}>
      <span className="mk-ic" data-tone="focus"><Icon name="check" size={16} /></span>
      <span className="mk-row-t"><strong>{agent?.name ?? 'Makima'} · {action.label}</strong><span>Feito pelo chat</span></span>
      <span className="mk-row-a">{quick ? 'Abrir' : 'Ver'}</span>
    </button>
  )
}
