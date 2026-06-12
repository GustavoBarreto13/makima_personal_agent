// Tipos TypeScript do shell Kaguya — espelham o contrato REST /api/tasks/*
// (specs/011-tasks-mvp/contracts/api-tasks.md) e o modelo do backend.

// Tipo de uma tarefa: tarefa comum, evento (com hora) ou aniversário (recorrência anual).
export type TaskType = 'task' | 'event' | 'birthday'

// Modo de recorrência: data-fixa (a âncora manda) ou pós-conclusão (conta de quando concluiu).
export type RecurrenceMode = 'fixed' | 'after_completion'

// Uma tag (etiqueta) — relação N:N com a tarefa. `color` é opcional (chip neutro sem ela).
export interface Tag {
  id: number
  name: string
  color: string | null
}

// Regra de recorrência de uma tarefa (1:1 com a tarefa viva da série).
export interface Recurrence {
  rrule: string               // regra RFC 5545 (ex.: "FREQ=MONTHLY;BYMONTHDAY=5")
  mode: RecurrenceMode
  anchor_date: string | null  // âncora da série ("YYYY-MM-DD")
  active: boolean             // false = série encerrada
}

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
  // Recorrência ativa (quando houver) + descrição pt-BR (ex.: "todo dia 5"):
  recurrence?: Recurrence | null
  recurrence_text?: string | null
  // Tags (etiquetas) da tarefa — anexadas nas listagens (sempre presente, pode ser vazia):
  tags?: Tag[]
  // Subtarefas aninhadas (só nas tarefas-pai retornadas por list_tasks):
  subtasks?: Task[]
  // Calendário (fatia 013 / P3): ocorrência projetada (virtual) de uma recorrente.
  // `is_virtual` = true → não tem linha própria; `series_task_id` aponta a tarefa viva da série.
  is_virtual?: boolean
  series_task_id?: number | null
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

// ── Smart-lists (filtros salvos) — fatia 013 / P2 ──────────────────────────────
// Campos e operadores aceitos pela DSL (espelham agents/kaguya/tools_filters.py).
export type FilterField = 'project_id' | 'priority' | 'due_date' | 'tag' | 'state' | 'text'
export type FilterCombinator = 'and' | 'or'

// Uma condição da regra: {campo, operador, valor}. O valor varia por campo (ver DSL).
export interface FilterCondition {
  field: FilterField
  op: string
  value: unknown   // número, string, lista de ids ou null — depende de field/op
}

// O objeto de regras de uma smart-list: combinador + lista de condições (≥1).
export interface FilterRules {
  combinator: FilterCombinator
  conditions: FilterCondition[]
}

// Uma smart-list salva (objeto de 1ª classe — tabela task_filters).
export interface Filter {
  id: number
  name: string
  icon: string | null
  rules: FilterRules
  default_view: string
  position: number
}

// Id-sentinela da smart-list built-in "Hoje + Vencidas" (não persistida no banco):
// usado como `param` da view 'filter' para distinguir da abertura de um filtro salvo.
export const BUILTIN_TODAY_OVERDUE = -1

// Built-ins GTD adicionais (também não persistidos). Cada um tem um id-sentinela NEGATIVO
// (não colide com ids reais de task_filters, que são positivos) e uma `key` que casa com a
// rota do backend (GET /filters/builtin/{key}/tasks). Metadados estáticos no front, como a
// "Hoje + Vencidas" — as regras vivem no backend (tools_filters.BUILTIN_FILTERS).
export interface GtdBuiltin {
  id: number       // sentinela usado como `param` da view 'filter'
  key: string      // chave da rota do backend
  name: string
  icon: string
}
export const GTD_BUILTINS: GtdBuiltin[] = [
  { id: -2, key: 'next-actions', name: 'Próximas Ações', icon: 'zap' },
  { id: -3, key: 'waiting', name: 'Aguardando', icon: 'clock' },
  { id: -4, key: 'someday', name: 'Algum dia', icon: 'inbox' },
  { id: -5, key: 'quick', name: 'Rápidas (5 min)', icon: 'timer' },
  { id: -6, key: 'energy', name: 'Alta energia', icon: 'flame' },
]

// Resposta de "abrir uma smart-list": tarefas + referências órfãs (tag/lista excluída).
export interface FilterTasksResponse {
  tasks: Task[]
  orphans: FilterCondition[]
  missing?: boolean
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
  filters: Filter[]   // smart-lists salvas (fatia 013)
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

// View ativa do shell. 'list' usa o param como id da lista; 'filter' usa o param como
// id da smart-list (ou BUILTIN_TODAY_OVERDUE para a built-in).
export type KaguyaView = 'today' | 'list' | 'kanban' | 'calendar' | 'eisenhower' | 'habits' | 'trash' | 'filter'
