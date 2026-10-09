// Texto dos dois tempos livres do Meu Dia (trabalho e geral). Puro: recebe os minutos que o servidor calculou
// (agenda do usuário − compromissos) e devolve frases e a fração da barra.

import { fmtMinutes } from './taskView'
import type { TimeBucket } from '../types'

export interface BucketView {
  /** 0–100 (a barra para em 100 mesmo com estouro). */
  pct: number
  over: boolean
  /** "2h30 de 6h livres" */
  line: string
  /** "folga de 3h30" ou "estourou em 1h". */
  note: string
}

export function bucketView(b: TimeBucket): BucketView {
  const over = b.estimado_min > b.livre_min
  const pct = b.livre_min <= 0 ? (b.estimado_min > 0 ? 100 : 0) : Math.min(100, Math.round((b.estimado_min / b.livre_min) * 100))
  const note = over ? `estourou em ${fmtMinutes(b.estimado_min - b.livre_min)}` : `folga de ${fmtMinutes(Math.max(0, b.folga_min))}`
  return { pct, over, line: `${fmtMinutes(b.estimado_min)} de ${fmtMinutes(Math.max(0, b.livre_min))} livres`, note }
}

/** O balde do trabalho só faz sentido em dia de trabalho (ou se já há trabalho planejado). */
export function showWorkBucket(works: boolean, work: TimeBucket): boolean {
  return works || work.estimado_min > 0
}
