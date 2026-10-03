// Parcelamentos: as compras parceladas em andamento, quanto pesam nos próximos meses e a linha do tempo de
// cada uma. Compras novas parceladas nascem em Lançar ("1200 tv 10x"): aqui só se acompanha, cancela ou apaga.

import { useMemo, useState } from 'react'
import { fmtDate, MONTHS_LONG, todayISO } from '../../../design/core/format'
import { confirm } from '../../../design/headless/confirm'
import { toast } from '../../../design/headless/toast'
import { Button, EmptyState, ErrorState, ListRow, LoadingState, Modal, Page, ProgressBar, SectionHeader, StatusChip, Timeline } from '../../../design'
import { useNami } from '../context'
import { useLoad } from '../lib/useLoad'
import { namiApi } from '../namiApi'
import type { Installment, InstallmentDetail } from '../types'

const nextMonths = (today: string, n: number): string[] => {
  const base = Number(today.slice(0, 4)) * 12 + Number(today.slice(5, 7)) - 1
  return Array.from({ length: n }, (_, i) => { const idx = base + i + 1; return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}` })
}

export function Installments() {
  const nami = useNami()
  const today = useMemo(() => todayISO(), [])
  const months = useMemo(() => nextMonths(today, 3), [today])
  const { state, retry } = useLoad(
    async () => ({ list: (await namiApi.getInstallments('ativo')).installments, commitments: await Promise.all(months.map((m) => namiApi.getFutureCommitments(m))) }),
    [nami.rev, months],
  )
  const [open, setOpen] = useState<Installment | null>(null)

  if (state.status === 'loading') return <Page><LoadingState variant="stat" count={3} /></Page>
  if (state.status === 'error') return <Page><ErrorState onRetry={retry} /></Page>
  const { list, commitments } = state.data

  return (
    <Page wide>
      <div className="ds-kpis">
        {commitments.map((c) => (
          <div key={c.month} className="ds-kpi ds-card">
            <span className="ds-mono">Comprometido em {MONTHS_LONG[Number(c.month.slice(5, 7)) - 1]}</span>
            <span className="ds-v nm-amt">{nami.money(c.total)}</span>
            <span className="ds-hint">{nami.money(c.total_parcelas)} em parcelas · {nami.money(c.total_assinaturas)} em recorrentes</span>
          </div>
        ))}
      </div>
      <SectionHeader title="Compras parceladas" mono={`${list.length} em andamento`} />
      {list.length === 0 ? (
        <EmptyState icon="group" title="Nenhuma compra parcelada" hint="Para parcelar, lance com “Nx” na linha rápida, por exemplo: 1200 tv 10x @nubank." action={<Button variant="primary" icon="add" onClick={() => nami.openEntry()}>Lançar</Button>} />
      ) : (
        <div className="ds-list">
          {list.map((g) => (
            <ListRow
              key={g.id}
              title={g.name}
              meta={`${g.conta} · ${g.parcelas_pagas} de ${g.num_parcelas} · ${nami.money(g.valor_parcela)} por mês`}
              icon="group"
              hue={25}
              trailing={<span className="nm-amt">{nami.money(g.valor_parcela * g.parcelas_pendentes)} a pagar</span>}
              onOpen={() => setOpen(g)}
            />
          ))}
        </div>
      )}
      {open && <InstallmentModal group={open} onClose={() => setOpen(null)} />}
    </Page>
  )
}

function InstallmentModal({ group, onClose }: { group: Installment; onClose: () => void }) {
  const nami = useNami()
  const { state, retry } = useLoad<InstallmentDetail>(() => namiApi.getInstallmentDetail(group.id), [group.id, nami.rev])

  const cancel = async () => {
    const ok = await confirm({ title: 'Cancelar as parcelas que faltam?', body: 'As parcelas já pagas ficam. As futuras somem e deixam de pesar nos próximos meses.', confirmLabel: 'Cancelar parcelas', danger: true })
    if (!ok) return
    try { await namiApi.cancelInstallment(group.id); toast(`${group.name}: parcelas futuras canceladas`); nami.reload(); onClose() }
    catch (e) { toast(e instanceof Error ? e.message : 'Não foi possível cancelar.', { tone: 'error' }) }
  }
  const remove = async () => {
    const ok = await confirm({ title: 'Apagar a compra inteira?', body: 'Apaga as parcelas pagas e as futuras (use só se foi lançada por engano). Você poderá desfazer logo depois.', confirmLabel: 'Apagar tudo', danger: true })
    if (!ok) return
    try {
      await namiApi.deleteInstallment(group.id)
      nami.reload()
      toast(`${group.name} apagada`, {
        undo: () => {
          void namiApi.createInstallment({
            name: group.name, valor_total: group.total_valor, num_parcelas: group.num_parcelas, categoria: group.categoria, data_inicio: group.first_due,
            ...(group.card_id ? { card_id: group.card_id } : { conta: group.conta }),
          }).then(nami.reload)
        },
      })
      onClose()
    } catch (e) { toast(e instanceof Error ? e.message : 'Não foi possível apagar.', { tone: 'error' }) }
  }

  return (
    <Modal
      title={group.name}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" icon="delete" onClick={() => void remove()}>Apagar tudo</Button>
          <Button onClick={() => void cancel()} disabled={group.parcelas_pendentes === 0}>Cancelar o que falta</Button>
          <Button variant="primary" onClick={onClose}>Fechar</Button>
        </>
      }
    >
      <ProgressBar value={group.parcelas_pagas} max={group.num_parcelas} label={`${group.parcelas_pagas} de ${group.num_parcelas} parcelas pagas`} />
      <p className="nm-note">
        {nami.money(group.total_valor)} em {group.num_parcelas}x de {nami.money(group.valor_parcela)} · {group.conta} · 1ª parcela em {fmtDate(group.first_due)}
      </p>
      {state.status === 'loading' && <LoadingState variant="row" count={3} />}
      {state.status === 'error' && <ErrorState onRetry={retry} />}
      {state.status === 'ok' && (
        <Timeline
          entries={state.data.parcelas.map((p) => ({
            title: `Parcela ${p.numero} de ${group.num_parcelas} · ${nami.money(p.valor)}`,
            detail: `${fmtDate(p.data)} · ${p.pago ? 'paga' : 'a pagar'}${p.mes_corrente ? ' · neste mês' : ''}`,
          }))}
        />
      )}
      {state.status === 'ok' && state.data.parcelas_pendentes === 0 && <StatusChip status="done" label="Quitada" />}
    </Modal>
  )
}
