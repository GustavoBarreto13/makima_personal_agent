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
  // Meu Dia — fatia 016:
  my_day_date: string | null  // "YYYY-MM-DD" — data para a qual está no Meu Dia (independente de due_date)
  start_at: string | null     // ISO 8601 — início do bloco de tempo
  end_at: string | null       // ISO 8601 — fim do bloco de tempo
  duration_min: number | null // estimativa de duração em minutos (insumo da CapacityBar)
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

// ── Meu Dia — fatia 016 ───────────────────────────────────────────────────────

// Métricas de capacity: cruzamento de estimativas de tarefas com eventos do Calendar.
export interface CapacityStats {
  no_plano: number        // quantidade de tarefas no plano
  estimado_min: number    // total estimado de trabalho (soma de duration_min)
  agenda_min: number      // duração dos eventos do Google Calendar dentro da janela útil
  livre_min: number       // janela útil (8h–22h) menos agenda (≥ 0)
  folga_min: number       // livre menos estimado (negativo = estouro)
  excedeu: boolean        // true quando o plano excede a janela livre
  calendar_ok: boolean    // false quando o Calendar não respondeu (agenda_min = 0)
}

// Resposta do endpoint GET /api/tasks/my-day.
export interface MyDayResponse {
  date: string              // "YYYY-MM-DD" do plano
  plano: Task[]             // tarefas selecionadas para hoje (my_day_date == date)
  pendencias_ontem: Task[]  // abertas de dias anteriores (my_day_date < date)
  sugestoes: Task[]         // vencem em ≤7 dias, fora do plano
  capacity: CapacityStats
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

// Tendência do hábito (modelo caixa d'água): média rápida vs lenta.
export type HabitTrend = 'up' | 'down' | 'flat'

// ── Hábitos (Fase 4 / fatia 014) ───────────────────────────────────────────────
// Um hábito: rotina com frequência alvo (freq_num vezes a cada freq_den dias) e check-ins
// diários. As métricas de score são DERIVADAS (calculadas na leitura no backend pelo modelo
// "caixa d'água", nunca persistidas). `target_value`+`unit` => hábito mensurável; ausentes => sim/não.
export interface Habit {
  id: number
  name: string
  icon: string | null
  color: string | null
  freq_num: number
  freq_den: number
  target_value: number | null
  unit: string | null
  // Score em três dimensões (modelo caixa d'água):
  consistency: number   // 0–100 — a "nota" (nível da caixa reescalado pela meta)
  trend: HabitTrend     // tendência: subindo / caindo / estável
  recent_done: number   // cumpridos nos últimos 14 dias (dado cru)
  recent_total: number  // quanto a meta esperava em 2 semanas (meta_semanal × 2)
  done_today: boolean   // se já houve check-in cumprido hoje
}

// Um dia do histórico de check-ins (para o heatmap anual). Array esparso vindo do backend
// (só dias com check-in); o componente de heatmap densifica para a grade contínua.
export interface HabitHeatDay {
  date: string          // "YYYY-MM-DD"
  value: number | null  // valor medido (mensurável) ou null (sim/não)
  done: boolean         // cumpriu a meta naquele dia
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
