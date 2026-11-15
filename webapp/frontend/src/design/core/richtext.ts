// richtext — texto formatado vindo de uma IA (negrito, itálico, código, listas, links) como ÁRVORE de nós.
// Motor puro (sem React/DOM). Nunca produz HTML: a camada `ui/prose.tsx` monta elementos React a partir dos nós,
// então qualquer outra coisa que apareça no texto (`<script>`, `javascript:`…) fica como texto comum, escapado.
//
// Aceita o que o Hermes costuma mandar: markdown (`**negrito**`, `*itálico*`, `` `código` ``, `- item`, `1. item`,
// `[rótulo](https://…)`, URL solta) e as tags simples `<b>`/`<i>`/`<code>` do formato do Telegram.

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'br' }
  | { t: 'b'; c: Inline[] }
  | { t: 'i'; c: Inline[] }
  | { t: 'code'; v: string }
  | { t: 'a'; href: string; c: Inline[] }

export type Block =
  | { t: 'p'; c: Inline[] }
  | { t: 'ul'; items: Inline[][] }
  | { t: 'ol'; items: Inline[][] }

const URL_RE = /^https?:\/\/[^\s<>"')\]]+/i
const TRAILING_PUNCT = /[.,;:!?]+$/
const WORD = /[\p{L}\p{N}]/u

/** Só http(s) vira link — `javascript:`, `data:` e afins nunca. */
export const isSafeUrl = (u: string): boolean => /^https?:\/\//i.test(u.trim())

/** Interpreta marcações dentro de uma linha. O que não fecha direito permanece como texto literal. */
export function parseInline(s: string): Inline[] {
  const out: Inline[] = []
  let buf = ''
  const flush = () => {
    if (buf) {
      out.push({ t: 'text', v: buf })
      buf = ''
    }
  }
  let i = 0
  while (i < s.length) {
    const rest = s.slice(i)
    let m: RegExpExecArray | null

    if ((m = /^`([^`\n]+)`/.exec(rest))) {
      flush(); out.push({ t: 'code', v: m[1] }); i += m[0].length; continue
    }
    if ((m = /^<code>([\s\S]+?)<\/code>/i.exec(rest))) {
      flush(); out.push({ t: 'code', v: m[1] }); i += m[0].length; continue
    }
    if ((m = /^(\*\*|__)(?=\S)([\s\S]+?)(?<=\S)\1/.exec(rest))) {
      flush(); out.push({ t: 'b', c: parseInline(m[2]) }); i += m[0].length; continue
    }
    if ((m = /^<(b|strong)>([\s\S]+?)<\/\1>/i.exec(rest))) {
      flush(); out.push({ t: 'b', c: parseInline(m[2]) }); i += m[0].length; continue
    }
    if ((m = /^<(i|em)>([\s\S]+?)<\/\1>/i.exec(rest))) {
      flush(); out.push({ t: 'i', c: parseInline(m[2]) }); i += m[0].length; continue
    }
    if ((m = /^\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/i.exec(rest))) {
      flush(); out.push({ t: 'a', href: m[2], c: parseInline(m[1]) }); i += m[0].length; continue
    }
    if ((m = URL_RE.exec(rest))) {
      const url = m[0].replace(TRAILING_PUNCT, '')
      flush(); out.push({ t: 'a', href: url, c: [{ t: 'text', v: url }] }); i += url.length; continue
    }
    // Itálico: `*x*` sempre; `_x_` só fora de palavra (não estraga snake_case).
    if ((m = /^(\*|_)(?=[^\s*_])([^*_\n]+?)(?<=[^\s*_])\1/.exec(rest))) {
      const prev = buf.slice(-1)
      if (m[1] === '*' || !prev || !WORD.test(prev)) {
        flush(); out.push({ t: 'i', c: parseInline(m[2]) }); i += m[0].length; continue
      }
    }
    buf += s[i]
    i++
  }
  flush()
  return out
}

const UL_RE = /^\s*[-*•]\s+(.*)$/
const OL_RE = /^\s*\d+[.)]\s+(.*)$/

/** Quebra o texto em blocos: parágrafos (com quebras de linha), listas com marcadores e listas numeradas. */
export function parseRichText(text: string): Block[] {
  const lines = (text ?? '').replace(/\r\n?/g, '\n').split('\n')
  const blocks: Block[] = []
  let para: string[] = []
  let list: { kind: 'ul' | 'ol'; items: string[] } | null = null

  const flushPara = () => {
    if (!para.length) return
    const c: Inline[] = []
    para.forEach((line, idx) => {
      if (idx > 0) c.push({ t: 'br' })
      c.push(...parseInline(line))
    })
    blocks.push({ t: 'p', c })
    para = []
  }
  const flushList = () => {
    if (!list) return
    blocks.push({ t: list.kind, items: list.items.map(parseInline) })
    list = null
  }

  for (const line of lines) {
    if (!line.trim()) {
      flushPara(); flushList(); continue
    }
    const ul = UL_RE.exec(line)
    const ol = ul ? null : OL_RE.exec(line)
    const item = ul ?? ol
    if (item) {
      flushPara()
      const kind = ul ? 'ul' : 'ol'
      if (list && list.kind !== kind) flushList()
      if (!list) list = { kind, items: [] }
      list.items.push(item[1])
      continue
    }
    flushList()
    para.push(line.trim())
  }
  flushPara(); flushList()
  return blocks
}
