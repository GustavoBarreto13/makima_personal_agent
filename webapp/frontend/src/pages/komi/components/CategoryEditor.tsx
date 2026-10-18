// Editor da lista de relacionamentos (Preferências → Komi): criar, renomear, trocar o ícone, reordenar e arquivar.
// Arquivar um relacionamento com pessoas pergunta para onde elas vão (nunca deixa ninguém sem relacionamento).

import { useState } from 'react'
import { Button, ErrorState, Icon, IconButton, Input, LoadingState, Modal, Select, SectionHeader, type IconName } from '../../../design'
import { toast } from '../../../design/headless/toast'
import { komiApi } from '../komiApi'
import { CATEGORY_ICONS } from '../lib/kinds'
import { useLoad } from '../lib/useLoad'
import type { Category } from '../types'

export function CategoryEditor({ categories, onChanged }: { categories: Category[]; onChanged: () => void }) {
  const [rev, setRev] = useState(0)
  const { state, retry } = useLoad(() => komiApi.categories(true), [rev, categories.length])
  const [label, setLabel] = useState('')
  const [icon, setIcon] = useState<IconName>('person')
  const [archiving, setArchiving] = useState<Category | null>(null)
  const [busy, setBusy] = useState(false)

  const changed = () => { setRev((n) => n + 1); onChanged() }
  const run = async (job: () => Promise<unknown>, ok?: string) => {
    setBusy(true)
    try { await job(); if (ok) toast(ok, { tone: 'success' }); changed() } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível salvar.', { tone: 'error' })
    }
    setBusy(false)
  }

  if (state.status === 'loading') return <LoadingState variant="row" count={3} />
  if (state.status === 'error') return <ErrorState onRetry={retry} />

  const all = state.data
  const active = all.filter((c) => !c.archived)
  const archived = all.filter((c) => c.archived)

  const move = (i: number, to: number) => {
    if (to < 0 || to >= active.length) return
    const order = active.map((c) => c.slug)
    ;[order[i], order[to]] = [order[to], order[i]]
    void run(() => komiApi.reorderCategories(order))
  }

  const add = () => {
    const name = label.trim()
    if (!name) return
    void run(async () => { await komiApi.addCategory({ label: name, icon }); setLabel('') }, `“${name}” criado`)
  }

  return (
    <div className="ds-stack km-cats">
      <SectionHeader title="Relacionamentos" mono="Família, amigos… do seu jeito" />
      <ul className="km-catlist">
        {active.map((c, i) => (
          <li key={c.slug} className="km-catrow">
            <Icon name={(c.icon || 'person') as IconName} size={18} />
            <Input
              aria-label={`Nome do relacionamento ${c.label}`}
              defaultValue={c.label}
              onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== c.label) void run(() => komiApi.updateCategory(c.slug, { label: v })); else e.target.value = c.label }}
            />
            <Select aria-label={`Ícone de ${c.label}`} value={c.icon} onChange={(e) => void run(() => komiApi.updateCategory(c.slug, { icon: e.target.value }))}>
              {[...new Set([c.icon, ...CATEGORY_ICONS])].map((n) => <option key={n} value={n}>{n}</option>)}
            </Select>
            <span className="ds-mono km-catcount">{c.people_count}</span>
            <IconButton icon="up" label={`Subir ${c.label}`} size={15} disabled={busy || i === 0} onClick={() => move(i, i - 1)} />
            <IconButton icon="down" label={`Descer ${c.label}`} size={15} disabled={busy || i === active.length - 1} onClick={() => move(i, i + 1)} />
            <IconButton icon="archive" label={`Arquivar ${c.label}`} size={15} disabled={busy || active.length <= 1} onClick={() => (c.people_count ? setArchiving(c) : void run(() => komiApi.archiveCategory(c.slug), `“${c.label}” arquivado`))} />
          </li>
        ))}
      </ul>

      <div className="km-catadd">
        <Input aria-label="Nome do novo relacionamento" placeholder="Novo relacionamento (ex.: Vizinhos)" value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }} />
        <Select aria-label="Ícone do novo relacionamento" value={icon} onChange={(e) => setIcon(e.target.value as IconName)}>
          {CATEGORY_ICONS.map((n) => <option key={n} value={n}>{n}</option>)}
        </Select>
        <Button size="sm" icon="add" disabled={busy || !label.trim()} onClick={add}>Criar</Button>
      </div>

      {archived.length > 0 && (
        <details className="km-archived">
          <summary>Arquivados ({archived.length})</summary>
          <ul className="km-catlist">
            {archived.map((c) => (
              <li key={c.slug} className="km-catrow">
                <Icon name={(c.icon || 'person') as IconName} size={18} />
                <span>{c.label}</span>
                <Button size="sm" icon="restore" disabled={busy} onClick={() => void run(() => komiApi.unarchiveCategory(c.slug), `“${c.label}” de volta`)}>Restaurar</Button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {archiving && (
        <ArchiveDialog
          category={archiving}
          options={active.filter((c) => c.slug !== archiving.slug)}
          onClose={() => setArchiving(null)}
          onConfirm={(to) => { const c = archiving; setArchiving(null); void run(() => komiApi.archiveCategory(c.slug, to), `“${c.label}” arquivado; as pessoas foram para outro relacionamento`) }}
        />
      )}
    </div>
  )
}

function ArchiveDialog({ category, options, onClose, onConfirm }: { category: Category; options: Category[]; onClose: () => void; onConfirm: (to: string) => void }) {
  const [to, setTo] = useState(options.find((o) => o.slug === 'outros')?.slug ?? options[0]?.slug ?? '')
  return (
    <Modal
      title={`Arquivar “${category.label}”`}
      size="sm"
      onClose={onClose}
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" disabled={!to} onClick={() => onConfirm(to)}>Arquivar e mover</Button></>}
    >
      <div className="ds-stack">
        <p>{category.people_count === 1 ? '1 pessoa está' : `${category.people_count} pessoas estão`} neste relacionamento. Para onde elas vão?</p>
        <Select aria-label="Mover as pessoas para" value={to} onChange={(e) => setTo(e.target.value)}>
          {options.map((o) => <option key={o.slug} value={o.slug}>{o.label}</option>)}
        </Select>
      </div>
    </Modal>
  )
}
