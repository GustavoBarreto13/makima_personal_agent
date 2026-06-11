// Tipos TypeScript do shell Kaguya — espelham o contrato REST /api/tasks/*
// (specs/011-tasks-mvp/contracts/api-tasks.md) e o modelo do backend.

// Tipo de uma tarefa: tarefa comum, evento (com hora) ou aniversário (recorrência anual).
export type TaskType = 'task' | 'event' | 'birthday'

// Uma tarefa (ou subtarefa). Campos temporais chegam como string ISO do backend.
export interface Task {
  id: number
  project_id: number
  column_id: number | null
  parent_id: number | null
  title: string
  description: string | null
  type: TaskType
  priority: number            // 0 nenhuma · 1 baixa · 2 média · 3 alta
  due_date: string | null     // "YYYY-MM-DD"
  due_time: string | null     // "HH:MM"
  position: number
  completed_at: string | null // null = aberta
  created_at: string
  // Presente nas listagens com JOIN (today/search):
  project_name?: string
  // Subtarefas aninhadas (só nas tarefas-pai retornadas por list_tasks):
  subtasks?: Task[]
}

// Uma lista (na UI "Lista"; no modelo "project").
export interface Project {
  id: number
  name: string
  group_id: number | null
  color: string | null
  icon: string | null
  is_inbox: boolean
  position: number
  has_board: boolean   // tem ao menos uma coluna de Kanban
  open_count: number   // tarefas-pai abertas
}

// Um grupo de listas (pasta da sidebar).
export interface Group {
  id: number
  name: string
  position: number
}

// Uma coluna de Kanban.
export interface Column {
  id: number
  project_id: number
  name: string
  position: number
  is_done_column: boolean
}

// Payload único da sidebar.
export interface Sidebar {
  groups: Group[]
  projects: Project[]
}

// Resposta da tela Hoje.
export interface TodayResponse {
  overdue: Task[]
  today: Task[]
}

// Preferências visuais do shell (persistidas em localStorage).
export interface Tweaks {
  theme: 'light' | 'dark'
  accent: 'blue' | 'pink' | 'violet' | 'gold'
  density: 'confortavel' | 'compacta'
  pmark: 'bar' | 'dot' | 'fill'   // estilo da marca de prioridade
  anim: 'on' | 'off'
}

// View ativa do shell. 'list' usa o param como id da lista.
export type KaguyaView = 'today' | 'list' | 'kanban' | 'calendar' | 'eisenhower' | 'habits' | 'trash'
