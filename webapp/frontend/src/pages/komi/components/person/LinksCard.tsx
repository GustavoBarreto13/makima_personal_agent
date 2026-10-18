// Ligações: as pessoas ligadas a esta (irmão, cônjuge, colega, chefe…, sempre com o lado de lá preenchido
// sozinho) e os grupos livres em que ela está ("turma da faculdade"). Fica na aba Memória, abaixo do resumo.

import { useState } from 'react'
import { Avatar, Button, Field, Icon, IconButton, Input, Modal, PersonPicker, Select, type PersonOption } from '../../../../design'
import { toast } from '../../../../design/headless/toast'
import { useKomi } from '../../context'
import { komiApi } from '../../komiApi'
import { namesOf, norm } from '../../lib/people'
import { useLoad } from '../../lib/useLoad'
import type { PersonRow, RelationKind } from '../../types'

function RelateDialog({ person, kinds, onClose }: { person: PersonRow; kinds: RelationKind[]; onClose: () => void }) {
  const komi = useKomi()
  const [other, setOther] = useState<PersonOption | null>(null)
  const [kind, setKind] = useState(kinds[0]?.slug ?? 'outro')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const search = (q: string): PersonOption[] => {
    const n = norm(q)
    return komi.people.filter((p) => p.id !== person.id && namesOf(p).some((x) => norm(x).includes(n))).slice(0, 8).map((p) => ({ id: p.id, name: p.name, avatar: p.avatar_url }))
  }
  const submit = async () => {
    if (!other) { setError('Escolha a outra pessoa.'); return }
    setSaving(true)
    try {
      await komiApi.relate(person.id, other.id, kind)
      komi.reload()
      onClose()
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível ligar.'); setSaving(false) }
  }
  const inverse = kinds.find((k) => k.slug === kind)
  return (
    <Modal title={`Ligar ${person.name} a outra pessoa`} size="sm" onClose={onClose}
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" icon="check" disabled={saving} onClick={() => void submit()}>Ligar</Button></>}>
      <div className="ds-stack">
        <Field label="Quem?" error={error}>
          {(a) => <PersonPicker id={a.id} value={other ? [other] : []} onChange={(list) => { setOther(list[list.length - 1] ?? null); setError(null) }} search={search} />}
        </Field>
        <Field label={`${other?.name ?? 'Ela'} é… de ${person.name}`} hint={inverse ? `Do outro lado aparece “${kinds.find((k) => k.slug === inverse.inverse_slug)?.label ?? inverse.label}”.` : undefined}>
          {(a) => <Select {...a} value={kind} onChange={(e) => setKind(e.target.value)}>{kinds.map((k) => <option key={k.slug} value={k.slug}>{k.label}</option>)}</Select>}
        </Field>
      </div>
    </Modal>
  )
}

export function LinksCard({ person }: { person: PersonRow }) {
  const komi = useKomi()
  const [relating, setRelating] = useState(false)
  const [newGroup, setNewGroup] = useState('')
  const [pick, setPick] = useState('')
  const rel = useLoad(() => komiApi.relations(person.id).catch(() => []), [person.id, komi.rev])
  const mine = useLoad(() => komiApi.personGroups(person.id).catch(() => []), [person.id, komi.rev])
  const all = useLoad(() => komiApi.groups().catch(() => []), [komi.rev])
  const kinds = useLoad(() => komiApi.relationKinds().catch(() => []), [])

  const relations = rel.state.status === 'ok' ? rel.state.data : []
  const myGroups = mine.state.status === 'ok' ? mine.state.data : []
  const groups = all.state.status === 'ok' ? all.state.data : []
  const free = groups.filter((g) => !myGroups.some((m) => m.id === g.id))

  const fail = (e: unknown) => toast(e instanceof Error ? e.message : 'Não foi possível salvar.', { tone: 'error' })

  const unrelate = async (otherId: string, kind: string, label: string) => {
    try {
      await komiApi.unrelate(person.id, otherId, kind)
      komi.reload()
      toast('Ligação removida', { tone: 'success', undo: () => { komiApi.relate(person.id, otherId, kind).then(komi.reload).catch(() => toast(`Não foi possível religar ${label}.`, { tone: 'error' })) } })
    } catch (e) { fail(e) }
  }

  const addToGroup = async () => {
    try {
      let id = Number(pick)
      if (pick === 'new') {
        const name = newGroup.trim()
        if (!name) return
        id = (await komiApi.addGroup(name)).id
      }
      if (!id) return
      await komiApi.addToGroup(id, person.id)
      setPick(''); setNewGroup('')
      komi.reload()
    } catch (e) { fail(e) }
  }

  return (
    <section className="ds-card km-links" aria-label="Ligações">
      <div className="km-links-col">
        <h3 className="km-label"><Icon name="people" size={13} /> Pessoas ligadas</h3>
        {relations.length === 0 && <p className="ds-hint">Ninguém ligado ainda.</p>}
        <ul className="km-chiplist">
          {relations.map((r) => (
            <li key={`${r.other_id}-${r.kind}`} className="km-pill">
              <button type="button" className="km-link km-pill-main" onClick={() => komi.goto({ view: 'people', personId: r.other_id })}>
                <Avatar name={r.other_name} src={r.avatar_url} size={22} /> {r.other_name} <small>{r.label}</small>
              </button>
              <IconButton icon="close" label={`Remover ligação com ${r.other_name}`} size={13} onClick={() => void unrelate(r.other_id, r.kind, r.other_name)} />
            </li>
          ))}
        </ul>
        <div><Button size="sm" icon="add" disabled={kinds.state.status !== 'ok'} onClick={() => setRelating(true)}>Ligar a alguém</Button></div>
      </div>

      <div className="km-links-col">
        <h3 className="km-label"><Icon name="folder" size={13} /> Grupos</h3>
        {myGroups.length === 0 && <p className="ds-hint">Em nenhum grupo.</p>}
        <ul className="km-chiplist">
          {myGroups.map((g) => (
            <li key={g.id} className="km-pill">
              <span className="km-pill-main">{g.name}</span>
              <IconButton icon="close" label={`Tirar do grupo ${g.name}`} size={13} onClick={() => { komiApi.removeFromGroup(g.id, person.id).then(komi.reload).catch(fail) }} />
            </li>
          ))}
        </ul>
        <div className="ds-inline km-groupadd">
          <Select aria-label="Adicionar a um grupo" value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Adicionar a um grupo…</option>
            {free.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            <option value="new">+ Novo grupo</option>
          </Select>
          {pick === 'new' && <Input aria-label="Nome do novo grupo" placeholder="Ex.: Turma da faculdade" value={newGroup} onChange={(e) => setNewGroup(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void addToGroup() } }} />}
          <Button size="sm" disabled={!pick || (pick === 'new' && !newGroup.trim())} onClick={() => void addToGroup()}>Adicionar</Button>
        </div>
      </div>
      {relating && kinds.state.status === 'ok' && <RelateDialog person={person} kinds={kinds.state.data} onClose={() => setRelating(false)} />}
    </section>
  )
}
