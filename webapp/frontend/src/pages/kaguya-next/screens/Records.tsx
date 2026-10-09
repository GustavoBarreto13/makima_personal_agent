// Telas de registro: Concluídas (logbook por dia), Lixeira (por árvore, com restaurar/excluir de vez/esvaziar),
// Arquivadas (e listas excluídas), Templates e o gerenciador de Etiquetas. Todas com os 4 estados.

import { useMemo, useState } from 'react'
import {
  Button, EmptyState, ErrorState, Icon, IconButton, Input, LoadingState, Page, SectionHeader, Select, confirm, toast,
} from '../../../design'
import { fmtDateLong } from '../../../design/core/format'
import { kaguyaApi } from '../api'
import { TaskRow } from '../components/TaskRow'
import { useKaguya } from '../context'
import * as act from '../lib/actions'
import { useLoad } from '../lib/useLoad'
import type { Task } from '../types'

const reason = (e: unknown) => (e instanceof Error && e.message && !/^HTTP \d+$/.test(e.message) ? e.message : 'Não foi possível concluir a ação.')

// ── Concluídas ────────────────────────────────────────────────────────────────

export function Logbook() {
  const k = useKaguya()
  const [q, setQ] = useState('')
  const { state, retry } = useLoad(() => kaguyaApi.completed({ space: k.space, q: q.trim() || undefined, limit: 300 }), [k.rev, k.space, q])
  const byDay = useMemo(() => {
    if (state.status !== 'ok') return []
    const m = new Map<string, Task[]>()
    for (const t of state.data.items as (Task & { completed_day?: string })[]) {
      const d = t.completed_day ?? (t.completed_at ?? '').slice(0, 10)
      m.set(d, [...(m.get(d) ?? []), t])
    }
    return [...m.entries()]
  }, [state])

  return (
    <Page wide className="kn-page">
      <Input aria-label="Buscar nas concluídas" type="search" placeholder="Buscar nas concluídas…" value={q} onChange={(e) => setQ(e.target.value)} />
      {state.status === 'loading' && <LoadingState variant="row" count={5} />}
      {state.status === 'error' && <ErrorState onRetry={retry} />}
      {state.status === 'ok' && state.data.total === 0 && (
        <EmptyState icon="logbook" title={q ? 'Nada encontrado' : 'Nenhuma tarefa concluída ainda'} hint={q ? 'Tente outra palavra.' : 'O que você concluir aparece aqui, dia a dia — para ver o quanto você realmente fez.'} />
      )}
      {state.status === 'ok' && byDay.map(([day, tasks]) => (
        <section key={day} aria-label={fmtDateLong(day)}>
          <SectionHeader title={fmtDateLong(day)} mono={`${state.data.by_day[day] ?? tasks.length} concluída${(state.data.by_day[day] ?? tasks.length) > 1 ? 's' : ''}`} />
          <ul className="kn-rows">
            {tasks.map((t) => (
              <TaskRow key={t.id} task={t} today={k.today} showProject showDetails={false}
                onToggle={() => void act.toggleComplete({ reload: k.reload }, t)} onOpen={() => k.openTask(t.id)} />
            ))}
          </ul>
        </section>
      ))}
      {state.status === 'ok' && state.data.total > state.data.items.length && (
        <p className="ds-hint">Mostrando as {state.data.items.length} mais recentes de {state.data.total}. Use a busca para achar as antigas.</p>
      )}
    </Page>
  )
}

// ── Lixeira ───────────────────────────────────────────────────────────────────

export function Trash() {
  const k = useKaguya()
  const items = useLoad(() => kaguyaApi.trashDetailed({ space: k.space }), [k.rev, k.space])
  const lists = useLoad(() => kaguyaApi.deletedProjects(), [k.rev])

  const run = async (p: Promise<unknown>, ok: string) => {
    try { await p; k.reload(); toast(ok, { tone: 'success' }) } catch (e) { toast(reason(e), { tone: 'error' }) }
  }
  const purge = async (t: Task) => {
    if (await confirm({ title: `Excluir “${t.title}” de vez?`, body: 'Isso não pode ser desfeito.', confirmLabel: 'Excluir de vez', danger: true })) {
      await run(kaguyaApi.trashPurge([t.id]), 'Excluída de vez.')
    }
  }
  const empty = async () => {
    if (await confirm({ title: 'Esvaziar a lixeira?', body: 'Todas as tarefas da lixeira serão excluídas de vez. Isso não pode ser desfeito.', confirmLabel: 'Esvaziar', danger: true })) {
      await run(kaguyaApi.trashEmpty(), 'Lixeira esvaziada.')
    }
  }

  const data = items.state.status === 'ok' ? items.state.data : []
  const deletedLists = lists.state.status === 'ok' ? lists.state.data : []

  return (
    <Page wide className="kn-page">
      {items.state.status === 'loading' && <LoadingState variant="row" count={4} />}
      {items.state.status === 'error' && <ErrorState onRetry={items.retry} />}
      {items.state.status === 'ok' && data.length === 0 && deletedLists.length === 0 && (
        <EmptyState icon="delete" title="A lixeira está vazia" hint="O que você excluir vem para cá e dá para restaurar com um clique." />
      )}
      {data.length > 0 && (
        <section aria-label="Tarefas excluídas">
          <SectionHeader title="Tarefas" mono={`${data.length}`} action={
            <span className="kn-quick-i">
              <Button size="sm" icon="restore" onClick={() => void run(kaguyaApi.trashRestore(data.map((t) => t.id)), 'Tudo restaurado.')}>Restaurar tudo</Button>
              <Button size="sm" variant="danger" icon="delete" onClick={() => void empty()}>Esvaziar</Button>
            </span>
          } />
          <ul className="kn-sublist">
            {data.map((t) => (
              <li key={t.id}>
                <span className="kn-main">
                  <span className="kn-title">{t.title}</span>
                  <span className="kn-snippet">{[t.project_name, t.descendants ? `+${t.descendants} subtarefa${t.descendants > 1 ? 's' : ''}` : null, t.deleted_at ? `excluída em ${t.deleted_at.slice(0, 10).split('-').reverse().join('/')}` : null].filter(Boolean).join(' · ')}</span>
                </span>
                <Button size="sm" icon="restore" onClick={() => void run(kaguyaApi.trashRestore([t.id]), `“${t.title}” restaurada.`)}>Restaurar</Button>
                <IconButton icon="delete" label={`Excluir “${t.title}” de vez`} onClick={() => void purge(t)} />
              </li>
            ))}
          </ul>
        </section>
      )}
      {deletedLists.length > 0 && (
        <section aria-label="Listas excluídas">
          <SectionHeader title="Listas excluídas" mono={`${deletedLists.length}`} />
          <ul className="kn-sublist">
            {deletedLists.map((p) => (
              <li key={p.id}>
                <span className="kn-main"><span className="kn-title">{p.name}</span><span className="kn-snippet">volta sem o quadro (as colunas foram apagadas)</span></span>
                <Button size="sm" icon="restore" onClick={() => void run(kaguyaApi.restoreDeletedProject(p.id), `Lista “${p.name}” restaurada.`)}>Restaurar</Button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Page>
  )
}

// ── Arquivadas ────────────────────────────────────────────────────────────────

export function Archived() {
  const k = useKaguya()
  const { state, retry } = useLoad(() => kaguyaApi.listArchivedProjects(), [k.rev])
  return (
    <Page className="kn-page">
      {state.status === 'loading' && <LoadingState variant="row" count={3} />}
      {state.status === 'error' && <ErrorState onRetry={retry} />}
      {state.status === 'ok' && state.data.length === 0 && (
        <EmptyState icon="archive" title="Nenhuma lista arquivada" hint="Arquive uma lista que você não usa mais: ela some do menu mas guarda tudo, e dá para trazer de volta." />
      )}
      {state.status === 'ok' && state.data.length > 0 && (
        <ul className="kn-sublist">
          {state.data.map((p) => (
            <li key={p.id}>
              <Icon name="folder" size={16} />
              <span className="kn-main"><span className="kn-title">{p.name}</span><span className="kn-snippet">{p.task_count} tarefa{p.task_count === 1 ? '' : 's'}</span></span>
              <Button size="sm" icon="restore" onClick={() => void kaguyaApi.restoreProject(p.id).then(() => { k.reload(); toast(`“${p.name}” restaurada.`, { tone: 'success' }) }).catch((e) => toast(reason(e), { tone: 'error' }))}>Restaurar</Button>
            </li>
          ))}
        </ul>
      )}
    </Page>
  )
}

// ── Templates ─────────────────────────────────────────────────────────────────

export function Templates() {
  const k = useKaguya()
  const { state, retry } = useLoad(() => kaguyaApi.templates(undefined, k.space), [k.rev, k.space])
  const [target, setTarget] = useState<Record<number, number>>({})

  const apply = async (id: number, kind: 'task' | 'project') => {
    try {
      const r = await kaguyaApi.applyTemplate(id, kind === 'task' ? { project_id: target[id] ?? k.inboxId } : {})
      k.reload()
      toast('Template aplicado.', { tone: 'success' })
      if (kind === 'project' && r.id) k.goto({ view: 'list', id: r.id })
      if (kind === 'task' && r.id) k.openTask(r.id)
    } catch (e) { toast(reason(e), { tone: 'error' }) }
  }
  const remove = async (id: number, name: string) => {
    if (await confirm({ title: `Excluir o template “${name}”?`, confirmLabel: 'Excluir', danger: true })) {
      await kaguyaApi.deleteTemplate(id).then(k.reload).catch((e) => toast(reason(e), { tone: 'error' }))
    }
  }

  return (
    <Page className="kn-page">
      {state.status === 'loading' && <LoadingState variant="row" count={3} />}
      {state.status === 'error' && <ErrorState onRetry={retry} />}
      {state.status === 'ok' && state.data.length === 0 && (
        <EmptyState icon="template" title="Nenhum template ainda" hint="Abra uma tarefa e use “Salvar como template” no menu. Rotinas repetidas (viagem, mudança, onboarding) viram um clique." />
      )}
      {state.status === 'ok' && state.data.length > 0 && (
        <ul className="kn-sublist">
          {state.data.map((t) => (
            <li key={t.id}>
              <Icon name={t.kind === 'project' ? 'folder' : 'task'} size={16} />
              <span className="kn-main"><span className="kn-title">{t.name}</span><span className="kn-snippet">{t.kind === 'project' ? 'Lista' : 'Tarefa'} · {t.context === 'work' ? 'Trabalho' : 'Pessoal'}</span></span>
              {t.kind === 'task' && (
                <Select aria-label={`Lista de destino de ${t.name}`} value={target[t.id] ?? k.inboxId ?? ''} onChange={(e) => setTarget({ ...target, [t.id]: Number(e.target.value) })}>
                  {k.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              )}
              <Button size="sm" variant="primary" onClick={() => void apply(t.id, t.kind)}>Usar</Button>
              <IconButton icon="delete" label={`Excluir template ${t.name}`} onClick={() => void remove(t.id, t.name)} />
            </li>
          ))}
        </ul>
      )}
    </Page>
  )
}

// ── Etiquetas ─────────────────────────────────────────────────────────────────

export function Tags() {
  const k = useKaguya()
  const { state, retry } = useLoad(() => kaguyaApi.tagCounts(), [k.rev])
  const [editing, setEditing] = useState<{ id: number; name: string } | null>(null)

  const rename = async () => {
    if (!editing) return
    try { await kaguyaApi.updateTag(editing.id, { name: editing.name.trim() }); setEditing(null); k.reload() } catch (e) { toast(reason(e), { tone: 'error' }) }
  }
  const remove = async (id: number, name: string) => {
    if (await confirm({ title: `Excluir a etiqueta #${name}?`, body: 'As tarefas continuam; só perdem a etiqueta.', confirmLabel: 'Excluir', danger: true })) {
      await kaguyaApi.deleteTag(id).then(() => { k.reload(); toast(`#${name} excluída.`, { tone: 'success' }) }).catch((e) => toast(reason(e), { tone: 'error' }))
    }
  }
  const merge = async (id: number, name: string, targetId: number) => {
    if (!targetId) return
    await kaguyaApi.mergeTags(id, targetId).then(() => { k.reload(); toast(`#${name} mesclada.`, { tone: 'success' }) }).catch((e) => toast(reason(e), { tone: 'error' }))
  }

  return (
    <Page className="kn-page">
      {state.status === 'loading' && <LoadingState variant="row" count={4} />}
      {state.status === 'error' && <ErrorState onRetry={retry} />}
      {state.status === 'ok' && state.data.length === 0 && (
        <EmptyState icon="tag" title="Nenhuma etiqueta" hint="Crie etiquetas escrevendo #nome ao adicionar uma tarefa." />
      )}
      {state.status === 'ok' && state.data.length > 0 && (
        <ul className="kn-sublist">
          {state.data.map((t) => (
            <li key={t.id}>
              <Icon name="tag" size={16} />
              {editing?.id === t.id ? (
                <form className="kn-quick-i" onSubmit={(e) => { e.preventDefault(); void rename() }}>
                  <Input aria-label="Novo nome da etiqueta" value={editing.name} autoFocus onChange={(e) => setEditing({ id: t.id, name: e.target.value })} />
                  <Button size="sm" variant="primary" type="submit" disabled={!editing.name.trim()}>Salvar</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
                </form>
              ) : (
                <>
                  <span className="kn-main"><span className="kn-title">#{t.name}</span><span className="kn-snippet">{t.open_count} aberta{t.open_count === 1 ? '' : 's'} · {t.total_count} no total</span></span>
                  <Select aria-label={`Mesclar #${t.name} em…`} value="" onChange={(e) => void merge(t.id, t.name, Number(e.target.value))}>
                    <option value="">Mesclar em…</option>
                    {state.data.filter((o) => o.id !== t.id).map((o) => <option key={o.id} value={o.id}>#{o.name}</option>)}
                  </Select>
                  <IconButton icon="edit" label={`Renomear #${t.name}`} onClick={() => setEditing({ id: t.id, name: t.name })} />
                  <IconButton icon="delete" label={`Excluir #${t.name}`} onClick={() => void remove(t.id, t.name)} />
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </Page>
  )
}
