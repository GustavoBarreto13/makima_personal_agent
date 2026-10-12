// Texto longo da Violet (Conselho do Dia, Revisão semanal, leitura emocional) em Markdown, com as citações [N]
// da base virando botões: tocar mostra de qual nota veio, com a lista completa de Referências no fim.
// As fontes já chegam validadas pelo servidor (violet_ai.normalizar_citacoes) — aqui só se desenha.

import { useState, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Icon, Sheet } from '../../../design'
import type { Source } from '../types'

const CITE = /\[(\d{1,3}(?:\s*,\s*\d{1,3})*)\]/g
const withCiteLinks = (md: string) => md.replace(CITE, (_m, nums: string) => nums.split(',').map((n) => `[${n.trim()}](cite:${n.trim()})`).join(''))
const safeUrl = (url: string) => (/^\s*(javascript|data|vbscript):/i.test(url) ? '' : url)

export function Essay({ markdown, sources, className }: { markdown: string; sources: Source[]; className?: string }) {
  const [open, setOpen] = useState<Source | null>(null)
  const byN = new Map(sources.map((s) => [String(s.n), s]))
  return (
    <div className={`vl-essay ${className ?? ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={safeUrl}
        components={{
          a: ({ href = '', children }) => {
            if (href.startsWith('cite:')) {
              const s = byN.get(href.slice(5))
              if (!s) return null
              return (
                <button type="button" className="vl-cite" aria-label={`Fonte ${s.n}: ${s.titulo}`} onClick={() => setOpen(s)}>{children}</button>
              )
            }
            return <a href={href} target="_blank" rel="noreferrer noopener">{children as ReactNode}</a>
          },
        }}
      >
        {withCiteLinks(markdown)}
      </ReactMarkdown>
      {sources.length > 0 && (
        <details className="vl-refs">
          <summary><Icon name="library" size={14} /> Referências da sua base ({sources.length})</summary>
          <ol>
            {sources.map((s) => (
              <li key={s.n} value={s.n}><button type="button" className="vl-linklike" onClick={() => setOpen(s)}>{s.titulo}</button></li>
            ))}
          </ol>
        </details>
      )}
      {open && (
        <Sheet title={`[${open.n}] ${open.titulo}`} onClose={() => setOpen(null)}>
          <p className="vl-muted">Nota da sua base de conhecimento (wiki pessoal).</p>
          <p className="ds-mono vl-break">{open.fonte}</p>
          {open.uri && <p className="vl-muted ds-mono vl-break">{open.uri}</p>}
        </Sheet>
      )}
    </div>
  )
}
