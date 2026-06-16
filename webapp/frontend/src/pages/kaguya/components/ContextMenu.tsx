// ContextMenu — menu de contexto do Calendar Hub (fatia 019, T026).
// Estrutura do handoff (spec 019):
//   .cal-pop-scrim → overlay transparente; clique = fecha
//   .cal-ctx       → container com style {--cc, left, top}
//     .cal-ctx-item  → item de menu (hover: fundo kg-tint)
//     .cal-ctx-item.danger → item destructivo (texto vermelho no hover)
//     .cal-ctx-sep   → separador horizontal
//     .cal-ctx-row   → linha horizontal de .cal-sw (swatches de cor)
//
// Fontes editáveis (kaguya/gcal): duplicar, recolorir (gcal), excluir.
// Fontes cross-agent: apenas deep-link.

import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { CalEvent, Calendar } from '../types'
import { Icon } from '../ui/Icons'
import { kaguyaApi, CAL_SWATCHES } from '../kaguyaApi'

// ── Props ────────────────────────────────────────────────────────────────────

interface ContextMenuProps {
  ev: CalEvent
  cals: Calendar[]
  pos: { x: number; y: number }
  onClose: () => void
  onRefresh?: () => void
}

// Fontes que o menu pode modificar.
const EDITABLE_SOURCES = new Set(['kaguya', 'gcal'])

// Clamp numérico dentro de [min, max].
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

// ── Componente ───────────────────────────────────────────────────────────────

export function ContextMenu({ ev, cals, pos, onClose, onRefresh }: ContextMenuProps) {
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  const isEditable = EDITABLE_SOURCES.has(ev.cal)
  const cal = cals.find((c) => c.id === ev.cal)
  const calName = cal?.name ?? ev.cal
  // --cc: cor do evento ou do calendário (para a linha de swatches usar var(--cc) como indicador)
  const calColor = ev.color || cal?.color || 'var(--kg)'

  // ── Fecha ao pressionar Escape ────────────────────────────────────────────
  useEffect(() => {
    const keyHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', keyHandler)
    return () => document.removeEventListener('keydown', keyHandler)
  }, [onClose])

  // ── Posição clamped à viewport ────────────────────────────────────────────
  const PAD    = 8
  const MENU_W = 220
  const MENU_H = 180
  const left = clamp(pos.x, PAD, window.innerWidth - MENU_W - PAD)
  const top  = clamp(pos.y, PAD, window.innerHeight - MENU_H - PAD)

  // ── Handlers ─────────────────────────────────────────────────────────────

  // Aplica cor customizada ao evento (gcal) ou reset (null = cor do calendário)
  async function applyColor(color: string | null) {
    onClose()
    if (!isEditable) return
    try {
      if (ev.cal === 'gcal') {
        await kaguyaApi.updateCalendarEvent(ev.id, { color })
        onRefresh?.()
      }
      // kaguya: sem suporte de cor por evento por ora
    } catch { /* ignora */ }
  }

  // Duplica o evento (cria cópia com mesmo título + datas)
  async function handleDuplicate() {
    onClose()
    if (!isEditable) return
    setSaving(true)
    try {
      if (ev.cal === 'kaguya' && ev.taskId) {
        await kaguyaApi.createTask({
          title: `${ev.title} (cópia)`,
          due_date: ev.day,
        })
        onRefresh?.()
      } else if (ev.cal === 'gcal') {
        await kaguyaApi.createCalendarEvent({
          title: `${ev.title} (cópia)`,
          day: ev.day,
          start: ev.start ?? undefined,
          end: ev.end ?? undefined,
          allDay: ev.allDay,
        })
        onRefresh?.()
      }
    } catch { /* ignora */ }
    finally { setSaving(false) }
  }

  // Deleta o evento (requer dois cliques para confirmar)
  async function handleDelete() {
    if (!confirmDelete) { setConfirmDelete(true); return }
    setSaving(true)
    try {
      if (ev.cal === 'kaguya' && ev.taskId) {
        await kaguyaApi.remove(ev.taskId)
      } else if (ev.cal === 'gcal') {
        await kaguyaApi.deleteCalendarEvent(ev.id)
      }
      onClose()
      onRefresh?.()
    } catch {
      setConfirmDelete(false)
    } finally {
      setSaving(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Scrim: cobre toda a tela. Clique fecha o menu sem ação. */}
      <div
        className="cal-pop-scrim"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Menu de contexto */}
      <div
        ref={menuRef}
        className="cal-ctx"
        style={{ '--cc': calColor, left, top } as CSSProperties}
        role="menu"
        aria-label={`Menu do evento ${ev.title}`}
      >
        {/* Cabeçalho: nome do calendário + título truncado do evento */}
        <div className="cal-ctx-item" style={{ cursor: 'default', opacity: 0.6, fontSize: 11 }}>
          {calName} · {ev.title.length > 28 ? ev.title.slice(0, 28) + '…' : ev.title}
        </div>

        <div className="cal-ctx-sep" />

        {/* Linha de swatches para recolorir (só gcal suporta cor por evento) */}
        {isEditable && ev.cal === 'gcal' && (
          <>
            <div className="cal-ctx-row">
              {/* Exibe os 8 primeiros swatches (slice do handoff) */}
              {CAL_SWATCHES.slice(0, 8).map((s) => (
                <button
                  key={s}
                  className={`cal-sw${ev.color === s ? ' on' : ''}`}
                  style={{ '--cc': s } as CSSProperties}
                  role="menuitem"
                  onClick={() => applyColor(s)}
                  title={s}
                />
              ))}
            </div>
            {/* Reset de cor: volta para a cor do calendário */}
            <button
              className="cal-ctx-item"
              role="menuitem"
              onClick={() => applyColor(null)}
              style={{ fontSize: 12 }}
            >
              <Icon name="loop" size={13} />
              Cor do calendário
            </button>
            <div className="cal-ctx-sep" />
          </>
        )}

        {/* Duplicar — só para fontes editáveis */}
        {isEditable && (
          <button
            className="cal-ctx-item"
            role="menuitem"
            onClick={handleDuplicate}
            disabled={saving}
          >
            <Icon name="copy" size={13} />
            Duplicar
          </button>
        )}

        {/* Deep-link — só para fontes cross-agent */}
        {!isEditable && ev.deepLink && (
          <button
            className="cal-ctx-item"
            role="menuitem"
            onClick={() => { onClose(); window.location.href = ev.deepLink! }}
          >
            <Icon name="link" size={13} />
            Abrir em {calName}
          </button>
        )}

        {/* Indicador de recorrência (somente leitura) */}
        {ev.kind === 'task' && isEditable && (
          <button className="cal-ctx-item" role="menuitem" onClick={onClose} disabled style={{ opacity: 0.5 }}>
            <Icon name="loop" size={13} />
            Ver série
          </button>
        )}

        {/* Separador antes do delete */}
        {isEditable && <div className="cal-ctx-sep" />}

        {/* Excluir — só para fontes editáveis; vermelho na confirmação */}
        {isEditable && (
          <button
            className={`cal-ctx-item${confirmDelete ? ' danger' : ''}`}
            role="menuitem"
            onClick={handleDelete}
            disabled={saving}
          >
            <Icon name="trash" size={13} />
            {confirmDelete ? 'Clique para confirmar' : 'Excluir'}
          </button>
        )}
      </div>
    </>
  )
}
