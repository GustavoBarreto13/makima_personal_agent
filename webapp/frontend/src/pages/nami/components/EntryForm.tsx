// Formulário completo de lançamento (modal; vira bottom sheet no celular): gasto, entrada ou transferência.
// Abre pelo "Lançar", pelo Shift+Enter da captura rápida (já preenchido) ou para editar um lançamento.
// Só o essencial fica à vista: valor, descrição, categoria, de onde saiu, data (e parcelas).
// Observação e pessoa ficam em "Mais detalhes".

import { useEffect, useMemo, useState } from 'react'
import { addDaysISO, fmtMoney, todayISO } from '../../../design/core/format'
import { useHotkeys } from '../../../design/headless/useHotkeys'
import { Button, Chip, DatePicker, Field, Input, Modal, MoneyInput, NumberInput, PersonPicker, SegmentedControl, Select, Textarea, type PersonOption } from '../../../design'
import { komiApi } from '../../komi/komiApi'
import { useNami } from '../context'
import { applySuggestion, installmentPreview, MAX_INSTALLMENTS, validateDraftField, type DraftError, type DraftField, type EntryDraft, type EntryKind, type Source } from '../lib/entry'
import { namiApi } from '../namiApi'
import type { EntrySuggestion, Transaction } from '../types'

export interface EntryFormProps {
  initial: EntryDraft
  /** Lançamento sendo editado (null = novo). */
  editing: Transaction | null
  onClose: () => void
}

const KIND_OPTIONS: { value: EntryKind; label: string; icon: 'expense' | 'income' | 'transfer' }[] = [
  { value: 'gasto', label: 'Gasto', icon: 'expense' },
  { value: 'entrada', label: 'Entrada', icon: 'income' },
  { value: 'transferencia', label: 'Transferência', icon: 'transfer' },
]

const keyOf = (s: Source | null) => (s ? `${s.kind}:${s.id}` : '')

export function EntryForm({ initial, editing, onClose }: EntryFormProps) {
  const nami = useNami()
  const [d, setD] = useState<EntryDraft>(initial)
  const [people, setPeople] = useState<PersonOption[]>(() => (editing?.people ?? []).map((p) => ({ id: p.id, name: p.name })))
  const [more, setMore] = useState(() => !!initial.notes || (editing?.people?.length ?? 0) > 0)
  const [error, setError] = useState<DraftError | null>(null)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [suggestions, setSuggestions] = useState<EntrySuggestion[]>([])
  // O campo de parcelas guarda o TEXTO: apagar tudo para digitar "10" não pode virar "1" no meio do caminho.
  const [installmentsText, setInstallmentsText] = useState(() => String(initial.installments))

  const today = useMemo(() => todayISO(), [])
  const set = (patch: Partial<EntryDraft>) => { setD((cur) => ({ ...cur, ...patch })); setDirty(true); setError(null) }

  // Autocompletar: lançamentos parecidos que já existem (categoria e cartão da última vez).
  useEffect(() => {
    if (editing || d.kind === 'transferencia' || d.name.trim().length < 2) { setSuggestions([]); return }
    let live = true
    const t = setTimeout(() => {
      namiApi.suggestEntry(d.name.trim()).then((r) => { if (live) setSuggestions(r.suggestions.slice(0, 3)) }).catch(() => { if (live) setSuggestions([]) })
    }, 250)
    return () => { live = false; clearTimeout(t) }
  }, [d.name, d.kind, editing])

  const accounts = nami.sources.filter((s) => s.kind === 'account')
  const cards = nami.sources.filter((s) => s.kind === 'card')
  const pick = (value: string): Source | null => nami.sources.find((s) => keyOf(s) === value) ?? null
  const categories = nami.categories.filter((c) => (d.kind === 'entrada' ? c.kind === 'in' : c.kind === 'out'))
  const preview = d.valor && d.installments > 1 ? installmentPreview(d.valor, d.installments) : null

  const changeKind = (kind: EntryKind) => {
    const keepsSource = kind === 'gasto' || d.source?.kind === 'account'
    setInstallmentsText('1')
    set({ kind, categoria: '', installments: 1, destination: null, source: keepsSource ? d.source : nami.defaultSource?.kind === 'account' ? nami.defaultSource : null })
  }

  const save = async () => {
    const draft: EntryDraft = { ...d, personIds: people.map((p) => p.id) }
    const err = validateDraftField(draft)
    if (err) { setError(err); return }
    setSaving(true)
    try {
      await nami.save(draft, editing)
      setDirty(false)
      onClose()
    } catch (e) {
      setError({ field: 'valor', message: e instanceof Error ? e.message : 'Não foi possível salvar. Tente de novo.' })
    } finally {
      setSaving(false)
    }
  }
  useHotkeys([{ keys: 'mod+enter', global: true, handler: (e) => { e.preventDefault(); void save() } }])

  const title = editing ? 'Editar lançamento' : d.kind === 'transferencia' ? 'Nova transferência' : d.kind === 'entrada' ? 'Nova entrada' : 'Novo gasto'
  const isTransfer = d.kind === 'transferencia'
  const err = (field: DraftField): string | null => (error?.field === field ? error.message : null)

  return (
    <Modal
      title={title}
      onClose={onClose}
      dirty={dirty}
      footer={
        <>
          {editing && <Button variant="ghost" icon="delete" onClick={() => { void nami.remove(editing).then((deleted) => { if (deleted) { setDirty(false); onClose() } }) }} disabled={saving}>Excluir</Button>}
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={() => void save()} disabled={saving}>{saving ? 'Salvando…' : editing ? 'Salvar alterações' : 'Salvar'}</Button>
        </>
      }
    >
      <SegmentedControl
        label="Tipo de lançamento"
        value={d.kind}
        onChange={changeKind}
        options={KIND_OPTIONS.filter((o) => !editing || o.value !== 'transferencia').map((o) => ({ value: o.value, label: o.label, icon: o.icon }))}
      />

      <Field label="Valor" error={err('valor')}>
        {(a) => <MoneyInput {...a} value={d.valor} onChange={(valor) => set({ valor })} />}
      </Field>

      {!isTransfer && (
        <Field label="Descrição" error={err('name')}>
          {(a) => <Input {...a} data-autofocus="" value={d.name} placeholder={d.kind === 'entrada' ? 'Ex.: salário, freela' : 'Ex.: mercado, uber, ifood'} autoComplete="off" onChange={(e) => set({ name: e.target.value })} />}
        </Field>
      )}
      {suggestions.length > 0 && !isTransfer && (
        <div className="nm-suggest" role="group" aria-label="Lançamentos parecidos">
          <span className="ds-hint">Parecido com:</span>
          {suggestions.map((s) => (
            <Chip key={`${s.name}-${s.categoria}`} onClick={() => { setD((cur) => applySuggestion({ ...cur, valor: cur.valor ?? s.valor }, [s], nami.sources)); setDirty(true) }}>
              {s.name} · {s.categoria} · {s.conta}
            </Chip>
          ))}
        </div>
      )}

      {isTransfer ? (
        <div className="ds-cols2" style={{ gap: 12 }}>
          <Field label="De (conta)" error={err('source')}>
            {(a) => (
              <Select {...a} value={keyOf(d.source)} onChange={(e) => set({ source: pick(e.target.value) })}>
                <option value="">Escolha…</option>
                {accounts.map((s) => <option key={s.id} value={keyOf(s)}>{s.name}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Para" hint="Escolher um cartão paga a fatura dele." error={err('destination')}>
            {(a) => (
              <Select {...a} value={keyOf(d.destination)} onChange={(e) => set({ destination: pick(e.target.value) })}>
                <option value="">Escolha…</option>
                <optgroup label="Contas">{accounts.filter((s) => s.id !== d.source?.id).map((s) => <option key={s.id} value={keyOf(s)}>{s.name}</option>)}</optgroup>
                {cards.length > 0 && <optgroup label="Cartões (pagar fatura)">{cards.map((s) => <option key={s.id} value={keyOf(s)}>{s.name}</option>)}</optgroup>}
              </Select>
            )}
          </Field>
        </div>
      ) : (
        <div className="ds-cols2" style={{ gap: 12 }}>
          <Field label={d.kind === 'entrada' ? 'Conta que recebeu' : 'Saiu de'} error={err('source')}>
            {(a) => (
              <Select {...a} value={keyOf(d.source)} onChange={(e) => set({ source: pick(e.target.value) })}>
                <option value="">Escolha…</option>
                <optgroup label="Contas">{accounts.map((s) => <option key={s.id} value={keyOf(s)}>{s.name}</option>)}</optgroup>
                {d.kind === 'gasto' && cards.length > 0 && <optgroup label="Cartões">{cards.map((s) => <option key={s.id} value={keyOf(s)}>{s.name}</option>)}</optgroup>}
              </Select>
            )}
          </Field>
          <Field label="Categoria" hint={d.categoria ? undefined : 'Sem escolher, vai para Inbox.'}>
            {(a) => (
              <Select {...a} value={d.categoria} onChange={(e) => set({ categoria: e.target.value })}>
                <option value="">{d.kind === 'entrada' ? 'Receita' : 'Automática (Inbox)'}</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            )}
          </Field>
        </div>
      )}

      <Field label="Data">
        {(a) => (
          <div className="nm-date">
            <DatePicker {...a} value={d.date} onChange={(date) => set({ date })} />
            <Chip on={d.date === today} onClick={() => set({ date: today })}>Hoje</Chip>
            <Chip on={d.date === addDaysISO(today, -1)} onClick={() => set({ date: addDaysISO(today, -1) })}>Ontem</Chip>
          </div>
        )}
      </Field>

      {d.kind === 'gasto' && !editing && (
        <Field
          label="Parcelas"
          hint={preview ? `${d.installments}x de ${fmtMoney(preview.each)} — total ${fmtMoney(d.valor ?? 0)}${preview.first !== preview.each ? ` (1ª de ${fmtMoney(preview.first)})` : ''}` : 'O valor acima é o total da compra. 1 = à vista.'}
          error={err('installments')}
        >
          {(a) => (
            <NumberInput
              {...a}
              min={1}
              max={MAX_INSTALLMENTS}
              step={1}
              value={installmentsText}
              onChange={(e) => {
                setInstallmentsText(e.target.value)
                const n = Math.round(Number(e.target.value))
                if (Number.isFinite(n) && n >= 1) set({ installments: Math.min(n, MAX_INSTALLMENTS) })
              }}
              onBlur={() => setInstallmentsText(String(d.installments))}
            />
          )}
        </Field>
      )}

      <div>
        <Button variant="ghost" size="sm" icon={more ? 'up' : 'down'} onClick={() => setMore((v) => !v)} aria-expanded={more}>Mais detalhes</Button>
      </div>
      {more && (
        <>
          <Field label="Observação">{(a) => <Textarea {...a} value={d.notes} placeholder="Algo para lembrar depois" onChange={(e) => set({ notes: e.target.value })} />}</Field>
          {!isTransfer && d.installments <= 1 && (
            <Field label="Pessoa" hint="Vincule a quem esse lançamento se refere (Komi).">
              {(a) => (
                <PersonPicker
                  id={a.id}
                  value={people}
                  onChange={(p) => { setPeople(p); setDirty(true) }}
                  search={async (q) => (await komiApi.search(q)).matches.map((m) => ({ id: m.id, name: m.name, hint: m.relationship }))}
                  onCreate={async (name) => ({ id: (await komiApi.create({ name })).id, name })}
                />
              )}
            </Field>
          )}
        </>
      )}
    </Modal>
  )
}
