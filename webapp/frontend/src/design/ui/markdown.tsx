// <MarkdownEditor> — notas em Markdown: lê renderizado e edita no lugar (clique no texto), com barra de formatação,
// atalhos (Ctrl+B / I / K), continuação de listas no Enter, Tab para aninhar, colar URL sobre seleção vira link,
// checklists clicáveis (a marcação reescreve o texto) com contagem "3/7", callouts (`> [!NOTE]`) e botão de copiar
// nos blocos de código. Toda a lógica de texto vive em core/markdown (pura e testada); aqui só há o encaixe no DOM.
// Sem rede: menções e links de domínio entram por `renderLink`.

import { useCallback, useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  checklistStats, continueList, indentLines, linkSelection, pasteUrlOverSelection, toggleChecklistItem, toggleLinePrefix, wrapSelection, type Edit,
} from '../core/markdown'
import { Icon } from './Icon'
import type { IconName } from './icons'
import { cx } from './primitives'

export interface MarkdownEditorProps {
  value: string
  /** Chamado a cada edição (digitar ou marcar uma checklist). */
  onChange: (value: string) => void
  /** Chamado ao sair da edição (blur, Esc ou Ctrl+Enter) — hora de salvar no servidor. */
  onCommit?: (value: string) => void
  placeholder?: string
  /** Troca o desenho de um link de domínio (ex.: `komi:`, `task:`); devolver undefined usa o link padrão. */
  renderLink?: (href: string, children: ReactNode) => ReactNode | undefined
  /** Rótulo acessível. */
  label?: string
  /** Começa editando (ex.: nota nova). */
  startEditing?: boolean
}

const TOOLS: { id: string; icon: IconName; label: string; run: (t: string, s: number, e: number) => Edit }[] = [
  { id: 'bold', icon: 'bold', label: 'Negrito (Ctrl+B)', run: (t, s, e) => wrapSelection(t, s, e, '**') },
  { id: 'italic', icon: 'italic', label: 'Itálico (Ctrl+I)', run: (t, s, e) => wrapSelection(t, s, e, '*') },
  { id: 'code', icon: 'code', label: 'Código', run: (t, s, e) => wrapSelection(t, s, e, '`') },
  { id: 'link', icon: 'link', label: 'Link (Ctrl+K)', run: (t, s, e) => linkSelection(t, s, e, 'https://') },
  { id: 'heading', icon: 'heading', label: 'Título', run: (t, s, e) => toggleLinePrefix(t, s, e, '## ') },
  { id: 'quote', icon: 'quote', label: 'Citação', run: (t, s, e) => toggleLinePrefix(t, s, e, '> ') },
  { id: 'list', icon: 'list', label: 'Lista', run: (t, s, e) => toggleLinePrefix(t, s, e, '- ') },
  { id: 'ordered', icon: 'list-ordered', label: 'Lista numerada', run: (t, s, e) => toggleLinePrefix(t, s, e, '1. ') },
  { id: 'check', icon: 'checklist', label: 'Checklist', run: (t, s, e) => toggleLinePrefix(t, s, e, '- [ ] ') },
]

// `> [!NOTE] texto` vira `> **Nota** texto` antes de renderizar; o blockquote reconhece o rótulo e ganha a cara de aviso.
const CALLOUT_LABEL: Record<string, string> = { NOTE: 'Nota', TIP: 'Dica', WARN: 'Atenção', WARNING: 'Atenção', IMPORTANT: 'Importante' }
const CALLOUT_KIND: Record<string, string> = { Nota: 'note', Dica: 'tip', 'Atenção': 'warn', Importante: 'important' }
const withCallouts = (md: string): string =>
  md.replace(/^(\s*>\s*)\[!(NOTE|TIP|WARN|WARNING|IMPORTANT)\]\s*/gim, (_m, pre: string, k: string) => `${pre}**${CALLOUT_LABEL[k.toUpperCase()]}** `)

/** O react-markdown só deixa passar http/mailto…; links de domínio (`komi:`, `task:`) precisam de esquema próprio.
 *  Bloqueia os perigosos e deixa o resto: quem desenha o link é o `renderLink` (ou o <a> externo padrão). */
const safeUrl = (url: string): string => (/^\s*(javascript|data|vbscript):/i.test(url) ? '' : url)

/** Texto puro dos filhos de um nó React (para detectar o marcador de callout). */
function textOf(node: ReactNode): string {
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (node && typeof node === 'object' && 'props' in node) return textOf((node as { props: { children?: ReactNode } }).props.children)
  return ''
}

export function MarkdownEditor({ value, onChange, onCommit, placeholder = 'Escreva em Markdown…', renderLink, label = 'Notas', startEditing }: MarkdownEditorProps) {
  const [editing, setEditing] = useState(!!startEditing)
  const area = useRef<HTMLTextAreaElement>(null)
  const pendingSel = useRef<[number, number] | null>(null)
  const stats = checklistStats(value)

  // Depois de uma edição programática, devolve o cursor para onde a lógica pediu.
  useEffect(() => {
    if (editing && pendingSel.current && area.current) {
      area.current.setSelectionRange(...pendingSel.current)
      pendingSel.current = null
    }
  })
  useEffect(() => { if (editing) area.current?.focus() }, [editing])

  const apply = useCallback((edit: Edit) => {
    pendingSel.current = [edit.start, edit.end]
    onChange(edit.text)
  }, [onChange])

  const commit = useCallback(() => { setEditing(false); onCommit?.(value) }, [onCommit, value])

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget
    const { selectionStart: s, selectionEnd: en } = el
    const mod = e.ctrlKey || e.metaKey
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); commit(); return }
    if (mod && e.key === 'Enter') { e.preventDefault(); commit(); return }
    if (mod && e.key.toLowerCase() === 'b') { e.preventDefault(); apply(wrapSelection(value, s, en, '**')); return }
    if (mod && e.key.toLowerCase() === 'i') { e.preventDefault(); apply(wrapSelection(value, s, en, '*')); return }
    if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); apply(linkSelection(value, s, en, 'https://')); return }
    if (mod && e.shiftKey && e.key === '7') { e.preventDefault(); apply(toggleLinePrefix(value, s, en, '1. ')); return }
    if (mod && e.shiftKey && e.key === '8') { e.preventDefault(); apply(toggleLinePrefix(value, s, en, '- ')); return }
    if (mod && e.shiftKey && e.key === '9') { e.preventDefault(); apply(toggleLinePrefix(value, s, en, '- [ ] ')); return }
    if (e.key === 'Enter' && !e.shiftKey && !mod && s === en) {
      const next = continueList(value, s)
      if (next) { e.preventDefault(); apply(next) }
      return
    }
    if (e.key === 'Tab') {
      const next = indentLines(value, s, en, e.shiftKey)
      if (next) { e.preventDefault(); apply(next) }
    }
  }

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget
    const next = pasteUrlOverSelection(value, el.selectionStart, el.selectionEnd, e.clipboardData.getData('text'))
    if (next) { e.preventDefault(); apply(next) }
  }

  // Cada checkbox renderizado conta na ordem; o índice dele é o da checklist no texto.
  let checkIndex = 0

  const read = (
    <div className="ds-md" onClick={(e) => { if (!(e.target as HTMLElement).closest('a, input, button, pre')) setEditing(true) }}>
      {value.trim() ? (
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          urlTransform={safeUrl}
          components={{
            a: ({ href = '', children }) => renderLink?.(href, children) ?? (
              <a href={href} target="_blank" rel="noreferrer noopener" className="ds-md-a">{children}<Icon name="forward" size={11} /></a>
            ),
            input: (props) => {
              if (props.type !== 'checkbox') return <input {...props} />
              const i = checkIndex++
              return (
                <input
                  type="checkbox"
                  checked={!!props.checked}
                  aria-label="Item da checklist"
                  onChange={() => { const next = toggleChecklistItem(value, i); onChange(next); onCommit?.(next) }}
                />
              )
            },
            blockquote: ({ children }) => {
              const kind = CALLOUT_KIND[textOf(children).trim().split(/\s/)[0]] ?? null
              return <blockquote className={cx(kind && 'ds-callout', kind && `ds-callout-${kind}`)}>{children}</blockquote>
            },
            pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
          }}
        >
          {withCallouts(value)}
        </ReactMarkdown>
      ) : (
        <p className="ds-md-empty">{placeholder}</p>
      )}
    </div>
  )

  return (
    <div className={cx('ds-mde', editing && 'ds-editing')} role="group" aria-label={label}>
      <div className="ds-mde-bar">
        {editing ? (
          <div className="ds-mde-tools" role="toolbar" aria-label="Formatação">
            {TOOLS.map((t) => (
              <button
                key={t.id}
                type="button"
                className="ds-iconbtn"
                title={t.label}
                aria-label={t.label}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { const el = area.current; if (el) apply(t.run(value, el.selectionStart, el.selectionEnd)) }}
              >
                <Icon name={t.icon} size={15} />
              </button>
            ))}
          </div>
        ) : <span className="ds-mde-hint">Clique no texto para editar</span>}
        {stats.total > 0 && <span className="ds-mde-count" title="Checklist">{stats.done}/{stats.total}</span>}
      </div>
      {editing ? (
        <textarea
          ref={area}
          className="ds-textarea ds-mde-area"
          value={value}
          placeholder={placeholder}
          aria-label={label}
          rows={Math.min(14, Math.max(5, value.split('\n').length + 1))}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onBlur={(e) => { if (!e.relatedTarget || !(e.relatedTarget as HTMLElement).closest('.ds-mde-tools')) commit() }}
        />
      ) : read}
    </div>
  )
}

/** Bloco de código com botão de copiar. */
function CodeBlock({ children }: { children: ReactNode }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="ds-md-code">
      <button
        type="button"
        className="ds-iconbtn ds-md-copy"
        aria-label={copied ? 'Copiado' : 'Copiar código'}
        onClick={() => { void navigator.clipboard?.writeText(textOf(children)); setCopied(true); window.setTimeout(() => setCopied(false), 1500) }}
      >
        <Icon name={copied ? 'check' : 'copy'} size={14} />
      </button>
      <pre>{children}</pre>
    </div>
  )
}
