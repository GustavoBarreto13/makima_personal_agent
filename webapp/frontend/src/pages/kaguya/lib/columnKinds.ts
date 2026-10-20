// Tipos de coluna do Kanban que o usuário escolhe (o “concluída” vem do interruptor da coluna).
// `auto` = o servidor deduz o tipo pelo nome. Usado pelo modal de uma coluna e pelo de gerenciar colunas.

import type { ColumnKind } from '../types'

export type KindChoice = ColumnKind | 'auto'

export const KIND_OPTIONS: { value: KindChoice; label: string }[] = [
  { value: 'auto', label: 'Automático (pelo nome)' },
  { value: 'backlog', label: 'Backlog / ideias' },
  { value: 'todo', label: 'A fazer' },
  { value: 'doing', label: 'Em andamento' },
  { value: 'review', label: 'Homologação / revisão' },
  { value: 'blocked', label: 'Bloqueada' },
]

// Tipos cujas tarefas não entram em cobranças (resumo da manhã, Conselho do Dia, alarmes).
export const QUIET_KINDS: KindChoice[] = ['backlog', 'review', 'blocked']

/** Tipo que o seletor mostra para uma coluna já gravada: sem tipo (ou concluída) abre em “Automático”. */
export const initialKindChoice = (kind?: ColumnKind | null): KindChoice => (kind && kind !== 'done' ? kind : 'auto')

/** Dica sob o seletor: o que esse tipo faz com as cobranças. */
export function kindHint(kind: KindChoice): string {
  if (QUIET_KINDS.includes(kind)) return 'Tarefas daqui são tratadas como “esperando”: não entram nas cobranças do resumo da manhã, do Conselho do Dia nem nos alarmes.'
  if (kind === 'auto') return 'Deduzido pelo nome (Homolog, Blocked, Backlog, To Do, Doing…). Nome desconhecido conta como pendência.'
  return 'Tarefas daqui contam como pendências.'
}
