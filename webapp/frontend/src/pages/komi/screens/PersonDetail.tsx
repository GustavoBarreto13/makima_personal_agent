// Perfil da pessoa (#pessoa/<id>): cabeçalho com os três nomes, relacionamento, espaço e contatos; ações (registrar
// contato, editar, mesclar, apagar) e quatro abas — Memória (briefing, resumo com IA, linha do tempo dos agentes,
// ligações), Anotações, Interações e Datas.

import { useState } from 'react'
import { Button, DetailPage, ErrorState, Field, LoadingState, Modal, Page, PersonPicker, Tag, hueFromName, type PersonOption } from '../../../design'
import { confirm } from '../../../design/headless/confirm'
import { toast } from '../../../design/headless/toast'
import { BriefingCard } from '../components/person/BriefingCard'
import { DatesTab } from '../components/person/DatesTab'
import { InteractionsTab } from '../components/person/InteractionsTab'
import { LinksCard } from '../components/person/LinksCard'
import { MemoryTab } from '../components/person/MemoryTab'
import { NotesTab } from '../components/person/NotesTab'
import { MergeDialog } from '../components/MergeDialog'
import { useKomi } from '../context'
import { komiApi } from '../komiApi'
import { SPACE } from '../lib/kinds'
import { namesOf, nameDetail, norm } from '../lib/people'
import type { PersonTab } from '../lib/routes'
import { useLoad } from '../lib/useLoad'
import type { PersonDetail, PersonRow } from '../types'

/** O perfil completo vira o mesmo formato da lista: as abas só dependem dele. */
function rowOf(d: PersonDetail): PersonRow {
  const p = d.perfil
  return {
    id: p.id, name: p.name, nickname: p.nickname, full_name: p.full_name, relationship: p.relationship, category: p.category, context: p.context,
    city: p.city, avatar_url: p.avatar_url, birth_day: p.birth_day, birth_month: p.birth_month, birth_year: p.birth_year,
    birthday_remind_days: p.birthday_remind_days, aliases: d.aliases.map((a) => a.alias), groups: [], link_count: 0, dates: d.datas,
    finance_net: 0, last_interaction: null,
  }
}

function MergePicker({ person, onClose, onPick }: { person: PersonRow; onClose: () => void; onPick: (otherId: string) => void }) {
  const komi = useKomi()
  const [other, setOther] = useState<PersonOption | null>(null)
  const search = (q: string): PersonOption[] => {
    const n = norm(q)
    return komi.people.filter((p) => p.id !== person.id && namesOf(p).some((x) => norm(x).includes(n))).slice(0, 8).map((p) => ({ id: p.id, name: p.name, hint: nameDetail(p) || undefined, avatar: p.avatar_url }))
  }
  return (
    <Modal title={`Mesclar ${person.name} com…`} size="sm" onClose={onClose}
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" disabled={!other} onClick={() => other && onPick(other.id)}>Ver prévia</Button></>}>
      <div className="ds-stack">
        <p>Use quando duas pessoas cadastradas são a mesma. Você confere o que muda antes de confirmar.</p>
        <Field label="Mesclar com quem?">
          {(a) => <PersonPicker id={a.id} value={other ? [other] : []} onChange={(list) => setOther(list[list.length - 1] ?? null)} search={search} />}
        </Field>
      </div>
    </Modal>
  )
}

function ContactLinks({ p }: { p: PersonDetail['perfil'] }) {
  const handle = (s: string) => s.replace(/^@/, '').trim()
  const links = [
    p.phone && { href: `tel:${p.phone.replace(/\s+/g, '')}`, label: p.phone },
    p.email && { href: `mailto:${p.email}`, label: p.email },
    p.instagram && { href: `https://instagram.com/${handle(p.instagram)}`, label: `@${handle(p.instagram)}` },
    p.telegram && { href: `https://t.me/${handle(p.telegram)}`, label: `Telegram ${p.telegram}` },
  ].filter(Boolean) as { href: string; label: string }[]
  if (!links.length && !p.city) return null
  return (
    <span className="km-contacts">
      {p.city && <span>{p.city}</span>}
      {links.map((l) => <a key={l.href} href={l.href} target={l.href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer">{l.label}</a>)}
    </span>
  )
}

export function PersonDetailScreen({ id, tab }: { id: string; tab?: PersonTab }) {
  const komi = useKomi()
  const { state, retry } = useLoad(() => komiApi.get(id), [id, komi.rev])
  const [merging, setMerging] = useState<'pick' | string | null>(null)

  const back = () => komi.goto('people')
  const backBar = <Button variant="ghost" icon="back" onClick={back}>Pessoas</Button>

  if (state.status === 'loading') return <Page>{backBar}<LoadingState variant="stat" count={2} /></Page>
  if (state.status === 'error') return <Page>{backBar}<ErrorState title="Não foi possível abrir a pessoa" hint="Ela pode ter sido apagada. Tente de novo ou volte à lista." onRetry={retry} /></Page>

  const detail = state.data
  const p = detail.perfil
  const person = rowOf(detail)
  const category = komi.categories.find((c) => c.slug === p.category)?.label
  const current: PersonTab = tab ?? 'memory'
  const setTab = (t: string) => komi.goto({ view: 'people', personId: id, tab: t as PersonTab })

  const remove = async () => {
    const ok = await confirm({
      title: `Apagar ${p.name}?`,
      body: 'A pessoa vai para a lixeira, com as anotações e contatos. Os vínculos nos outros agentes ficam guardados e voltam se você desfizer.',
      confirmLabel: 'Apagar',
      danger: true,
    })
    if (!ok) return
    try {
      await komiApi.remove(id)
      komi.reload()
      komi.goto('people')
      toast(`${p.name} apagada`, { tone: 'success', undo: () => { komiApi.restore(id).then(komi.reload).catch(() => toast('Não foi possível desfazer.', { tone: 'error' })) } })
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível apagar.', { tone: 'error' })
    }
  }

  return (
    <Page>
      <DetailPage
        backLabel="Pessoas"
        onBack={back}
        title={p.name}
        subtitle={<><span className="km-detail-line">{[nameDetail(p), p.relationship].filter(Boolean).join(' · ')}</span><ContactLinks p={p} /></>}
        chips={<>{category && <Tag>{category}</Tag>}<Tag pr>{SPACE[p.context].label}</Tag></>}
        image={p.avatar_url}
        icon="person"
        hue={hueFromName(p.name)}
        actions={
          <>
            <Button variant="primary" icon="phone" onClick={() => komi.openContact({ personId: id, typedName: '', kind: 'encontro', date: komi.today, note: '', context: null })}>Registrar contato</Button>
            <Button icon="edit" onClick={() => komi.openPerson({ mode: 'edit', id })}>Editar</Button>
            <Button variant="ghost" icon="merge" onClick={() => setMerging('pick')}>Mesclar com…</Button>
            <Button variant="ghost" icon="delete" onClick={() => void remove()}>Apagar</Button>
          </>
        }
        tab={current}
        onTab={setTab}
        tabs={[
          { id: 'memory', label: 'Memória', content: <><BriefingCard personId={id} onTab={setTab} /><MemoryTab person={person} /><LinksCard person={person} /></> },
          { id: 'notes', label: 'Anotações', content: <NotesTab person={person} /> },
          { id: 'interactions', label: 'Interações', content: <InteractionsTab person={person} /> },
          { id: 'dates', label: 'Datas', content: <DatesTab detail={detail} /> },
        ]}
      />
      {merging === 'pick' && <MergePicker person={person} onClose={() => setMerging(null)} onPick={(otherId) => setMerging(otherId)} />}
      {merging && merging !== 'pick' && <MergeDialog firstId={id} secondId={merging} onClose={() => setMerging(null)} />}
    </Page>
  )
}
