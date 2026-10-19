// Onde o cursor deve cair quando você toca no texto de um momento já escrito: a posição (em caracteres)
// do ponto tocado dentro do texto desenhado, traduzida para o texto de exibição do campo (onde os chips
// aparecem só com o nome). Se o desenho não bater com o texto guardado, o cursor vai para o fim.

import { displayOffsetFromRendered, renderedText, toDisplay } from './markup'

type CaretDoc = Document & {
  caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
  caretRangeFromPoint?: (x: number, y: number) => Range | null
}

/** Caracteres antes do ponto (x, y) dentro de ``container``; ``null`` se o navegador não souber dizer. */
export function caretOffsetFromPoint(container: HTMLElement, x: number, y: number): number | null {
  const doc = container.ownerDocument as CaretDoc
  let node: Node | null = null
  let offset = 0
  if (doc.caretPositionFromPoint) {
    const p = doc.caretPositionFromPoint(x, y)
    if (p) { node = p.offsetNode; offset = p.offset }
  } else if (doc.caretRangeFromPoint) {
    const r = doc.caretRangeFromPoint(x, y)
    if (r) { node = r.startContainer; offset = r.startOffset }
  }
  if (!node || !container.contains(node)) return null
  const range = doc.createRange()
  range.selectNodeContents(container)
  range.setEnd(node, offset)
  return range.toString().length
}

/** Posição do cursor (no texto de exibição) para editar ``raw`` depois de um toque em ``container``. */
export function caretForEdit(container: HTMLElement, raw: string, x: number, y: number): number {
  const end = toDisplay(raw).text.length
  if ((container.textContent ?? '') !== renderedText(raw)) return end
  const at = caretOffsetFromPoint(container, x, y)
  return at === null ? end : displayOffsetFromRendered(raw, at) ?? end
}
