import { describe, expect, it } from 'vitest'
import { bucketView, showWorkBucket } from './freeTime'
import type { TimeBucket } from '../types'

const bucket = (livre: number, estimado: number): TimeBucket => ({
  window_min: livre, busy_min: 0, livre_min: livre, estimado_min: estimado, folga_min: livre - estimado, excedeu: estimado > livre,
})

describe('bucketView', () => {
  it('folga: porcentagem e frases', () => {
    const v = bucketView(bucket(360, 150))
    expect(v).toMatchObject({ pct: 42, over: false, line: '2h30 de 6h livres', note: 'folga de 3h30' })
  })

  it('estouro trava a barra em 100% e diz quanto', () => {
    const v = bucketView(bucket(60, 150))
    expect(v).toMatchObject({ pct: 100, over: true, note: 'estourou em 1h30' })
  })

  it('sem tempo livre: vazio é 0%, com tarefa planejada é estouro', () => {
    expect(bucketView(bucket(0, 0))).toMatchObject({ pct: 0, over: false })
    expect(bucketView(bucket(0, 30))).toMatchObject({ pct: 100, over: true })
  })
})

describe('showWorkBucket', () => {
  it('só em dia de trabalho, ou quando já há trabalho planejado', () => {
    expect(showWorkBucket(true, bucket(480, 0))).toBe(true)
    expect(showWorkBucket(false, bucket(0, 0))).toBe(false)
    expect(showWorkBucket(false, bucket(0, 60))).toBe(true)
  })
})
