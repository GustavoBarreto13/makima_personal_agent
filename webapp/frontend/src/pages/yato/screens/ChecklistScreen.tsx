/**
 * ChecklistScreen.tsx — Yato · Viagens (fatia 066)
 *
 * Checklist agrupado por categoria — itens do dossiê vêm primeiro em cada
 * grupo. "Regerar do dossiê" nunca duplica nem apaga itens manuais (FR-016,
 * SC-008).
 *
 * Nota de fidelidade ao design: o handoff (design-guide.md §6.6) descreve 3
 * grupos temporais fixos ("antes de comprar · antes de embarcar · na
 * chegada"). O schema real (`trip_checklist_items.category`, ver
 * data-model.md) é um agrupamento LIVRE — `regenerate_checklist_from_dossier`
 * usa tags de assunto (`app`, `contato`, `seguranca`), não os 3 baldes
 * temporais do mock. Forçar os 3 grupos fixos jogaria todo item gerado do
 * dossiê sempre no mesmo balde, então aqui os grupos são derivados dos dados
 * reais (categoria livre, com "geral" para itens sem categoria).
 */

import { useEffect, useMemo, useState } from 'react'
import type { Trip, TripChecklistItem } from '../types'
import { yatoApi } from '../yatoApi'
import { ChecklistRow } from '../components/ChecklistRow'
import { Icon } from '../components/Icon'

const DEFAULT_GROUP = 'geral'

const GROUP_LABEL: Record<string, string> = {
  geral: 'geral', app: 'apps', contato: 'contatos', seguranca: 'segurança',
}

interface ChecklistScreenProps {
  trip: Trip
  onShowToast: (msg: string) => void
  reloadKey: number
  onChanged: () => void
}

export function ChecklistScreen({ trip, onShowToast, reloadKey, onChanged }: ChecklistScreenProps) {
  const [items, setItems] = useState<TripChecklistItem[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [newGroup, setNewGroup] = useState('')

  const load = () => { yatoApi.listChecklist(trip.id).then(res => setItems(res.items)).catch(() => setItems([])) }
  useEffect(load, [trip.id, reloadKey])

  const done = items.filter(i => i.done).length
  const pct = items.length ? Math.round((done / items.length) * 100) : 0

  // Grupos derivados dos dados: "geral" sempre presente + as categorias reais
  // já em uso, na ordem em que aparecem primeiro na lista.
  const groups = useMemo(() => {
    const seen = [DEFAULT_GROUP]
    for (const it of items) {
      const g = it.category || DEFAULT_GROUP
      if (!seen.includes(g)) seen.push(g)
    }
    return seen
  }, [items])

  const toggle = async (item: TripChecklistItem) => {
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, done: !i.done } : i))
    await yatoApi.updateChecklistItem(item.id, { done: !item.done })
    onChanged()
  }

  const remove = async (item: TripChecklistItem) => {
    if (!window.confirm(`Remover "${item.label}" do checklist?`)) return
    setItems(prev => prev.filter(i => i.id !== item.id))
    await yatoApi.deleteChecklistItem(item.id)
    onChanged()
  }

  const addItem = async (group: string, label: string) => {
    await yatoApi.addChecklistItem(trip.id, { label, category: group === DEFAULT_GROUP ? null : group })
    setDrafts(d => ({ ...d, [group]: '' }))
    load()
    onChanged()
  }

  const regen = async () => {
    const res = await yatoApi.regenerateChecklist(trip.id)
    onShowToast(res.added > 0 ? `${res.added} ${res.added === 1 ? 'item novo' : 'itens novos'} do dossiê.` : 'Nada novo — o dossiê já está refletido aqui.')
    load()
    onChanged()
  }

  return (
    <div className="page">
      <div className="section-head" style={{ marginTop: 4 }}>
        <h2 className="section-title">Checklist pré-viagem</h2>
        <span className="section-sub">{done} de {items.length} feitos</span>
        <button className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={regen}>
          <Icon name="carimbo" /> Regerar do dossiê
        </button>
      </div>
      <div className="card" style={{ padding: 16 }}>
        <div className="prog-wide"><i style={{ width: pct + '%' }} /></div>
        <div className="kv" style={{ marginTop: 9 }}>
          <span className="k">progresso</span><span>{pct}% — os itens do dossiê vêm primeiro, porque são os que te deixam na mão.</span>
        </div>
      </div>

      {groups.map(g => {
        const groupItems = items
          .filter(c => (c.category || DEFAULT_GROUP) === g)
          .sort((a, b) => (a.origin === b.origin ? 0 : a.origin === 'dossie' ? -1 : 1))
        if (g !== DEFAULT_GROUP && groupItems.length === 0) return null
        return (
          <div className="chk-group" key={g}>
            <div className="chk-glabel">{GROUP_LABEL[g] || g}</div>
            <div className="card">
              {groupItems.map(it => <ChecklistRow key={it.id} item={it} onToggle={() => toggle(it)} onDelete={() => remove(it)} />)}
              <div className="chk-add">
                <input className="inp" placeholder="adicionar item…" value={drafts[g] || ''}
                       onChange={e => setDrafts(d => ({ ...d, [g]: e.target.value }))}
                       onKeyDown={e => { if (e.key === 'Enter' && (drafts[g] || '').trim()) addItem(g, drafts[g].trim()) }} />
                <button className="btn btn-sm" onClick={() => (drafts[g] || '').trim() && addItem(g, drafts[g].trim())}>
                  <Icon name="plus" /> Adicionar
                </button>
              </div>
            </div>
          </div>
        )
      })}

      <div className="chk-group">
        <div className="chk-glabel">nova categoria</div>
        <div className="card chk-add">
          <input className="inp" placeholder="nome da categoria (ex.: documentos)" style={{ maxWidth: 220 }}
                 value={newGroup} onChange={e => setNewGroup(e.target.value)} />
          <input className="inp" placeholder="item…" value={drafts['__new'] || ''}
                 onChange={e => setDrafts(d => ({ ...d, __new: e.target.value }))}
                 onKeyDown={e => { if (e.key === 'Enter' && newGroup.trim() && (drafts['__new'] || '').trim()) { addItem(newGroup.trim(), drafts['__new'].trim()); setNewGroup('') } }} />
          <button className="btn btn-sm"
                  onClick={() => { if (newGroup.trim() && (drafts['__new'] || '').trim()) { addItem(newGroup.trim(), drafts['__new'].trim()); setNewGroup('') } }}>
            <Icon name="plus" /> Adicionar
          </button>
        </div>
      </div>
    </div>
  )
}
