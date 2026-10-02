// CommandPalette (Ctrl+K) — comandos de todos os provedores registrados + busca de itens do domínio.
// Padrão ARIA combobox: o foco fica no campo; ↑/↓ movem a seleção; Enter executa; Esc fecha.

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { filterCommands, useProviders, type Command, type SearchResult } from '../headless/commands'
import { shortcutLabel } from '../headless/web'
import { Icon } from './Icon'
import type { IconName } from './icons'
import { usePortalRoot } from './overlay'

interface Row {
  id: string
  group: string
  label: string
  icon?: string
  shortcut?: string
  run: () => void
}

const asIcon = (n?: string): IconName => (n as IconName | undefined) ?? 'command'

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const providers = useProviders()
  const root = usePortalRoot()
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) { setQ(''); setActive(0); setTimeout(() => inputRef.current?.focus(), 0) }
  }, [open])

  const rows: Row[] = useMemo(() => {
    const all: Command[] = providers.flatMap((p) => p.commands ?? [])
    const cmds: Row[] = filterCommands(all, q).map((c) => ({ id: `c-${c.id}`, group: c.group ?? 'Comandos', label: c.label, icon: c.icon, shortcut: c.shortcut, run: c.run }))
    const found: Row[] = q.trim()
      ? providers.flatMap((p) => (p.search ? p.search(q.trim()) : [])).slice(0, 8).map((r: SearchResult) => ({ id: `r-${r.id}`, group: r.group, label: r.label, icon: r.icon, run: r.run }))
      : []
    // Resultados do domínio primeiro, comandos depois; agentes por último (são navegação).
    const order = (g: string) => (g === 'Comandos' ? 1 : g === 'Agentes' ? 2 : 0)
    return [...found, ...cmds].sort((a, b) => order(a.group) - order(b.group))
  }, [providers, q])

  useEffect(() => { setActive((a) => Math.min(a, Math.max(0, rows.length - 1))) }, [rows.length])
  useEffect(() => { listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' }) }, [active])

  if (!open || !root) return null

  const run = (r?: Row) => { if (!r) return; onClose(); r.run() }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(rows.length - 1, a + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); run(rows[active]) }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose() }
  }

  let lastGroup = ''
  return createPortal(
    <div className="ds-ov ds-pal" onKeyDown={onKey}>
      <div className="ds-ov-s" onClick={onClose} />
      <div className="ds-pal-box" role="dialog" aria-modal="true" aria-label="Paleta de comandos">
        <div className="ds-pal-in">
          <Icon name="search" size={18} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => { setQ(e.target.value); setActive(0) }}
            placeholder="Digite um comando ou busque um item…"
            autoComplete="off"
            role="combobox"
            aria-expanded="true"
            aria-controls="ds-pal-list"
            aria-activedescendant={rows[active] ? `ds-pal-${rows[active].id}` : undefined}
            aria-label="Buscar comandos e itens"
          />
        </div>
        <div className="ds-pal-l" id="ds-pal-list" role="listbox" ref={listRef}>
          {rows.length === 0 && <div className="ds-empty" style={{ border: 0, padding: 28 }}><p>Nada encontrado para “{q}”.</p></div>}
          {rows.map((r, i) => {
            const head = r.group !== lastGroup ? <div className="ds-pal-g ds-mono" role="presentation">{r.group}</div> : null
            lastGroup = r.group
            return (
              <div key={r.id} role="presentation">
                {head}
                <button
                  type="button"
                  id={`ds-pal-${r.id}`}
                  role="option"
                  tabIndex={-1}
                  aria-selected={i === active}
                  className="ds-pal-i"
                  onMouseMove={() => setActive(i)}
                  onClick={() => run(r)}
                >
                  <Icon name={asIcon(r.icon)} size={16} />
                  <span>{r.label}</span>
                  {r.shortcut && <kbd className="ds-kbd">{r.shortcut.includes(' ') ? r.shortcut.toUpperCase().replace(' ', ' + ') : shortcutLabel(r.shortcut)}</kbd>}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>,
    root,
  )
}
