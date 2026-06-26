// EventPopover — popover de evento do Calendar Hub (fatia 019, T025).
// Estrutura do handoff (spec 019):
//   .cal-pop-scrim  → overlay transparente; clique = fecha
//   .cal-pop        → container com style {--cc, left, top}
//     .cal-pop-bar  → barra de cor de 3px no topo (usa var(--cc) via CSS)
//     .cal-pop-body → corpo scrollável
//       .cpop-title-row  → .cpop-swatch + input.cpop-title (ou span para read-only)
//       .cal-colors      → paleta inline (se showColors=true; só gcal)
//       .cpop-meta       → linha de metadados (clock + data/hora)
//       .cpop-cal        → calendário de origem (.pc-dot + nome)
//       .cpop-actions    → botões de ação (.cpop-btn / .cpop-btn.danger)
//
// Fontes editáveis (kaguya/gcal): título editável, delete, recolor.
// Fontes cross-agent: read-only com deep-link.

import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { CalEvent, Calendar } from '../types'
import { Icon } from '../ui/Icons'
import { kaguyaApi, CAL_SWATCHES, isGcal, gcalCalendarId } from '../kaguyaApi'
import { DURATIONS, snapDuration } from '../lib/durations'
// localISO: monta ISO 8601 com offset local sem toISOString() (fuso UTC-3).
import { localISO } from '../lib/dateUtils'

// ── Props ────────────────────────────────────────────────────────────────────

interface EventPopoverProps {
  ev: CalEvent
  cals: Calendar[]
  pos: { x: number; y: number }
  onClose: () => void
  onRefresh?: () => void
}

// Formata minutos como "HH:MM".
function minToLabel(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// Converte string ISO datetime em minutos desde meia-noite, no fuso LOCAL.
// Idêntico ao timeToMin do TimeGrid — usa new Date() para respeitar o offset do backend
// (que devolve strings UTC "+00:00"). Split literal ignoraria o offset → +3h de erro.
function timeToMin(t: string | null | undefined): number {
  if (!t) return 0
  // Datetime completo (com "T"): new Date() converte offset → hora local.
  if (t.includes('T')) {
    const d = new Date(t)
    if (!isNaN(d.getTime())) return d.getHours() * 60 + d.getMinutes()
  }
  // Fallback: string pura "HH:MM" — split literal.
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
  const [title, setTitle] = useState(ev.title)
  const [saving, setSaving] = useState(false)
  const [showColors, setShowColors] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Duração inicial: derivada de end - start (em minutos), aproximada para a lista.
  // Só relevante para eventos com horário (start presente).
  // Guardada em const fora do estado para usar no rollback do handleDurationChange.
  const initialDuration = ev.start && ev.end
    ? snapDuration(timeToMin(ev.end) - timeToMin(ev.start))
    : 0
  const [duration, setDuration] = useState<number>(initialDuration)
  // ref para o initialDuration: disponível no closure dos handlers sem re-render.
  const initialDurationRef = useRef(initialDuration)

  const popRef = useRef<HTMLDivElement | null>(null)

  const cal = cals.find((c) => c.id === ev.cal)
  // Editável: tarefas Kaguya sempre; eventos Google apenas se o calendário for owner/writer
  const isEditable = ev.cal === 'kaguya' || (isGcal(ev.cal) && !!cal?.writable)
  // calColor: cor própria do evento > cor do calendário > fallback azul Kaguya
  const calColor = ev.color || cal?.color || 'var(--kg)'
  const calName = cal?.name ?? ev.cal

  // ── Fecha ao pressionar Escape ────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  // ── Posição clamped à viewport ────────────────────────────────────────────
  // .cal-pop tem ~280px de largura e ~220px de altura estimados
  const PAD   = 12
  const POP_W = 280
  const POP_H = 220
  const left = clamp(pos.x, PAD, window.innerWidth - POP_W - PAD)
  const top  = clamp(pos.y, PAD, window.innerHeight - POP_H - PAD)

  // ── Handlers ─────────────────────────────────────────────────────────────

  // Salva o título editado (disparado pelo onBlur do input)
  async function saveTitle() {
    if (title === ev.title || !isEditable) return
    setSaving(true)
    try {
      if (ev.cal === 'kaguya' && ev.taskId) {
        await kaguyaApi.updateTask(ev.taskId, { title })
      } else if (isGcal(ev.cal)) {
        await kaguyaApi.updateCalendarEvent(ev.id, { title, calendar_id: gcalCalendarId(ev.cal) })
      }
      onRefresh?.()
    } catch {
      setTitle(ev.title)  // restaura título em caso de erro
    } finally {
      setSaving(false)
    }
  }

  // Deleta o evento (requer dois cliques para confirmar)
  async function handleDelete() {
    if (!confirmDelete) { setConfirmDelete(true); return }
    setSaving(true)
    try {
      if (ev.cal === 'kaguya' && ev.taskId) {
        await kaguyaApi.remove(ev.taskId)
      } else if (isGcal(ev.cal)) {
        await kaguyaApi.deleteCalendarEvent(ev.id, gcalCalendarId(ev.cal))
      }
      onClose()
      onRefresh?.()
    } catch {
      setConfirmDelete(false)
    } finally {
      setSaving(false)
    }
  }

  // Atualiza a duração do evento/tarefa e persiste via API.
  // Recalcula end_at a partir de start + nova duração; mantém start_at intacto.
  async function handleDurationChange(newDuration: number) {
    setDuration(newDuration)
    if (!ev.start || !isEditable || newDuration <= 0) return
    const startMin = timeToMin(ev.start)
    const newEndMin = startMin + newDuration
    // ev.day: "AAAA-MM-DD" (já local — vem do CalendarScreen.taskToCalEvent)
    const newStart = localISO(ev.day, startMin)
    const newEnd   = localISO(ev.day, newEndMin)
    setSaving(true)
    try {
      if (ev.cal === 'kaguya' && ev.taskId) {
        // Task Kaguya: atualiza o time-block (start_at + end_at).
        await kaguyaApi.setTimeBlock(ev.taskId, { start_at: newStart, end_at: newEnd })
      } else if (isGcal(ev.cal)) {
        // Evento Google Calendar: atualiza start + end no calendário correto.
        await kaguyaApi.updateCalendarEvent(ev.id, {
          start: newStart,
          end: newEnd,
          day: ev.day,
          calendar_id: gcalCalendarId(ev.cal),
        })
      }
      onRefresh?.()
    } catch {
      // Em caso de erro, volta para a duração anterior (não altera o estado de UI).
      setDuration(initialDurationRef.current)
    } finally {
      setSaving(false)
    }
  }

  // Aplica cor customizada ao evento (só gcal suporta cor por evento atualmente)
  async function applyColor(color: string | null) {
    setShowColors(false)
    if (!isEditable) return
    try {
      if (isGcal(ev.cal)) {
        await kaguyaApi.updateCalendarEvent(ev.id, { color, calendar_id: gcalCalendarId(ev.cal) })
        onRefresh?.()
      }
    } catch { /* ignora erro de cor */ }
  }

  // Label de horário: "Dia inteiro" ou "HH:MM – HH:MM"
  const timeLabel = ev.allDay
    ? 'Dia inteiro'
    : `${minToLabel(timeToMin(ev.start))} – ${minToLabel(timeToMin(ev.end))}`

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Scrim: cobre o restante da tela. Clique fora do popover = fecha.
          z-index inferior ao .cal-pop (998 vs 999) para não bloquear o popover. */}
      <div
        className="cal-pop-scrim"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Popover principal */}
      <div
        ref={popRef}
        className="cal-pop"
        style={{ '--cc': calColor, left, top } as CSSProperties}
        role="dialog"
        aria-modal="true"
        aria-label={`Evento: ${ev.title}`}
      >
        {/* Barra de cor de 3px no topo — usa var(--cc) via CSS */}
        <div className="cal-pop-bar" />

        <div className="cal-pop-body">
          {/* Linha de título: swatch colorido + título editável (ou texto para read-only) */}
          <div className="cpop-title-row">
            {/* Swatch: círculo pequeno com a cor do evento/calendário */}
            <span className="cpop-swatch" />

            {isEditable
              ? (
                <input
                  className="cpop-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={saveTitle}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                  disabled={saving}
                  aria-label="Título do evento"
                />
              )
              : (
                <span className="cpop-title">{ev.title}</span>
              )
            }
          </div>

          {/* Paleta de cores inline — só para gcal, aparece ao clicar em "pincel" */}
          {showColors && (
            <div className="cal-colors">
              {CAL_SWATCHES.map((s) => (
                <button
                  key={s}
                  className={`cal-sw${ev.color === s ? ' on' : ''}`}
                  style={{ '--cc': s } as CSSProperties}
                  onClick={() => applyColor(s)}
                  title={s}
                />
              ))}
              {/* Botão de reset: volta para a cor do calendário */}
              <button
                className="cpop-btn"
                onClick={() => applyColor(null)}
                title="Cor do calendário"
                style={{ marginLeft: 4 }}
              >
                <Icon name="loop" size={12} />
              </button>
            </div>
          )}

          {/* Metadados: data e horário */}
          <div className="cpop-meta">
            <Icon name="clock" size={13} />
            <span>{ev.day} · {timeLabel}</span>
          </div>

          {/* Duração — seletor compacto apenas para eventos editáveis com horário.
              Ao mudar, recalcula end_at e persiste via API (sem fechar o popover). */}
          {isEditable && !ev.allDay && ev.start && (
            <div className="cpop-meta" style={{ gap: 6 }}>
              <Icon name="clock" size={13} />
              <select
                className="cpop-dur-select"
                value={duration}
                onChange={(e) => handleDurationChange(Number(e.target.value))}
                disabled={saving}
                title="Duração do evento"
              >
                {DURATIONS.filter(d => d.v > 0).map(d => (
                  <option key={d.v} value={d.v}>{d.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Localização (quando disponível) */}
          {ev.loc && (
            <div className="cpop-meta">
              <span>{ev.loc}</span>
            </div>
          )}

          {/* Calendário de origem */}
          <div className="cpop-cal">
            {/* Ponto colorido identificando o calendário */}
            <span className="pc-dot" />
            <span>{calName}</span>
          </div>

          {/* Deep-link para fontes cross-agent (nami, frieren, violet…) */}
          {!isEditable && ev.deepLink && (
            <a
              href={ev.deepLink}
              className="cpop-btn"
              style={{ display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}
            >
              <Icon name="link" size={13} />
              Abrir em {calName}
            </a>
          )}

          {/* Ações — só para fontes editáveis (kaguya / gcal) */}
          {isEditable && (
            <div className="cpop-actions">
              {/* Botão de recolorir: só gcal suporta cor por evento */}
              {isGcal(ev.cal) && (
                <button
                  className="cpop-btn"
                  onClick={() => setShowColors((v) => !v)}
                  title="Recolorir evento"
                  aria-pressed={showColors}
                >
                  <Icon name="paint" size={13} />
                </button>
              )}

              {/* Botão de excluir: fica vermelho no segundo clique (confirm) */}
              <button
                className={`cpop-btn${confirmDelete ? ' danger' : ''}`}
                onClick={handleDelete}
                disabled={saving}
                title={confirmDelete ? 'Clique para confirmar exclusão' : 'Excluir evento'}
              >
                <Icon name="trash" size={13} />
                {confirmDelete ? 'Confirmar' : 'Excluir'}
              </button>

              {/* Indicador de recorrência (sem ação; apenas visual) */}
              {ev.kind === 'task' && (
                // A recorrência é lida pelo 'recurrence' de CalEvent — mas CalEvent não tem esse campo.
                // Por ora, omitir o ícone de loop (pode ser adicionado futuramente via `ev.recurrence`).
                null
              )}

              {/* Botão de fechar */}
              <button
                className="cpop-btn"
                onClick={onClose}
                title="Fechar"
                style={{ marginLeft: 'auto' }}
              >
                <Icon name="x" size={13} />
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
