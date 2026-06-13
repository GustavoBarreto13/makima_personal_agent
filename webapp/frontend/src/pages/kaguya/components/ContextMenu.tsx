// ContextMenu — menu de contexto do Calendar Hub (fatia 019, T026).
// Abre com clique-direito num evento. Permite: recolorir o evento, duplicar, excluir.
// Fontes cross-agent não editáveis mostram apenas "Abrir em <fonte>".
// Animação cpop-in definida em kaguya.css.

import { useEffect, useRef, useState } from 'react'
import type { CalEvent, Calendar } from '../types'
import { kaguyaApi, CAL_SWATCHES } from '../kaguyaApi'

// ── Props ────────────────────────────────────────────────────────────────────

interface ContextMenuProps {
  // Evento sobre o qual o menu foi aberto
  ev: CalEvent
  // Fontes para mostrar o nome do calendário de origem
  cals: Calendar[]
  // Posição do clique-direito em px (ajustada em viewport)
  pos: { x: number; y: number }
  // Fecha o menu
  onClose: () => void
  // Chamado depois de uma operação bem-sucedida para atualizar o grid
  onRefresh?: () => void
}

// Fontes editáveis pelo menu de contexto.
const EDITABLE_SOURCES = new Set(['kaguya', 'gcal'])

// Clamp numérico.
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

  // ── Fecha ao pressionar Escape ou clicar fora ─────────────────────────────
  useEffect(() => {
    const keyHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    const clickHandler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('keydown', keyHandler)
    const t = setTimeout(() => document.addEventListener('mousedown', clickHandler), 50)
    return () => {
      document.removeEventListener('keydown', keyHandler)
      clearTimeout(t)
      document.removeEventListener('mousedown', clickHandler)
    }
  }, [onClose])

  // ── Posição clamped à viewport ────────────────────────────────────────────
  const PAD = 8
  const MENU_W = 220
  const MENU_H = 180   // estimativa
  const left = clamp(pos.x, PAD, window.innerWidth - MENU_W - PAD)
  const top = clamp(pos.y, PAD, window.innerHeight - MENU_H - PAD)

  // ── Handlers ─────────────────────────────────────────────────────────────

  // Aplica uma cor customizada ao evento (sobrepõe a cor da fonte).
  async function applyColor(color: string | null) {
    onClose()
    if (!isEditable) return
    try {
      if (ev.cal === 'gcal') {
        await kaguyaApi.updateCalendarEvent(ev.id, { color })
        onRefresh?.()
      }
      // Para kaguya: sem suporte de cor por evento por enquanto
    } catch { /* ignora */ }
  }

  // Duplica o evento (cria cópia com mesmo título + horário).
  async function handleDuplicate() {
    onClose()
    if (!isEditable) return
    setSaving(true)
    try {
      if (ev.cal === 'kaguya' && ev.taskId) {
        // Cria nova tarefa com os mesmos dados (título + datas)
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

  // Deleta o evento (com confirmação no segundo clique).
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

  // ── Estilo de item de menu ────────────────────────────────────────────────

  const itemStyle: React.CSSProperties = {
    padding: '7px 12px',
    fontSize: 13,
    cursor: 'pointer',
    color: 'var(--ink-1)',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: 'none',
    border: 'none',
    width: '100%',
    textAlign: 'left',
    borderRadius: 6,
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      ref={menuRef}
      className="cal-ctx-menu"
      style={{
        position: 'fixed',
        left,
        top,
        zIndex: 1100,
        animation: 'cpop-in 120ms ease both',
      }}
      role="menu"
      aria-label={`Menu do evento ${ev.title}`}
    >
      {/* Cabeçalho: nome do evento (truncado) */}
      <div style={{ padding: '6px 12px 4px', fontSize: 11, color: 'var(--ink-4)', borderBottom: '1px solid var(--line-1)', marginBottom: 4 }}>
        {calName} · {ev.title.length > 28 ? ev.title.slice(0, 28) + '…' : ev.title}
      </div>

      {/* Paleta de cores (só para eventos editáveis — por ora só gcal tem cor por evento) */}
      {isEditable && ev.cal === 'gcal' && (
        <div style={{ padding: '6px 12px', borderBottom: '1px solid var(--line-1)', marginBottom: 4 }}>
          {/* Linha de swatches */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 4 }}>
            {CAL_SWATCHES.map((s) => (
              <button
                key={s}
                role="menuitem"
                onClick={() => applyColor(s)}
                style={{
                  width: 16, height: 16, borderRadius: '50%', background: s,
                  border: ev.color === s ? '2px solid var(--ink-1)' : '2px solid transparent',
                  cursor: 'pointer', padding: 0,
                }}
                title={s}
              />
            ))}
          </div>
          {/* Botão "cor do calendário" (reset) */}
          <button
            role="menuitem"
            onClick={() => applyColor(null)}
            style={{ ...itemStyle, padding: '3px 0', fontSize: 11, color: 'var(--ink-4)' }}
          >
            ⟲ Cor do calendário
          </button>
        </div>
      )}

      {/* Ações: duplicar */}
      {isEditable && (
        <button role="menuitem" onClick={handleDuplicate} disabled={saving} style={itemStyle}>
          📋 Duplicar
        </button>
      )}

      {/* Deep-link para cross-agent */}
      {!isEditable && ev.deepLink && (
        <button
          role="menuitem"
          onClick={() => { onClose(); window.location.href = ev.deepLink! }}
          style={itemStyle}
        >
          🔗 Abrir em {calName}
        </button>
      )}

      {/* Excluir (só editáveis) */}
      {isEditable && (
        <button
          role="menuitem"
          onClick={handleDelete}
          disabled={saving}
          style={{
            ...itemStyle,
            color: confirmDelete ? '#ef4444' : 'var(--ink-1)',
            fontWeight: confirmDelete ? 600 : undefined,
          }}
        >
          🗑 {confirmDelete ? 'Clique para confirmar' : 'Excluir'}
        </button>
      )}
    </div>
  )
}
