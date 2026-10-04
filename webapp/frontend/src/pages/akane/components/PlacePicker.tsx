// Onde assistiu: campo de busca com lista (cinema ou streaming). Digita-se o nome; aparecem os locais já
// cadastrados e, se o nome é novo, "Cadastrar “X” como: Cinema | Streaming", que cria na hora e já seleciona.
// Mesmo visual do "Com quem" (classes do combo do DS). Usado ao logar um filme e ao editar uma sessão.

import { useMemo, useRef, useState } from 'react'
import { Button, Icon } from '../../../design'
import { useDismissable } from '../../../design/headless/overlay'
import { akaneApi } from '../akaneApi'
import { useAkane } from '../context'
import { norm } from '../lib/log'
import type { WatchLocation } from '../types'

type Kind = WatchLocation['kind']
const kindIcon = (k: Kind) => (k === 'cinema' ? 'cinema' : 'couch')
const kindLabel = (k: Kind) => (k === 'cinema' ? 'Cinema' : 'Streaming')

export function PlacePicker({ value, onChange, id, initialQuery = '', known = [] }: {
  /** Id do local escolhido (null = nenhum). */
  value: string | null
  onChange: (id: string | null) => void
  id?: string
  /** Texto já digitado ao abrir (ex.: o "@local" que a linha rápida não reconheceu): a lista abre com ele. */
  initialQuery?: string
  /** Locais que o chamador já conhece (ex.: o da sessão em edição), para o chip aparecer mesmo se a lista do shell ainda não chegou. */
  known?: WatchLocation[]
}) {
  const akane = useAkane()
  const [q, setQ] = useState(initialQuery)
  const [open, setOpen] = useState(initialQuery.trim().length > 0)
  const [busy, setBusy] = useState<Kind | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Local recém-criado: guardado aqui até a lista do shell (recarregada) chegar, para o chip não piscar.
  const [created, setCreated] = useState<WatchLocation[]>([])
  const ref = useRef<HTMLDivElement>(null)
  useDismissable(ref, () => setOpen(false), open)

  const all = useMemo(
    () => {
      const seen = new Set(akane.locations.map((l) => l.id))
      return [...akane.locations, ...[...known, ...created].filter((l) => !seen.has(l.id) && seen.add(l.id))]
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [akane.locations, created, known.map((k) => k.id).join()],
  )
  const selected = all.find((l) => l.id === value) ?? null
  const wanted = norm(q)
  const matches = all.filter((l) => !wanted || norm(l.name).includes(wanted))
  const canCreate = wanted.length > 0 && !all.some((l) => norm(l.name) === wanted)

  const choose = (loc: WatchLocation) => { onChange(loc.id); setQ(''); setOpen(false); setError(null) }

  const create = async (kind: Kind) => {
    setBusy(kind)
    setError(null)
    try {
      const { location } = await akaneApi.createWatchLocation(q.trim(), kind)
      setCreated((cur) => [...cur, location])
      akane.reload()
      choose(location)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível cadastrar o local. Tente de novo.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="ds-combo" ref={ref}>
      <div className="ds-taginput">
        {selected && (
          <span className="ds-fchip">
            <Icon name={kindIcon(selected.kind)} size={11} />
            {selected.name}
            <button type="button" aria-label={`Remover ${selected.name}`} onClick={() => onChange(null)}><Icon name="close" size={10} /></button>
          </span>
        )}
        <input
          id={id}
          value={q}
          placeholder={selected ? 'Trocar local…' : 'Buscar ou cadastrar local…'}
          aria-label="Buscar ou cadastrar local"
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onChange={(e) => { setQ(e.target.value); setOpen(true); setError(null) }}
        />
      </div>
      {open && (
        <div className="ds-combo-list" role="listbox" aria-label="Locais">
          {matches.length === 0 && !canCreate && <p className="ds-hint ax-place-hint">Nenhum local cadastrado ainda. Digite um nome para cadastrar o primeiro.</p>}
          {matches.map((l) => (
            <button key={l.id} type="button" role="option" aria-selected={l.id === value} className="ds-combo-item" onClick={() => choose(l)}>
              <Icon name={kindIcon(l.kind)} size={16} />
              <span><b>{l.name}</b><small>{kindLabel(l.kind)}</small></span>
              {l.id === value && <Icon name="check" size={14} />}
            </button>
          ))}
          {canCreate && (
            <div className="ax-place-new">
              <p className="ds-hint">Cadastrar “{q.trim()}” como:</p>
              <div className="ds-inline">
                <Button size="sm" icon="cinema" disabled={busy !== null} onClick={() => void create('cinema')}>Cinema</Button>
                <Button size="sm" icon="couch" disabled={busy !== null} onClick={() => void create('streaming')}>Streaming</Button>
              </div>
            </div>
          )}
        </div>
      )}
      {error && <p className="ds-errmsg" role="alert">{error}</p>}
    </div>
  )
}
