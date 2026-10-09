// Editor de Markdown — lógica PURA (sem React/DOM): checklists, continuação de listas e formatação por seleção.
// A tela liga estas funções a um <textarea>; aqui só entram texto e posições, o que as torna testáveis.
// Blocos de código cercados (``` ou ~~~) são ignorados nas checklists (um "- [ ]" dentro de código é texto).

export interface Edit {
  text: string
  /** Seleção/cursor depois da edição. */
  start: number
  end: number
}

const FENCE = /^\s*(```|~~~)/
const ITEM = /^(\s*)([-*+]|\d+[.)])\s+(\[( |x|X)\]\s+)?/
const CHECK = /^(\s*[-*+]\s+\[)( |x|X)(\]\s)/

/** Índices das linhas que estão DENTRO de blocos de código cercados (inclui as cercas). */
function codeLines(lines: string[]): Set<number> {
  const inside = new Set<number>()
  let open: string | null = null
  lines.forEach((l, i) => {
    const m = FENCE.exec(l)
    if (open) { inside.add(i); if (m && m[1] === open) open = null }
    else if (m) { open = m[1]; inside.add(i) }
  })
  return inside
}

/** Quantas tarefas da checklist estão feitas/total (fora de código). */
export function checklistStats(md: string): { done: number; total: number } {
  const lines = md.split('\n')
  const code = codeLines(lines)
  let done = 0
  let total = 0
  lines.forEach((l, i) => {
    if (code.has(i)) return
    const m = CHECK.exec(l)
    if (m) { total++; if (m[2] !== ' ') done++ }
  })
  return { done, total }
}

/** Alterna a n-ésima checklist (0-based, fora de código). Devolve o texto novo (igual se o índice não existe). */
export function toggleChecklistItem(md: string, index: number): string {
  const lines = md.split('\n')
  const code = codeLines(lines)
  let seen = -1
  return lines.map((l, i) => {
    if (code.has(i)) return l
    const m = CHECK.exec(l)
    if (!m) return l
    seen++
    return seen === index ? l.replace(CHECK, `$1${m[2] === ' ' ? 'x' : ' '}$3`) : l
  }).join('\n')
}

/** Texto das checklists (fora de código), na ordem — para "virar subtarefa". */
export function checklistItems(md: string): { index: number; text: string; done: boolean }[] {
  const lines = md.split('\n')
  const code = codeLines(lines)
  const out: { index: number; text: string; done: boolean }[] = []
  lines.forEach((l, i) => {
    if (code.has(i)) return
    const m = CHECK.exec(l)
    if (m) out.push({ index: out.length, text: l.slice(m[0].length).trim(), done: m[2] !== ' ' })
  })
  return out
}

const lineBounds = (text: string, pos: number): [number, number] => {
  const s = text.lastIndexOf('\n', pos - 1) + 1
  const e = text.indexOf('\n', pos)
  return [s, e === -1 ? text.length : e]
}

/**
 * Enter no fim de um item de lista: continua a lista (próximo marcador, número +1, checklist desmarcada).
 * Em item vazio, sai da lista (apaga o marcador). `null` = não está numa lista (deixa o Enter normal).
 */
export function continueList(text: string, caret: number): Edit | null {
  const [s, e] = lineBounds(text, caret)
  if (caret !== e) return null // só continua com o cursor no fim da linha
  const line = text.slice(s, e)
  const m = ITEM.exec(line)
  if (!m) return null
  const indent = m[1]
  const rest = line.slice(m[0].length)
  if (!rest.trim()) {
    // item vazio → sai da lista
    const next = text.slice(0, s) + indent.slice(0, 0) + text.slice(e)
    return { text: next, start: s, end: s }
  }
  const marker = /\d/.test(m[2]) ? `${parseInt(m[2], 10) + 1}${m[2].slice(-1)}` : m[2]
  const box = m[3] ? '[ ] ' : ''
  const insert = `\n${indent}${marker} ${box}`
  return { text: text.slice(0, e) + insert + text.slice(e), start: e + insert.length, end: e + insert.length }
}

/** Tab / Shift+Tab em item de lista: recua ou avança dois espaços na(s) linha(s) da seleção. `null` se não for lista. */
export function indentLines(text: string, start: number, end: number, outdent: boolean): Edit | null {
  const [s] = lineBounds(text, start)
  const [, e] = lineBounds(text, end)
  const block = text.slice(s, e)
  const lines = block.split('\n')
  if (!lines.every((l) => ITEM.test(l))) return null
  let delta = 0
  const out = lines.map((l) => {
    if (outdent) {
      const strip = l.startsWith('  ') ? 2 : l.startsWith(' ') ? 1 : 0
      delta -= strip
      return l.slice(strip)
    }
    delta += 2
    return `  ${l}`
  })
  const next = text.slice(0, s) + out.join('\n') + text.slice(e)
  return { text: next, start: Math.max(s, start + (outdent ? Math.max(delta, -2) : 2)), end: Math.max(s, end + delta) }
}

/** Envolve a seleção com `before`/`after` (negrito, itálico, código). Se já estiver envolvida, desfaz. */
export function wrapSelection(text: string, start: number, end: number, before: string, after = before, placeholder = 'texto'): Edit {
  const sel = text.slice(start, end)
  if (sel.startsWith(before) && sel.endsWith(after) && sel.length >= before.length + after.length) {
    const inner = sel.slice(before.length, sel.length - after.length)
    return { text: text.slice(0, start) + inner + text.slice(end), start, end: start + inner.length }
  }
  if (text.slice(start - before.length, start) === before && text.slice(end, end + after.length) === after && start !== end) {
    return { text: text.slice(0, start - before.length) + sel + text.slice(end + after.length), start: start - before.length, end: end - before.length }
  }
  const body = sel || placeholder
  const next = text.slice(0, start) + before + body + after + text.slice(end)
  return { text: next, start: start + before.length, end: start + before.length + body.length }
}

/** Alterna um prefixo de linha (`# `, `> `, `- `, `1. `, `- [ ] `) em todas as linhas da seleção. */
export function toggleLinePrefix(text: string, start: number, end: number, prefix: string): Edit {
  const [s] = lineBounds(text, start)
  const [, e] = lineBounds(text, end)
  const lines = text.slice(s, e).split('\n')
  const all = lines.every((l) => l.startsWith(prefix))
  const out = lines.map((l, i) => {
    if (all) return l.slice(prefix.length)
    const p = /^\d+\.\s/.test(prefix) ? `${i + 1}. ` : prefix
    return l.replace(/^(#{1,6}\s|>\s|[-*+]\s\[( |x)\]\s|[-*+]\s|\d+\.\s)/, '') === l ? p + l : p + l.replace(/^(#{1,6}\s|>\s|[-*+]\s\[( |x)\]\s|[-*+]\s|\d+\.\s)/, '')
  })
  const block = out.join('\n')
  return { text: text.slice(0, s) + block + text.slice(e), start: s, end: s + block.length }
}

/** Transforma a seleção em link `[texto](url)`; sem seleção insere `[texto](url)` com "texto" selecionado. */
export function linkSelection(text: string, start: number, end: number, url: string): Edit {
  const label = text.slice(start, end) || 'texto'
  const md = `[${label}](${url})`
  return { text: text.slice(0, start) + md + text.slice(end), start: start + 1, end: start + 1 + label.length }
}

/** Colar uma URL sobre texto selecionado vira link; qualquer outro caso: `null` (cola normalmente). */
export function pasteUrlOverSelection(text: string, start: number, end: number, pasted: string): Edit | null {
  if (start === end || !/^https?:\/\/\S+$/i.test(pasted.trim())) return null
  return linkSelection(text, start, end, pasted.trim())
}
