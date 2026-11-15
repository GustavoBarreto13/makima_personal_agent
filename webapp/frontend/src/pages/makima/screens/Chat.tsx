// Aba "Conversar": chat com a Makima (Hermes). Conversa própria do app, resposta em tempo real, texto formatado,
// cartões em português do que os agentes fizeram, Parar, tentar de novo e rolagem que não puxa quem subiu para ler.
// A memória de longo prazo do Hermes é a mesma do WhatsApp; só o histórico mostrado aqui é do app.

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Button, EmptyState, ErrorState, Icon, LoadingState, Page, RichText, confirm, toast } from '../../../design'
import { getAgent, type AgentId } from '../../../design/core/agents'
import { useKeyboardInset } from '../../../design/headless/useKeyboardInset'
import { useVoiceProvider } from '../../../design/headless/voice'
import { makimaApi } from '../makimaApi'
import { actionText, formatClock, prefersTouchKeyboard, useLoad } from '../lib'
import type { ChatAction, ChatMessage } from '../types'

const SUGGESTIONS = ['O que eu tenho hoje?', 'Quanto posso gastar este mês?', 'Resumo da minha semana']
/** Distância do fim (px) até onde ainda consideramos que o usuário está "acompanhando" a conversa. */
const NEAR_BOTTOM = 96

// Última conversa vista: reabrir a aba mostra isso na hora e atualiza em silêncio (sem piscar esqueleto).
let cache: { enabled: boolean; messages: ChatMessage[] } | null = null
/** Só para testes: limpa o cache entre casos. */
export const __resetChatCache = () => { cache = null }

export function Chat({ go }: { go: (href: string) => void }) {
  const { state, retry } = useLoad(async () => {
    const [status, hist] = await Promise.all([makimaApi.chatStatus(), makimaApi.chatHistory()])
    return { enabled: status.enabled, messages: hist.messages }
  })
  const [messages, setMessages] = useState<ChatMessage[]>(() => cache?.messages ?? [])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [failed, setFailed] = useState<{ text: string; message: string } | null>(null)
  const [unseen, setUnseen] = useState(0)
  const log = useRef<HTMLDivElement>(null)
  const area = useRef<HTMLTextAreaElement>(null)
  const nearBottom = useRef(true)
  const abort = useRef<AbortController | null>(null)
  const voice = useVoiceProvider()
  const inset = useKeyboardInset()

  const enabled = state.status === 'ok' ? state.data.enabled : cache?.enabled
  // O histórico do servidor entra UMA vez por carga, e nunca por cima de uma conversa em andamento
  // (senão, ao terminar a resposta, a tela voltaria ao histórico antigo e apagaria as mensagens novas).
  const sendingRef = useRef(false)
  sendingRef.current = sending
  const appliedAt = useRef(0)
  useEffect(() => {
    if (state.status === 'ok' && state.at !== appliedAt.current && !sendingRef.current) {
      appliedAt.current = state.at
      setMessages(state.data.messages)
    }
  }, [state])
  useEffect(() => { if (enabled !== undefined) cache = { enabled, messages } }, [enabled, messages])
  useEffect(() => () => abort.current?.abort(), [])

  const toBottom = useCallback((smooth = false) => {
    const el = log.current
    if (!el) return
    el.scrollTo?.({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
    nearBottom.current = true
    setUnseen(0)
  }, [])

  // Novas mensagens: segue o fim só se o usuário já estava perto dele; senão avisa com um botão.
  const lastLen = useRef(0)
  useLayoutEffect(() => {
    const grew = messages.length > lastLen.current
    lastLen.current = messages.length
    if (nearBottom.current) toBottom()
    else if (grew) setUnseen((n) => n + 1)
  }, [messages, toBottom])

  // Caixa de texto que cresce com o que se escreve (até o limite do CSS).
  useLayoutEffect(() => {
    const el = area.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [text])

  const onScroll = () => {
    const el = log.current
    if (!el) return
    nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM
    if (nearBottom.current) setUnseen(0)
  }

  const send = useCallback(async (raw: string) => {
    const msg = raw.trim()
    if (!msg || sending) return
    setFailed(null)
    setSending(true)
    setText('')
    nearBottom.current = true // quem manda uma mensagem quer ver a resposta
    const stamp = Date.now()
    const iso = new Date(stamp).toISOString()
    const botId = `a${stamp}`
    setMessages((m) => [...m, { id: `u${stamp}`, role: 'user', content: msg, actions: [], created_at: iso }, { id: botId, role: 'assistant', content: '', actions: [], created_at: iso }])
    const patchBot = (fn: (m: ChatMessage) => ChatMessage) => setMessages((all) => all.map((m) => (m.id === botId ? fn(m) : m)))
    const dropEmptyBot = () => setMessages((all) => all.filter((m) => m.id !== botId || m.content))
    abort.current = new AbortController()
    try {
      await makimaApi.chatStream(msg, {
        onDelta: (t) => patchBot((m) => ({ ...m, content: m.content + t })),
        onAction: (a) => patchBot((m) => ({ ...m, actions: [...m.actions, a] })),
        onDone: () => undefined,
        onError: (message) => { setFailed({ text: msg, message }); dropEmptyBot() },
      }, abort.current.signal)
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        patchBot((m) => ({ ...m, stopped: true }))
        dropEmptyBot()
      } else {
        setFailed({ text: msg, message: e instanceof Error ? e.message : 'Não consegui falar com a Makima agora.' })
        dropEmptyBot()
      }
    } finally {
      setSending(false)
      abort.current = null
    }
  }, [sending])

  const stop = () => abort.current?.abort()

  const clear = async () => {
    const ok = await confirm({ title: 'Limpar a conversa do app?', body: 'O histórico daqui será apagado. O que a Makima sabe sobre você continua com ela.', confirmLabel: 'Limpar', danger: true })
    if (!ok) return
    try {
      await makimaApi.chatClear()
      setMessages([]); setFailed(null)
      toast('Conversa limpa', { tone: 'success' })
    } catch {
      toast('Não foi possível limpar agora. Tente de novo.', { tone: 'error' })
    }
  }

  const speak = async () => {
    if (!voice) return
    try { const said = (await voice()).trim(); if (said) setText((t) => (t ? `${t} ${said}` : said)) } catch { /* o provedor já avisa */ }
  }

  // Celular: Enter quebra a linha e o botão envia. Computador: Enter envia, Shift+Enter quebra a linha.
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !prefersTouchKeyboard()) { e.preventDefault(); void send(text) }
  }
  const submit = (e: FormEvent) => { e.preventDefault(); void send(text) }

  if (enabled === undefined) {
    if (state.status === 'error') return <Page fill><div className="mk-chat"><ErrorState onRetry={retry} /></div></Page>
    return <Page fill><div className="mk-chat"><LoadingState variant="row" count={4} label="Abrindo a conversa…" /></div></Page>
  }
  if (!enabled) {
    return <Page fill><div className="mk-chat"><EmptyState icon="journal" title="O chat ainda não está ligado" hint="Falta ligar o servidor do chat com a Makima. Enquanto isso, ela continua no Telegram, WhatsApp e Discord." /></div></Page>
  }

  return (
    <Page fill>
      <div className="mk-chat" style={inset ? { paddingBottom: inset } : undefined}>
        {messages.length > 0 && (
          <div className="mk-chat-top">
            <Button variant="ghost" size="sm" icon="delete" onClick={() => void clear()} disabled={sending}>Limpar conversa</Button>
          </div>
        )}

        <div className="mk-chat-main">
          <div className="mk-chat-log" ref={log} onScroll={onScroll} role="log" aria-live="polite" aria-label="Conversa com a Makima">
            {messages.length === 0 && (
              <div className="mk-chat-empty">
                <EmptyState portrait={getAgent('makima').portrait ?? undefined} title="Fale com a Makima" hint="Peça, pergunte ou registre. Ela usa os mesmos dados do app." />
                <div className="mk-cap-ex">{SUGGESTIONS.map((s) => <button key={s} type="button" className="mk-cap-chip" onClick={() => void send(s)}>{s}</button>)}</div>
              </div>
            )}
            {messages.map((m) => <Bubble key={m.id} m={m} go={go} />)}
            {failed && (
              <div className="mk-msg" data-role="error" role="alert">
                <p>{failed.message}</p>
                <Button size="sm" onClick={() => void send(failed.text)}>Tentar de novo</Button>
              </div>
            )}
          </div>
          {unseen > 0 && <button type="button" className="mk-chat-new" onClick={() => toBottom(true)}><Icon name="down" size={14} /> Ir para o fim</button>}
        </div>

        <form className="mk-chat-bar" onSubmit={submit}>
          <textarea
            ref={area}
            className="mk-chat-in"
            aria-label="Mensagem para a Makima"
            placeholder="Mensagem…"
            rows={1}
            enterKeyHint="enter"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKey}
          />
          {voice && !sending && <Button type="button" variant="ghost" icon="mic" aria-label="Falar" onClick={() => void speak()} />}
          {sending
            ? <Button type="button" icon="close" onClick={stop}>Parar</Button>
            : <Button type="submit" variant="primary" icon="send" aria-label="Enviar" disabled={!text.trim()} />}
        </form>
      </div>
    </Page>
  )
}

function Bubble({ m, go }: { m: ChatMessage; go: (href: string) => void }) {
  const thinking = m.role === 'assistant' && !m.content
  return (
    <div className="mk-msg" data-role={m.role}>
      {thinking
        ? <p className="mk-dots" role="status" aria-label="A Makima está respondendo"><i /><i /><i /></p>
        : m.role === 'assistant' ? <RichText text={m.content} /> : <p>{m.content}</p>}
      {m.actions.length > 0 && <div className="mk-list">{m.actions.map((a, i) => <ActionCard key={`${a.tool}-${i}`} action={a} go={go} />)}</div>}
      {m.stopped && <p className="mk-msg-note">Resposta interrompida.</p>}
      {!thinking && m.created_at && <time className="mk-msg-time" dateTime={m.created_at}>{formatClock(m.created_at)}</time>}
    </div>
  )
}

function ActionCard({ action, go }: { action: ChatAction; go: (href: string) => void }) {
  const agent = action.agent ? getAgent(action.agent as AgentId) : null
  return (
    <button type="button" className="mk-row" data-agent={agent?.id} onClick={() => go(agent?.route ?? '/')}>
      <span className="mk-ic" data-tone="focus"><Icon name="check" size={16} /></span>
      <span className="mk-row-t"><strong>{actionText(action, agent?.domain)}</strong><span>{agent ? `Abrir ${agent.name}` : 'Makima'}</span></span>
    </button>
  )
}
