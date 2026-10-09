// Organizar: criar/editar LISTA, GRUPO e SMART-LIST (filtro salvo) e gerenciar os LOCAIS (“Onde (@)”, os contextos de
// execução do GTD). Lista: nome, grupo, espaço (Trabalho/Pessoal), cadência de revisão, projeto sequencial, arquivar e excluir
// (as tarefas vão para o Inbox ou junto). Grupo: nome e espaço — listas novas herdam, e dá para aplicar a todas as de uma vez.
// Excluir sempre confirma e diz o que acontece; o que vai para a lixeira pode voltar de lá.

import { useEffect, useState } from 'react'
import { Button, Field, IconButton, Input, Modal, NumberInput, SegmentedControl, Select, Toggle, confirm, toast } from '../../../design'
import { kaguyaApi } from '../api'
import { useKaguya } from '../context'
import type { FilterRules, Filter, Group, Project, TaskContext, WorkContext } from '../types'
import { FilterBuilder, SMARTLIST_FIELDS } from './FilterBuilder'

const reason = (e: unknown, fallback: string) => (e instanceof Error && e.message && !/^HTTP \d+$/.test(e.message) ? e.message : fallback)
const SPACES: { value: WorkContext; label: string }[] = [{ value: 'personal', label: 'Pessoal' }, { value: 'work', label: 'Trabalho' }]

export function ProjectModal({ project, groupId, onClose, onSaved }: { project?: Project; groupId?: number; onClose: () => void; onSaved?: (id?: number) => void }) {
  const k = useKaguya()
  const inbox = project?.is_inbox === true
  const [name, setName] = useState(project?.name ?? '')
  const [group, setGroup] = useState<number | null>(project?.group_id ?? groupId ?? null)
  // O espaço de uma lista nova segue o do grupo escolhido (a menos que o usuário troque).
  const [context, setContext] = useState<WorkContext>(project?.context ?? k.groups.find((g) => g.id === (groupId ?? -1))?.context ?? 'personal')
  const [review, setReview] = useState(project?.review_interval_days != null ? String(project.review_interval_days) : '')
  const [sequential, setSequential] = useState(project?.sequential === true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(false)

  const pickGroup = (id: number | null) => {
    setGroup(id)
    const inherited = k.groups.find((g) => g.id === id)?.context
    if (!project && inherited) setContext(inherited)
  }

  const save = async () => {
    if (!name.trim()) { setError('Dê um nome à lista.'); return }
    const days = review.trim() ? Number(review) : null
    if (review.trim() && !(days != null && days > 0)) { setError('A cadência de revisão precisa ser maior que zero.'); return }
    setSaving(true)
    try {
      if (!project) {
        const r = await kaguyaApi.createProject({ name: name.trim(), group_id: group ?? undefined, context })
        if (r.status === 'error') { setError(r.message ?? 'Não foi possível criar a lista.'); return }
        // Cadência e sequencial não vão na criação: gravam em seguida, se foram escolhidos.
        if (r.id && (days || sequential)) await kaguyaApi.updateProject(r.id, { review_interval_days: days, sequential })
        toast('Lista criada.', { tone: 'success' })
        k.reload()
        onSaved?.(r.id)
      } else {
        await kaguyaApi.updateProject(project.id, { name: name.trim(), ...(group !== null ? { group_id: group } : {}), ...(inbox ? {} : { context }), review_interval_days: days, sequential })
        toast('Lista atualizada.', { tone: 'success' })
        k.reload()
        onSaved?.(project.id)
      }
      onClose()
    } catch (e) { setError(reason(e, 'Não foi possível salvar a lista.')) } finally { setSaving(false) }
  }

  const leave = () => { if (k.route.view === 'list' || k.route.view === 'kanban') k.goto({ view: 'today' }) }
  const archive = async () => {
    if (!project) return
    try { await kaguyaApi.archiveProject(project.id); toast('Lista arquivada.', { tone: 'success', undo: () => { void kaguyaApi.restoreProject(project.id).then(k.reload) } }); k.reload(); leave(); onClose() }
    catch (e) { toast(reason(e, 'Não foi possível arquivar a lista.'), { tone: 'error' }) }
  }
  const remove = async (mode: 'move_to_inbox' | 'delete_tasks') => {
    if (!project) return
    try {
      await kaguyaApi.deleteProject(project.id, mode)
      toast('Lista excluída — está na Lixeira.', { tone: 'success' })
      k.reload(); leave(); onClose()
    } catch (e) { toast(reason(e, 'Não foi possível excluir a lista.'), { tone: 'error' }) }
  }

  return (
    <>
      <Modal
        title={project ? 'Editar lista' : 'Nova lista'}
        size="md"
        dirty
        onClose={onClose}
        footer={(
          <>
            {project && !inbox && <Button icon="archive" onClick={() => void archive()}>Arquivar</Button>}
            {project && !inbox && <Button variant="danger" icon="delete" onClick={() => setDeleting(true)}>Excluir</Button>}
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button variant="primary" disabled={saving} onClick={() => void save()}>{saving ? 'Salvando…' : 'Salvar'}</Button>
          </>
        )}
      >
        <Field label="Nome" error={error || undefined}>{(c) => <Input {...c} autoFocus value={name} placeholder="Ex.: Casa, Estudos…" onChange={(e) => { setName(e.target.value); setError('') }} onKeyDown={(e) => { if (e.key === 'Enter') void save() }} />}</Field>
        <Field label="Grupo">{(c) => (
          <Select {...c} value={group ?? ''} onChange={(e) => pickGroup(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Sem grupo</option>
            {k.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </Select>
        )}</Field>
        {!inbox && (
          <Field label="Espaço" hint="Trabalho ou Pessoal: filtra todas as telas e define quando a lista aparece no digest.">{() => (
            <SegmentedControl<WorkContext> label="Espaço da lista" value={context} onChange={setContext} options={SPACES} />
          )}</Field>
        )}
        <div className="kn-props">
          <Field label="Revisar a cada (dias)" hint="Vazio = sem cadência. A revisão semanal destaca as listas vencidas.">{(c) => <NumberInput {...c} min={1} value={review} placeholder="Ex.: 7" onChange={(e) => setReview(e.target.value)} />}</Field>
        </div>
        <Toggle checked={sequential} onChange={setSequential} label="Lista sequencial (só a próxima tarefa aparece)" />
      </Modal>
      {deleting && project && (
        <Modal
          title={`Excluir “${project.name}”?`}
          size="sm"
          onClose={() => setDeleting(false)}
          footer={(
            <>
              <Button variant="ghost" onClick={() => setDeleting(false)}>Cancelar</Button>
              <Button onClick={() => void remove('move_to_inbox')}>Mover tarefas para o Inbox</Button>
              <Button variant="danger" onClick={() => void remove('delete_tasks')}>Excluir as tarefas junto</Button>
            </>
          )}
        >
          <p>O que fazer com as {project.open_count} tarefas abertas desta lista? A lista vai para a Lixeira e pode ser restaurada de lá.</p>
        </Modal>
      )}
    </>
  )
}

export function GroupModal({ group, onClose, onSaved }: { group?: Group; onClose: () => void; onSaved?: (id?: number) => void }) {
  const k = useKaguya()
  const [name, setName] = useState(group?.name ?? '')
  const [context, setContext] = useState<WorkContext>(group?.context ?? 'personal')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const lists = group ? k.projects.filter((p) => p.group_id === group.id).length : 0

  const save = async () => {
    if (!name.trim()) { setError('Dê um nome ao grupo.'); return }
    setSaving(true)
    try {
      if (!group) {
        const r = await kaguyaApi.createGroup(name.trim(), context)
        toast('Grupo criado.', { tone: 'success' })
        k.reload()
        onSaved?.(r.id)
      } else {
        await kaguyaApi.updateGroup(group.id, { name: name.trim() })
        toast('Grupo atualizado.', { tone: 'success' })
        k.reload()
        onSaved?.(group.id)
      }
      onClose()
    } catch (e) { setError(reason(e, 'Não foi possível salvar o grupo.')) } finally { setSaving(false) }
  }

  const applyToLists = async () => {
    if (!group) return
    try {
      const r = await kaguyaApi.setGroupContext(group.id, context)
      toast(`${r.updated} lista(s) marcada(s) como ${context === 'work' ? 'Trabalho' : 'Pessoal'}.`, { tone: 'success' })
      k.reload()
    } catch (e) { toast(reason(e, 'Não foi possível atualizar as listas do grupo.'), { tone: 'error' }) }
  }

  const remove = async () => {
    if (!group) return
    const ok = await confirm({ title: `Excluir o grupo “${group.name}”?`, body: lists ? `As ${lists} listas dele voltam para “Sem grupo” (não são apagadas).` : 'O grupo está vazio.', confirmLabel: 'Excluir grupo', danger: true })
    if (!ok) return
    try {
      await kaguyaApi.deleteGroup(group.id)
      toast('Grupo excluído.', { tone: 'success' })
      k.reload()
      if (k.route.view === 'group' || k.route.view === 'group-list') k.goto({ view: 'today' })
      onClose()
    } catch (e) { toast(reason(e, 'Não foi possível excluir o grupo.'), { tone: 'error' }) }
  }

  return (
    <Modal
      title={group ? 'Editar grupo' : 'Novo grupo'}
      size="sm"
      dirty
      onClose={onClose}
      footer={(
        <>
          {group && <Button variant="danger" icon="delete" onClick={() => void remove()}>Excluir</Button>}
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={saving} onClick={() => void save()}>{saving ? 'Salvando…' : 'Salvar'}</Button>
        </>
      )}
    >
      <Field label="Nome" error={error || undefined}>{(c) => <Input {...c} autoFocus value={name} placeholder="Ex.: Pessoal, Trabalho…" onChange={(e) => { setName(e.target.value); setError('') }} onKeyDown={(e) => { if (e.key === 'Enter') void save() }} />}</Field>
      <Field label="Espaço do grupo" hint={group ? 'As listas novas deste grupo herdam o espaço. Use o botão para aplicar às listas que já existem.' : 'As listas novas deste grupo herdam o espaço.'}>{() => (
        <div className="kn-quick">
          <SegmentedControl<WorkContext> label="Espaço do grupo" value={context} onChange={setContext} options={SPACES} />
          {group && lists > 0 && <Button size="sm" onClick={() => void applyToLists()}>Aplicar às {lists} listas</Button>}
        </div>
      )}</Field>
    </Modal>
  )
}

export function SmartListModal({ filter, onClose, onSaved }: { filter?: Filter; onClose: () => void; onSaved?: (id?: number) => void }) {
  const k = useKaguya()
  const [name, setName] = useState(filter?.name ?? '')
  const [rules, setRules] = useState<FilterRules>(filter?.rules?.conditions?.length ? filter.rules : { combinator: 'and', conditions: [{ field: 'priority', op: 'gte', value: 2 }] })
  const [contexts, setContexts] = useState<TaskContext[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { kaguyaApi.listContexts().then(setContexts).catch(() => setContexts([])) }, [])

  const save = async () => {
    if (!name.trim()) { setError('Dê um nome à smart-list.'); return }
    if (rules.conditions.length === 0) { setError('Adicione ao menos uma condição.'); return }
    setSaving(true)
    try {
      if (!filter) {
        const r = await kaguyaApi.createFilter({ name: name.trim(), rules })
        toast('Smart-list criada.', { tone: 'success' })
        k.reload()
        onSaved?.(r.id)
      } else {
        await kaguyaApi.updateFilter(filter.id, { name: name.trim(), rules })
        toast('Smart-list atualizada.', { tone: 'success' })
        k.reload()
        onSaved?.(filter.id)
      }
      onClose()
    } catch (e) { setError(reason(e, 'Não foi possível salvar a smart-list.')) } finally { setSaving(false) }
  }

  const remove = async () => {
    if (!filter) return
    const ok = await confirm({ title: `Excluir a smart-list “${filter.name}”?`, body: 'Só o filtro salvo some; nenhuma tarefa é apagada.', confirmLabel: 'Excluir smart-list', danger: true })
    if (!ok) return
    try {
      await kaguyaApi.deleteFilter(filter.id)
      toast('Smart-list excluída.', { tone: 'success' })
      k.reload()
      if (k.route.view === 'filter' && k.route.id === filter.id) k.goto({ view: 'today' })
      onClose()
    } catch (e) { toast(reason(e, 'Não foi possível excluir a smart-list.'), { tone: 'error' }) }
  }

  return (
    <Modal
      title={filter ? 'Editar smart-list' : 'Nova smart-list'}
      size="lg"
      dirty
      onClose={onClose}
      footer={(
        <>
          {filter && <Button variant="danger" icon="delete" onClick={() => void remove()}>Excluir</Button>}
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={saving} onClick={() => void save()}>{saving ? 'Salvando…' : 'Salvar'}</Button>
        </>
      )}
    >
      <Field label="Nome" error={error || undefined}>{(c) => <Input {...c} autoFocus value={name} placeholder="Ex.: Urgentes de trabalho" onChange={(e) => { setName(e.target.value); setError('') }} />}</Field>
      <Field label="Regras" hint="A smart-list mostra as tarefas que cumprem as condições, sempre atualizadas.">{() => (
        <FilterBuilder value={rules} onChange={setRules} today={k.today} fields={SMARTLIST_FIELDS} projects={k.projects} groups={k.groups} contexts={contexts} />
      )}</Field>
    </Modal>
  )
}

/** Os locais de execução do GTD (“Onde (@)”): criar, renomear, reordenar e excluir. */
export function ContextsModal({ onClose }: { onClose: () => void }) {
  const k = useKaguya()
  const [items, setItems] = useState<TaskContext[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<{ id: number; name: string } | null>(null)

  const load = async () => {
    try { setItems((await kaguyaApi.listContexts()).sort((a, b) => a.position - b.position)) } catch { toast('Não foi possível carregar os locais.', { tone: 'error' }) } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])

  const run = async (fn: () => Promise<{ status?: string; message?: string } | unknown>, fallback: string) => {
    try {
      const r = (await fn()) as { status?: string; message?: string }
      if (r?.status === 'error') { toast(r.message ?? fallback, { tone: 'error' }); return false }
      await load(); k.reload(); return true
    } catch (e) { toast(reason(e, fallback), { tone: 'error' }); return false }
  }
  const add = async () => { if (name.trim() && (await run(() => kaguyaApi.createContext({ name: name.trim() }), 'Não foi possível criar o local.'))) setName('') }
  const rename = async () => { if (editing?.name.trim() && (await run(() => kaguyaApi.updateContext(editing.id, { name: editing.name.trim() }), 'Não foi possível renomear.'))) setEditing(null) }
  const remove = async (c: TaskContext) => {
    if (!(await confirm({ title: `Excluir “${c.name}”?`, body: 'As tarefas que usam este local ficam sem local (não são apagadas).', confirmLabel: 'Excluir', danger: true }))) return
    await run(() => kaguyaApi.deleteContext(c.id), 'Não foi possível excluir.')
  }
  const move = async (i: number, dir: -1 | 1) => {
    const a = items[i]
    const b = items[i + dir]
    if (!b) return
    // Troca as posições dos dois (as posições podem ter lacunas, então não basta somar 1).
    await run(async () => { await kaguyaApi.updateContext(a.id, { position: b.position }); await kaguyaApi.updateContext(b.id, { position: a.position }) }, 'Não foi possível reordenar.')
  }

  return (
    <Modal title="Onde (@)" size="sm" onClose={onClose} footer={<Button variant="primary" onClick={onClose}>Fechar</Button>}>
      <p className="ds-hint">Os lugares ou ferramentas onde uma tarefa pode ser feita (casa, computador, rua…). Use para filtrar o que dá para fazer agora.</p>
      <div className="kn-quick-i">
        <Input aria-label="Novo local" value={name} placeholder="Ex.: casa" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void add() }} />
        <Button variant="primary" icon="add" disabled={!name.trim()} onClick={() => void add()}>Adicionar</Button>
      </div>
      {loading && <p className="ds-hint">Carregando…</p>}
      {!loading && items.length === 0 && <p className="ds-hint">Nenhum local ainda.</p>}
      <ul className="kn-sublist" aria-label="Locais">
        {items.map((c, i) => (
          <li key={c.id}>
            <span className="kn-quick-i">
              <IconButton icon="up" label={`Subir ${c.name}`} size={14} disabled={i === 0} onClick={() => void move(i, -1)} />
              <IconButton icon="down" label={`Descer ${c.name}`} size={14} disabled={i === items.length - 1} onClick={() => void move(i, 1)} />
            </span>
            {editing?.id === c.id ? (
              <Input aria-label={`Novo nome de ${c.name}`} autoFocus value={editing.name} onChange={(e) => setEditing({ id: c.id, name: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') void rename(); if (e.key === 'Escape') setEditing(null) }} onBlur={() => void rename()} />
            ) : <span className="kn-title">{c.name}</span>}
            <IconButton icon="edit" label={`Renomear ${c.name}`} size={14} onClick={() => setEditing({ id: c.id, name: c.name })} />
            <IconButton icon="delete" label={`Excluir ${c.name}`} size={14} onClick={() => void remove(c)} />
          </li>
        ))}
      </ul>
    </Modal>
  )
}
