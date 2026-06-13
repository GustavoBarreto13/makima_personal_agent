// CommandPalette — overlay ⌘K (fatia 018).
// Portado do protótipo docs/claude_design/.../components.jsx (CommandPalette + NAV_COMMANDS).
// Cria, busca e navega num campo único. Teclado: ↑↓ move, ↵ executa, esc fecha.
// Reusar parseTask (mirror ao vivo) e kaguyaApi.search (busca de tarefas abertas).

import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import type { Task, Project, KaguyaView } from '../types'
import { parseTask, type ParsedTask } from '../../../lib/parseTask'
import { kaguyaApi } from '../kaguyaApi'
import { Icon } from '../ui/Icons'

// Comandos de navegação — mapeados ao enum KaguyaView real.
// O protótipo usava 'board' para kanban e 'grid2x2' para eisenhower;
// ajustamos para os valores reais + ícones disponíveis nos Icons.tsx.
const NAV_COMMANDS: { view: KaguyaView; label: string; icon: string }[] = [
  { view: 'today',       label: 'Ir para Meu Dia',              icon: 'sun'      },
  { view: 'list',        label: 'Ir para Lista',                icon: 'list'     },
  { view: 'kanban',      label: 'Ir para Kanban',               icon: 'board'    },
  { view: 'calendar',    label: 'Ir para Calendário',           icon: 'calendar' },
  { view: 'eisenhower',  label: 'Ir para Matriz de Eisenhower', icon: 'grid'     },
  { view: 'habits',      label: 'Ir para Hábitos',              icon: 'loop'     },
]

// Um item da lista de resultados (tagged union por tipo de resultado).
type PaletteItem =
  | { kind: 'create'; parsed: ParsedTask }
  | { kind: 'task';   task: Task }
  | { kind: 'project'; proj: Project }
  | { kind: 'nav';    cmd: typeof NAV_COMMANDS[number] }

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  projects: Project[]
  // Navega para uma view (com param opcional, ex.: id da lista).
  onNavigate: (view: KaguyaView, param?: number | null) => void
  // Cria a tarefa descrita pelo parsed (já inclui recorrência, @lista, etc.).
  onCreateTask: (parsed: ParsedTask) => Promise<void>
  // Abre o TaskModal da tarefa selecionada.
  onOpenTask: (task: Task) => void
  toast: (msg: string, kind?: 'ok' | 'err') => void
}

export function CommandPalette({
  open, onClose, projects, onNavigate, onCreateTask, onOpenTask, toast,
}: CommandPaletteProps) {
  const [text, setText] = useState('')
  // Índice do item em destaque (teclado ↑↓).
  const [active, setActive] = useState(0)
  // Tarefas encontradas pela busca assíncrona.
  const [taskHits, setTaskHits] = useState<Task[]>([])

  const inputRef = useRef<HTMLInputElement>(null)
  const mirrorRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Ao abrir: limpa o campo, reseta o estado e foca o input.
  useEffect(() => {
    if (!open) return
    setText('')
    setActive(0)
    setTaskHits([])
    // setTimeout pequeno para garantir que o elemento já está no DOM.
    setTimeout(() => inputRef.current?.focus(), 30)
  }, [open])

  // Parsing ao vivo (mesma técnica do QuickAdd — barato, síncrono).
  const parsed = useMemo(() => parseTask(text), [text])

  // Busca de tarefas abertas (assíncrona, ativada ao digitar).
  const searchTasks = useCallback(async (q: string) => {
    if (!q.trim()) { setTaskHits([]); return }
    try {
      const hits = await kaguyaApi.search(q.trim())
      // Mostra só abertas (o endpoint /search já devolve abertas, mas garantimos).
      setTaskHits(hits.filter(t => !t.completed_at).slice(0, 5))
    } catch {
      // Falha silenciosa — a busca não é crítica para o fluxo de criar.
      setTaskHits([])
    }
  }, [])

  // Dispara busca com um pequeno debounce visual (não bloqueia — aguarda até 200ms).
  useEffect(() => {
    const id = setTimeout(() => searchTasks(text), 200)
    return () => clearTimeout(id)
  }, [text, searchTasks])

  // Lista de itens computada a partir do texto + resultados de busca.
  const items = useMemo((): PaletteItem[] => {
    const q = text.trim().toLowerCase()
    if (!q) {
      // Sem texto: só as opções de navegação.
      return NAV_COMMANDS.map(cmd => ({ kind: 'nav', cmd }))
    }
    const out: PaletteItem[] = []

    // Opção Criar (sempre presente quando há texto).
    out.push({ kind: 'create', parsed })

    // Tarefas abertas que casam com o texto.
    taskHits.forEach(task => out.push({ kind: 'task', task }))

    // Listas (projetos) que casam com o texto.
    projects
      .filter(p => p.name.toLowerCase().includes(q))
      .slice(0, 3)
      .forEach(proj => out.push({ kind: 'project', proj }))

    // Comandos de navegação que casam com o texto.
    NAV_COMMANDS
      .filter(c => c.label.toLowerCase().includes(q))
      .forEach(cmd => out.push({ kind: 'nav', cmd }))

    return out
  }, [text, parsed, taskHits, projects])

  // Reseta o item ativo a cada mudança de texto.
  useEffect(() => { setActive(0) }, [text])

  // Sincroniza o scroll horizontal do mirror com o do input (para textos longos).
  const syncScroll = () => {
    if (mirrorRef.current && inputRef.current) {
      mirrorRef.current.scrollLeft = inputRef.current.scrollLeft
    }
  }

  // Executa o item selecionado e fecha a palette.
  const exec = async (it: PaletteItem | undefined) => {
    if (!it) return
    try {
      if (it.kind === 'create') {
        if (!it.parsed.title) return   // sem título → não cria
        await onCreateTask(it.parsed)
      } else if (it.kind === 'task') {
        onOpenTask(it.task)
      } else if (it.kind === 'project') {
        onNavigate('list', it.proj.id)
      } else if (it.kind === 'nav') {
        // 'list' e 'kanban' precisam de param (inboxId); o shell resolve via navigate().
        onNavigate(it.cmd.view)
      }
    } catch {
      toast('Não foi possível executar a ação.', 'err')
    }
    onClose()
  }

  // Handler de teclado do campo (↑↓↵esc).
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive(a => Math.min(items.length - 1, a + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(a => Math.max(0, a - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      exec(items[active])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  // Não renderiza nada quando fechado (evita overhead de layout).
  if (!open) return null

  // ── Helper para rótulo do item Criar ──────────────────────────────────────
  // Monta o subtexto "Inbox · amanhã · Alta" igual ao protótipo.
  const createSub = () => {
    const parts: string[] = []
    if (parsed.projectToken) {
      const proj = projects.find(p => p.name.toLowerCase() === parsed.projectToken?.toLowerCase())
        ?? projects.find(p => p.name.toLowerCase().startsWith(parsed.projectToken?.toLowerCase() ?? ''))
      parts.push(proj?.name ?? `Inbox (@${parsed.projectToken}?)`)
    } else {
      parts.push('Inbox')
    }
    if (parsed.dueDate) {
      const [, m, d] = parsed.dueDate.split('-')
      parts.push(`${d}/${m}`)
    }
    if (parsed.priority != null && parsed.priority > 0) {
      parts.push(['', 'Baixa', 'Média', 'Alta'][parsed.priority])
    }
    if (parsed.recur) parts.push(parsed.recur.label)
    return parts.join(' · ')
  }

  // ── Renderização ─────────────────────────────────────────────────────────
  // `idx` rastreia o índice global do item atual no DOM para o realce ativo.
  let idx = -1

  return (
    // Scrim: clique fora → fecha.
    <div
      className="cmdk-scrim"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="cmdk">
        {/* ── Campo de entrada com mirror ── */}
        <div className="cmdk-input-wrap">
          <Icon name="search" size={18} />
          <div className="cmdk-field-wrap">
            {/* Mirror: pinta os tokens reconhecidos sobre o input transparente */}
            {text && (
              <div className="cmdk-mirror" ref={mirrorRef} aria-hidden="true">
                {parsed.segments.map((s, i) =>
                  s.cls
                    ? <span key={i} className={s.cls}>{s.text}</span>
                    : <span key={i}>{s.text}</span>
                )}
              </div>
            )}
            <input
              ref={inputRef}
              className={'cmdk-input' + (text ? '' : ' plain')}
              value={text}
              placeholder="Criar, buscar ou navegar…  ex.: reunião toda segunda !alta"
              onChange={(e) => { setText(e.target.value); requestAnimationFrame(syncScroll) }}
              onScroll={syncScroll}
              onKeyDown={onKey}
            />
          </div>
          <span className="cmdk-esc">esc</span>
        </div>

        {/* ── Lista de resultados ── */}
        <div className="cmdk-results" ref={listRef}>

          {/* Grupo CRIAR (só quando há texto) */}
          {text && (() => {
            idx++
            const a = idx === active
            return (
              <>
                <div className="cmdk-group-label">Criar</div>
                <div
                  className={'cmdk-create' + (a ? ' active' : '')}
                  onMouseEnter={() => setActive(idx)}
                  onClick={() => exec(items[0])}   // items[0] = 'create' quando há texto
                >
                  <span className="cc-plus"><Icon name="plus" size={14} /></span>
                  <div className="ci-body">
                    <div className="ci-title">Criar "{parsed.title || text}"</div>
                    <div className="ci-sub">{createSub()}</div>
                  </div>
                  <span className="ci-kbd">↵</span>
                </div>
              </>
            )
          })()}

          {/* Grupo TAREFAS */}
          {items.some(i => i.kind === 'task') && (
            <div className="cmdk-group-label">Tarefas</div>
          )}
          {items.map(it => {
            if (it.kind !== 'task') return null
            idx++
            const a = idx === active
            const myIdx = idx
            const proj = projects.find(p => p.id === it.task.project_id)
            return (
              <div
                key={'t' + it.task.id}
                className={'cmdk-item' + (a ? ' active' : '')}
                onMouseEnter={() => setActive(myIdx)}
                onClick={() => exec(it)}
              >
                {proj?.color
                  ? <span className="ci-icon" style={{ background: proj.color + '28', color: proj.color }}>
                      <Icon name="list" size={14} />
                    </span>
                  : <Icon name="list" size={16} />
                }
                <div className="ci-body">
                  <div className="ci-title">{it.task.title}</div>
                  <div className="ci-sub">
                    {proj?.name ?? ''}{it.task.due_date ? ` · ${it.task.due_date.slice(8)}/${it.task.due_date.slice(5, 7)}` : ''}
                  </div>
                </div>
              </div>
            )
          })}

          {/* Grupo PROJETOS */}
          {items.some(i => i.kind === 'project') && (
            <div className="cmdk-group-label">Projetos</div>
          )}
          {items.map(it => {
            if (it.kind !== 'project') return null
            idx++
            const a = idx === active
            const myIdx = idx
            return (
              <div
                key={'p' + it.proj.id}
                className={'cmdk-item' + (a ? ' active' : '')}
                onMouseEnter={() => setActive(myIdx)}
                onClick={() => exec(it)}
              >
                {it.proj.color
                  ? <span className="ci-icon" style={{ background: it.proj.color + '28', color: it.proj.color }}>
                      <Icon name="list" size={14} />
                    </span>
                  : <Icon name="inbox" size={16} />
                }
                <div className="ci-body">
                  <div className="ci-title">{it.proj.name}</div>
                  <div className="ci-sub">{it.proj.open_count} abertas</div>
                </div>
              </div>
            )
          })}

          {/* Grupo NAVEGAR */}
          {items.some(i => i.kind === 'nav') && (
            <div className="cmdk-group-label">Navegar</div>
          )}
          {items.map(it => {
            if (it.kind !== 'nav') return null
            idx++
            const a = idx === active
            const myIdx = idx
            return (
              <div
                key={'n' + it.cmd.view}
                className={'cmdk-item' + (a ? ' active' : '')}
                onMouseEnter={() => setActive(myIdx)}
                onClick={() => exec(it)}
              >
                <Icon name={it.cmd.icon as any} size={16} />
                <div className="ci-body">
                  <div className="ci-title">{it.cmd.label}</div>
                </div>
              </div>
            )
          })}
        </div>

        {/* ── Rodapé com dicas de teclado ── */}
        <div className="cmdk-foot">
          <span className="cf-hint"><kbd>↑</kbd><kbd>↓</kbd> navegar</span>
          <span className="cf-hint"><kbd>↵</kbd> selecionar</span>
          <span className="cf-hint"><kbd>esc</kbd> fechar</span>
        </div>
      </div>
    </div>
  )
}
