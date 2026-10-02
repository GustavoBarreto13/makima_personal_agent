// Uma linha de lançamento (usada na tela inicial e na lista). Entrada em verde, gasto neutro;
// o sinal e o texto dizem o tipo — a cor nunca é o único sinal.

import { fmtRelative } from '../../../design/core/format'
import { ListRow } from '../../../design'
import { cx } from '../../../design/ui/primitives'
import { useNami } from '../context'
import { categoryHue, categoryIcon } from '../lib/categories'
import type { Transaction } from '../types'

export function TxRow({ tx, today, onOpen }: { tx: Transaction; today: string; onOpen: () => void }) {
  const { money } = useNami()
  const transfer = tx.tipo === 'Transferencia'
  const incoming = tx.tipo === 'Receita' || (transfer && tx.valor > 0)
  const sign = incoming ? '+' : '−'
  const people = tx.people?.length ? ` · ${tx.people.map((p) => p.name).join(', ')}` : ''
  return (
    <ListRow
      title={tx.name}
      meta={`${tx.conta} · ${fmtRelative(tx.data, today)}${people}`}
      icon={transfer ? 'transfer' : categoryIcon(tx.categoria)}
      hue={categoryHue(transfer ? 'Transferencia' : tx.categoria)}
      trailing={<span className={cx('nm-amt', incoming && 'nm-in')}>{sign} {money(Math.abs(tx.valor))}</span>}
      onOpen={onOpen}
    />
  )
}
