// Barra de ação em massa: aparece quando há tarefas selecionadas. Cada botão é UMA transação no servidor, com
// "Desfazer" no aviso. Concluir, Meu Dia, prioridade, data, mover de lista, etiqueta e excluir.

import { useState } from 'react'
import { Button, Menu, Select } from '../../../design'
import { addDaysISO } from '../../../design/core/format'
import * as act from '../lib/actions'
import { PRIORITY_LABEL, PRIORITY_ORDER } from '../lib/taskView'
import type { Project, Task } from '../types'

interface Props {
  tasks: Task[]
  today: string
  projects: Project[]
  reload: () => void
  onClear: () => void
}

export function BulkBar({ tasks, today, projects, reload, onClear }: Props) {
  const [menu, setMenu] = useState<'prio' | 'due' | 'tag' | null>(null)
  const [tag, setTag] = useState('')
  const deps = { reload }
  const ids = tasks.map((t) => t.id)
  const run = async (p: Promise<boolean | unknown>) => { if (await p) onClear() }

  return (
    <div className="kn-bulk" role="toolbar" aria-label="Ações para as tarefas selecionadas">
      <b className="kn-bulk-n">{tasks.length} selecionada{tasks.length > 1 ? 's' : ''}</b>
      <Button size="sm" icon="check" onClick={() => run(act.runBulk(deps, ids, 'complete', null, `${tasks.length} tarefas concluídas.`))}>Concluir</Button>
      <Button size="sm" icon="sun" onClick={() => run(act.addToMyDay(deps, ids))}>Meu Dia</Button>

      <span className="kn-menu">
        <Button size="sm" icon="flag" onClick={() => setMenu(menu === 'prio' ? null : 'prio')} aria-haspopup="menu">Prioridade</Button>
        {menu === 'prio' && (
          <Menu label="Prioridade" onClose={() => setMenu(null)} items={PRIORITY_ORDER.map((p) => ({ id: `p${p}`, label: PRIORITY_LABEL[p], onSelect: () => void run(act.setPriority(deps, ids, p)) }))} />
        )}
      </span>

      <span className="kn-menu">
        <Button size="sm" icon="calendar" onClick={() => setMenu(menu === 'due' ? null : 'due')} aria-haspopup="menu">Data</Button>
        {menu === 'due' && (
          <Menu label="Data" onClose={() => setMenu(null)} items={[
            { id: 'today', label: 'Hoje', onSelect: () => void run(act.setDueDate(deps, ids, today)) },
            { id: 'tomorrow', label: 'Amanhã', onSelect: () => void run(act.setDueDate(deps, ids, addDaysISO(today, 1))) },
            { id: 'week', label: 'Daqui a 7 dias', onSelect: () => void run(act.setDueDate(deps, ids, addDaysISO(today, 7))) },
            { id: 'none', label: 'Sem data', onSelect: () => void run(act.setDueDate(deps, ids, null)) },
          ]} />
        )}
      </span>

      <Select
        aria-label="Mover para a lista"
        value=""
        onChange={(e) => {
          const p = projects.find((x) => x.id === Number(e.target.value))
          if (p) void run(act.moveToProject(deps, ids, p.id, p.name))
        }}
      >
        <option value="">Mover para…</option>
        {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </Select>

      <span className="kn-menu">
        <Button size="sm" icon="tag" onClick={() => setMenu(menu === 'tag' ? null : 'tag')} aria-expanded={menu === 'tag'}>Etiqueta</Button>
        {menu === 'tag' && (
          <form
            className="kn-popform"
            onSubmit={(e) => { e.preventDefault(); if (tag.trim()) { void run(act.addTag(deps, ids, tag.trim().replace(/^#/, ''))); setTag(''); setMenu(null) } }}
          >
            <input className="ds-input" aria-label="Nome da etiqueta" placeholder="#etiqueta" value={tag} onChange={(e) => setTag(e.target.value)} autoFocus />
            <Button size="sm" variant="primary" type="submit">Aplicar</Button>
          </form>
        )}
      </span>

      <Button size="sm" variant="danger" icon="delete" onClick={() => run(act.deleteTasks(deps, tasks))}>Excluir</Button>
      <Button size="sm" variant="ghost" icon="close" onClick={onClear}>Limpar</Button>
    </div>
  )
}
