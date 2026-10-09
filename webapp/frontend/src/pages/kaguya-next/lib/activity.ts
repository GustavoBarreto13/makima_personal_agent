// Texto do histórico de uma tarefa (aba Histórico): cada evento do servidor vira uma frase curta em pt-BR.

import { fmtDate, isoDate } from '../../../design/core/format'
import type { ActivityEvent } from '../types'

const day = (v: string | null): string => (v ? fmtDate(v) : 'sem data')

export function describeActivity(e: ActivityEvent, projectNames: Record<number, string> = {}): string {
  switch (e.kind) {
    case 'created': return 'Criada'
    case 'completed': return 'Concluída'
    case 'reopened': return 'Reaberta'
    case 'deleted': return 'Enviada para a lixeira'
    case 'restored': return 'Restaurada da lixeira'
    case 'rescheduled': return e.from_value ? `Vencimento: ${day(e.from_value)} → ${day(e.to_value)}` : `Vencimento definido para ${day(e.to_value)}`
    case 'deferred': return e.to_value ? `Adiada até ${day(e.to_value)}` : 'Adiamento removido'
    case 'my_day_in': return e.from_value ? `Meu Dia: ${day(e.from_value)} → ${day(e.to_value)}` : `Entrou no Meu Dia de ${day(e.to_value)}`
    case 'my_day_out': return 'Saiu do Meu Dia'
    case 'moved': {
      const name = (id: string | null) => (id && projectNames[Number(id)]) || (id ? `lista ${id}` : 'sem lista')
      return `Movida de ${name(e.from_value)} para ${name(e.to_value)}`
    }
  }
}

/** Dia local (YYYY-MM-DD) de um instante ISO — para agrupar o histórico por dia. */
export const activityDay = (iso: string): string => isoDate(new Date(iso))

/** Hora local "HH:MM" de um instante ISO. */
export function activityTime(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
