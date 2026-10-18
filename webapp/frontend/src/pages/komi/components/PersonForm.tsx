// Formulário de pessoa (cadastrar e editar) no Design System. Três nomes (Nome, Apelido, Nome completo),
// relacionamento da lista configurável, espaço (pessoal / trabalho / ambos), aniversário sempre presente
// (dia, mês, ano opcional e lembrete) e, em "Mais detalhes", contatos, cidade, outras formas de chamar e,
// no cadastro, datas importantes. Ctrl+Enter salva.

import { useRef, useState } from 'react'
import {
  Avatar, Button, DatePicker, ErrorState, Field, IconButton, Input, LoadingState, Modal, NumberInput, SegmentedControl, Select, TagInput, Toggle,
} from '../../../design'
import { toast } from '../../../design/headless/toast'
import { MONTHS_LONG } from '../../../design/core/format'
import { useKomi, type PersonFormOpen } from '../context'
import { komiApi } from '../komiApi'
import {
  aliasChanges, conflictField, draftFromDetail, emptyPerson, REMIND_OPTIONS, toCreate, toPatch, validatePerson, type DateDraft, type FormError, type PersonDraft,
} from '../lib/personForm'
import { SPACE } from '../lib/kinds'
import { useLoad } from '../lib/useLoad'
import type { PersonDetail, Space } from '../types'

export function PersonForm({ open, onClose }: { open: PersonFormOpen; onClose: () => void }) {
  const komi = useKomi()
  // Edição carrega o perfil completo (apelidos com id); o cadastro começa em branco.
  const detail = useLoad(async (): Promise<PersonDetail | null> => (open.mode === 'edit' ? komiApi.get(open.id) : null), [open.mode === 'edit' ? open.id : ''])

  if (open.mode === 'edit' && detail.state.status === 'loading') return <Modal title="Editar pessoa" onClose={onClose}><LoadingState variant="row" count={4} /></Modal>
  if (detail.state.status === 'error') return <Modal title="Editar pessoa" onClose={onClose}><ErrorState onRetry={detail.retry} /></Modal>

  const loaded = detail.state.status === 'ok' ? detail.state.data : null
  const defaultCategory = komi.categories.find((c) => c.slug === 'outros')?.slug ?? komi.categories[0]?.slug ?? 'outros'
  const startContext: Space = komi.prefs.space === 'work' ? 'work' : 'personal'
  const initial = loaded ? draftFromDetail(loaded) : emptyPerson(open.mode === 'create' ? open.name ?? '' : '', startContext, defaultCategory)
  return <Form key={loaded?.perfil.id ?? 'new'} initial={initial} editingId={loaded?.perfil.id ?? null} aliasIds={loaded ? Object.fromEntries(loaded.aliases.map((a) => [a.alias.trim().toLowerCase(), a.id])) : {}} onClose={onClose} />
}

function Form({ initial, editingId, aliasIds, onClose }: { initial: PersonDraft; editingId: string | null; aliasIds: Record<string, number>; onClose: () => void }) {
  const komi = useKomi()
  const [d, setD] = useState<PersonDraft>(initial)
  const [error, setError] = useState<FormError | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [more, setMore] = useState(() => !!(initial.phone || initial.email || initial.instagram || initial.telegram || initial.city || initial.aliases.length))
  const fileRef = useRef<HTMLInputElement>(null)

  const set = (patch: Partial<PersonDraft>) => { setD((cur) => ({ ...cur, ...patch })); setError(null) }
  const err = (field: FormError['field']) => (error?.field === field ? error.message : null)
  const dirty = JSON.stringify(d) !== JSON.stringify(initial)
  const thisYear = Number(komi.today.slice(0, 4))

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    try {
      const { url } = await komiApi.uploadAvatar(file)
      set({ avatar_url: url })
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível enviar a foto.', { tone: 'error' })
    }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const submit = async () => {
    const bad = validatePerson(d, thisYear)
    if (bad) { setError(bad); return }
    setSaving(true)
    try {
      let id = editingId
      if (id) {
        const patch = toPatch(initial, d)
        if (Object.keys(patch).length) await komiApi.update(id, patch)
        const { add, remove } = aliasChanges(initial.aliases, d.aliases)
        for (const a of remove) { const aid = aliasIds[a.trim().toLowerCase()]; if (aid) await komiApi.removeAlias(id, aid) }
        for (const a of add) await komiApi.addAlias(id, a.trim())
      } else {
        id = (await komiApi.create(toCreate(d))).id
        for (const a of d.aliases) await komiApi.addAlias(id, a.trim()).catch(() => undefined)
        for (const x of d.dates.filter((x) => x.label.trim() && x.date)) {
          await komiApi.addDate(id, { label: x.label.trim(), date: x.date, recurring: x.recurring, remind_days_before: x.remind }).catch(() => undefined)
        }
      }
      komi.reload()
      toast(editingId ? `${d.name.trim()} atualizada` : `${d.name.trim()} cadastrada`, { tone: 'success' })
      onClose()
      if (!editingId) komi.goto({ view: 'people', personId: id })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Não foi possível salvar. Tente de novo.'
      // Conflito de nome ou apelido aparece no próprio campo; o resto fica no rodapé do formulário.
      setError(/já é o nome ou apelido/.test(message) ? { field: conflictField(message, d), message } : { field: 'form', message })
      setSaving(false)
    }
  }

  const setDate = (i: number, patch: Partial<DateDraft>) => set({ dates: d.dates.map((x, j) => (j === i ? { ...x, ...patch } : x)) })

  return (
    <Modal
      title={editingId ? 'Editar pessoa' : 'Nova pessoa'}
      size="lg"
      dirty={dirty}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" icon="check" kbd="Ctrl+↵" disabled={saving || uploading} onClick={() => void submit()}>{editingId ? 'Salvar' : 'Cadastrar'}</Button>
        </>
      }
    >
      <div className="ds-stack" onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); void submit() } }}>
        <div className="km-photo">
          <Avatar name={d.name || 'Nova pessoa'} src={d.avatar_url || null} size={64} />
          <div className="ds-inline">
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden aria-label="Escolher foto" onChange={(e) => void pickPhoto(e.target.files?.[0])} />
            <Button size="sm" icon="upload" disabled={uploading} onClick={() => fileRef.current?.click()}>{d.avatar_url ? 'Trocar foto' : 'Adicionar foto'}</Button>
            {d.avatar_url && <Button size="sm" variant="ghost" onClick={() => set({ avatar_url: '' })}>Remover</Button>}
          </div>
        </div>

        <Field label="Nome" error={err('name')} hint="Como você chama a pessoa. É o nome que aparece em todo lugar.">
          {(a) => <Input {...a} value={d.name} autoFocus autoComplete="off" onChange={(e) => set({ name: e.target.value })} />}
        </Field>
        <div className="ds-cols2">
          <Field label="Apelido" error={err('nickname')} hint="Também acha a pessoa nos outros agentes (@Bia).">
            {(a) => <Input {...a} value={d.nickname} autoComplete="off" onChange={(e) => set({ nickname: e.target.value })} />}
          </Field>
          <Field label="Nome completo">
            {(a) => <Input {...a} value={d.full_name} autoComplete="off" onChange={(e) => set({ full_name: e.target.value })} />}
          </Field>
        </div>

        <div className="ds-cols2">
          <Field label="Relacionamento">
            {(a) => (
              <Select {...a} value={d.category} onChange={(e) => set({ category: e.target.value })}>
                {komi.categories.map((c) => <option key={c.slug} value={c.slug}>{c.label}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Quem é para você" hint="Opcional. Ex.: mãe, colega de equipe.">
            {(a) => <Input {...a} value={d.relationship} autoComplete="off" onChange={(e) => set({ relationship: e.target.value })} />}
          </Field>
        </div>

        <Field label="Espaço" hint={d.context === 'both' ? 'A memória, as anotações e os contatos continuam separados em trabalho e pessoal.' : 'Define onde a pessoa aparece (Kaguya, filtros).'}>
          {() => (
            <SegmentedControl<Space>
              label="Espaço da pessoa"
              value={d.context}
              options={(['personal', 'work', 'both'] as const).map((v) => ({ value: v, label: SPACE[v].label, icon: SPACE[v].icon }))}
              onChange={(context) => set({ context })}
            />
          )}
        </Field>

        <fieldset className="km-birthday">
          <legend>Aniversário</legend>
          <div className="km-birthday-row">
            <Field label="Dia" error={err('birthday')}>
              {(a) => <NumberInput {...a} min={1} max={31} value={d.birth_day ?? ''} onChange={(e) => set({ birth_day: e.target.value === '' ? null : Math.round(Number(e.target.value)) })} />}
            </Field>
            <Field label="Mês">
              {(a) => (
                <Select {...a} value={d.birth_month ?? ''} onChange={(e) => set({ birth_month: e.target.value === '' ? null : Number(e.target.value) })}>
                  <option value="">—</option>
                  {MONTHS_LONG.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </Select>
              )}
            </Field>
            <Field label="Ano" hint="Opcional: sem ele não há idade.">
              {(a) => <NumberInput {...a} min={1900} max={thisYear} value={d.birth_year ?? ''} onChange={(e) => set({ birth_year: e.target.value === '' ? null : Math.round(Number(e.target.value)) })} />}
            </Field>
            <Field label="Lembrar">
              {(a) => (
                <Select {...a} value={d.birthday_remind_days} onChange={(e) => set({ birthday_remind_days: Number(e.target.value) })}>
                  {REMIND_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              )}
            </Field>
          </div>
        </fieldset>

        <div>
          <Button variant="ghost" size="sm" icon={more ? 'up' : 'down'} aria-expanded={more} onClick={() => setMore((m) => !m)}>Mais detalhes</Button>
        </div>
        {more && (
          <div className="ds-stack">
            <div className="ds-cols2">
              <Field label="Telefone">{(a) => <Input {...a} type="tel" value={d.phone} onChange={(e) => set({ phone: e.target.value })} />}</Field>
              <Field label="E-mail">{(a) => <Input {...a} type="email" value={d.email} onChange={(e) => set({ email: e.target.value })} />}</Field>
              <Field label="Instagram">{(a) => <Input {...a} value={d.instagram} onChange={(e) => set({ instagram: e.target.value })} />}</Field>
              <Field label="Telegram">{(a) => <Input {...a} value={d.telegram} onChange={(e) => set({ telegram: e.target.value })} />}</Field>
            </div>
            <Field label="Cidade">{(a) => <Input {...a} value={d.city} onChange={(e) => set({ city: e.target.value })} />}</Field>
            <Field label="Outras formas de chamar" hint="Só servem para a busca achar a pessoa. Enter para adicionar.">
              {(a) => <TagInput id={a.id} value={d.aliases} onChange={(aliases) => set({ aliases })} placeholder="Ex.: Betinha" />}
            </Field>

            {!editingId && (
              <div className="ds-stack">
                <span className="km-label">Outras datas importantes</span>
                {d.dates.map((x, i) => (
                  <div className="km-daterow" key={i}>
                    <Input aria-label="O que é a data" placeholder="Casamento, formatura…" value={x.label} onChange={(e) => setDate(i, { label: e.target.value })} />
                    <DatePicker value={x.date} onChange={(date) => setDate(i, { date })} />
                    <Select aria-label="Lembrar" value={x.remind} onChange={(e) => setDate(i, { remind: Number(e.target.value) })}>
                      {REMIND_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </Select>
                    <Toggle checked={x.recurring} label="Repete todo ano" onChange={(recurring) => setDate(i, { recurring })} />
                    <IconButton icon="close" label="Remover data" size={16} onClick={() => set({ dates: d.dates.filter((_, j) => j !== i) })} />
                  </div>
                ))}
                <div><Button size="sm" icon="add" onClick={() => set({ dates: [...d.dates, { label: '', date: komi.today, recurring: true, remind: 1 }] })}>Adicionar data importante</Button></div>
              </div>
            )}
            {editingId && <p className="ds-hint">As outras datas importantes ficam na aba Datas da pessoa.</p>}
          </div>
        )}

        {error?.field === 'form' && <p className="ds-errmsg" role="alert">{error.message}</p>}
      </div>
    </Modal>
  )
}
