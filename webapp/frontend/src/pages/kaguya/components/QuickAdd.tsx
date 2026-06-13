// QuickAdd — captura em segundos com parsing determinístico e highlight ao vivo
// (guia §4.3/§6). Reconhece @lista, !prioridade, #tag, datas e recorrência (fatia 018);
// o ParseMirror espelha o input pintando os tokens coloridos.
// Token de lista que não casa → Inbox, com aviso.

import { useMemo, useState } from 'react'
import type { Project } from '../types'
import { kaguyaApi } from '../kaguyaApi'
import { parseTask, taskFromParse } from '../../../lib/parseTask'
import { Icon } from '../ui/Icons'

interface QuickAddProps {
  projects: Project[]
  onCreated: (id?: number) => void   // id opcional (backwards-compatible com callers antigos)
  toast: (msg: string, kind?: 'ok' | 'err') => void
  placeholder?: string               // texto do input (Meu Dia usa "Adicionar ao dia…")
}

export function QuickAdd({ projects, onCreated, toast, placeholder }: QuickAddProps) {
  const [text, setText] = useState('')

  // Reparseia a cada tecla (barato) para alimentar o mirror.
  const parsed = useMemo(() => parseTask(text), [text])

  const submit = async () => {
    if (!parsed.title) return
    // taskFromParse resolve @projectToken e inclui recorrência (fatia 018).
    const params = taskFromParse(parsed, projects)
    // Token de lista informado mas não encontrado → cai no Inbox, avisa.
    if (parsed.projectToken && !params.project_id) {
      toast(`Lista "@${parsed.projectToken}" não encontrada — fui pro Inbox.`, 'err')
    }
    try {
      const r = await kaguyaApi.createTask(params)
      setText('')
      onCreated(r.id)                     // passa o id para o caller (ex.: Meu Dia auto-adiciona)
    } catch {
      toast('Não foi possível criar a tarefa.', 'err')
    }
  }

  // Resolve apenas para o preview (sem aviso de Inbox — só para exibir o nome).
  const resolveProjectPreview = (token: string | null): Project | null => {
    if (!token) return null
    const n = token.toLowerCase()
    return (
      projects.find((p) => p.name.toLowerCase() === n) ??
      projects.find((p) => p.name.toLowerCase().startsWith(n)) ??
      null
    )
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
          placeholder={placeholder ?? 'Captura rápida — ex.: ligar pro banco @Casa !alta'}
        />
      </div>
      {/* dica de tokens reconhecidos (lista + data + prioridade + tags + recorrência) */}
      {(parsed.projectToken || parsed.priority || parsed.dueDate || parsed.tags.length > 0 || parsed.recur) && (
        <div className="kg-qa-preview">
          {parsed.projectToken && <span className="kg-chip"><Icon name="inbox" size={11} />{resolveProjectPreview(parsed.projectToken)?.name ?? `Inbox (@${parsed.projectToken}?)`}</span>}
          {parsed.dueDate && <span className="kg-chip"><Icon name="calendar" size={11} />{parsed.dueDate.slice(8) + '/' + parsed.dueDate.slice(5, 7)}{parsed.dueTime ? ` ${parsed.dueTime}` : ''}</span>}
          {parsed.priority != null && <span className="kg-chip">Prioridade {['', 'baixa', 'média', 'alta'][parsed.priority]}</span>}
          {/* chip de recorrência (fatia 018) */}
          {parsed.recur && <span className="kg-chip kg-chip-recur">↺ {parsed.recur.label}</span>}
          {/* uma "pílula" por tag reconhecida (#mercado, #5min…) */}
          {parsed.tags.map((t) => <span key={t} className="kg-chip kg-chip-tag">#{t}</span>)}
        </div>
      )}
    </div>
  )
}
