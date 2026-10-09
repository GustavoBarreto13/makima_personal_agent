// Painel de detalhe da tarefa (estilo TickTick): abre ao lado da lista, salva POR CAMPO (sem botão Salvar) e nada se
// perde ao fechar. Cabeçalho (concluir, data, prioridade, Meu Dia), título, propriedades (lista, repetição, estimativa,
// adiar), notas em Markdown editadas no lugar, subtarefas, etiquetas, GTD/aguardando, dependências e histórico.

import { useEffect, useState } from 'react'
import {
  Button, DatePicker, EmptyState, ErrorState, Icon, IconButton, Input, LoadingState, Menu, Modal, Select, SegmentedControl, TagInput, TimePicker, Field, toast, MarkdownEditor,
} from '../../../design'
import { fmtDate } from '../../../design/core/format'
import { kaguyaApi } from '../api'
import { useKaguya } from '../context'
import * as act from '../lib/actions'
import { activityTime, describeActivity } from '../lib/activity'
import { presetLabels, presetOf, ruleFor, type RecurrencePreset } from '../lib/recurrence'
import { dueInfo, PRIORITY_LABEL } from '../lib/taskView'
import { useLoad } from '../lib/useLoad'
import type { GtdStatus, Task } from '../types'

const GTD_OPTIONS: { value: GtdStatus | ''; label: string }[] = [
  { value: '', label: 'Sem classificação' }, { value: 'next_action', label: 'Próxima ação' },
  { value: 'waiting', label: 'Aguardando' }, { value: 'someday', label: 'Algum dia' },
]

/** Edita o texto da mensagem de erro do servidor sem expor "HTTP 400". */
const reason = (e: unknown) => (e instanceof Error && e.message && !/^HTTP \d+$/.test(e.message) ? e.message : 'Não foi possível salvar.')

export function TaskDetailPanel({ taskId, onClose }: { taskId: number; onClose: () => void }) {
  const k = useKaguya()
  const { state, retry } = useLoad(() => kaguyaApi.getTask(taskId), [taskId, k.rev])
  const [tab, setTab] = useState<'detalhes' | 'historico'>('detalhes')
  const [menu, setMenu] = useState(false)
  const [templateName, setTemplateName] = useState<string | null>(null)

  // Voltar para "Detalhes" ao trocar de tarefa.
  useEffect(() => setTab('detalhes'), [taskId])

  if (state.status === 'loading') return <aside className="kn-panel"><LoadingState variant="row" count={4} /></aside>
  if (state.status === 'error') return <aside className="kn-panel"><ErrorState onRetry={retry} /></aside>
  const task = state.data

  const save = async (patch: Parameters<typeof kaguyaApi.updateTask>[1], okMsg?: string) => {
    try {
      await kaguyaApi.updateTask(task.id, patch)
      k.reload()
      if (okMsg) toast(okMsg, { tone: 'success' })
    } catch (e) {
      toast(reason(e), { tone: 'error' })
    }
  }

  return (
    <aside className="kn-panel" aria-label="Detalhe da tarefa">
      <header className="kn-panel-h">
        <button
          type="button"
          className={`kn-check kn-big kn-p${task.priority}${task.completed_at ? ' kn-checked' : ''}`}
          role="checkbox"
          aria-checked={!!task.completed_at}
          aria-label={task.completed_at ? 'Reabrir tarefa' : 'Concluir tarefa'}
          onClick={() => void act.toggleComplete({ reload: k.reload }, task)}
        >
          {task.completed_at && <Icon name="check" size={14} strokeWidth={3} />}
        </button>
        <div className="kn-panel-tabs" role="tablist" aria-label="Seções do detalhe">
          {(['detalhes', 'historico'] as const).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? 'kn-on' : ''} onClick={() => setTab(t)}>
              {t === 'detalhes' ? 'Detalhes' : 'Histórico'}
            </button>
          ))}
        </div>
        <span className="kn-menu">
          <IconButton icon="more" label="Mais ações" onClick={() => setMenu((o) => !o)} />
          {menu && (
            <Menu
              label="Ações da tarefa"
              onClose={() => setMenu(false)}
              items={[
                { id: 'dup', label: 'Duplicar', onSelect: () => void act.duplicate({ reload: k.reload }, task).then((id) => id && k.openTask(id)) },
                { id: 'tpl', label: 'Salvar como template…', onSelect: () => setTemplateName(task.title) },
                { id: 'del', label: 'Excluir', onSelect: () => void act.deleteTasks({ reload: k.reload }, [task]).then((ok) => ok && onClose()) },
              ]}
            />
          )}
        </span>
        <IconButton icon="close" label="Fechar painel" onClick={onClose} />
      </header>

      {tab === 'historico' ? <History taskId={task.id} /> : <Details task={task} save={save} />}

      {templateName !== null && (
        <Modal
          title="Salvar como template"
          size="sm"
          onClose={() => setTemplateName(null)}
          dirty={templateName !== task.title}
          footer={<>
            <Button variant="ghost" onClick={() => setTemplateName(null)}>Cancelar</Button>
            <Button
              variant="primary"
              disabled={!templateName.trim()}
              onClick={() => kaguyaApi.saveTaskTemplate(task.id, templateName.trim()).then(() => { toast('Template salvo.', { tone: 'success' }); setTemplateName(null) }).catch((e) => toast(reason(e), { tone: 'error' }))}
            >Salvar</Button>
          </>}
        >
          <Field label="Nome do template" hint="A tarefa, as subtarefas, as etiquetas e a estimativa entram; as datas viram deslocamentos em dias.">
            {(c) => <Input {...c} value={templateName} onChange={(e) => setTemplateName(e.target.value)} autoFocus />}
          </Field>
        </Modal>
      )}
    </aside>
  )
}

function Details({ task, save }: { task: Task; save: (p: Parameters<typeof kaguyaApi.updateTask>[1], ok?: string) => Promise<void> }) {
  const k = useKaguya()
  const [title, setTitle] = useState(task.title)
  const [notes, setNotes] = useState(task.description ?? '')
  const [newSub, setNewSub] = useState('')
  const [wait, setWait] = useState(task.waiting_note ?? '')
  useEffect(() => setTitle(task.title), [task.id, task.title])
  useEffect(() => setNotes(task.description ?? ''), [task.id, task.description])
  useEffect(() => setWait(task.waiting_note ?? ''), [task.id, task.waiting_note])

  const due = dueInfo(task, k.today)
  const preset = presetOf(task.recurrence?.active ? task.recurrence.rrule : null, task.due_date)
  const myDay = task.my_day_date === k.today

  const setRecurrence = async (value: RecurrencePreset) => {
    if (value === 'none') return save({ clear_recurrence: true })
    if (value === 'custom') return
    if (!task.due_date) { toast('Defina uma data de vencimento antes de repetir.', { tone: 'error' }); return }
    await save({ recurrence: { rrule: ruleFor(value, task.due_date), mode: task.recurrence?.mode ?? 'fixed' } })
  }

  const addSub = async () => {
    const t = newSub.trim()
    if (!t) return
    try {
      await kaguyaApi.createTask({ title: t, parent_id: task.id, project_id: task.project_id })
      setNewSub('')
      k.reload()
    } catch (e) { toast(reason(e), { tone: 'error' }) }
  }

  return (
    <div className="kn-panel-b">
      <div className="kn-quick">
        <span className="kn-quick-i">
          <DatePicker value={task.due_date ?? ''} onChange={(iso) => void save({ due_date: iso })} aria-label="Vencimento" />
          {task.due_date && <IconButton icon="close" label="Remover data" onClick={() => void save({ due_date: null })} />}
        </span>
        {task.due_date && (
          task.due_time
            ? <span className="kn-quick-i"><TimePicker value={task.due_time} onChange={(hhmm) => void save({ due_time: hhmm })} /><IconButton icon="close" label="Remover hora" onClick={() => void save({ due_time: null })} /></span>
            : <Button size="sm" variant="ghost" icon="clock" onClick={() => void save({ due_time: '09:00' })}>Hora</Button>
        )}
        {due.label && <span className={`kn-due kn-due-${due.tone}`}>{due.label}</span>}
        <Button size="sm" variant={myDay ? 'primary' : 'default'} icon="sun" aria-pressed={myDay}
          onClick={() => void (myDay ? act.removeFromMyDay({ reload: k.reload }, [task.id]) : act.addToMyDay({ reload: k.reload }, [task.id]))}>
          Meu Dia
        </Button>
      </div>

      <SegmentedControl
        label="Prioridade"
        value={String(task.priority)}
        options={[3, 2, 1, 0].map((p) => ({ value: String(p), label: PRIORITY_LABEL[p] }))}
        onChange={(v) => void save({ priority: Number(v) })}
      />

      <Input
        className="kn-title-in"
        aria-label="Título"
        value={title}
        placeholder="Título da tarefa"
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => { const t = title.trim(); if (!t) setTitle(task.title); else if (t !== task.title) void save({ title: t }) }}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      />

      <div className="kn-props">
        <Field label="Lista">{(c) => (
          <Select {...c} value={task.project_id} onChange={(e) => void save({ project_id: Number(e.target.value) })}>
            {k.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        )}</Field>
        <Field label="Repete">{(c) => (
          <Select {...c} value={preset} onChange={(e) => void setRecurrence(e.target.value as RecurrencePreset)}>
            {presetLabels(task.due_date).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            {preset === 'custom' && <option value="custom">{task.recurrence_text ?? 'Personalizada'}</option>}
          </Select>
        )}</Field>
        <Field label="Estimativa (min)">{(c) => (
          <Input {...c} type="number" min={0} step={5} inputMode="numeric" defaultValue={task.duration_min ?? ''} key={`d${task.id}-${task.duration_min}`}
            onBlur={(e) => { const v = e.target.value === '' ? null : Math.max(0, Number(e.target.value)); if (v !== (task.duration_min ?? null)) void save({ duration_min: v }) }} />
        )}</Field>
        <Field label="Adiar até" hint="Some das listas até este dia.">{(c) => (
          <span className="kn-quick-i">
            <DatePicker {...c} value={task.start_date ?? ''} onChange={(iso) => void save({ start_date: iso })} />
            {task.start_date && <IconButton icon="close" label="Remover adiamento" onClick={() => void save({ start_date: null })} />}
          </span>
        )}</Field>
      </div>

      <Field label="Notas">{() => (
        <MarkdownEditor
          value={notes}
          onChange={setNotes}
          onCommit={(v) => { if (v !== (task.description ?? '')) void save({ description: v.trim() ? v : null }) }}
          label="Notas"
          placeholder="Notas, links e checklists em Markdown…"
          renderLink={(href, children) => {
            if (href.startsWith('task:')) {
              const id = Number(href.slice(5))
              return <button type="button" className="kn-mention" onClick={() => k.openTask(id)}>{children}</button>
            }
            if (href.startsWith('komi:')) return <a className="kn-mention" href="/people">{children}</a>
            return undefined
          }}
        />
      )}</Field>

      <section aria-label="Subtarefas" className="kn-subs">
        <h3 className="kn-h3"><Icon name="subtasks" size={14} /> Subtarefas</h3>
        <ul className="kn-sublist">
          {(task.subtasks ?? []).map((s) => (
            <li key={s.id} className={s.completed_at ? 'kn-done' : ''}>
              <button type="button" className={`kn-check kn-p${s.priority}${s.completed_at ? ' kn-checked' : ''}`} role="checkbox" aria-checked={!!s.completed_at}
                aria-label={`${s.completed_at ? 'Reabrir' : 'Concluir'} “${s.title}”`} onClick={() => void act.toggleComplete({ reload: k.reload }, s)}>
                {s.completed_at && <Icon name="check" size={12} strokeWidth={3} />}
              </button>
              <button type="button" className="kn-main" onClick={() => k.openTask(s.id)}><span className="kn-title">{s.title}</span></button>
            </li>
          ))}
        </ul>
        <Input aria-label="Nova subtarefa" placeholder="Adicionar subtarefa e Enter" value={newSub} onChange={(e) => setNewSub(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void addSub() } }} />
      </section>

      <Field label="Etiquetas">{(c) => (
        <TagInput {...c} value={(task.tags ?? []).map((t) => t.name)} onChange={(names) => void save({ tags: names })} />
      )}</Field>

      <div className="kn-props">
        <Field label="Classificação GTD">{(c) => (
          <Select {...c} value={task.gtd_status ?? ''} onChange={(e) => void save({ gtd_status: (e.target.value || null) as GtdStatus | null })}>
            {GTD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        )}</Field>
        {task.gtd_status === 'waiting' && (
          <>
            <Field label="Aguardando quem/o quê">{(c) => (
              <Input {...c} value={wait} placeholder="Ex.: resposta do cliente" onChange={(e) => setWait(e.target.value)}
                onBlur={() => { if (wait !== (task.waiting_note ?? '')) void save({ waiting_note: wait.trim() || null }) }} />
            )}</Field>
            <Field label="Cobrar em" hint="No dia, ela volta para o Meu Dia.">{(c) => (
              <span className="kn-quick-i">
                <DatePicker {...c} value={task.follow_up_date ?? ''} onChange={(iso) => void save({ follow_up_date: iso })} />
                {task.follow_up_date && <IconButton icon="close" label="Remover cobrança" onClick={() => void save({ follow_up_date: null })} />}
              </span>
            )}</Field>
          </>
        )}
      </div>

      <Dependencies task={task} />

      <p className="kn-foot">Criada em {fmtDate(task.created_at.slice(0, 10))}</p>
    </div>
  )
}

/** "Depende de…": lista os bloqueadores e permite adicionar (busca por título) ou remover. */
function Dependencies({ task }: { task: Task }) {
  const k = useKaguya()
  const { state } = useLoad(() => kaguyaApi.dependencies(task.id), [task.id, k.rev])
  const [q, setQ] = useState('')
  const [found, setFound] = useState<Task[]>([])

  useEffect(() => {
    if (q.trim().length < 2) { setFound([]); return }
    let live = true
    const t = window.setTimeout(() => {
      kaguyaApi.search(q.trim()).then((r) => { if (live) setFound(r.filter((x) => x.id !== task.id).slice(0, 5)) }).catch(() => {})
    }, 250)
    return () => { live = false; window.clearTimeout(t) }
  }, [q, task.id])

  const deps = state.status === 'ok' ? state.data : null
  const add = (id: number) => kaguyaApi.addDependency(task.id, id).then(() => { setQ(''); k.reload() }).catch((e) => toast(reason(e), { tone: 'error' }))

  return (
    <section aria-label="Dependências" className="kn-subs">
      <h3 className="kn-h3"><Icon name="dependency" size={14} /> Depende de</h3>
      {deps?.blocked_by.length ? (
        <ul className="kn-sublist">
          {deps.blocked_by.map((d) => (
            <li key={d.id} className={d.completed ? 'kn-done' : ''}>
              <Icon name={d.completed ? 'unblocked' : 'blocked'} size={14} />
              <button type="button" className="kn-main" onClick={() => k.openTask(d.id)}><span className="kn-title">{d.title}</span></button>
              <IconButton icon="close" label={`Remover dependência de ${d.title}`} onClick={() => void kaguyaApi.removeDependency(task.id, d.id).then(k.reload)} />
            </li>
          ))}
        </ul>
      ) : <p className="ds-hint">Nenhuma. Use para encadear tarefas: esta só libera quando a outra terminar.</p>}
      {deps?.blocking.length ? <p className="ds-hint">Bloqueia: {deps.blocking.map((b) => b.title).join(', ')}</p> : null}
      <Input aria-label="Buscar tarefa bloqueadora" placeholder="Buscar tarefa para depender…" value={q} onChange={(e) => setQ(e.target.value)} />
      {found.length > 0 && (
        <ul className="kn-sublist kn-found">
          {found.map((f) => <li key={f.id}><button type="button" className="kn-main" onClick={() => void add(f.id)}><span className="kn-title">{f.title}</span><span className="kn-snippet">{f.project_name}</span></button></li>)}
        </ul>
      )}
    </section>
  )
}

function History({ taskId }: { taskId: number }) {
  const k = useKaguya()
  const { state, retry } = useLoad(() => kaguyaApi.activity(taskId), [taskId, k.rev])
  if (state.status === 'loading') return <div className="kn-panel-b"><LoadingState variant="row" count={3} /></div>
  if (state.status === 'error') return <div className="kn-panel-b"><ErrorState onRetry={retry} /></div>
  if (!state.data.length) {
    return <div className="kn-panel-b"><EmptyState icon="history" title="Sem histórico ainda" hint="O que acontecer com esta tarefa a partir de agora aparece aqui." /></div>
  }
  return (
    <ol className="kn-history kn-panel-b" aria-label="Histórico">
      {state.data.map((e, i) => (
        <li key={i}>
          <span className="ds-mono">{fmtDate(e.at.slice(0, 10))} · {activityTime(e.at)}</span>
          <span>{describeActivity(e, k.projectNames)}</span>
        </li>
      ))}
    </ol>
  )
}
