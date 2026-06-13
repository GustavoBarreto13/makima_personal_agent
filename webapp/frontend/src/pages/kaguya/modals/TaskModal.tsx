// TaskModal — criar/editar uma tarefa (guia §9.2). Campos: título, notas, lista,
// prioridade, tipo (tarefa/evento/aniversário), data/hora e subtarefas ricas
// (cada uma com prioridade + descrição próprias).

import { useState, useEffect } from 'react'
import type { Task, Project, TaskType, RecurrenceMode, Tag } from '../types'
import { kaguyaApi } from '../kaguyaApi'
import { Icon } from '../ui/Icons'

// Presets de recorrência expostos na UI (mapeiam para RRULE no buildRRule).
type RecurFreq = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'
const RECUR_OPTS: { v: RecurFreq; label: string }[] = [
  { v: 'none', label: 'Não repete' }, { v: 'daily', label: 'Diária' },
  { v: 'weekly', label: 'Semanal' }, { v: 'monthly', label: 'Mensal' }, { v: 'yearly', label: 'Anual' },
]

// Deriva o preset a partir de uma RRULE existente (para abrir o modal no estado certo).
function rruleToFreq(rrule?: string | null): RecurFreq {
  if (!rrule) return 'none'
  if (rrule.includes('YEARLY')) return 'yearly'
  if (rrule.includes('MONTHLY')) return 'monthly'
  if (rrule.includes('WEEKLY')) return 'weekly'
  if (rrule.includes('DAILY')) return 'daily'
  return 'none'
}

// Monta a RRULE a partir do preset + data (semanal/mensal derivam o dia da data escolhida).
function buildRRule(freq: RecurFreq, due: string): string | null {
  if (freq === 'daily') return 'FREQ=DAILY'
  if (freq === 'yearly') return 'FREQ=YEARLY'
  if (!due) return null
  const d = new Date(`${due}T00:00:00`)
  // getDay(): 0=domingo..6=sábado → códigos iCal.
  if (freq === 'weekly') return `FREQ=WEEKLY;BYDAY=${['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][d.getDay()]}`
  if (freq === 'monthly') return `FREQ=MONTHLY;BYMONTHDAY=${d.getDate()}`
  return null
}

interface TaskModalProps {
  mode: 'create' | 'edit'
  task?: Task                 // presente em 'edit'
  projects: Project[]
  defaultProjectId?: number | null
  onClose: () => void
  onSaved: () => void         // pai re-busca os dados
  toast: (msg: string, kind?: 'ok' | 'err') => void
}

const PRIORITIES = [
  { v: 0, label: 'Nenhuma', cls: '' }, { v: 1, label: 'Baixa', cls: 'p1' },
  { v: 2, label: 'Média', cls: 'p2' }, { v: 3, label: 'Alta', cls: 'p3' },
]
const TYPES: { v: TaskType; label: string }[] = [
  { v: 'task', label: 'Tarefa' }, { v: 'event', label: 'Evento' }, { v: 'birthday', label: 'Aniversário' },
]
// Paleta de cores das tags (etiquetas). São cores FIXAS (OKLCH), independentes do acento
// do shell — porque a cor é uma propriedade própria da tag (task_tags.color), não do tema.
// Escolhidas para ler bem tanto no tema claro quanto no escuro.
const TAG_COLORS = [
  'oklch(0.62 0.20 25)',    // vermelho
  'oklch(0.70 0.16 60)',    // laranja
  'oklch(0.74 0.13 95)',    // dourado
  'oklch(0.62 0.16 150)',   // verde
  'oklch(0.60 0.13 230)',   // azul
  'oklch(0.58 0.20 290)',   // violeta
  'oklch(0.64 0.21 350)',   // rosa
]

export function TaskModal({ mode, task, projects, defaultProjectId, onClose, onSaved, toast }: TaskModalProps) {
  // Estado do formulário, inicializado da tarefa (edição) ou dos defaults (criação).
  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [projectId, setProjectId] = useState<number | null>(task?.project_id ?? defaultProjectId ?? null)
  const [priority, setPriority] = useState(task?.priority ?? 0)
  const [type, setType] = useState<TaskType>(task?.type ?? 'task')
  const [dueDate, setDueDate] = useState(task?.due_date ?? '')
  const [dueTime, setDueTime] = useState(task?.due_time ?? '')
  // Recorrência: preset + modo, derivados da regra existente (edição).
  const [recurFreq, setRecurFreq] = useState<RecurFreq>(rruleToFreq(task?.recurrence?.rrule))
  const [recurMode, setRecurMode] = useState<RecurrenceMode>(task?.recurrence?.mode ?? 'fixed')
  // Tags (etiquetas) — lista de nomes; editável na criação e na edição.
  const [tags, setTags] = useState<string[]>(task?.tags?.map((t) => t.name) ?? [])
  const [newTag, setNewTag] = useState('')
  // Catálogo de tags existentes (id + cor) — resolve nome→tag e mostra/edita a cor de cada
  // chip. Começa com as tags da própria tarefa (edição) e é completado pelo listTags() no
  // mount. A cor é uma propriedade GLOBAL da tag (vale em todo lugar onde ela aparece).
  const [tagCatalog, setTagCatalog] = useState<Tag[]>(task?.tags ?? [])
  // Nome da tag cujo seletor de cor (popover) está aberto — só uma por vez (null = nenhum).
  const [paletteFor, setPaletteFor] = useState<string | null>(null)
  // Subtarefas (só editáveis quando a tarefa-pai já existe).
  const [subtasks, setSubtasks] = useState<Task[]>(task?.subtasks ?? [])
  const [newSub, setNewSub] = useState('')
  const [saving, setSaving] = useState(false)
  const [askDelete, setAskDelete] = useState(false)   // confirmação de exclusão (escopo na recorrente)
  // Aniversário repete todo ano automaticamente no backend — escondemos o controle manual.
  const isRecurring = task?.recurrence?.active === true

  // Carrega o catálogo completo de tags ao abrir o modal (id + cor de cada nome). Se falhar,
  // seguimos só com as tags da tarefa: o pior caso é o chip aparecer sem cor própria.
  useEffect(() => {
    kaguyaApi.listTags().then(setTagCatalog).catch(() => { /* silencioso */ })
  }, [])

  // Salva a tarefa principal (cria ou edita), incluindo a recorrência.
  const save = async () => {
    if (!title.trim()) { toast('O título não pode ser vazio.', 'err'); return }
    // Recorrência (exceto aniversário, que é automático) precisa de uma data-âncora.
    if (type !== 'birthday' && recurFreq !== 'none' && !dueDate) {
      toast('Recorrência precisa de uma data de vencimento.', 'err'); return
    }
    setSaving(true)
    try {
      const base = {
        title: title.trim(),
        description: description || null,
        priority,
        type,
        due_date: dueDate || null,
        due_time: dueTime || null,
      }
      // Monta a regra a partir do preset (só fora de aniversário, que o backend faz sozinho).
      const rrule = type !== 'birthday' && recurFreq !== 'none' ? buildRRule(recurFreq, dueDate) : null

      if (mode === 'create') {
        await kaguyaApi.createTask({
          ...base,
          project_id: projectId ?? undefined,
          tags,                                    // etiquetas escolhidas (pode ser vazia)
          ...(rrule ? { recurrence: { rrule, mode: recurMode } } : {}),
        })
        toast('Tarefa criada.')
      } else if (task) {
        // tags sempre enviado na edição → permite REMOVER todas (set vazio persiste).
        const upd: Parameters<typeof kaguyaApi.updateTask>[1] = { ...base, project_id: projectId ?? undefined, tags }
        if (rrule) upd.recurrence = { rrule, mode: recurMode }
        // Tinha regra e o usuário escolheu "não repete" → remove (sem mexer em aniversário).
        else if (task.recurrence && type !== 'birthday') upd.clear_recurrence = true
        await kaguyaApi.updateTask(task.id, upd)
        toast('Tarefa atualizada.')
      }
      onSaved()
      onClose()
    } catch {
      toast('Não foi possível salvar.', 'err')
    } finally {
      setSaving(false)
    }
  }

  // Encerra a série recorrente: conclui a ocorrência atual e não gera a próxima.
  const endSeries = async () => {
    if (!task) return
    try {
      await kaguyaApi.complete(task.id, true, true)   // cascade + end_series
      toast('Série encerrada.')
      onSaved(); onClose()
    } catch { toast('Falha ao encerrar a série.', 'err') }
  }

  // Exclui a tarefa; numa recorrente, `scope` decide entre só esta ocorrência ou a série.
  const doDelete = async (scope: 'this' | 'series') => {
    if (!task) return
    try {
      await kaguyaApi.remove(task.id, scope)
      toast('Tarefa excluída.')
      onSaved(); onClose()
    } catch { toast('Falha ao excluir.', 'err') }
  }

  // Adiciona a tag digitada à lista local (cria de fato no backend ao salvar).
  const addTag = () => {
    // Tira um eventual "#" digitado pelo usuário e espaços das pontas.
    const name = newTag.trim().replace(/^#+/, '').trim()
    if (!name) return
    // Não duplica ignorando caixa ("Mercado" == "mercado").
    if (!tags.some((t) => t.toLowerCase() === name.toLowerCase())) setTags([...tags, name])
    setNewTag('')
  }

  // Cor atual de uma tag pelo nome (case-insensitive), ou null se não tiver/não existir.
  const tagColor = (name: string): string | null => {
    const g = tagCatalog.find((x) => x.name.toLowerCase() === name.toLowerCase())
    return g?.color ?? null
  }

  // Define (ou limpa, com color="") a cor de uma tag. Como a cor é GLOBAL, persiste já nos
  // endpoints de tag — independente do save da tarefa. Atualiza o catálogo local para o chip
  // recolorir na hora (otimista). Em erro de rede, avisa e mantém o estado anterior.
  const setTagColor = async (name: string, color: string) => {
    setPaletteFor(null)                  // fecha o popover ao escolher
    const colorVal = color || null       // "" significa "sem cor" → null no estado local
    const existing = tagCatalog.find((x) => x.name.toLowerCase() === name.toLowerCase())
    try {
      if (existing) {
        // Tag já existe → recolore (ou limpa) globalmente.
        await kaguyaApi.updateTag(existing.id, { color })
        setTagCatalog(tagCatalog.map((x) => (x.id === existing.id ? { ...x, color: colorVal } : x)))
      } else if (color) {
        // Nome ainda não materializado + cor escolhida → cria a tag já colorida.
        const r = await kaguyaApi.createTag({ name, color })
        if (r.id) setTagCatalog([...tagCatalog, { id: r.id, name, color: colorVal }])
      }
      // Nome novo + "sem cor": nada a persistir (será criada sem cor ao salvar a tarefa).
    } catch {
      toast('Não foi possível mudar a cor da tag.', 'err')
    }
  }

  // Adiciona uma subtarefa (exige a tarefa-pai já existir).
  const addSub = async () => {
    if (!task || !newSub.trim()) return
    try {
      const r = await kaguyaApi.createTask({ title: newSub.trim(), parent_id: task.id })
      setSubtasks([...subtasks, { id: r.id!, title: newSub.trim(), priority: 0, description: null, type: 'task', project_id: task.project_id, column_id: null, parent_id: task.id, due_date: null, due_time: null, position: 0, completed_at: null, created_at: '', my_day_date: null, start_at: null, end_at: null, duration_min: null }])
      setNewSub('')
    } catch { toast('Falha ao adicionar subtarefa.', 'err') }
  }

  // Atualiza prioridade/descrição de uma subtarefa existente.
  const patchSub = async (id: number, patch: Partial<Task>) => {
    setSubtasks(subtasks.map((s) => (s.id === id ? { ...s, ...patch } : s)))
    try { await kaguyaApi.updateTask(id, patch as never) } catch { toast('Falha ao salvar subtarefa.', 'err') }
  }

  const removeSub = async (id: number) => {
    setSubtasks(subtasks.filter((s) => s.id !== id))
    try { await kaguyaApi.remove(id) } catch { toast('Falha ao excluir subtarefa.', 'err') }
  }

  return (
    <div className="kg-scrim" onClick={onClose}>
      <div className="kg-modal" onClick={(e) => e.stopPropagation()}>
        <div className="kg-modal-head">
          <h3>{mode === 'create' ? 'Nova tarefa' : 'Editar tarefa'}</h3>
          <button className="kg-icon-btn" onClick={onClose} aria-label="Fechar"><Icon name="x" /></button>
        </div>

        <div className="kg-modal-body">
          <div className="kg-field">
            <span className="kg-field-label">Título</span>
            <input className="kg-input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="O que precisa ser feito?" />
          </div>

          <div className="kg-field">
            <span className="kg-field-label">Lista</span>
            <select className="kg-select" value={projectId ?? ''} onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Inbox</option>
              {projects.filter((p) => !p.is_inbox).map((p) => (
                <option key={p.id} value={p.id}>{p.icon ? `${p.icon} ` : ''}{p.name}</option>
              ))}
            </select>
          </div>

          <div className="kg-field">
            <span className="kg-field-label">Prioridade</span>
            <div className="kg-segment">
              {PRIORITIES.map((p) => (
                <button key={p.v} className={`kg-seg-opt ${p.cls}${priority === p.v ? ' active' : ''}`} onClick={() => setPriority(p.v)}>{p.label}</button>
              ))}
            </div>
          </div>

          <div className="kg-field">
            <span className="kg-field-label">Tipo</span>
            <div className="kg-segment">
              {TYPES.map((t) => (
                <button key={t.v} className={`kg-seg-opt${type === t.v ? ' active' : ''}`} onClick={() => setType(t.v)}>{t.label}</button>
              ))}
            </div>
          </div>

          <div className="kg-field-row">
            <div className="kg-field">
              <span className="kg-field-label">Vencimento</span>
              <input className="kg-input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className="kg-field">
              <span className="kg-field-label">Hora (opcional)</span>
              <input className="kg-input" type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} disabled={!dueDate} />
            </div>
          </div>

          {/* Recorrência — aniversário é automático (todo ano), então só mostramos a dica */}
          {type === 'birthday' ? (
            <div className="kg-field">
              <span className="kg-field-label">Repetir</span>
              <div className="kg-hint">🎂 Aniversários repetem todo ano automaticamente.</div>
            </div>
          ) : (
            <div className="kg-field">
              <span className="kg-field-label">Repetir</span>
              <div className="kg-segment">
                {RECUR_OPTS.map((r) => (
                  <button key={r.v} className={`kg-seg-opt${recurFreq === r.v ? ' active' : ''}`} onClick={() => setRecurFreq(r.v)}>{r.label}</button>
                ))}
              </div>
              {/* Modo: data-fixa (a âncora manda) vs contar a partir da conclusão */}
              {recurFreq !== 'none' && (
                <div className="kg-segment" style={{ marginTop: 6 }}>
                  <button className={`kg-seg-opt${recurMode === 'fixed' ? ' active' : ''}`} onClick={() => setRecurMode('fixed')}>Data fixa</button>
                  <button className={`kg-seg-opt${recurMode === 'after_completion' ? ' active' : ''}`} onClick={() => setRecurMode('after_completion')}>Após concluir</button>
                </div>
              )}
            </div>
          )}

          <div className="kg-field">
            <span className="kg-field-label">Notas</span>
            <textarea className="kg-textarea" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Detalhes, links, contexto…" />
          </div>

          {/* Tags (etiquetas) — chips removíveis + input que adiciona por Enter (cria on-the-fly) */}
          <div className="kg-field">
            <span className="kg-field-label">Tags</span>
            <div className="kg-tag-edit">
              {tags.map((t) => {
                const c = tagColor(t)
                // Cor própria sobrescreve texto/borda do chip; sem cor, herda o acento (.kg-chip-tag).
                const chipStyle = c ? { color: c, borderColor: c } : undefined
                return (
                  <span key={t} className="kg-chip kg-chip-tag kg-tag-chip-edit" style={chipStyle}>
                    {/* botão-amostra: abre/fecha a paleta para escolher a cor desta tag */}
                    <button
                      type="button"
                      className="kg-tag-swatch"
                      style={{ background: c ?? 'transparent' }}
                      onClick={() => setPaletteFor(paletteFor === t ? null : t)}
                      aria-label={`Mudar a cor da tag ${t}`}
                    />
                    #{t}
                    <button className="kg-tag-x" onClick={() => setTags(tags.filter((x) => x !== t))} aria-label={`Remover ${t}`}>×</button>
                    {/* paleta de cores (popover) — só aparece para a tag selecionada */}
                    {paletteFor === t && (
                      <div className="kg-tag-palette">
                        {TAG_COLORS.map((col) => (
                          <button
                            key={col}
                            type="button"
                            className="kg-tag-palette-opt"
                            style={{ background: col }}
                            onClick={() => setTagColor(t, col)}
                            aria-label={`Definir cor ${col}`}
                          />
                        ))}
                        {/* "sem cor": volta ao acento padrão do tema */}
                        <button
                          type="button"
                          className="kg-tag-palette-opt kg-tag-palette-none"
                          onClick={() => setTagColor(t, '')}
                          aria-label="Sem cor"
                        >×</button>
                      </div>
                    )}
                  </span>
                )
              })}
              <input
                className="kg-input kg-tag-input"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
                placeholder="Adicionar tag + Enter"
              />
            </div>
          </div>

          {/* Subtarefas ricas — só quando a tarefa-pai já existe */}
          {mode === 'edit' && task && (
            <div className="kg-field">
              <span className="kg-field-label">Subtarefas</span>
              {subtasks.map((s) => (
                <div key={s.id} className="kg-subedit">
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <input className="kg-input" value={s.title} onChange={(e) => setSubtasks(subtasks.map((x) => x.id === s.id ? { ...x, title: e.target.value } : x))} onBlur={(e) => patchSub(s.id, { title: e.target.value })} />
                    <div className="kg-segment">
                      {PRIORITIES.map((p) => (
                        <button key={p.v} className={`kg-seg-opt ${p.cls}${s.priority === p.v ? ' active' : ''}`} onClick={() => patchSub(s.id, { priority: p.v })}>{p.label}</button>
                      ))}
                    </div>
                    <input className="kg-input" placeholder="Descrição da subtarefa…" defaultValue={s.description ?? ''} onBlur={(e) => patchSub(s.id, { description: e.target.value || null })} />
                  </div>
                  <button className="kg-icon-btn" onClick={() => removeSub(s.id)} aria-label="Excluir subtarefa"><Icon name="trash" size={14} /></button>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <input className="kg-input" placeholder="Adicionar subtarefa…" value={newSub} onChange={(e) => setNewSub(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addSub() }} />
                <button className="kg-btn" onClick={addSub}><Icon name="plus" size={14} /></button>
              </div>
            </div>
          )}
        </div>

        <div className="kg-modal-foot">
          {/* Excluir (edição): numa recorrente, pergunta o escopo só esta / série inteira */}
          {mode === 'edit' && task && !askDelete && (
            <button className="kg-btn kg-btn-ghost kg-btn-danger" style={{ marginRight: 'auto' }} onClick={() => setAskDelete(true)}>
              <Icon name="trash" size={14} /> Excluir
            </button>
          )}
          {askDelete && (
            <div className="kg-del-confirm" style={{ marginRight: 'auto' }}>
              {isRecurring ? (
                <>
                  <span className="kg-hint">Excluir:</span>
                  <button className="kg-btn kg-btn-ghost" onClick={() => doDelete('this')}>Só esta</button>
                  <button className="kg-btn kg-btn-danger" onClick={() => doDelete('series')}>A série inteira</button>
                </>
              ) : (
                <>
                  <span className="kg-hint">Confirmar exclusão?</span>
                  <button className="kg-btn kg-btn-danger" onClick={() => doDelete('this')}>Excluir</button>
                </>
              )}
              <button className="kg-btn kg-btn-ghost" onClick={() => setAskDelete(false)}>Cancelar</button>
            </div>
          )}
          {!askDelete && (
            <>
              {isRecurring && <button className="kg-btn kg-btn-ghost" onClick={endSeries}>Concluir série</button>}
              <button className="kg-btn kg-btn-ghost" onClick={onClose}>Cancelar</button>
              <button className="kg-btn kg-btn-primary" onClick={save} disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
