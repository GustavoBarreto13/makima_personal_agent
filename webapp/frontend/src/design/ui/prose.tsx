// <RichText> — texto formatado (negrito, itálico, código, listas, links) vindo de uma IA.
// Monta ELEMENTOS React a partir da árvore de `core/richtext`; nunca usa `dangerouslySetInnerHTML`.

import { Fragment, useMemo } from 'react'
import { parseRichText, type Block, type Inline } from '../core/richtext'

function renderInline(nodes: Inline[], keyPrefix: string) {
  return nodes.map((n, i) => {
    const key = `${keyPrefix}-${i}`
    switch (n.t) {
      case 'text': return <Fragment key={key}>{n.v}</Fragment>
      case 'br': return <br key={key} />
      case 'b': return <strong key={key}>{renderInline(n.c, key)}</strong>
      case 'i': return <em key={key}>{renderInline(n.c, key)}</em>
      case 'code': return <code key={key}>{n.v}</code>
      case 'a': return <a key={key} href={n.href} target="_blank" rel="noopener noreferrer">{renderInline(n.c, key)}</a>
    }
  })
}

function renderBlock(b: Block, i: number) {
  const key = `b${i}`
  if (b.t === 'p') return <p key={key}>{renderInline(b.c, key)}</p>
  const items = b.items.map((it, j) => <li key={`${key}-${j}`}>{renderInline(it, `${key}-${j}`)}</li>)
  return b.t === 'ul' ? <ul key={key}>{items}</ul> : <ol key={key}>{items}</ol>
}

export function RichText({ text, className }: { text: string; className?: string }) {
  const blocks = useMemo(() => parseRichText(text), [text])
  return <div className={className ? `ds-prose ${className}` : 'ds-prose'}>{blocks.map(renderBlock)}</div>
}
