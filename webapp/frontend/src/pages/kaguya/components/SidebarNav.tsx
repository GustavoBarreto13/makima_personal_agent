// SidebarNav — a navegação interna do shell Kaguya (guia §5):
// marca + botão "Nova tarefa" + Views fixas + Smart lists (Fase 2) +
// "Listas" (grupos → listas, Inbox no topo) + Hábitos + "Voltar à Makima".

import type { Sidebar, KaguyaView } from '../types'
import { Icon } from '../ui/Icons'
import type { IconName } from '../ui/Icons'

interface SidebarNavProps {
  sidebar: Sidebar | null
  view: KaguyaView
  param: number | null      // id da lista quando view = 'list'
  onNavigate: (view: KaguyaView, param?: number | null) => void
  onNewTask: () => void
  onNewProject: () => void
  onOpenTweaks: () => void
}

// Views fixas (built-ins). No MVP só 'today' e 'kanban' têm telas; calendar/eisenhower vêm na Fase 2.
const FIXED_VIEWS: { view: KaguyaView; icon: IconName; label: string }[] = [
  { view: 'today', icon: 'sun', label: 'Meu Dia' },
  { view: 'kanban', icon: 'board', label: 'Kanban' },
  { view: 'calendar', icon: 'calendar', label: 'Calendário' },
  { view: 'eisenhower', icon: 'grid', label: 'Eisenhower' },
]

export function SidebarNav({ sidebar, view, param, onNavigate, onNewTask, onNewProject, onOpenTweaks }: SidebarNavProps) {
  const projects = sidebar?.projects ?? []
  const groups = sidebar?.groups ?? []
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

      {/* Listas (grupos → listas; Inbox no topo) */}
      <div className="kg-nav-label">
        <span>Listas</span>
        <button onClick={onNewProject} aria-label="Nova lista"><Icon name="plus" size={13} /></button>
      </div>
      {inbox && projectItem(inbox)}
      {ungrouped.map(projectItem)}
      {groups.map((g) => {
        const inGroup = projects.filter((p) => p.group_id === g.id)
        if (inGroup.length === 0) return null
        return (
          <div key={g.id}>
            <div className="kg-group-label">{g.name}</div>
            {inGroup.map(projectItem)}
          </div>
        )
      })}

      {/* Hábitos (entrada única — tela na Fase 4) + lixeira */}
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
