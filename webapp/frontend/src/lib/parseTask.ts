// Parser determinístico pt-BR do quick-add (guia §6). Reconhece, no MVP:
//   @lista       → lista/projeto (token, resolvido depois contra a sidebar)
//   !alta|!média|!baixa → prioridade
// `#tag`, datas e recorrência são da Fase 2 — aqui `#` NÃO vira lista.
//
// Preserva posições para o highlight ao vivo (ParseMirror): devolve `segments`
// com a classe de cada pedaço do texto.

// Um pedaço do texto com sua classe de destaque (vazia = texto comum).
export interface ParseSegment {
  text: string
  cls: string
}

export interface ParsedTask {
  title: string                 // texto limpo (sem os tokens reconhecidos)
  projectToken: string | null   // texto após o @ (nome da lista a resolver)
  priority: number | null       // 1..3 ou null
  segments: ParseSegment[]      // para o mirror
}

// Palavras de prioridade → nível numérico.
const PRIO: Record<string, number> = { alta: 3, media: 2, 'média': 2, baixa: 1 }

/**
 * Tokeniza a entrada do quick-add preservando os espaços (para o mirror).
 *
 * @param input Texto digitado pelo usuário.
 * @returns Título limpo + token de lista + prioridade + segmentos coloridos.
 */
export function parseTask(input: string): ParsedTask {
  const segments: ParseSegment[] = []
  const titleParts: string[] = []
  let projectToken: string | null = null
  let priority: number | null = null

  // split que mantém os espaços como tokens próprios (grupos de captura).
  const tokens = input.split(/(\s+)/)
  for (const tok of tokens) {
    if (tok === '') continue
    if (/^\s+$/.test(tok)) { segments.push({ text: tok, cls: '' }); continue }

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
    segments,
  }
}
