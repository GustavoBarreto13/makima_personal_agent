// Parser determinístico pt-BR do quick-add (guia §6). Reconhece:
//   @lista              → lista/projeto (token, resolvido depois contra a sidebar)
//   !alta|!média|!baixa → prioridade
//   datas (via parseDate): hoje, amanhã, sexta, próxima segunda, DD/MM, 17h, 17:30
// `#tag` é da fatia 013 — aqui `#` NÃO vira lista nem data (fica no título).
//
// Preserva posições para o highlight ao vivo (ParseMirror): devolve `segments`
// com a classe de cada pedaço do texto.

import { parseDate } from './parseDate'

// Um pedaço do texto com sua classe de destaque (vazia = texto comum).
export interface ParseSegment {
  text: string
  cls: string
}

export interface ParsedTask {
  title: string                 // texto limpo (sem os tokens reconhecidos)
  projectToken: string | null   // texto após o @ (nome da lista a resolver)
  priority: number | null       // 1..3 ou null
  dueDate: string | null        // "YYYY-MM-DD" ou null (parseDate)
  dueTime: string | null        // "HH:MM" ou null (parseDate)
  segments: ParseSegment[]      // para o mirror
}

// Palavras de prioridade → nível numérico.
const PRIO: Record<string, number> = { alta: 3, media: 2, 'média': 2, baixa: 1 }

/**
 * Tokeniza a entrada do quick-add preservando os espaços (para o mirror).
 *
 * @param input Texto digitado pelo usuário.
 * @returns Título limpo + token de lista + prioridade + data/hora + segmentos coloridos.
 */
export function parseTask(input: string): ParsedTask {
  // split que mantém os espaços como tokens próprios (grupos de captura).
  const raw = input.split(/(\s+)/)

  // Lista ordenada de tokens NÃO-espaço (é o que o parseDate enxerga).
  const words: string[] = []
  for (const tok of raw) {
    if (tok !== '' && !/^\s+$/.test(tok)) words.push(tok)
  }

  // Datas/horas primeiro: parseDate diz quais índices (na ordem de `words`) consumir.
  const { dueDate, dueTime, consumed } = parseDate(words)

  const segments: ParseSegment[] = []
  const titleParts: string[] = []
  let projectToken: string | null = null
  let priority: number | null = null
  let wordI = -1   // índice do token não-espaço atual (alinha com `consumed`)

  for (const tok of raw) {
    if (tok === '') continue
    if (/^\s+$/.test(tok)) { segments.push({ text: tok, cls: '' }); continue }
    wordI++

    // Consumido como data/hora → pinta de tok-date e NÃO entra no título.
    if (consumed.has(wordI)) { segments.push({ text: tok, cls: 'tok-date' }); continue }

    // @lista → token de projeto
    if (tok.startsWith('@') && tok.length > 1) {
      projectToken = tok.slice(1)
      segments.push({ text: tok, cls: 'tok-proj' })
      continue
    }
    // !prioridade
    if (tok.startsWith('!')) {
      const p = PRIO[tok.slice(1).toLowerCase()]
      if (p !== undefined) {
        priority = p
        segments.push({ text: tok, cls: `tok-prio-${p}` })
        continue
      }
    }
    // texto comum → entra no título
    segments.push({ text: tok, cls: '' })
    titleParts.push(tok)
  }

  return {
    title: titleParts.join(' ').replace(/\s+/g, ' ').trim(),
    projectToken,
    priority,
    dueDate,
    dueTime,
    segments,
  }
}
