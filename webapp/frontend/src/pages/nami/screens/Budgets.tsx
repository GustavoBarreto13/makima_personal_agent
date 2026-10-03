// Orçamentos: um limite por categoria, mês a mês. Cada linha mostra quanto já foi, quanto resta e avisa quando
// passa de 90% (e quando estoura). Definir de novo a mesma categoria troca o limite.

import { useMemo, useState } from 'react'
import { fmtPercent, MONTHS_LONG, todayISO } from '../../../design/core/format'
import { confirm } from '../../../design/headless/confirm'
import { toast } from '../../../design/headless/toast'
import { useHotkeys } from '../../../design/headless/useHotkeys'
import { Button, EmptyState, ErrorState, Field, IconButton, LoadingState, Modal, MoneyInput, Page, ProgressBar, SectionHeader, Select, StatusChip } from '../../../design'
import { cx } from '../../../design/ui/primitives'
import { useNami } from '../context'
import { useLoad } from '../lib/useLoad'
import { namiApi } from '../namiApi'
import type { BudgetEnvelope } from '../types'

const monthLabel = (ym: string) => `${MONTHS_LONG[Number(ym.slice(5, 7)) - 1]} de ${ym.slice(0, 4)}`
const shift = (ym: string, d: number) => { const i = Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1 + d; return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}` }

export function Budgets() {
  const nami = useNami()
  const [month, setMonth] = useState(todayISO().slice(0, 7))
  const { state, retry } = useLoad(() => namiApi.getBudgets(month), [month, nami.rev])
  const [form, setForm] = useState<{ envelope: BudgetEnvelope | null } | null>(null)
  const name = (id: string) => nami.categories.find((c) => c.id === id)?.name ?? id

  const envelopes = state.status === 'ok' ? state.data.envelopes : []
  const totals = useMemo(() => ({ limite: envelopes.reduce((s, e) => s + e.limite, 0), gasto: envelopes.reduce((s, e) => s + e.gasto, 0) }), [envelopes])

  const remove = async (e: BudgetEnvelope) => {
    const ok = await confirm({ title: `Remover o orçamento de ${name(e.categoria)}?`, body: 'Só o limite some; os gastos continuam. Você poderá desfazer logo depois.', confirmLabel: 'Remover', danger: true })
    if (!ok) return
    try {
      await namiApi.deleteBudget(month, e.categoria)
      nami.reload()
      toast(`Orçamento de ${name(e.categoria)} removido`, { undo: () => { void namiApi.createBudget({ month, categoria: e.categoria, limite: e.limite }).then(nami.reload) } })
    } catch (err) { toast(err instanceof Error ? err.message : 'Não foi possível remover.', { tone: 'error' }) }
  }

  const header = (
    <SectionHeader
      title="Limites do mês"
      action={
        <div className="nm-month">
          <IconButton icon="left" label="Mês anterior" onClick={() => setMonth((m) => shift(m, -1))} />
          <span className="ds-mono">{monthLabel(month)}</span>
          <IconButton icon="right" label="Próximo mês" onClick={() => setMonth((m) => shift(m, 1))} />
          <Button variant="primary" icon="add" onClick={() => setForm({ envelope: null })}>Novo limite</Button>
        </div>
      }
    />
  )

  const modal = form && <BudgetForm month={month} envelope={form.envelope} taken={envelopes.map((e) => e.categoria)} onClose={() => setForm(null)} />
  if (state.status === 'loading') return <Page>{header}<LoadingState variant="row" count={4} />{modal}</Page>
  if (state.status === 'error') return <Page>{header}<ErrorState onRetry={retry} />{modal}</Page>

  return (
    <Page wide>
      {envelopes.length > 0 && (
        <div className="ds-kpis">
          <div className="ds-kpi ds-card"><span className="ds-mono">Gasto nas categorias com limite</span><span className="ds-v nm-amt">{nami.money(totals.gasto)}</span><ProgressBar value={totals.gasto} max={totals.limite || 1} label="Gasto contra o total de limites" /></div>
          <div className="ds-kpi ds-card"><span className="ds-mono">Soma dos limites</span><span className="ds-v nm-amt">{nami.money(totals.limite)}</span></div>
        </div>
      )}
      {header}
      {envelopes.length === 0 ? (
        <EmptyState icon="goal" title="Nenhum limite neste mês" hint="Escolha uma categoria (mercado, lazer…) e um valor. A Nami avisa quando passar de 90%." action={<Button variant="primary" icon="add" onClick={() => setForm({ envelope: null })}>Definir um limite</Button>} />
      ) : (
        <div className="ds-list">
          {envelopes.map((e) => (
            <div key={e.categoria} className="ds-lrow nm-act nm-budget" style={{ cursor: 'default' }}>
              <span className="ds-t">
                <b>{name(e.categoria)}</b>
                <span>{nami.money(e.gasto)} de {nami.money(e.limite)} · {e.estourado ? `estourou ${nami.money(-e.restante)}` : `restam ${nami.money(e.restante)}`}</span>
                <ProgressBar value={Math.min(e.gasto, e.limite)} max={e.limite || 1} label={`${name(e.categoria)}: ${fmtPercent(e.pct_usado / 100)} do limite`} />
              </span>
              <StatusChip status={e.estourado ? 'dropped' : e.pct_usado >= 90 ? 'paused' : 'done'} label={e.estourado ? 'Estourou' : e.pct_usado >= 90 ? 'Quase' : 'No limite'} />
              <span className={cx('nm-amt', e.estourado && 'nm-late')}>{fmtPercent(e.pct_usado / 100)}</span>
              <IconButton icon="edit" label={`Editar limite de ${name(e.categoria)}`} onClick={() => setForm({ envelope: e })} />
              <IconButton icon="delete" label={`Remover limite de ${name(e.categoria)}`} onClick={() => void remove(e)} />
            </div>
          ))}
        </div>
      )}
      {modal}
    </Page>
  )
}

function BudgetForm({ month, envelope, taken, onClose }: { month: string; envelope: BudgetEnvelope | null; taken: string[]; onClose: () => void }) {
  const nami = useNami()
  const options = nami.categories.filter((c) => c.kind === 'out' && (envelope?.categoria === c.id || !taken.includes(c.id)))
  const [categoria, setCategoria] = useState(envelope?.categoria ?? options[0]?.id ?? '')
  const [limite, setLimite] = useState<number | null>(envelope?.limite ?? null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!categoria) { setError('Escolha uma categoria.'); return }
    if (limite === null || !(limite > 0)) { setError('Informe o limite do mês.'); return }
    setSaving(true)
    try {
      await namiApi.createBudget({ month, categoria, limite })
      toast(`Limite de ${nami.categories.find((c) => c.id === categoria)?.name ?? categoria} definido`, { tone: 'success' })
      nami.reload()
      onClose()
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível salvar.') }
    finally { setSaving(false) }
  }
  useHotkeys([{ keys: 'mod+enter', global: true, handler: (ev) => { ev.preventDefault(); void save() } }])

  return (
    <Modal size="sm" title={envelope ? 'Editar limite' : 'Novo limite'} onClose={onClose} footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={() => void save()} disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</Button></>}>
      <Field label="Categoria">
        {(a) => <Select {...a} value={categoria} disabled={!!envelope} onChange={(e) => setCategoria(e.target.value)}>{options.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>}
      </Field>
      <Field label="Limite do mês" error={error} hint="Vale só para este mês. Ajuste de novo no mês que vem.">
        {(a) => <MoneyInput {...a} value={limite} onChange={(v) => { setLimite(v); setError(null) }} />}
      </Field>
    </Modal>
  )
}
