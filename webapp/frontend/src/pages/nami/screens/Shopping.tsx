// Lista de compras: adicione itens numa frase ("arroz, feijão 2kg, leite"), marque no carrinho e finalize —
// a compra vira UM gasto de supermercado e a lista abre de novo com o que ficou faltando.

import { useState } from 'react'
import { toast } from '../../../design/headless/toast'
import { confirm } from '../../../design/headless/confirm'
import { useHotkeys } from '../../../design/headless/useHotkeys'
import { Button, Chip, EmptyState, ErrorState, Field, IconButton, Input, LoadingState, Modal, MoneyInput, Page, SectionHeader, Select, Tabs } from '../../../design'
import { cx } from '../../../design/ui/primitives'
import { useNami } from '../context'
import { useLoad } from '../lib/useLoad'
import { namiApi } from '../namiApi'
import type { ShoppingItem, ShoppingList, ShoppingListDetail } from '../types'

export function Shopping() {
  const nami = useNami()
  const lists = useLoad(() => namiApi.getShoppingLists('ativa'), [nami.rev])
  const [picked, setPicked] = useState<string | null>(null)
  const [modal, setModal] = useState<'new' | 'rename' | 'finish' | { item: ShoppingItem } | null>(null)

  const all = lists.state.status === 'ok' ? lists.state.data.lists : []
  const current = all.find((l) => l.id === picked) ?? all[0] ?? null
  const detail = useLoad<ShoppingListDetail | null>(() => (current ? namiApi.getShoppingList(current.id) : Promise.resolve(null)), [current?.id])
  const frequent = useLoad(() => namiApi.getFrequentItems(8), [current?.id, nami.rev])
  const [text, setText] = useState('')

  if (lists.state.status === 'loading') return <Page><LoadingState variant="row" count={4} /></Page>
  if (lists.state.status === 'error') return <Page><ErrorState onRetry={lists.retry} /></Page>

  const d = detail.state.status === 'ok' ? detail.state.data : null

  const add = async (value: string) => {
    if (!current || !value.trim()) return
    try { await namiApi.addShoppingItems(current.id, value.trim()); setText(''); detail.refresh(); frequent.refresh() }
    catch (e) { toast(e instanceof Error ? e.message : 'Não foi possível adicionar.', { tone: 'error' }) }
  }

  const toggle = (it: ShoppingItem) => {
    if (!d) return
    // atualização otimista: o item vira "no carrinho" na hora; se o servidor recusar, volta
    const items = d.items.map((x) => (x.id === it.id ? { ...x, checked: !x.checked } : x))
    const checked = items.filter((x) => x.checked).length
    detail.set({ ...d, items, checked_count: checked, pendentes_count: items.length - checked })
    namiApi.updateShoppingItem(it.id, { checked: !it.checked }).catch(() => { toast('Não foi possível marcar o item.', { tone: 'error' }); detail.refresh() })
  }

  const removeItem = (it: ShoppingItem) => {
    if (!d) return
    detail.set({ ...d, items: d.items.filter((x) => x.id !== it.id) })
    namiApi.deleteShoppingItem(it.id).then(
      () => toast(`${it.name} removido`, { undo: () => { void namiApi.addShoppingItems(current!.id, it.name).then(detail.refresh) } }),
      () => { toast('Não foi possível remover.', { tone: 'error' }); detail.refresh() },
    )
  }

  const removeList = async (l: ShoppingList) => {
    const ok = await confirm({ title: `Excluir a lista ${l.name}?`, body: 'Os itens dela somem junto.', confirmLabel: 'Excluir', danger: true })
    if (!ok) return
    try { await namiApi.deleteShoppingList(l.id); setPicked(null); lists.refresh(); toast(`Lista ${l.name} excluída`) }
    catch (e) { toast(e instanceof Error ? e.message : 'Não foi possível excluir.', { tone: 'error' }) }
  }

  if (all.length === 0) {
    return (
      <Page>
        <EmptyState icon="cart" title="Nenhuma lista ainda" hint="Crie a primeira (Mercado, Farmácia…) e adicione itens numa frase só." action={<Button variant="primary" icon="add" onClick={() => setModal('new')}>Nova lista</Button>} />
        {modal === 'new' && <ListModal list={null} onClose={() => setModal(null)} onDone={(id) => { setPicked(id); lists.refresh() }} />}
      </Page>
    )
  }

  const pending = d?.items.filter((i) => !i.checked) ?? []
  const inCart = d?.items.filter((i) => i.checked) ?? []

  return (
    <Page>
      <div className="nm-lists">
        <Tabs label="Listas" value={current?.id ?? ''} onChange={setPicked} tabs={all.map((l) => ({ id: l.id, label: l.name }))} />
        <IconButton icon="add" label="Nova lista" onClick={() => setModal('new')} />
        {current && <IconButton icon="edit" label="Renomear lista" onClick={() => setModal('rename')} />}
        {current && <IconButton icon="delete" label="Excluir lista" onClick={() => void removeList(current)} />}
      </div>

      <form className="nm-add" onSubmit={(e) => { e.preventDefault(); void add(text) }}>
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Adicionar: arroz, feijão 2kg, leite" aria-label="Adicionar itens à lista" autoComplete="off" />
        <Button type="submit" variant="primary" icon="add" disabled={!text.trim()}>Adicionar</Button>
      </form>

      {frequent.state.status === 'ok' && frequent.state.data.items.length > 0 && (
        <div className="nm-suggest" role="group" aria-label="Itens frequentes">
          <span className="ds-hint">Costuma comprar:</span>
          {frequent.state.data.items.map((f) => <Chip key={f.name} icon="add" onClick={() => void add(f.name)}>{f.name}</Chip>)}
        </div>
      )}

      {detail.state.status === 'loading' && <LoadingState variant="row" count={4} />}
      {detail.state.status === 'error' && <ErrorState onRetry={detail.retry} />}
      {d && d.items.length === 0 && <EmptyState icon="cart" title="Lista vazia" hint="Escreva os itens acima, separados por vírgula." />}

      {d && d.items.length > 0 && (
        <>
          <SectionHeader title="Falta comprar" mono={`${pending.length}`} />
          <div className="ds-list">{pending.map((it) => <ItemRow key={it.id} item={it} onToggle={toggle} onRemove={removeItem} onEdit={(i) => setModal({ item: i })} />)}</div>
          {inCart.length > 0 && (
            <>
              <SectionHeader title="No carrinho" mono={`${inCart.length}`} />
              <div className="ds-list">{inCart.map((it) => <ItemRow key={it.id} item={it} onToggle={toggle} onRemove={removeItem} onEdit={(i) => setModal({ item: i })} />)}</div>
            </>
          )}
          <div className="nm-total ds-card">
            <span>{d.checked_count} de {d.items.length} no carrinho · estimado <b className="nm-amt">{nami.money(d.total_estimado)}</b></span>
            <Button variant="primary" icon="check" onClick={() => setModal('finish')}>Finalizar compra</Button>
          </div>
        </>
      )}

      {modal === 'new' && <ListModal list={null} onClose={() => setModal(null)} onDone={(id) => { setPicked(id); lists.refresh() }} />}
      {modal === 'rename' && current && <ListModal list={current} onClose={() => setModal(null)} onDone={() => lists.refresh()} />}
      {modal === 'finish' && current && d && <FinishModal list={current} estimated={d.total_estimado} onClose={() => setModal(null)} onDone={() => { lists.refresh(); detail.refresh(); nami.reload() }} />}
      {modal && typeof modal === 'object' && <ItemModal item={modal.item} onClose={() => setModal(null)} onDone={detail.refresh} />}
    </Page>
  )
}

function ItemRow({ item, onToggle, onRemove, onEdit }: { item: ShoppingItem; onToggle: (i: ShoppingItem) => void; onRemove: (i: ShoppingItem) => void; onEdit: (i: ShoppingItem) => void }) {
  const { money } = useNami()
  return (
    <div className="ds-lrow nm-act" style={{ cursor: 'default' }}>
      <IconButton icon={item.checked ? 'success' : 'add'} label={item.checked ? `Tirar ${item.name} do carrinho` : `Colocar ${item.name} no carrinho`} onClick={() => onToggle(item)} />
      <button type="button" className={cx('nm-item', item.checked && 'nm-done')} onClick={() => onEdit(item)}>
        <b>{item.name}</b>
        {(item.quantidade || item.preco_estimado) && <span>{[item.quantidade, item.preco_estimado ? money(item.preco_estimado) : ''].filter(Boolean).join(' · ')}</span>}
      </button>
      <IconButton icon="delete" label={`Remover ${item.name}`} onClick={() => onRemove(item)} />
    </div>
  )
}

function ListModal({ list, onClose, onDone }: { list: ShoppingList | null; onClose: () => void; onDone: (id: string) => void }) {
  const [name, setName] = useState(list?.name ?? '')
  const [error, setError] = useState<string | null>(null)
  const save = async () => {
    if (!name.trim()) { setError('Dê um nome à lista.'); return }
    try {
      if (list) { await namiApi.updateShoppingList(list.id, { name: name.trim() }); onDone(list.id) }
      else { const r = await namiApi.createShoppingList(name.trim()); onDone(r.id) }
      onClose()
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível salvar.') }
  }
  useHotkeys([{ keys: 'mod+enter', global: true, handler: (ev) => { ev.preventDefault(); void save() } }])
  return (
    <Modal size="sm" title={list ? 'Renomear lista' : 'Nova lista'} onClose={onClose} footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={() => void save()}>Salvar</Button></>}>
      <Field label="Nome" error={error}>{(a) => <Input {...a} data-autofocus="" value={name} placeholder="Ex.: Farmácia" autoComplete="off" onChange={(e) => { setName(e.target.value); setError(null) }} />}</Field>
    </Modal>
  )
}

function ItemModal({ item, onClose, onDone }: { item: ShoppingItem; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(item.name)
  const [qty, setQty] = useState(item.quantidade ?? '')
  const [price, setPrice] = useState<number | null>(item.preco_estimado ?? null)
  const save = async () => {
    if (!name.trim()) return
    try { await namiApi.updateShoppingItem(item.id, { name: name.trim(), quantidade: qty, preco_estimado: price ?? undefined }); onDone(); onClose() }
    catch (e) { toast(e instanceof Error ? e.message : 'Não foi possível salvar.', { tone: 'error' }) }
  }
  return (
    <Modal size="sm" title="Editar item" onClose={onClose} footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={() => void save()}>Salvar</Button></>}>
      <Field label="Nome">{(a) => <Input {...a} data-autofocus="" value={name} onChange={(e) => setName(e.target.value)} />}</Field>
      <div className="ds-cols2" style={{ gap: 12 }}>
        <Field label="Quantidade">{(a) => <Input {...a} value={qty} placeholder="Ex.: 2kg" onChange={(e) => setQty(e.target.value)} />}</Field>
        <Field label="Preço estimado">{(a) => <MoneyInput {...a} value={price} onChange={setPrice} />}</Field>
      </div>
    </Modal>
  )
}

function FinishModal({ list, estimated, onClose, onDone }: { list: ShoppingList; estimated: number; onClose: () => void; onDone: () => void }) {
  const nami = useNami()
  const [valor, setValor] = useState<number | null>(estimated > 0 ? estimated : null)
  const [source, setSource] = useState(nami.defaultSource ? `${nami.defaultSource.kind}:${nami.defaultSource.id}` : '')
  const [error, setError] = useState<string | null>(null)
  const save = async () => {
    if (valor === null || !(valor > 0)) { setError('Informe quanto deu a compra.'); return }
    const s = nami.sources.find((x) => `${x.kind}:${x.id}` === source)
    if (!s) { setError('Escolha com o que pagou.'); return }
    try {
      await namiApi.finishShopping(list.id, { valor_total: valor, ...(s.kind === 'card' ? { card_id: s.id } : { conta: s.name }) })
      toast(`Compra de ${nami.money(valor)} lançada em Supermercado`, { tone: 'success' })
      onDone()
      onClose()
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível finalizar.') }
  }
  useHotkeys([{ keys: 'mod+enter', global: true, handler: (ev) => { ev.preventDefault(); void save() } }])
  return (
    <Modal size="sm" title="Finalizar compra" onClose={onClose} footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={() => void save()}>Lançar gasto</Button></>}>
      <Field label="Quanto deu" error={error} hint="O valor real do caixa, não o estimado. O que ficou sem marcar vai para a próxima lista.">
        {(a) => <MoneyInput {...a} value={valor} onChange={(v) => { setValor(v); setError(null) }} />}
      </Field>
      <Field label="Pago com">
        {(a) => (
          <Select {...a} value={source} onChange={(e) => setSource(e.target.value)}>
            {nami.sources.map((s) => <option key={`${s.kind}:${s.id}`} value={`${s.kind}:${s.id}`}>{s.name}</option>)}
          </Select>
        )}
      </Field>
    </Modal>
  )
}
