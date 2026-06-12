// SidebarNav — a navegação interna do shell Kaguya (guia §5):
// marca + botão "Nova tarefa" + Views fixas + "Listas" (grupos → listas, Inbox no topo) +
// Smart lists (fatia 013, abaixo das Listas) + lixeira + "Voltar à Makima".

import type { Sidebar, KaguyaView, Group } from '../types'
import { BUILTIN_TODAY_OVERDUE, GTD_BUILTINS } from '../types'
import { Icon } from '../ui/Icons'
import type { IconName } from '../ui/Icons'

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
}

// Views fixas (built-ins). No MVP só 'today' e 'kanban' têm telas; calendar/eisenhower vêm na Fase 2.
const FIXED_VIEWS: { view: KaguyaView; icon: IconName; label: string }[] = [
  { view: 'today', icon: 'sun', label: 'Meu Dia' },
  { view: 'kanban', icon: 'board', label: 'Kanban' },
  { view: 'calendar', icon: 'calendar', label: 'Calendário' },
  { view: 'eisenhower', icon: 'grid', label: 'Eisenhower' },
]

export function SidebarNav({ sidebar, view, param, onNavigate, onNewTask, onNewProject, onNewGroup, onEditGroup, onNewFilter, onOpenTweaks }: SidebarNavProps) {
  const projects = sidebar?.projects ?? []
  const groups = sidebar?.groups ?? []
  const filters = sidebar?.filters ?? []
  const inbox = projects.find((p) => p.is_inbox)
  // Listas sem grupo (exceto o Inbox, que aparece destacado no topo do bloco).
  const ungrouped = projects.filter((p) => !p.is_inbox && p.group_id == null)

  // Renderiza um item de lista (com contagem de abertas).
  const projectItem = (p: typeof projects[number]) => (
    <button
      key={p.id}
      className={`kg-nav-item${view === 'list' && param === p.id ? ' active' : ''}`}
      onClick={() => onNavigate('list', p.id)}
    >
      <span className="kg-nav-emoji">{p.icon ?? '•'}</span>
      <span>{p.name}</span>
      {p.open_count > 0 && <span className="kg-nav-count">{p.open_count}</span>}
    </button>
  )

  return (
    <nav className="kg-sidebar">
      {/* marca: retrato + wordmark (Playfair) */}
      <div className="kg-brand">
        <img className="kg-brand-img" src="/kaguya.jpg" alt="Kaguya" />
        <span className="kg-brand-name">Kaguya</span>
        <button className="kg-icon-btn" style={{ marginLeft: 'auto' }} onClick={onOpenTweaks} aria-label="Ajustes">
          <Icon name="settings" size={15} />
        </button>
      </div>

      <button className="kg-newbtn" onClick={onNewTask}>
        <span><Icon name="plus" size={15} style={{ verticalAlign: 'middle', marginRight: 6 }} />Nova tarefa</span>
        <kbd>C</kbd>
      </button>

      {/* Views fixas */}
      <div className="kg-nav-label"><span>Views</span></div>
      {FIXED_VIEWS.map((v) => (
        <button key={v.view} className={`kg-nav-item${view === v.view ? ' active' : ''}`} onClick={() => onNavigate(v.view)}>
          <span className="kg-nav-emoji"><Icon name={v.icon} size={16} /></span>
          <span>{v.label}</span>
        </button>
      ))}

      {/* Listas (grupos → listas; Inbox no topo). Dois atalhos no cabeçalho: novo grupo e nova lista.
          O cluster fica num <div> (não <span>) porque o modo estreito esconde os <span> do cabeçalho. */}
      <div className="kg-nav-label">
        <span>Listas</span>
        <div className="kg-nav-acts">
          <button className="kg-act-grp" onClick={onNewGroup} aria-label="Novo grupo" title="Novo grupo">+ grupo</button>
          <button onClick={onNewProject} aria-label="Nova lista" title="Nova lista"><Icon name="plus" size={13} /></button>
        </div>
      </div>
      {inbox && projectItem(inbox)}
      {ungrouped.map(projectItem)}
      {groups.map((g) => {
        // Mostra TODO grupo (mesmo vazio) — senão criar um grupo parece não fazer nada.
        // O cabeçalho é clicável: abre o modal para renomear/excluir o grupo.
        const inGroup = projects.filter((p) => p.group_id === g.id)
        return (
          <div key={g.id}>
            <button className="kg-group-label" onClick={() => onEditGroup(g)} title="Editar grupo">
              {g.name}
            </button>
            {inGroup.map(projectItem)}
          </div>
        )
      })}

      {/* Smart lists (fatia 013) — abaixo das Listas. A built-in "Hoje + Vencidas" vem
          fixa do código (não é uma linha em task_filters); depois as salvas. */}
      <div className="kg-nav-label">
        <span>Smart lists</span>
        <div className="kg-nav-acts">
          <button onClick={onNewFilter} aria-label="Nova smart-list" title="Nova smart-list"><Icon name="plus" size={13} /></button>
        </div>
      </div>
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

      {/* lixeira */}
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
