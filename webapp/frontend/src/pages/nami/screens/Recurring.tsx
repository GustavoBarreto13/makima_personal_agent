// Recorrentes: o que entra e sai todo mês (salário, contas fixas, assinaturas) numa lista só, com a situação de
// cada um neste mês e a ação certa ("Recebi", "Paguei"). Substitui as telas Assinaturas e Contas Fixas.

import { useMemo, useState, type CSSProperties } from 'react'
import { todayISO } from '../../../design/core/format'
import { useCollection } from '../../../design/headless/useCollection'
import { Button, CollectionBody, CollectionMeta, CollectionToolbar, CountUp, EmptyState, FilterSheet, Icon, IconButton, Page, SectionHeader, StatusChip, type Status } from '../../../design'
import { cx } from '../../../design/ui/primitives'
import { RecurringForm } from '../components/RecurringForm'
import { useNami } from '../context'
import { dueDay, KIND_ONE, kindOf, makeRecurringSchema, summarize } from '../lib/recurring'
import { useLoad } from '../lib/useLoad'
import { namiApi } from '../namiApi'
import type { RecurringStatusItem } from '../types'

const CHIP: Record<RecurringStatusItem['cycle_status'], Status> = { paga: 'done', pendente: 'planned', atrasada: 'dropped', agendada: 'paused' }

export function Recurring() {
  const nami = useNami()
  const today = useMemo(() => todayISO(), [])
  const schema = useMemo(() => makeRecurringSchema(today), [today])
  const { state, retry } = useLoad(() => namiApi.getRecurringStatus(), [nami.rev])
  const items = state.status === 'ok' ? state.data.items : []
  const c = useCollection(schema, items, { today })
  const [filters, setFilters] = useState(false)
  const [form, setForm] = useState<{ item: RecurringStatusItem | null } | null>(null)
  const sum = useMemo(() => summarize(items), [items])

  const row = (it: RecurringStatusItem) => {
    const kind = kindOf(it)
    const waiting = it.cycle_status === 'pendente' || it.cycle_status === 'atrasada'
    const label = it.cycle_status === 'paga' ? (kind === 'renda' ? 'Recebida' : 'Paga') : it.cycle_status[0].toUpperCase() + it.cycle_status.slice(1)
    return (
      <div key={it.id} className="ds-lrow nm-act" style={{ cursor: 'default', '--ds-ch': kind === 'renda' ? 150 : kind === 'assinatura' ? 300 : 25 } as CSSProperties}>
        <span className="ds-lead"><Icon name={kind === 'renda' ? 'income' : kind === 'assinatura' ? 'recurring' : 'invoice'} size={18} /></span>
        <span className="ds-t">
          <b>{it.name}</b>
          <span>{KIND_ONE[kind]} · dia {dueDay(it)}{it.conta ? ` · ${it.conta}` : ''}{it.ciclo === 'anual' ? ' · anual' : ''}</span>
        </span>
        <StatusChip status={CHIP[it.cycle_status]} label={label} />
        <span className={cx('nm-amt', kind === 'renda' && 'nm-in', it.cycle_status === 'atrasada' && 'nm-late')}>{nami.money(it.valor)}</span>
        {waiting && <Button size="sm" variant="primary" onClick={() => nami.openPay({ kind: kind === 'conta_fixa' ? 'conta' : kind, id: it.id, name: it.name, valor: it.valor })}>{kind === 'renda' ? 'Recebi' : 'Paguei'}</Button>}
        <IconButton icon="edit" label={`Editar ${it.name}`} onClick={() => setForm({ item: it })} />
      </div>
    )
  }

  return (
    <Page wide>
      <div className="ds-kpis">
        <div className="ds-kpi ds-card"><span className="ds-mono">Custo fixo por mês</span><span className="ds-v nm-amt">{nami.money(sum.custo)}</span></div>
        <div className="ds-kpi ds-card"><span className="ds-mono">Entradas por mês</span><span className="ds-v nm-amt nm-in">{nami.money(sum.renda)}</span></div>
        <div className="ds-kpi ds-card"><span className="ds-mono">Contas a pagar</span><span className="ds-v"><CountUp value={sum.pendentes} /><small>neste mês</small></span></div>
        <div className="ds-kpi ds-card"><span className="ds-mono">Ainda vai entrar</span><span className="ds-v nm-amt">{nami.money(sum.rendaPendente)}</span></div>
      </div>
      <SectionHeader title="Todos os recorrentes" action={<Button variant="primary" icon="add" onClick={() => setForm({ item: null })}>Novo recorrente</Button>} />
      <CollectionToolbar schema={schema} c={c} onOpenFilters={() => setFilters(true)} searchPlaceholder="Buscar recorrentes" />
      <CollectionMeta c={c} noun={['recorrente', 'recorrentes']} />
      <CollectionBody
        c={c}
        view="list"
        renderCard={() => null}
        renderRow={row}
        loading={state.status === 'loading'}
        error={state.status === 'error'}
        onRetry={retry}
        emptyTitle="Nenhum recorrente com esses filtros"
        firstRun={
          <EmptyState
            icon="recurring"
            title="Nada recorrente ainda"
            hint="Cadastre o salário, as contas fixas (luz, aluguel) e as assinaturas. O plano do mês passa a saber o que ainda vai sair."
            action={<Button variant="primary" icon="add" onClick={() => setForm({ item: null })}>Cadastrar o primeiro</Button>}
          />
        }
      />
      {filters && <FilterSheet schema={schema} c={c} items={items} onClose={() => setFilters(false)} noun={['recorrente', 'recorrentes']} />}
      {form && <RecurringForm key={form.item?.id ?? 'novo'} item={form.item} onClose={() => setForm(null)} />}
    </Page>
  )
}
