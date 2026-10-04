// UI das coleções (padrão da lista da Kaguya): barra Agrupar/Ordenar/Filtros, tira de chips,
// folha de filtros por tipo de faceta e o corpo da lista (4 estados + grupos + "mostrar mais").
// A lógica vive em core/collection + headless/useCollection; aqui só se desenha.

import { useMemo, useState, type ReactNode } from 'react'
import { BUCKET_LABEL, tagOptions, type CollectionSchema, type EnumFacet, type Facet } from '../core/collection'
import { pluralize } from '../core/format'
import type { UseCollection } from '../headless/useCollection'
import { EmptyState, ErrorState, LoadingState } from './feedback'
import { Icon } from './Icon'
import { Menu } from './overlay'
import { Button, Chip, cx, SegmentedControl, SettingRow, Toggle } from './primitives'
import { RateInput } from './rating'
import { Sheet } from './overlay'

export type CollectionView = 'grid' | 'list'

// ── barra ────────────────────────────────────────────────────────────────────

export interface CollectionToolbarProps<T> {
  schema: CollectionSchema<T>
  c: UseCollection<T>
  onOpenFilters: () => void
  view?: CollectionView
  onView?: (v: CollectionView) => void
  searchPlaceholder?: string
  /** Ações extras (ex.: botão de importar). */
  extra?: ReactNode
}

export function CollectionToolbar<T>({ schema, c, onOpenFilters, view, onView, searchPlaceholder = 'Buscar…', extra }: CollectionToolbarProps<T>) {
  const [menu, setMenu] = useState<'group' | 'sort' | null>(null)
  const groupLabel = c.state.groupBy === 'none' ? 'Nenhum' : schema.groups.find((g) => g.id === c.state.groupBy)?.label ?? 'Nenhum'
  const sortLabel = schema.sorts.find((s) => s.id === c.state.sortBy)?.label ?? ''
  const filterCount = c.chips.filter((x) => x.facetId !== 'q').length
  return (
    <div className="ds-toolbar">
      <label className="ds-search">
        <Icon name="search" size={16} />
        <input type="search" value={c.state.q} placeholder={searchPlaceholder} aria-label={searchPlaceholder} autoComplete="off" onChange={(e) => c.setQ(e.target.value)} />
      </label>
      {schema.groups.length > 0 && (
        <div className="ds-anchor">
          <Chip on={c.state.groupBy !== 'none'} icon="group" aria-haspopup="menu" aria-expanded={menu === 'group'} onClick={() => setMenu(menu === 'group' ? null : 'group')}>
            Agrupar: {groupLabel}
          </Chip>
          {menu === 'group' && (
            <Menu
              label="Agrupar por"
              onClose={() => setMenu(null)}
              items={[{ id: 'none', label: 'Nenhum', checked: c.state.groupBy === 'none', onSelect: () => c.setGroup('none') }, ...schema.groups.map((g) => ({ id: g.id, label: g.label, checked: c.state.groupBy === g.id, onSelect: () => c.setGroup(g.id) }))]}
            />
          )}
        </div>
      )}
      <div className="ds-anchor">
        <Chip icon="sort" aria-haspopup="menu" aria-expanded={menu === 'sort'} onClick={() => setMenu(menu === 'sort' ? null : 'sort')}>
          Ordenar: {sortLabel}
        </Chip>
        {menu === 'sort' && (
          <Menu label="Ordenar por" onClose={() => setMenu(null)} items={schema.sorts.map((s) => ({ id: s.id, label: s.label, checked: c.state.sortBy === s.id, onSelect: () => c.setSort(s.id) }))} />
        )}
      </div>
      <Chip aria-label={`Ordem ${c.state.dir === 'asc' ? 'crescente' : 'decrescente'}. Clique para inverter`} title="Inverter a ordem" onClick={c.toggleDir}>
        {c.state.dir === 'asc' ? '↑' : '↓'}
      </Chip>
      <Chip on={filterCount > 0} icon="filter" onClick={onOpenFilters}>Filtros{filterCount > 0 ? ` · ${filterCount}` : ''}</Chip>
      {extra}
      <span className="ds-tb-sp" />
      {view && onView && (
        <SegmentedControl
          label="Visualização"
          value={view}
          onChange={onView}
          options={[{ value: 'grid', icon: 'grid', ariaLabel: 'Grade' }, { value: 'list', icon: 'list', ariaLabel: 'Lista' }]}
        />
      )}
    </div>
  )
}

// ── chips ativos + contador ──────────────────────────────────────────────────

export function CollectionMeta<T>({ c, noun = ['item', 'itens'] }: { c: UseCollection<T>; noun?: [string, string] }) {
  return (
    <>
      {c.chips.length > 0 && (
        <div className="ds-fchips">
          {c.chips.map((chip) => (
            <span key={`${chip.facetId}:${chip.value ?? ''}`} className="ds-fchip">
              {chip.label}
              <button type="button" aria-label={`Remover filtro ${chip.label}`} onClick={() => c.removeChip(chip)}><Icon name="close" size={10} /></button>
            </span>
          ))}
          <button type="button" className="ds-linkbtn" onClick={c.clearAll}>Limpar tudo</button>
        </div>
      )}
      <p className="ds-count" aria-live="polite">{c.result.count} de {pluralize(c.result.total, noun[0], noun[1])}</p>
    </>
  )
}

// ── corpo: 4 estados, grupos e paginação ─────────────────────────────────────

export interface CollectionBodyProps<T> {
  c: UseCollection<T>
  view: CollectionView
  renderCard: (item: T, index: number) => ReactNode
  renderRow: (item: T, index: number) => ReactNode
  loading?: boolean
  error?: boolean
  onRetry?: () => void
  /** Texto do estado vazio por filtros. */
  emptyTitle?: string
  /** Estado vazio quando NÃO há nenhum item (convida ao primeiro registro). */
  firstRun?: ReactNode
  pageSize?: number
  /** Classe da grade (ex.: `ds-grid-poster` para pôsteres 2:3). Padrão: `ds-grid`. */
  gridClass?: string
  /** Cabeçalho de cada grupo. Padrão: o título do grupo e a contagem. */
  renderGroupHeader?: (key: string, count: number) => ReactNode
}

export function CollectionBody<T>({ c, view, renderCard, renderRow, loading, error, onRetry, emptyTitle = 'Nada com esses filtros', firstRun, pageSize = 40, gridClass = 'ds-grid', renderGroupHeader }: CollectionBodyProps<T>) {
  const [limit, setLimit] = useState(pageSize)
  if (loading) return <LoadingState variant={view === 'grid' ? 'card' : 'row'} count={view === 'grid' ? 8 : 5} />
  if (error) return <ErrorState onRetry={onRetry} />
  if (c.result.total === 0 && firstRun) return <>{firstRun}</>
  if (c.result.count === 0) {
    return (
      <EmptyState
        icon="search"
        title={emptyTitle}
        hint="Tente remover um filtro ou ampliar o período para ver mais."
        action={<Button onClick={c.clearAll}>Limpar filtros</Button>}
      />
    )
  }
  let n = 0
  let shown = 0
  const groups = c.result.groups.map((g) => {
    const room = Math.max(0, limit - shown)
    const slice = g.items.slice(0, room)
    shown += slice.length
    return { ...g, slice }
  }).filter((g) => g.slice.length)
  const remaining = c.result.count - shown
  return (
    <>
      {groups.map((g) => (
        <div key={g.key || 'all'}>
          {g.key && (renderGroupHeader ? renderGroupHeader(g.key, g.items.length) : <div className="ds-grp-h"><h3>{g.key}</h3><span className="ds-mono">{g.items.length}</span></div>)}
          {view === 'grid'
            ? <div className={gridClass}>{g.slice.map((it) => renderCard(it, n++))}</div>
            : <div className="ds-list">{g.slice.map((it) => renderRow(it, n++))}</div>}
        </div>
      ))}
      {remaining > 0 && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 20 }}>
          <Button onClick={() => setLimit((l) => l + pageSize)}>Mostrar mais {remaining}</Button>
        </div>
      )}
    </>
  )
}

// ── folha de filtros ─────────────────────────────────────────────────────────

export interface FilterSheetProps<T> {
  schema: CollectionSchema<T>
  c: UseCollection<T>
  /** Itens completos (para extrair as opções de etiquetas). */
  items: T[]
  onClose: () => void
  noun?: [string, string]
  /** Controle próprio de uma faceta (ex.: seletor de pessoas da Komi). */
  renderFacet?: (facet: Facet<T>, c: UseCollection<T>) => ReactNode
}

export function FilterSheet<T>({ schema, c, items, onClose, noun = ['item', 'itens'], renderFacet }: FilterSheetProps<T>) {
  const tagsByFacet = useMemo(() => {
    const m: Record<string, string[]> = {}
    for (const f of schema.facets) if (f.kind === 'tags') m[f.id] = tagOptions(f, items)
    return m
  }, [schema, items])

  const facetControl = (f: Facet<T>): ReactNode => {
    const v = c.state.facets[f.id] ?? {}
    const custom = renderFacet?.(f, c)
    if (custom) return custom
    switch (f.kind) {
      case 'enum':
        return <div className="ds-chips">{(f as EnumFacet<T>).options.map((o) => <Chip key={o.value} on={!!v.values?.[o.value]} onClick={() => c.toggleValue(f.id, o.value)}>{o.label ?? o.value}</Chip>)}</div>
      case 'tags':
        return (
          <>
            <div className="ds-chips">{tagsByFacet[f.id].map((t) => <Chip key={t} on={!!v.values?.[t]} onClick={() => c.toggleValue(f.id, t)}>#{t}</Chip>)}</div>
            <SegmentedControl label="Modo da etiqueta" value={v.mode ?? 'has'} onChange={(m) => c.setTagMode(f.id, m)} options={[{ value: 'has', label: 'Tem' }, { value: 'nothas', label: 'Não tem' }]} />
          </>
        )
      case 'range':
        return f.display === 'stars'
          ? <RateInput value={v.min ?? 0} onChange={(m) => c.setMin(f.id, m)} label={`${f.label} mínima`} />
          : <input type="range" min={f.min} max={f.max} step={f.step} value={v.min ?? f.min} aria-label={`${f.label} mínima`} onChange={(e) => c.setMin(f.id, Number(e.target.value))} />
      case 'dateRange':
        return <div className="ds-chips">{f.buckets.map((b) => <Chip key={b} on={(v.bucket ?? f.defaultBucket) === b} onClick={() => c.setBucket(f.id, b)}>{BUCKET_LABEL[b]}</Chip>)}</div>
      case 'flag':
        return <SettingRow title={f.label}><Toggle label={f.label} checked={!!v.flag} onChange={(x) => c.setFlag(f.id, x)} /></SettingRow>
      case 'people':
        return <p className="ds-hint">Escolha as pessoas pelo seletor da Komi.</p>
    }
  }

  return (
    <Sheet
      title="Filtros"
      onClose={onClose}
      footer={
        <>
          <Button onClick={c.clearAll}>Limpar</Button>
          <Button variant="primary" onClick={onClose}>Ver {pluralize(c.result.count, noun[0], noun[1])}</Button>
        </>
      }
    >
      {schema.facets.map((f) => (
        <div key={f.id} className={cx('ds-fgrp')}>
          {f.kind !== 'flag' && <span className="ds-lbl-f">{f.label}</span>}
          {facetControl(f)}
        </div>
      ))}
    </Sheet>
  )
}
