// DataTable — tabela densa no desktop que vira lista de cartões no celular (container query).
// Regra do padrão: nunca uma tabela larga com rolagem horizontal no celular.

import type { ReactNode } from 'react'

export interface Column<T> {
  id: string
  header: string
  /** Rótulo mostrado no cartão do celular (padrão: o cabeçalho). */
  mobileLabel?: string
  render: (row: T) => ReactNode
  align?: 'left' | 'right'
}

export interface DataTableProps<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string | number
  onRowClick?: (row: T) => void
  caption: string
}

export function DataTable<T>({ columns, rows, rowKey, onRowClick, caption }: DataTableProps<T>) {
  return (
    <div className="ds-table-wrap">
      <table className="ds-table" data-mobile="cards">
        <caption className="ds-sr-only">{caption}</caption>
        <thead>
          <tr>{columns.map((c) => <th key={c.id} scope="col" style={{ textAlign: c.align ?? 'left' }}>{c.header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={rowKey(r)} style={{ cursor: onRowClick ? 'pointer' : undefined }} onClick={onRowClick ? () => onRowClick(r) : undefined}>
              {columns.map((c) => (
                <td key={c.id} data-label={c.mobileLabel ?? c.header} style={{ textAlign: c.align ?? 'left' }}>{c.render(r)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
