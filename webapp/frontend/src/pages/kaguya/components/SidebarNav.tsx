// SidebarNav — a navegação interna do shell Kaguya (guia §5):
// marca + botão "Nova tarefa" + Views fixas + "Listas" (grupos → listas, Inbox no topo) +
// Smart lists (fatia 013, abaixo das Listas) + lixeira + "Voltar à Makima".
//
// Sidebar DnD (esta fatia):
//   - Grupos reordenáveis entre si por arrasto (alça grip).
//   - Listas reordenáveis dentro do próprio grupo/seção (sem cross-group).
//   - Inbox fixo no topo, nunca arrastável.
//   - Estado otimista local ressincronizado do prop após mutações do shell.
//
// Colapso de grupos (esta fatia):
//   - Cada grupo tem uma setinha para fechar/abrir (esconde as listas).
//   - Persistido em localStorage ('kg:collapsed:sidebar-groups').
//   - Botão global "recolher/expandir tudo" no cabeçalho "Listas".

import { useState, useEffect, useCallback } from 'react'
import {
  DndContext,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import type { Sidebar, KaguyaView, Group, Project } from '../types'
import { BUILTIN_TODAY_OVERDUE, GTD_BUILTINS } from '../types'
import { Icon } from '../ui/Icons'
import type { IconName } from '../ui/Icons'
import { kaguyaApi } from '../kaguyaApi'
import { useDndSensors, midPosition } from '../lib/dnd'
import { useCollapsedState } from '../lib/useCollapsedState'
import { SortableGroupRow } from './SortableGroupRow'
import { SortableListItem } from './SortableListItem'

// ── Views fixas (built-ins) ───────────────────────────────────────────────────

const FIXED_VIEWS: { view: KaguyaView; icon: IconName; label: string }[] = [
  { view: 'today',       icon: 'sun',      label: 'Meu Dia'      },
  { view: 'kanban',      icon: 'board',    label: 'Kanban'       },
  { view: 'calendar',    icon: 'calendar', label: 'Calendário'   },
  { view: 'eisenhower',  icon: 'grid',     label: 'Eisenhower'   },
  { view: 'habits',      icon: 'flame',    label: 'Hábitos'      },
  { view: 'experiments', icon: 'flask',    label: 'Experimentos' },
  { view: 'goals',       icon: 'target',   label: 'Metas'        },
]

// ── Props ─────────────────────────────────────────────────────────────────────

interface SidebarNavProps {
  sidebar: Sidebar | null
  view: KaguyaView
  param: number | null      // id da lista (view='list') ou da smart-list (view='filter')
  onNavigate: (view: KaguyaView, param?: number | null) => void
  onNewTask: () => void
  onNewProject: () => void
  onNewGroup: () => void          // abre o modal de criar grupo
  onEditGroup: (group: Group) => void  // abre o modal de renomear/excluir grupo
  onNewFilter: () => void         // abre o modal de criar smart-list (fatia 013)
  onOpenTweaks: () => void
  // Re-busca a sidebar no shell após um reorder bem-sucedido
  onReordered: () => void
  // Exibe uma mensagem de erro quando o PATCH de reorder falha (opcional)
  toast?: (msg: string, kind?: 'ok' | 'err') => void
}

// ── Componente ────────────────────────────────────────────────────────────────

export function SidebarNav({
  sidebar, view, param,
  onNavigate, onNewTask, onNewProject, onNewGroup, onEditGroup, onNewFilter, onOpenTweaks,
  onReordered, toast,
}: SidebarNavProps) {

  // ── Estado local otimista ─────────────────────────────────────────────────────
  // Espelha o prop `sidebar` para poder reordenar na tela antes do servidor
  // confirmar (sem "snap-back"). O shell é a fonte da verdade — ressincronizamos
  // toda vez que `sidebar.groups` ou `sidebar.projects` mudam (novo array reference
  // após `loadSidebar()`).
  const [localGroups,   setLocalGroups]   = useState<Group[]>(sidebar?.groups ?? [])
  const [localProjects, setLocalProjects] = useState<Project[]>(sidebar?.projects ?? [])

  // Resync dos grupos quando o shell entrega um novo sidebar
  useEffect(() => { setLocalGroups(sidebar?.groups ?? []) }, [sidebar?.groups])
  // Resync das listas quando o shell entrega um novo sidebar
  useEffect(() => { setLocalProjects(sidebar?.projects ?? []) }, [sidebar?.projects])

  // ── Derivados ordenados por position ─────────────────────────────────────────
  // Sempre re-calculamos a partir do estado local para refletir os reorders
  // otimistas antes do servidor confirmar.

  // Inbox: lista especial fixada no topo (não arrastável)
  const inbox = localProjects.find(p => p.is_inbox)

  // Listas sem grupo (exceto Inbox), ordenadas por position
  const ungrouped = [...localProjects]
    .filter(p => !p.is_inbox && p.group_id == null)
    .sort((a, b) => a.position - b.position)

  // Grupos em ordem de position
  const orderedGroups = [...localGroups].sort((a, b) => a.position - b.position)

  // Listas pertencentes a um grupo, ordenadas por position dentro do grupo
  const projectsOf = (g: Group) =>
    [...localProjects]
      .filter(p => p.group_id === g.id)
      .sort((a, b) => a.position - b.position)

  // Filtros de smart-list (não reordenáveis nesta fatia — vêm direto do prop)
  const filters = sidebar?.filters ?? []

  // ── Sensores DnD ─────────────────────────────────────────────────────────────
  // PointerSensor com 5px de ativação: < 5px = clique, ≥ 5px = arrasto.
  // Isso faz com que cliques normais (navegar, editar) não acionem o drag.
  const sensors = useDndSensors()

  // ── Colapso de grupos ─────────────────────────────────────────────────────────
  // Persistido em localStorage com a chave 'kg:collapsed:sidebar-groups'.
  // collapsed = Set<number> dos ids de grupos fechados.
  const { collapsed, toggle, expandAll, collapseAll } = useCollapsedState('sidebar-groups')

  // IDs de todos os grupos (para recolher/expandir tudo)
  const groupIds = orderedGroups.map(g => g.id)

  // Verdadeiro quando TODOS os grupos estão colapsados (ou não há grupos)
  const allCollapsed = groupIds.length > 0 && groupIds.every(id => collapsed.has(id))

  // ── persist: optimistic commit + rollback ─────────────────────────────────────
  // Executa o PATCH; em caso de erro, restaura os snapshots e exibe o toast.
  // `onReordered()` dispara o loadSidebar() do shell — reconcilia as posições
  // canônicas do banco com o estado local.
  const persist = useCallback(async (
    call: () => Promise<unknown>,
    snapshotGroups: Group[],
    snapshotProjects: Project[],
  ) => {
    try {
      await call()
      onReordered()
    } catch {
      // Rollback: volta ao estado anterior se o PATCH falhar
      setLocalGroups(snapshotGroups)
      setLocalProjects(snapshotProjects)
      toast?.('Não foi possível reordenar.', 'err')
    }
  }, [onReordered, toast])

  // ── onDragEnd ─────────────────────────────────────────────────────────────────
  // Executado ao soltar um item arrastado. Determina se é um grupo ou uma lista,
  // verifica se a mudança é válida (mesmo container), calcula a nova posição e
  // faz o PATCH.
  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event

    // Sem alvo ou sem mudança real de posição → ignora
    if (!over || active.id === over.id) return

    // Os ids são strings prefixadas: "group:{id}" ou "proj:{id}"
    const aId = String(active.id)
    const oId = String(over.id)

    // Identifica o tipo pelo prefixo e extrai o número do id
    const isGrp = (s: string) => s.startsWith('group:')
    const num   = (s: string) => Number(s.split(':')[1])

    // Snapshots para rollback caso o PATCH falhe
    const snapGroups   = localGroups
    const snapProjects = localProjects

    // ── Ramo A: reordenar GRUPOS entre si ─────────────────────────────────────
    if (isGrp(aId)) {
      // Grupo solto sobre uma lista → ignorar (cross-type não permitido)
      if (!isGrp(oId)) return

      const from = orderedGroups.findIndex(g => g.id === num(aId))
      const to   = orderedGroups.findIndex(g => g.id === num(oId))
      if (from < 0 || to < 0) return

      // Calcula o novo array após a reordenação
      const next = arrayMove(orderedGroups, from, to)

      // midPosition calcula um inteiro entre os vizinhos na posição final
      // (aritmética esparsa ×1000, mesma do backend)
      const pos = midPosition(next[to - 1] ?? null, next[to + 1] ?? null)

      // Otimista: atualiza localGroups com a nova posição do item movido
      setLocalGroups(next.map(g => g.id === num(aId) ? { ...g, position: pos } : g))

      // Envia o PATCH e reconcilia com o servidor
      await persist(
        () => kaguyaApi.updateGroup(num(aId), { position: pos }),
        snapGroups,
        snapProjects,
      )
      return
    }

    // ── Ramo B: reordenar LISTAS dentro do MESMO container ────────────────────

    // Lista solta sobre o cabeçalho de um grupo → ignorar
    if (isGrp(oId)) return

    const aProj = localProjects.find(p => p.id === num(aId))
    const oProj = localProjects.find(p => p.id === num(oId))
    if (!aProj || !oProj) return

    // O Inbox nunca é arrastável (está fora de qualquer SortableContext,
    // mas adicionamos essa guarda para robustez)
    if (aProj.is_inbox) return

    // Guarda estrita de container: container = group_id ou 'ungrouped' (null → string)
    // Listas de grupos diferentes não podem ser misturadas via sidebar.
    // Para mover uma lista de grupo, usar o modal de editar lista.
    const cont = (p: Project): string => p.group_id != null ? String(p.group_id) : 'ungrouped'
    if (cont(aProj) !== cont(oProj)) return

    // Irmãos do mesmo container, ordenados por position
    const sibs = localProjects
      .filter(p => cont(p) === cont(aProj) && !p.is_inbox)
      .sort((x, y) => x.position - y.position)

    const from = sibs.findIndex(p => p.id === aProj.id)
    const to   = sibs.findIndex(p => p.id === oProj.id)
    if (from < 0 || to < 0) return

    const next = arrayMove(sibs, from, to)
    const pos  = midPosition(next[to - 1] ?? null, next[to + 1] ?? null)

    // Otimista: só atualiza o item que mudou de posição (os demais mantêm as suas)
    setLocalProjects(prev => prev.map(p => p.id === aProj.id ? { ...p, position: pos } : p))

    await persist(
      () => kaguyaApi.updateProject(aProj.id, { position: pos }),
      snapGroups,
      snapProjects,
    )
  }, [localGroups, localProjects, orderedGroups, persist])

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <nav className="kg-sidebar">

      {/* Marca: retrato + wordmark (Playfair) + botão de ajustes */}
      <div className="kg-brand">
        <img className="kg-brand-img" src="/kaguya.jpg" alt="Kaguya" />
        <span className="kg-brand-name">Kaguya</span>
        <button className="kg-icon-btn" style={{ marginLeft: 'auto' }} onClick={onOpenTweaks} aria-label="Ajustes">
          <Icon name="settings" size={15} />
        </button>
      </div>

      {/* Botão principal "Nova tarefa" */}
      <button className="kg-newbtn" onClick={onNewTask}>
        <span><Icon name="plus" size={15} style={{ verticalAlign: 'middle', marginRight: 6 }} />Nova tarefa</span>
        <kbd>C</kbd>
      </button>

      {/* ── Views fixas ──────────────────────────────────────────────────────── */}
      <div className="kg-nav-label"><span>Views</span></div>
      {FIXED_VIEWS.map((v) => (
        <button key={v.view} className={`kg-nav-item${view === v.view ? ' active' : ''}`} onClick={() => onNavigate(v.view)}>
          <span className="kg-nav-emoji"><Icon name={v.icon} size={16} /></span>
          <span>{v.label}</span>
        </button>
      ))}

      {/* ── Listas ──────────────────────────────────────────────────────────── */}
      {/* Cabeçalho: botão de recolher/expandir grupos + atalhos de criar */}
      <div className="kg-nav-label">
        <span>Listas</span>
        <div className="kg-nav-acts">
          {/* Botão global: recolhe todos os grupos quando algum está aberto,
              ou expande todos quando todos estão fechados. Só aparece quando
              há pelo menos um grupo. */}
          {groupIds.length > 0 && (
            <button
              type="button"
              className="kg-act-collapse"
              onClick={() => allCollapsed ? expandAll(groupIds) : collapseAll(groupIds)}
              title={allCollapsed ? 'Expandir todos' : 'Recolher todos'}
              aria-label={allCollapsed ? 'Expandir todos' : 'Recolher todos'}
            >
              {/* chevron = seta direita (todos fechados → "expandir"),
                  chevronDown = seta baixo (algum aberto → "recolher") */}
              <Icon name={allCollapsed ? 'chevron' : 'chevronDown'} size={13} />
            </button>
          )}
          <button className="kg-act-grp" onClick={onNewGroup} aria-label="Novo grupo" title="Novo grupo">+ grupo</button>
          <button onClick={onNewProject} aria-label="Nova lista" title="Nova lista"><Icon name="plus" size={13} /></button>
        </div>
      </div>

      {/* DndContext envolve todo o bloco de Listas.
          closestCenter funciona bem para listas verticais.
          O Inbox fica FORA dos SortableContexts para nunca ser arrastável. */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>

        {/* Inbox: fixo no topo, nunca arrastável (fora de qualquer SortableContext) */}
        {inbox && (
          <button
            className={`kg-nav-item${view === 'list' && param === inbox.id ? ' active' : ''}`}
            onClick={() => onNavigate('list', inbox.id)}
          >
            <span className="kg-nav-emoji">{inbox.icon ?? '•'}</span>
            <span>{inbox.name}</span>
            {inbox.open_count > 0 && <span className="kg-nav-count">{inbox.open_count}</span>}
          </button>
        )}

        {/* Listas sem grupo: SortableContext próprio, arrastáveis entre si.
            Nunca se misturam com listas de grupos (guarda no onDragEnd). */}
        {ungrouped.length > 0 && (
          <SortableContext
            items={ungrouped.map(p => `proj:${p.id}`)}
            strategy={verticalListSortingStrategy}
          >
            {ungrouped.map(p => (
              <SortableListItem
                key={p.id}
                project={p}
                isActive={view === 'list' && param === p.id}
                onNavigate={onNavigate}
              />
            ))}
          </SortableContext>
        )}

        {/* Grupos: SortableContext para as linhas de cabeçalho dos grupos.
            Dentro de cada grupo há um SortableContext aninhado para as listas. */}
        <SortableContext
          items={orderedGroups.map(g => `group:${g.id}`)}
          strategy={verticalListSortingStrategy}
        >
          {orderedGroups.map(g => {
            const inGroup   = projectsOf(g)
            const isGroupActive = view === 'group' && param === g.id
            const isCollapsed   = collapsed.has(g.id)

            return (
              <div key={g.id}>
                {/* Linha do grupo: caret de colapso + nome + grip + ⚙ */}
                <SortableGroupRow
                  group={g}
                  isActive={isGroupActive}
                  collapsed={isCollapsed}
                  onToggleCollapse={toggle}
                  onNavigate={onNavigate}
                  onEditGroup={onEditGroup}
                />

                {/* Listas do grupo: só renderizadas quando o grupo não está colapsado.
                    SortableContext aninhado = seção independente (sem cross-group). */}
                {!isCollapsed && (
                  <SortableContext
                    items={inGroup.map(p => `proj:${p.id}`)}
                    strategy={verticalListSortingStrategy}
                  >
                    {inGroup.map(p => (
                      <SortableListItem
                        key={p.id}
                        project={p}
                        isActive={view === 'list' && param === p.id}
                        onNavigate={onNavigate}
                      />
                    ))}
                  </SortableContext>
                )}
              </div>
            )
          })}
        </SortableContext>

      </DndContext>
      {/* fim do bloco DnD das Listas */}

      {/* ── Smart lists (fatia 013) ──────────────────────────────────────────── */}
      <div className="kg-nav-label">
        <span>Smart lists</span>
        <div className="kg-nav-acts">
          <button onClick={onNewFilter} aria-label="Nova smart-list" title="Nova smart-list"><Icon name="plus" size={13} /></button>
        </div>
      </div>

      {/* Built-in "Hoje + Vencidas" — hardcoded, sempre presente */}
      <button
        className={`kg-nav-item${view === 'filter' && param === BUILTIN_TODAY_OVERDUE ? ' active' : ''}`}
        onClick={() => onNavigate('filter', BUILTIN_TODAY_OVERDUE)}
      >
        <span className="kg-nav-emoji"><Icon name="clock" size={16} /></span>
        <span>Hoje + Vencidas</span>
      </button>

      {/* Built-ins GTD (Próximas Ações, Aguardando, Algum dia, Rápidas, Alta energia) */}
      {GTD_BUILTINS.map((b) => (
        <button
          key={b.id}
          className={`kg-nav-item${view === 'filter' && param === b.id ? ' active' : ''}`}
          onClick={() => onNavigate('filter', b.id)}
        >
          <span className="kg-nav-emoji"><Icon name={b.icon as IconName} size={16} /></span>
          <span>{b.name}</span>
        </button>
      ))}

      {/* Smart lists salvas pelo usuário */}
      {filters.map((f) => (
        <button
          key={f.id}
          className={`kg-nav-item${view === 'filter' && param === f.id ? ' active' : ''}`}
          onClick={() => onNavigate('filter', f.id)}
        >
          <span className="kg-nav-emoji">{f.icon ?? <Icon name="filter" size={16} />}</span>
          <span>{f.name}</span>
        </button>
      ))}

      {/* ── Lixeira ─────────────────────────────────────────────────────────── */}
      <div className="kg-nav-label"><span> </span></div>
      <button className={`kg-nav-item${view === 'trash' ? ' active' : ''}`} onClick={() => onNavigate('trash')}>
        <span className="kg-nav-emoji"><Icon name="trash" size={16} /></span>
        <span>Lixeira</span>
      </button>

      {/* Voltar à Makima (sai do shell para a nav global) */}
      <a className="kg-back" href="/">
        <Icon name="back" size={15} />
        <span>Voltar à Makima</span>
      </a>

    </nav>
  )
}
