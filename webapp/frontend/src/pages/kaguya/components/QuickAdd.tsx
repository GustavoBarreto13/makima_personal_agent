// QuickAdd — captura em segundos com parsing determinístico e highlight ao vivo
// (guia §4.3/§6). Reconhece @lista e !prioridade; o ParseMirror espelha o input
// pintando os tokens. Token de lista que não casa → Inbox, com aviso.

import { useMemo, useState } from 'react'
import type { Project } from '../types'
import { kaguyaApi } from '../kaguyaApi'
import { parseTask } from '../../../lib/parseTask'
import { Icon } from '../ui/Icons'

interface QuickAddProps {
  projects: Project[]
  onCreated: () => void
  toast: (msg: string, kind?: 'ok' | 'err') => void
}

export function QuickAdd({ projects, onCreated, toast }: QuickAddProps) {
  const [text, setText] = useState('')

  // Reparseia a cada tecla (barato) para alimentar o mirror.
  const parsed = useMemo(() => parseTask(text), [text])

  // Resolve o token @lista contra as listas carregadas (prefixo, case-insensitive).
  const resolveProject = (token: string | null): Project | null => {
    if (!token) return null
    const norm = token.toLowerCase()
    return (
      projects.find((p) => p.name.toLowerCase() === norm) ??
      projects.find((p) => p.name.toLowerCase().startsWith(norm)) ??
      null
    )
  }

  const submit = async () => {
    if (!parsed.title) return
    const proj = resolveProject(parsed.projectToken)
    // Token de lista informado mas não encontrado → cai no Inbox, avisa.
    if (parsed.projectToken && !proj) {
      toast(`Lista "@${parsed.projectToken}" não encontrada — fui pro Inbox.`, 'err')
    }
    try {
      await kaguyaApi.createTask({
        title: parsed.title,
        project_id: proj?.id,             // undefined → Inbox no backend
        priority: parsed.priority ?? 0,
        due_date: parsed.dueDate,         // data determinística (amanhã, sexta 17h…)
        due_time: parsed.dueTime,
        tags: parsed.tags.length ? parsed.tags : undefined,   // #tag → etiquetas
      })
      setText('')
      onCreated()
    } catch {
      toast('Não foi possível criar a tarefa.', 'err')
    }
  }

  return (
    <div className="kg-quickadd">
      <div className="kg-qa-wrap">
        {/* mirror: mesmas métricas do input, pinta os tokens reconhecidos */}
        <div className="kg-mirror" aria-hidden="true">
          {parsed.segments.map((s, i) => <span key={i} className={s.cls}>{s.text}</span>)}
        </div>
        <input
          className="kg-qa-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
          placeholder="Captura rápida — ex.: ligar pro banco @Casa !alta"
        />
      </div>
      {/* dica de tokens reconhecidos */}
      {(parsed.projectToken || parsed.priority || parsed.dueDate || parsed.tags.length > 0) && (
        <div className="kg-qa-preview">
          {parsed.projectToken && <span className="kg-chip"><Icon name="inbox" size={11} />{resolveProject(parsed.projectToken)?.name ?? `Inbox (@${parsed.projectToken}?)`}</span>}
          {parsed.dueDate && <span className="kg-chip"><Icon name="calendar" size={11} />{parsed.dueDate.slice(8) + '/' + parsed.dueDate.slice(5, 7)}{parsed.dueTime ? ` ${parsed.dueTime}` : ''}</span>}
          {parsed.priority != null && <span className="kg-chip">Prioridade {['', 'baixa', 'média', 'alta'][parsed.priority]}</span>}
          {/* uma "pílula" por tag reconhecida (#mercado, #5min…) */}
          {parsed.tags.map((t) => <span key={t} className="kg-chip kg-chip-tag">#{t}</span>)}
        </div>
      )}
    </div>
  )
}
