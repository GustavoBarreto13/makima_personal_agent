// Leitor de SSE (Server-Sent Events) por `fetch`: o EventSource do navegador não envia o cabeçalho
// Authorization do app, então o chat lê o corpo da resposta como stream e interpreta os blocos aqui.

export interface SseEvent {
  event: string
  data: unknown
}

/**
 * Junta pedaços de texto do stream e devolve os eventos completos (blocos separados por linha em branco).
 * O resto incompleto fica em `rest` para ser somado ao próximo pedaço.
 *
 * @example parseSse('', 'event: delta\ndata: {"text":"oi"}\n\n') // { events: [{ event: 'delta', data: { text: 'oi' } }], rest: '' }
 */
export function parseSse(buffer: string, chunk: string): { events: SseEvent[]; rest: string } {
  const text = (buffer + chunk).replace(/\r\n/g, '\n')
  const blocks = text.split('\n\n')
  const rest = blocks.pop() ?? ''
  const events: SseEvent[] = []
  for (const block of blocks) {
    let event = 'message'
    const data: string[] = []
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim()
      else if (line.startsWith('data:')) data.push(line.slice(5).trim())
    }
    if (!data.length) continue
    try {
      events.push({ event, data: JSON.parse(data.join('\n')) })
    } catch {
      // bloco corrompido: ignora em vez de derrubar a conversa
    }
  }
  return { events, rest }
}
