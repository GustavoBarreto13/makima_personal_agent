// Chips discretos exibidos na linha/card da tarefa: data (colorida por urgência),
// lista e tipo. Mantidos pequenos (mono 10–11px) conforme o guia.

import { Icon } from './Icons'

/** Formata "YYYY-MM-DD" para "DD/MM" (curto, pt-BR). */
function shortDate(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

interface DateChipProps {
  due_date: string
  due_time?: string | null
}

/** Chip de data. Fica em vermelho-lacre quando a data é anterior a hoje (vencida). */
export function DateChip({ due_date, due_time }: DateChipProps) {
  const today = new Date().toISOString().slice(0, 10)
  const overdue = due_date < today
  return (
    <span className={`kg-chip kg-chip-date${overdue ? ' is-overdue' : ''}`}>
      <Icon name="calendar" size={11} />
      {shortDate(due_date)}{due_time ? ` ${due_time}` : ''}
    </span>
  )
}

/** Chip da lista (nome + ícone opcional da lista). */
export function ProjChip({ name, icon }: { name: string; icon?: string | null }) {
  return (
    <span className="kg-chip kg-chip-proj">
      {icon ? <span className="kg-chip-emoji">{icon}</span> : <Icon name="inbox" size={11} />}
      {name}
    </span>
  )
}

/** Glyph do tipo da tarefa (evento/aniversário). 'task' não mostra nada. */
export function TypeGlyph({ type }: { type: string }) {
  if (type === 'event') return <Icon name="clock" size={12} className="kg-type-glyph" />
  if (type === 'birthday') return <Icon name="gift" size={12} className="kg-type-glyph" />
  return null
}

/** Chip de recorrência (ícone de loop + descrição pt-BR, ex.: "todo dia 5"). */
export function RecurChip({ text }: { text: string }) {
  return (
    <span className="kg-chip kg-chip-recur">
      <Icon name="loop" size={11} />
      {text}
    </span>
  )
}

/** Chip de tag (etiqueta). Usa a cor própria da tag, se houver; senão o acento do tema. */
export function TagChip({ name, color }: { name: string; color?: string | null }) {
  // Cor própria sobrescreve texto e borda; sem cor, a classe kg-chip-tag usa o acento.
  const style = color ? { color, borderColor: color } : undefined
  return <span className="kg-chip kg-chip-tag" style={style}>#{name}</span>
}
