// Detalhe de um evento do calendário (popover ancorado onde se clicou) e o menu de contexto (clique direito).
// Tarefa: título editável, concluir/reabrir, abrir no painel, duração (regrava o bloco), duplicar e excluir.
// Evento do Google (calendário com escrita): título, duração, cor própria, duplicar e excluir. Itens dos outros agentes
// são só leitura, com o atalho para abrir na origem. Excluir sempre confirma.

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Button, Icon, Menu, Select, confirm, toast, type MenuItem } from '../../../design'
import { fmtDate } from '../../../design/core/format'
import { gcalCalendarId, kaguyaApi } from '../api'
import { useKaguya } from '../context'
import * as act from '../lib/actions'
import { isEditable, isGcalId, localISO, minToLabel, resolveColor, timeToMin } from '../lib/calendar'
import { CAL_SWATCHES } from '../lib/calSwatches'
import { DURATIONS, snapDuration } from '../lib/durations'
import { mapsLinkFor } from '../lib/maps'
import type { CalEvent, Calendar } from '../types'

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const reason = (e: unknown, fallback: string) => (e instanceof Error && e.message && !/^HTTP \d+$/.test(e.message) ? e.message : fallback)

interface Common { ev: CalEvent; cals: Calendar[]; onClose: () => void; onRefresh: () => void }

/** Conclui/reabre a tarefa do evento. Busca a tarefa de verdade: com subtarefas abertas, a ação pede confirmação. */
async function toggleTaskOf(ev: CalEvent, k: ReturnType<typeof useKaguya>): Promise<void> {
  if (ev.taskId) await act.toggleComplete({ reload: k.reload }, await kaguyaApi.getTask(ev.taskId))
}

/** Duplicar: tarefa (com subtarefas, pelo servidor) ou evento do Google no mesmo horário. */
async function duplicate(ev: CalEvent, k: ReturnType<typeof useKaguya>): Promise<void> {
  if (ev.cal === 'kaguya' && ev.taskId) {
    const id = await act.duplicate({ reload: k.reload }, await kaguyaApi.getTask(ev.taskId))
    if (id) k.openTask(id)
  } else if (isGcalId(ev.cal)) {
    await kaguyaApi.createCalendarEvent({ title: `${ev.title} (cópia)`, day: ev.day, start: ev.start ?? undefined, end: ev.end ?? undefined, allDay: ev.allDay })
    toast('Evento duplicado.', { tone: 'success' })
  }
}

async function remove(ev: CalEvent): Promise<boolean> {
  const ok = await confirm({ title: `Excluir “${ev.title}”?`, body: ev.cal === 'kaguya' ? 'A tarefa vai para a lixeira — dá para restaurar de lá.' : 'O evento será apagado do Google Calendar.', confirmLabel: 'Excluir', danger: true })
  if (!ok) return false
  if (ev.cal === 'kaguya' && ev.taskId) await kaguyaApi.remove(ev.taskId)
  else if (isGcalId(ev.cal)) await kaguyaApi.deleteCalendarEvent(ev.id, gcalCalendarId(ev.cal))
  toast('Excluído.', { tone: 'success' })
  return true
}

export function EventPopover({ ev, cals, pos, onClose, onRefresh }: Common & { pos: { x: number; y: number } }) {
  const k = useKaguya()
  const cal = cals.find((c) => c.id === ev.cal)
  const editable = isEditable(ev, cals)
  const [title, setTitle] = useState(ev.title)
  const [busy, setBusy] = useState(false)
  const [colors, setColors] = useState(false)
  const initial = ev.start && ev.end ? snapDuration(timeToMin(ev.end) - timeToMin(ev.start)) : 0
  const [duration, setDuration] = useState(initial)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  useEffect(() => { ref.current?.querySelector<HTMLElement>('input, button')?.focus() }, [])

  const run = async (fn: () => Promise<unknown>, fallback: string) => {
    setBusy(true)
    try { await fn(); onRefresh() } catch (e) { toast(reason(e, fallback), { tone: 'error' }) } finally { setBusy(false) }
  }

  const saveTitle = () => {
    if (!editable || title.trim() === ev.title || !title.trim()) { setTitle(ev.title); return }
    void run(async () => {
      if (ev.taskId) await kaguyaApi.updateTask(ev.taskId, { title: title.trim() })
      else await kaguyaApi.updateCalendarEvent(ev.id, { title: title.trim(), calendar_id: gcalCalendarId(ev.cal) })
    }, 'Não foi possível renomear.')
  }

  const changeDuration = (min: number) => {
    setDuration(min)
    if (!ev.start || !editable || min <= 0) return
    const start = timeToMin(ev.start)
    const s = localISO(ev.day, start)
    const e = localISO(ev.day, start + min)
    void run(async () => {
      if (ev.taskId) await kaguyaApi.setTimeBlock(ev.taskId, { start_at: s, end_at: e })
      else await kaguyaApi.updateCalendarEvent(ev.id, { start: s, end: e, day: ev.day, calendar_id: gcalCalendarId(ev.cal) })
    }, 'Não foi possível mudar a duração.')
    // Se falhar, a lista recarrega com a duração real (onRefresh) — o seletor volta junto.
  }

  const color = (c: string | null) => {
    setColors(false)
    void run(() => kaguyaApi.updateCalendarEvent(ev.id, { color: c, calendar_id: gcalCalendarId(ev.cal) }), 'Não foi possível mudar a cor.')
  }

  const left = clamp(pos.x, 12, window.innerWidth - 292)
  const top = clamp(pos.y, 12, window.innerHeight - 260)
  const time = ev.allDay || !ev.start ? 'Dia inteiro' : `${minToLabel(timeToMin(ev.start))} – ${minToLabel(timeToMin(ev.end ?? ev.start) + (ev.end ? 0 : 30))}`

  return (
    <>
      <div className="kn-pop-scrim" onClick={onClose} aria-hidden="true" />
      <div ref={ref} className="kn-pop" style={{ '--kn-cc': resolveColor(ev, cals), left, top } as CSSProperties} role="dialog" aria-label={`Evento: ${ev.title}`}>
        <div className="kn-pop-bar" />
        <div className="kn-pop-body">
          {editable
            ? <input className="ds-input kn-pop-title" aria-label="Título do evento" value={title} disabled={busy} onChange={(e) => setTitle(e.target.value)} onBlur={saveTitle} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
            : <b className="kn-pop-title">{ev.title}</b>}
          <p className="kn-pop-meta"><Icon name="clock" size={13} />{fmtDate(ev.day)} · {time}{ev.recurring && <> · <Icon name="recurring" size={12} /> repete</>}</p>
          {editable && !ev.allDay && ev.start && (
            <Select aria-label="Duração" value={duration} disabled={busy} onChange={(e) => changeDuration(Number(e.target.value))}>
              {DURATIONS.filter((d) => d.v > 0).map((d) => <option key={d.v} value={d.v}>{d.label}</option>)}
            </Select>
          )}
          {ev.loc && <p className="kn-pop-meta"><Icon name="place" size={13} /><a href={mapsLinkFor(ev.loc)} target="_blank" rel="noreferrer">{ev.loc}</a></p>}
          <p className="kn-pop-meta"><i className="kn-pop-dot" />{cal?.name ?? ev.cal}</p>

          {colors && (
            <div className="kn-swatches" role="listbox" aria-label="Cor do evento">
              {CAL_SWATCHES.map((s, i) => <button key={s} type="button" role="option" aria-selected={ev.color === s} aria-label={`Cor ${i + 1}`} className={`kn-sw-btn${ev.color === s ? ' kn-on' : ''}`} style={{ '--kn-cc': s } as CSSProperties} onClick={() => color(s)} />)}
              <Button size="sm" variant="ghost" onClick={() => color(null)}>Cor do calendário</Button>
            </div>
          )}

          <div className="kn-pop-actions">
            {ev.taskId && <Button size="sm" variant="primary" icon="detail-panel" onClick={() => { k.openTask(ev.taskId); onClose() }}>Abrir tarefa</Button>}
            {ev.taskId && <Button size="sm" icon={ev.done ? 'undo' : 'check'} disabled={busy} onClick={() => void run(() => toggleTaskOf(ev, k), 'Não foi possível concluir.')}>{ev.done ? 'Reabrir' : 'Concluir'}</Button>}
            {!editable && ev.deepLink && <Button size="sm" variant="primary" icon="link" onClick={() => { window.location.href = ev.deepLink! }}>Abrir em {cal?.name ?? ev.cal}</Button>}
            {editable && isGcalId(ev.cal) && <Button size="sm" icon="palette" aria-pressed={colors} onClick={() => setColors((v) => !v)}>Cor</Button>}
            {editable && <Button size="sm" icon="copy" disabled={busy} onClick={() => void run(() => duplicate(ev, k), 'Não foi possível duplicar.')}>Duplicar</Button>}
            {editable && <Button size="sm" variant="danger" icon="delete" disabled={busy} onClick={() => void (async () => { try { if (await remove(ev)) { onClose(); onRefresh() } } catch (e) { toast(reason(e, 'Não foi possível excluir.'), { tone: 'error' }) } })()}>Excluir</Button>}
          </div>
        </div>
      </div>
    </>
  )
}

/** Menu do clique direito: as ações mais usadas sem abrir o detalhe. */
export function EventMenu({ ev, cals, pos, onClose, onRefresh, onOpen }: Common & { pos: { x: number; y: number }; onOpen: () => void }) {
  const k = useKaguya()
  const editable = isEditable(ev, cals)
  const cal = cals.find((c) => c.id === ev.cal)
  const guard = (fn: () => Promise<unknown>, fallback: string) => () => { void fn().then(onRefresh).catch((e) => toast(reason(e, fallback), { tone: 'error' })) }
  const items: MenuItem[] = [{ id: 'open', label: 'Ver detalhes', onSelect: onOpen }]
  if (ev.taskId) {
    items.push({ id: 'panel', label: 'Abrir tarefa', onSelect: () => k.openTask(ev.taskId) })
    items.push({ id: 'done', label: ev.done ? 'Reabrir' : 'Concluir', onSelect: guard(() => toggleTaskOf(ev, k), 'Não foi possível concluir.') })
  }
  if (editable) {
    items.push({ id: 'dup', label: 'Duplicar', onSelect: guard(() => duplicate(ev, k), 'Não foi possível duplicar.') })
    items.push({ id: 'del', label: 'Excluir', onSelect: guard(() => remove(ev), 'Não foi possível excluir.') })
  } else if (ev.deepLink) items.push({ id: 'link', label: `Abrir em ${cal?.name ?? ev.cal}`, onSelect: () => { window.location.href = ev.deepLink! } })
  return (
    <>
      <div className="kn-pop-scrim" onClick={onClose} aria-hidden="true" />
      <div className="kn-ctx" style={{ left: clamp(pos.x, 8, window.innerWidth - 220), top: clamp(pos.y, 8, window.innerHeight - 200) }}>
        <Menu items={items} onClose={onClose} label={`Ações de ${ev.title}`} className="kn-ctx-menu" />
      </div>
    </>
  )
}
