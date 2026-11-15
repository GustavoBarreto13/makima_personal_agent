// Cliente tipado dos endpoints da home (/api/hub/*, /api/chat/*). Os componentes nunca chamam `fetch` direto.

import { api, authFetch, errorFromResponse } from '../../lib/api'
import { parseSse } from './sse'
import type { CaptureKind, CapturePreview, CaptureUndo, ChatAction, ChatMessage, HubSummary, SearchHit, TodayPayload } from './types'

export interface ChatStreamHandlers {
  onDelta: (text: string) => void
  onAction: (action: ChatAction) => void
  onDone: () => void
  onError: (message: string) => void
}

export const makimaApi = {
  /** Painel "Hoje": agora, precisa de você e números (cada bloco já isolado no backend). */
  today: () => api.get<TodayPayload>('/api/hub/today'),
  /** Dois números reais por agente, para a aba Agentes. */
  summary: () => api.get<HubSummary>('/api/hub/summary'),

  /** Prévia da captura universal — não grava nada. */
  captureParse: (text: string) => api.post<CapturePreview>('/api/hub/capture/parse', { text }),
  /** Grava o que a prévia mostrou. `key` evita duplicar se o envio for repetido. */
  captureCommit: async (kind: CaptureKind, fields: Record<string, unknown>, personIds: string[], key: string) => {
    const res = await authFetch('/api/hub/capture/commit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
      body: JSON.stringify({ kind, fields, person_ids: personIds }),
    })
    if (!res.ok) throw await errorFromResponse(res)
    return (await res.json()) as { status: string; summary: string; undo: CaptureUndo }
  },
  captureUndo: (undo: CaptureUndo) => api.post<{ status: string }>('/api/hub/capture/undo', undo),

  /** Busca por título/nome em todos os agentes (a partir de 2 letras). */
  search: (q: string) => api.get<{ q: string; results: SearchHit[]; errors: string[] }>(`/api/hub/search?q=${encodeURIComponent(q)}`),

  chatStatus: () => api.get<{ enabled: boolean }>('/api/chat/status'),
  chatHistory: () => api.get<{ messages: ChatMessage[] }>('/api/chat/history?limit=60'),
  chatClear: () => api.del<{ status: string; removed: number }>('/api/chat/history'),

  /** Envia uma mensagem e lê a resposta em streaming (SSE). Resolve quando o stream termina. */
  chatStream: async (message: string, h: ChatStreamHandlers, signal?: AbortSignal): Promise<void> => {
    const res = await authFetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
      signal,
    })
    if (!res.ok) throw await errorFromResponse(res)
    if (!res.body) throw new Error('Sem resposta do servidor.')
    const reader = res.body.getReader()
    const dec = new TextDecoder()
    let rest = ''
    let finished = false
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      const parsed = parseSse(rest, dec.decode(value, { stream: true }))
      rest = parsed.rest
      for (const ev of parsed.events) {
        const d = ev.data as Record<string, unknown>
        if (ev.event === 'delta') h.onDelta(String(d.text ?? ''))
        else if (ev.event === 'action') h.onAction(d as unknown as ChatAction)
        else if (ev.event === 'error') { finished = true; h.onError(String(d.message ?? 'Não foi possível responder.')) }
        else if (ev.event === 'done') { finished = true; h.onDone() }
      }
    }
    if (!finished) h.onDone()
  },
}
