// MarkdownPreview — renderiza o campo `description` (notas) como Markdown real.
//
// Suporta GFM: listas de tarefa (- [ ]), tabelas, strikethrough, links, código.
// Menções são convertidas de tokens compactos para links antes do render:
//   @[Nome](komi:uuid)    → chip de pessoa (clique → /people)
//   [[id|Título]]         → chip de task  (clique → abre o modal da task)
//
// Checkboxes de tarefa são CLICÁVEIS quando o pai passa `onChange`: marcar reescreve
// a n-ésima ocorrência de "- [ ]" ↔ "- [x]" no Markdown cru.

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useNavigate } from 'react-router-dom'
import type { ComponentPropsWithoutRef } from 'react'

// ── Props ──────────────────────────────────────────────────────────────────────

interface MarkdownPreviewProps {
  value: string
  onOpenTask?: (id: number) => void
  // Quando presente, os checkboxes de tarefa ficam habilitados e alternam o Markdown.
  onChange?: (v: string) => void
}

// ── Pré-processamento das menções ─────────────────────────────────────────────

function mentionsToLinks(md: string): string {
  let out = md
  out = out.replace(/@\[([^\]]+)\]\((komi:[^)]+)\)/g, '[@$1]($2)')
  out = out.replace(/\[\[(\d+)\|([^\]]+)\]\]/g, '[#$1 $2](task:$1)')
  return out
}

// Alterna a n-ésima checkbox ("- [ ]" ↔ "- [x]", 0-indexada) no Markdown cru.
function toggleNthCheckbox(md: string, targetIndex: number): string {
  let seen = -1
  return md
    .split('\n')
    .map((line) => {
      const m = line.match(/^(\s*[-*]\s+\[)( |x|X)(\]\s.*)$/)
      if (!m) return line
      seen += 1
      if (seen !== targetIndex) return line
      const nextMark = m[2] === ' ' ? 'x' : ' '
      return `${m[1]}${nextMark}${m[3]}`
    })
    .join('\n')
}

// ── Renderizador de link customizado (menções) ───────────────────────────────

function MentionLink({ href, children, ...rest }: ComponentPropsWithoutRef<'a'>) {
  const navigate = useNavigate()

  if (href?.startsWith('komi:')) {
    return (
      <span
        className="kg-note-mention person"
        role="link"
        tabIndex={0}
        title="Ver pessoa na Komi"
        onClick={() => navigate('/people')}
        onKeyDown={(e) => e.key === 'Enter' && navigate('/people')}
      >
        {children}
      </span>
    )
  }

  if (href?.startsWith('task:')) {
    const id = Number(href.slice('task:'.length))
    return (
      <span
        className="kg-note-mention task"
        role="link"
        tabIndex={0}
        title={`Abrir task #${id}`}
        onClick={() => (rest as { onOpenTask?: (id: number) => void }).onOpenTask?.(id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            (rest as { onOpenTask?: (id: number) => void }).onOpenTask?.(id)
          }
        }}
      >
        {children}
      </span>
    )
  }

  return (
    <a href={href} target="_blank" rel="noreferrer" className="kg-md-link">
      {children}
    </a>
  )
}

// ── Componente principal ───────────────────────────────────────────────────────

export function MarkdownPreview({ value, onOpenTask, onChange }: MarkdownPreviewProps) {
  if (!value?.trim()) {
    return (
      <p className="kg-note-empty">
        Nenhuma nota ainda. Troque para <b>Escrever</b> para começar.
      </p>
    )
  }

  function BoundMentionLink(props: ComponentPropsWithoutRef<'a'>) {
    return <MentionLink {...props} {...{ onOpenTask } as object} />
  }

  // Contador de checkboxes desta passagem de render — mapeia clique → linha certa.
  const cb = { n: 0 }
  function CheckboxInput(props: ComponentPropsWithoutRef<'input'>) {
    if (props.type !== 'checkbox') return <input {...props} />
    const index = cb.n
    cb.n += 1
    if (!onChange) return <input {...props} readOnly />
    return (
      <input
        type="checkbox"
        checked={!!props.checked}
        onChange={() => onChange(toggleNthCheckbox(value, index))}
      />
    )
  }

  return (
    <div className="kg-md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: BoundMentionLink as never,
          input: CheckboxInput as never,
        }}
      >
        {mentionsToLinks(value)}
      </ReactMarkdown>
    </div>
  )
}
