// Barra lateral da Kaguya: o menu do desktop e da gaveta do celular. Mantém o que o shell antigo tinha — grupos de listas
// que recolhem, o nome do grupo abre o quadro do grupo, listas com o ícone próprio, tudo arrastável (listas dentro do grupo
// e entre grupos, grupos entre si, visões em qualquer ordem). A ordem das visões e os grupos recolhidos ficam nas
// preferências; a das listas, no servidor. O `AppShell` do DS fornece o contêiner (`navSlot`); o `nav` plano dele segue
// alimentando a paleta, os atalhos "g + letra" e as abas do celular.

import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useMemo, type CSSProperties, type ReactNode } from 'react'
import { Icon, IconButton, toast, type IconName } from '../../../design'
import { kaguyaApi } from '../api'
import { useKaguya } from '../context'
import { DATE_VIEWS, GTD, LIFE, PLAN, RECORD, inSpace, routeToNavId, type Fixed } from '../lib/nav'
import { orderViews, resolveSideDrop } from '../lib/sideDnd'
import type { DateViewCounts, Project } from '../types'

interface Entry { id: string; label: string; icon?: IconName; glyph?: string; count?: number; color?: string | null }

function Item({ entry, active, onGo, handle, right }: { entry: Entry; active: boolean; onGo: (id: string) => void; handle?: ReactNode; right?: ReactNode }) {
  return (
    <div className="kn-sn-row">
      {handle}
      <button type="button" className="ds-nav-item kn-sn-item" aria-current={active ? 'page' : undefined} title={entry.label} onClick={() => onGo(entry.id)}>
        {entry.glyph ? <span className="kn-sn-glyph" aria-hidden="true">{entry.glyph}</span> : <Icon name={entry.icon ?? 'folder'} size={18} />}
        <span className="ds-lbl kn-sn-name">{entry.label}</span>
        {entry.count !== undefined && <span className="ds-cnt ds-lbl">{entry.count}</span>}
      </button>
      {right}
    </div>
  )
}

function Grip({ label, setActivatorNodeRef, attributes, listeners }: { label: string; setActivatorNodeRef: (el: HTMLElement | null) => void; attributes: object; listeners: object | undefined }) {
  return (
    <button type="button" ref={setActivatorNodeRef} className="kn-sn-grip kn-sn-ctl" aria-label={label} {...attributes} {...listeners}>
      <Icon name="drag" size={14} />
    </button>
  )
}

/** Item que pode ser arrastado: o contêiner recebe o transform, a alça recebe os listeners. */
function Sortable({ id, children }: { id: string; children: (grip: ReactNode, dragging: boolean) => ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style: CSSProperties = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : undefined }
  return (
    <div ref={setNodeRef} style={style} className="kn-sn-sortable">
      {children(<Grip label="Mover na barra lateral" setActivatorNodeRef={setActivatorNodeRef} attributes={attributes} listeners={listeners} />, isDragging)}
    </div>
  )
}

export function SideNav({ counts, onNavigate }: { counts: DateViewCounts | null; onNavigate: (id: string) => void }) {
  const k = useKaguya()
  const { prefs, projects, groups, filters } = k
  const active = routeToNavId(k.route)
  const hidden = new Set(prefs.hiddenNav)
  const collapsed = new Set(prefs.collapsedGroups)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))

  const fixed = (items: Fixed[]): Entry[] => items.filter((f) => !hidden.has(f.id)).map((f) => ({
    id: f.id, label: f.label, icon: f.icon,
    count: f.id.startsWith('date:') && counts ? counts[f.id.slice(5) as keyof DateViewCounts] || undefined : undefined,
  }))

  // Visões: datas, GTD e smart-lists numa seção só, na ordem que o usuário deixou.
  const viewEntries = useMemo<Entry[]>(() => {
    const base: Entry[] = [
      ...DATE_VIEWS.map((f) => ({ id: f.id, label: f.label, icon: f.icon, count: counts ? counts[f.id.slice(5) as keyof DateViewCounts] || undefined : undefined })),
      ...GTD.map((f) => ({ id: f.id, label: f.label, icon: f.icon })),
      ...filters.map((f): Entry => ({ id: `filter:${f.id}`, label: f.name, icon: 'filter', glyph: f.icon ?? undefined })),
    ].filter((e) => !hidden.has(e.id))
    const order = orderViews(base.map((e) => e.id), prefs.viewOrder)
    return order.map((id) => base.find((e) => e.id === id)!)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [counts, filters, prefs.viewOrder, prefs.hiddenNav])
  const filterIds = useMemo(() => Object.fromEntries(filters.map((f) => [`filter:${f.id}`, f.id])), [filters])
  const filterPos = useMemo(() => Object.fromEntries(filters.map((f) => [f.id, f.position])), [filters])

  const visible = (p: Project) => !p.is_inbox && inSpace(prefs.space, p.context)
  const loose = projects.filter((p) => visible(p) && p.group_id == null).sort((a, b) => a.position - b.position)
  const orderedGroups = [...groups].sort((a, b) => a.position - b.position)
  const shownGroups = orderedGroups.filter((g) => inSpace(prefs.space, g.context) || projects.some((p) => visible(p) && p.group_id === g.id))
  const allCollapsed = shownGroups.length > 0 && shownGroups.every((g) => collapsed.has(g.id))

  const toggleGroup = (id: number) => k.setPrefs({ collapsedGroups: collapsed.has(id) ? prefs.collapsedGroups.filter((x) => x !== id) : [...prefs.collapsedGroups, id] })
  const toggleAll = () => k.setPrefs({ collapsedGroups: allCollapsed ? [] : shownGroups.map((g) => g.id) })

  const onDragEnd = async (e: DragEndEvent) => {
    if (!e.over) return
    const drop = resolveSideDrop(String(e.active.id), String(e.over.id), groups, projects, viewEntries.map((v) => v.id), filterIds, filterPos)
    if (!drop) return
    try {
      if (drop.kind === 'group') await kaguyaApi.updateGroup(drop.id, { position: drop.position })
      else if (drop.kind === 'project') await kaguyaApi.updateProject(drop.id, drop.moved ? { position: drop.position, group_id: drop.groupId as number } : { position: drop.position })
      else {
        k.setPrefs({ viewOrder: drop.order })
        if (drop.filter) await kaguyaApi.updateFilter(drop.filter.id, { position: drop.filter.position })
      }
      k.reload()
    } catch { toast('Não foi possível reordenar.', { tone: 'error' }) }
  }

  const listEntry = (p: Project): Entry => ({ id: `list:${p.id}`, label: p.name, icon: 'folder', glyph: p.icon ?? undefined, count: p.open_count || undefined })
  const pinned = prefs.pinnedNav
    .map((id) => [...fixed([...PLAN, ...DATE_VIEWS, ...GTD, ...LIFE, ...RECORD]), ...viewEntries].find((e) => e.id === id))
    .filter((e): e is Entry => !!e)

  const section = (label: string, entries: Entry[]) => entries.length > 0 && (
    <div className="kn-sn-sec" key={label}>
      <span className="ds-nav-label ds-mono">{label}</span>
      {entries.map((e) => <Item key={e.id} entry={e} active={e.id === active} onGo={onNavigate} />)}
    </div>
  )

  const renderList = (p: Project) => (
    <Sortable key={p.id} id={`proj:${p.id}`}>
      {(grip) => (
        <Item
          entry={listEntry(p)} active={`list:${p.id}` === active || (k.route.view === 'kanban' && k.route.id === p.id)} onGo={onNavigate} handle={grip}
          right={<IconButton className="kn-sn-ctl" icon="archive" label={`Arquivar ${p.name}`} size={14} onClick={() => void archive(p)} />}
        />
      )}
    </Sortable>
  )
  const archive = async (p: Project) => {
    try { await kaguyaApi.archiveProject(p.id); k.reload(); toast(`“${p.name}” arquivada.`, { undo: async () => { await kaguyaApi.restoreProject(p.id); k.reload() } }) } catch { toast('Não foi possível arquivar.', { tone: 'error' }) }
  }

  return (
    <>
      {pinned.length > 0 && section('Fixadas', pinned)}
      {section('Planejar', fixed(PLAN))}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => void onDragEnd(e)}>
        <div className="kn-sn-sec">
          <span className="ds-nav-label ds-mono">Visões</span>
          <SortableContext items={viewEntries.map((v) => `view:${v.id}`)} strategy={verticalListSortingStrategy}>
            {viewEntries.map((v) => (
              <Sortable key={v.id} id={`view:${v.id}`}>
                {(grip) => <Item entry={v} active={v.id === active} onGo={onNavigate} handle={grip} />}
              </Sortable>
            ))}
          </SortableContext>
        </div>

        <div className="kn-sn-sec">
          <div className="kn-sn-head">
            <span className="ds-nav-label ds-mono" id="kn-sn-lists">Listas</span>
            <span className="kn-sn-tools kn-sn-ctl">
              {shownGroups.length > 0 && <IconButton icon={allCollapsed ? 'down' : 'up'} label={allCollapsed ? 'Expandir todos os grupos' : 'Recolher todos os grupos'} size={14} onClick={toggleAll} />}
              <IconButton icon="folder" label="Novo grupo" size={14} onClick={() => k.manage.group()} />
              <IconButton icon="add" label="Nova lista" size={14} onClick={() => k.manage.project()} />
            </span>
          </div>
          <LooseDrop>
            <SortableContext items={loose.map((p) => `proj:${p.id}`)} strategy={verticalListSortingStrategy}>
              {loose.map(renderList)}
            </SortableContext>
          </LooseDrop>
          <SortableContext items={shownGroups.map((g) => `group:${g.id}`)} strategy={verticalListSortingStrategy}>
            {shownGroups.map((g) => {
              const lists = projects.filter((p) => visible(p) && p.group_id === g.id).sort((a, b) => a.position - b.position)
              const isCollapsed = collapsed.has(g.id)
              return (
                <Sortable key={g.id} id={`group:${g.id}`}>
                  {(grip) => (
                    <div className="kn-sn-group" role="group" aria-label={g.name}>
                      <div className="kn-sn-ghead">
                        {grip}
                        <button type="button" className="kn-sn-caret kn-sn-ctl" aria-expanded={!isCollapsed} aria-label={`${isCollapsed ? 'Expandir' : 'Recolher'} ${g.name}`} onClick={() => toggleGroup(g.id)}>
                          <Icon name={isCollapsed ? 'right' : 'down'} size={14} />
                        </button>
                        <button type="button" className="kn-sn-gname" aria-current={active === `group:${g.id}` ? 'page' : undefined} title={`Abrir o quadro de ${g.name}`} onClick={() => onNavigate(`group:${g.id}`)}>
                          <span className="ds-lbl">{g.name}</span>
                        </button>
                        <IconButton className="kn-sn-ctl" icon="prefs" label={`Editar o grupo ${g.name}`} size={14} onClick={() => k.manage.group(g)} />
                      </div>
                      {!isCollapsed && (
                        <div className="kn-sn-glists">
                          <SortableContext items={lists.map((p) => `proj:${p.id}`)} strategy={verticalListSortingStrategy}>
                            {lists.map(renderList)}
                          </SortableContext>
                          {lists.length === 0 && <span className="kn-sn-empty">Solte uma lista aqui.</span>}
                        </div>
                      )}
                    </div>
                  )}
                </Sortable>
              )
            })}
          </SortableContext>
        </div>
      </DndContext>
      {section('Vida', fixed(LIFE))}
      {section('Registro', fixed(RECORD))}
    </>
  )
}

/** Alvo para soltar uma lista no fim das "soltas" (a seção pode estar vazia). */
function LooseDrop({ children }: { children: ReactNode }) {
  const { setNodeRef } = useDroppable({ id: 'loose' })
  return <div ref={setNodeRef} className="kn-sn-loose">{children}</div>
}
