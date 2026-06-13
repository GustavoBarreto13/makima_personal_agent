// EventPopover — popover de evento para o Calendar Hub (fatia 019, T025).
// Abre ao clicar num evento editável (kaguya ou gcal); mostra info com título editável.
// Para fontes cross-agent (nami/frieren/violet): variante read-only com deep-link.
// Animação cpop-in (opacity + translateY + scale) definida em kaguya.css.

import { useEffect, useRef, useState } from 'react'
import type { CalEvent, Calendar } from '../types'
import { kaguyaApi, CAL_SWATCHES } from '../kaguyaApi'

// ── Props ────────────────────────────────────────────────────────────────────

interface EventPopoverProps {
  // Evento a exibir
  ev: CalEvent
  // Lista de fontes para mostrar nome/cor do calendário de origem
  cals: Calendar[]
  // Posição do popover em px (posição do clique, ajustada em viewport)
  pos: { x: number; y: number }
  // Fecha o popover
  onClose: () => void
  // Chamado depois de uma edição bem-sucedida para atualizar o grid
  onRefresh?: () => void
}

// Fontes editáveis: kaguya e gcal permitem editar/mover/deletar.
// Fontes cross-agent são read-only (deep-link).
const EDITABLE_SOURCES = new Set(['kaguya', 'gcal'])

// Formata minutos desde meia-noite como "HH:MM".
function minToLabel(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// Converte string ISO datetime em minutos desde meia-noite.
function timeToMin(t: string | null | undefined): number {
  if (!t) return 0
  const part = t.includes('T') ? t.split('T')[1] : t
  const [h, m] = part.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

// Clamp numérico dentro de [min, max].
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

// ── Componente ───────────────────────────────────────────────────────────────

export function EventPopover({ ev, cals, pos, onClose, onRefresh }: EventPopoverProps) {
  // Título editável — inicializado com o título do evento
  const [title, setTitle] = useState(ev.title)
  // Indica se a operação de salvar ou deletar está em curso
  const [saving, setSaving] = useState(false)
  // Mostra a paleta de cores para recolorir o evento individualmente
  const [showColors, setShowColors] = useState(false)
  // Confirmação de exclusão (dois cliques para não deletar acidentalmente)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const popRef = useRef<HTMLDivElement | null>(null)

  const isEditable = EDITABLE_SOURCES.has(ev.cal)
  const cal = cals.find((c) => c.id === ev.cal)
  const calColor = ev.color || cal?.color || 'var(--ink-3)'
  const calName = cal?.name ?? ev.cal

  // ── Fecha ao pressionar Escape ────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  // ── Fecha ao clicar fora ──────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) onClose()
    }
    // Delay para não fechar imediatamente o mesmo clique que abriu
    const t = setTimeout(() => document.addEventListener('mousedown', handler), 100)
    return () => { clearTimeout(t); document.removeEventListener('mousedown', handler) }
  }, [onClose])

  // ── Posição clamped à viewport ────────────────────────────────────────────
  // O popover tem ~280px de largura e ~200px de altura (estimativa)
  const PAD = 12
  const POP_W = 280
  const POP_H = 200
  const left = clamp(pos.x, PAD, window.innerWidth - POP_W - PAD)
  const top = clamp(pos.y, PAD, window.innerHeight - POP_H - PAD)

  // ── Handlers ─────────────────────────────────────────────────────────────

  // Salva o título ao sair do campo de texto (onBlur)
  async function saveTitle() {
    if (title === ev.title || !isEditable) return
    setSaving(true)
    try {
      if (ev.cal === 'kaguya' && ev.taskId) {
        await kaguyaApi.updateTask(ev.taskId, { title })
      } else if (ev.cal === 'gcal') {
        await kaguyaApi.updateCalendarEvent(ev.id, { title })
      }
      onRefresh?.()
    } catch {
      // Em caso de erro, restaura o título original
      setTitle(ev.title)
    } finally {
      setSaving(false)
    }
  }

  // Deleta o evento (após confirmação no segundo clique)
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

  // Aplica uma cor customizada ao evento (sobrepõe a cor do calendário)
  async function applyColor(color: string | null) {
    setShowColors(false)
    if (!isEditable) return
    try {
      if (ev.cal === 'kaguya' && ev.taskId) {
        // Tarefas não têm campo de cor diretamente — guardamos via description ou ignoramos
        // Por ora: salva como metadado (T031 adicionará suporte completo via gcal)
      } else if (ev.cal === 'gcal') {
        await kaguyaApi.updateCalendarEvent(ev.id, { color })
        onRefresh?.()
      }
    } catch { /* ignora erro de cor */ }
  }

  // Formata o intervalo de horário para exibição
  const timeLabel = ev.allDay
    ? 'Dia inteiro'
    : `${minToLabel(timeToMin(ev.start))} – ${minToLabel(timeToMin(ev.end))}`

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      ref={popRef}
      className="cal-popover"
      style={{
        position: 'fixed',
        left,
        top,
        zIndex: 1000,
        animation: 'cpop-in 140ms ease both',
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`Evento: ${ev.title}`}
    >
      {/* Barra de cor do calendário de origem no topo */}
      <div
        style={{
          height: 4,
          background: calColor,
          borderRadius: '8px 8px 0 0',
          margin: '-12px -14px 8px',
        }}
      />

      {/* Título — editável para kaguya/gcal; read-only para cross-agent */}
      {isEditable
        ? (
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            disabled={saving}
            style={{
              fontSize: 15,
              fontWeight: 600,
              border: 'none',
              borderBottom: '1px solid var(--line-1)',
              background: 'transparent',
              width: '100%',
              outline: 'none',
              marginBottom: 8,
              padding: '0 0 4px',
              color: 'var(--ink-1)',
            }}
            aria-label="Título do evento"
          />
        )
        : (
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8, color: 'var(--ink-1)' }}>
            {ev.title}
          </div>
        )
      }

      {/* Horário e dia */}
      <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 4 }}>
        📅 {ev.day} · {timeLabel}
      </div>

      {/* Localização (quando disponível) */}
      {ev.loc && (
        <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 4 }}>
          📍 {ev.loc}
        </div>
      )}

      {/* Calendário de origem */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: calColor, flexShrink: 0, display: 'inline-block' }} />
        <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{calName}</span>
      </div>

      {/* Deep-link para fontes cross-agent */}
      {!isEditable && ev.deepLink && (
        <a
          href={ev.deepLink}
          style={{ fontSize: 13, color: 'var(--accent-1)', display: 'block', marginBottom: 8 }}
        >
          Abrir em {calName} →
        </a>
      )}

      {/* Paleta de cores do evento (gcal) */}
      {showColors && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
          {CAL_SWATCHES.map((s) => (
            <button
              key={s}
              onClick={() => applyColor(s)}
              style={{
                width: 16, height: 16, borderRadius: '50%', background: s,
                border: ev.color === s ? '2px solid var(--ink-1)' : '2px solid transparent',
                cursor: 'pointer', padding: 0,
              }}
              title={s}
            />
          ))}
          <button
            onClick={() => applyColor(null)}
            style={{ fontSize: 10, color: 'var(--ink-3)', background: 'none', border: 'none', cursor: 'pointer' }}
            title="Cor do calendário"
          >
            ⟲
          </button>
        </div>
      )}

      {/* Ações — só para fontes editáveis */}
      {isEditable && (
        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
          {ev.cal === 'gcal' && (
            <button
              onClick={() => setShowColors((v) => !v)}
              style={{ fontSize: 12, background: 'none', border: '1px solid var(--line-1)', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', color: 'var(--ink-3)' }}
            >
              🎨
            </button>
          )}
          <button
            onClick={handleDelete}
            disabled={saving}
            style={{
              fontSize: 12,
              background: confirmDelete ? 'var(--danger, #ef4444)' : 'none',
              color: confirmDelete ? 'white' : 'var(--ink-3)',
              border: '1px solid var(--line-1)',
              borderRadius: 4,
              padding: '3px 8px',
              cursor: 'pointer',
            }}
          >
            {confirmDelete ? 'Confirmar exclusão' : '🗑 Excluir'}
          </button>
          <button
            onClick={onClose}
            style={{ fontSize: 12, background: 'none', border: '1px solid var(--line-1)', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', color: 'var(--ink-3)', marginLeft: 'auto' }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  )
}
