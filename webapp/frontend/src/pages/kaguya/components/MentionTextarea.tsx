// MentionTextarea — textarea controlado com autocomplete de @pessoa e [[task]],
// barra de formatação Markdown, atalhos de teclado, colar-link inteligente e
// menu "/" de blocos (reforma do modal de tarefa).
//
// Gatilhos de autocomplete enquanto o usuário digita:
//   @  → dropdown filtrado da lista de pessoas da Komi
//   [[ → dropdown com busca de tasks (debounce 250ms via kaguyaApi.search)
//   /  no começo de uma linha → menu de blocos (título, lista, checklist, tabela…)
//
// Ao selecionar um item, insere no lugar do texto digitado:
//   Pessoa: @[Nome Completo](komi:<uuid>)
//   Task:   [[<id>|Título da Task]]
//   Bloco:  snippet Markdown (## , - [ ] , etc.)

import { useState, useRef, useEffect, useCallback } from 'react'
import type { Person, Task } from '../types'
import { kaguyaApi } from '../kaguyaApi'
import { Icon } from '../ui/Icons'

// ── Props ──────────────────────────────────────────────────────────────────────

interface MentionTextareaProps {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}

// ── Estado interno do dropdown ─────────────────────────────────────────────────

type DropdownKind = 'person' | 'task' | 'block'

interface DropdownState {
  kind: DropdownKind
  query: string
  triggerStart: number
  active: number
}

// ── Menu "/" de blocos — itens estáticos ─────────────────────────────────────

interface BlockItem { label: string; hint: string; snippet: string }
const BLOCKS: BlockItem[] = [
  { label: 'Título', hint: '##', snippet: '## ' },
  { label: 'Lista', hint: '-', snippet: '- ' },
  { label: 'Checklist', hint: '[ ]', snippet: '- [ ] ' },
  { label: 'Tabela', hint: '|', snippet: '\n| Coluna A | Coluna B |\n| --- | --- |\n|  |  |\n' },
  { label: 'Citação', hint: '>', snippet: '> ' },
  { label: 'Divisor', hint: '---', snippet: '\n\n---\n\n' },
  { label: 'Código', hint: '```', snippet: '\n```\n\n```\n' },
]

// ── Barra de formatação — cada botão embrulha a seleção ou prefixa a linha ────

type MdAction =
  | { wrap: [string, string] }
  | { line: string }
  | { insert: string }

interface MdButton { name: string; title: string; action: MdAction }
const MD_BUTTONS: MdButton[] = [
  { name: 'bold', title: 'Negrito  (Ctrl/⌘ B)', action: { wrap: ['**', '**'] } },
  { name: 'italic', title: 'Itálico  (Ctrl/⌘ I)', action: { wrap: ['*', '*'] } },
  { name: 'heading', title: 'Título', action: { line: '## ' } },
  { name: 'list', title: 'Lista', action: { line: '- ' } },
  { name: 'checklist', title: 'Checklist  (Ctrl/⌘ ⇧ X)', action: { line: '- [ ] ' } },
  { name: 'quote', title: 'Citação', action: { line: '> ' } },
  { name: 'code', title: 'Código', action: { wrap: ['`', '`'] } },
  { name: 'link', title: 'Link  (Ctrl/⌘ K)', action: { wrap: ['[', '](https://)'] } },
  { name: 'divider', title: 'Divisor', action: { insert: '\n\n---\n\n' } },
]

// Reconhece uma URL "solta" colada (para virar [texto](url)).
const URL_RE = /^https?:\/\/\S+$/i

// ── Componente ─────────────────────────────────────────────────────────────────

export function MentionTextarea({ value, onChange, placeholder }: MentionTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const [people, setPeople] = useState<Person[]>([])
  const [taskResults, setTaskResults] = useState<Task[]>([])
  const [dropdown, setDropdown] = useState<DropdownState | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    kaguyaApi.listPeople().then(setPeople).catch(() => { /* silencioso */ })
  }, [])

  // ── Filtragem local ────────────────────────────────────────────────────────

  const filteredPeople = dropdown?.kind === 'person'
    ? people
        .filter(p => {
          const q = dropdown.query.toLowerCase()
          return q === '' || p.name.toLowerCase().includes(q)
        })
        .slice(0, 8)
    : []

  const filteredBlocks = dropdown?.kind === 'block'
    ? BLOCKS.filter(b => {
        const q = dropdown.query.toLowerCase()
        return q === '' || b.label.toLowerCase().includes(q)
      })
    : []

  // ── Edições da barra de formatação ────────────────────────────────────────

  // Aplica (pre, post) em volta da seleção; reposiciona o caret dentro do trecho.
  const applyWrap = useCallback((pre: string, post: string) => {
    const el = textareaRef.current
    const a = el?.selectionStart ?? value.length
    const b = el?.selectionEnd ?? value.length
    const sel = value.slice(a, b) || 'texto'
    const next = value.slice(0, a) + pre + sel + post + value.slice(b)
    onChange(next)
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        const p = a + pre.length
        textareaRef.current.focus()
        textareaRef.current.setSelectionRange(p, p + sel.length)
      }
    })
  }, [value, onChange])

  // Prefixa a linha do caret (títulos, listas, citação).
  const applyLine = useCallback((prefix: string) => {
    const el = textareaRef.current
    const a = el?.selectionStart ?? value.length
    const lineStart = value.lastIndexOf('\n', a - 1) + 1
    const next = value.slice(0, lineStart) + prefix + value.slice(lineStart)
    onChange(next)
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        const p = a + prefix.length
        textareaRef.current.focus()
        textareaRef.current.setSelectionRange(p, p)
      }
    })
  }, [value, onChange])

  // Insere um trecho na posição do caret (divisor, tabela vinda do "/").
  const insertText = useCallback((text: string, dropTrailingSlash = false) => {
    const el = textareaRef.current
    const a = el?.selectionStart ?? value.length
    let head = value.slice(0, a)
    if (dropTrailingSlash && head.endsWith('/')) head = head.slice(0, -1)
    const next = head + text + value.slice(a)
    onChange(next)
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        const p = head.length + text.length
        textareaRef.current.focus()
        textareaRef.current.setSelectionRange(p, p)
      }
    })
  }, [value, onChange])

  const runAction = useCallback((action: MdAction) => {
    if ('wrap' in action) applyWrap(action.wrap[0], action.wrap[1])
    else if ('line' in action) applyLine(action.line)
    else insertText(action.insert)
  }, [applyWrap, applyLine, insertText])

  // ── Detecção do gatilho de menção / bloco ─────────────────────────────────

  function detectMentionTrigger(text: string, cursor: number): DropdownState | null {
    const before = text.slice(0, cursor)

    // [[ — task
    const taskTriggerIdx = before.lastIndexOf('[[')
    if (taskTriggerIdx !== -1) {
      const afterTrigger = before.slice(taskTriggerIdx + 2)
      if (!afterTrigger.includes(']]') && !afterTrigger.includes('\n')) {
        return { kind: 'task', query: afterTrigger, triggerStart: taskTriggerIdx, active: 0 }
      }
    }

    // @ — pessoa
    const atMatch = before.match(/@([\wÀ-ÿ]*)$/)
    if (atMatch) {
      return { kind: 'person', query: atMatch[1], triggerStart: before.lastIndexOf('@'), active: 0 }
    }

    // / no começo da linha — menu de blocos
    const lineStart = before.lastIndexOf('\n') + 1
    const line = before.slice(lineStart)
    const slashMatch = line.match(/^\/([\wÀ-ÿ]*)$/)
    if (slashMatch) {
      return { kind: 'block', query: slashMatch[1], triggerStart: lineStart, active: 0 }
    }

    return null
  }

  // ── Handler de mudança ────────────────────────────────────────────────────

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const text = e.target.value
      onChange(text)
      const cursor = e.target.selectionStart ?? text.length
      const trigger = detectMentionTrigger(text, cursor)
      if (!trigger) { setDropdown(null); return }
      setDropdown(trigger)

      if (trigger.kind === 'task') {
        if (trigger.query.length >= 1) {
          if (debounceRef.current) clearTimeout(debounceRef.current)
          debounceRef.current = setTimeout(async () => {
            try {
              const results = await kaguyaApi.search(trigger.query)
              setTaskResults(results.slice(0, 8))
            } catch { setTaskResults([]) }
          }, 250)
        } else {
          setTaskResults([])
        }
      }
    },
    [onChange],
  )

  // ── Colar link inteligente ────────────────────────────────────────────────

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = e.clipboardData.getData('text').trim()
    if (!URL_RE.test(pasted)) return           // não é URL solta → comportamento normal
    const el = textareaRef.current
    if (!el) return
    const a = el.selectionStart, b = el.selectionEnd
    if (a === b) return                        // sem seleção → cola a URL crua (normal)
    e.preventDefault()
    const sel = value.slice(a, b)
    const next = value.slice(0, a) + `[${sel}](${pasted})` + value.slice(b)
    onChange(next)
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        const p = a + `[${sel}](${pasted})`.length
        textareaRef.current.focus()
        textareaRef.current.setSelectionRange(p, p)
      }
    })
  }, [value, onChange])

  // ── Inserção do token / snippet escolhido ─────────────────────────────────

  const insertChoice = useCallback(
    (item: Person | Task | BlockItem, kind: DropdownKind) => {
      if (!dropdown || !textareaRef.current) return
      const cursor = textareaRef.current.selectionStart ?? value.length
      const before = value.slice(0, dropdown.triggerStart)
      const after = value.slice(cursor)

      let token: string
      if (kind === 'person') {
        token = `@[${(item as Person).name}](komi:${(item as Person).id})`
      } else if (kind === 'task') {
        token = `[[${(item as Task).id}|${(item as Task).title}]]`
      } else {
        token = (item as BlockItem).snippet
      }

      onChange(before + token + after)
      setDropdown(null)
      setTaskResults([])
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          const newPos = before.length + token.length
          textareaRef.current.setSelectionRange(newPos, newPos)
          textareaRef.current.focus()
        }
      })
    },
    [dropdown, value, onChange],
  )

  // ── Teclado: atalhos primeiro, depois navegação do dropdown ───────────────

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const mod = e.metaKey || e.ctrlKey
      // Atalhos de formatação (independentes do dropdown). NÃO capturamos Ctrl/⌘ Z.
      if (mod && !e.altKey) {
        const k = e.key.toLowerCase()
        if (k === 'b') { e.preventDefault(); applyWrap('**', '**'); return }
        if (k === 'i') { e.preventDefault(); applyWrap('*', '*'); return }
        if (k === 'k') { e.preventDefault(); applyWrap('[', '](https://)'); return }
        if (e.shiftKey && k === 'x') { e.preventDefault(); applyLine('- [ ] '); return }
      }

      if (!dropdown) return
      const items = dropdown.kind === 'person'
        ? filteredPeople
        : dropdown.kind === 'block'
          ? filteredBlocks
          : taskResults
      if (items.length === 0) return

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setDropdown(d => d ? { ...d, active: Math.min(d.active + 1, items.length - 1) } : d)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setDropdown(d => d ? { ...d, active: Math.max(d.active - 1, 0) } : d)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const chosen = items[dropdown.active]
        if (chosen) insertChoice(chosen as Person | Task | BlockItem, dropdown.kind)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        setDropdown(null)
      }
    },
    [dropdown, filteredPeople, filteredBlocks, taskResults, insertChoice, applyWrap, applyLine],
  )

  const dropdownItems: (Person | Task | BlockItem)[] =
    dropdown?.kind === 'person' ? filteredPeople
      : dropdown?.kind === 'block' ? filteredBlocks
        : taskResults

  return (
    <div className="kg-mention-wrap">
      {/* barra de formatação */}
      <div className="kg-md-toolbar">
        {MD_BUTTONS.map(b => (
          <button
            key={b.name}
            type="button"
            className="kg-md-tb-btn"
            title={b.title}
            onMouseDown={(e) => { e.preventDefault(); runAction(b.action) }}
          >
            <MdIcon name={b.name} />
          </button>
        ))}
      </div>

      <textarea
        ref={textareaRef}
        className="kg-textarea kg-note-textarea"
        value={value}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        placeholder={
          placeholder ??
          'Detalhes, links, contexto…\n\n@nome menciona uma pessoa\n[[ menciona outra task\n/ abre o menu de blocos'
        }
      />

      {dropdown && dropdownItems.length > 0 && (
        <div className="kg-pop kg-mention-drop">
          {dropdownItems.map((item, i) => {
            const cls = `kg-pop-item${i === dropdown.active ? ' active' : ''}`
            if (dropdown.kind === 'block') {
              const b = item as BlockItem
              return (
                <button key={b.label} type="button" className={cls}
                  onMouseDown={(e) => { e.preventDefault(); insertChoice(b, 'block') }}>
                  {b.label}
                  <span className="kg-md-slash-hint">{b.hint}</span>
                </button>
              )
            }
            if (dropdown.kind === 'person') {
              const p = item as Person
              return (
                <button key={p.id} type="button" className={cls}
                  onMouseDown={(e) => { e.preventDefault(); insertChoice(p, 'person') }}>
                  @{p.name}
                </button>
              )
            }
            const t = item as Task
            return (
              <button key={t.id} type="button" className={cls}
                onMouseDown={(e) => { e.preventDefault(); insertChoice(t, 'task') }}>
                #{t.id} {t.title}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Ícones da barra (SVG inline, traço — estilo ui/Icons.tsx) ────────────────

function MdIcon({ name }: { name: string }) {
  const common = { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (name) {
    case 'bold': return <span className="kg-md-tb-glyph" style={{ fontWeight: 800 }}>B</span>
    case 'italic': return <span className="kg-md-tb-glyph" style={{ fontStyle: 'italic' }}>I</span>
    case 'heading': return <svg {...common}><path d="M6 4v16M18 4v16M6 12h12" /></svg>
    case 'list': return <Icon name="list" size={15} />
    case 'checklist': return <svg {...common}><path d="m3 7 2 2 3-3M3 17l2 2 3-3M13 8h8M13 16h8" /></svg>
    case 'quote': return <svg {...common}><path d="M6 17h3l2-4V6H4v7h3l-1 4zM16 17h3l2-4V6h-7v7h3l-1 4z" /></svg>
    case 'code': return <svg {...common}><path d="m9 8-4 4 4 4M15 8l4 4-4 4" /></svg>
    case 'link': return <svg {...common}><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5" /></svg>
    case 'divider': return <svg {...common}><path d="M4 12h16" /></svg>
    default: return null
  }
}
